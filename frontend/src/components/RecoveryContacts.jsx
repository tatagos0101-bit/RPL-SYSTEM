import { useEffect, useState } from 'react';
import { getProfile, updateProfile } from '../api/user';
import EmailContact from './EmailContact';

export default function RecoveryContacts() {
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    getProfile().then(({ data }) => { if (active) { setProfile(data); setPhone(data.phone || ''); } })
      .catch(() => { if (active) setError('Could not load recovery contacts. Reload to try again.'); });
    return () => { active = false; };
  }, []);
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      const { data } = await updateProfile({ phone });
      setProfile(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save your phone number.');
    } finally { setSaving(false); }
  };
  return <section aria-labelledby="recovery-title" className="mt-8 space-y-4 rounded-xl border border-line bg-panel p-5 sm:p-8">
    <h2 id="recovery-title" className="font-bold text-ink rpl-section-title">Contact information</h2>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!profile && !error && <p role="status">Loading contacts…</p>}
    {profile && <>
      <EmailContact profile={profile} onUpdated={setProfile} />
      <form onSubmit={save} className="space-y-3">
        <label className="block text-ink">Phone number
          <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+63 9XX XXX XXXX"
            className="mt-2 w-full rounded-lg border border-line bg-subtle p-3 text-ink" />
        </label>
        <button disabled={saving || phone === (profile.phone || '')} className="rounded-lg bg-action px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save phone'}</button>
      </form>
      <p className="text-sm text-muted">Phone numbers are for contact information only. Verification and password recovery use email.</p>
    </>}
  </section>;
}
