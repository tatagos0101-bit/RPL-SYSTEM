import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, ShieldCheck } from 'lucide-react';
import { getProfile } from '../../api/user';

const FaceEnrollModal = lazy(() => import('../../components/FaceEnrollModal'));

export default function MemberFaceSetup() {
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    getProfile().then(({ data }) => { if (current) { setProfile(data); setError(''); } })
      .catch(() => { if (current) setError('Could not check your ID verification. Retry or continue to your account.'); });
    return () => { current = false; };
  }, [revision]);
  return <main className="mx-auto max-w-3xl px-5 py-10 text-ink">
    <p className="text-sm font-semibold text-link">Member registration · Face ID setup</p>
    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your account is ready</h1>
    <p className="mt-3 leading-relaxed text-muted">You can now enroll your face from home or another suitable location. This is optional; email or Member ID and password access remains available.</p>
    <section className="mt-7 space-y-4 rounded-2xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="face-setup-heading">
      <ShieldCheck className="text-link" size={28} aria-hidden="true" />
      <h2 id="face-setup-heading" className="text-2xl font-semibold">Enroll using your verified photo ID</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted">
        <li>A librarian must have checked your original government photo ID and linked it to your account.</li>
        <li>Read the facial-recognition notice and give separate consent. Choose a clear photo of that same ID and take a live camera capture.</li>
        <li>The system checks the uploaded ID against the saved ID, checks the live face for liveness, and compares the live portrait with the verified identity. Enrollment succeeds only when these checks pass.</li>
      </ol>
      <p className="text-sm text-muted">Comparison uploads are discarded after checking. If the ID portrait is old or unclear, contact the library for assisted enrollment. You can also complete this step later in Profile.</p>
      {error && <p role="alert" className="text-sm text-danger">{error} <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>Retry ID check</button></p>}
      {!profile && !error && <p role="status" className="text-sm text-muted">Checking your library ID verification…</p>}
      {profile && !profile.remote_face_enrollment_allowed && <p className="rounded-xl bg-warning-soft p-4 text-sm text-warning">Your ID still needs librarian verification before online face enrollment is available. You can use your password and ask the library desk to complete the ID check.</p>}
      {complete ? <p role="status" className="flex items-center gap-2 rounded-xl bg-success-soft p-4 text-success"><CheckCircle2 size={20} />Face ID setup completed successfully.</p> : profile?.remote_face_enrollment_allowed && <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 items-center gap-2 rounded-xl bg-action px-5 py-3 font-semibold text-white hover:bg-action-hover"><Camera size={19} />{profile.remote_face_verification_method === 'registered_face' ? 'Verify registered Face ID' : 'Enroll Face ID online'}</button>}
      <div className="flex flex-wrap gap-4 border-t border-line pt-4"><Link to="/user/home" replace className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 py-2 font-semibold hover:bg-subtle">{complete ? 'Continue to my account' : 'Continue without Face ID'}</Link><Link to="/privacy-policy" className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">Privacy notice and choices</Link></div>
    </section>
    {open && <Suspense fallback={<p role="status">Opening face enrollment…</p>}><FaceEnrollModal selfService user={profile} onClose={() => setOpen(false)} onSuccess={() => setComplete(true)} /></Suspense>}
  </main>;
}
