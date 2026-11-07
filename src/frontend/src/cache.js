const ACTIVE = "tmail.active";
const PREFIX = "tmail.cache:";
let epoch = 0;
const watchers = new Set();

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function notify() {
  epoch++;
  watchers.forEach((fn) => fn());
}
export function generation() {
  return epoch;
}
export function currentMailbox() {
  try {
    const box = JSON.parse(storage()?.getItem(ACTIVE) || "null");
    if (!box?.id || !box.token || box.expiresAt <= Date.now()) return null;
    return box;
  } catch {
    return null;
  }
}
export function readCache(scope, key) {
  const store = storage();
  try {
    const name = `${PREFIX}${scope}:${key}`,
      entry = JSON.parse(store?.getItem(name) || "null");
    if (!entry || entry.until <= Date.now()) {
      store?.removeItem(name);
      return undefined;
    }
    return entry.data;
  } catch {
    return undefined;
  }
}
export function writeCache(scope, key, data, ttl, expiresAt = Infinity) {
  try {
    storage()?.setItem(
      `${PREFIX}${scope}:${key}`,
      JSON.stringify({ until: Math.min(Date.now() + ttl, expiresAt), data }),
    );
  } catch {
    /* Full or disabled storage: use query memory only. */
  }
}
export function clearMailboxCaches() {
  const store = storage();
  if (!store) return;
  for (const key of Object.keys(store))
    if (key.startsWith(PREFIX) && !key.startsWith(`${PREFIX}site:`))
      store.removeItem(key);
}
export function setMailbox(box) {
  clearMailboxCaches();
  try {
    box
      ? storage()?.setItem(ACTIVE, JSON.stringify(box))
      : storage()?.removeItem(ACTIVE);
  } catch {
    /* Browser storage can be disabled. */
  }
  notify();
}
export function subscribe(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
window.addEventListener("storage", (event) => {
  if (event.key === ACTIVE || event.key === null) {
    clearMailboxCaches();
    notify();
  }
});
// Remove expired entries on startup; keep at most 40 small, recent cache entries.
try {
  const keys = Object.keys(storage() ?? {}).filter((key) =>
    key.startsWith(PREFIX),
  );
  for (const key of keys) {
    const entry = JSON.parse(storage().getItem(key));
    if (entry.until <= Date.now()) storage().removeItem(key);
  }
  for (const key of keys.slice(0, Math.max(0, keys.length - 40)))
    storage()?.removeItem(key);
} catch {
  /* Malformed browser cache must not block the app. */
}
