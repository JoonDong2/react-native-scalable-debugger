import AppProxy from './AppProxy';
import type { CDPMessage } from '../types/cdp';
import type { ExposedDebugger } from '../types/connection';
import type { DebuggerSocketContext } from '../plugin';

export function createDebuggerSocketContext(): DebuggerSocketContext {
  return {
    getAppId: (debuggerConnection: ExposedDebugger) =>
      AppProxy.getAppId(debuggerConnection),
    getAppConnection: (debuggerConnection: ExposedDebugger) =>
      AppProxy.getAppConnection(debuggerConnection),
    getAppConnectionById: (appIdOrDeviceId: string) =>
      AppProxy.getAppConnectionById(appIdOrDeviceId),
    listAppConnections: () => AppProxy.listAppConnections(),
    sendToApp: (
      debuggerConnection: ExposedDebugger,
      payload: CDPMessage | string
    ): boolean => {
      const appConnection = AppProxy.getAppConnection(debuggerConnection);
      if (!appConnection) {
        return false;
      }

      appConnection.sendMessage(payload);
      return true;
    },
    sendToAppById: (
      appIdOrDeviceId: string,
      payload: CDPMessage | string
    ): boolean => {
      const appConnection = AppProxy.getAppConnectionById(appIdOrDeviceId);
      if (!appConnection) {
        return false;
      }

      appConnection.sendMessage(payload);
      return true;
    },
    onAppConnected: (debuggerConnection, listener) =>
      AppProxy.addAppConnectionListener(debuggerConnection, listener),
    onAppMessage: (listener) => AppProxy.addAppMessageListener(listener),
  };
}
