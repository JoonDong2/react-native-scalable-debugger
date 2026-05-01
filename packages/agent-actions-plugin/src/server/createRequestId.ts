let nextRequestId = 0;

export function createRequestId(): string {
  nextRequestId = (nextRequestId + 1) % Number.MAX_SAFE_INTEGER;
  return `agent-actions-${Date.now().toString(36)}-${nextRequestId.toString(
    36
  )}`;
}
