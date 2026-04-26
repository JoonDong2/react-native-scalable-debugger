import type { ScalableDebuggerPlugin } from 'react-native-scalable-debugger/plugin';
import { createNetworkDomain } from './server/NetworkDomain';
import {
  preparePatchedFrontend,
  resolveConsumerFrontendDist,
} from './server/patchDebuggerFrontend';

export const networkPanelPlugin: ScalableDebuggerPlugin = {
  name: 'network-panel',
  domains: [createNetworkDomain],
  clientEntries: [
    {
      importPath: 'react-native-scalable-debugger-network-plugin/client',
    },
  ],
  debuggerFrontend: {
    resolvePath: () => {
      const consumer = resolveConsumerFrontendDist();
      return consumer ? preparePatchedFrontend(consumer.dist) : null;
    },
  },
};

export function createNetworkPanelPlugin(): ScalableDebuggerPlugin {
  return networkPanelPlugin;
}

export default networkPanelPlugin;
