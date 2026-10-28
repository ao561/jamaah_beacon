import { BadgeCheck, CalendarClock, KeyRound, LoaderCircle, LogOut, Mail, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AuthState } from '../hooks/useAuth';
import { deleteAccount, emailSignInEnabled, sendSignInEmail, signInWithGoogle, signOut, verifyEmailCode } from '../lib/account';
import { BottomSheet } from './BottomSheet';

interface Props {
  open: boolean;
  auth: AuthState;
  onClose: () => void;
  onOpenMine: () => void;
  notify: (tone: 'success' | 'error', text: string) => void;
}

const errorText = (err: unknown) =>
  typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
    ? err.message
    : 'Something went wrong. Please try again.';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900';

export function AccountSheet({ open, auth, onClose, onOpenMine, notify }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="account-title">
      <div className="space-y-5 pt-1">
        <div className="flex items-center justify-between">
          <h2 id="account-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {auth.userId ? 'Your account' : 'Sign in (optional)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="size-5" />
          </button>
        </div>
        {/* Remount on sign-in/out so form state doesn't leak between the two views. */}
        {auth.userId ? (
          <SignedIn key={auth.userId} auth={auth} onOpenMine={onOpenMine} onClose={onClose} notify={notify} />
        ) : (
          <SignedOut notify={notify} />
        )}
        <PrivacyNotice />
      </div>
    </BottomSheet>
  );
}

function SignedOut({ notify }: { notify: Props['notify'] }) {
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'email' | 'code' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const sendLink = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Enter a valid email address.');
    void run('email', async () => {
      await sendSignInEmail(address);
      setSentTo(address);
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!sentTo) return;
    void run('code', async () => {
      await verifyEmailCode(sentTo, code.trim());
      notify('success', "You're signed in.");
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <Benefit icon={<CalendarClock className="size-4" />}>Manage what you host from any device</Benefit>
        <Benefit icon={<BadgeCheck className="size-4" />}>A verified badge and your name on beacons you host</Benefit>
        <Benefit icon={<ShieldCheck className="size-4" />}>Everything still works without an account</Benefit>
      </ul>

      {sentTo ? (
        <form onSubmit={submitCode} className="space-y-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            We've emailed <strong>{sentTo}</strong>. Tap the link in it to sign in. If the email shows a 6-digit code, you
            can type it here instead.
          </p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              aria-label="6-digit code"
              className={`${inputClass} tracking-widest`}
            />
            <button
              type="submit"
              disabled={code.length !== 6 || busy !== null}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50"
            >
              {busy === 'code' ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Verify
            </button>
          </div>
          <button type="button" onClick={() => setSentTo(null)} className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Use a different email
          </button>
        </form>
      ) : (
        <>
          <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-emerald-700"
            />
            <span>
              I agree that Jama'ah Beacon stores my account and the jama'ahs I host or join. This can show that I'm Muslim. See
              the privacy notice below.
            </span>
          </label>

          {emailSignInEnabled && (
            <>
              <form onSubmit={sendLink} className="flex gap-2">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={!consent || busy !== null}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'email' ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />} Send link
                </button>
              </form>

              <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
            </>
          )}

          <button
            type="button"
            disabled={!consent || busy !== null}
            onClick={() => void run('google', signInWithGoogle)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            {busy === 'google' ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleMark />} Continue with Google
          </button>
          {!consent && <p className="text-center text-xs text-slate-500 dark:text-slate-400">Tick the box above to continue.</p>}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}

function SignedIn({ auth, onOpenMine, onClose, notify }: Omit<Props, 'open'>) {
  const [name, setName] = useState(auth.profile?.display_name ?? '');
  const [showName, setShowName] = useState(auth.profile?.show_name ?? true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The profile arrives just after sign-in; fill the form when it does.
  useEffect(() => {
    if (!auth.profile) return;
    setName(auth.profile.display_name ?? '');
    setShowName(auth.profile.show_name);
  }, [auth.profile]);

  useEffect(() => {
    if (!confirmDelete) return;
    const id = setTimeout(() => setConfirmDelete(false), 5000);
    return () => clearTimeout(id);
  }, [confirmDelete]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await auth.updateProfile(name.trim() || null, showName);
      notify('success', 'Saved. Your beacons show the new name.');
    } catch (err) {
      notify('error', errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await deleteAccount();
      onClose();
      notify('success', 'Your account has been deleted.');
    } catch (err) {
      notify('error', errorText(err));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Signed in as <strong className="text-slate-900 dark:text-slate-100">{auth.email}</strong>
      </p>

      <button
        type="button"
        onClick={onOpenMine}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 py-3 font-semibold text-white hover:bg-emerald-800"
      >
        <CalendarClock className="size-5" /> My jama'ahs
      </button>

      <form onSubmit={save} className="space-y-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <label className="block">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Name on beacons you host</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="First name or nickname"
            autoComplete="nickname"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showName}
            onChange={(e) => setShowName(e.target.checked)}
            className="size-4 accent-emerald-700"
          />
          Show my name (otherwise beacons just say "Verified host")
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-white py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void signOut().catch((err) => notify('error', errorText(err)))}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300"
        >
          <LogOut className="size-4" /> Sign out
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
            confirmDelete ? 'bg-rose-600 text-white' : 'text-rose-700 dark:text-rose-400'
          }`}
        >
          {confirmDelete ? 'Tap again to delete everything' : 'Delete account'}
        </button>
      </div>
    </div>
  );
}

function Benefit({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-emerald-700 dark:text-emerald-400">{icon}</span>
      {children}
    </li>
  );
}

function PrivacyNotice() {
  return (
    <details className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
      <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">Privacy notice</summary>
      <div className="mt-2 space-y-2">
        <p>
          <strong>Without an account</strong> we store nothing about you. Beacons you host are public until they end, and
          your device keeps a private key so you can manage them.
        </p>
        <p>
          <strong>With an account</strong> we store your email (to sign you in), the display name you choose, and which
          beacons you host or join. Because these are prayer gatherings, this can reveal your religion, which is
          special-category data. We only process it with your explicit consent, given when you sign in.
        </p>
        <p>
          Only your display name (if you choose to show it) is ever public. Who hosted or joined a beacon is never shown
          to other users. Beacons and the links to them are deleted about a day after they end. Regular spots you set up
          are kept until you stop them, or until nobody joins for 30 days. You can delete your account at any time from
          this screen, which removes your email, name and all links to beacons.
        </p>
        <p>Data is stored with Supabase, our database provider. We don't use tracking cookies or sell data.</p>
        <p>
          <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-emerald-700 underline dark:text-emerald-400">
            Read the full privacy policy
          </a>
        </p>
      </div>
    </details>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7V6.6H1.3a12 12 0 0 0 0 10.8l4-3z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}
