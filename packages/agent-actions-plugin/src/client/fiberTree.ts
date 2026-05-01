import type { JSONValue } from '../shared/protocol';

const MAX_TEXT_LENGTH = 300;
const MAX_PROP_KEYS = 20;
const MAX_PROP_DEPTH = 2;
const IGNORED_ELEMENT_NAMES = new Set([
  'DebuggingOverlay',
  'LogBoxStateSubscription',
  'PressabilityDebugView',
]);

export interface ReactFiberLike {
  key?: string | null;
  child?: ReactFiberLike | null;
  sibling?: ReactFiberLike | null;
  return?: ReactFiberLike | null;
  elementType?: unknown;
  type?: unknown;
  tag?: number;
  memoizedProps?: unknown;
  pendingProps?: unknown;
  stateNode?: unknown;
}

export interface FiberCandidate {
  id: string;
  fiber: ReactFiberLike;
  parent?: FiberCandidate;
  children: FiberCandidate[];
  type: string;
  displayName: string;
  props?: Record<string, unknown>;
  hostProps?: Record<string, unknown>;
  hostFiber?: ReactFiberLike | null;
  text?: string;
  textContent?: string;
}

interface ReactFiberRootLike {
  current?: ReactFiberLike | null;
}

interface ReactDevToolsHookLike {
  renderers?: {
    keys?: () => Iterable<number>;
    forEach?: (callback: (_value: unknown, key: number) => void) => void;
  };
  getFiberRoots?: (
    rendererId: number
  ) => Set<ReactFiberRootLike> | Iterable<ReactFiberRootLike>;
}

interface ElementNames {
  type: string;
  displayName: string;
}

export function collectFiberCandidates(): FiberCandidate[] {
  const roots = getReactDevToolsFiberRoots();
  const candidates: FiberCandidate[] = [];

  roots.forEach((root, index) => {
    const rootFiber = root.current?.child ?? root.current ?? null;
    collectSiblings(rootFiber, `root.${index}`, undefined, candidates);
  });

  for (const candidate of candidates) {
    candidate.textContent = collectTextContent(candidate);
  }

  return candidates;
}

export function summarizeCandidate(candidate: FiberCandidate): {
  id: string;
  type: string;
  displayName: string;
  text?: string;
  props?: Record<string, JSONValue>;
} {
  const props = summarizeProps(getMatchProps(candidate));
  return {
    id: candidate.id,
    type: candidate.type,
    displayName: candidate.displayName,
    text: candidate.textContent || candidate.text,
    ...(props ? { props } : {}),
  };
}

export function getMatchProps(
  candidate: FiberCandidate
): Record<string, unknown> | undefined {
  return {
    ...(candidate.props ?? {}),
    ...(candidate.hostProps ?? {}),
  };
}

function collectSiblings(
  fiber: ReactFiberLike | null,
  path: string,
  parent: FiberCandidate | undefined,
  output: FiberCandidate[]
): void {
  const stack: Array<{
    fiber: ReactFiberLike;
    parent?: FiberCandidate;
    path: string;
  }> = [];
  const rootFibers = getSiblingFibers(fiber);

  for (let index = rootFibers.length - 1; index >= 0; index -= 1) {
    stack.push({
      fiber: rootFibers[index],
      parent,
      path: `${path}.${index}`,
    });
  }

  while (stack.length > 0) {
    const item = stack.pop()!;
    const names = getElementNames(item.fiber);
    if (shouldIgnoreElement(names)) {
      pushChildFibers(stack, item.fiber, item.parent, item.path);
      continue;
    }

    const candidate = fiberToCandidate(item.fiber, item.path, item.parent);
    output.push(candidate);
    if (item.parent) {
      item.parent.children.push(candidate);
    }

    const childFibers = getSiblingFibers(item.fiber.child ?? null);
    for (let index = childFibers.length - 1; index >= 0; index -= 1) {
      stack.push({
        fiber: childFibers[index],
        parent: candidate,
        path: `${item.path}.${index}`,
      });
    }
  }
}

function pushChildFibers(
  stack: Array<{
    fiber: ReactFiberLike;
    parent?: FiberCandidate;
    path: string;
  }>,
  fiber: ReactFiberLike,
  parent: FiberCandidate | undefined,
  path: string
): void {
  const children = getSiblingFibers(fiber.child ?? null);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    stack.push({
      fiber: children[index],
      parent,
      path: `${path}.${index}`,
    });
  }
}

function fiberToCandidate(
  fiber: ReactFiberLike,
  path: string,
  parent: FiberCandidate | undefined
): FiberCandidate {
  const names = getElementNames(fiber);
  const hostFiber = findInspectableHostFiber(fiber);
  const props = getProps(fiber);
  const hostProps = hostFiber ? getProps(hostFiber) : undefined;
  const text = getDirectText(fiber, props);

  return {
    id: path,
    fiber,
    parent,
    children: [],
    type: names.type,
    displayName: names.displayName,
    props,
    hostProps,
    hostFiber,
    text,
  };
}

function getReactDevToolsFiberRoots(): ReactFiberRootLike[] {
  const hook = (globalThis as {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHookLike;
  }).__REACT_DEVTOOLS_GLOBAL_HOOK__;

  if (!hook || typeof hook.getFiberRoots !== 'function') {
    return [];
  }

  const roots: ReactFiberRootLike[] = [];
  for (const rendererId of getRendererIds(hook)) {
    const rendererRoots = hook.getFiberRoots(rendererId);
    if (!rendererRoots) {
      continue;
    }
    for (const root of rendererRoots) {
      roots.push(root);
    }
  }
  return roots;
}

function getRendererIds(hook: ReactDevToolsHookLike): number[] {
  const renderers = hook.renderers;
  if (!renderers) {
    return [];
  }

  if (typeof renderers.keys === 'function') {
    return Array.from(renderers.keys()).filter(isFiniteNumber);
  }

  const ids: number[] = [];
  if (typeof renderers.forEach === 'function') {
    renderers.forEach((_value, key) => {
      if (isFiniteNumber(key)) {
        ids.push(key);
      }
    });
  }
  return ids;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getSiblingFibers(fiber: ReactFiberLike | null): ReactFiberLike[] {
  const fibers: ReactFiberLike[] = [];
  let cursor: ReactFiberLike | null | undefined = fiber;
  while (cursor) {
    fibers.push(cursor);
    cursor = cursor.sibling;
  }
  return fibers;
}

function getProps(
  fiber: ReactFiberLike
): Record<string, unknown> | undefined {
  const props = fiber.memoizedProps ?? fiber.pendingProps;
  return props && typeof props === 'object' && !Array.isArray(props)
    ? (props as Record<string, unknown>)
    : undefined;
}

function findInspectableHostFiber(
  fiber: ReactFiberLike | null | undefined
): ReactFiberLike | null {
  if (!fiber) {
    return null;
  }

  const visited = new Set<ReactFiberLike>();
  const stack: ReactFiberLike[] = [fiber];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    if (isHostFiber(current)) {
      return current;
    }

    const children = getSiblingFibers(current.child ?? null);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return null;
}

function isHostFiber(fiber: ReactFiberLike): boolean {
  return fiber.tag === 5 || fiber.tag === 6;
}

function shouldIgnoreElement(names: ElementNames): boolean {
  return (
    IGNORED_ELEMENT_NAMES.has(names.type) ||
    IGNORED_ELEMENT_NAMES.has(names.displayName)
  );
}

function getElementNames(fiber: ReactFiberLike): ElementNames {
  const type = fiber.elementType ?? fiber.type;
  const displayName = getExplicitDisplayNameFromType(type);
  const typeName =
    getTypeNameFromType(type) ?? displayName ?? getDisplayNameFromTag(fiber.tag);
  return {
    type: typeName,
    displayName: displayName ?? typeName,
  };
}

function getTypeNameFromType(type: unknown): string | null {
  const seen = new Set<object>();
  const stack: unknown[] = [type];

  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      return current;
    }
    if (typeof current === 'function') {
      return current.name || 'Anonymous';
    }
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }

    seen.add(current);
    const name = getNamedValue(current, 'name');
    if (name) {
      return name;
    }

    const render = getObjectValue(current, 'render');
    if (render) {
      stack.push(render);
    }
    const nestedType = getObjectValue(current, 'type');
    if (nestedType && nestedType !== current) {
      stack.push(nestedType);
    }
  }

  return null;
}

function getExplicitDisplayNameFromType(type: unknown): string | null {
  const seen = new Set<object>();
  const stack: unknown[] = [type];

  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'function') {
      return getNamedValue(current, 'displayName');
    }
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }

    seen.add(current);
    const displayName = getNamedValue(current, 'displayName');
    if (displayName) {
      return displayName;
    }

    const render = getObjectValue(current, 'render');
    if (render) {
      stack.push(render);
    }
    const nestedType = getObjectValue(current, 'type');
    if (nestedType && nestedType !== current) {
      stack.push(nestedType);
    }
  }

  return null;
}

function getDisplayNameFromTag(tag: number | undefined): string {
  switch (tag) {
    case 3:
      return 'Root';
    case 5:
      return 'HostComponent';
    case 6:
      return 'Text';
    case 7:
      return 'Fragment';
    case 11:
      return 'ForwardRef';
    case 14:
    case 15:
      return 'Memo';
    default:
      return tag == null ? 'Unknown' : `FiberTag${tag}`;
  }
}

function getDirectText(
  fiber: ReactFiberLike,
  props: Record<string, unknown> | undefined
): string | undefined {
  if (fiber.tag === 6) {
    const text = fiber.memoizedProps ?? fiber.pendingProps;
    if (typeof text === 'string' || typeof text === 'number') {
      return truncateString(String(text));
    }
  }

  const children = props?.children;
  if (typeof children === 'string' || typeof children === 'number') {
    return truncateString(String(children));
  }
  return undefined;
}

function collectTextContent(candidate: FiberCandidate): string | undefined {
  const parts: string[] = [];
  if (candidate.text) {
    parts.push(candidate.text);
  }
  for (const child of candidate.children) {
    const childText = collectTextContent(child);
    if (childText) {
      parts.push(childText);
    }
  }
  return parts.length > 0 ? truncateString(parts.join(' ').trim()) : undefined;
}

function summarizeProps(
  props: Record<string, unknown> | undefined
): Record<string, JSONValue> | undefined {
  if (!props) {
    return undefined;
  }

  const output: Record<string, JSONValue> = {};
  for (const key of [
    'testID',
    'nativeID',
    'accessibilityLabel',
    'accessibilityHint',
    'accessibilityRole',
  ]) {
    const value = sanitizeValue(props[key], 0);
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function sanitizeValue(value: unknown, depth: number): JSONValue | undefined {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return truncateString(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (depth >= MAX_PROP_DEPTH) {
    return '[Object]';
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PROP_KEYS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item): item is JSONValue => item !== undefined);
  }
  if (typeof value === 'object') {
    const output: Record<string, JSONValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).slice(
      0,
      MAX_PROP_KEYS
    )) {
      const item = sanitizeValue(
        (value as Record<string, unknown>)[key],
        depth + 1
      );
      if (item !== undefined) {
        output[key] = item;
      }
    }
    return output;
  }
  return undefined;
}

function getNamedValue(object: unknown, key: string): string | null {
  const value = getObjectValue(object, key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getObjectValue(object: unknown, key: string): unknown {
  if (!object || typeof object !== 'object') {
    return undefined;
  }
  return (object as Record<string, unknown>)[key];
}

function truncateString(value: string): string {
  return value.length > MAX_TEXT_LENGTH
    ? `${value.slice(0, MAX_TEXT_LENGTH)}...`
    : value;
}
