export const REACT_NAVIGATION_ENDPOINT = '/react-navigation';
export const REACT_NAVIGATION_STATE_ENDPOINT = '/react-navigation/state';
export const REACT_NAVIGATION_NAVIGATE_ENDPOINT = '/react-navigation/navigate';
export const REACT_NAVIGATION_BACK_ENDPOINT = '/react-navigation/back';

export const REACT_NAVIGATION_PERFORM_METHOD = 'ReactNavigation.perform';
export const REACT_NAVIGATION_RESULT_METHOD = 'ReactNavigation.result';

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export type ReactNavigationActionName =
  | 'getNavigationState'
  | 'navigate'
  | 'goBack';

export type ReactNavigationStatus = 'ok' | 'unsupported' | 'error';

export interface ReactNavigationCommand extends Record<string, unknown> {
  name?: string;
  params?: JSONValue;
  key?: string;
  path?: string;
  merge?: boolean;
}

export interface ReactNavigationPerformParams extends Record<string, unknown> {
  requestId: string;
  requestedAt: number;
  action: ReactNavigationActionName;
  navigation?: ReactNavigationCommand;
}

export interface ReactNavigationResult extends Record<string, unknown> {
  requestId: string;
  requestedAt: number;
  completedAt: number;
  action: ReactNavigationActionName;
  status: ReactNavigationStatus;
  reason?: string;
  value?: JSONValue;
}

export interface ReactNavigationSuccessResponse {
  ok: true;
  device: ReactNavigationDevice;
  result: ReactNavigationResult;
}

export interface ReactNavigationErrorResponse {
  ok: false;
  error: string;
  message: string;
  devices?: ReactNavigationDevice[];
}

export interface ReactNavigationDevice {
  appId: string;
  name: string;
  connected: boolean;
  connectedAt: number;
  hasDebugger: boolean;
}

export type ReactNavigationResponse =
  | ReactNavigationSuccessResponse
  | ReactNavigationErrorResponse;
