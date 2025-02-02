import * as fs from 'fs-extra';
import * as path from 'path';
import { dedent } from 'tslint/lib/utils';

import { generateFile, sortAlphabeticallyFunction } from './utils';
import { commandsObject } from '../../packages/workspace';

const importFresh = require('import-fresh');

const examples = {
  affected: [
    {
      command: 'affected --target=custom-target',
      description: 'Run custom target for all affected projects'
    },
    {
      command: 'affected --target=test --parallel --maxParallel=5',
      description: 'Run tests in parallel'
    },
    {
      command: 'affected --target=test --only-failed',
      description:
        'Rerun the test target only for the projects that failed last time'
    },
    {
      command: 'affected --target=test --all',
      description: 'Run the test target for all projects'
    },
    {
      command: 'affected --target=test --files=libs/mylib/src/index.ts',
      description:
        'Run tests for all the projects affected by changing the index.ts file'
    },
    {
      command: 'affected --target=test --base=master --head=HEAD',
      description:
        'Run tests for all the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected --target=test --base=master~1 --head=master',
      description:
        'Run tests for all the projects affected by the last commit on master'
    }
  ],
  'affected:test': [
    {
      command: 'affected:test --parallel --maxParallel=5',
      description: 'Run tests in parallel'
    },
    {
      command: 'affected:test --only-failed',
      description:
        'Rerun the test target only for the projects that failed last time'
    },
    {
      command: 'affected:test --all',
      description: 'Run the test target for all projects'
    },
    {
      command: 'affected:test --files=libs/mylib/src/index.ts',
      description:
        'Run tests for all the projects affected by changing the index.ts file'
    },
    {
      command: 'affected:test --base=master --head=HEAD',
      description:
        'Run tests for all the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:test --base=master~1 --head=master',
      description:
        'Run tests for all the projects affected by the last commit on master'
    }
  ],
  'affected:build': [
    {
      command: 'affected:build --parallel --maxParallel=5',
      description: 'Run build in parallel'
    },
    {
      command: 'affected:build --only-failed',
      description:
        'Rerun the build target only for the projects that failed last time'
    },
    {
      command: 'affected:build --all',
      description: 'Run the build target for all projects'
    },
    {
      command: 'affected:build --files=libs/mylib/src/index.ts',
      description:
        'Run build for all the projects affected by changing the index.ts file'
    },
    {
      command: 'affected:build --base=master --head=HEAD',
      description:
        'Run build for all the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:build --base=master~1 --head=master',
      description:
        'Run build for all the projects affected by the last commit on master'
    }
  ],
  'affected:e2e': [
    {
      command: 'affected:e2e --parallel --maxParallel=5',
      description: 'Run tests in parallel'
    },
    {
      command: 'affected:e2e --only-failed',
      description:
        'Rerun the test target only for the projects that failed last time'
    },
    {
      command: 'affected:e2e --all',
      description: 'Run the test target for all projects'
    },
    {
      command: 'affected:e2e --files=libs/mylib/src/index.ts',
      description:
        'Run tests for all the projects affected by changing the index.ts file'
    },
    {
      command: 'affected:e2e --base=master --head=HEAD',
      description:
        'Run tests for all the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:e2e --base=master~1 --head=master',
      description:
        'Run tests for all the projects affected by the last commit on master'
    }
  ],
  'affected:lint': [
    {
      command: 'affected:lint --parallel --maxParallel=5',
      description: 'Run lint in parallel'
    },
    {
      command: 'affected:lint --only-failed',
      description:
        'Rerun the lint target only for the projects that failed last time'
    },
    {
      command: 'affected:lint --all',
      description: 'Run the lint target for all projects'
    },
    {
      command: 'affected:lint --files=libs/mylib/src/index.ts',
      description:
        'Run lint for all the projects affected by changing the index.ts file'
    },
    {
      command: 'affected:lint --base=master --head=HEAD',
      description:
        'Run lint for all the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:lint --base=master~1 --head=master',
      description:
        'Run lint for all the projects affected by the last commit on master'
    }
  ],
  'affected:apps': [
    {
      command: 'affected:apps --files=libs/mylib/src/index.ts',
      description:
        'Print the names of all the apps affected by changing the index.ts file'
    },
    {
      command: 'affected:apps --base=master --head=HEAD',
      description:
        'Print the names of all the apps affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:apps --base=master~1 --head=master',
      description:
        'Print the names of all the apps affected by the last commit on master'
    }
  ],
  'affected:libs': [
    {
      command: 'affected:libs --files=libs/mylib/src/index.ts',
      description:
        'Print the names of all the libs affected by changing the index.ts file'
    },
    {
      command: 'affected:libs --base=master --head=HEAD',
      description:
        'Print the names of all the libs affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:libs --base=master~1 --head=master',
      description:
        'Print the names of all the libs affected by the last commit on master'
    }
  ],
  'format:write': [],
  'format:check': [],
  'dep-graph': [
    {
      command: 'dep-graph',
      description: 'Open the dep graph of the workspace in the browser'
    },
    {
      command: 'dep-graph --file=output.json',
      description: 'Save the dep graph into a json file'
    },
    {
      command: 'dep-graph --file=output.html',
      description: 'Save the dep graph into a html file'
    }
  ],
  'affected:dep-graph': [
    {
      command: 'affected:dep-graph --files=libs/mylib/src/index.ts',
      description:
        'Open the dep graph of the workspace in the browser, and highlight the projects affected by changing the index.ts file'
    },
    {
      command: 'affected:dep-graph --base=master --head=HEAD',
      description:
        'Open the dep graph of the workspace in the browser, and highlight the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command:
        'affected:dep-graph --base=master --head=HEAD --file=output.json',
      description:
        'Save the dep graph of the workspace in a json file, and highlight the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command:
        'affected:dep-graph --base=master --head=HEAD --file=output.html',
      description:
        'Save the dep graph of the workspace in a html file, and highlight the projects affected by the changes between master and HEAD (e.g., PR)'
    },
    {
      command: 'affected:dep-graph --base=master~1 --head=master',
      description:
        'Open the dep graph of the workspace in the browser, and highlight the projects affected by the last commit on master'
    }
  ],
  'workspace-schematic': []
};

['web', 'angular', 'react'].forEach(framework => {
  const commandsOutputDirectory = path.join(
    __dirname,
    '../../docs/',
    framework,
    'api-workspace/npmscripts'
  );
  fs.removeSync(commandsOutputDirectory);
  function getCommands(command) {
    return command.getCommandInstance().getCommandHandlers();
  }
  function parseCommandInstance(name, command) {
    const builder = command.builder(importFresh('yargs')().resetOptions());
    const builderDescriptions = builder.getUsageInstance().getDescriptions();
    const builderDefaultOptions = builder.getOptions().default;
    return {
      command: command['original'],
      description: command['description'],
      options:
        Object.keys(builderDescriptions).map(name => ({
          command: '--'.concat(name),
          description: builderDescriptions[name]
            ? builderDescriptions[name].replace('__yargsString__:', '')
            : '',
          default: builderDefaultOptions[name]
        })) || null
    };
  }
  function generateMarkdown(command) {
    let template = dedent`
      # ${command.command}
      ${command.description}
      
      ## Usage
      \`\`\`bash 
      nx ${command.command}
      \`\`\`

      Install \`@nrwl/cli\` globally to invoke the command directly using \`nx\`, or use \`npm run nx\` or \`yarn nx\`.  
     `;

    if (examples[command.command] && examples[command.command].length > 0) {
      template += `### Examples`;
      examples[command.command].forEach(example => {
        template += dedent`
        ${example.description}:
        \`\`\`bash
        nx ${example.command}
        \`\`\`
        `;
      });
    }

    if (Array.isArray(command.options) && !!command.options.length) {
      template += '\n## Options';

      command.options
        .sort((a, b) =>
          sortAlphabeticallyFunction(
            a.command.replace('--', ''),
            b.command.replace('--', '')
          )
        )
        .forEach(
          option =>
            (template += dedent`
            ### ${option.command.replace('--', '')}
            ${
              option.default === undefined || option.default === ''
                ? ''
                : `Default: \`${option.default}\`\n`
            }
            ${option.description}
          `)
        );
    }

    return {
      name: command.command
        .replace(':', '-')
        .replace(' ', '-')
        .replace(/[\]\[.]+/gm, ''),
      template
    };
  }

  // TODO: Try to add option's type, examples, and group?
  // TODO: split one command per page / Create an index
  const npmscripts = getCommands(commandsObject);

  Object.keys(npmscripts)
    .filter(name => !name.startsWith('run') && !name.startsWith('generate'))
    .map(name => parseCommandInstance(name, npmscripts[name]))
    .map(command => generateMarkdown(command))
    .forEach(templateObject =>
      generateFile(commandsOutputDirectory, templateObject)
    );
});
