import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, ScanFace, X } from 'lucide-react';
import ModalFrame from './ModalFrame';
import { enrollMemberFace } from '../api/librarian';
import { enrollFace } from '../api/auth';
import { encodeComparisonId, identityError } from '../api/identity';

const VIDEO_CONSTRAINTS = {
  facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 },
};

export default function FaceEnrollModal({ user, onClose, onSuccess, selfService = false }) {
  const webcam = useRef(null);
  const submitting = useRef(false);
  const [step, setStep] = useState('consent');
  const [consented, setConsented] = useState(false);
  const [ready, setReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [idImage, setIdImage] = useState(null);
  const [preparingId, setPreparingId] = useState(false);
  const idAttempt = useRef(0);
  useEffect(() => () => { idAttempt.current += 1; }, []);
  const busy = step === 'loading';
  const resetting = useRef(Boolean(user.face_enrolled)).current;
  const title = resetting ? 'Reset Face Data' : 'Face Registration';
  const close = () => { if (!submitting.current) onClose(); };

  useEffect(() => {
    if (step !== 'preview') return;
    const pauseCamera = () => {
      if (!document.hidden) return;
      setReady(false);
      setConsented(false);
      setImage(null);
      setIdImage(null);
      idAttempt.current += 1;
      setPreparingId(false);
      setError('');
      setStep('consent');
    };
    document.addEventListener('visibilitychange', pauseCamera);
    return () => document.removeEventListener('visibilitychange', pauseCamera);
  }, [step]);

  const restart = () => {
    setReady(false);
    setImage(null);
    setError('');
    setCameraAttempt(value => value + 1);
    setStep('preview');
  };

  const capture = () => {
    try {
      const frame = webcam.current?.getScreenshot();
      if (!frame || !frame.startsWith('data:image/jpeg;base64,')) {
        setError('No camera frame is available yet. Wait for the preview or retry the camera.');
        return;
      }
      setImage(frame);
      setError('');
      setStep('captured');
    } catch {
      setError('The photo could not be captured. Retry the camera and check its permissions.');
    }
  };

  const enroll = async () => {
    if (!consented || !image || submitting.current) return;
    submitting.current = true;
    setError('');
    setStep('loading');
    try {
      if (selfService) await enrollFace(image, consented, idImage);
      else await enrollMemberFace(user.id, image, consented);
      setImage(null);
      setIdImage(null);
      setStep('success');
      onSuccess();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const fallback = selfService ? 'Enrollment could not be confirmed. Refresh your profile before retrying.' : 'Enrollment could not be confirmed. Refresh the member list before retrying.';
      setError((typeof detail === 'string' ? detail : fallback) + (selfService ? ' Comparison images were discarded. Choose the ID photo again and retake your face when ready.' : ''));
      if (selfService) { setImage(null); setIdImage(null); setConsented(false); }
      setStep(selfService ? 'consent' : 'captured');
    } finally {
      submitting.current = false;
    }
  };

  return (
    <ModalFrame onClose={close} aria-label={title} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70">
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-panel p-6">
        <button aria-label="Close" disabled={busy} onClick={close} className="absolute right-4 top-4 p-2 text-muted disabled:opacity-50"><X size={18}/></button>
        <h2 className="rpl-section-title pr-8 font-semibold text-ink">{title}</h2>
        <p className="mb-4 text-sm text-muted">{user.name}</p>
        {step === 'consent' && (
          <div className="space-y-4 text-sm leading-6 text-muted">
            <p className="font-semibold text-ink">{selfService ? 'Enroll from home using your ID and a live camera capture.' : 'Ask the member to review this notice and make their own choice before starting the camera.'}</p>
            <p>The library uses a live camera image to create a facial template. It uses the template for library identification during borrowing and returns, face sign-in, and entrance attendance. {selfService ? 'For online enrollment, it compares your live face and uploaded ID portrait with the original ID verified by the librarian. Comparison images are discarded after checking; the encrypted facial template and verification result are kept. The original ID remains in the private library record.' : 'The system may retain a camera image when it detects a possible spoof for security review.'}</p>
            <p>Face enrollment is optional. You can sign in with your password, and library staff can help with identification for transactions and visits. Ask staff if you later want to remove your enrolled face data.</p>
            {selfService && <div className="space-y-3 rounded-xl border border-line bg-subtle p-3"><label className="block font-semibold text-ink">Photo ID (required)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={preparingId} className="mt-2 block w-full min-w-0 text-sm" onChange={async event => {
              const file = event.target.files?.[0], attempt = ++idAttempt.current;
              setIdImage(null); setError(''); if (!file) return;
              setPreparingId(true);
              try { const prepared = await encodeComparisonId(file); if (attempt === idAttempt.current) setIdImage(prepared); }
              catch (failure) { if (attempt === idAttempt.current) setError(identityError(failure)); }
              finally { if (attempt === idAttempt.current) setPreparingId(false); }
            }} /></label><p className="text-xs text-muted">Use a clear JPG, PNG or WEBP of the complete government photo ID, up to 10 MB. Readable text and one main portrait are needed. The photo is used for this comparison and cannot change your verified name.</p>{preparingId && <p role="status">Preparing ID photo…</p>}{idImage && <><img src={idImage} alt="ID ready for private comparison" className="max-h-36 w-full rounded-lg object-contain" /><p role="status" className="font-semibold text-success">ID photo ready. The server will check it with your live face.</p></>}</div>}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="inline-block text-link underline underline-offset-4">Read the library privacy notice (opens in a new tab)</a>
            <label className="flex items-start gap-3 rounded-lg border border-line bg-subtle p-3 text-ink">
              <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-action" />
              <span>I agree to have my face enrolled and used for the library purposes described above.</span>
            </label>
          </div>
        )}
        {resetting && (step === 'preview' || step === 'captured') && <p className="mb-4 text-sm text-muted">Capture a new live photo to replace the saved face data when enrollment succeeds.</p>}
        {step === 'preview' && (
          <>
            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-subtle">
              <Webcam key={cameraAttempt} ref={webcam} audio={false} mirrored={!selfService}
                screenshotFormat="image/jpeg" screenshotQuality={0.9} forceScreenshotSourceSize
                videoConstraints={VIDEO_CONSTRAINTS} className={`h-full w-full object-cover ${selfService ? '-scale-x-100' : ''}`}
                onCanPlay={() => { setReady(true); setError(''); }}
                onEmptied={() => setReady(false)}
                onUserMediaError={() => {
                  setReady(false);
                  setError('Camera unavailable. Allow camera access in your browser and close other apps using it, then retry.');
                }}
              />
            </div>
            <p role="status" className="my-3 text-sm text-muted">
              {ready ? "Position the member's face clearly in frame." : 'Waiting for the camera preview…'}
            </p>
          </>
        )}
        {image && <img src={image} alt="Captured face preview" className="w-full rounded-xl"/>}
        {error && <p role="alert" className="my-3 text-sm text-danger">{error}</p>}
        {busy && <p role="status" className="my-4 flex items-center gap-2"><RefreshCw className="animate-spin" size={18}/> Enrolling face…</p>}
        {step === 'success' && <div role="status" className="my-6 space-y-2 font-semibold text-success"><p>{resetting ? 'Face data reset successfully.' : 'Face enrolled successfully.'}</p>{selfService && <p className="text-sm">Verified for {user.name}. Comparison images were discarded.</p>}</div>}
        <div className="mt-4 flex flex-wrap gap-3">
          {step === 'consent' && <>
            <button onClick={close} className="rounded-lg border border-line px-4 py-3 text-sm">Cancel</button>
            <button onClick={() => setStep('preview')} disabled={!consented || (selfService && (!idImage || preparingId))} className="flex items-center gap-2 rounded-lg bg-action px-4 py-3 text-white disabled:opacity-50"><Camera size={16}/> Start camera</button>
          </>}
          {step === 'preview' && <>
            <button onClick={restart} className="rounded-lg border border-line px-4 py-3 text-sm">Retry camera</button>
            <button onClick={capture} disabled={!ready} className="flex items-center gap-2 rounded-lg bg-action px-4 py-3 text-white disabled:opacity-50"><Camera size={16}/> Capture</button>
          </>}
          {step === 'captured' && <>
            <button onClick={restart} className="rounded-lg border border-line px-4 py-3">Retake</button>
            <button onClick={enroll} className="flex items-center gap-2 rounded-lg bg-action px-4 py-3 text-white"><ScanFace size={16}/> {resetting ? 'Reset Face Data' : 'Enroll'}</button>
          </>}
          {step === 'success' && <button onClick={close} className="rounded-lg bg-action px-4 py-3 text-white">Done</button>}
        </div>
      </div>
    </ModalFrame>
  );
}
