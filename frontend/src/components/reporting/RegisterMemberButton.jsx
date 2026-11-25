import { lazy, Suspense, useState } from 'react';
import { UserPlus } from 'lucide-react';

const RegisterMemberModal = lazy(() => import('../../pages/lib/LibUsers').then(module => ({ default: module.RegisterMemberModal })));

export default function RegisterMemberButton({ onRegistered }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white"><UserPlus size={16} />Register Member</button>
    {open && <Suspense fallback={<p role="status">Opening registration...</p>}><RegisterMemberModal onClose={() => setOpen(false)} onSuccess={onRegistered} /></Suspense>}
  </>;
}
