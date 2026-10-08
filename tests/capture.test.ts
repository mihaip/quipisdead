import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import type { InferResponseType } from 'hono/client';
import { hc } from 'hono/client';
import type { AppType } from '../src/worker/index';
import type { CaptureJob, CaptureMessage } from '../src/worker/capture/model';
import { hashSessionToken } from '../src/worker/auth/crypto';

const origin = 'https://archive.example';
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const signedInProfile = { id: 'quip-a', name: 'Sign-in name', emails: ['sign-in@example.test'] };
let mf: Miniflare;
let db: D1Database;
let upstreamCalls = 0;
let upstream: () => Response | Promise<Response> = () => Response.json(signedInProfile);

type Client = ReturnType<typeof hc<AppType>>;
type Capture = InferResponseType<Client['api']['capture']['$get'], 200>;
type Session = InferResponseType<Client['api']['auth']['session']['$get'], 200>;

before(async () => {
  const bundles = await Promise.all(['tests/capture-harness.ts', 'src/worker/capture/worker.ts'].map(async (entry) => {
    const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser',
      external: ['cloudflare:workers'], target: 'es2023' });
    return result.outputFiles[0].text;
  }));
  const shared = { modules: true, compatibilityDate: '2026-10-06', d1Databases: { DB: 'capture-tests' },
    bindings: { CREDENTIAL_ENCRYPTION_KEY: secret },
    outboundService: async (request: Request) => {
      assert.equal(request.url, 'https://platform.quip.com/1/users/current');
      assert.match(request.headers.get('Authorization') ?? '', /^Bearer fixture-/);
      upstreamCalls++;
      return upstream();
    } };
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [
    { ...shared, name: 'api', script: bundles[0], queueProducers: { CAPTURE_QUEUE: 'capture' } },
    { ...shared, name: 'capture', script: bundles[1], queueConsumers: {
      capture: { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 3, retryDelay: 1, deadLetterQueue: 'quipisdead-capture-failed' },
      'quipisdead-capture-failed': { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 10, retryDelay: 1 },
    } },
  ] }));
  db = await mf.getD1Database('DB', 'api');
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    const statements = (await readFile(new URL(name, directory), 'utf8')).split('--> statement-breakpoint').filter((s) => s.trim());
    await db.batch(statements.map((s) => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });

async function request(path: string, method = 'GET', cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  return mf.dispatchFetch(`${origin}${path}`, { method,
    headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function control(action: string, userId: string, fields: object = {}) {
  return request(`/test/${action}`, 'POST', undefined, { userId, ...fields });
}
async function state(userId: string): Promise<CaptureJob> {
  return JSON.parse(await (await control('read', userId)).text());
}
async function login(id: string = crypto.randomUUID()) {
  upstream = () => Response.json({ ...signedInProfile, id });
  const response = await request('/api/auth/sign-in', 'POST', undefined, { pat: 'fixture-pat' });
  assert.equal(response.status, 200);
  const session: Session = JSON.parse(await response.text());
  assert.ok(session.user);
  const cookie = response.headers.get('Set-Cookie')?.split(';')[0];
  assert.ok(cookie);
  return { user: session.user, cookie };
}
async function capture(cookie: string): Promise<Capture> {
  const response = await request('/api/capture', 'GET', cookie);
  assert.equal(response.status, 200);
  return JSON.parse(await response.text());
}
async function until(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for background work');
    await delay(20);
  }
}
async function start(cookie: string) {
  const response = await request('/api/capture', 'POST', cookie);
  assert.equal(response.status, 202);
  return response.json() as Promise<{ job: NonNullable<Capture['job']> }>;
}
function message(job: CaptureJob): CaptureMessage {
  return { userId: job.userId, jobId: job.jobId };
}

test('real Queue -> capture Worker -> fresh Quip read -> atomic D1 result and completion; reload, isolation, duplicates', async () => {
  const account = await login();
  const other = await login();
  const before = upstreamCalls;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  upstream = async () => { await gate; return Response.json({ id: account.user.quipUserId, name: 'Fresh capture name', emails: ['fresh@example.test'] }); };
  const starts = await Promise.all([start(account.cookie), start(account.cookie)]);
  assert.equal(starts[0].job.jobId, starts[1].job.jobId, 'concurrent starts share one active job');
  await until(async () => (await capture(account.cookie)).job?.status === 'running');
  const running = await state(account.user.id);
  assert.equal((await control('claim', account.user.id, { message: message(running) })).status, 200);
  assert.equal(await (await control('claim', account.user.id, { message: message(running) })).json(), null);
  await control('send', account.user.id, { message: message(running) });
  release();
  await until(async () => (await capture(account.cookie)).job?.status === 'completed');
  const saved = await capture(account.cookie);
  assert.equal(saved.result?.name, 'Fresh capture name');
  assert.equal(saved.result?.email, 'fresh@example.test');
  assert.equal(saved.progress?.jobId, saved.job?.jobId);
  assert.equal(saved.progress?.message, 'Profile capture completed.');
  const events = await db.prepare('SELECT message FROM capture_job_progress WHERE job_id = ? ORDER BY id').bind(saved.job?.jobId).all();
  assert.deepEqual(events.results.map(event => event.message), ['Capture queued.', 'Preparing profile capture…',
    'Reading your Quip profile…', 'Saving your Quip profile…', 'Profile capture completed.']);
  assert.equal(upstreamCalls - before, 1, 'duplicate delivery performs no extra source read');
  assert.deepEqual(await capture(account.cookie), saved, 'reload reads persisted data');
  assert.deepEqual(await capture(other.cookie), { job: null, progress: null, result: null });
  await control('send', account.user.id, { message: message(running) });
  await delay(50);
  assert.equal(upstreamCalls - before, 1);
  assert.equal((await request('/api/capture')).status, 401);
  assert.equal((await request('/api/capture', 'POST', account.cookie, undefined, { Origin: 'https://evil.example' })).status, 403);
  const token = account.cookie.split('=')[1];
  await db.prepare('UPDATE sessions SET expires_at = 0 WHERE token_hash = ?').bind(await hashSessionToken(token)).run();
  assert.equal((await request('/api/capture', 'POST', account.cookie)).status, 401);
  assert.equal((await request('/api/capture', 'GET', account.cookie)).status, 401);
});

test('permanent jobs retain their event history; polling returns only the newest job and latest event', async (t) => {
  const account = await login();
  upstream = () => Response.json({ id: account.user.quipUserId, name: 'First capture' });
  const first = await start(account.cookie);
  await until(async () => (await capture(account.cookie)).job?.status === 'completed');
  const firstRow = await state(account.user.id);
  const firstEvents = await db.prepare('SELECT * FROM capture_job_progress WHERE job_id = ? ORDER BY id').bind(firstRow.jobId).all();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  t.after(() => release());
  upstream = async () => { await gate; return Response.json({ id: account.user.quipUserId, name: 'Second capture' }); };
  const second = await start(account.cookie);
  assert.notEqual(second.job.jobId, first.job.jobId);
  await until(async () => (await capture(account.cookie)).progress?.message === 'Reading your Quip profile…');
  const running = await state(account.user.id);
  for (const text of ['Captured 2 documents.', 'Captured 3 documents.']) {
    assert.equal(await (await control('progress', account.user.id, { message: message(running), lease: running.lease, text })).json(), true);
  }
  assert.deepEqual(await state(account.user.id), running, 'appending progress does not modify the job row');
  // Neither job selection nor progress ordering relies on timestamp uniqueness.
  await db.prepare('UPDATE capture_jobs SET created_at = 42 WHERE user_id = ?').bind(account.user.id).run();
  await db.prepare('UPDATE capture_job_progress SET created_at = 42 WHERE job_id = ?').bind(running.jobId).run();
  const polled = await capture(account.cookie);
  assert.equal(polled.job?.jobId, second.job.jobId);
  assert.equal(polled.progress?.jobId, second.job.jobId);
  assert.equal(polled.progress?.message, 'Captured 3 documents.');
  assert.equal(polled.result?.name, 'First capture', 'the previous successful result remains visible');
  assert.deepEqual((await db.prepare('SELECT * FROM capture_job_progress WHERE job_id = ? ORDER BY id').bind(firstRow.jobId).all()).results, firstEvents.results);
  assert.equal(await db.prepare('SELECT status FROM capture_jobs WHERE job_id = ?').bind(firstRow.jobId).first('status'), 'completed');
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_jobs WHERE user_id = ?').bind(account.user.id).first('n'), 2);
  await assert.rejects(db.prepare(`INSERT INTO capture_jobs (user_id, job_id, status, attempts, created_at, updated_at)
    VALUES (?, ?, 'queued', 0, 0, 0)`).bind(account.user.id, crypto.randomUUID()).run(), /UNIQUE/);
  assert.equal(await (await control('progress', account.user.id, { message: message(firstRow), lease: running.lease,
    text: 'Must not overwrite progress for a completed job.' })).json(), false);
  release();
  await until(async () => (await capture(account.cookie)).job?.status === 'completed');
  const completed = await capture(account.cookie);
  assert.equal(completed.progress?.message, 'Profile capture completed.');
  assert.equal(completed.result?.name, 'Second capture');
  const eventCount = await db.prepare('SELECT COUNT(*) AS n FROM capture_job_progress WHERE job_id IN (SELECT job_id FROM capture_jobs WHERE user_id = ?)').bind(account.user.id).first('n');
  assert.ok(typeof eventCount === 'number' && eventCount > 5);
  assert.equal((await request('/api/auth/account', 'DELETE', account.cookie)).status, 200);
  for (const job of [firstRow, running]) {
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_job_progress WHERE job_id = ?').bind(job.jobId).first('n'), 0);
  }
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_jobs WHERE user_id = ?').bind(account.user.id).first('n'), 0);
});

test('transient source failure uses native Queue redelivery without changing the job or message', async () => {
  const account = await login();
  let calls = 0;
  upstream = () => ++calls === 1 ? Response.json({ secret: 'upstream-body' }, { status: 503 })
    : Response.json({ id: account.user.quipUserId, name: 'Recovered' });
  const started = await start(account.cookie);
  await until(async () => (await capture(account.cookie)).job?.status === 'completed', 8000);
  assert.equal(calls, 2);
  const saved = await capture(account.cookie);
  assert.equal(saved.job?.jobId, started.job.jobId);
  assert.equal(saved.job?.attempts, 2);
  assert.equal(saved.result?.name, 'Recovered');
  const events = await db.prepare('SELECT message FROM capture_job_progress WHERE job_id = ? ORDER BY id').bind(started.job.jobId).all();
  assert.ok(events.results.some(event => typeof event.message === 'string' && event.message.includes('Retrying automatically')));
  assert.equal(saved.progress?.message, 'Profile capture completed.');
});

test('terminal token errors, identity mismatch, and bounded repeated transient failure preserve last result', async () => {
  const account = await login();
  upstream = () => Response.json({ id: account.user.quipUserId, name: 'Previous success' });
  await start(account.cookie);
  await until(async () => (await capture(account.cookie)).job?.status === 'completed');
  upstream = () => Response.json({ unsafe: 'secret' }, { status: 401 });
  await start(account.cookie);
  await until(async () => (await capture(account.cookie)).job?.status === 'failed');
  assert.equal((await capture(account.cookie)).job?.attempts, 1);
  assert.equal((await capture(account.cookie)).result?.name, 'Previous success');
  upstream = () => Response.json({ ...signedInProfile, id: 'different' });
  await start(account.cookie);
  await until(async () => (await capture(account.cookie)).job?.status === 'failed');
  assert.match((await capture(account.cookie)).job?.error ?? '', /different Quip account/);
  let calls = 0;
  upstream = () => { calls++; return new Response(null, { status: 503 }); };
  await start(account.cookie);
  await until(async () => (await capture(account.cookie)).job?.status === 'failed', 10_000);
  const failed = await capture(account.cookie);
  assert.equal(failed.job?.status, 'failed');
  assert.equal(failed.progress?.message, failed.job?.error);
  assert.equal(calls, 4);
  assert.equal(failed.job?.attempts, 4);
  assert.match(failed.job?.error ?? '', /delivery attempts/, 'the native dead-letter consumer records exhaustion');
  assert.ok(!JSON.stringify(failed).includes('secret'));
});

test('infrastructure failures exhaust native deliveries and reach the dead-letter consumer', async () => {
  const account = await login();
  const before = upstreamCalls;
  await db.prepare(`CREATE TRIGGER fail_capture_claim BEFORE UPDATE OF status ON capture_jobs
    WHEN NEW.status = 'running' BEGIN SELECT RAISE(ABORT, 'fixture D1 failure'); END`).run();
  try {
    await start(account.cookie);
    await until(async () => (await capture(account.cookie)).job?.status === 'failed', 10_000);
    const failed = await capture(account.cookie);
    assert.equal(failed.job?.attempts, 0);
    assert.match(failed.job?.error ?? '', /delivery attempts/);
    assert.equal(upstreamCalls, before, 'no source work ran while claims could not persist');
  } finally { await db.prepare('DROP TRIGGER fail_capture_claim').run(); }
});

test('pending D1 intent survives a dispatch outage and scheduled recovery sends it without browser polling', async () => {
  const account = await login();
  const before = upstreamCalls;
  upstream = () => Response.json({ id: account.user.quipUserId, name: 'Recovered dispatch' });
  await control('dispatch-outage', account.user.id);
  await start(account.cookie);
  const pending = await state(account.user.id);
  assert.equal(pending.status, 'queued');
  assert.equal(pending.attempts, 0);
  assert.equal(pending.dispatchedAt, null);
  assert.match(pending.error ?? '', /queue/);
  assert.equal(upstreamCalls, before);
  await control('recover', account.user.id);
  await until(async () => (await state(account.user.id)).status === 'completed');
  assert.equal((await capture(account.cookie)).result?.name, 'Recovered dispatch');
  assert.ok((await state(account.user.id)).dispatchedAt);
});

test('expired attempts are fenced and native redelivery recovers an interrupted consumer', async () => {
  const account = await login();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  upstream = async () => { await gate; return Response.json({ id: account.user.quipUserId, name: 'Recovered attempt' }); };
  await start(account.cookie);
  await until(async () => (await state(account.user.id)).status === 'running');
  const old = await state(account.user.id);
  await db.prepare('UPDATE capture_jobs SET lease_until = 0 WHERE user_id = ?').bind(account.user.id).run();
  assert.equal(await (await control('progress', account.user.id, { message: message(old), lease: old.lease, text: 'Expired progress' })).json(), false);
  const freshLease = await (await control('claim', account.user.id, { message: message(old) })).json();
  assert.ok(freshLease);
  assert.equal(await (await control('progress', account.user.id, { message: message(old), lease: old.lease, text: 'Stale progress' })).json(), false);
  assert.equal(await (await control('progress', account.user.id, { message: { ...message(old), userId: crypto.randomUUID() }, lease: freshLease, text: 'Wrong account' })).json(), false);
  await control('complete', account.user.id, { message: message(old), lease: old.lease,
    identity: { origin: account.user.quipOrigin, userId: account.user.quipUserId, name: 'Stale attempt', email: null } });
  assert.equal((await capture(account.cookie)).result, null);
  // The consumer that acquired this lease disappears before completing. Queues redelivers.
  await db.prepare('UPDATE capture_jobs SET lease_until = 0 WHERE user_id = ?').bind(account.user.id).run();
  release();
  await until(async () => (await capture(account.cookie)).job?.status === 'completed', 8000);
  assert.equal((await capture(account.cookie)).result?.name, 'Recovered attempt');
});

test('D1 rolls back the result if completion status cannot commit, then native retries recover', async () => {
  const account = await login();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  upstream = async () => { await gate; return Response.json({ id: account.user.quipUserId, name: 'Atomic completion' }); };
  await db.prepare(`CREATE TRIGGER fail_capture_completion BEFORE UPDATE OF status ON capture_jobs
    WHEN NEW.status = 'completed' BEGIN SELECT RAISE(ABORT, 'fixture completion failure'); END`).run();
  try {
    await start(account.cookie);
    await until(async () => (await state(account.user.id)).status === 'running');
    release();
    await until(async () => (await state(account.user.id)).error !== null);
    assert.equal((await capture(account.cookie)).result, null, 'profile insert rolled back with failed status update');
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM capture_job_progress WHERE job_id = ? AND message = 'Profile capture completed.'").bind((await state(account.user.id)).jobId).first('n'), 0, 'completion progress rolled back too');
  } finally { await db.prepare('DROP TRIGGER fail_capture_completion').run(); release(); }
  await until(async () => (await capture(account.cookie)).job?.status === 'completed', 8000);
  assert.equal((await capture(account.cookie)).result?.name, 'Atomic completion');
});

test('sign-out does not stop capture; deletion during Quip read or after completion prevents late results', async () => {
  const account = await login();
  let release!: () => void;
  let gate = new Promise<void>((resolve) => { release = resolve; });
  upstream = async () => { await gate; return Response.json({ id: account.user.quipUserId, name: 'Signed out capture' }); };
  await start(account.cookie);
  await until(async () => (await state(account.user.id)).status === 'running');
  assert.equal((await request('/api/auth/sign-out', 'POST', account.cookie)).status, 200);
  release();
  await until(async () => (await state(account.user.id)).status === 'completed');
  assert.equal((await request('/api/capture', 'GET', account.cookie)).status, 401);
  const returning = await login(account.user.quipUserId);
  assert.equal((await capture(returning.cookie)).result?.name, 'Signed out capture');
  assert.equal((await request('/api/auth/account', 'DELETE', returning.cookie)).status, 200);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_results WHERE user_id = ?').bind(account.user.id).first('n'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_jobs WHERE user_id = ?').bind(account.user.id).first('n'), 0);
  const deleted = await login();
  gate = new Promise<void>((resolve) => { release = resolve; });
  upstream = async () => { await gate; return Response.json({ id: deleted.user.quipUserId, name: 'Late result' }); };
  await start(deleted.cookie);
  await until(async () => (await state(deleted.user.id)).status === 'running');
  const running = await state(deleted.user.id);
  assert.equal((await request('/api/auth/account', 'DELETE', deleted.cookie)).status, 200);
  release();
  await control('send', deleted.user.id, { message: message(running) });
  assert.equal(await (await control('progress', deleted.user.id, { message: message(running), lease: running.lease, text: 'Late progress' })).json(), false);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_job_progress WHERE job_id = ?').bind(running.jobId).first('n'), 0);
  await delay(100);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM capture_results WHERE user_id = ?').bind(deleted.user.id).first('n'), 0);
  const fresh = await login(deleted.user.quipUserId);
  assert.notEqual(fresh.user.id, deleted.user.id);
  assert.deepEqual(await capture(fresh.cookie), { job: null, progress: null, result: null });
});
