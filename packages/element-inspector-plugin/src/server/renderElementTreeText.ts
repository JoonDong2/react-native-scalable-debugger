import type { ElementInspectorLayout, JSONValue } from '../shared/protocol';

export interface RenderableElementTreeNode {
  type: string;
  displayName?: string;
  text?: string;
  layout?: ElementInspectorLayout;
  props?: Record<string, JSONValue>;
  children?: RenderableElementTreeNode[];
}

const TARGET_PROP_NAMES = new Set([
  'testID',
  'nativeID',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'disabled',
]);

export function renderElementTreeText(
  root: RenderableElementTreeNode | null | undefined
): string {
  if (!root) {
    return '';
  }

  const lines: string[] = [];
  appendNode(lines, root, 0);
  return lines.join('\n');
}

function appendNode(
  lines: string[],
  node: RenderableElementTreeNode,
  depth: number
): void {
  const label = node.displayName ?? node.type;
  const parts = [`${'  '.repeat(depth)}${label}`];
  if (node.text !== undefined) {
    parts.push(JSON.stringify(node.text));
  }
  if (node.layout) {
    parts.push(renderLayout(node.layout));
  }
  if (node.props?.style !== undefined) {
    parts.push(`style=${renderCompactValue(node.props.style)}`);
  }
  const renderedProps = renderProps(node.props);
  if (renderedProps) {
    parts.push(`props=${renderCompactValue(renderedProps)}`);
  }

  lines.push(parts.join(' '));

  for (const child of node.children ?? []) {
    appendNode(lines, child, depth + 1);
  }
}

function renderLayout(layout: ElementInspectorLayout): string {
  return `[${formatNumber(layout.x)} ${formatNumber(layout.y)} ${formatNumber(
    layout.width
  )} ${formatNumber(layout.height)}]`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : 'null';
}

function renderProps(
  props: Record<string, JSONValue> | undefined
): Record<string, JSONValue> | null {
  if (!props) {
    return null;
  }

  const output: Record<string, JSONValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (TARGET_PROP_NAMES.has(key)) {
      const renderedValue = renderPropValue(value);
      if (renderedValue !== undefined) {
        output[key] = renderedValue;
      }
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}

function renderPropValue(value: JSONValue | undefined): JSONValue | undefined {
  if (value == null) {
    return undefined;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value
      .map(renderPropValue)
      .filter((item): item is JSONValue => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  const output: Record<string, JSONValue> = {};
  for (const [key, childValue] of Object.entries(value)) {
    const renderedValue = renderPropValue(childValue);
    if (renderedValue !== undefined) {
      output[key] = renderedValue;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function renderCompactValue(value: JSONValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(renderCompactValue).join(',')}]`;
  }

  return `{${Object.entries(value)
    .map(
      ([key, childValue]) =>
        `${renderCompactKey(key)}:${renderCompactValue(childValue)}`
    )
    .join(',')}}`;
}

function renderCompactKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}
