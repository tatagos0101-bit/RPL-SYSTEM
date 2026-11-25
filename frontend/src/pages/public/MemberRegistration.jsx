import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import BorrowingTerms from '../../components/BorrowingTerms';
import { applyMembership } from '../../api/libraryWorkflows';
import { errorMessage } from '../../api/inventoryWrites';
import { downloadReport } from '../../api/reporting';
import { parseApiDateTime } from '../../api/dateTime';

const input = 'mt-2 w-full rounded-xl border border-line bg-panel px-4 py-3 text-base text-ink';
export default function MemberRegistration() {
  const [form, setForm] = useState({ name: '', email: '', location: '', accept_terms: false });
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState(null), [error, setError] = useState('');
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { const { data } = await applyMembership({ ...form, name: form.name.trim(), location: form.location.trim(), email: form.email.trim() || null }); setReceipt(data); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  const receiptText = receipt ? `Rizal Provincial Library\nMembership application receipt\n\nReference: ${receipt.receipt}\nApplicant: ${receipt.name}\nStatus: Pending librarian approval\nSubmitted: ${parseApiDateTime(receipt.submitted_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}\n\n${receipt.message}\n\nThis receipt is not an active borrowing account.\n` : '';
  return <main className="rpl-page rpl-public rpl-discovery min-h-screen min-w-0 bg-canvas px-4 pb-16 pt-28 font-sans text-ink sm:px-8">
    <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-sm font-semibold text-link">Rizal Provincial Library</p>
      <h1 className="font-serif text-4xl sm:text-5xl">Apply for membership</h1>
      <p className="mb-8 mt-3 max-w-2xl text-muted">Start your application from anywhere, then bring the receipt and your original government photo ID to the library. A librarian must verify you in person and upload the required ID before creating your account. No ID is collected on this public application form.</p>
      {receipt ? <section className="space-y-5 rounded-2xl border border-line bg-panel p-6 sm:p-8" aria-label="Application receipt">
        <CheckCircle2 size={36} className="text-success" aria-hidden="true" /><h2 className="text-2xl font-semibold">Application received</h2>
        <p className="font-medium">{receipt.name}</p><p className="break-all rounded-lg bg-subtle p-4 font-mono">{receipt.receipt}</p>
        <p className="font-semibold text-warning">Pending librarian approval</p><p className="text-muted">{receipt.message}</p>
        <div className="flex flex-wrap gap-3"><button className="rounded-xl bg-action px-5 py-3 font-semibold text-white" onClick={() => downloadReport(new Blob([receiptText], { type: 'text/plain;charset=utf-8' }), 'RPL-Application-Receipt.txt')}>Save receipt</button><button className="rounded-xl border border-line px-5 py-3 font-semibold" onClick={() => window.print()}>Print receipt</button><Link to="/" className="rounded-xl border border-line px-5 py-3 font-semibold">Back to home</Link></div>
      </section> : <form onSubmit={submit} className="space-y-6 rounded-2xl border border-line bg-panel p-5 sm:p-8">
        {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-danger">{error} If submission may have succeeded, contact the desk before applying again.</p>}
        <label className="block text-sm font-semibold">Full name<input required name="name" autoComplete="name" maxLength="120" className={input} value={form.name} onChange={change} disabled={busy} /></label>
        <label className="block text-sm font-semibold">Email address (optional)<input name="email" type="email" autoComplete="email" maxLength="180" className={input} value={form.email} onChange={change} disabled={busy} /><span className="mt-2 block font-normal text-muted">Used to send account details after approval. Without email, keep the receipt and contact the library desk.</span></label>
        <label className="block text-sm font-semibold">Address / location<input required name="location" autoComplete="street-address" maxLength="120" className={input} value={form.location} onChange={change} disabled={busy} /></label>
        <div className="rounded-xl border border-line bg-subtle p-4 sm:p-5"><BorrowingTerms /></div>
        <label className="flex items-start gap-3 text-sm"><input required name="accept_terms" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-amber-700" checked={form.accept_terms} onChange={change} disabled={busy} />I have read and accept the borrower terms and have read the Library Privacy Notice. I understand that approval is required before borrowing.</label>
        <button disabled={busy || !form.accept_terms} className="flex items-center gap-3 rounded-xl bg-action px-6 py-3.5 font-semibold text-white hover:bg-action-hover disabled:opacity-50">{busy ? 'Submitting…' : 'Submit application'}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>}
    </div>
  </main>;
}
