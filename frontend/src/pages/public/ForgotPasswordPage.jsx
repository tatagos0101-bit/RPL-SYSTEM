import { isValidNewPassword, passwordPolicyMessage } from '../../api/passwordPolicy';
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

    if (!isValidNewPassword(newPassword)) {
      setError(passwordPolicyMessage);
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
    <div className="rpl-page rpl-public min-h-screen bg-subtle text-ink font-sans">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <Link
          to="/user/login"
          className="inline-flex w-fit items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold tracking-normal text-muted transition-all hover:bg-panel hover:text-link hover:shadow-sm"
        >
          <ArrowLeft size={15} />
          Back to Login
        </Link>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-7">
            <Link to="/" className="inline-flex items-center gap-3">
              <span className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></span>
            </Link>

            <div>
              <p className="mb-3 text-sm font-semibold tracking-normal text-link">
                Account Help
              </p>
              <h1 className="max-w-xl font-semibold leading-none tracking-normal rpl-title">
                Reset Your Password
              </h1>
              <p className="mt-5 max-w-md text-sm font-medium leading-7 text-muted">
                Use your email, phone number, or Member ID. If no verified contact is saved, library staff can reset your password from the members screen.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel p-6 shadow-sm md:p-8">
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-danger bg-danger-soft px-4 py-3">
                <AlertCircle size={17} className="mt-0.5 flex-shrink-0 text-danger" />
                <p className="text-sm font-bold leading-relaxed text-danger">{error}</p>
              </div>
            )}

            {step === 'request' && (
              <form onSubmit={submitRequest} className="space-y-5">
                <div>
                  <p className="text-sm font-semibold tracking-normal text-muted">Step 1</p>
                  <h2 className="mt-1 font-semibold tracking-normal rpl-section-title">Find your account</h2>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-sm font-semibold tracking-normal text-muted">
                    Email, Phone, or Member ID
                  </label>
                  <input aria-label="Email, Phone, or Member ID"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="email@domain.com, +63..., or RPL-K7X2M"
                    className="w-full rounded-lg border border-line bg-subtle px-4 py-4 text-base font-bold outline-none transition-all focus:ring-2 focus:ring-line text-ink"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-sm font-semibold tracking-normal text-muted">
                    Recovery Method
                  </label>
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-subtle p-1">
                    {channelOptions.map((option) => {
                      const Icon = option.icon;
                      const active = channel === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setChannel(option.value)}
                          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold tracking-normal transition-all ${
                            active
                              ? 'bg-panel text-link shadow-sm text-link'
                              : 'text-muted hover:text-ink '
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
                  className="flex w-full items-center justify-center rounded-lg bg-action py-4 text-sm font-semibold tracking-normal text-white shadow-sm transition-all hover:bg-action-hover disabled:opacity-60"
                >
                  {loading ? 'Checking...' : 'Send Reset Code'}
                </button>
              </form>
            )}

            {step === 'confirm' && (
              <form onSubmit={submitConfirm} className="space-y-5">
                <div>
                  <p className="text-sm font-semibold tracking-normal text-link">Step 2</p>
                  <h2 className="mt-1 font-semibold tracking-normal rpl-section-title">Enter reset code</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-muted">
                    A reset code was prepared for your {result?.delivery_channel === 'sms' ? 'phone number' : 'email address'}.
                  </p>
                </div>

                {result?.debug_code && (
                  <div className="rounded-xl border border-warning bg-warning-soft px-4 py-3">
                    <p className="text-sm font-semibold tracking-normal text-warning">
                      Development reset code
                    </p>
                    <p className="mt-1 font-sans text-2xl font-semibold tracking-normal text-warning">
                      {result.debug_code}
                    </p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="ml-1 text-sm font-semibold tracking-normal text-muted">
                      6-Digit Code
                    </label>
                    <input aria-label="6-Digit Code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      className="w-full rounded-lg border border-line bg-subtle px-4 py-4 font-sans text-base font-semibold tracking-normal outline-none transition-all focus:ring-2 focus:ring-line text-ink"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="ml-1 text-sm font-semibold tracking-normal text-muted">
                      New Password
                    </label>
                    <input aria-label="New Password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={8} maxLength={128}
                      className="w-full rounded-lg border border-line bg-subtle px-4 py-4 text-base font-bold outline-none transition-all focus:ring-2 focus:ring-line text-ink"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-sm font-semibold tracking-normal text-muted">
                    Confirm Password
                  </label>
                  <input aria-label="Confirm Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={8} maxLength={128}
                    className="w-full rounded-lg border border-line bg-subtle px-4 py-4 text-base font-bold outline-none transition-all focus:ring-2 focus:ring-line text-ink"
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
                    className="rounded-lg border border-line py-4 text-sm font-semibold tracking-normal text-muted transition-all hover:bg-subtle"
                  >
                    Change Method
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-action py-4 text-sm font-semibold tracking-normal text-white shadow-sm transition-all hover:bg-action-hover disabled:opacity-60"
                  >
                    {loading ? 'Saving...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {step === 'help' && (
              <div className="space-y-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-warning-soft text-warning">
                  <AlertCircle size={30} />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-normal text-warning">
                    Staff reset required
                  </p>
                  <h2 className="mt-1 font-semibold tracking-normal rpl-section-title">Visit the librarian desk</h2>
                  <p className="mt-3 text-sm font-medium leading-7 text-muted">
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
                  className="rounded-lg bg-panel px-6 py-4 text-sm font-semibold tracking-normal text-ink transition-all hover:bg-subtle"
                >
                  Try Another Identifier
                </button>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-success-soft text-success">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-normal text-success">
                    Password changed
                  </p>
                  <h2 className="mt-1 font-semibold tracking-normal rpl-section-title">You can sign in now</h2>
                  <p className="mt-3 text-sm font-medium leading-7 text-muted">
                    Your old reset codes were closed after this change.
                  </p>
                </div>
                <Link
                  to="/user/login"
                  className="inline-flex rounded-xl bg-action px-6 py-4 text-sm font-semibold tracking-normal text-white transition-all hover:bg-action-hover"
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
