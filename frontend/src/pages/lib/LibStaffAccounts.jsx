import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { createLibrarianAccount, getLibrarianAccounts } from '../../api/librarianAccounts';
import { staffAccountError } from '../../api/librarianAccountErrors';
import { parseApiDateTime } from '../../api/dateTime';

const inputClass = 'mt-2 w-full min-w-0 rounded-xl border border-line bg-panel px-4 py-3 text-ink focus:ring-2 focus:ring-link disabled:opacity-60';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold transition-colors hover:bg-subtle disabled:opacity-50';
const formatJoined = value => parseApiDateTime(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' });

export default function LibStaffAccounts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', current_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const request = useRef(null);

  const load = useCallback(async (page = 1) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setLoadError('');
    try {
      const result = await getLibrarianAccounts(page, controller.signal);
      if (!controller.signal.aborted) { setData(result); setForbidden(false); }
    } catch (err) {
      if (!controller.signal.aborted) {
        setForbidden(err.response?.status === 403);
        setLoadError(err.response?.status === 403 ? 'Only the main librarian can add or view librarian accounts.' : 'Could not load librarian accounts. Please refresh the list.');
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => { load(); return () => request.current?.abort(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    if (saving || created) return;
    setSaving(true); setError('');
    try {
      const result = await createLibrarianAccount(form);
      setCreated(result);
      setForm({ name: '', email: '', current_password: '' });
      await load(1);
    } catch (err) { setError(staffAccountError(err)); }
    finally { setForm(previous => ({ ...previous, current_password: '' })); setSaving(false); }
  }

  return <div className="staff-page">
    <header className="staff-page-header">
      <div><p className="text-sm font-semibold text-link">Library management</p><h1>Librarian Accounts</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Add staff who will manage library operations. Register borrowers separately on the <Link to="/librarian/users" className="text-link underline">Users page</Link>.</p></div>
    </header>
    {loadError && <p role="alert" className="mb-5 rounded-xl border border-line bg-panel p-4 text-danger">{loadError}</p>}
    {forbidden ? <Link to="/librarian/home" className={buttonClass}>Back to dashboard</Link> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="staff-panel" aria-labelledby="add-librarian-title">
        <h2 id="add-librarian-title" className="flex items-center gap-3"><UserPlus size={22} aria-hidden="true" />Add a librarian</h2>
        <p className="mt-3 text-sm leading-6 text-muted">A temporary password will be sent by email. It expires after 24 hours and must be changed at first sign-in.</p>
        {created ? <div className="mt-5 rounded-xl border border-line bg-subtle p-5" role="status">
          <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={20} aria-hidden="true" />Librarian account created</p>
          <p className="mt-3 break-words font-semibold">{created.account.name}</p>
          <p className="mt-1 break-all text-sm text-muted">{created.account.email}</p>
          <p className="mt-3 text-sm">Staff ID: <strong>{created.account.member_id}</strong></p>
          {created.temporary_password ? <><p className="mt-3 text-sm leading-6 text-muted">Email delivery was not confirmed. Share this temporary password privately with the librarian. It is shown only here.</p><p className="mt-3 break-all rounded-lg border border-line bg-panel p-3 font-mono text-lg tracking-wide" aria-label="Temporary password">{created.temporary_password}</p></> : <p className="mt-3 text-sm leading-6 text-muted">The email service accepted the message. Ask the librarian to check their inbox and spam folder.</p>}
          <p className="mt-3 text-sm leading-6"><Link to="/librarian/login" target="_blank" rel="noopener noreferrer" className="text-link underline">Open librarian sign-in</Link></p>
          <button type="button" onClick={() => setCreated(null)} className={`${buttonClass} mt-5`}>Done / Add another librarian</button>
        </div> : <form onSubmit={submit} className="mt-5 space-y-5">
          <div><label htmlFor="staff-name" className="text-sm font-semibold">Full name</label><input id="staff-name" autoComplete="name" required maxLength={120} value={form.name} onChange={e => setForm(previous => ({ ...previous, name: e.target.value }))} className={inputClass} disabled={saving || loading || !data} /></div>
          <div><label htmlFor="staff-email" className="text-sm font-semibold">Email address</label><input id="staff-email" type="email" autoComplete="email" required maxLength={180} value={form.email} onChange={e => setForm(previous => ({ ...previous, email: e.target.value }))} className={inputClass} disabled={saving || loading || !data} /></div>
          <div><label htmlFor="staff-password" className="text-sm font-semibold">Your current password</label><input id="staff-password" type="password" autoComplete="current-password" required maxLength={1024} value={form.current_password} onChange={e => setForm(previous => ({ ...previous, current_password: e.target.value }))} className={inputClass} disabled={saving || loading || !data} /><p className="mt-2 text-sm leading-6 text-muted">Confirm with your own main librarian password.</p></div>
          {error && <p role="alert" className="text-sm leading-6 text-danger">{error}</p>}
          <button type="submit" className={`${buttonClass} w-full bg-action text-white hover:bg-action`} disabled={saving || loading || !data}><UserPlus size={17} aria-hidden="true" />{saving ? 'Creating account…' : 'Create librarian account'}</button>
        </form>}
      </section>
      <section className="staff-panel" aria-labelledby="staff-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="staff-list-title" className="text-xl">Library staff{data ? ` (${data.total})` : ''}</h2><button type="button" onClick={() => load(data?.page || 1)} disabled={loading || saving} className={buttonClass}><RefreshCw size={16} aria-hidden="true" />Refresh list</button></div>
        {loading && <p role="status" className="mt-5 text-sm text-muted">Loading librarian accounts…</p>}
        <ul className="mt-5 divide-y divide-line">{data?.items.map(account => <li key={account.id} className="flex items-start gap-3 py-5 first:pt-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-link"><ShieldCheck size={19} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold">{account.name}</h3>{account.is_main_librarian && <span className="rounded-full bg-info-soft px-3 py-1 text-xs font-semibold text-link">Main librarian</span>}</div><p className="mt-1 break-all text-sm text-muted">{account.email || 'No email on file'}</p><p className="mt-2 text-sm text-muted">{account.member_id || 'Staff account'} · {account.status === 'active' ? 'Active' : 'Suspended'}</p><p className="mt-1 text-sm text-muted">{account.must_change_password ? 'Password change required at first sign-in' : 'Password set'}{account.created_at ? ` · Added ${formatJoined(account.created_at)}` : ''}</p></div>
        </li>)}</ul>
        {data && !data.total && !loading && <p className="mt-5 text-sm text-muted">No librarian accounts found.</p>}
        {data && data.total > data.page_size && <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Librarian account pages"><button className={buttonClass} disabled={loading || saving || data.page === 1} onClick={() => load(data.page - 1)}>Previous</button><span className="text-sm text-muted">Page {data.page} of {Math.ceil(data.total / data.page_size)}</span><button className={buttonClass} disabled={loading || saving || data.page * data.page_size >= data.total} onClick={() => load(data.page + 1)}>Next</button></nav>}
      </section>
    </div>}
  </div>;
}
