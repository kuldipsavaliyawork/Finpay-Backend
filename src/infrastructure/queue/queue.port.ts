/**
 * QueuePort — job/queue abstraction. Backed by BullMQ when REDIS_URL is set,
 * otherwise an in-memory adapter that runs handlers asynchronously in-process.
 */
export interface JobOptions {
  /** Delay before the job becomes available, in milliseconds. */
  delayMs?: number;
  /** Number of retry attempts on failure. */
  attempts?: number;
  /** Optional dedupe/job id. */
  jobId?: string;
}

export type JobHandler<T = unknown> = (data: T) => Promise<void>;

export interface QueuePort {
  /** Enqueue a job on the named queue. */
  enqueue<T>(name: string, data: T, opts?: JobOptions): Promise<void>;
  /** Register a handler for the named queue. */
  process<T>(name: string, handler: JobHandler<T>): void;
  /** Optional close hook for graceful shutdown. */
  close?(): Promise<void>;
}
