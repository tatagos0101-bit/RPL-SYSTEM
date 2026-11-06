import { Link } from 'react-router-dom';

export default function StationPrivacyNotice() {
  return (
    <aside aria-label="Facial processing notice" className="w-full rounded-xl border border-line bg-panel p-4 text-sm leading-6 text-ink">
      <p className="font-semibold">Facial recognition at this station</p>
      <p className="mt-1 text-muted">While scanning is active, camera images are sent to the library system to match enrolled faces and record entry or exit. Suspected spoof attempts may retain a facial snapshot.</p>
      <p className="mt-2 text-muted">Please ask library staff for assistance before entering the camera area if you do not wish to use facial recognition.</p>
      <Link to="/privacy-policy" className="mt-2 inline-block font-semibold text-link underline underline-offset-4">Data Privacy</Link>
    </aside>
  );
}
