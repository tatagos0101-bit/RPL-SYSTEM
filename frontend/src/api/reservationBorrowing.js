export function activePickupReservations(rows) {
  return Array.isArray(rows) ? rows.filter(row => row && ['ready', 'pending'].includes(row.status)) : [];
}

export function availableReservationCopies(reservation, candidates, cart = []) {
  if (reservation?.status !== 'ready' || !Array.isArray(candidates)
    || cart.some(row => row.book_id === reservation.book_id)) return [];
  const selected = new Set(cart.map(row => row.copy_id));
  const seen = new Set();
  return candidates.filter(row => {
    if (!row || row.book_id !== reservation.book_id || row.available !== true
      || row.copy_status !== 'available' || !Number.isInteger(row.copy_id) || row.copy_id <= 0
      || !Number.isInteger(row.copy_number) || row.copy_number <= 0
      || selected.has(row.copy_id) || seen.has(row.copy_id)) return false;
    seen.add(row.copy_id);
    return true;
  });
}
