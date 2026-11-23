import { useEffect, useState } from 'react';
import { getProfile } from '../api/user';
import EmailContact from './EmailContact';

export default function RecoveryContacts() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getProfile().then(({ data }) => { if (active) setProfile(data); })
      .catch(() => { if (active) setError('Could not load recovery contacts. Reload to try again.'); });
    return () => { active = false; };
  }, []);
  return <section aria-labelledby="recovery-title" className="mt-8 space-y-4 rounded-xl border border-line bg-panel p-5 sm:p-8">
    <h2 id="recovery-title" className="font-bold text-ink rpl-section-title">Contact information</h2>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!profile && !error && <p role="status">Loading contacts…</p>}
    {profile && <>
      <EmailContact profile={profile} onUpdated={setProfile} />
      <p className="text-sm text-muted">Verification and password recovery use email. Without email, ask the librarian for help with your sign-in details.</p>
    </>}
  </section>;
}
