import { join, JsonObject, normalize, Path } from '@angular-devkit/core';
import {
  apply,
  chain,
  externalSchematic,
  filter,
  mergeWith,
  move,
  noop,
  Rule,
  SchematicContext,
  template,
  Tree,
  url
} from '@angular-devkit/schematics';
import {
  addGlobal,
  addLintFiles,
  formatFiles,
  generateProjectLint,
  insert,
  names,
  NxJson,
  offsetFromRoot,
  toFileName,
  updateJsonInTree,
  updateWorkspace
} from '@nrwl/workspace';
import {
  addDepsToPackageJson,
  updateWorkspaceInTree
} from '@nrwl/workspace/src/utils/ast-utils';
import ngAdd from '../ng-add/ng-add';
import * as ts from 'typescript';

import { Schema } from './schema';
import { CSS_IN_JS_DEPENDENCIES } from '../../utils/styled';
import { addInitialRoutes } from '../../utils/ast-utils';
import {
  babelCoreVersion,
  babelLoaderVersion,
  babelPluginDecoratorsVersion,
  babelPluginMacrosVersion,
  babelPresetEnvVersion,
  babelPresetReactVersion,
  babelPresetTypeScriptVersion,
  coreJsVersion,
  reactRouterVersion,
  regeneratorVersion
} from '../../utils/versions';
import { assertValidStyle } from '../../utils/assertion';
import { extraEslintDependencies, reactEslintJson } from '../../utils/lint';

interface NormalizedSchema extends Schema {
  projectName: string;
  appProjectRoot: Path;
  e2eProjectName: string;
  e2eProjectRoot: Path;
  parsedTags: string[];
  fileName: string;
  styledModule: null | string;
}

export default function(schema: Schema): Rule {
  return (host: Tree, context: SchematicContext) => {
    const options = normalizeOptions(host, schema);

    return chain([
      ngAdd({
        skipFormat: true
      }),
      addLintFiles(options.appProjectRoot, options.linter, {
        localConfig: reactEslintJson,
        extraPackageDeps: extraEslintDependencies
      }),
      createApplicationFiles(options),
      updateNxJson(options),
      addProject(options),
      addCypress(options),
      addJest(options),
      addStyledModuleDependencies(options),
      addRouting(options, context),
      addBabel(options),
      setDefaults(options),
      formatFiles(options)
    ]);
  };
}

function createApplicationFiles(options: NormalizedSchema): Rule {
  return mergeWith(
    apply(url(`./files/app`), [
      template({
        ...names(options.name),
        ...options,
        tmpl: '',
        offsetFromRoot: offsetFromRoot(options.appProjectRoot)
      }),
      options.styledModule
        ? filter(file => !file.endsWith(`.${options.style}`))
        : noop(),
      options.unitTestRunner === 'none'
        ? filter(file => file !== `/src/app/${options.fileName}.spec.tsx`)
        : noop(),
      move(options.appProjectRoot)
    ])
  );
}

function updateNxJson(options: NormalizedSchema): Rule {
  return updateJsonInTree<NxJson>('nx.json', json => {
    json.projects[options.projectName] = { tags: options.parsedTags };
    return json;
  });
}

function addProject(options: NormalizedSchema): Rule {
  return updateWorkspaceInTree(json => {
    const architect: { [key: string]: any } = {};

    architect.build = {
      builder: '@nrwl/web:build',
      options: {
        differentialLoading: !options.babel, // Using babel-loader will not work with differential loading for now
        outputPath: join(normalize('dist'), options.appProjectRoot),
        index: join(options.appProjectRoot, 'src/index.html'),
        main: join(options.appProjectRoot, `src/main.tsx`),
        polyfills: join(options.appProjectRoot, 'src/polyfills.ts'),
        tsConfig: join(options.appProjectRoot, 'tsconfig.app.json'),
        assets: [
          join(options.appProjectRoot, 'src/favicon.ico'),
          join(options.appProjectRoot, 'src/assets')
        ],
        styles: options.styledModule
          ? []
          : [join(options.appProjectRoot, `src/styles.${options.style}`)],
        scripts: [],
        webpackConfig: options.babel ? '@nrwl/react/plugins/babel' : undefined
      },
      configurations: {
        production: {
          fileReplacements: [
            {
              replace: join(
                options.appProjectRoot,
                `src/environments/environment.ts`
              ),
              with: join(
                options.appProjectRoot,
                `src/environments/environment.prod.ts`
              )
            }
          ],
          optimization: true,
          outputHashing: 'all',
          sourceMap: false,
          extractCss: true,
          namedChunks: false,
          extractLicenses: true,
          vendorChunk: false,
          budgets: [
            {
              type: 'initial',
              maximumWarning: '2mb',
              maximumError: '5mb'
            }
          ]
        }
      }
    };

    architect.serve = {
      builder: '@nrwl/web:dev-server',
      options: {
        buildTarget: `${options.projectName}:build`
      },
      configurations: {
        production: {
          buildTarget: `${options.projectName}:build:production`
        }
      }
    };

    architect.lint = generateProjectLint(
      normalize(options.appProjectRoot),
      join(normalize(options.appProjectRoot), 'tsconfig.app.json'),
      options.linter
    );

    json.projects[options.projectName] = {
      root: options.appProjectRoot,
      sourceRoot: join(options.appProjectRoot, 'src'),
      projectType: 'application',
      schematics: {},
      architect
    };

    json.defaultProject = json.defaultProject || options.projectName;

    return json;
  });
}

function addCypress(options: NormalizedSchema): Rule {
  return options.e2eTestRunner === 'cypress'
    ? externalSchematic('@nrwl/cypress', 'cypress-project', {
        ...options,
        name: options.name + '-e2e',
        directory: options.directory,
        project: options.projectName
      })
    : noop();
}

function addJest(options: NormalizedSchema): Rule {
  return options.unitTestRunner === 'jest'
    ? externalSchematic('@nrwl/jest', 'jest-project', {
        project: options.projectName,
        supportTsx: true,
        skipSerializers: true,
        setupFile: 'none'
      })
    : noop();
}

function addStyledModuleDependencies(options: NormalizedSchema): Rule {
  const extraDependencies = CSS_IN_JS_DEPENDENCIES[options.styledModule];

  return extraDependencies
    ? addDepsToPackageJson(
        extraDependencies.dependencies,
        extraDependencies.devDependencies
      )
    : noop();
}

function addRouting(
  options: NormalizedSchema,
  context: SchematicContext
): Rule {
  return options.routing
    ? chain([
        function addRouterToComponent(host: Tree) {
          const appPath = join(
            options.appProjectRoot,
            `src/app/${options.fileName}.tsx`
          );
          const appFileContent = host.read(appPath).toString('utf-8');
          const appSource = ts.createSourceFile(
            appPath,
            appFileContent,
            ts.ScriptTarget.Latest,
            true
          );

          insert(host, appPath, addInitialRoutes(appPath, appSource, context));
        },
        addDepsToPackageJson({ 'react-router-dom': reactRouterVersion }, {})
      ])
    : noop();
}

function addBabel(options: NormalizedSchema): Rule {
  return options.babel
    ? chain([
        addDepsToPackageJson(
          {},
          {
            '@babel/core': babelCoreVersion,
            '@babel/preset-env': babelPresetEnvVersion,
            '@babel/preset-react': babelPresetReactVersion,
            '@babel/preset-typescript': babelPresetTypeScriptVersion,
            '@babel/plugin-proposal-decorators': babelPluginDecoratorsVersion,
            'babel-loader': babelLoaderVersion,
            'babel-plugin-macros': babelPluginMacrosVersion,
            'core-js': coreJsVersion,
            'regenerator-runtime': regeneratorVersion
          }
        ),
        addPolyfillForBabel(options)
      ])
    : noop();
}

function addPolyfillForBabel(options: NormalizedSchema): Rule {
  return (host: Tree) => {
    const polyfillsPath = join(options.appProjectRoot, `src/polyfills.ts`);
    const polyfillsSource = host.read(polyfillsPath)!.toString('utf-8');
    const polyfillsSourceFile = ts.createSourceFile(
      polyfillsPath,
      polyfillsSource,
      ts.ScriptTarget.Latest,
      true
    );

    insert(host, polyfillsPath, [
      ...addGlobal(
        polyfillsSourceFile,
        polyfillsPath,
        `
/*
 * Polyfill stable language features.
 * It's recommended to use @babel/preset-env and browserslist
 * to only include the polyfills necessary for the target browsers.
 */
import 'core-js/stable';

import 'regenerator-runtime/runtime';
`
      )
    ]);
  };
}

function setDefaults(options: NormalizedSchema): Rule {
  return options.skipWorkspaceJson
    ? noop()
    : updateWorkspace(workspace => {
        workspace.extensions.schematics = jsonIdentity(
          workspace.extensions.schematics || {}
        );
        workspace.extensions.schematics['@nrwl/react'] =
          workspace.extensions.schematics['@nrwl/react'] || {};
        const prev = jsonIdentity(
          workspace.extensions.schematics['@nrwl/react']
        );

        workspace.extensions.schematics = {
          ...workspace.extensions.schematics,
          '@nrwl/react': {
            ...prev,
            application: {
              babel: options.babel,
              style: options.style,
              linter: options.linter,
              ...jsonIdentity(prev.application)
            },
            component: {
              style: options.style,
              ...jsonIdentity(prev.component)
            },
            library: {
              style: options.style,
              linter: options.linter,
              ...jsonIdentity(prev.library)
            }
          }
        };
      });
}

function jsonIdentity(x: any): JsonObject {
  return x as JsonObject;
}

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const appDirectory = options.directory
    ? `${toFileName(options.directory)}/${toFileName(options.name)}`
    : toFileName(options.name);

  const appProjectName = appDirectory.replace(new RegExp('/', 'g'), '-');
  const e2eProjectName = `${appProjectName}-e2e`;

  const appProjectRoot = normalize(`apps/${appDirectory}`);
  const e2eProjectRoot = normalize(`apps/${appDirectory}-e2e`);

  const parsedTags = options.tags
    ? options.tags.split(',').map(s => s.trim())
    : [];

  const fileName = options.pascalCaseFiles ? 'App' : 'app';

  const styledModule = /^(css|scss|less|styl)$/.test(options.style)
    ? null
    : options.style;

  assertValidStyle(options.style);

  return {
    ...options,
    name: toFileName(options.name),
    projectName: appProjectName,
    appProjectRoot,
    e2eProjectRoot,
    e2eProjectName,
    parsedTags,
    fileName,
    styledModule
  };
}
