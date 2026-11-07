import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { faceLookup } from '../api/auth';
import { getMembers } from '../api/librarian';
import { findManualMemberMatch, memberToSessionIdentity } from '../api/manualMemberLookup';
import { errorMessage } from '../api/inventoryWrites';

export default function CirculationMember({ onSelect }) {
  const webcam = useRef(null);
  const [method, setMethod] = useState('manual');
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const hide = () => { if (document.hidden) setMethod('manual'); };
    document.addEventListener('visibilitychange', hide);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', hide); };
  }, []);
  const identify = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      let member;
      if (method === 'face') {
        const image = webcam.current?.getScreenshot();
        if (!image) throw new Error('Camera not ready. Retry or use supervised Manual ID.');
        const { data } = await faceLookup(image);
        if (!data.matched) {
          if (['Spoofing Detected', 'liveness_uncertain'].includes(data.message)) {
            throw new Error('Live face not confirmed. Use the camera directly, without a photo or screen, or use supervised Manual ID.');
          }
          throw new Error(({ too_dark: 'Improve the lighting.', too_far: 'Move closer to the camera.', no_face: 'Position the member in front of the camera.' })[data.message] || 'Face not recognized. Retry or use Manual ID.');
        }
        member = data;
      } else {
        const { data } = await getMembers({ search: identifier.trim(), limit: 10 });
        const match = findManualMemberMatch(data, identifier.trim());
        if (!match) throw new Error('No exact member match. Use the full Member ID, exact email, phone, or numeric user ID.');
        member = memberToSessionIdentity(match);
      }
      webcam.current?.video?.srcObject?.getTracks().forEach(track => track.stop());
      if (mounted.current) onSelect(member);
    } catch (err) { if (mounted.current) setError(errorMessage(err)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <form onSubmit={identify} className="space-y-4">
    <h3 className="text-lg font-semibold">Identify the borrowing member</h3>
    <p className="text-muted">Verify the member at the counter before continuing.</p>
    <div className="flex gap-3">
      {['manual', 'face'].map(value => <button type="button" key={value} disabled={busy} onClick={() => { setMethod(value); setError(''); }}
        className={`border border-line rounded-lg p-3 ${method === value ? 'bg-action text-white' : ''}`}>{value === 'manual' ? 'Manual ID' : 'Face recognition'}</button>)}
    </div>
    {method === 'face' ? <Webcam ref={webcam} audio={false} screenshotFormat="image/jpeg" className="w-full max-h-64 rounded-xl"
      onUserMediaError={() => { setMethod('manual'); setError('Camera unavailable. Use Manual ID.'); }} />
      : <input aria-label="Member ID" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Member ID, email, phone, or numeric ID"
        className="w-full border border-line bg-panel rounded-lg p-3" />}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <button disabled={busy || (method === 'manual' && !identifier.trim())} className="bg-action text-white rounded-lg p-3 disabled:opacity-50">{busy ? 'Identifying…' : 'Identify member'}</button>
  </form>;
}
