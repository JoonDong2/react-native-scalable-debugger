import type { ElementInspectorLayout, JSONValue } from '../shared/protocol';

export interface RenderableElementTreeNode {
  type: string;
  displayName?: string;
  text?: string;
  layout?: ElementInspectorLayout;
  props?: {
    style?: JSONValue;
  };
  children?: RenderableElementTreeNode[];
}

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

  lines.push(parts.join(' '));

  for (const child of node.children ?? []) {
    appendNode(lines, child, depth + 1);
  }
}

function renderLayout(layout: ElementInspectorLayout): string {
  return `[${formatNumber(layout.x)},${formatNumber(layout.y)},${formatNumber(
    layout.width
  )},${formatNumber(layout.height)}]`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : 'null';
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
