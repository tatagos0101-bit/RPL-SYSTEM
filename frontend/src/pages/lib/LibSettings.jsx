import { useEffect, useState } from 'react';
import { LockKeyhole, LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../../api/auth';
import { getEntryStationPinStatus, updateEntryStationPin } from '../../api/librarian';

const inputClass = 'mt-2 w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-line focus:ring-2 focus:ring-line disabled:opacity-60 border-line focus:ring-line';

export default function LibSettings() {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [loggingOut, setLoggingOut] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await clearAuth();
    navigate('/librarian/login', { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    getEntryStationPinStatus()
      .then(({ data }) => { if (!cancelled) setConfigured(data.configured); })
      .catch(() => { if (!cancelled) setStatusError('Could not check the current PIN status. You can still try setting a new PIN.'); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSuccess('');
    if (!/^[0-9]{6,12}$/.test(pin)) {
      setError('Use 6–12 digits for the new PIN.');
      return;
    }
    if (pin !== confirmation) {
      setError('The PINs do not match.');
      return;
    }
    setSaving(true);
    try {
      await updateEntryStationPin(password, pin);
      setConfigured(true);
      setStatusError('');
      setPin('');
      setConfirmation('');
      setSuccess('PIN saved. Use the new PIN to unlock each entrance station.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(err.response?.status === 429
        ? 'Too many attempts. Wait a minute before trying again.'
        : (typeof detail === 'string' ? detail : 'Could not save the PIN. Check your connection and try again.'));
    } finally {
      setPassword('');
      setSaving(false);
    }
  };

  return (
    <div className="rpl-page mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-semibold tracking-normal text-link text-ink rpl-title">Settings</h1>
      <p className="mt-2 text-sm text-muted">Manage appearance, entrance station access, and your session.</p>

      <section aria-labelledby="appearance-title" className="mt-8 rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="appearance-title" className="font-bold text-ink rpl-section-title">Appearance</h2>
            <p className="mt-2 text-sm text-muted">Choose light or dark mode for this browser.</p>
          </div>
          <button type="button" onClick={toggleTheme}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-info-soft px-5 py-3 text-sm font-bold text-link hover:bg-info-soft bg-subtle text-ink hover:bg-subtle">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          </button>
        </div>
      </section>

      <section aria-labelledby="station-pin-title" className="mt-8 rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <LockKeyhole size={24} className="mt-1 shrink-0 text-link" />
          <div>
            <h2 id="station-pin-title" className="font-bold text-ink rpl-section-title">Entrance station PIN</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Set a PIN for staff to unlock attendance scanning. You can replace it here even if you have forgotten the old PIN.
            </p>
          </div>
        </div>
        <p className="mt-5 rounded-xl bg-info-soft px-4 py-3 text-sm text-link" role="status">
          {statusError || (configured === null ? 'Checking PIN status…' : configured
            ? 'A station PIN is configured. The current PIN is kept private.'
            : 'No station PIN is set. Set one below to enable entrance scanning.')}
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <label className="block text-sm font-semibold text-ink">
            Your librarian password
            <input aria-label="Your librarian password" type="password" autoComplete="current-password" required maxLength={128}
              value={password} onChange={(event) => { setPassword(event.target.value); setSuccess(''); }}
              disabled={saving} className={inputClass} />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">
              New PIN
              <input aria-label="New PIN" type="password" inputMode="numeric" autoComplete="new-password" required
                minLength={6} maxLength={12} pattern="[0-9]{6,12}" aria-describedby="pin-help"
                value={pin} onChange={(event) => { setPin(event.target.value); setSuccess(''); }}
                disabled={saving} className={inputClass} />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Confirm new PIN
              <input aria-label="Confirm new PIN" type="password" inputMode="numeric" autoComplete="new-password" required
                minLength={6} maxLength={12} pattern="[0-9]{6,12}"
                value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setSuccess(''); }}
                disabled={saving} className={inputClass} />
            </label>
          </div>
          <p id="pin-help" className="text-sm leading-relaxed text-muted">
            Use 6–12 digits. Changing the PIN locks stations on their next scan or log refresh. Share the new PIN with authorized staff.
          </p>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          {success && <p role="status" className="text-sm font-medium text-success">{success}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-action px-6 py-3 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-60 sm:w-auto">
            {saving ? 'Saving…' : 'Save PIN'}
          </button>
        </form>
      </section>

      <section aria-labelledby="session-title" className="mt-8 rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="session-title" className="font-bold text-ink rpl-section-title">Session</h2>
            <p className="mt-2 text-sm text-muted">Log out of your librarian account on this browser.</p>
          </div>
          <button type="button" onClick={handleLogout} disabled={loggingOut}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-danger-soft px-5 py-3 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60">
            <LogOut size={18} />
            {loggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </section>
    </div>
  );
}
