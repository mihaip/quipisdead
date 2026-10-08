import { useState } from 'react';
import type { User } from '../api';
import CapturePanel from '../capture/CapturePanel';
import PatForm from './PatForm';
import type { useAccount } from './useAccount';

type Props = { user: User; account: ReturnType<typeof useAccount> };

export default function AccountPanel({ user, account }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = account.replacePat.isPending || account.signOut.isPending || account.deleteAccount.isPending;

  return (
    <>
      <section className="card">
        <div className="section-heading">
          <div><p className="eyebrow">Connected account</p><h2>{user.name}</h2></div>
          <button className="secondary" disabled={busy} onClick={() => account.signOut.mutate()}>
            {account.signOut.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {user.email && <p className="email">{user.email}</p>}
        <dl>
          <div><dt>Quip user ID</dt><dd>{user.quipUserId}</dd></div>
          <div><dt>API origin</dt><dd>{user.quipOrigin}</dd></div>
          <div><dt>Token last saved</dt><dd>{new Date(user.credentialUpdatedAt).toLocaleString()}</dd></div>
        </dl>
        <p className="help">You can return to this account on this browser for 30 days. To sign in elsewhere, use your current Quip token.</p>
        {account.signOut.error && <p className="error" role="alert">{account.signOut.error.message}</p>}
      </section>
      <CapturePanel userId={user.id} onSessionExpired={account.onSessionExpired} />
      <section className="card">
        <h2>Replace your token</h2>
        <p>Renew your connection when your Quip token expires or changes.</p>
        <PatForm action="replace" pending={account.replacePat.isPending} disabled={busy}
          error={account.replacePat.error} onSubmit={account.replacePat.mutateAsync} />
      </section>
      <section className="card danger-zone">
        <h2>Delete app account</h2>
        <p>Delete your account details, saved token, captured profile, and all browser sessions from this app. Your Quip account and Quip content are untouched.</p>
        <p className="help">Active app records are removed immediately. Cloudflare database backups can retain deleted records for up to 7 days on the Free plan or 30 days on the Paid plan.</p>
        {!confirmDelete ? (
          <button className="danger secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete app account…</button>
        ) : (
          <div className="confirmation">
            <p>This cannot be undone. Delete your app account?</p>
            <div className="button-row">
              <button className="danger" disabled={busy} onClick={() => account.deleteAccount.mutate()}>
                {account.deleteAccount.isPending ? 'Deleting…' : 'Yes, delete app account'}
              </button>
              <button className="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
        {account.deleteAccount.error && <p className="error" role="alert">{account.deleteAccount.error.message}</p>}
      </section>
    </>
  );
}
