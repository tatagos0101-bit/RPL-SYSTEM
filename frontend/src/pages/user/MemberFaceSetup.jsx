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
      .catch(() => { if (current) setError('Could not load your account. Retry or continue to your account.'); });
    return () => { current = false; };
  }, [revision]);
  return <main className="mx-auto max-w-3xl px-5 py-10 text-ink">
    <p className="text-sm font-semibold text-link">Member registration · Face ID setup</p>
    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your account is ready</h1>
    <p className="mt-3 leading-relaxed text-muted">You can now enroll your face from home or another suitable location. This is optional; email or Member ID and password access remains available.</p>
    <section className="mt-7 space-y-4 rounded-2xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="face-setup-heading">
      <ShieldCheck className="text-link" size={28} aria-hidden="true" />
      <h2 id="face-setup-heading" className="text-2xl font-semibold">Enroll your face online</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted">
        <li>Read the separate facial-recognition terms and select “Agree and start camera”.</li>
        <li>Use your own face. Take a clear live camera capture in even lighting. You do not need to upload an ID here.</li>
        <li>The system checks for a live face and a duplicate enrollment before saving your face to your signed-in account.</li>
      </ol>
      <p className="text-sm text-muted">Your live enrollment image is not saved. Your encrypted facial template and agreement are kept when enrollment succeeds. Librarians continue to handle account ID checks. You can also complete this step later in Profile.</p>
      {error && <p role="alert" className="text-sm text-danger">{error} <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
      {!profile && !error && <p role="status" className="text-sm text-muted">Loading your account…</p>}
      {profile && !profile.remote_face_enrollment_allowed && <p className="rounded-xl bg-warning-soft p-4 text-sm text-warning">Complete your required account setup before enrolling your face. Contact the library desk if you need assistance.</p>}
      {complete ? <p role="status" className="flex items-center gap-2 rounded-xl bg-success-soft p-4 text-success"><CheckCircle2 size={20} />Face ID setup completed successfully.</p> : profile?.remote_face_enrollment_allowed && <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 items-center gap-2 rounded-xl bg-action px-5 py-3 font-semibold text-white hover:bg-action-hover"><Camera size={19} />{profile.face_enrolled ? 'Update Face ID online' : 'Enroll Face ID online'}</button>}
      <div className="flex flex-wrap gap-4 border-t border-line pt-4"><Link to="/user/home" replace className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 py-2 font-semibold hover:bg-subtle">{complete ? 'Continue to my account' : 'Continue without Face ID'}</Link><Link to="/privacy-policy" className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">Privacy notice and choices</Link></div>
    </section>
    {open && <Suspense fallback={<p role="status">Opening face enrollment…</p>}><FaceEnrollModal selfService user={profile} onClose={() => setOpen(false)} onSuccess={() => setComplete(true)} /></Suspense>}
  </main>;
}
