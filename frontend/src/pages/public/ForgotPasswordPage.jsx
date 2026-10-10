import { useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Mail, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { confirmPasswordReset, requestPasswordReset } from '../../api/auth';

const channelOptions = [
  { value: 'auto', label: 'Auto', icon: KeyRound },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: MessageSquareText },
];

const formatApiError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(', ');
  return detail || fallback;
};

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState('auto');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submitRequest = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { data } = await requestPasswordReset(identifier, channel);
      setResult(data);
      if (data.requires_librarian_help) {
        setStep('help');
      } else if (data.success && data.delivery_channel) {
        setStep('confirm');
      }
    } catch (err) {
      setError(formatApiError(err, 'Password reset request failed.'));
    } finally {
      setLoading(false);
    }
  };

  const submitConfirm = async (event) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await confirmPasswordReset(identifier, code, newPassword);
      setResult(data);
      setStep('done');
    } catch (err) {
      setError(formatApiError(err, 'Password reset failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-sans">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <Link
          to="/user/login"
          className="inline-flex w-fit items-center gap-3 rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-white hover:text-blue-600 hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-blue-400"
        >
          <ArrowLeft size={15} />
          Back to Login
        </Link>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-7">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                <img src="/logo.library.png" alt="Rizal Provincial Library" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-xl font-black italic uppercase leading-none tracking-tight">
                  Rizal <span className="text-blue-600 dark:text-blue-400">Lib</span>
                </p>
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Member Recovery</p>
              </div>
            </Link>

            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.35em] text-blue-600 dark:text-blue-400">
                Account Help
              </p>
              <h1 className="max-w-xl text-4xl font-black italic uppercase leading-none tracking-tight md:text-6xl">
                Reset Your Password
              </h1>
              <p className="mt-5 max-w-md text-sm font-medium leading-7 text-slate-500 dark:text-slate-400">
                Use your email, phone number, or Member ID. If no verified contact is saved, library staff can reset your password from the members screen.
              </p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-900/20">
                <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-rose-500" />
                <p className="text-xs font-bold leading-relaxed text-rose-700 dark:text-rose-300">{error}</p>
              </div>
            )}

            {step === 'request' && (
              <form onSubmit={submitRequest} className="space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Step 1</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">Find your account</h2>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Email, Phone, or Member ID
                  </label>
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="email@domain.com, +63..., or RPL-K7X2M"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Recovery Method
                  </label>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
                    {channelOptions.map((option) => {
                      const Icon = option.icon;
                      const active = channel === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setChannel(option.value)}
                          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                            active
                              ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          <Icon size={14} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-2xl bg-blue-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 dark:shadow-blue-950"
                >
                  {loading ? 'Checking...' : 'Send Reset Code'}
                </button>
              </form>
            )}

            {step === 'confirm' && (
              <form onSubmit={submitConfirm} className="space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Step 2</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">Enter reset code</h2>
                  <p className="mt-2 text-xs font-medium leading-6 text-slate-500 dark:text-slate-400">
                    A reset code was prepared for your {result?.delivery_channel === 'sms' ? 'phone number' : 'email address'}.
                  </p>
                </div>

                {result?.debug_code && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">
                      Development reset code
                    </p>
                    <p className="mt-1 font-mono text-2xl font-black tracking-widest text-amber-700 dark:text-amber-200">
                      {result.debug_code}
                    </p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      6-Digit Code
                    </label>
                    <input
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-sm font-black tracking-widest outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={6}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={6}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-[0.7fr_1fr]">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('request');
                      setError('');
                    }}
                    className="rounded-2xl border border-slate-200 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Change Method
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-2xl bg-blue-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 dark:shadow-blue-950"
                  >
                    {loading ? 'Saving...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {step === 'help' && (
              <div className="space-y-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                  <AlertCircle size={30} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">
                    Staff reset required
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">Visit the librarian desk</h2>
                  <p className="mt-3 text-sm font-medium leading-7 text-slate-500 dark:text-slate-400">
                    A librarian can verify your ID and create a temporary password for you.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('request');
                    setError('');
                    setResult(null);
                  }}
                  className="rounded-2xl bg-slate-900 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                >
                  Try Another Identifier
                </button>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                    Password changed
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">You can sign in now</h2>
                  <p className="mt-3 text-sm font-medium leading-7 text-slate-500 dark:text-slate-400">
                    Your old reset codes were closed after this change.
                  </p>
                </div>
                <Link
                  to="/user/login"
                  className="inline-flex rounded-2xl bg-blue-600 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-700"
                >
                  Return to Login
                </Link>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
