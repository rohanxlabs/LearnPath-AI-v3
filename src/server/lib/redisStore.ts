/**
 * Redis rate-limit store adapter for `express-rate-limit`.
 *
 * Uses the Upstash REST client (`@upstash/redis`) when a REDIS_URL is set.
 * Falls back gracefully if the package isn't installed — the caller catches
 * the import error and stays on the in-memory store.
 *
 * Compatible with express-rate-limit v6/v7/v8 store interface.
 */
export default class RedisStore {
  private redis: any;
  private prefix: string;
  private windowMs: number;

  private constructor(redis: any, windowMs: number, prefix: string) {
    this.redis = redis;
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  static async create(rawRedisUrl: string, opts: { windowMs?: number; prefix?: string } = {}): Promise<RedisStore> {
    const { Redis } = await import('@upstash/redis');

    // Strip accidental surrounding quotes or a "REDIS_URL=" prefix that can
    // appear when the env var value is pasted incorrectly in Render's dashboard.
    let redisUrl = rawRedisUrl.trim().replace(/^["']|["']$/g, '').replace(/^REDIS_URL=/i, '');

    // @upstash/redis is a REST client — it requires an https:// URL, not a raw
    // rediss:// connection string.  Convert automatically so both formats work.
    if (redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://')) {
      try {
        const parsed = new URL(redisUrl);
        // token is the password portion of the connection string
        const token = parsed.password || process.env.REDIS_TOKEN || '';
        redisUrl = `https://${parsed.hostname}`;
        process.env.REDIS_TOKEN = process.env.REDIS_TOKEN || token;
      } catch {
        // malformed URL — let @upstash/redis reject it with a clear error
      }
    }

    const redis = new Redis({ url: redisUrl, token: process.env.REDIS_TOKEN || '' });
    return new RedisStore(redis, opts.windowMs ?? 60_000, opts.prefix ?? 'rl:');
  }

  // express-rate-limit v7 store interface
  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const k = `${this.prefix}${key}`;
    const ttlSecs = Math.ceil(this.windowMs / 1000);
    const pipeline = this.redis.pipeline();
    pipeline.incr(k);
    pipeline.expire(k, ttlSecs, 'NX'); // only set TTL on first increment
    const [totalHits] = await pipeline.exec() as [number, any];
    const resetTime = new Date(Date.now() + this.windowMs);
    return { totalHits: totalHits ?? 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await this.redis.decr(`${this.prefix}${key}`).catch(() => {});
  }

  async resetKey(key: string): Promise<void> {
    await this.redis.del(`${this.prefix}${key}`).catch(() => {});
  }

  /**
   * Return a new RedisStore that shares this instance's underlying Redis
   * connection but uses a different key prefix.  Each express-rate-limit
   * instance must have its own store object (v8 enforces this via
   * ERR_ERL_STORE_REUSE), so call withPrefix() to create one store per
   * limiter without opening extra Redis connections.
   */
  withPrefix(newPrefix: string): RedisStore {
    return new RedisStore(this.redis, this.windowMs, newPrefix);
  }
}
