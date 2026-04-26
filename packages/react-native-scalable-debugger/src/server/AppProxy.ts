import { JS_APP_URL } from "../shared/constants";
import type { WebSocketServer, RawData, WebSocket as WebSocketType } from "ws";
import type { IncomingMessage } from "http";
import type { CDPMessage } from "../types/cdp";
import type {
  AppConnection,
  AppMessageListener,
  ConnectedAppTarget,
  ExposedDebugger,
  ConnectionListener,
} from "../types/connection";

// Use require for CommonJS compatibility - named exports don't work correctly with Rollup external bundling
const WS = require("ws") as {
  Server: typeof WebSocketServer;
  OPEN: number;
};

let appCounter = 0;

const idToAppConnection = new Map<string, AppConnection>(); // key: appId, value: app connection

const idToDebuggerConnection = new Map<string, ExposedDebugger>();
const debuggerConnectionToId = new Map<ExposedDebugger, string>();

const listenersMap = new Map<
  string | ExposedDebugger,
  Set<ConnectionListener>
>(); // key: app id or debugger connection, value: Set<listener>
const appMessageListeners = new Set<AppMessageListener>();

const DEBUGGER_HEARTBEAT_INTERVAL_MS = 10000;
const MAX_PONG_LATENCY_MS = 5000;

const createAppProxyMiddleware = (): Record<string, WebSocketServer> => {
  const wss = new WS.Server({
    noServer: true,
    perMessageDeflate: true,
    maxPayload: 0,
  });

  const _startHeartbeat = (socket: WebSocketType, intervalMs: number): void => {
    let terminateTimeout: ReturnType<typeof setTimeout> | null = null;

    const pingTimeout = setTimeout(() => {
      if (socket.readyState !== WS.OPEN) {
        pingTimeout.refresh();
        return;
      }

      socket.send("ping");
      terminateTimeout = setTimeout(() => {
        if (socket.readyState !== WS.OPEN) {
          return;
        }

        socket.terminate();
      }, MAX_PONG_LATENCY_MS);
    }, intervalMs);

    const onPong = (message: RawData): void => {
      if (message.toString() !== "pong") {
        return;
      }

      terminateTimeout && clearTimeout(terminateTimeout);
      pingTimeout.refresh();
    };

    socket.on("message", onPong);

    socket.on("close", () => {
      terminateTimeout && clearTimeout(terminateTimeout);
      clearTimeout(pingTimeout);
    });
  };

  wss.on("connection", async (socket: WebSocketType, req: IncomingMessage) => {
    const fallbackDeviceId = String(appCounter++);
    // WHATWG URL API 사용. req.url은 상대 경로이므로 더미 origin을 붙인다.
    const searchParams = new URL(req.url || "", "http://localhost").searchParams;
    const appId = searchParams.get("id") || fallbackDeviceId;
    const deviceId = searchParams.get("deviceId") || appId;
    const name =
      searchParams.get("name") ||
      searchParams.get("deviceName") ||
      `React Native app ${deviceId}`;

    idToAppConnection.set(appId, {
      appId,
      deviceId,
      name,
      connectedAt: Date.now(),
      sendMessage: (message: CDPMessage | string): void => {
        const stringifiedMessage =
          typeof message === "string" ? message : JSON.stringify(message);
        socket.send(stringifiedMessage);
      },
    });

    // notify app connection registration
    const debuggerConnection = idToDebuggerConnection.get(appId);
    if (debuggerConnection) {
      const listeners = listenersMap.get(debuggerConnection);
      listeners?.forEach((listener) => listener());
    }

    socket.on("message", (message: RawData) => {
      if (message.toString() === "pong") {
        return;
      }

      const parsedMessage = parseSocketMessage(message);
      if (!parsedMessage) {
        return;
      }

      const appConnection = idToAppConnection.get(appId);
      if (appConnection) {
        const target = createConnectedAppTarget(appConnection);
        appMessageListeners.forEach((listener) => {
          try {
            listener(parsedMessage, target);
          } catch {
            // Keep app proxy routing alive even if an optional plugin listener fails.
          }
        });
      }

      const debuggerConn = idToDebuggerConnection.get(appId);
      debuggerConn?.sendMessage(parsedMessage);
    });

    _startHeartbeat(socket, DEBUGGER_HEARTBEAT_INTERVAL_MS);

    socket.on("close", () => {
      const dbgConnection = idToDebuggerConnection.get(appId);
      idToAppConnection.delete(appId);
      idToDebuggerConnection.delete(appId);
      if (dbgConnection) {
        debuggerConnectionToId.delete(dbgConnection);
      }
      listenersMap.delete(appId);
    });
  });

  return {
    [JS_APP_URL]: wss,
  };
};

const getAppConnection = (
  debuggerConnection: ExposedDebugger
): AppConnection | undefined => {
  const appId = debuggerConnectionToId.get(debuggerConnection);
  if (!appId) return undefined;
  return idToAppConnection.get(appId);
};

const getAppConnectionById = (
  appIdOrDeviceId: string
): AppConnection | undefined => {
  const connectionByAppId = idToAppConnection.get(appIdOrDeviceId);
  if (connectionByAppId) {
    return connectionByAppId;
  }

  return Array.from(idToAppConnection.values()).find(
    (connection) => connection.deviceId === appIdOrDeviceId
  );
};

const getAppId = (debuggerConnection: ExposedDebugger): string | undefined => {
  return debuggerConnectionToId.get(debuggerConnection);
};

const listAppConnections = (): ConnectedAppTarget[] => {
  return Array.from(idToAppConnection.values()).map(createConnectedAppTarget);
};

const createConnectedAppTarget = (
  connection: AppConnection
): ConnectedAppTarget => ({
  appId: connection.appId,
  deviceId: connection.deviceId,
  name: connection.name,
  connected: true,
  connectedAt: connection.connectedAt,
  hasDebugger: idToDebuggerConnection.has(connection.appId),
});

const addAppMessageListener = (
  listener: AppMessageListener
): (() => void) => {
  appMessageListeners.add(listener);
  return () => {
    appMessageListeners.delete(listener);
  };
};

const parseSocketMessage = (message: RawData): CDPMessage | null => {
  try {
    return JSON.parse(message.toString()) as CDPMessage;
  } catch {
    return null;
  }
};

const addAppConnectionListener = (
  appIdOrDebuggerConnection: string | ExposedDebugger,
  listener: ConnectionListener
): (() => void) => {
  let listeners = listenersMap.get(appIdOrDebuggerConnection);
  if (!listeners) {
    listeners = new Set();
    listenersMap.set(appIdOrDebuggerConnection, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners!.delete(listener);
    if (listeners!.size === 0) {
      listenersMap.delete(appIdOrDebuggerConnection);
    }
  };
};

const setDebuggerConnection = (
  appId: string,
  debuggerConnection: ExposedDebugger
): void => {
  idToDebuggerConnection.set(appId, debuggerConnection);
  debuggerConnectionToId.set(debuggerConnection, appId);
};

export default {
  createAppProxyMiddleware,
  createJSAppMiddleware: createAppProxyMiddleware,
  getAppId,
  getAppConnection,
  getAppConnectionById,
  listAppConnections,
  addAppMessageListener,
  addAppConnectionListener,
  setDebuggerConnection,
};
