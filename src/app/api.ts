import { hc, parseResponse } from 'hono/client';
import type { ClientResponse } from 'hono/client';
import type { StatusCode } from 'hono/utils/http-status';
import type { AppType } from '../worker';

const client = hc<AppType>(window.location.origin);

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function readResponse<T extends ClientResponse<{ error: string } | object, StatusCode, 'json'>>(
  request: Promise<T>,
) {
  const response = await request;
  if (!response.ok) {
    const body = await response.json();
    throw new ApiError('error' in body ? body.error : 'The app could not complete this request.', response.status);
  }
  return parseResponse(response);
}

export const getSession = (signal: AbortSignal) =>
  readResponse(client.api.auth.session.$get({}, { init: { signal } }));
export const signIn = (pat: string) =>
  readResponse(client.api.auth['sign-in'].$post({ json: { pat } }));
export const replacePat = (pat: string) =>
  readResponse(client.api.auth.credential.$put({ json: { pat } }));
export const signOut = () => readResponse(client.api.auth['sign-out'].$post());
export const deleteAccount = () => readResponse(client.api.auth.account.$delete());

export type User = NonNullable<Awaited<ReturnType<typeof getSession>>['user']>;

export const getCapture = (signal: AbortSignal) =>
  readResponse(client.api.capture.$get({}, { init: { signal } }));
export const startCapture = () => readResponse(client.api.capture.$post());
