export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requestTimes = new Map<string, number[]>();

  return function isAllowed(clientKey: string, now = Date.now()): boolean {
    const recent = (requestTimes.get(clientKey) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= maxRequests) {
      requestTimes.set(clientKey, recent);
      return false;
    }
    recent.push(now);
    requestTimes.set(clientKey, recent);
    if (requestTimes.size > 10_000) {
      for (const [key, times] of requestTimes) {
        if (times.every((time) => now - time >= windowMs)) requestTimes.delete(key);
      }
    }
    return true;
  };
}
