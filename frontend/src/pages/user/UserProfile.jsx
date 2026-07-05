import { useState, useEffect, useRef } from 'react';
import {
  BadgeCheck, Mail, MapPin, Phone, Shield, BookOpen,
  Calendar, RefreshCw, Check, X, Lock, Eye, EyeOff,
  KeyRound, ChevronDown, ChevronUp, AlertCircle, Camera,
  Edit3, UserCircle2,
} from 'lucide-react';
import { getProfile, getBiometricStatus, updateProfile, changePassword, uploadAvatar } from '../../api/user';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getInitials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// ── Avatar Upload ─────────────────────────────────────────────────────────────

function AvatarUpload({ currentUrl, name, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const imgSrc = preview || (currentUrl ? `${API}${currentUrl}` : null);

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
      <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 border-4 border-slate-900 shadow-2xl flex items-center justify-center flex-shrink-0">
        {imgSrc ? (
          <img src={imgSrc} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-black text-2xl tracking-tight select-none">{getInitials(name)}</span>
        )}
      </div>

      {/* Upload overlay */}
      <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1">
        {uploading ? (
          <RefreshCw size={18} className="animate-spin text-white" />
        ) : (
          <>
            <Camera size={16} className="text-white" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white text-center leading-tight">Upload<br />Photo</span>
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
    else if (form.next.length < 6) e.next = 'Min 6 characters.';
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
    `flex items-center gap-2 px-3.5 py-2.5 rounded-xl border ${err ? 'border-rose-500/60' : 'border-slate-700'} bg-slate-800/60 focus-within:border-blue-500 transition-colors`;

  const inp = 'flex-1 bg-transparent outline-none text-sm font-medium text-white placeholder-slate-500';

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-800">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (open) reset(); }}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <KeyRound size={13} className="text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Password</p>
            <p className="text-sm font-bold text-slate-200">
              {success ? <span className="text-emerald-400 flex items-center gap-1"><Check size={12} /> Updated</span> : '••••••••••'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-600/30">
            {open ? 'Close' : 'Change'}
          </span>
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-5 pt-4 pb-5 bg-slate-900/60 border-t border-slate-800 space-y-3">
          {apiError && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-rose-900/20 border border-rose-800/50 rounded-xl">
              <AlertCircle size={12} className="text-rose-400 flex-shrink-0" />
              <p className="text-xs font-bold text-rose-400">{apiError}</p>
            </div>
          )}
          {[
            { key: 'current', label: 'Current Password', ph: 'Enter current password' },
            { key: 'next',    label: 'New Password',     ph: 'Min 6 characters' },
            { key: 'confirm', label: 'Confirm New',      ph: 'Re-enter new password' },
          ].map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <div className={wrap(errors[key])}>
                <Lock size={12} className="text-slate-600 flex-shrink-0" />
                <input
                  type={show[key] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(v => ({ ...v, [key]: undefined })); }}
                  placeholder={ph}
                  className={inp}
                />
                <button type="button" onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))} className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0">
                  {show[key] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {errors[key] && <p className="mt-1 text-[9px] font-bold text-rose-400">{errors[key]}</p>}
            </div>
          ))}
          {/* Strength bar */}
          {form.next.length > 0 && (
            <div className="flex items-center gap-1">
              {[6, 9, 12].map((l, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${form.next.length >= l ? ['bg-rose-500','bg-amber-400','bg-emerald-400'][i] : 'bg-slate-700'}`} />
              ))}
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">
                {form.next.length < 6 ? 'Weak' : form.next.length < 9 ? 'Fair' : form.next.length < 12 ? 'Good' : 'Strong'}
              </span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => { setOpen(false); reset(); }} disabled={saving}
              className="flex-1 py-2.5 border border-slate-700 text-slate-400 hover:bg-slate-800 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all active:scale-95">
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
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={26} className="animate-spin text-blue-500" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loading…</p>
      </div>
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <p className="text-rose-400 font-bold text-sm">{error || 'Could not load profile.'}</p>
    </div>
  );

  const memberSince = profile.member_since
    ? toUtcDate(profile.member_since).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const inputCls = 'w-full bg-slate-800/60 border border-slate-700 focus:border-blue-500 outline-none rounded-xl px-4 py-2.5 text-sm font-medium text-white placeholder-slate-500 transition-colors';

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 md:px-8 pt-8 space-y-5">

        {/* Page title */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 mb-1">Member Portal</p>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
            My <span className="text-blue-500">Profile</span>
          </h1>
        </div>

        {/* ── Hero Card ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* Top strip — dark with dot pattern */}
          <div className="h-32 bg-slate-800 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/40 via-transparent to-indigo-900/30" />
            
            {/* Branding - Shifted right to avoid avatar overlap */}
            <div className="absolute bottom-4 right-8 text-right hidden sm:block">
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-400/80 leading-none">Rizal Provincial Library</p>
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 mt-1">Knowledge · Culture · Service</p>
            </div>
            
            {/* Mobile Branding */}
            <div className="absolute top-4 left-6 sm:hidden">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-400/60">Rizal Provincial Library</p>
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
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 border border-emerald-700/40 rounded-xl text-xs font-bold text-emerald-400">
                    <Check size={12} /> Saved
                  </span>
                )}
                {!editing ? (
                  <button onClick={() => { setEditing(true); setSaveError(''); setSaveSuccess(false); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-600/25 active:scale-95">
                    <Edit3 size={12} /> Edit Profile
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditing(false); setForm({ name: profile.name || '', phone: profile.phone || '', location: profile.location || '' }); setSaveError(''); }}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-700 text-slate-400 hover:bg-slate-800 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 active:scale-95">
                      <X size={12} /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:-translate-y-0.5 active:scale-95">
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
                  <h2 className="text-2xl font-black tracking-tight text-white">{profile.name}</h2>
                  <BadgeCheck size={18} className="text-blue-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-400 mb-1">Verified Member</p>
                <p className="font-mono text-xs text-slate-500">{profile.member_id}</p>
              </div>
            ) : (
              <div className="max-w-xs">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Your full name" />
              </div>
            )}

            {saveError && (
              <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-rose-900/20 border border-rose-800/50 rounded-xl">
                <X size={12} className="text-rose-400 flex-shrink-0" />
                <p className="text-xs font-bold text-rose-400">{saveError}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Body grid ── */}
        <div className="grid md:grid-cols-3 gap-5">

          {/* Left col — 2/3 */}
          <div className="md:col-span-2 space-y-5">

            {/* Contact Information */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-black italic uppercase tracking-tighter text-white">Contact Information</h3>
                {editing && <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 bg-blue-600/10 border border-blue-600/20 px-2.5 py-1 rounded-lg">Editing</span>}
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
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
              <h3 className="text-sm font-black italic uppercase tracking-tighter text-white mb-5">Account &amp; Security</h3>
              <div className="space-y-3">
                <PasswordChangeForm />
                <SecBadgeRow
                  icon={<BookOpen size={13} className="text-blue-400" />}
                  label="Account Role"
                  value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                  badge={profile.role} badgeColor="blue"
                />
                <SecBadgeRow
                  icon={<Shield size={13} className={profile.status === 'active' ? 'text-emerald-400' : 'text-rose-400'} />}
                  label="Account Status"
                  value={profile.status === 'active' ? 'Active · Good Standing' : 'Suspended'}
                  badge={profile.status}
                  badgeColor={profile.status === 'active' ? 'emerald' : 'rose'}
                />
              </div>
            </div>
          </div>

          {/* Right col — 1/3 */}
          <div className="space-y-5">

            {/* Membership */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-sm font-black italic uppercase tracking-tighter text-white mb-5">Membership</h3>
              <div className="space-y-3">
                {/* Status pill */}
                <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${
                  profile.status === 'active'
                    ? 'bg-emerald-900/20 border-emerald-800/40'
                    : 'bg-rose-900/20 border-rose-800/40'
                }`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${profile.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <div>
                    <p className={`text-[9px] font-black uppercase tracking-widest ${profile.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>Status</p>
                    <p className={`text-xs font-bold ${profile.status === 'active' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {profile.status === 'active' ? 'Active · Good Standing' : 'Suspended'}
                    </p>
                  </div>
                </div>

                <MiniCard label="Member ID" value={profile.member_id} mono />
                <MiniCard label="Joined" value={memberSince} />
              </div>
            </div>

            {/* Biometric */}
            <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute -top-6 -right-6 w-28 h-28 bg-blue-600/8 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-indigo-600/8 rounded-full blur-xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Biometric ID</p>
                  <div className="flex items-center gap-1 px-2 py-1 bg-slate-800 rounded-lg border border-slate-700">
                    <Lock size={8} className="text-slate-600" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Read Only</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${biometric?.enrolled ? 'bg-blue-900/40 border-blue-800/50' : 'bg-slate-800/60 border-slate-700/40'}`}>
                    <Camera size={15} className={biometric?.enrolled ? 'text-blue-400' : 'text-slate-600'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${biometric?.enrolled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <p className={`text-[10px] font-black uppercase tracking-wider ${biometric?.enrolled ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {biometric?.enrolled ? 'Face ID Active' : 'Not Enrolled'}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      {biometric?.enrolled ? 'Registered for entry kiosk.' : 'Visit the library to enroll.'}
                    </p>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-slate-800/80">
                  <p className="text-[9px] text-slate-600 leading-relaxed">
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
    <div className="group flex items-start gap-3.5 px-4 py-3 rounded-2xl hover:bg-slate-800/40 transition-colors duration-150">
      <div className={`mt-0.5 flex-shrink-0 ${locked ? 'text-slate-600' : 'text-blue-400'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          {locked && <Lock size={7} className="text-slate-700" />}
        </div>
        <p className="text-sm font-semibold text-slate-200 truncate">{value}</p>
      </div>
    </div>
  );
}

function EditRow({ icon, label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="flex items-start gap-3.5 px-4 py-3 rounded-2xl bg-blue-600/5 border border-blue-600/15">
      <div className="mt-[2.2rem] flex-shrink-0 text-blue-400">{icon}</div>
      <div className="flex-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</p>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 outline-none rounded-xl px-3.5 py-2.5 text-sm font-medium text-white placeholder-slate-600 transition-colors" />
      </div>
    </div>
  );
}

const badgeCls = {
  blue:    'bg-blue-600/15 text-blue-400 border-blue-600/25',
  emerald: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/25',
  rose:    'bg-rose-600/15 text-rose-400 border-rose-600/25',
  slate:   'bg-slate-700/50 text-slate-400 border-slate-600/40',
};

function SecBadgeRow({ icon, label, value, badge, badgeColor }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 bg-slate-800/40 rounded-2xl border border-slate-800">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="text-sm font-bold text-slate-200">{value}</p>
        </div>
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg capitalize border ${badgeCls[badgeColor] ?? badgeCls.slate}`}>
        {badge}
      </span>
    </div>
  );
}

function MiniCard({ label, value, mono = false }) {
  return (
    <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-2xl">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</p>
      <p className={`text-sm font-bold text-slate-200 ${mono ? 'font-mono tracking-wider' : ''}`}>{value}</p>
    </div>
  );
}
