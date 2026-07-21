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

  static async create(redisUrl: string, opts: { windowMs?: number; prefix?: string } = {}): Promise<RedisStore> {
    const { Redis } = await import('@upstash/redis');
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
}
