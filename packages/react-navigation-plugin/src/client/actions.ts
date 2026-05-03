import type {
  JSONValue,
  ReactNavigationCommand,
  ReactNavigationResult,
} from '../shared/protocol';
import {
  getNavigationRef,
  isNavigationReady,
  type NavigationRefLike,
} from './navigationRef';

interface ActionContext {
  requestId: string;
  requestedAt: number;
}

export async function performReactNavigationAction(
  context: ActionContext,
  action: string,
  params: {
    navigation?: ReactNavigationCommand;
  }
): Promise<ReactNavigationResult> {
  try {
    switch (action) {
      case 'getNavigationState':
        return getNavigationState(context);
      case 'navigate':
        return navigate(context, params.navigation);
      case 'goBack':
        return goBack(context);
      default:
        return createResult(context, action, 'unsupported', {
          reason: `Unsupported React Navigation action: ${action}`,
        });
    }
  } catch (error) {
    return createResult(context, action, 'error', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function getNavigationState(context: ActionContext): ReactNavigationResult {
  const ref = getNavigationRef();
  if (!ref) {
    return createResult(context, 'getNavigationState', 'unsupported', {
      reason:
        'No navigation ref is registered. Call registerNavigationRef(navigationRef) from the app.',
    });
  }

  return createResult(context, 'getNavigationState', 'ok', {
    value: {
      isReady: isNavigationReady(ref),
      state: sanitizeJson(ref.getRootState?.()),
      currentRoute: sanitizeJson(ref.getCurrentRoute?.()),
    },
  });
}

function navigate(
  context: ActionContext,
  command: ReactNavigationCommand | undefined
): ReactNavigationResult {
  const ref = getReadyNavigationRef(context, 'navigate');
  if ('status' in ref) {
    return ref;
  }

  if (!command || typeof command.name !== 'string' || command.name.length === 0) {
    return createResult(context, 'navigate', 'error', {
      reason: 'navigation.name must be a non-empty string.',
    });
  }
  if (typeof ref.navigate !== 'function') {
    return createResult(context, 'navigate', 'unsupported', {
      reason: 'The registered navigation ref does not expose navigate(...).',
    });
  }

  if (command.key || command.path || command.merge !== undefined) {
    ref.navigate({
      name: command.name,
      params: command.params,
      key: command.key,
      path: command.path,
      merge: command.merge,
    });
  } else if (command.params !== undefined) {
    ref.navigate(command.name, command.params);
  } else {
    ref.navigate(command.name);
  }

  return createResult(context, 'navigate', 'ok', {
    value: getNavigationValue(ref),
  });
}

function goBack(context: ActionContext): ReactNavigationResult {
  const ref = getReadyNavigationRef(context, 'goBack');
  if ('status' in ref) {
    return ref;
  }
  if (typeof ref.goBack !== 'function') {
    return createResult(context, 'goBack', 'unsupported', {
      reason: 'The registered navigation ref does not expose goBack().',
    });
  }
  if (typeof ref.canGoBack === 'function' && !ref.canGoBack()) {
    return createResult(context, 'goBack', 'unsupported', {
      reason: 'The navigation ref reports that it cannot go back.',
    });
  }

  ref.goBack();
  return createResult(context, 'goBack', 'ok', {
    value: getNavigationValue(ref),
  });
}

function getReadyNavigationRef(
  context: ActionContext,
  action: 'navigate' | 'goBack'
): NavigationRefLike | ReactNavigationResult {
  const ref = getNavigationRef();
  if (!ref) {
    return createResult(context, action, 'unsupported', {
      reason:
        'No navigation ref is registered. Call registerNavigationRef(navigationRef) from the app.',
    });
  }
  if (!isNavigationReady(ref)) {
    return createResult(context, action, 'unsupported', {
      reason: 'The registered navigation ref is not ready yet.',
    });
  }
  return ref;
}

function getNavigationValue(ref: NavigationRefLike): JSONValue {
  return {
    state: sanitizeJson(ref.getRootState?.()),
    currentRoute: sanitizeJson(ref.getCurrentRoute?.()),
  };
}

function createResult(
  context: ActionContext,
  action: string,
  status: ReactNavigationResult['status'],
  extras: Partial<ReactNavigationResult> = {}
): ReactNavigationResult {
  return {
    requestId: context.requestId,
    requestedAt: context.requestedAt,
    completedAt: Date.now(),
    action: action as ReactNavigationResult['action'],
    status,
    ...extras,
  };
}

function sanitizeJson(value: unknown): JSONValue {
  return sanitizeValue(value, 0, new WeakSet<object>()) ?? null;
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): JSONValue | undefined {
  if (value == null) {
    return null;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (typeof value !== 'object') {
    return null;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  if (depth >= 8) {
    return '[MaxDepth]';
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeValue(item, depth + 1, seen))
      .filter((item): item is JSONValue => item !== undefined);
    seen.delete(value);
    return items;
  }

  const output: Record<string, JSONValue> = {};
  for (const [key, child] of Object.entries(value)) {
    const sanitized = sanitizeValue(child, depth + 1, seen);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  seen.delete(value);
  return output;
}
