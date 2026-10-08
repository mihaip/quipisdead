import AccountPanel from './auth/AccountPanel';
import PatForm from './auth/PatForm';
import { useAccount } from './auth/useAccount';

export default function App() {
  const account = useAccount();
  const { session } = account;

  return (
    <main>
      <header>
        <p className="eyebrow">Quip archive</p>
        <h1>A home for your Quip history.</h1>
        <p className="intro">Connect your Quip account to get ready to preserve your work.</p>
      </header>
      {account.notice && <p className="notice" role="status">{account.notice}</p>}
      {session.isPending && <p role="status">Checking your session…</p>}
      {session.isError && <section className="card">
        <p className="error" role="alert">{session.error.message}</p>
        <button onClick={() => void session.refetch()}>Try again</button>
      </section>}
      {session.isSuccess && (session.data.user ? (
        <AccountPanel key={session.data.user.id} user={session.data.user} account={account} />
      ) : (
        <section className="card">
          <h2>Connect with a personal access token</h2>
          <p>Sign in with your Quip identity. The app checks your token with Quip and saves your connection for future archive work.</p>
          <PatForm action="sign-in" pending={account.signIn.isPending}
            error={account.signIn.error} onSubmit={account.signIn.mutateAsync} />
          <p className="help privacy-note">This hosted service has access to the Quip data your token permits. You can sign out or delete your app account at any time.</p>
        </section>
      ))}
      <footer>Account connection and profile capture are available now. Full archives and the data explorer are coming next.</footer>
    </main>
  );
}
