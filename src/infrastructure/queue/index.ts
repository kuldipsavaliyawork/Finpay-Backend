import { config } from '../../config/config';
import { logger } from '../logger/logger';
import type { QueuePort } from './queue.port';
import { InMemoryQueue } from './in-memory.queue';
import { BullMqQueue } from './bullmq.queue';
import { mailer, type MailMessage } from '../mail/mailer';

export type { QueuePort, JobHandler, JobOptions } from './queue.port';
export { InMemoryQueue } from './in-memory.queue';
export { BullMqQueue } from './bullmq.queue';

/**
 * Pick a queue implementation based on configuration. BullMqQueue is only
 * constructed when a redisUrl is present.
 */
export function createQueue(): QueuePort {
  if (config.redisUrl) {
    logger.info('Queue: using BullMQ');
    return new BullMqQueue(config.redisUrl);
  }
  logger.info('Queue: using in-memory adapter');
  return new InMemoryQueue();
}

/** Singleton queue used across the app. */
export const queue: QueuePort = createQueue();

/** Example queue name every deployment registers. */
export const NOOP_QUEUE = 'noop';

/** Outbound transactional email jobs. */
export const EMAIL_QUEUE = 'email';

queue.process<{ at?: string }>(NOOP_QUEUE, async (data) => {
  logger.debug({ data }, 'noop job processed');
});

queue.process<MailMessage>(EMAIL_QUEUE, async (message) => {
  await mailer.send(message);
});
