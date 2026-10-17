import { isValidNewPassword, passwordPolicyMessage } from '../../api/passwordPolicy';
import { useState, useEffect, useRef } from 'react';
import {
  BadgeCheck, Mail, MapPin, Phone, Shield, BookOpen,
  Calendar, RefreshCw, Check, X, Lock, Eye, EyeOff,
  KeyRound, ChevronDown, ChevronUp, AlertCircle, Camera,
  Edit3, UserCircle2,
} from 'lucide-react';
import { getProfile, getBiometricStatus, updateProfile, changePassword, uploadAvatar } from '../../api/user';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import { assetUrl } from '../../api/urls';

const getInitials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// ── Avatar Upload ─────────────────────────────────────────────────────────────

function AvatarUpload({ currentUrl, name, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const imgSrc = preview || assetUrl(currentUrl);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const res = await uploadAvatar(file);
      onUploaded(res.data.avatar_url);
    } catch {
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />

      {/* Avatar circle */}
      <div className="w-24 h-24 rounded-xl overflow-hidden bg-action border-4 border-line shadow-sm flex items-center justify-center flex-shrink-0">
        {imgSrc ? (
          <img src={imgSrc} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-semibold text-2xl tracking-normal select-none">{getInitials(name)}</span>
        )}
      </div>

      {/* Upload overlay */}
      <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1">
        {uploading ? (
          <RefreshCw size={18} className="animate-spin text-white" />
        ) : (
          <>
            <Camera size={16} className="text-white" />
            <span className="text-sm font-semibold tracking-normal text-white text-center leading-tight">Upload<br />Photo</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Password Change ───────────────────────────────────────────────────────────

function PasswordChangeForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setForm({ current: '', next: '', confirm: '' });
    setErrors({});
    setApiError('');
    setSuccess(false);
  };

  const validate = () => {
    const e = {};
    if (!form.current) e.current = 'Required.';
    if (!form.next) e.next = 'Required.';
    else if (!isValidNewPassword(form.next)) e.next = passwordPolicyMessage;
    if (form.next !== form.confirm) e.confirm = 'Passwords do not match.';
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiError('');
    try {
      await changePassword(form.current, form.next);
      setSuccess(true);
      reset();
      setTimeout(() => { setOpen(false); setSuccess(false); }, 2000);
    } catch (err) {
      setApiError(err?.response?.data?.detail || 'Failed. Try again.');
    } finally { setSaving(false); }
  };

  const wrap = (err) =>
    `flex items-center gap-2 px-3.5 py-2.5 rounded-xl border ${err ? 'border-danger' : 'border-line'} bg-subtle focus-within:border-line transition-colors`;

  const inp = 'min-w-0 w-full flex-1 bg-transparent outline-none text-base font-medium text-ink placeholder-muted';

  return (
    <div className="rounded-xl overflow-hidden border border-line">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (open) reset(); }}
        className="w-full flex flex-wrap gap-3 items-center justify-between px-4 sm:px-5 py-4 bg-subtle hover:bg-subtle transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-subtle border border-line flex items-center justify-center">
            <KeyRound size={13} className="text-link" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold tracking-normal text-muted">Password</p>
            <p className="text-sm font-bold text-ink">
              {success ? <span className="text-success flex items-center gap-1"><Check size={12} /> Updated</span> : '••••••••••'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-normal px-2 py-1 rounded-lg bg-info-soft text-link border border-line">
            {open ? 'Close' : 'Change'}
          </span>
          {open ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
        </div>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-5 pt-4 pb-5 bg-panel border-t border-line space-y-3">
          {apiError && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-danger-soft border border-danger rounded-xl">
              <AlertCircle size={12} className="text-danger flex-shrink-0" />
              <p className="text-sm font-bold text-danger">{apiError}</p>
            </div>
          )}
          {[
            { key: 'current', label: 'Current Password', ph: 'Enter current password' },
            { key: 'next',    label: 'New Password',     ph: passwordPolicyMessage },
            { key: 'confirm', label: 'Confirm New',      ph: 'Re-enter new password' },
          ].map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">{label}</label>
              <div className={wrap(errors[key])}>
                <Lock size={12} className="text-muted flex-shrink-0" />
                <input
                  type={show[key] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(v => ({ ...v, [key]: undefined })); }}
                  placeholder={ph}
                  className={inp}
                />
                <button type="button" onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))} className="text-muted hover:text-ink transition-colors flex-shrink-0">
                  {show[key] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {errors[key] && <p className="mt-1 text-sm font-bold text-danger">{errors[key]}</p>}
            </div>
          ))}
          {/* Strength bar */}
          {form.next.length > 0 && (
            <div className="flex items-center gap-1">
              {[6, 9, 12].map((l, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${form.next.length >= l ? ['bg-rose-500','bg-amber-400','bg-emerald-400'][i] : 'bg-subtle'}`} />
              ))}
              <span className="text-sm font-semibold tracking-normal text-muted ml-1">
                {!isValidNewPassword(form.next) ? 'Weak' : form.next.length < 9 ? 'Fair' : form.next.length < 12 ? 'Good' : 'Strong'}
              </span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => { setOpen(false); reset(); }} disabled={saving}
              className="flex-1 py-2.5 border border-line text-muted hover:bg-subtle rounded-lg font-semibold text-sm tracking-normal transition-all disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-action hover:bg-action-hover disabled:opacity-60 text-white rounded-lg font-semibold text-sm tracking-normal transition-all">
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UserProfile() {
  const [profile, setProfile] = useState(null);
  const [biometric, setBiometric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getProfile(), getBiometricStatus()])
      .then(([p, b]) => {
        setProfile(p.data);
        setBiometric(b.data);
        setForm({ name: p.data.name || '', phone: p.data.phone || '', location: p.data.location || '' });
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('Name cannot be empty.'); return; }
    setSaving(true); setSaveError('');
    try {
      const res = await updateProfile({ name: form.name.trim(), phone: form.phone.trim() || null, location: form.location.trim() || null });
      setProfile(res.data);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch { setSaveError('Failed to save.'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="rpl-page min-h-screen flex items-center justify-center bg-panel">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={26} className="animate-spin text-link" />
        <p className="text-sm font-semibold tracking-normal text-muted">Loading…</p>
      </div>
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-panel">
      <p className="text-danger font-bold text-sm">{error || 'Could not load profile.'}</p>
    </div>
  );

  const memberSince = profile.member_since
    ? toUtcDate(profile.member_since).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const inputCls = 'w-full bg-subtle border border-line focus:border-line outline-none rounded-lg px-4 py-2.5 text-base font-medium text-ink placeholder-muted transition-colors';

  return (
    <div className="rpl-page rpl-profile min-h-screen bg-canvas text-ink pb-24 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 md:px-8 pt-8 space-y-5">

        {/* Page title */}
        <div>
          <p className="text-sm font-semibold tracking-normal text-link mb-1">Member Portal</p>
          <h1 className="font-semibold tracking-normal leading-none rpl-title">
            My <span className="text-link">Profile</span>
          </h1>
        </div>

        {/* ── Hero Card ── */}
        <div className="bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
          {/* Top strip — dark with dot pattern */}
          <div className="h-32 bg-subtle relative overflow-hidden">
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div className="absolute inset-0 bg-info-soft" />

            {/* Branding - Shifted right to avoid avatar overlap */}
            <div className="absolute bottom-4 right-8 text-right hidden sm:block">
              <p className="rpl-brand rpl-profile-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
              <p className="text-sm font-bold tracking-normal text-muted mt-1">Knowledge · Culture · Service</p>
            </div>

            {/* Mobile Branding */}
            <div className="absolute top-4 left-6 sm:hidden">
              <p className="rpl-brand rpl-profile-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
            </div>
          </div>

          <div className="px-6 md:px-8 pb-7">
            {/* Avatar + actions row */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 mb-5">
              <AvatarUpload
                currentUrl={profile.avatar_url}
                name={profile.name}
                onUploaded={(url) => setProfile(p => ({ ...p, avatar_url: url }))}
              />

              <div className="flex items-center gap-2.5 flex-wrap">
                {saveSuccess && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-success-soft border border-success rounded-xl text-sm font-bold text-success">
                    <Check size={12} /> Saved
                  </span>
                )}
                {!editing ? (
                  <button onClick={() => { setEditing(true); setSaveError(''); setSaveSuccess(false); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-action hover:bg-action-hover text-white rounded-lg font-semibold text-sm tracking-normal transition-all hover:shadow-sm">
                    <Edit3 size={12} /> Edit Profile
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditing(false); setForm({ name: profile.name || '', phone: profile.phone || '', location: profile.location || '' }); setSaveError(''); }}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-line text-muted hover:bg-subtle rounded-lg font-semibold text-sm tracking-normal transition-all disabled:opacity-50">
                      <X size={12} /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-action hover:bg-action-hover disabled:opacity-60 text-white rounded-lg font-semibold text-sm tracking-normal transition-all">
                      {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Name / ID */}
            {!editing ? (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <h2 className="font-semibold tracking-normal text-ink rpl-section-title">{profile.name}</h2>
                  <BadgeCheck size={18} className="text-link" />
                </div>
                <p className="text-sm font-semibold tracking-normal text-link mb-1">Verified Member</p>
                <p className="font-sans text-sm text-muted">{profile.member_id}</p>
              </div>
            ) : (
              <div className="max-w-xs">
                <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">Full Name</label>
                <input aria-label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Your full name" />
              </div>
            )}

            {saveError && (
              <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-danger-soft border border-danger rounded-xl">
                <X size={12} className="text-danger flex-shrink-0" />
                <p className="text-sm font-bold text-danger">{saveError}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Body grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left col — 2/3 */}
          <div className="min-w-0 lg:col-span-2 space-y-5">

            {/* Contact Information */}
            <div className="bg-panel border border-line rounded-xl p-6 md:p-8">
              <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
                <h3 className="font-semibold tracking-normal text-ink rpl-subheading">Contact Information</h3>
                {editing && <span className="text-sm font-semibold tracking-normal text-link bg-info-soft border border-line px-2.5 py-1 rounded-lg">Editing</span>}
              </div>

              <div className="space-y-2">
                {/* Email — always locked */}
                <InfoRow icon={<Mail size={13} />} label="Email" value={profile.email} locked />

                {/* Phone */}
                {editing ? (
                  <EditRow icon={<Phone size={13} />} label="Phone Number" value={form.phone}
                    onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+63 9XX XXX XXXX" type="tel" />
                ) : (
                  <InfoRow icon={<Phone size={13} />} label="Phone Number" value={profile.phone || '—'} />
                )}

                {/* Location */}
                {editing ? (
                  <EditRow icon={<MapPin size={13} />} label="Location" value={form.location}
                    onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="City, Province" />
                ) : (
                  <InfoRow icon={<MapPin size={13} />} label="Location" value={profile.location || '—'} />
                )}

                <InfoRow icon={<Calendar size={13} />} label="Member Since" value={memberSince} locked />
              </div>
            </div>

            {/* Account & Security */}
            <div className="bg-panel border border-line rounded-xl p-6 md:p-8">
              <h3 className="font-semibold tracking-normal text-ink mb-5 rpl-subheading">Account &amp; Security</h3>
              <div className="space-y-3">
                <PasswordChangeForm />
                <SecBadgeRow
                  icon={<BookOpen size={13} className="text-link" />}
                  label="Account Role"
                  value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                  badge={profile.role} badgeColor="blue"
                />
                <SecBadgeRow
                  icon={<Shield size={13} className={profile.status === 'active' ? 'text-success' : 'text-danger'} />}
                  label="Account Status"
                  value={profile.status === 'active' ? 'Active · Good Standing' : 'Suspended'}
                  badge={profile.status}
                  badgeColor={profile.status === 'active' ? 'emerald' : 'rose'}
                />
              </div>
            </div>
          </div>

          {/* Right col — 1/3 */}
          <div className="min-w-0 space-y-5">

            {/* Membership */}
            <div className="bg-panel border border-line rounded-xl p-6">
              <h3 className="font-semibold tracking-normal text-ink mb-5 rpl-subheading">Membership</h3>
              <div className="space-y-3">
                {/* Status pill */}
                <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${
                  profile.status === 'active'
                    ? 'bg-success-soft border-success'
                    : 'bg-danger-soft border-danger'
                }`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${profile.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <div>
                    <p className={`text-sm font-semibold tracking-normal ${profile.status === 'active' ? 'text-success' : 'text-danger'}`}>Status</p>
                    <p className={`text-sm font-bold ${profile.status === 'active' ? 'text-success' : 'text-danger'}`}>
                      {profile.status === 'active' ? 'Active · Good Standing' : 'Suspended'}
                    </p>
                  </div>
                </div>

                <MiniCard label="Member ID" value={profile.member_id} mono />
                <MiniCard label="Joined" value={memberSince} />
              </div>
            </div>

            {/* Biometric */}
            <div className="bg-panel border border-line rounded-xl p-6 relative overflow-hidden">
              <div className="relative">
                <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
                  <p className="text-sm font-semibold tracking-normal text-muted">Biometric ID</p>
                  <div className="flex items-center gap-1 px-2 py-1 bg-subtle rounded-lg border border-line">
                    <Lock size={8} className="text-muted" />
                    <span className="text-sm font-semibold tracking-normal text-muted">Read Only</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${biometric?.enrolled ? 'bg-info-soft border-line' : 'bg-subtle border-line'}`}>
                    <Camera size={15} className={biometric?.enrolled ? 'text-link' : 'text-muted'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${biometric?.enrolled ? 'bg-emerald-400 animate-pulse' : 'bg-subtle'}`} />
                      <p className={`text-sm font-semibold tracking-normal ${biometric?.enrolled ? 'text-success' : 'text-muted'}`}>
                        {biometric?.enrolled ? 'Face ID Active' : 'Not Enrolled'}
                      </p>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">
                      {biometric?.enrolled ? 'Registered for entry kiosk.' : 'Visit the library to enroll.'}
                    </p>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-line">
                  <p className="text-sm text-muted leading-relaxed">
                    Managed by library staff. Bring a valid ID to enroll or update your biometric data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, locked }) {
  return (
    <div className="group flex items-start gap-3.5 px-4 py-3 rounded-xl hover:bg-subtle transition-colors duration-150">
      <div className={`mt-0.5 flex-shrink-0 ${locked ? 'text-muted' : 'text-link'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold tracking-normal text-muted">{label}</p>
          {locked && <Lock size={7} className="text-muted" />}
        </div>
        <p className="text-sm font-semibold text-ink truncate">{value}</p>
      </div>
    </div>
  );
}

function EditRow({ icon, label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="flex items-start gap-3.5 px-4 py-3 rounded-xl bg-info-soft border border-line">
      <div className="mt-[2.2rem] flex-shrink-0 text-link">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-normal text-muted mb-1.5">{label}</p>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-subtle border border-line focus:border-line outline-none rounded-lg px-3.5 py-2.5 text-base font-medium text-ink placeholder-muted transition-colors" />
      </div>
    </div>
  );
}

const badgeCls = {
  blue:    'bg-info-soft text-link border-line',
  emerald: 'bg-success-soft text-success border-success',
  rose:    'bg-danger-soft text-danger border-danger',
  slate:   'bg-subtle text-muted border-line',
};

function SecBadgeRow({ icon, label, value, badge, badgeColor }) {
  return (
    <div className="flex flex-wrap gap-3 items-center justify-between px-4 py-3.5 bg-subtle rounded-xl border border-line">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-subtle border border-line rounded-xl flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-sm font-semibold tracking-normal text-muted">{label}</p>
          <p className="text-sm font-bold text-ink">{value}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold tracking-normal px-2.5 py-1 rounded-lg capitalize border ${badgeCls[badgeColor] ?? badgeCls.slate}`}>
        {badge}
      </span>
    </div>
  );
}

function MiniCard({ label, value, mono = false }) {
  return (
    <div className="p-3.5 bg-subtle border border-line rounded-xl">
      <p className="text-sm font-semibold tracking-normal text-muted mb-1.5">{label}</p>
      <p className={`text-sm font-bold text-ink ${mono ? 'font-sans tracking-normal' : ''}`}>{value}</p>
    </div>
  );
}
