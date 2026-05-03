import type { ScalableDebuggerPlugin } from '@react-native-scalable-devtools/cli/plugin';
import type { RunServerOptions } from '@react-native-scalable-devtools/cli';
import { ReactNavigationController } from './server/ReactNavigationController';
import { createReactNavigationMiddlewareEndpoints } from './server/createReactNavigationMiddleware';

export interface ReactNavigationPluginOptions {}

const controller = new ReactNavigationController();

const reactNavigationPluginDefinition: ScalableDebuggerPlugin = {
  name: 'react-navigation',
  clientEntries: [
    {
      importPath:
        '@react-native-scalable-devtools/react-navigation-plugin/client',
    },
  ],
  middlewareEndpoints: createReactNavigationMiddlewareEndpoints(controller),
};

export function reactNavigationPlugin(
  _options: ReactNavigationPluginOptions = {}
): RunServerOptions {
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
  REACT_NAVIGATION_ENDPOINT,
  REACT_NAVIGATION_NAVIGATE_ENDPOINT,
  REACT_NAVIGATION_STATE_ENDPOINT,
} from './shared/protocol';
export default reactNavigationPlugin;
