export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortValue(src[key]);
    return out;
  }
  return value;
}

export function stampChecksum<T extends { checksum: string }>(data: T): T {
  const body = { ...data, checksum: '' };
  return { ...body, checksum: fnv1a(stableStringify(body)) };
}

export function checksumValid(data: { checksum?: string }): boolean {
  if (!data || typeof data.checksum !== 'string') return false;
  const body = { ...data, checksum: '' };
  return fnv1a(stableStringify(body)) === data.checksum;
}
