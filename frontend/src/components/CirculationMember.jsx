import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { RefreshCw } from 'lucide-react';
import { faceLookup } from '../api/auth';
import { startCirculationFaceScan } from '../api/circulationFaceScan';
import { getMembers } from '../api/librarian';
import { findManualMemberMatch, memberToSessionIdentity } from '../api/manualMemberLookup';
import { errorMessage } from '../api/inventoryWrites';

export default function CirculationMember({ onSelect, mode = 'borrow' }) {
  const webcam = useRef(null);
  const [method, setMethod] = useState('face');
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanStatus, setScanStatus] = useState({ phase: 'starting', message: 'Starting camera… Please wait.' });
  const scanSession = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) { scanSession.current?.stop(); setMethod('manual'); }
    };
    document.addEventListener('visibilitychange', hide);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => {
    if (method !== 'face') return;
    const scanner = startCirculationFaceScan({
      capture: () => document.hidden ? null : webcam.current?.getScreenshot(),
      lookup: faceLookup,
      onStatus: status => { if (mounted.current) setScanStatus(status); },
      onMatch: member => {
        webcam.current?.video?.srcObject?.getTracks().forEach(track => track.stop());
        if (mounted.current && !document.hidden) onSelect(member);
      },
    });
    scanSession.current = scanner;
    return () => { scanner.stop(); if (scanSession.current === scanner) scanSession.current = null; };
  }, [method, onSelect]);
  const changeMethod = value => {
    if (method === value) return;
    scanSession.current?.stop();
    setMethod(value); setError('');
    setScanStatus({ phase: 'starting', message: 'Starting camera… Please wait.' });
  };
  const identify = async event => {
    event.preventDefault();
    if (busy || method !== 'manual') return;
    setBusy(true); setError('');
    try {
      const { data } = await getMembers({ search: identifier.trim(), limit: 10 });
      const match = findManualMemberMatch(data, identifier.trim());
      if (!match) throw new Error('No exact member match. Use the full Member ID, exact email, or numeric user ID.');
      const member = memberToSessionIdentity(match);
      webcam.current?.video?.srcObject?.getTracks().forEach(track => track.stop());
      if (mounted.current) onSelect(member);
    } catch (err) { if (mounted.current) setError(errorMessage(err)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <form onSubmit={identify} className="space-y-4">
    <h3 className="text-lg font-semibold">{mode === 'return' ? 'Identify the returning member' : 'Identify the borrowing member'}</h3>
    <p className="text-muted">{method === 'face' ? 'Scanning starts automatically. Keep the member facing the camera.' : 'Identify the member at the counter using their email or Member ID.'}</p>
    <div className="flex flex-wrap gap-3">
      {['face', 'manual'].map(value => <button type="button" key={value} disabled={busy} aria-pressed={method === value} onClick={() => changeMethod(value)}
        className={`border border-line rounded-lg p-3 ${method === value ? 'bg-action text-white' : ''}`}>{value === 'manual' ? 'Use email or Member ID instead' : 'Face recognition'}</button>)}
    </div>
    {method === 'face' ? <div className="space-y-3">
      <Webcam ref={webcam} audio={false} screenshotFormat="image/jpeg" screenshotQuality={0.8}
        videoConstraints={{ width: 640, height: 480, facingMode: 'user' }} aria-label="Member face camera" className="w-full max-h-64 rounded-xl"
        onUserMediaError={() => { scanSession.current?.stop(); setMethod('manual'); setError('Camera unavailable. Use email or Member ID instead.'); }} />
      <p role={scanStatus.phase === 'error' ? 'alert' : 'status'} aria-atomic="true" className={`flex items-start gap-3 rounded-xl border border-line bg-subtle p-3 text-sm ${scanStatus.phase === 'error' ? 'text-danger' : 'text-link'}`}>
        <RefreshCw size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${['starting', 'scanning'].includes(scanStatus.phase) ? 'motion-safe:animate-spin' : ''}`} />
        <span>{scanStatus.message}</span>
      </p>
    </div>
      : <input aria-label="Email or Member ID" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Email, Member ID, or numeric ID"
        className="w-full border border-line bg-panel rounded-lg p-3" />}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {method === 'manual' && <button disabled={busy || !identifier.trim()} className="bg-action text-white rounded-lg p-3 disabled:opacity-50">{busy ? 'Identifying…' : 'Identify member'}</button>}
  </form>;
}
