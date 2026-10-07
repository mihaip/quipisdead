import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { hc } from 'hono/client';
import type { InferResponseType } from 'hono/client';
import app from '../src/worker/index';
import type { AppType } from '../src/worker/index';
import type { Bindings } from '../src/worker/env';
import { credentialContext, decryptPat, encryptPat, hashSessionToken } from '../src/worker/auth/crypto';
import { SESSION_COOKIE } from '../src/worker/auth/session';
import { QUIP_ORIGIN } from '../src/worker/quip/client';

const origin = 'https://archive.example';
const pat = 'fixture-pat-a';
const replacement = 'fixture-pat-a-new';
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const identity = { id: 'quip-user-a', name: 'Sample Person', emails: ['sample@example.test'] };
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: 'export default { fetch() { return new Response("Test database") } }',
  compatibilityDate: '2026-10-06',
  d1Databases: { DB: 'auth-tests' },
}));
let env: Bindings;
let upstreamCalls: number;
let quipReply: (token: string) => Response | Promise<Response>;
const nativeFetch = globalThis.fetch;

before(async () => {
  env = { ...await mf.getBindings<Pick<Bindings, 'DB'>>(), CREDENTIAL_ENCRYPTION_KEY: secret };
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const statements = sql.split('--> statement-breakpoint').filter((statement) => statement.trim());
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  }
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM users').run();
  upstreamCalls = 0;
  quipReply = (token) => {
    if (token === pat || token === replacement) return Response.json(identity);
    if (token === 'fixture-other-account') return Response.json({ ...identity, id: 'quip-user-b' });
    return Response.json({ error: 'untrusted upstream body' }, { status: 401 });
  };
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(QUIP_ORIGIN)) return nativeFetch(input, init);
    assert.equal(url, `${QUIP_ORIGIN}/1/users/current`);
    assert.equal(init?.redirect, 'manual');
    assert.ok(init?.signal);
    upstreamCalls++;
    const authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return quipReply(authorization.replace(/^Bearer /, ''));
  });
});
afterEach(() => mock.restoreAll());
after(async () => { await mf.dispose(); });

function request(path: string, method = 'GET', cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`${origin}/api/auth/${path}`, {
    method,
    headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env);
}

function cookie(response: Response) {
  const value = response.headers.get('Set-Cookie');
  assert.ok(value);
  return value.split(';')[0];
}

type Session = InferResponseType<ReturnType<typeof hc<AppType>>['api']['auth']['session']['$get'], 200>;

async function readSession(response: Response): Promise<Session> {
  return JSON.parse(await response.text());
}

async function login(token = pat) {
  const response = await request('sign-in', 'POST', undefined, { pat: token });
  assert.equal(response.status, 200);
  const { user } = await readSession(response);
  assert.ok(user);
  return { cookie: cookie(response), user };
}

async function count(table: 'users' | 'credentials' | 'sessions') {
  return (await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count;
}

test('sign-in persists identity, encrypts PAT, hashes session, and returns a safe profile', async () => {
  const response = await request('sign-in', 'POST', undefined, { pat: `  ${pat}  ` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const setCookie = response.headers.get('Set-Cookie') ?? '';
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) assert.ok(setCookie.includes(flag));
  assert.ok(setCookie.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(!setCookie.includes('Domain='));
  const text = await response.text();
  assert.ok(!text.includes(pat));
  assert.ok(!text.includes('encrypted_pat'));
  const user = JSON.parse(text).user;
  assert.equal(user.quipUserId, identity.id);
  assert.equal(user.email, identity.emails[0]);
  assert.notEqual(user.id, identity.id);
  const credential = await env.DB.prepare('SELECT encrypted_pat FROM credentials WHERE user_id = ?').bind(user.id)
    .first<{ encrypted_pat: string }>();
  assert.ok(credential);
  assert.ok(!credential.encrypted_pat.includes(pat));
  assert.equal(await decryptPat(credential.encrypted_pat, secret, credentialContext(QUIP_ORIGIN, identity.id)), pat);
  const sessionToken = cookie(response).split('=')[1];
  assert.match(sessionToken, /^[A-Za-z0-9_-]{43}$/);
  const session = await env.DB.prepare('SELECT token_hash, expires_at FROM sessions').first<{ token_hash: string; expires_at: number }>();
  assert.ok(session);
  assert.equal(session.token_hash, await hashSessionToken(sessionToken));
  assert.ok(session.expires_at > Date.now());
  const reloaded = await request('session', 'GET', cookie(response));
  assert.equal(reloaded.headers.get('Set-Cookie'), null, 'profile reads cannot clear a newer cookie');
  assert.deepEqual((await readSession(reloaded)).user, user);
  assert.equal(upstreamCalls, 1, 'profile reload uses saved data, never Quip');
});

test('identity uses origin and Quip ID, allows shared emails, and survives email changes', async () => {
  const first = await login();
  quipReply = () => Response.json({ ...identity, emails: ['changed@example.test'] });
  const repeated = await login(replacement);
  assert.equal(repeated.user.id, first.user.id);
  assert.equal(repeated.user.email, 'changed@example.test');
  quipReply = () => Response.json({ ...identity, id: 'quip-user-b', emails: ['changed@example.test'] });
  const other = await login('fixture-other-account');
  assert.notEqual(other.user.id, first.user.id);
  assert.equal(await count('users'), 2);
});

test('current user without emails remains a valid account', async () => {
  quipReply = () => Response.json({ id: identity.id, name: identity.name });
  assert.equal((await login()).user.email, null);
});

test('invalid PAT and untrusted Quip failures do not create records or leak upstream data', async () => {
  for (const [upstreamStatus, expected] of [[401, 422], [403, 422], [429, 503], [503, 503], [500, 502], [302, 502]]) {
    quipReply = () => Response.json({ error: pat }, { status: upstreamStatus });
    const response = await request('sign-in', 'POST', undefined, { pat });
    assert.equal(response.status, expected);
    assert.ok(!(await response.text()).includes(pat));
    assert.equal(await count('users'), 0);
    assert.equal(await count('sessions'), 0);
  }
  for (const body of [{ id: 123, name: identity.name }, { name: identity.name }, { ...identity, emails: 'bad' }]) {
    quipReply = () => Response.json(body);
    assert.equal((await request('sign-in', 'POST', undefined, { pat })).status, 502);
  }
  quipReply = () => new Response('not JSON');
  assert.equal((await request('sign-in', 'POST', undefined, { pat })).status, 502);
  quipReply = () => { throw new Error(pat); };
  const offline = await request('sign-in', 'POST', undefined, { pat });
  assert.equal(offline.status, 502);
  assert.ok(!(await offline.text()).includes(pat));
});

test('runtime validation rejects malformed, oversized, and cross-origin requests before Quip', async () => {
  for (const body of [{}, { pat: 123 }, { pat: '' }, { pat: 'a\nb' }, { pat: 'x'.repeat(4097) }]) {
    assert.equal((await request('sign-in', 'POST', undefined, body)).status, 400);
  }
  assert.equal((await request('sign-in', 'POST', undefined, { pat: 'x'.repeat(9000) })).status, 413);
  const malformed = await app.request(`${origin}/api/auth/sign-in`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{',
  }, env);
  assert.equal(malformed.status, 400);
  assert.equal((await request('sign-in', 'POST', undefined, { pat }, { 'Content-Type': 'text/plain' })).status, 400);
  const rejectedHeaders: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }];
  for (const headers of rejectedHeaders) {
    assert.equal((await request('sign-in', 'POST', undefined, { pat }, headers)).status, 403);
    assert.equal((await request('sign-out', 'POST', undefined, undefined, headers)).status, 403);
    assert.equal((await request('account', 'DELETE', undefined, undefined, headers)).status, 403);
    assert.equal((await request('credential', 'PUT', undefined, { pat }, headers)).status, 403);
  }
  assert.equal(upstreamCalls, 0);
  assert.equal(await count('users'), 0);
});

test('sign-out revokes only the current session, retaining account, credential, and other sessions', async () => {
  const first = await login();
  const second = await login();
  assert.notEqual(first.cookie, second.cookie);
  assert.equal(await count('sessions'), 2);
  const response = await request('sign-out', 'POST', first.cookie);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('Set-Cookie')?.includes('Max-Age=0'));
  assert.equal((await readSession(await request('session', 'GET', first.cookie))).user, null);
  assert.equal((await readSession(await request('session', 'GET', second.cookie))).user?.id, first.user.id);
  assert.equal(await count('sessions'), 1);
  assert.equal(await count('credentials'), 1);
  assert.equal(await count('users'), 1);
  assert.equal((await request('credential', 'PUT', first.cookie, { pat: replacement })).status, 401);
});

test('expiration is enforced during reads and mutations even while the session row exists', async () => {
  const first = await login();
  await env.DB.prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() - 1).run();
  assert.equal(await count('sessions'), 1);
  assert.equal((await readSession(await request('session', 'GET', first.cookie))).user, null);
  assert.equal((await request('credential', 'PUT', first.cookie, { pat: replacement })).status, 401);
  assert.equal((await request('account', 'DELETE', first.cookie)).status, 401);
  assert.equal(await count('users'), 1, 'expired session cannot delete an account');
  assert.equal(upstreamCalls, 1);
  const next = await login();
  assert.equal(await count('sessions'), 1, 'next sign-in cleans expired sessions');
  assert.notEqual(next.cookie, first.cookie);
});

test('replacement accepts the same identity, rejects another identity and invalid PAT, and preserves session', async () => {
  const first = await login();
  const before = await env.DB.prepare('SELECT encrypted_pat FROM credentials').first<{ encrypted_pat: string }>();
  assert.equal((await request('credential', 'PUT', first.cookie, { pat: 'fixture-other-account' })).status, 409);
  assert.equal((await request('credential', 'PUT', first.cookie, { pat: 'invalid' })).status, 422);
  assert.deepEqual(await env.DB.prepare('SELECT encrypted_pat FROM credentials').first(), before);
  const response = await request('credential', 'PUT', first.cookie, { pat: replacement });
  assert.equal(response.status, 200);
  assert.equal((await readSession(response)).user?.id, first.user.id);
  const saved = await env.DB.prepare('SELECT encrypted_pat FROM credentials').first<{ encrypted_pat: string }>();
  assert.ok(saved);
  assert.equal(await decryptPat(saved.encrypted_pat, secret, credentialContext(QUIP_ORIGIN, identity.id)), replacement);
  assert.equal(await count('sessions'), 1);
  assert.equal((await request('sign-in', 'POST', first.cookie, { pat: 'fixture-other-account' })).status, 409);
});

test('account deletion atomically removes all owned records and leaves other accounts intact', async () => {
  const first = await login();
  const second = await login();
  const other = await login('fixture-other-account');
  const response = await request('account', 'DELETE', first.cookie);
  assert.equal(response.status, 200);
  assert.equal(await count('users'), 1);
  assert.equal(await count('credentials'), 1);
  assert.equal(await count('sessions'), 1);
  for (const session of [first, second]) {
    assert.equal((await readSession(await request('session', 'GET', session.cookie))).user, null);
    assert.equal((await request('credential', 'PUT', session.cookie, { pat: replacement })).status, 401);
  }
  assert.equal((await readSession(await request('session', 'GET', other.cookie))).user?.id, other.user.id);
  const recreated = await login();
  assert.notEqual(recreated.user.id, first.user.id);
});

test('replacement cannot write after sign-out or deletion while Quip validation is in flight', async () => {
  for (const action of ['sign-out', 'account']) {
    const first = await login();
    const before = await env.DB.prepare('SELECT encrypted_pat FROM credentials WHERE user_id = ?').bind(first.user.id).first();
    quipReply = async () => {
      await request(action, action === 'account' ? 'DELETE' : 'POST', first.cookie);
      return Response.json(identity);
    };
    assert.equal((await request('credential', 'PUT', first.cookie, { pat: replacement })).status, 401);
    if (action === 'account') {
      assert.equal(await count('credentials'), 0);
      assert.equal(await count('users'), 0);
    } else {
      assert.deepEqual(await env.DB.prepare('SELECT encrypted_pat FROM credentials WHERE user_id = ?').bind(first.user.id).first(), before);
    }
    quipReply = () => Response.json(identity);
  }
});

test('credential encryption uses distinct nonces and authenticates identity and ciphertext', async () => {
  const context = credentialContext(QUIP_ORIGIN, identity.id);
  const first = await encryptPat(pat, secret, context);
  assert.notEqual(await encryptPat(pat, secret, context), first);
  assert.equal(await decryptPat(first, secret, context), pat);
  await assert.rejects(decryptPat(first, secret, credentialContext(QUIP_ORIGIN, 'other')));
  const [version, iv, ciphertext] = first.split('.');
  const changed = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
  await assert.rejects(decryptPat(`${version}.${iv}.${changed}`, secret, context));
  await assert.rejects(encryptPat(pat, 'bad-key', context));
});

test('failed multi-statement sign-in rolls back account and credential writes', async () => {
  await env.DB.prepare(`CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'test failure'); END`).run();
  try {
    mock.method(console, 'error', () => undefined);
    const response = await request('sign-in', 'POST', undefined, { pat });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes(pat));
    assert.equal(await count('users'), 0);
    assert.equal(await count('credentials'), 0);
    assert.equal(await count('sessions'), 0);
  } finally {
    await env.DB.prepare('DROP TRIGGER fail_session').run();
  }
});
