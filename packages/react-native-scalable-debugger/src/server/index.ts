import path from 'path';
import runServer from './runServer';
import type { Command } from '@react-native-community/cli-types';
import type { RunServerOptions } from './runServer';
import type { CLIConfig, ServerArgs } from '../types/metro';

export type CreateStartCommandOptions = RunServerOptions;

export function startCommand(
  _options: CreateStartCommandOptions = {}
): Command {
  return {
    name: 'start',
    func: (
      argv: string[],
      cliConfig: CLIConfig,
      args: ServerArgs
    ): Promise<void> => runServer(argv, cliConfig, args, _options),
    description: 'Start the React Native development server.',
    options: [
      {
        name: '--port <number>',
        parse: Number,
      },
      {
        name: '--host <string>',
        default: '',
      },
      {
        name: '--projectRoot <path>',
        description: 'Path to a custom project root',
        parse: (val: string) => path.resolve(val),
      },
      {
        name: '--watchFolders <list>',
        description:
          'Specify any additional folders to be added to the watch list',
        parse: (val: string) =>
          val.split(',').map((folder) => path.resolve(folder)),
      },
      {
        name: '--assetPlugins <list>',
        description:
          'Specify any additional asset plugins to be used by the packager by full filepath',
        parse: (val: string) => val.split(','),
      },
      {
        name: '--sourceExts <list>',
        description:
          'Specify any additional source extensions to be used by the packager',
        parse: (val: string) => val.split(','),
      },
      {
        name: '--max-workers <number>',
        description:
          'Specifies the maximum number of workers the worker-pool will spawn for transforming files.',
        parse: (workers: string) => Number(workers),
      },
      {
        name: '--transformer <string>',
        description: 'Specify a custom transformer to be used',
      },
      {
        name: '--reset-cache, --resetCache',
        description: 'Removes cached files',
      },
      {
        name: '--custom-log-reporter-path, --customLogReporterPath <string>',
        description:
          'Path to a JavaScript file that exports a log reporter as a replacement for TerminalReporter',
      },
      {
        name: '--https',
        description: 'Enables https connections to the server',
      },
      {
        name: '--key <path>',
        description: 'Path to custom SSL key',
      },
      {
        name: '--cert <path>',
        description: 'Path to custom SSL cert',
      },
      {
        name: '--config <string>',
        description: 'Path to the CLI configuration file',
        parse: (val: string) => path.resolve(val),
      },
      {
        name: '--no-interactive',
        description: 'Disables interactive mode',
      },
      {
        name: '--client-logs',
        description:
          '[Deprecated] Enable plain text JavaScript log streaming for all connected apps.',
        default: false,
      },
    ],
  };
}

export const createStartCommand = startCommand;

export default startCommand();
