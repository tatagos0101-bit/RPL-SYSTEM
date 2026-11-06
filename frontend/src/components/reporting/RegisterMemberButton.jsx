import { useRef, useState } from 'react';
import { CheckCircle2, Info, X, XCircle, Upload, ImageIcon, RefreshCw, UserPlus } from 'lucide-react';
import ModalFrame from '../ModalFrame';
import { registerMember } from '../../api/librarian';
const EMPTY_FORM = { name: '', email: '', phone: '', location: '' };
export default function RegisterMemberButton({ onRegistered }) {
  const [showRegModal, setShowRegModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regResult, setRegResult] = useState(null);
  const idFileRef = useRef(null);

  const handleRegClose = () => {
    setShowRegModal(false);
    setForm(EMPTY_FORM);
    setIdFile(null);
    setIdPreview(null);
    if (idFileRef.current) idFileRef.current.value = '';
    setRegError('');
    setRegResult(null);
  };

  const handleRegSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    if (!form.name.trim()) {
      setRegError('Full name is required.');
      return;
    }
    if (!form.location.trim()) {
      setRegError('Address is required.');
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setRegError('Enter a valid email address.');
      return;
    }
    if (!idFile) {
      setRegError('Please upload a valid government ID.');
      return;
    }

    setRegLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      if (form.email.trim()) fd.append('email', form.email.trim());
      if (form.phone.trim()) fd.append('phone', form.phone.trim());
      fd.append('location', form.location.trim());
      fd.append('id_image', idFile);
      const res = await registerMember(fd);
      setRegResult(res.data);
      setForm(EMPTY_FORM);
      setIdFile(null);
      setIdPreview(null);
      if (idFileRef.current) idFileRef.current.value = '';
      onRegistered?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRegError(Array.isArray(detail) ? detail.map((item) => item.msg).join(', ') : (detail || 'Registration failed. Please try again.'));
    } finally {
      setRegLoading(false);
    }
  };

  return <><button onClick={() => setShowRegModal(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white"><UserPlus size={16} />Register Member</button>
    {showRegModal && <RegisterMemberModal form={form} setForm={setForm} idFile={idFile} setIdFile={setIdFile} idPreview={idPreview} setIdPreview={setIdPreview} idFileRef={idFileRef} regLoading={regLoading} regError={regError} regResult={regResult} onClose={handleRegClose} onSubmit={handleRegSubmit} />}</>;
}
const RegisterMemberModal = ({
  form,
  setForm,
  idFile,
  setIdFile,
  idPreview,
  setIdPreview,
  idFileRef,
  regLoading,
  regError,
  regResult,
  onClose,
  onSubmit,
}) => (
  <ModalFrame onClose={onClose} aria-label="Register member" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
    <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-panel p-8 shadow-sm sm:p-10">
      <button aria-label="Close"
        onClick={onClose}
        className="absolute right-6 top-6 rounded-lg p-2 text-muted transition hover:bg-subtle hover:text-ink"
      >
        <X size={20} />
      </button>

      <h2 className="mb-1 font-semibold tracking-normal text-ink rpl-section-title">
        Register Member
      </h2>
      <p className="mb-7 border-b border-line pb-5 text-sm font-semibold tracking-normal text-muted">
        Create a new library member account
      </p>

      {regResult && (
        <div className="flex flex-col items-center space-y-4 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-success bg-success-soft">
            <CheckCircle2 size={28} className="text-success" />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold tracking-normal text-success">Member Registered</p>
            <p className="text-xl font-semibold text-ink">{regResult.name}</p>
            <p className="text-sm text-muted">{regResult.email || 'No email provided'}</p>
          </div>
          <div className="w-full space-y-3 rounded-xl border border-line bg-subtle px-5 py-4 text-left">
            <div>
              <p className="mb-1 text-sm font-semibold tracking-normal text-muted">Member ID</p>
              <p className="font-sans text-lg font-semibold text-link">{regResult.member_id}</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold tracking-normal text-muted">Temporary Password</p>
              <p className="font-sans font-semibold text-muted">{regResult.temporary_password}</p>
            </div>
          </div>
          <div className="flex w-full items-start gap-2.5 rounded-xl border border-warning bg-warning-soft px-4 py-3 text-left">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-warning" />
            <p className="text-sm font-medium text-warning">Remind the member to change their password after first login.</p>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-action py-3 text-sm font-semibold tracking-normal text-white transition hover:bg-action-hover"
          >
            Done
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className={`space-y-4 ${regResult ? 'hidden' : ''}`}>
        <div className="flex items-start gap-3 rounded-xl border border-line bg-info-soft px-4 py-3.5">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-link" />
          <div>
            <p className="text-sm font-semibold text-link">A unique temporary password will be generated.</p>
            <p className="mt-0.5 text-sm text-link">The member will be reminded to change this after first login.</p>
          </div>
        </div>

        <FormInput label="Full Name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="Juan dela Cruz" />
        <FormInput label="Email Address" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="juan@email.com" type="email" optional />
        <FormInput label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="09XX-XXX-XXXX" type="tel" optional />
        <FormInput label="Address / Barangay" required value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Brgy. San Jose, Antipolo" />

        <div>
          <label className="mb-1.5 block text-sm font-semibold tracking-normal text-muted">
            Valid Government ID <span className="text-danger">*</span>
          </label>
          <input
            ref={idFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIdFile(file);
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => setIdPreview(ev.target.result);
                reader.readAsDataURL(file);
              } else {
                setIdPreview(null);
              }
            }}
            className="hidden"
          />
          {!idFile ? (
            <button
              type="button"
              onClick={() => idFileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-subtle py-7 transition hover:border-line hover:bg-info-soft"
            >
              <Upload size={20} className="text-muted" />
              <div className="text-center">
                <p className="text-sm font-bold text-muted">Click to upload government ID</p>
                <p className="mt-0.5 text-sm text-muted">JPG, PNG, WEBP, or PDF - max 10 MB</p>
              </div>
            </button>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-subtle">
              {idPreview ? (
                <img src={idPreview} alt="ID preview" className="max-h-40 w-full object-contain" />
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <ImageIcon size={18} className="flex-shrink-0 text-muted" />
                  <p className="truncate text-sm font-bold text-muted">{idFile.name}</p>
                </div>
              )}
              <div className="flex border-t border-line">
                <button
                  type="button"
                  onClick={() => idFileRef.current?.click()}
                  className="flex-1 py-2 text-sm font-semibold tracking-normal text-link transition hover:bg-info-soft"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdFile(null);
                    setIdPreview(null);
                    if (idFileRef.current) idFileRef.current.value = '';
                  }}
                  className="flex-1 border-l border-line py-2 text-sm font-semibold tracking-normal text-danger transition hover:bg-danger-soft"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {regError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger bg-danger-soft p-3">
            <XCircle size={14} className="mt-0.5 flex-shrink-0 text-danger" />
            <p className="text-sm font-bold text-danger">{regError}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-line py-3.5 text-sm font-semibold tracking-normal text-muted transition hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={regLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-action py-3.5 text-sm font-semibold tracking-normal text-white shadow-sm transition hover:bg-action-hover disabled:opacity-60"
          >
            {regLoading ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {regLoading ? 'Registering...' : 'Register Member'}
          </button>
        </div>
      </form>
    </div>
  </ModalFrame>
);

const FormInput = ({ label, value, onChange, placeholder, type = 'text', required = false, optional = false }) => (
  <div>
    <label className="mb-1.5 block text-sm font-semibold tracking-normal text-muted">
      {label} {required && <span className="text-danger">*</span>}
      {optional && <span className="font-normal normal-case text-muted"> (optional)</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full rounded-lg border border-line bg-subtle px-4 py-3 text-base font-medium text-ink outline-none transition placeholder:text-muted focus:ring-2 focus:ring-line"
    />
  </div>
);
