// Simple in-memory TTL cache for global/tenant-agnostic DB reads.
// Survives for the lifetime of the Node process (next start / dev). No
// external store — keeps pooler pressure low without adding infra.
const store = new Map();

export function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached(key, value, ttlMs = 30000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export async function cached(key, ttlMs, loader) {
  const hit = getCached(key);
  if (hit !== null) return hit;
  const value = await loader();
  setCached(key, value, ttlMs);
  return value;
}

export function invalidate(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
