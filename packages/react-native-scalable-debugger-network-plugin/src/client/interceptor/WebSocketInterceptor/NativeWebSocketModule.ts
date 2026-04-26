import { TurboModuleRegistry, type TurboModule } from 'react-native';

interface WebSocketModule extends TurboModule {
  connect: (
    url: string,
    protocols: string[] | null,
    options: { headers?: Record<string, string> } | null,
    socketId: number
  ) => void;
  send: (data: string, socketId: number) => void;
  sendBinary: (data: string, socketId: number) => void;
  close: (code?: number, reason?: string, socketId?: number) => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

const NativeWebSocketModule =
  TurboModuleRegistry.getEnforcing<WebSocketModule>('WebSocketModule');

export default NativeWebSocketModule;
