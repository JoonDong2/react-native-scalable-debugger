import type { PluginEndpointContext } from '@react-native-scalable-devtools/cli/plugin';
import {
  REACT_NAVIGATION_PERFORM_METHOD,
  REACT_NAVIGATION_RESULT_METHOD,
  type ReactNavigationActionName,
  type ReactNavigationCommand,
  type ReactNavigationDevice,
  type ReactNavigationErrorResponse,
  type ReactNavigationPerformParams,
  type ReactNavigationResult,
  type ReactNavigationSuccessResponse,
} from '../shared/protocol';
import { createRequestId } from './createRequestId';

interface AppProxyMessage {
  method?: string;
  params?: unknown;
}

export interface RequestOptions {
  appId?: string;
}

export interface RuntimeNavigationOptions extends RequestOptions {
  action: ReactNavigationActionName;
  navigation?: ReactNavigationCommand;
}

export interface ControllerNavigationSuccess
  extends ReactNavigationSuccessResponse {
  statusCode: number;
}

export interface ControllerNavigationError extends ReactNavigationErrorResponse {
  statusCode: number;
}

export type ControllerNavigationResult =
  | ControllerNavigationSuccess
  | ControllerNavigationError;

interface PendingNavigationRequest {
  device: ReactNavigationDevice;
  resolve: (result: ControllerNavigationResult) => void;
}

export class ReactNavigationController {
  #context: PluginEndpointContext | null = null;
  #detachAppMessageListener: (() => void) | null = null;
  #pendingActions = new Map<string, PendingNavigationRequest>();

  attach(context: PluginEndpointContext): void {
    if (this.#context === context) {
      return;
    }

    this.#detachAppMessageListener?.();
    this.#context = context;
    this.#detachAppMessageListener = context.socketContext.onAppMessage(
      (payload, target) => {
        this.handleAppMessage(payload, toReactNavigationDevice(target));
      }
    );
  }

  listDevices(context?: PluginEndpointContext): ReactNavigationDevice[] {
    const activeContext = this.#getContext(context);
    if (!activeContext) {
      return [];
    }

    return activeContext.socketContext
      .listAppConnections()
      .map(toReactNavigationDevice);
  }

  requestRuntimeAction(
    context: PluginEndpointContext,
    options: RuntimeNavigationOptions
  ): Promise<ControllerNavigationResult> {
    this.attach(context);

    const selection = this.#selectApp(options.appId);
    if (!selection.ok) {
      return Promise.resolve(selection);
    }

    const requestId = createRequestId();
    const requestedAt = Date.now();
    const params: ReactNavigationPerformParams = {
      requestId,
      requestedAt,
      action: options.action,
      navigation: options.navigation,
    };

    return new Promise<ControllerNavigationResult>((resolve) => {
      this.#pendingActions.set(requestId, {
        device: selection.device,
        resolve,
      });

      const sent = context.socketContext.sendToAppById(selection.device.appId, {
        method: REACT_NAVIGATION_PERFORM_METHOD,
        params,
      });

      if (!sent) {
        this.#pendingActions.delete(requestId);
        resolve({
          ok: false,
          statusCode: 503,
          error: 'device_unavailable',
          message: `No active app connection found for appId "${selection.device.appId}".`,
          devices: this.listDevices(context),
        });
      }
    });
  }

  handleAppMessage(
    payload: AppProxyMessage,
    target: ReactNavigationDevice
  ): void {
    if (payload.method === REACT_NAVIGATION_RESULT_METHOD) {
      this.#handleActionResult(payload.params, target);
    }
  }

  #handleActionResult(params: unknown, target: ReactNavigationDevice): void {
    const result = parseActionResult(params);
    if (!result) {
      return;
    }

    const pending = this.#pendingActions.get(result.requestId);
    if (!pending || !isSameDevice(pending.device, target)) {
      return;
    }

    this.#pendingActions.delete(result.requestId);
    pending.resolve({
      ok: true,
      statusCode: result.status === 'ok' ? 200 : 422,
      device: target,
      result,
    });
  }

  #selectApp(
    requestedAppId?: string
  ): { ok: true; device: ReactNavigationDevice } | ControllerNavigationError {
    const devices = this.listDevices();

    if (devices.length === 0) {
      return {
        ok: false,
        statusCode: 503,
        error: 'no_devices',
        message: 'No connected React Native app devices are available.',
        devices,
      };
    }

    if (requestedAppId) {
      const device = devices.find(
        (candidate) => candidate.appId === requestedAppId
      );
      if (!device) {
        return {
          ok: false,
          statusCode: 404,
          error: 'device_not_found',
          message: `No connected React Native app matches appId "${requestedAppId}".`,
          devices,
        };
      }
      return { ok: true, device };
    }

    if (devices.length > 1) {
      return {
        ok: false,
        statusCode: 409,
        error: 'app_required',
        message:
          'Multiple React Native apps are connected. Pass appId to select one.',
        devices,
      };
    }

    return { ok: true, device: devices[0] };
  }

  #getContext(context?: PluginEndpointContext): PluginEndpointContext | null {
    if (context) {
      this.attach(context);
      return context;
    }
    return this.#context;
  }
}

function toReactNavigationDevice(target: {
  appId: string;
  name: string;
  connected: boolean;
  connectedAt: number;
  hasDebugger: boolean;
}): ReactNavigationDevice {
  return {
    appId: target.appId,
    name: target.name,
    connected: target.connected,
    connectedAt: target.connectedAt,
    hasDebugger: target.hasDebugger,
  };
}

function parseActionResult(value: unknown): ReactNavigationResult | null {
  const parsed = typeof value === 'string' ? parseJson(value) : value;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const result = parsed as Partial<ReactNavigationResult>;
  if (
    typeof result.requestId !== 'string' ||
    typeof result.requestedAt !== 'number' ||
    typeof result.completedAt !== 'number' ||
    typeof result.action !== 'string' ||
    !isActionStatus(result.status)
  ) {
    return null;
  }

  return result as ReactNavigationResult;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isActionStatus(value: unknown): boolean {
  return value === 'ok' || value === 'unsupported' || value === 'error';
}

function isSameDevice(a: { appId: string }, b: { appId: string }): boolean {
  return a.appId === b.appId;
}
