export const scanResultToCartItem = (scanResult) => {
  const book = scanResult?.book ?? {};
  const copy = scanResult?.copy ?? null;

  return {
    ...book,
    scan_qr_type: scanResult?.qr_type ?? 'book',
    scan_message: scanResult?.message ?? '',
    can_borrow: Boolean(scanResult?.can_borrow),
    copy_id: copy?.id ?? null,
    copy_number: copy?.copy_number ?? null,
    copy_qr: copy?.qr_code ?? null,
    copy_status: copy?.status ?? null,
  };
};

export const cartItemKey = (item) => (
  item?.copy_id ? `copy-${item.copy_id}` : `book-${item?.id}`
);

export const addScannedBookCartItem = (items, nextItem) => {
  if (nextItem.copy_id) {
    const duplicateCopy = items.some((item) => item.copy_id === nextItem.copy_id);
    if (duplicateCopy) {
      return {
        added: false,
        items,
        error: 'This physical copy is already in the session.',
      };
    }
  } else {
    const duplicateBook = items.some((item) => item.id === nextItem.id && !item.copy_id);
    if (duplicateBook) {
      return {
        added: false,
        items,
        error: 'This book is already in the session.',
      };
    }
  }

  return {
    added: true,
    items: [...items, nextItem],
    error: '',
  };
};
