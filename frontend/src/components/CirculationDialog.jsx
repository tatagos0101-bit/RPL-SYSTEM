import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import QrScanner from './QrScanner';
import CirculationMember from './CirculationMember';
import BorrowingCapacity from './BorrowingCapacity';
import useBorrowingCapacity from '../api/useBorrowingCapacity';
import { lookupCirculation, circulationStatus, sendCirculation } from '../api/circulation';
import { clearCirculation, normalizeLibraryCode, readCirculation, saveCirculation, submitCirculation } from '../api/circulationRecovery';
import { errorMessage } from '../api/inventoryWrites';
import { parseApiDateTime } from '../api/dateTime';

const formatTime = value => value ? parseApiDateTime(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—';
const itemKey = row => row.transaction_id ? `loan-${row.transaction_id}` : `copy-${row.copy_id}`;
const payloadFor = (row, mode, member) => ({ user_id: mode === 'borrow' ? member.user_id : row.user_id,
  book_id: row.book_id, copy_id: row.copy_id, ...(mode === 'return' ? { transaction_id: row.transaction_id } : {}) });

export default function CirculationDialog({ onClose, onCommit, initialReturn = null }) {
  const dialog = useRef(null);
  const inFlight = useRef(false);
  const submitting = useRef(false);
  const lastScan = useRef({});
  const mounted = useRef(true);
  const [mode, setMode] = useState(initialReturn ? 'return' : null);
  const [member, setMember] = useState(null);
  const [rows, setRows] = useState(initialReturn ? [{ ...initialReturn, transaction_id: initialReturn.transaction_id || initialReturn.id, title: initialReturn.book_title }] : []);
  const [choices, setChoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [review, setReview] = useState(Boolean(initialReturn));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actor] = useState(() => localStorage.getItem('userId'));
  const [recovery, setRecovery] = useState(() => {
    try { return readCirculation(actor); } catch { return null; }
  });
  const allowance = useBorrowingCapacity(member?.user_id ?? null);
  const refreshRecovery = () => {
    try { setRecovery(readCirculation(actor)); } catch { setRecovery(null); }
  };
  const assertAccount = () => {
    if (!actor || localStorage.getItem('userId') !== actor) throw new Error('The signed-in account changed. Close this dialog and sign in again.');
  };
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { mounted.current = false; element.close(); document.body.style.overflow = overflow; focus?.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector('.rpl-scan-body')?.scrollTo(0, 0); }, [review, mode]);

  const add = row => {
    if (mode === 'borrow' && !row.available) { setError(`Copy ${row.copy_number} is ${row.copy_status}; it cannot be borrowed.`); return; }
    setRows(previous => previous.some(item => itemKey(item) === itemKey(row)) ? previous : [...previous, row]);
    setChoices([]); setError(''); setNotice(`Added ${row.title}, copy ${row.copy_number ?? 'legacy'}.`);
  };
  const scan = async raw => {
    if (inFlight.current || submitting.current || choices.length) return;
    let code;
    try { code = normalizeLibraryCode(raw); } catch (err) { setError(err.message); return; }
    if (rows.some(row => row.copy_qr === code) || (lastScan.current.code === code && Date.now() - lastScan.current.at < 2000)) return;
    lastScan.current = { code, at: Date.now() };
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await lookupCirculation(code, mode);
      if (!mounted.current) return;
      if (data.candidates.length === 1) add(data.candidates[0]);
      else { setChoices(data.candidates); setNotice('Legacy title QR: select the exact physical copy or loan.'); }
    } catch (err) { if (mounted.current) setError(errorMessage(err)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const confirm = async () => {
    if (submitting.current || !recovery || recovery.length) return;
    submitting.current = true; setProcessing(true); setError('');
    try {
      assertAccount();
      if (readCirculation(actor).length) {
        refreshRecovery();
        throw new Error('An unresolved request exists. Check its outcome before submitting more items.');
      }
      for (const row of rows) {
        if (!mounted.current) break;
        if (row.outcome) continue;
        assertAccount();
        const record = { operation: mode, requestId: crypto.randomUUID(), payload: payloadFor(row, mode, member) };
        saveCirculation(actor, record); // Fail before dispatch if durable recovery is unavailable.
        const outcome = await submitCirculation(record, { send: sendCirculation, lookup: circulationStatus });
        setRows(previous => previous.map(item => itemKey(item) === itemKey(row) ? { ...item, outcome } : item));
        if (outcome.status !== 'unknown') clearCirculation(actor, record.requestId);
        refreshRecovery();
        if (outcome.status === 'unknown') break;
      }
    } catch (err) { setError(errorMessage(err)); refreshRecovery(); }
    finally { submitting.current = false; setProcessing(false); allowance.refreshCapacity(); onCommit(); }
  };
  const recover = async (record, retry) => {
    if (submitting.current) return;
    submitting.current = true; setProcessing(true); setError('');
    try {
      assertAccount();
      let outcome;
      try {
        const { data } = await circulationStatus(record.requestId);
        if (data.operation !== record.operation) throw new Error('Operation mismatch.');
        outcome = { status: 'confirmed', data: data.result };
      } catch (err) {
        if (!retry || err.response?.status !== 404) throw new Error('Outcome unknown. Check again, or explicitly retry the original request when connected.');
        outcome = await submitCirculation(record, { send: sendCirculation, lookup: circulationStatus });
      }
      if (outcome.status === 'unknown') throw new Error(outcome.error);
      clearCirculation(actor, record.requestId); refreshRecovery();
      // The original request may belong to a previous page session.
      setRows(previous => previous.map(row => {
        const same = JSON.stringify(payloadFor(row, record.operation, member || { user_id: record.payload.user_id })) === JSON.stringify(record.payload);
        return same ? { ...row, outcome } : row;
      }));
      setNotice(outcome.status === 'confirmed' ? `Confirmed ${record.operation}, transaction ${outcome.data.id}.` : outcome.error);
      onCommit();
    } catch (err) { setError(errorMessage(err)); }
    finally { submitting.current = false; setProcessing(false); }
  };
  const close = () => { if (!submitting.current) onClose(); };
  return <dialog ref={dialog} aria-label="Quick Scan Session" className="rpl-scan-dialog" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="rpl-scan-frame text-ink">
      <header className="rpl-scan-heading p-4 sm:p-6 border-b border-line flex justify-between items-center">
        <h2 className="text-xl font-semibold">{mode === 'borrow' ? 'Borrow Books' : mode === 'return' ? 'Return Books' : 'Quick Scan Session'}</h2>
        <button aria-label="Close" disabled={processing} onClick={close} className="p-3"><X size={20} /></button>
      </header>
      <div className="rpl-scan-body p-4 sm:p-6 space-y-5">
        {!recovery && <p role="alert" className="text-danger">Recovery storage is unavailable. Sign in again or restore browser storage before recording transactions.</p>}
        {recovery?.length > 0 && <section className="p-4 border border-warning rounded-xl space-y-3">
          <h3 className="font-semibold">Unresolved requests — check before recording more transactions</h3>
          {recovery.map(record => <div key={record.requestId} className="flex flex-wrap gap-3 items-center">
            <span>{record.operation}: book #{record.payload.book_id}, copy #{record.payload.copy_id ?? 'legacy'}</span>
            <button disabled={processing} onClick={() => recover(record, false)} className="underline">Check outcome</button>
            <button disabled={processing} onClick={() => recover(record, true)} className="underline">Retry original request</button>
          </div>)}
          <p className="text-sm">Nothing is replayed automatically. A missing receipt does not prove the first request failed.</p>
        </section>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        {notice && <p role="status" className="text-link">{notice}</p>}
        {!mode && <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={() => setMode('borrow')} className="bg-action text-white rounded-xl p-6">Borrow Books</button>
          <button onClick={() => setMode('return')} className="bg-action text-white rounded-xl p-6">Return Books</button>
        </div>}
        {mode === 'borrow' && !member && <CirculationMember onSelect={setMember} />}
        {mode && (mode === 'return' || member) && <>
          {member && <section><p className="font-semibold">{member.name} · {member.member_id}</p><BorrowingCapacity {...allowance} /></section>}
          {!review && <QrScanner onScan={scan} busy={busy} />}
          {choices.length > 0 && <section className="space-y-2">
            <h3 className="font-semibold">Choose the physical copy / active loan</h3>
            {choices.map(row => <button key={itemKey(row)} onClick={() => add(row)} disabled={mode === 'borrow' && !row.available}
              className="block w-full text-left p-3 border border-line rounded-lg disabled:opacity-50">
              {row.title} · Copy {row.copy_number ?? 'legacy'} · {row.member_name || row.copy_status} {row.member_id || ''} · Due {formatTime(row.due_date)}
            </button>)}
            <button onClick={() => { setChoices([]); lastScan.current = {}; }} className="underline">Cancel selection</button>
          </section>}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">{review ? 'Review before confirmation' : 'Pending list'} ({rows.length})</h3>
            {!rows.length && <p className="text-muted">Scan a library copy QR to begin.</p>}
            {rows.map(row => <article key={itemKey(row)} className="border border-line rounded-xl p-4 space-y-1">
              <p className="font-semibold break-words">{row.title} · Copy {row.copy_number ?? 'legacy'}</p>
              {mode === 'return' && <p>{row.member_name} · {row.member_id} · Loan #{row.transaction_id}</p>}
              <p>Due (Philippine time): {formatTime(row.due_date)}</p>
              {mode === 'borrow' ? <p>Available when scanned; rechecked at confirmation.</p>
                : <p>{row.estimated_fine !== undefined ? `Estimated fine: ₱${row.estimated_fine} — finalized by the server on return.` : 'The server calculates the final fine at confirmation.'}</p>}
              {row.outcome ? <p role="status" className={row.outcome.status === 'confirmed' ? 'text-success' : 'text-danger'}>
                {row.outcome.status === 'confirmed' ? `Confirmed · Transaction ${row.outcome.data.id}${mode === 'return' ? ` · Final fine ₱${row.outcome.data.fine_amount} · Returned ${formatTime(row.outcome.data.return_date)}` : ` · Due ${formatTime(row.outcome.data.due_date)}`}` : row.outcome.error}
              </p> : <><p className="text-muted">Not submitted</p><button disabled={processing} onClick={() => setRows(previous => previous.filter(item => itemKey(item) !== itemKey(row)))} className="underline">Remove</button></>}
            </article>)}
          </section>
          <p className="text-sm text-muted">Items are recorded separately. Confirmed items stay confirmed if another fails. No offline processing.</p>
          <div className="flex flex-wrap gap-3">
            {review && !rows.some(row => row.outcome) && <button disabled={processing} onClick={() => setReview(false)} className="border border-line p-3 rounded-lg">Back to scanning</button>}
            {!review ? <button disabled={!rows.length || busy || choices.length > 0} onClick={() => setReview(true)} className="bg-action text-white rounded-lg p-3 disabled:opacity-50">Review list</button>
              : <button disabled={processing || !recovery || recovery.length > 0 || !rows.some(row => !row.outcome)} onClick={confirm} className="bg-action text-white rounded-lg p-3 disabled:opacity-50">
                {processing ? 'Processing…' : mode === 'borrow' ? 'Confirm Borrowing' : 'Confirm Returns'}
              </button>}
          </div>
        </>}
      </div>
    </div>
  </dialog>;
}
