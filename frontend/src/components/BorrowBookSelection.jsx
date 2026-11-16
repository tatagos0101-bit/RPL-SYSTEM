import { useEffect, useId, useState } from 'react';
import { getMemberReservations } from '../api/librarian';
import { lookupCirculation } from '../api/circulation';
import { activePickupReservations, availableReservationCopies } from '../api/reservationBorrowing';
import { errorMessage } from '../api/inventoryWrites';
import { parseApiDateTime } from '../api/dateTime';
import QrScanner from './QrScanner';

const pickupTime = value => parseApiDateTime(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

function ReservedBook({ reservation, rows, onAdd, busy }) {
  const selectId = useId();
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [chooseCopy, setChooseCopy] = useState(false);
  const { id, book_id: bookId, status, book_qr: bookQr } = reservation;
  const requestKey = `${id}:${bookId}:${status}:${bookQr}:${version}`;
  const loadable = status === 'ready' && Boolean(bookQr);
  useEffect(() => {
    if (!loadable) return;
    const controller = new AbortController();
    lookupCirculation(bookQr, 'borrow', controller.signal).then(({ data }) => {
      if (!Array.isArray(data.candidates)) throw new Error('Copy choices could not be loaded. Please retry.');
      if (!controller.signal.aborted) setResource({ key: requestKey, candidates: data.candidates, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setResource({ key: requestKey, candidates: [], error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [bookQr, loadable, requestKey]);
  const loaded = resource?.key === requestKey;
  const loading = loadable && !loaded;
  const error = loaded ? resource.error : '';
  const copies = availableReservationCopies(reservation, loaded ? resource.candidates : [], rows);
  const selected = copies.find(copy => String(copy.copy_id) === selectedId) || copies[0];
  const added = rows.some(row => row.book_id === bookId);
  return <article className="rounded-xl border border-line bg-panel p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h4 className="font-semibold break-words">{reservation.book_title || 'Reserved book'}</h4><p className="text-sm text-muted">{reservation.book_author}</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-medium ${status === 'ready' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{status === 'ready' ? 'Ready for pickup' : 'In queue'}</span>
    </div>
    {status === 'pending' ? <p className="text-sm text-muted">Waiting for an available copy{reservation.queue_position ? `; queue position ${reservation.queue_position}` : ''}. This reservation is not ready to borrow.</p> : <>
      {reservation.expires_at && <p className="text-sm text-muted">Pickup deadline (Philippine time): {pickupTime(reservation.expires_at)}</p>}
      {added ? <p className="text-sm text-success">Already in the pending list.</p> : !bookQr ? <p className="text-sm text-warning">The title has no library code. Scan the physical copy or check its setup in inventory.</p> : <>
        {loading && <p role="status" className="text-sm text-muted">Loading available copies...</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!loading && !error && !copies.length && <p className="text-sm text-warning">No available physical copy was found. Refresh the copies or use the scanner.</p>}
        {copies.length > 0 && <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-muted">Available copy</p><p className="font-medium">Copy {selected.copy_number}</p><p className="break-all font-mono text-sm text-muted">{selected.copy_qr || `Copy ID ${selected.copy_id}`}</p></div>
            <button type="button" disabled={busy} onClick={() => { onAdd(selected); setSelectedId(''); setChooseCopy(false); }} className="min-h-11 rounded-lg bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Add to list</button>
          </div>
          {copies.length > 1 && <button type="button" disabled={busy} aria-expanded={chooseCopy} aria-controls={`${selectId}-choices`} onClick={() => setChooseCopy(value => !value)} className="min-h-11 text-sm text-link underline underline-offset-4 disabled:opacity-50">{chooseCopy ? 'Hide copy choices' : 'Change copy'}</button>}
          {chooseCopy && copies.length > 1 && <div id={`${selectId}-choices`} className="min-w-0">
            <label htmlFor={selectId} className="block text-sm text-muted">Physical copy to lend</label>
            <select id={selectId} value={selected.copy_id} onChange={event => setSelectedId(event.target.value)} disabled={busy} className="mt-1 block w-full min-w-0 rounded-lg border border-line bg-subtle p-3 text-base text-ink">
              {copies.map(copy => <option key={copy.copy_id} value={copy.copy_id}>Copy {copy.copy_number}{copy.copy_qr ? ` - ${copy.copy_qr}` : ''}</option>)}
            </select>
          </div>}
        </>}
        <button type="button" disabled={loading || busy} onClick={() => { setSelectedId(''); setChooseCopy(false); setVersion(value => value + 1); }} className="min-h-11 text-sm text-link underline underline-offset-4 disabled:opacity-50">Refresh copies</button>
      </>}
    </>}
  </article>;
}

export default function BorrowBookSelection({ memberId, rows, onAdd, onScan, busy }) {
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const requestKey = `${memberId}:${version}`;
  useEffect(() => {
    const controller = new AbortController();
    getMemberReservations(memberId, { signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data)) throw new Error('Reservations could not be loaded. Please retry.');
      if (!controller.signal.aborted) setResource({ key: requestKey, reservations: activePickupReservations(data), error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setResource({ key: requestKey, reservations: [], error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [memberId, requestKey]);
  const loaded = resource?.key === requestKey;
  const reservations = loaded ? resource.reservations : [];
  const error = loaded ? resource.error : '';
  const noReservations = loaded && !error && reservations.length === 0;
  const showScanner = scannerOpen || noReservations;
  return <section className="min-w-0 space-y-4" aria-label="Borrow book selection">
    <section className="space-y-3" aria-label="Member reservations">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Member reservations{loaded && !error ? ` (${reservations.length})` : ''}</h3><button type="button" onClick={() => setVersion(value => value + 1)} disabled={!loaded || busy} className="text-sm text-link underline underline-offset-4 disabled:opacity-50">Refresh reservations</button></div>
      {!loaded && <p role="status" className="text-muted">Checking this member's reservations...</p>}
      {error && <p role="alert" className="text-danger">Could not load reservations. {error} Use Refresh reservations to retry, or scan a book below.</p>}
      {noReservations && <p className="text-sm text-muted">No active reservations. Scan a library copy QR or enter its code for this walk-in loan.</p>}
      {reservations.length > 0 && <p className="text-sm text-muted">Add ready reservations directly to the list. The available copy shown is selected automatically. Availability and borrowing rules are checked again when you confirm.</p>}
      {reservations.map(reservation => <ReservedBook key={reservation.id} reservation={reservation} rows={rows} onAdd={onAdd} busy={busy} />)}
    </section>
    {!noReservations && <button type="button" onClick={() => setScannerOpen(value => !value)} className="rounded-lg border border-line px-4 py-3 text-sm font-semibold text-link">{scannerOpen ? 'Hide QR / code entry' : 'Scan or enter another book'}</button>}
    {showScanner && <QrScanner onScan={onScan} busy={busy} />}
  </section>;
}
