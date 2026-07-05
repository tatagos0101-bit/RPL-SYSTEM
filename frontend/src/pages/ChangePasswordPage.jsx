import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Eye, EyeOff, KeyRound, Lock, RefreshCw } from 'lucide-react';
import { changePassword, getProfile } from '../api/user';
import { homeForRole, updateStoredProfile } from '../api/authRoutes';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.next.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await changePassword(form.current, form.next);
      const { data } = await getProfile();
      updateStoredProfile(data);
      navigate(homeForRole(data.role), { replace: true });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Password update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <KeyRound size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Account Security</p>
            <h1 className="text-2xl font-black italic uppercase tracking-tight">Change Password</h1>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-800/60 bg-rose-950/40 px-4 py-3">
            <AlertCircle size={15} className="text-rose-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs font-bold text-rose-300">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {[
            ['current', 'Current Password'],
            ['next', 'New Password'],
            ['confirm', 'Confirm New Password'],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="block mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
              <span className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3 focus-within:border-blue-500">
                <Lock size={15} className="text-slate-500" />
                <input
                  type={show[key] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={(event) => update(key, event.target.value)}
                  className="min-w-0 flex-1 bg-transparent outline-none text-sm font-semibold text-white placeholder:text-slate-600"
                  autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className="text-slate-500 hover:text-slate-300"
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
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? 'Updating' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
