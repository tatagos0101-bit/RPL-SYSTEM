import { useEffect, useRef, useState } from 'react';
import { createQrCamera } from '../api/qrCamera';

export default function QrScanner({ onScan, busy }) {
  const [input, setInput] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const scanRef = useRef(onScan);
  useEffect(() => { scanRef.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!enabled) return;
    const session = createQrCamera({ mediaDevices: navigator.mediaDevices,
      loadDecoder: () => import('@zxing/browser'), video: videoRef.current,
      onResult: code => scanRef.current(code), onDevices: setDevices });
    let disposed = false;
    session.start(deviceId).catch(err => {
      if (disposed) return;
      setError(err.name === 'NotAllowedError' ? 'Camera permission denied. Use USB/manual entry or enable camera permission.'
        : 'Camera unavailable. Check the selected camera or use USB/manual entry.');
      setEnabled(false);
    });
    const hide = () => { if (document.hidden) { session.stop(); setEnabled(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { disposed = true; session.stop(); document.removeEventListener('visibilitychange', hide); };
  }, [enabled, deviceId]);
  return <section className="space-y-3">
    <form onSubmit={event => { event.preventDefault(); const code = input; setInput(''); onScan(code); }} className="flex flex-wrap gap-2">
      <label className="flex-1 min-w-48">Library QR code
        <input autoFocus aria-label="Library QR code" value={input} onChange={event => setInput(event.target.value)} maxLength={60}
          placeholder="Scan with USB or type the copy QR" className="block w-full bg-panel border border-line rounded-lg p-3 text-ink" />
      </label>
      <button disabled={busy || !input.trim()} className="self-end rounded-lg p-3 bg-action text-white disabled:opacity-50">Look up</button>
    </form>
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => { setError(''); setEnabled(value => !value); }} className="border border-line rounded-lg p-3">
        {enabled ? 'Stop camera' : 'Start QR camera'}
      </button>
      {devices.length > 0 && <label>Camera <select aria-label="Camera" value={deviceId} onChange={event => setDeviceId(event.target.value)} className="bg-panel border border-line rounded p-2 max-w-full">
        <option value="">Prefer rear camera</option>
        {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
      </select></label>}
      {busy && <span role="status">Looking up copy… Other detections are ignored; rescan after this finishes.</span>}
    </div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {enabled && <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-60 rounded-xl bg-black" />}
    <p className="text-sm text-muted">Scan physical library labels. Scanning only adds to your review list. Camera images stay on this device.</p>
  </section>;
}
