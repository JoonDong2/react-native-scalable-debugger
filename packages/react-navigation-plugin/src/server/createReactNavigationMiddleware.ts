import type {
  MiddlewareEndpointContribution,
  MiddlewareNext,
  PluginEndpointContext,
} from '@react-native-scalable-devtools/cli/plugin';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  REACT_NAVIGATION_BACK_ENDPOINT,
  REACT_NAVIGATION_NAVIGATE_ENDPOINT,
  REACT_NAVIGATION_STATE_ENDPOINT,
  type ReactNavigationCommand,
} from '../shared/protocol';
import type {
  ControllerNavigationResult,
  ReactNavigationController,
} from './ReactNavigationController';

const MAX_BODY_BYTES = 1024 * 1024;

interface JsonBody {
  appId?: string;
  navigation?: ReactNavigationCommand;
  name?: string;
  params?: unknown;
  key?: string;
  path?: string;
  merge?: boolean;
}

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
  context: PluginEndpointContext
) => Promise<void>;

export function createReactNavigationMiddlewareEndpoints(
  controller: ReactNavigationController
): MiddlewareEndpointContribution[] {
  return [
    createEndpoint(
      REACT_NAVIGATION_STATE_ENDPOINT,
      (request, response, context) =>
        handleNavigationState(controller, request, response, context)
    ),
    createEndpoint(
      REACT_NAVIGATION_NAVIGATE_ENDPOINT,
      (request, response, context) =>
        handleNavigate(controller, request, response, context)
    ),
    createEndpoint(REACT_NAVIGATION_BACK_ENDPOINT, (request, response, context) =>
      handleBack(controller, request, response, context)
    ),
  ];
}

function createEndpoint(
  path: string,
  handler: Handler
): MiddlewareEndpointContribution {
  return {
    path,
    handler: (
      request: IncomingMessage,
      response: ServerResponse,
      context: PluginEndpointContext,
      _next: MiddlewareNext
    ) => handler(request, response, context),
  };
}

async function handleNavigationState(
  controller: ReactNavigationController,
  request: IncomingMessage,
  response: ServerResponse,
  context: PluginEndpointContext
): Promise<void> {
  if (!allowMethod(request, response, 'GET')) {
    return;
  }

  const url = getRequestUrl(request);
  const result = await controller.requestRuntimeAction(context, {
    action: 'getNavigationState',
    appId: getStringParam(url, 'appId'),
  });
  writeControllerResult(response, result);
}

async function handleNavigate(
  controller: ReactNavigationController,
  request: IncomingMessage,
  response: ServerResponse,
  context: PluginEndpointContext
): Promise<void> {
  if (!allowMethod(request, response, 'POST')) {
    return;
  }

  const body = await readJsonBody(request);
  const navigation = normalizeNavigation(body);
  const result = await controller.requestRuntimeAction(context, {
    action: 'navigate',
    appId: body.appId,
    navigation,
  });
  writeControllerResult(response, result);
}

async function handleBack(
  controller: ReactNavigationController,
  request: IncomingMessage,
  response: ServerResponse,
  context: PluginEndpointContext
): Promise<void> {
  if (!allowMethod(request, response, 'POST')) {
    return;
  }

  const body = await readJsonBody(request);
  const result = await controller.requestRuntimeAction(context, {
    action: 'goBack',
    appId: body.appId,
  });
  writeControllerResult(response, result);
}

function normalizeNavigation(body: JsonBody): ReactNavigationCommand {
  return {
    ...(body.navigation ?? {}),
    name: body.name ?? body.navigation?.name,
    params:
      (body.params as ReactNavigationCommand['params']) ??
      body.navigation?.params,
    key: body.key ?? body.navigation?.key,
    path: body.path ?? body.navigation?.path,
    merge: body.merge ?? body.navigation?.merge,
  };
}

function allowMethod(
  request: IncomingMessage,
  response: ServerResponse,
  method: 'GET' | 'POST'
): boolean {
  if (request.method === method) {
    return true;
  }

  writeJson(response, 405, {
    ok: false,
    error: 'method_not_allowed',
    message: `This endpoint only supports ${method} requests.`,
  });
  return false;
}

async function readJsonBody(request: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > MAX_BODY_BYTES) {
      throw new Error('Request body is too large.');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as JsonBody)
    : {};
}

function writeControllerResult(
  response: ServerResponse,
  result: ControllerNavigationResult
): void {
  if (result.ok) {
    writeJson(response, result.statusCode, withoutStatusCode(result));
    return;
  }
  writeJson(response, result.statusCode, withoutStatusCode(result));
}

function withoutStatusCode<T extends { statusCode: number }>(
  value: T
): Omit<T, 'statusCode'> {
  const { statusCode: _statusCode, ...rest } = value;
  return rest;
}

function getRequestUrl(request: IncomingMessage): URL {
  return new URL(request.url || '/', 'http://localhost');
}

function getStringParam(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
