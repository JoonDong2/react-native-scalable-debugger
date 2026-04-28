type JsonFrameState = 'start' | 'array' | 'object';

interface JsonFrame {
  value: unknown;
  keyIndex: number;
  keys: string[] | null;
  state: JsonFrameState;
}

export function stringifyJson(value: unknown): string {
  const output: string[] = [];
  const stack: JsonFrame[] = [
    { value, keyIndex: 0, keys: null, state: 'start' },
  ];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.state === 'start') {
      if (
        frame.value === null ||
        typeof frame.value === 'string' ||
        typeof frame.value === 'number' ||
        typeof frame.value === 'boolean'
      ) {
        output.push(JSON.stringify(frame.value));
        stack.pop();
        continue;
      }

      if (Array.isArray(frame.value)) {
        output.push('[');
        frame.state = 'array';
        frame.keyIndex = 0;
        continue;
      }

      if (typeof frame.value === 'object') {
        output.push('{');
        frame.state = 'object';
        frame.keys = Object.keys(frame.value as Record<string, unknown>).filter(
          (key) => (frame.value as Record<string, unknown>)[key] !== undefined
        );
        frame.keyIndex = 0;
        continue;
      }

      output.push('null');
      stack.pop();
      continue;
    }

    if (frame.state === 'array') {
      const arrayValue = frame.value as unknown[];
      if (frame.keyIndex >= arrayValue.length) {
        output.push(']');
        stack.pop();
        continue;
      }

      if (frame.keyIndex > 0) {
        output.push(',');
      }

      const item = arrayValue[frame.keyIndex];
      frame.keyIndex += 1;
      stack.push({
        value: item === undefined ? null : item,
        keyIndex: 0,
        keys: null,
        state: 'start',
      });
      continue;
    }

    if (frame.keys && frame.keyIndex < frame.keys.length) {
      const objectValue = frame.value as Record<string, unknown>;
      const key = frame.keys[frame.keyIndex];
      if (frame.keyIndex > 0) {
        output.push(',');
      }

      output.push(JSON.stringify(key), ':');
      frame.keyIndex += 1;
      stack.push({
        value: objectValue[key],
        keyIndex: 0,
        keys: null,
        state: 'start',
      });
      continue;
    }

    output.push('}');
    stack.pop();
  }

  return output.join('');
}
