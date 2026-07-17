import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { JobHandler, JobOptions, QueuePort } from './queue.port';
import { logger } from '../logger/logger';

/**
 * BullMQ-backed queue. One Queue + one Worker per queue name, sharing a single
 * Redis connection config. Only constructed when config.redisUrl is set.
 */
export class BullMqQueue implements QueuePort {
  private readonly connection: ConnectionOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor(redisUrl: string) {
    const url = new URL(redisUrl);
    this.connection = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      ...(url.password ? { password: url.password } : {}),
      ...(url.username ? { username: url.username } : {}),
    };
  }

  private getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue<T>(name: string, data: T, opts?: JobOptions): Promise<void> {
    await this.getQueue(name).add(name, data, {
      delay: opts?.delayMs,
      attempts: opts?.attempts ?? 1,
      jobId: opts?.jobId,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  process<T>(name: string, handler: JobHandler<T>): void {
    if (this.workers.has(name)) return;
    const worker = new Worker(
      name,
      async (job) => {
        await handler(job.data as T);
      },
      { connection: this.connection },
    );
    worker.on('failed', (job, err) =>
      logger.error({ queue: name, jobId: job?.id, err }, 'BullMQ job failed'),
    );
    this.workers.set(name, worker);
  }

  async close(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
