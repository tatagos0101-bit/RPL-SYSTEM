import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, User, BadgeCheck, UserPlus, MoreHorizontal, RefreshCw,
  ScanFace, X, Camera, Upload, ImageIcon, CheckCircle2, Info,
  KeyRound,
} from 'lucide-react';
import Webcam from 'react-webcam';
import FloatingActions from '../../components/FloatingActions';
import {
  getMembers,
  updateMemberStatus,
  enrollMemberFace,
  registerMember,
  resetMemberPassword,
} from '../../api/librarian';
import { memberMatchesSearch } from '../../api/memberSearch';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';

const formatApiError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(', ');
  return detail || fallback;
};

// ─────────────────────────────────────────────────────────────────────────────
// Face Enrollment Modal
// ─────────────────────────────────────────────────────────────────────────────
function FaceEnrollModal({ user, onClose, onSuccess }) {
  const webcamRef = useRef(null);
  const [step, setStep] = useState('preview');
  const [img, setImg]   = useState(null);
  const [err, setErr]   = useState('');

  const capture = useCallback(() => {
    const s = webcamRef.current?.getScreenshot();
    if (s) { setImg(s); setStep('captured'); }
  }, []);

  const retake  = () => { setImg(null); setStep('preview'); setErr(''); };
  const confirm = () => {
    setStep('loading');
    enrollMemberFace(user.id, img)
      .then(() => { setStep('success'); setTimeout(() => { onSuccess(); onClose(); }, 1500); })
      .catch(e  => { setErr(e?.response?.data?.detail || 'Enrollment failed.'); setStep('error'); });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          <X size={16}/>
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400 mb-1">Face Registration</p>
        <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white mb-0.5">Enroll <span className="text-blue-600">Face ID</span></h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-5">{user.name}</p>

        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-950 border-2 border-blue-500/30 mb-5">
          {step === 'preview' && (
            <>
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode:'user', width:480, height:480 }} className="w-full h-full object-cover" mirrored />
              {['tl','tr','bl','br'].map(c => (
                <div key={c} className={`absolute w-7 h-7 border-blue-400 pointer-events-none
                  ${c==='tl'?'top-3 left-3 border-t-2 border-l-2 rounded-tl-lg':''}
                  ${c==='tr'?'top-3 right-3 border-t-2 border-r-2 rounded-tr-lg':''}
                  ${c==='bl'?'bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg':''}
                  ${c==='br'?'bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg':''}`}/>
              ))}
            </>
          )}
          {(step==='captured'||step==='loading') && img && <img src={img} alt="" className="w-full h-full object-cover"/>}
          {step==='loading' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70"><RefreshCw size={32} className="animate-spin text-blue-400 mb-2"/><p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Enrolling…</p></div>}
          {step==='success' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/80"><div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-3"><ScanFace size={32} className="text-emerald-400"/></div><p className="text-emerald-400 font-black uppercase tracking-widest text-xs">Face Enrolled!</p></div>}
          {step==='error'   && <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/80 px-4"><div className="w-14 h-14 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center mb-3"><X size={24} className="text-rose-400"/></div><p className="text-rose-400 font-black uppercase tracking-widest text-[10px] text-center">{err}</p></div>}
        </div>

        <div className="flex gap-2">
          {step==='preview' && <button onClick={capture} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"><Camera size={14}/>Capture</button>}
          {(step==='captured'||step==='error') && <>
            <button onClick={retake} className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95">Retake</button>
            {step==='captured' && <button onClick={confirm} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"><ScanFace size={14}/>Enroll</button>}
          </>}
        </div>
        {step==='preview' && <p className="text-center text-[9px] text-slate-400 uppercase tracking-widest font-bold mt-3">Position the member's face clearly in frame</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Register Member Modal
// ─────────────────────────────────────────────────────────────────────────────
function PasswordResetModal({ user, onClose }) {
  const [step, setStep] = useState('confirm');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState('');

  const resetPassword = async () => {
    setStep('loading');
    setError('');
    try {
      const { data } = await resetMemberPassword(user.id);
      setTemporaryPassword(data.temporary_password);
      setStep('success');
    } catch (err) {
      setError(formatApiError(err, 'Password reset failed.'));
      setStep('confirm');
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          <X size={16}/>
        </button>

        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400 mb-1">Account Recovery</p>
        <h2 className="text-2xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
          Reset <span className="text-blue-600">Password</span>
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{user.name}</p>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-900/20">
            <p className="text-xs font-bold text-rose-600 dark:text-rose-300">{error}</p>
          </div>
        )}

        {step === 'confirm' && (
          <>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-xs font-bold leading-relaxed text-amber-700 dark:text-amber-300">
                Verify the member's ID before continuing. This creates a new temporary password and the member must change it after login.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={resetPassword}
                className="flex-1 rounded-2xl bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-700 active:scale-95"
              >
                Reset Password
              </button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw size={28} className="animate-spin text-blue-600"/>
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Generating temporary password...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 size={30} className="text-emerald-500"/>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Temporary Password Created</p>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left dark:border-slate-700 dark:bg-slate-800">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Temporary Password</p>
              <p className="mt-1 break-all font-mono text-lg font-black text-slate-800 dark:text-slate-100">{temporaryPassword}</p>
            </div>
            <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
              Give this password directly to the member. They will be sent to the change-password screen after login.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-2xl bg-blue-600 px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-700 active:scale-95"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RegisterMemberModal({ onClose, onSuccess }) {
  const fileRef = useRef(null);
  const [form,      setForm]      = useState({ name:'', email:'', phone:'', location:'' });
  const [idFile,    setIdFile]    = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [errors,    setErrors]    = useState({});
  const [apiErr,    setApiErr]    = useState('');
  const [step,      setStep]      = useState('form'); // form | loading | success
  const [result,    setResult]    = useState(null);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIdFile(f);
    setErrors(v => ({ ...v, idFile: undefined }));
    if (f.type.startsWith('image/')) {
      const r = new FileReader();
      r.onload = ev => setIdPreview(ev.target.result);
      r.readAsDataURL(f);
    } else {
      setIdPreview(null);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())     e.name     = 'Full name is required.';
    if (!form.location.trim()) e.location = 'Address is required.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email.';
    if (!idFile) e.idFile = 'Please upload a valid government ID.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setStep('loading'); setApiErr('');
    const fd = new FormData();
    fd.append('name',     form.name.trim());
    if (form.email.trim()) fd.append('email', form.email.trim());
    if (form.phone.trim())    fd.append('phone',    form.phone.trim());
    fd.append('location', form.location.trim());
    fd.append('id_image', idFile);
    try {
      const res = await registerMember(fd);
      setResult(res.data);
      setStep('success');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setApiErr(Array.isArray(detail) ? detail.map(e => e.msg).join(', ') : (detail || 'Registration failed. Please try again.'));
      setStep('form');
    }
  };

  const field = (k) => ({
    value: form[k],
    onChange: (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(v => ({ ...v, [k]: undefined })); },
  });

  const inp = (err) =>
    `w-full bg-slate-100 dark:bg-slate-800 border ${err ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'} focus:border-blue-500 outline-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors`;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex-shrink-0 px-7 pt-7 pb-5 border-b border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"><X size={16}/></button>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400 mb-1">Librarian Terminal</p>
          <h2 className="text-2xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Register <span className="text-blue-600">New Member</span></h2>
        </div>

        {/* ── Success ── */}
        {step === 'success' && result && (
          <div className="flex-1 flex flex-col items-center justify-center px-7 py-10 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-400 flex items-center justify-center mb-5">
              <CheckCircle2 size={36} className="text-emerald-500"/>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">Member Registered!</p>
            <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-0.5">{result.name}</h3>
            <p className="text-sm text-slate-500 mb-6">{result.email}</p>
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 mb-3 w-full max-w-xs text-left space-y-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Member ID</p>
                <p className="font-mono font-black text-blue-600 dark:text-blue-400 text-lg">{result.member_id}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Temporary Password</p>
                <p className="font-mono font-black text-slate-700 dark:text-slate-200 text-base">{result.temporary_password}</p>
              </div>
            </div>
            {/* Reminder note */}
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl w-full max-w-xs text-left mb-6">
              <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Remind the member to change their password after first login.
              </p>
            </div>
            <button onClick={() => { onSuccess(); onClose(); }} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95">Done</button>
          </div>
        )}

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw size={28} className="animate-spin text-blue-600"/>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registering member…</p>
          </div>
        )}

        {/* ── Form ── */}
        {step === 'form' && (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-5 space-y-4">

              {/* API error */}
              {apiErr && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl">
                  <X size={13} className="text-rose-500 flex-shrink-0"/>
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{apiErr}</p>
                </div>
              )}

              {/* Default password notice — notification style, NOT editable */}
              <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/60 rounded-2xl">
                <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="text-xs font-black text-blue-700 dark:text-blue-300">A unique temporary password will be generated.</p>
                  <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                    Email or phone can be used for password recovery. Members without either can still be reset by a librarian.
                  </p>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Full Name <span className="text-rose-500">*</span></label>
                <input {...field('name')} type="text" placeholder="e.g. Juan Dela Cruz" className={inp(errors.name)}/>
                {errors.name  && <p className="mt-1 text-[10px] font-bold text-rose-500">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Email Address <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                <input {...field('email')} type="email" placeholder="name@domain.com" className={inp(errors.email)}/>
                <p className="mt-1 text-[10px] font-medium text-slate-400">Used for reset codes when available.</p>
                {errors.email && <p className="mt-1 text-[10px] font-bold text-rose-500">{errors.email}</p>}
              </div>

              {/* Phone + Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Phone</label>
                  <input {...field('phone')} type="tel" placeholder="+63 9XX XXX XXXX" className={inp(false)}/>
                  <p className="mt-1 text-[10px] font-medium text-slate-400">Can receive reset codes later.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Address <span className="text-rose-500">*</span></label>
                  <input {...field('location')} type="text" placeholder="City, Province" className={inp(errors.location)}/>
                  {errors.location && <p className="mt-1 text-[10px] font-bold text-rose-500">{errors.location}</p>}
                </div>
              </div>

              {/* ── Valid ID Upload ── */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
                  Valid Government ID <span className="text-rose-500">*</span>
                </label>

                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFile} className="hidden"/>

                {!idFile ? (
                  /* Upload drop zone */
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className={`w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all
                      ${errors.idFile
                        ? 'border-rose-400 bg-rose-50 dark:bg-rose-900/10'
                        : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                      }`}
                  >
                    <Upload size={22} className={errors.idFile ? 'text-rose-400' : 'text-slate-400'}/>
                    <div className="text-center">
                      <p className={`text-xs font-bold ${errors.idFile ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>Click to upload government ID</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">JPG · PNG · WEBP · PDF — max 10 MB</p>
                    </div>
                  </button>
                ) : (
                  /* Preview */
                  <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    {idPreview
                      ? <img src={idPreview} alt="ID preview" className="w-full max-h-48 object-contain"/>
                      : (
                        <div className="flex items-center gap-3 px-5 py-4">
                          <ImageIcon size={20} className="text-slate-400 flex-shrink-0"/>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{idFile.name}</p>
                            <p className="text-[10px] text-slate-400">{(idFile.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                      )
                    }
                    <div className="flex border-t border-slate-200 dark:border-slate-700">
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        Change
                      </button>
                      <button type="button" onClick={() => { setIdFile(null); setIdPreview(null); if (fileRef.current) fileRef.current.value=''; }}
                        className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors border-l border-slate-200 dark:border-slate-700">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                {errors.idFile && <p className="mt-1 text-[10px] font-bold text-rose-500">{errors.idFile}</p>}
              </div>

            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-7 py-5 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">
                Cancel
              </button>
              <button type="button" onClick={submit}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95">
                <UserPlus size={13}/> Register Member
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function LibUsers() {
  const [users,        setUsers]        = useState([]);
  const [stats,        setStats]        = useState({ total:0, active:0, suspended:0 });
  const [search,       setSearch]       = useState('');
  const [loading,      setLoading]      = useState(true);
  const [actionMenu,   setActionMenu]   = useState(null);
  const [actionAnchor, setActionAnchor] = useState(null);
  const closeActionMenu = useCallback(() => setActionMenu(null), []);
  const [enrollTarget, setEnrollTarget] = useState(null);
  const [resetTarget,  setResetTarget]  = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  const fetchMembers = useCallback(() => {
    setLoading(true);
    getMembers()
      .then(res => {
        const d = res.data;
        setUsers(d);
        setStats({ total: d.length, active: d.filter(u=>u.status==='active').length, suspended: d.filter(u=>u.status==='suspended').length });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchMembers, 0);
    return () => clearTimeout(id);
  }, [fetchMembers]);

  const toggleStatus = (id, cur) => {
    updateMemberStatus(id, cur==='active'?'suspended':'active').then(fetchMembers).catch(()=>{});
    setActionMenu(null);
  };

  const filtered = users.filter((u) => memberMatchesSearch(u, search));

  return (
    <div className="min-h-screen bg-transparent pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-1">Librarian Terminal</p>
            <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none">
              Registered <span className="text-blue-600">Users</span>
            </h1>
          </div>
          <button
            onClick={() => setShowRegister(true)}
            className="group flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 flex-shrink-0"
          >
            <UserPlus size={14} className="group-hover:rotate-12 transition-transform"/> Register Member
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-3 sm:gap-4 mb-7">
          {[
            { label:'Total Members', val:stats.total,     color:'text-blue-600 dark:text-blue-400',    hover:'hover:border-blue-300 dark:hover:border-blue-700' },
            { label:'Active',        val:stats.active,    color:'text-emerald-600 dark:text-emerald-400', hover:'hover:border-emerald-300 dark:hover:border-emerald-700' },
            { label:'Suspended',     val:stats.suspended, color:'text-rose-600 dark:text-rose-400',    hover:'hover:border-rose-300 dark:hover:border-rose-700' },
          ].map(s => (
            <div key={s.label} className={`bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 ${s.hover} rounded-[2rem] p-5 text-center hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-default`}>
              <p className={`text-3xl font-black tracking-tighter ${s.color}`}>{s.val}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-5 border-b border-blue-50 dark:border-slate-800">
            <h3 className="font-black italic uppercase tracking-tighter text-lg">All Members</h3>
            <div className="relative max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
              <input type="text" placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-8 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-52 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"/>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-blue-600"/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest border-b border-blue-50 dark:border-slate-800">
                    {['Member','ID','Location','Joined','Loans','Face ID','Status',''].map(h => (
                      <th key={h} className="px-6 py-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id} className="group border-b border-blue-50 dark:border-slate-800 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-blue-600 dark:text-blue-400"/>
                          </div>
                          <div>
                            <p className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                              {u.name}
                              {u.face_enrolled && <BadgeCheck size={12} className="text-blue-500"/>}
                            </p>
                            <p className="text-[9px] text-slate-400 font-medium">{u.email || 'No email on file'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-[10px] text-blue-600 dark:text-blue-400 font-black">{u.member_id}</td>
                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400 font-medium">{u.location||'—'}</td>
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {toUtcDate(u.joined_at).toLocaleDateString('en-PH',{month:'short',year:'numeric'})}
                      </td>
                      <td className="px-6 py-4 text-sm font-black">{u.active_loans}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${u.face_enrolled?'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400':'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                          {u.face_enrolled?'Enrolled':'None'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest inline-block ${u.status==='active'?'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400':'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 relative">
                        <button type="button" aria-label={`Actions for ${u.name}`} aria-expanded={actionMenu === u.id}
                          onClick={(event) => {
                            setActionAnchor(event.currentTarget);
                            setActionMenu(actionMenu===u.id?null:u.id);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                          <MoreHorizontal size={15}/>
                        </button>
                        {actionMenu===u.id && (
                          <FloatingActions anchor={actionAnchor} onClose={closeActionMenu}>
                            {!u.face_enrolled && (
                              <button onClick={() => { setActionMenu(null); setEnrollTarget(u); }}
                                className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 transition-all">
                                <ScanFace size={13}/> Register Face
                              </button>
                            )}
                            <button onClick={() => { setActionMenu(null); setResetTarget(u); }}
                              className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 transition-all">
                              <KeyRound size={13}/> Reset Password
                            </button>
                            <button onClick={() => toggleStatus(u.id, u.status)}
                              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${u.status==='active'?'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20':'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}>
                              {u.status==='active'?'Suspend':'Reactivate'}
                            </button>
                          </FloatingActions>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length===0 && (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-xs font-black uppercase tracking-widest">No members found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals — rendered at end of DOM so nothing can overlap */}
      {showRegister && (
        <RegisterMemberModal
          onClose={() => setShowRegister(false)}
          onSuccess={fetchMembers}
        />
      )}
      {enrollTarget && (
        <FaceEnrollModal
          user={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onSuccess={fetchMembers}
        />
      )}
      {resetTarget && (
        <PasswordResetModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
