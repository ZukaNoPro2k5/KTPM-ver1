import { createClient, RedisClientType } from 'redis';

class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.isConnected = true;
    });

    this.connect();
  }

  private async connect() {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
  }

  public async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`Error getting key ${key} from Redis:`, error);
      return null;
    }
  }

  public async set(key: string, value: string, ttlSeconds: number = 3600): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.set(key, value, {
        EX: ttlSeconds
      });
    } catch (error) {
      console.error(`Error setting key ${key} in Redis:`, error);
    }
  }

  public async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`Error deleting key ${key} from Redis:`, error);
    }
  }
  
  public async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error(`Error deleting pattern ${pattern} from Redis:`, error);
    }
  }
}

export const cacheService = new CacheService();
