import type { CaptureBindings } from '../env';
import { credentialContext, decryptPat } from '../auth/crypto';
import { QUIP_ORIGIN, QuipError, validatePat } from '../quip/client';
import { captureMessageSchema, DEAD_LETTER_QUEUE } from './model';
import { appendCaptureProgress, captureCredential, claimCapture, completeCapture, exhaustCapture, failCapture, readCaptureJob } from './store';

export default {
  async queue(batch: MessageBatch<unknown>, env: CaptureBindings) {
    for (const delivery of batch.messages) {
      const parsed = captureMessageSchema.safeParse(delivery.body);
      if (!parsed.success) { delivery.ack(); continue; }
      const message = parsed.data;
      try {
        if (batch.queue === DEAD_LETTER_QUEUE) {
          const job = await readCaptureJob(env.DB, message);
          if (job?.jobId === message.jobId && job.status === 'running' && job.leaseUntil !== null && job.leaseUntil > Date.now()) {
            delivery.retry({ delaySeconds: Math.ceil((job.leaseUntil - Date.now()) / 1000) + 1 });
            continue;
          }
          await exhaustCapture(env.DB, message);
          delivery.ack(); continue;
        }
        const lease = await claimCapture(env.DB, message);
        if (!lease) {
          const job = await readCaptureJob(env.DB, message);
          if (job?.jobId === message.jobId && job.status === 'running' && job.leaseUntil !== null) {
            delivery.retry({ delaySeconds: Math.max(1, Math.ceil((job.leaseUntil - Date.now()) / 1000) + 1) });
          } else delivery.ack();
          continue;
        }
        try {
          const credential = await captureCredential(env.DB, message.userId);
          if (!credential) { delivery.ack(); continue; }
          if (credential.quipOrigin !== QUIP_ORIGIN) throw new QuipError('This Quip API origin is not supported.', 422);
          const pat = await decryptPat(credential.encryptedPat, env.CREDENTIAL_ENCRYPTION_KEY,
            credentialContext(credential.quipOrigin, credential.quipUserId));
          if (!await appendCaptureProgress(env.DB, message, lease, 'Reading your Quip profile…')) { delivery.retry(); continue; }
          const identity = await validatePat(pat);
          if (identity.userId !== credential.quipUserId) throw new QuipError('The saved token belongs to a different Quip account. Replace it before capturing again.', 422);
          if (!await appendCaptureProgress(env.DB, message, lease, 'Saving your Quip profile…')) { delivery.retry(); continue; }
          if (await completeCapture(env.DB, message, lease, identity)) delivery.ack();
          else delivery.retry();
        } catch (error) {
          const retryable = !(error instanceof QuipError) || error.status !== 422;
          const failed = await failCapture(env.DB, message, lease,
            error instanceof QuipError ? error.message : 'Capture could not finish. Please try again.', retryable);
          if (retryable || !failed) delivery.retry();
          else delivery.ack();
        }
      } catch {
        // Let Queues redeliver infrastructure failures, then route exhausted messages to its dead-letter queue.
        delivery.retry();
      }
    }
  },
} satisfies ExportedHandler<CaptureBindings>;
