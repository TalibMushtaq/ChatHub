type AttemptRecord = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: {
  maxAttempts: number;
  windowMs: number;
}) {
  const store = new Map<string, AttemptRecord>();
  const { maxAttempts, windowMs } = options;

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const record = store.get(ip);

    if (!record || now >= record.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }

    record.count += 1;
    if (record.count > maxAttempts) {
      return true;
    }
    return false;
  };
}
