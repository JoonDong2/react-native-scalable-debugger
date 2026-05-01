import type {
  AgentActionResult,
  AgentActionTarget,
  AgentNavigationCommand,
  AgentScrollCommand,
  JSONValue,
} from '../shared/protocol';
import {
  getNavigationRef,
  isNavigationReady,
  type NavigationRefLike,
} from './navigationRef';
import {
  collectFiberCandidates,
  getMatchProps,
  summarizeCandidate,
  type FiberCandidate,
} from './fiberTree';

interface ActionContext {
  requestId: string;
  requestedAt: number;
}

interface PressableProps {
  onPress?: (event: unknown) => void;
  disabled?: boolean;
  accessibilityState?: {
    disabled?: boolean;
  };
}

interface ScrollableInstance {
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
  scrollToEnd?: (options?: { animated?: boolean }) => void;
}

const scrollOffsets = new Map<string, { x: number; y: number; offset: number }>();

export async function performAgentAction(
  context: ActionContext,
  action: string,
  params: {
    target?: AgentActionTarget;
    navigation?: AgentNavigationCommand;
    scroll?: AgentScrollCommand;
  }
): Promise<AgentActionResult> {
  try {
    switch (action) {
      case 'getNavigationState':
        return getNavigationState(context);
      case 'navigate':
        return navigate(context, params.navigation);
      case 'goBack':
        return goBack(context);
      case 'press':
        return press(context, params.target);
      case 'scroll':
        return scroll(context, params.target, params.scroll);
      default:
        return createResult(context, action, 'unsupported', {
          reason: `Unsupported agent action: ${action}`,
        });
    }
  } catch (error) {
    return createResult(context, action, 'error', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function getNavigationState(context: ActionContext): AgentActionResult {
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
  command: AgentNavigationCommand | undefined
): AgentActionResult {
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

function goBack(context: ActionContext): AgentActionResult {
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

function press(
  context: ActionContext,
  target: AgentActionTarget | undefined
): AgentActionResult {
  const candidates = collectFiberCandidates();
  const match = findTargetCandidate(candidates, target);
  if (!match) {
    return createResult(context, 'press', 'unsupported', {
      reason: 'No mounted element matched the requested target.',
    });
  }

  const pressable = findPressableCandidate(match);
  if (!pressable) {
    return createResult(context, 'press', 'unsupported', {
      reason: 'The matched element did not expose an enabled onPress handler.',
      target: summarizeCandidate(match),
    });
  }

  const props = getPressableProps(pressable);
  props.onPress?.(createPressEvent(match));
  return createResult(context, 'press', 'ok', {
    target: summarizeCandidate(match),
    actionTarget: summarizeCandidate(pressable),
  });
}

function scroll(
  context: ActionContext,
  target: AgentActionTarget | undefined,
  command: AgentScrollCommand | undefined
): AgentActionResult {
  const candidates = collectFiberCandidates();
  const match = target ? findTargetCandidate(candidates, target) : undefined;
  if (target && !match) {
    return createResult(context, 'scroll', 'unsupported', {
      reason: 'No mounted element matched the requested target.',
    });
  }

  const scrollable = match
    ? findScrollableCandidate(match)
    : candidates.find((candidate) => getScrollableInstance(candidate));

  if (!scrollable) {
    return createResult(context, 'scroll', 'unsupported', {
      reason: 'No scrollable mounted element was found for the requested target.',
      ...(match ? { target: summarizeCandidate(match) } : {}),
    });
  }

  const instance = getScrollableInstance(scrollable);
  if (!instance) {
    return createResult(context, 'scroll', 'unsupported', {
      reason: 'The matched element does not expose a supported scroll method.',
      target: match ? summarizeCandidate(match) : summarizeCandidate(scrollable),
    });
  }

  applyScroll(scrollable.id, instance, command ?? {});
  return createResult(context, 'scroll', 'ok', {
    ...(match ? { target: summarizeCandidate(match) } : {}),
    actionTarget: summarizeCandidate(scrollable),
  });
}

function getReadyNavigationRef(
  context: ActionContext,
  action: 'navigate' | 'goBack'
): NavigationRefLike | AgentActionResult {
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

function findTargetCandidate(
  candidates: FiberCandidate[],
  target: AgentActionTarget | undefined
): FiberCandidate | null {
  if (!target) {
    return null;
  }
  if (target.id) {
    return candidates.find((candidate) => candidate.id === target.id) ?? null;
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, target),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const index =
    typeof target.index === 'number' && target.index >= 0
      ? Math.floor(target.index)
      : 0;
  return scored[index]?.candidate ?? null;
}

function scoreCandidate(
  candidate: FiberCandidate,
  target: AgentActionTarget
): number {
  const props = getMatchProps(candidate);
  let score = 0;

  score += scoreField(props?.testID, target.testID, target.exact, 100);
  score += scoreField(props?.nativeID, target.nativeID, target.exact, 90);
  score += scoreField(
    props?.accessibilityLabel,
    target.accessibilityLabel,
    target.exact,
    80
  );
  score += scoreField(candidate.textContent, target.text, target.exact, 70);
  score += scoreField(candidate.displayName, target.displayName, true, 50);
  score += scoreField(candidate.type, target.type, true, 45);

  if (target.query) {
    const query = normalizeText(target.query);
    score += scoreQuery(query, props?.testID, 45);
    score += scoreQuery(query, props?.nativeID, 40);
    score += scoreQuery(query, props?.accessibilityLabel, 35);
    score += scoreQuery(query, candidate.textContent, 30);
    score += scoreQuery(query, candidate.displayName, 15);
    score += scoreQuery(query, candidate.type, 10);
  }

  return score;
}

function scoreField(
  value: unknown,
  expected: string | undefined,
  exact: boolean | undefined,
  weight: number
): number {
  if (!expected || typeof value !== 'string') {
    return 0;
  }
  const normalizedValue = normalizeText(value);
  const normalizedExpected = normalizeText(expected);
  if (normalizedValue === normalizedExpected) {
    return weight;
  }
  return exact ? 0 : normalizedValue.includes(normalizedExpected) ? weight / 2 : 0;
}

function scoreQuery(query: string, value: unknown, weight: number): number {
  if (!query || typeof value !== 'string') {
    return 0;
  }
  const normalizedValue = normalizeText(value);
  if (normalizedValue === query) {
    return weight;
  }
  return normalizedValue.includes(query) ? weight / 2 : 0;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function findPressableCandidate(
  candidate: FiberCandidate
): FiberCandidate | null {
  let cursor: FiberCandidate | undefined = candidate;
  while (cursor) {
    if (isPressable(cursor)) {
      return cursor;
    }
    cursor = cursor.parent;
  }

  return findDescendant(candidate, isPressable);
}

function findScrollableCandidate(
  candidate: FiberCandidate
): FiberCandidate | null {
  let cursor: FiberCandidate | undefined = candidate;
  while (cursor) {
    if (getScrollableInstance(cursor)) {
      return cursor;
    }
    cursor = cursor.parent;
  }

  return findDescendant(candidate, (item) => !!getScrollableInstance(item));
}

function findDescendant(
  candidate: FiberCandidate,
  predicate: (candidate: FiberCandidate) => boolean
): FiberCandidate | null {
  const stack = [...candidate.children];
  while (stack.length > 0) {
    const current = stack.shift()!;
    if (predicate(current)) {
      return current;
    }
    stack.push(...current.children);
  }
  return null;
}

function isPressable(candidate: FiberCandidate): boolean {
  const props = getPressableProps(candidate);
  return typeof props.onPress === 'function' && !isDisabled(props);
}

function getPressableProps(candidate: FiberCandidate): PressableProps {
  return (candidate.props ?? candidate.hostProps ?? {}) as PressableProps;
}

function isDisabled(props: PressableProps): boolean {
  return props.disabled === true || props.accessibilityState?.disabled === true;
}

function createPressEvent(candidate: FiberCandidate): unknown {
  return {
    nativeEvent: {
      target: candidate.id,
    },
    currentTarget: candidate.id,
    target: candidate.id,
    preventDefault() {},
    stopPropagation() {},
    persist() {},
  };
}

function getScrollableInstance(
  candidate: FiberCandidate
): ScrollableInstance | null {
  for (const value of [
    candidate.fiber.stateNode,
    candidate.hostFiber?.stateNode,
  ]) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const maybe = value as ScrollableInstance;
    if (
      typeof maybe.scrollTo === 'function' ||
      typeof maybe.scrollToOffset === 'function' ||
      typeof maybe.scrollToEnd === 'function'
    ) {
      return maybe;
    }
  }
  return null;
}

function applyScroll(
  id: string,
  instance: ScrollableInstance,
  command: AgentScrollCommand
): void {
  const animated = command.animated !== false;
  const current = scrollOffsets.get(id) ?? { x: 0, y: 0, offset: 0 };

  if ((command.to === 'end' || command.to === 'bottom') && instance.scrollToEnd) {
    instance.scrollToEnd({ animated });
    scrollOffsets.set(id, {
      x: current.x,
      y: Number.MAX_SAFE_INTEGER,
      offset: Number.MAX_SAFE_INTEGER,
    });
    return;
  }

  const amount =
    typeof command.amount === 'number' && Number.isFinite(command.amount)
      ? Math.abs(command.amount)
      : 300;
  const next = { ...current };

  if (command.to === 'start' || command.to === 'top') {
    next.x = 0;
    next.y = 0;
    next.offset = 0;
  } else if (typeof command.x === 'number' || typeof command.y === 'number') {
    next.x = numberOr(command.x, current.x);
    next.y = numberOr(command.y, current.y);
  } else if (typeof command.offset === 'number') {
    next.offset = Math.max(0, command.offset);
    next.y = next.offset;
  } else {
    switch (command.direction ?? 'down') {
      case 'up':
        next.y = Math.max(0, current.y - amount);
        next.offset = Math.max(0, current.offset - amount);
        break;
      case 'left':
        next.x = Math.max(0, current.x - amount);
        break;
      case 'right':
        next.x = current.x + amount;
        break;
      case 'down':
      default:
        next.y = current.y + amount;
        next.offset = current.offset + amount;
        break;
    }
  }

  if (instance.scrollToOffset) {
    instance.scrollToOffset({ offset: next.offset || next.y, animated });
  } else if (instance.scrollTo) {
    instance.scrollTo({ x: next.x, y: next.y, animated });
  } else if (instance.scrollToEnd) {
    instance.scrollToEnd({ animated });
  }
  scrollOffsets.set(id, next);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function createResult(
  context: ActionContext,
  action: string,
  status: AgentActionResult['status'],
  extras: Partial<AgentActionResult> = {}
): AgentActionResult {
  return {
    requestId: context.requestId,
    requestedAt: context.requestedAt,
    completedAt: Date.now(),
    action: action as AgentActionResult['action'],
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
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (depth >= 8) {
    return '[Object]';
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeValue(item, depth + 1, seen))
      .filter((item): item is JSONValue => item !== undefined);
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const output: Record<string, JSONValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).slice(0, 100)) {
      const item = sanitizeValue(
        (value as Record<string, unknown>)[key],
        depth + 1,
        seen
      );
      if (item !== undefined) {
        output[key] = item;
      }
    }
    return output;
  }
  return undefined;
}
