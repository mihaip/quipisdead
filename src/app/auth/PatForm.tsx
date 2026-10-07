import { useState } from 'react';
import type { FormEvent } from 'react';

type Props = {
  action: 'sign-in' | 'replace';
  pending: boolean;
  disabled?: boolean;
  error: Error | null;
  onSubmit: (pat: string) => Promise<unknown>;
};

export default function PatForm({ action, pending, disabled, error, onSubmit }: Props) {
  const [pat, setPat] = useState('');
  const replacing = action === 'replace';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = pat.trim();
    setPat('');
    try {
      await onSubmit(submitted);
    } catch {
      // The mutation provides a safe server error below. Never echo the token.
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={`${action}-pat`}>{replacing ? 'New personal access token' : 'Personal access token'}</label>
      <input id={`${action}-pat`} type="password" name="pat" value={pat}
        onChange={(event) => setPat(event.target.value)} required maxLength={4096}
        autoComplete="off" autoCapitalize="none" spellCheck={false}
        aria-describedby={`${action}-help`} disabled={pending || disabled} />
      <p className="help" id={`${action}-help`}>
        {replacing ? 'The token must belong to the Quip account shown above. ' : 'Your token is sent securely to the app and stored encrypted. '}
        <a href="https://quip.com/dev/token" target="_blank" rel="noreferrer">Get a token from Quip</a>.
        {' '}Generating a new token in Quip invalidates earlier tokens.
      </p>
      {error && <p className="error" role="alert">{error.message}</p>}
      <button type="submit" disabled={!pat.trim() || pending || disabled}>
        {pending ? 'Checking with Quip…' : replacing ? 'Replace token' : 'Sign in with Quip'}
      </button>
    </form>
  );
}
