import { X } from 'lucide-react';
import BookCover from './BookCover';
import ModalFrame from './ModalFrame';

export default function BookDetailsDialog({ book, onClose }) {
  const fields = [
    ['Category', book.category],
    ['Published', book.year],
    ['ISBN', book.isbn],
    ['Shelf', book.location_shelf],
    ['Copies', `${book.copies_available ?? 0} of ${book.copies_total ?? 0} available`],
    ['Library title code', book.qr_code],
  ];
  return <ModalFrame onClose={onClose} aria-label="Book details"
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
    <section className="relative h-[min(36rem,calc(100dvh_-_2rem))] min-h-0 w-full max-w-3xl overflow-hidden rounded-xl border border-line bg-panel text-ink shadow-sm">
      <button type="button" aria-label="Close book details" onClick={onClose}
        className="absolute right-3 top-3 z-20 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-line bg-panel text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
        <X size={24} aria-hidden="true" />
      </button>
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-2 md:grid-rows-1 landscape:grid-cols-2 landscape:grid-rows-1">
        <div className="min-h-0 min-w-0 overflow-hidden bg-subtle">
          <BookCover src={book.cover_url} alt={book.title} className="h-full w-full object-contain" iconSize={48} />
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto">
          <div className="flex min-h-full flex-col gap-6 p-6 md:p-8">
            <div>
              <p className="mb-4 w-fit max-w-full rounded-full bg-info-soft px-3 py-1 text-sm font-medium text-link">{book.availability_status || 'Availability not recorded'}</p>
              <h2 className="rpl-section-title mb-2 break-words pr-8">{book.title}</h2>
              <p className="break-words text-sm font-medium text-link">{book.author || 'Author not recorded'}</p>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {fields.map(([label, value]) => <div key={label} className="min-w-0">
                <dt className="mb-1 text-muted">{label}</dt>
                <dd className="break-words font-medium">{value ?? 'Not recorded'}</dd>
              </div>)}
            </dl>
            <div>
              <h3 className="mb-2 font-semibold">About this book</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{book.description || 'No description has been added yet.'}</p>
            </div>
            <button type="button" onClick={onClose} className="mt-auto min-h-11 w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle">Close details</button>
          </div>
        </div>
      </div>
    </section>
  </ModalFrame>;
}
