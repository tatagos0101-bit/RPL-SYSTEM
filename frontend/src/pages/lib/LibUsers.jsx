import ModalFrame from '../../components/ModalFrame';
import RegistrationDelivery from '../../components/RegistrationDelivery';
import { buildMemberRegistrationForm, registrationErrorMessage } from '../../api/memberRegistration';
import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, User, BadgeCheck, UserPlus, MoreHorizontal, RefreshCw,
  ScanFace, X, Camera, Upload, ImageIcon, CheckCircle2, Info,
  KeyRound, MapPin, Trash2,
} from 'lucide-react';
import FaceEnrollModal from '../../components/FaceEnrollModal';
import MemberDeletionModal from '../../components/MemberDeletionModal';
import AccountActivityReview, { AccountNoticeQueue } from '../../components/AccountActivityReview';
import FloatingActions from '../../components/FloatingActions';
import {
  getMemberStats,
  updateMemberStatus,
  registerMember,
  resetMemberPassword,
  fillMissingMemberAddresses,
} from '../../api/librarian';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import '../../styles/librarian-members.css';

const formatApiError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(', ');
  return detail || fallback;
};

function FillMissingAddressesModal({ onClose, onApplied }) {
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!pending.current) onClose(); };

  const fillAddresses = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const { data } = await fillMissingMemberAddresses();
      if (!Number.isInteger(data?.updated) || data.updated < 0) throw new Error('Address update was not confirmed.');
      onApplied(data.updated);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'The address update could not be confirmed. Refresh the member list before retrying.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalFrame onClose={close} aria-labelledby="fill-addresses-title" aria-describedby="fill-addresses-description"
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-panel p-6 text-ink">
        <h2 id="fill-addresses-title" className="rpl-section-title">Fill Missing Addresses</h2>
        <div id="fill-addresses-description" className="mt-3 space-y-2 text-sm leading-6 text-muted">
          <p>Assign an unverified barangay in Angono, Cainta, or Taytay to each member with a blank address and no placeholder. Members with the same last name receive the same generated location.</p>
          <p>This action covers all members with missing addresses across all pages and search results. Existing addresses are preserved.</p>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={close} disabled={saving} className="rounded-lg border border-line px-4 py-3 text-sm font-semibold hover:bg-subtle disabled:opacity-60">Cancel</button>
          <button type="button" onClick={fillAddresses} disabled={saving} className="rounded-lg bg-action px-4 py-3 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60">
            {saving ? 'Assigning addresses…' : 'Assign addresses'}
          </button>
        </div>
      </div>
    </ModalFrame>
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
    <ModalFrame onClose={onClose} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70">
      <div className="relative w-full max-w-md rounded-xl border border-line bg-panel p-7 shadow-sm">
        <button aria-label="Close" onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-muted hover:bg-subtle transition-all">
          <X size={16}/>
        </button>

        <p className="text-sm font-semibold tracking-normal text-link mb-1">Account Recovery</p>
        <h2 className="font-semibold tracking-normal text-ink rpl-section-title">
          Reset <span className="text-link">Password</span>
        </h2>
        <p className="mt-1 text-sm font-medium text-muted">{user.name}</p>

        {error && (
          <div className="mt-5 rounded-xl border border-danger bg-danger-soft px-4 py-3">
            <p className="text-sm font-bold text-danger">{error}</p>
          </div>
        )}

        {step === 'confirm' && (
          <>
            <div className="mt-6 rounded-xl border border-warning bg-warning-soft px-4 py-3">
              <p className="text-sm font-bold leading-relaxed text-warning">
                Verify the member's ID before continuing. This creates a new temporary password and the member must change it after login.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-line py-3 text-sm font-semibold tracking-normal text-muted transition-all hover:bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={resetPassword}
                className="flex-1 rounded-lg bg-action py-3 text-sm font-semibold tracking-normal text-white transition-all hover:bg-action-hover"
              >
                Reset Password
              </button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw size={28} className="animate-spin text-link"/>
            <p className="mt-3 text-sm font-semibold tracking-normal text-muted">Generating temporary password...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-success bg-success-soft">
              <CheckCircle2 size={30} className="text-success"/>
            </div>
            <p className="text-sm font-semibold tracking-normal text-success">Temporary Password Created</p>
            <div className="mt-4 rounded-xl border border-line bg-subtle px-5 py-4 text-left">
              <p className="text-sm font-semibold tracking-normal text-muted">Temporary Password</p>
              <p className="mt-1 break-all font-sans text-lg font-semibold text-ink">{temporaryPassword}</p>
            </div>
            <p className="mt-4 text-sm font-medium leading-relaxed text-muted">
              Give this password directly to the member. They will be sent to the change-password screen after login.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-lg bg-action px-8 py-3 text-sm font-semibold tracking-normal text-white transition-all hover:bg-action-hover"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </ModalFrame>
  );
}

function RegisterMemberModal({ onClose, onSuccess }) {
  const fileRef = useRef(null);
  const [form,      setForm]      = useState({ name:'', email:'', location:'' });
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
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setStep('loading'); setApiErr('');
    const fd = buildMemberRegistrationForm(form, idFile);
    try {
      const res = await registerMember(fd);
      setResult(res.data);
      setStep('success');
    } catch (err) {
      setApiErr(registrationErrorMessage(err));
      setStep('form');
    }
  };

  const field = (k) => ({
    value: form[k],
    onChange: (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(v => ({ ...v, [k]: undefined })); },
  });

  const inp = (err) =>
    `w-full bg-subtle border ${err ? 'border-danger' : 'border-line '} focus:border-line outline-none rounded-lg px-4 py-2.5 text-base font-medium text-ink placeholder-muted transition-colors`;

  const close = () => { if (step !== 'loading') onClose(); };

  return (
    <ModalFrame onClose={close} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70">
      <div className="bg-panel border border-line rounded-xl shadow-sm w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex-shrink-0 px-7 pt-7 pb-5 border-b border-line">
          <button aria-label="Close" disabled={step === 'loading'} onClick={close} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-muted hover:bg-subtle transition-all"><X size={16}/></button>
          <p className="text-sm font-semibold tracking-normal text-link mb-1">Librarian Terminal</p>
          <h2 className="font-semibold tracking-normal text-ink rpl-section-title">Register <span className="text-link">New Member</span></h2>
        </div>

        {/* ── Success ── */}
        {step === 'success' && result && (
          <div className="flex-1 flex flex-col items-center justify-center px-7 py-10 text-center">
            <div className="w-20 h-20 rounded-full bg-success-soft border-2 border-success flex items-center justify-center mb-5">
              <CheckCircle2 size={36} className="text-success"/>
            </div>
            <p className="text-sm font-semibold tracking-normal text-success mb-1">Member Registered!</p>
            <h3 className="font-semibold tracking-normal text-ink mb-0.5 rpl-subheading">{result.name}</h3>
            <p className="text-sm text-muted mb-6">{result.email}</p>
            <div className="bg-subtle border border-line rounded-xl px-6 py-4 mb-3 w-full max-w-xs text-left space-y-3">
              <div>
                <p className="text-sm font-semibold tracking-normal text-muted mb-1">Member ID</p>
                <p className="font-sans font-semibold text-link text-lg">{result.member_id}</p>
              </div>
              <RegistrationDelivery result={result} />
            </div>
            {/* Reminder note */}
            <div className="flex items-start gap-2.5 px-4 py-3 bg-warning-soft border border-warning rounded-xl w-full max-w-xs text-left mb-6">
              <Info size={14} className="text-warning flex-shrink-0 mt-0.5"/>
              <p className="text-sm font-medium text-warning">
                The member must review and accept the Privacy Notice and choose a new password on their first sign-in.
              </p>
            </div>
            <button onClick={() => { onSuccess(); onClose(); }} className="px-8 py-3 bg-action hover:bg-action-hover text-white rounded-lg font-semibold text-sm tracking-normal transition-all">Done</button>
          </div>
        )}

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw size={28} className="animate-spin text-link"/>
            <p className="text-sm font-semibold tracking-normal text-muted">Registering member…</p>
          </div>
        )}

        {/* ── Form ── */}
        {step === 'form' && (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-5 space-y-4">

              {/* API error */}
              {apiErr && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-danger-soft border border-danger rounded-xl">
                  <X size={13} className="text-danger flex-shrink-0"/>
                  <p className="text-sm font-bold text-danger">{apiErr}</p>
                </div>
              )}

              {/* Default password notice — notification style, NOT editable */}
              <div className="flex items-start gap-3 px-4 py-3.5 bg-info-soft border border-line rounded-xl">
                <Info size={15} className="text-link flex-shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-semibold text-link">A unique temporary password will be generated.</p>
                  <p className="text-sm text-link mt-0.5">
                    The temporary password is sent by email when provided. Without email, it will appear here for you to give directly to the member.
                  </p>
                  <p className="mt-2 text-sm text-ink">Share the <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-4">Library Privacy Notice (opens in a new tab)</a> with the member before registering.</p>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">Full Name <span className="text-danger">*</span></label>
                <input aria-label="Full Name" {...field('name')} type="text" placeholder="e.g. Juan Dela Cruz" className={inp(errors.name)}/>
                {errors.name  && <p className="mt-1 text-sm font-bold text-danger">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">Email Address <span className="text-muted font-normal normal-case">(optional)</span></label>
                <input aria-label="Email Address" {...field('email')} type="email" placeholder="name@domain.com" className={inp(errors.email)}/>
                <p className="mt-1 text-sm font-medium text-muted">Receives the temporary password when provided.</p>
                {errors.email && <p className="mt-1 text-sm font-bold text-danger">{errors.email}</p>}
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">Address <span className="text-danger">*</span></label>
                <input aria-label="Address" {...field('location')} type="text" placeholder="City, Province" className={inp(errors.location)}/>
                {errors.location && <p className="mt-1 text-sm font-bold text-danger">{errors.location}</p>}
              </div>

              {/* ── Valid ID Upload ── */}
              <div>
                <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">
                  Government ID <span className="font-normal normal-case">(optional)</span>
                </label>

                <input ref={fileRef} type="file" aria-label="Government ID (optional)" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFile} className="hidden"/>

                {!idFile ? (
                  /* Upload drop zone */
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className={`w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-all
 ${errors.idFile
                        ? 'border-danger bg-danger-soft bg-danger-soft'
                        : 'border-line bg-subtle hover:border-line hover:border-line hover:bg-info-soft hover:bg-info-soft'
                      }`}
                  >
                    <Upload size={22} className={errors.idFile ? 'text-danger' : 'text-muted'}/>
                    <div className="text-center">
                      <p className={`text-sm font-bold ${errors.idFile ? 'text-danger' : 'text-muted '}`}>Click to upload government ID</p>
                      <p className="text-sm text-muted mt-0.5">JPG · PNG · WEBP · PDF — max 10 MB</p>
                    </div>
                  </button>
                ) : (
                  /* Preview */
                  <div className="rounded-xl overflow-hidden border border-line bg-subtle">
                    {idPreview
                      ? <img src={idPreview} alt="ID preview" className="w-full max-h-48 object-contain"/>
                      : (
                        <div className="flex items-center gap-3 px-5 py-4">
                          <ImageIcon size={20} className="text-muted flex-shrink-0"/>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-muted truncate">{idFile.name}</p>
                            <p className="text-sm text-muted">{(idFile.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                      )
                    }
                    <div className="flex border-t border-line">
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="flex-1 py-2 text-sm font-semibold tracking-normal text-link hover:bg-info-soft transition-colors">
                        Change
                      </button>
                      <button type="button" onClick={() => { setIdFile(null); setIdPreview(null); if (fileRef.current) fileRef.current.value=''; }}
                        className="flex-1 py-2 text-sm font-semibold tracking-normal text-danger hover:bg-danger-soft transition-colors border-l border-line">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                {errors.idFile && <p className="mt-1 text-sm font-bold text-danger">{errors.idFile}</p>}
              </div>

            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-7 py-5 border-t border-line flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-3 border border-line text-muted hover:bg-subtle rounded-lg font-semibold text-sm tracking-normal transition-all">
                Cancel
              </button>
              <button type="button" onClick={submit}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-action hover:bg-action-hover text-white rounded-lg font-semibold text-sm tracking-normal transition-all">
                <UserPlus size={13}/> Register Member
              </button>
            </div>
          </>
        )}
      </div>
    </ModalFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function LibUsers() {
  const [stats,        setStats]        = useState({ total:0, active:0, suspended:0 });
  const [search,       setSearch]       = useState('');
  const [actionMenu,   setActionMenu]   = useState(null);
  const [actionAnchor, setActionAnchor] = useState(null);
  const closeActionMenu = useCallback(() => setActionMenu(null), []);
  const [enrollTarget, setEnrollTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [accountReview, setAccountReview] = useState(null);
  const [noticeRevision, setNoticeRevision] = useState(0);
  const [resetTarget,  setResetTarget]  = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showFillAddresses, setShowFillAddresses] = useState(false);
  const [addressNotice, setAddressNotice] = useState('');

  const listing = useServerPage('/api/librarian/users', { search }, '/api/librarian/users/count');
  const { items: users, loading, reload } = listing;
  const [operationError, setOperationError] = useState('');
  const fetchMembers = useCallback(() => {
    setOperationError('');
    reload();
    getMemberStats().then(({ data }) => setStats(data)).catch(() => setOperationError('Member totals unavailable. Retry loading.'));
  }, [reload]);
  useEffect(() => { const timer = setTimeout(fetchMembers, 0); return () => clearTimeout(timer); }, [fetchMembers]);

  const toggleStatus = (id, cur) => {
    updateMemberStatus(id, cur==='active'?'suspended':'active').then(fetchMembers).catch(() => setOperationError('Status update could not be confirmed. Refresh before retrying.'));
    setActionMenu(null);
  };

  const onAddressesApplied = (updated) => {
    setShowFillAddresses(false);
    setAddressNotice(updated === 0 ? 'No new addresses were assigned.' :
      `Assigned ${updated} generated ${updated === 1 ? 'address' : 'addresses'}.`);
    fetchMembers();
  };

  const filtered = users;

  return (
    <div className="rpl-page staff-members-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">
        {operationError && <p role="alert">{operationError} <button className="underline" onClick={fetchMembers}>Retry loading</button></p>}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-sm font-semibold tracking-normal text-link mb-1">Librarian Terminal</p>
            <h1 className="font-semibold tracking-normal leading-none rpl-title">
              Registered <span className="text-link">Users</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button"
              onClick={() => { setAddressNotice(''); setShowFillAddresses(true); }}
              className="flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3.5 text-sm font-semibold text-ink hover:bg-subtle">
              <MapPin size={14} /> Fill Missing Addresses
            </button>
            <button type="button"
              onClick={() => setShowRegister(true)}
              className="group flex items-center gap-2 px-6 py-3.5 bg-action hover:bg-action-hover text-white rounded-lg font-semibold text-sm tracking-normal transition-all shadow-sm flex-shrink-0"
            >
              <UserPlus size={14} className="transition-transform"/> Register Member
            </button>
          </div>
        </div>

        {addressNotice && <p role="status" className="mb-6 rounded-lg border border-line bg-info-soft px-4 py-3 text-sm text-ink">{addressNotice}</p>}

        {/* Stats */}
        <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-3 sm:gap-4 mb-7">
          {[
            { label:'Total Members', val:stats.total,     color:'text-link text-link',    hover:'hover:border-line hover:border-line' },
            { label:'Active',        val:stats.active,    color:'text-success text-success', hover:'hover:border-success hover:border-success' },
            { label:'Suspended',     val:stats.suspended, color:'text-danger text-danger',    hover:'hover:border-danger hover:border-danger' },
          ].map(s => (
            <div key={s.label} className={`bg-panel border border-line border-line ${s.hover} rounded-xl p-5 text-center hover:shadow-sm transition-all duration-200 cursor-default`}>
              <p className={`text-3xl font-semibold tracking-normal ${s.color}`}>{s.val}</p>
              <p className="text-sm font-semibold tracking-normal text-muted mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <AccountNoticeQueue revision={noticeRevision} onReview={setAccountReview} />

        {/* Table */}
        <div className="staff-members-panel bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-5 border-b border-line">
            <h3 id="members-list-heading" className="font-semibold tracking-normal rpl-subheading">All Members</h3>
            <div className="staff-members-search relative max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14}/>
              <input aria-label="Search name or ID…" type="text" placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)}
                className="bg-subtle border border-line rounded-lg py-2 pl-8 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line w-full sm:w-52 text-muted placeholder:text-muted"/>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-link"/></div>
          ) : (
            <div className="staff-members-scroll overflow-x-auto">
              <table role="table" aria-labelledby="members-list-heading" className="staff-members-table w-full text-left">
                <thead role="rowgroup">
                  <tr role="row" className="text-sm font-semibold text-muted tracking-normal border-b border-line">
                    {['Member','ID','Location','Joined','Loans','Face ID','Status','Actions'].map(h => (
                      <th key={h} role="columnheader" scope="col" className="px-6 py-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {filtered.map(u => (
                    <tr key={u.id} role="row" className="staff-member-row group border-b border-line hover:bg-info-soft hover:bg-subtle transition-all duration-200">
                      <td role="cell" className="staff-member-identity px-6 py-4">
                        <div className="staff-member-person flex items-center gap-3">
                          <div className="w-8 h-8 bg-info-soft rounded-xl flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-link"/>
                          </div>
                          <div className="min-w-0">
                            <p className="staff-member-name font-bold text-sm text-ink flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {u.face_enrolled && <BadgeCheck size={12} className="shrink-0 text-link"/>}
                            </p>
                            <p className="staff-member-email text-sm text-muted font-medium">{u.email || 'No email on file'}</p>
                          </div>
                        </div>
                      </td>
                      <td role="cell" className="staff-member-id px-6 py-4 font-sans text-sm text-link font-semibold"><span className="staff-member-label" aria-hidden="true">Member ID</span>{u.member_id}</td>
                      <td role="cell" className="px-6 py-4 text-sm text-muted font-medium">
                        <span className="staff-member-label" aria-hidden="true">Location</span>
                        {u.location || '—'}
                        {u.location_is_generated && <span className="block text-xs text-muted">Generated · Unverified</span>}
                      </td>
                      <td role="cell" className="staff-member-joined px-6 py-4 text-sm text-muted font-medium">
                        <span className="staff-member-label" aria-hidden="true">Joined</span>
                        {toUtcDate(u.joined_at).toLocaleDateString('en-PH',{month:'short',year:'numeric'})}
                      </td>
                      <td role="cell" className="px-6 py-4 text-sm font-semibold"><span className="staff-member-label" aria-hidden="true">Loans</span>{u.active_loans}</td>
                      <td role="cell" className="px-6 py-4">
                        <span className="staff-member-label" aria-hidden="true">Face ID</span>
                        <span title={!u.face_enrolled && u.face_enrollment_display_only ? 'Display status only; no facial template is registered.' : undefined} aria-label={!u.face_enrolled && u.face_enrollment_display_only ? 'Enrolled — display status only' : undefined} className={`staff-member-badge px-2 py-0.5 rounded-full text-sm font-semibold ${u.face_enrolled || u.face_enrollment_display_only?'bg-info-soft bg-info-soft text-link text-link':'bg-subtle text-muted'}`}>
                          {u.face_enrolled || u.face_enrollment_display_only?'Enrolled':'None'}
                        </span>
                      </td>
                      <td role="cell" className="px-6 py-4">
                        <span className="staff-member-label" aria-hidden="true">Status</span>
                        <span className={`staff-member-badge px-2.5 py-1 rounded-full text-sm font-semibold tracking-normal inline-block ${u.status==='active'?'bg-success-soft bg-success-soft text-success text-success':'bg-danger-soft bg-danger-soft text-danger text-danger'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td role="cell" className="staff-member-actions px-6 py-4 relative">
                        <button type="button" aria-label={`Actions for ${u.name}`} aria-expanded={actionMenu === u.id}
                          onClick={(event) => {
                            setActionAnchor(event.currentTarget);
                            setActionMenu(actionMenu===u.id?null:u.id);
                          }}
                          className="staff-member-actions-button p-2 text-muted hover:text-muted hover:bg-subtle rounded-lg transition-all">
                          <MoreHorizontal size={15}/>
                        </button>
                        {actionMenu===u.id && (
                          <FloatingActions anchor={actionAnchor} onClose={closeActionMenu}>
                            {(
                              <button onClick={() => { setActionMenu(null); setEnrollTarget(u); }}
                                className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold tracking-normal text-link hover:bg-info-soft flex items-center gap-2 transition-all">
                                <ScanFace size={13}/> {u.face_enrolled ? 'Reset Face Data' : 'Register Face'}
                              </button>
                            )}
                            {u.face_enrolled && <button onClick={() => { setActionMenu(null); setDeleteTarget({ user: u, kind: 'face' }); }}
                              className="flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm font-semibold text-danger hover:bg-danger-soft">
                              <Trash2 size={13}/> Delete Face Data
                            </button>}
                            <button onClick={() => { setActionMenu(null); setAccountReview(u); }}
                              className="flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm font-semibold text-danger hover:bg-danger-soft">
                              <Trash2 size={13}/> Delete Account
                            </button>
                            <button onClick={() => { setActionMenu(null); setResetTarget(u); }}
                              className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold tracking-normal text-warning hover:bg-warning-soft flex items-center gap-2 transition-all">
                              <KeyRound size={13}/> Reset Password
                            </button>
                            <button onClick={() => toggleStatus(u.id, u.status)}
                              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold tracking-normal transition-all ${u.status==='active'?'text-danger hover:bg-danger-soft hover:bg-danger-soft':'text-success hover:bg-success-soft hover:bg-success-soft'}`}>
                              {u.status==='active'?'Suspend':'Reactivate'}
                            </button>
                          </FloatingActions>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length===0 && (
                    <tr role="row" className="staff-members-empty"><td role="cell" colSpan={8} className="text-center py-12 text-muted text-sm font-semibold tracking-normal">No members found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-line px-4 sm:px-6">
            <PageControls {...listing} />
          </div>
        </div>
      </div>

      {/* Modals — rendered at end of DOM so nothing can overlap */}
      {showRegister && (
        <RegisterMemberModal
          onClose={() => setShowRegister(false)}
          onSuccess={fetchMembers}
        />
      )}
      {showFillAddresses && <FillMissingAddressesModal onClose={() => setShowFillAddresses(false)} onApplied={onAddressesApplied} />}
      {enrollTarget && (
        <FaceEnrollModal
          user={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onSuccess={fetchMembers}
        />
      )}
      {deleteTarget && <MemberDeletionModal {...deleteTarget} onClose={() => setDeleteTarget(null)}
        onSuccess={() => { fetchMembers(); setNoticeRevision(value => value + 1); }} />}
      {accountReview && <AccountActivityReview user={accountReview} onClose={() => setAccountReview(null)}
        onChanged={() => { fetchMembers(); setNoticeRevision(value => value + 1); }}
        onDeleteNow={user => { setAccountReview(null); setDeleteTarget({ user, kind: 'account' }); }}
        onApprove={(user, noticeId) => { setAccountReview(null); setDeleteTarget({ user, kind: 'account', noticeId }); }} />}
      {resetTarget && (
        <PasswordResetModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
