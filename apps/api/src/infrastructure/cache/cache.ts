import { Redis } from "ioredis";
import { env } from "../../config/env.js";

type CacheRecord = {
  value: string;
  expiresAt: number;
};

class CacheClient {
  private redis: Redis | null = this.createRedis();
  private memory = new Map<string, CacheRecord>();
  private redisReady = false;

  private createRedis() {
    if (!env.REDIS_URL) {
      return null;
    }

    const redis = new Redis(env.REDIS_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    redis.on("error", () => {
      // Redis is optional in local development; failed connections fall back to memory cache.
    });
    return redis;
  }

  private disableRedis() {
    this.redisReady = false;
    this.redis?.disconnect();
    this.redis = null;
  }

  async get<T>(key: string) {
    if (this.redis) {
      try {
        if (!this.redisReady) {
          await this.redis.connect();
          this.redisReady = true;
        }
        const cached = await this.redis.get(key);
        return cached ? (JSON.parse(cached) as T) : null;
      } catch {
        this.disableRedis();
      }
    }

    const cached = this.memory.get(key);
    if (!cached || cached.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(cached.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number) {
    const serialized = JSON.stringify(value);
    if (this.redis) {
      try {
        if (!this.redisReady) {
          await this.redis.connect();
          this.redisReady = true;
        }
        await this.redis.set(key, serialized, "EX", ttlSeconds);
        return;
      } catch {
        this.disableRedis();
      }
    }

    this.memory.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }
}

export const cache = new CacheClient();
