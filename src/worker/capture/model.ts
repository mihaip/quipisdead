import { z } from 'zod';
import type { captureJobs } from '../db/schema';

export const captureMessageSchema = z.object({ userId: z.string().uuid(), jobId: z.string().uuid() });
export type CaptureMessage = z.infer<typeof captureMessageSchema>;
export type CaptureJob = typeof captureJobs.$inferSelect;

// The Queue owns retry counts and scheduling. This lease only fences overlapping deliveries.
export const LEASE_MS = 60_000;
export const DEAD_LETTER_QUEUE = 'quipisdead-capture-failed';

export function publicJob(job: CaptureJob | null) {
  if (!job) return null;
  const { jobId, status, attempts, createdAt, updatedAt, error } = job;
  return { jobId, status, attempts, createdAt, updatedAt, error };
}
