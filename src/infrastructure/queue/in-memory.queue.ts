import type { JobHandler, JobOptions, QueuePort } from './queue.port';
import { logger } from '../logger/logger';

/**
 * In-process queue. Jobs are executed asynchronously (next tick / after delay)
 * with best-effort retries. Not durable — intended for dev/test where no Redis
 * is available. Handlers registered after an enqueue still run for later jobs.
 */
export class InMemoryQueue implements QueuePort {
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private readonly timers = new Set<NodeJS.Timeout>();

  async enqueue<T>(name: string, data: T, opts?: JobOptions): Promise<void> {
    const delay = opts?.delayMs ?? 0;
    const attempts = opts?.attempts ?? 1;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void this.run(name, data, attempts);
    }, delay);
    this.timers.add(timer);
  }

  process<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  private async run(name: string, data: unknown, attemptsLeft: number): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      logger.warn({ queue: name }, 'InMemoryQueue: no handler registered, dropping job');
      return;
    }
    try {
      await handler(data);
    } catch (err) {
      if (attemptsLeft > 1) {
        logger.warn({ queue: name, err }, 'InMemoryQueue: job failed, retrying');
        await this.run(name, data, attemptsLeft - 1);
      } else {
        logger.error({ queue: name, err }, 'InMemoryQueue: job failed permanently');
      }
    }
  }

  async close(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
