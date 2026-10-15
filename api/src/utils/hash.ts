import crypto from 'crypto';

/**
 * Deterministically stringifies an object by recursively sorting its keys.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJson(val);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Calculates SHA256(prevHash + canonicalJson(payload))
 */
export function computeAuditHash(prevHash: string, payload: unknown): string {
  const serialized = canonicalJson(payload);
  const data = prevHash + serialized;
  return crypto.createHash('sha256').update(data).digest('hex');
}
