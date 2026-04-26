let counter = 0;

export function createRequestId(): string {
  counter += 1;
  return `element-inspector:${Date.now()}:${counter.toString(36)}`;
}
