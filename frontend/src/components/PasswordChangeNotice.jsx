import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, X } from 'lucide-react';

export default function PasswordChangeNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const onHomepage = ['/user/home', '/librarian/home'].includes(location.pathname);
  if (!onHomepage || !location.state?.passwordChanged) return null;

  const dismiss = () => navigate(location.pathname + location.search + location.hash, {
    replace: true,
    state: { ...location.state, passwordChanged: false },
  });

  return (
    <div role="status" aria-live="polite"
      className="fixed right-4 top-20 z-[100] flex w-[calc(100%-2rem)] max-w-md items-start gap-3 rounded-xl border border-success bg-success-soft p-4 text-success shadow-sm">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-bold">Password updated successfully.</p>
        <p className="mt-1 text-sm leading-5">Use your new password the next time you sign in.</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss password update notification"
        className="shrink-0 rounded-lg p-1 hover:bg-success-soft">
        <X size={18} />
      </button>
    </div>
  );
}
