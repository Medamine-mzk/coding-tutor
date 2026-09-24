type Entry = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Entry>>();

export function checkRateLimit(
  storeKey: string,
  ip: string,
  max: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  let store = stores.get(storeKey);
  if (!store) {
    store = new Map();
    stores.set(storeKey, store);
  }
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

export function rateLimitHeaders(remaining: number, resetAt: number, max: number): Record<string, string> {
  const retryAfter = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  return {
    "X-RateLimit-Limit": String(max),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.floor(resetAt / 1000)),
    "Retry-After": String(retryAfter),
  };
}
