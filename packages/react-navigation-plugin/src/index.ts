import type { ScalableDebuggerPlugin } from '@react-native-scalable-devtools/cli/plugin';
import type {
  DebuggerFrontendPatch,
  RunServerOptions,
} from '@react-native-scalable-devtools/cli';
import { ReactNavigationController } from './server/ReactNavigationController';
import { createReactNavigationDomain } from './server/ReactNavigationDomain';
import { createReactNavigationMiddlewareEndpoints } from './server/createReactNavigationMiddleware';
import { preparePatchedFrontend } from './server/patchDebuggerFrontend';

const controller = new ReactNavigationController();

export const patchDebuggerFrontend: DebuggerFrontendPatch = ({ sourceDist }) =>
  preparePatchedFrontend(sourceDist);

const reactNavigationPluginDefinition: ScalableDebuggerPlugin = {
  name: 'react-navigation',
  domains: [createReactNavigationDomain],
  clientEntries: [
    {
      importPath: '@react-native-scalable-devtools/react-navigation-plugin/client',
    },
  ],
  middlewareEndpoints: createReactNavigationMiddlewareEndpoints(controller),
  debuggerFrontendPatch: patchDebuggerFrontend,
};

export function reactNavigationPlugin(): RunServerOptions {
  return {
    plugins: [reactNavigationPluginDefinition],
  };
}

export function createReactNavigationPlugin(): ScalableDebuggerPlugin {
  return reactNavigationPluginDefinition;
}

export * from './types';
export {
  REACT_NAVIGATION_BACK_ENDPOINT,
  REACT_NAVIGATION_CDP_DOMAIN,
  REACT_NAVIGATION_CDP_DISABLE_METHOD,
  REACT_NAVIGATION_CDP_ENABLE_METHOD,
  REACT_NAVIGATION_CDP_GET_STATE_METHOD,
  REACT_NAVIGATION_CDP_STATE_UPDATED_METHOD,
  REACT_NAVIGATION_ENDPOINT,
  REACT_NAVIGATION_NAVIGATE_ENDPOINT,
  REACT_NAVIGATION_STATE_ENDPOINT,
} from './shared/protocol';
export default reactNavigationPlugin;
