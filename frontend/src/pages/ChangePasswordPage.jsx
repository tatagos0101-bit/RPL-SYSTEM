import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Eye, EyeOff, KeyRound, Lock, RefreshCw } from 'lucide-react';
import { changePassword } from '../api/user';
import { getStoredAuth, homeForRole, updateStoredProfile } from '../api/authRoutes';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    if (form.next.length < 6) {
      setError('Password was not changed. New password must be at least 6 characters.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('Password was not changed. Passwords do not match.');
      return;
    }

    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const { data } = await changePassword(form.current, form.next);
      if (data.success !== true) throw new Error('Password update was not confirmed.');
      // Older deployed API versions return only success/message. Stored metadata
      // supplies navigation during rollout; RequireRole still verifies the server.
      const stored = getStoredAuth();
      const profile = {
        id: data.id ?? stored.userId,
        name: data.name ?? stored.name,
        role: data.role ?? stored.role,
        must_change_password: false,
      };
      updateStoredProfile(profile);
      setForm({ current: '', next: '', confirm: '' });
      navigate(homeForRole(profile.role), { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      const detail = err.response?.data?.detail;
      const rejected = err.response?.status >= 400 && err.response?.status < 500;
      setError(rejected
        ? `Password was not changed. ${typeof detail === 'string' ? detail : 'Check your password fields and try again.'}`
        : 'Could not confirm the password update. Please retry or sign in with your new password.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="rpl-page min-h-screen bg-panel text-ink flex items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md bg-panel border border-line rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-info-soft border border-line flex items-center justify-center">
            <KeyRound size={20} className="text-link" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-normal text-link">Account Security</p>
            <h1 className="font-semibold tracking-normal rpl-title">Change Password</h1>
          </div>
        </div>

        <p className="mb-6 text-sm leading-6 text-muted">
          Choose a new password to finish setting up your account. After it is saved,
          you will go to your homepage.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-danger bg-danger-soft px-4 py-3">
            <AlertCircle size={15} className="text-danger mt-0.5 flex-shrink-0" />
            <p className="text-sm font-bold text-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {[
            ['current', 'Current Password'],
            ['next', 'New Password'],
            ['confirm', 'Confirm New Password'],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="block mb-1.5 text-sm font-semibold tracking-normal text-muted">{label}</span>
              <span className="flex items-center gap-2 rounded-xl border border-line bg-subtle px-4 py-3 focus-within:border-line">
                <Lock size={15} className="text-muted" />
                <input
                  type={show[key] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={(event) => update(key, event.target.value)}
                  className="min-w-0 flex-1 bg-transparent outline-none text-base font-semibold text-ink placeholder:text-muted"
                  autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                  required
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className="text-muted hover:text-ink"
                  aria-label={show[key] ? `Hide ${label}` : `Show ${label}`}
                >
                  {show[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-action px-5 py-3.5 text-sm font-semibold tracking-normal text-white hover:bg-action-hover disabled:opacity-60"
        >
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? 'Updating' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
