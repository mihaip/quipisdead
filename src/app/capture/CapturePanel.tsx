import { useCapture } from './useCapture';

type Props = { userId: string; onSessionExpired: (error: Error) => Promise<void> };

export default function CapturePanel({ userId, onSessionExpired }: Props) {
  const { capture, start } = useCapture(userId, onSessionExpired);
  const job = capture.data?.job;
  const progress = capture.data?.progress;
  const result = capture.data?.result;
  const active = job?.status === 'queued' || job?.status === 'running';
  return (
    <section className="card">
      <h2>Capture your Quip profile</h2>
      <p>Save a fresh copy of your current Quip profile. Capture continues if you close this page or sign out.</p>
      <button disabled={start.isPending || active || capture.isPending || capture.isError} onClick={() => start.mutate()}>
        {start.isPending ? 'Starting…' : active ? 'Capture in progress…' : result ? 'Capture again' : 'Start profile capture'}
      </button>
      {capture.isPending && <p role="status">Checking capture status…</p>}
      {job && <p role="status">Capture {job.status}{job.attempts > 0 ? ` · ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}` : ''}</p>}
      {progress && <p role="status">{progress.message}</p>}
      {(start.error || capture.error || job?.error) && <p className="error" role="alert">{start.error?.message ?? capture.error?.message ?? job?.error}</p>}
      {capture.isError && <button className="secondary" onClick={() => void capture.refetch()}>Check again</button>}
      {result && <>
        <h3>Captured profile</h3>
        <dl>
          <div><dt>Name</dt><dd>{result.name}</dd></div>
          <div><dt>Email</dt><dd>{result.email ?? 'No email returned'}</dd></div>
          <div><dt>Quip user ID</dt><dd>{result.quipUserId}</dd></div>
          <div><dt>Captured</dt><dd>{new Date(result.capturedAt).toLocaleString()}</dd></div>
        </dl>
      </>}
      <p className="help">This first capture saves only your profile. Documents, threads, files, and downloadable archives are coming later. Your latest successful profile stays available until you delete your app account.</p>
    </section>
  );
}
