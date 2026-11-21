import { useEffect, useId, useState } from 'react';
import { getMemberActiveLoans } from '../api/librarian';
import { errorMessage } from '../api/inventoryWrites';
import { parseApiDateTime } from '../api/dateTime';
import FineContent from './FineContent';
import QrScanner from './QrScanner';

const returnTime = value => value ? parseApiDateTime(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—';

export default function ReturnBookSelection({ member, rows, onAdd, onScan, busy }) {
  const scannerId = useId();
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const requestKey = `${member.user_id}:${version}`;
  useEffect(() => {
    const controller = new AbortController();
    getMemberActiveLoans(member.user_id, { signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data) || data.some(loan => !Number.isSafeInteger(loan.transaction_id) || loan.transaction_id <= 0 || !Number.isSafeInteger(loan.book_id) || loan.book_id <= 0)) {
        throw new Error('Borrowed books could not be loaded. Please retry.');
      }
      const loans = data.filter(loan => ['active', 'overdue'].includes(loan.status)).map(loan => ({
        ...loan, title: loan.book_title, user_id: member.user_id, member_name: member.name,
        member_id: member.member_id, estimated_fine: loan.fine_amount,
      }));
      if (!controller.signal.aborted) setResource({ key: requestKey, loans, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setResource({ key: requestKey, loans: [], error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [member, requestKey]);
  const loaded = resource?.key === requestKey;
  const loans = loaded ? resource.loans : [];
  const error = loaded ? resource.error : '';
  return <section className="min-w-0 space-y-4" aria-label="Return book selection">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">Member’s borrowed books{loaded && !error ? ` (${loans.length})` : ''}</h3>
      <button type="button" disabled={!loaded || busy} onClick={() => setVersion(value => value + 1)} className="min-h-11 text-sm text-link underline underline-offset-4 disabled:opacity-50">Refresh borrowed books</button>
    </div>
    {!loaded && <p role="status" className="text-muted">Loading this member’s borrowed books…</p>}
    {error && <p role="alert" className="text-danger">Could not load borrowed books. {error} Retry above or use the QR / code fallback below.</p>}
    {loaded && !error && !loans.length && <p className="text-muted">This member has no active borrowed books.</p>}
    {loans.length > 0 && <p className="text-sm text-muted">Select the books being returned. No book code or QR scan is needed.</p>}
    {loans.map(loan => {
      const added = rows.some(row => row.transaction_id === loan.transaction_id);
      return <article key={loan.transaction_id} className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h4 className="font-semibold break-words">{loan.title}</h4><p className="text-sm text-muted">{loan.book_author}</p></div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${loan.status === 'overdue' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-link'}`}>{loan.status === 'overdue' ? 'Overdue' : 'Borrowed'}</span>
        </div>
        <p className="text-sm text-muted">{loan.copy_number != null ? `Copy ${loan.copy_number}` : 'Legacy loan'} · Loan #{loan.transaction_id}</p>
        <p className="text-sm text-muted">Due (Philippine time): {returnTime(loan.due_date)}</p>
        <FineContent><p className="text-sm text-muted">Estimated fine: ₱{loan.estimated_fine} — finalized when returned.</p></FineContent>
        {added ? <p className="text-sm text-success">Added to return list.</p> : <button type="button" disabled={busy} onClick={() => onAdd(loan)} className="min-h-11 rounded-lg bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Add to return list</button>}
      </article>;
    })}
    <button type="button" aria-expanded={scannerOpen} aria-controls={scannerId} onClick={() => setScannerOpen(value => !value)} className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm font-semibold text-link">{scannerOpen ? 'Hide QR / code fallback' : 'Use QR / code instead'}</button>
    {scannerOpen && <div id={scannerId}><QrScanner onScan={onScan} busy={busy} /></div>}
  </section>;
}
