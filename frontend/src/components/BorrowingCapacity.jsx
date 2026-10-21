export default function BorrowingCapacity({ capacity, capacityError, refreshCapacity }) {
  return <div className="my-4 text-sm min-w-0 break-words" aria-live="polite">
    {capacity ? <>
      <p className="font-semibold">{capacity.active_loans + capacity.pending_reservations + capacity.ready_reservations} / {capacity.limit} book slots used · {capacity.remaining_slots} remaining</p>
      <p className="text-muted">{capacity.active_loans} loans · {capacity.ready_reservations} ready · {capacity.pending_reservations} queued</p>
      {capacity.borrowing_restrictions.map((message) => <p key={message} className="text-warning">{message}</p>)}
    </> : <p>{capacityError || 'Checking book allowance…'}</p>}
    {capacityError && <button type="button" className="underline" onClick={refreshCapacity}>Retry allowance check</button>}
  </div>;
}
