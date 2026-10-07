import { z } from 'zod';

// Only this verified API origin receives PATs. Custom Quip sites are future work.
export const QUIP_ORIGIN = 'https://platform.quip.com';

const currentUserSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(1024),
  emails: z.array(z.string().max(320)).optional(),
});

export type QuipIdentity = {
  origin: typeof QUIP_ORIGIN;
  userId: string;
  name: string;
  email: string | null;
};

export class QuipError extends Error {
  constructor(message: string, public readonly status: 422 | 502 | 503) {
    super(message);
  }
}

export async function validatePat(pat: string): Promise<QuipIdentity> {
  let response: Response;
  try {
    response = await fetch(`${QUIP_ORIGIN}/1/users/current`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' },
      // Workers supports manual redirects; any 3xx below is rejected without following it.
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new QuipError('Could not reach Quip. Please try again.', 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new QuipError('Quip rejected this token. Check that it is current and has user read access.', 422);
  }
  if (response.status === 429 || response.status === 503) {
    throw new QuipError('Quip is temporarily unavailable or rate limiting requests. Please try again later.', 503);
  }
  if (!response.ok) {
    throw new QuipError('Quip could not validate this token. Please try again.', 502);
  }
  // Never propagate upstream bodies or validation details: they can contain secrets.
  const parsed = currentUserSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new QuipError('Quip returned an unexpected account response. Please try again later.', 502);
  }
  return {
    origin: QUIP_ORIGIN,
    userId: parsed.data.id,
    name: parsed.data.name,
    email: parsed.data.emails?.[0] || null,
  };
}
