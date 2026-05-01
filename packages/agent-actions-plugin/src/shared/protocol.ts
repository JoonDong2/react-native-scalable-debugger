export const AGENT_ACTIONS_ENDPOINT = '/agent-actions';
export const AGENT_ACTIONS_RESOLVE_VIEW_ENDPOINT = '/agent-actions/resolve-view';
export const AGENT_ACTIONS_NAVIGATION_STATE_ENDPOINT =
  '/agent-actions/navigation/state';
export const AGENT_ACTIONS_NAVIGATE_ENDPOINT =
  '/agent-actions/navigation/navigate';
export const AGENT_ACTIONS_BACK_ENDPOINT = '/agent-actions/navigation/back';
export const AGENT_ACTIONS_PRESS_ENDPOINT = '/agent-actions/press';
export const AGENT_ACTIONS_SCROLL_ENDPOINT = '/agent-actions/scroll';

export const AGENT_ACTIONS_PERFORM_METHOD = 'AgentActions.perform';
export const AGENT_ACTIONS_RESULT_METHOD = 'AgentActions.result';

export const ELEMENT_INSPECTOR_GET_TREE_METHOD = 'ElementInspector.getTree';
export const ELEMENT_INSPECTOR_SNAPSHOT_METHOD = 'ElementInspector.snapshot';

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export type AgentActionName =
  | 'getNavigationState'
  | 'navigate'
  | 'goBack'
  | 'press'
  | 'scroll';

export type AgentActionStatus = 'ok' | 'unsupported' | 'error';

export interface AgentActionTarget extends Record<string, unknown> {
  id?: string;
  testID?: string;
  nativeID?: string;
  accessibilityLabel?: string;
  text?: string;
  type?: string;
  displayName?: string;
  query?: string;
  exact?: boolean;
  index?: number;
}

export interface AgentNavigationCommand extends Record<string, unknown> {
  name?: string;
  params?: JSONValue;
  key?: string;
  path?: string;
  merge?: boolean;
}

export interface AgentScrollCommand extends Record<string, unknown> {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  x?: number;
  y?: number;
  offset?: number;
  animated?: boolean;
  to?: 'start' | 'top' | 'end' | 'bottom';
}

export interface AgentActionNodeSummary {
  id: string;
  type: string;
  displayName: string;
  text?: string;
  props?: Record<string, JSONValue>;
}

export interface AgentActionPerformParams extends Record<string, unknown> {
  requestId: string;
  requestedAt: number;
  action: AgentActionName;
  target?: AgentActionTarget;
  navigation?: AgentNavigationCommand;
  scroll?: AgentScrollCommand;
}

export interface AgentActionResult extends Record<string, unknown> {
  requestId: string;
  requestedAt: number;
  completedAt: number;
  action: AgentActionName;
  status: AgentActionStatus;
  reason?: string;
  target?: AgentActionNodeSummary;
  actionTarget?: AgentActionNodeSummary;
  value?: JSONValue;
}

export interface AgentActionSuccessResponse {
  ok: true;
  device: AgentActionDevice;
  result: AgentActionResult;
}

export interface AgentActionErrorResponse {
  ok: false;
  error: string;
  message: string;
  devices?: AgentActionDevice[];
}

export interface AgentActionDevice {
  appId: string;
  name: string;
  connected: boolean;
  connectedAt: number;
  hasDebugger: boolean;
}

export type AgentActionResponse =
  | AgentActionSuccessResponse
  | AgentActionErrorResponse;
