import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Pencil, RefreshCw, X } from 'lucide-react';
import { updateBook } from '../api/librarian';

const fields = [
  { name: 'title', label: 'Title', required: true, maxLength: 255 },
  { name: 'author', label: 'Author', required: true, maxLength: 180 },
  { name: 'category', label: 'Category', required: true, maxLength: 80 },
  { name: 'year', label: 'Publication year', type: 'number', min: 1000, max: 2200 },
  { name: 'isbn', label: 'ISBN', maxLength: 20 },
  { name: 'copies_total', label: 'Total copies', type: 'number', required: true, min: 0, max: 10000 },
  { name: 'location_shelf', label: 'Shelf location', maxLength: 80 },
  { name: 'cover_url', label: 'Cover URL', maxLength: 500 },
];

export default function BookEditDialog({ book, categories, onClose, onSaved }) {
  const dialog = useRef(null);
  const pending = useRef(false);
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(({ name }) => [name, book[name] ?? ''])));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    const payload = Object.fromEntries(fields.map(({ name, type, required }) => {
      const text = String(form[name]).trim();
      return [name, type === 'number' ? (text ? Number(text) : null) : (text || (required ? '' : null))];
    }));
    if (!payload.title || !payload.author || !payload.category) {
      setError('Title, author, and category are required.');
      return;
    }
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const { data } = await updateBook(book.id, payload);
      onSaved(data);
    } catch (failure) {
      const detail = failure.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Unable to save this book. Check the fields and try again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} aria-labelledby="book-edit-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-0 text-ink shadow-sm backdrop:bg-panel">
      <form onSubmit={save} className="p-5 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-semibold tracking-normal text-link">Book inventory</p>
            <h2 id="book-edit-title" className="flex items-center gap-2 font-semibold rpl-section-title"><Pencil size={20} /> Edit book</h2>
            <p className="mt-2 text-sm text-muted">Update this book's information and save your changes.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close book editor"
            className="rounded-lg p-2 text-muted hover:bg-subtle disabled:opacity-50"><X size={20} /></button>
        </div>
        {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger"><AlertCircle size={18} className="shrink-0" />{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(({ name, label, type = 'text', ...constraints }) => (
            <label key={name} className={`block ${name === 'cover_url' ? 'sm:col-span-2' : ''}`}>
              <span className="mb-1.5 block text-sm font-bold text-muted">{label}{constraints.required ? ' *' : ''}</span>
              <input name={name} type={type} value={form[name]} {...constraints}
                step={type === 'number' ? 1 : undefined}
                list={name === 'category' ? 'edit-book-categories' : undefined}
                disabled={saving}
                onChange={(event) => { setForm((current) => ({ ...current, [name]: event.target.value })); setError(''); }}
                className="w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-base outline-none focus:border-line focus:ring-2 focus:ring-line disabled:opacity-60" />
            </label>
          ))}
        </div>
        <datalist id="edit-book-categories">{categories.filter((category) => category !== 'All').map((category) => <option key={category} value={category} />)}</datalist>
        <p className="mt-4 text-sm leading-5 text-muted">
          Available copies are calculated automatically. Copies on loan cannot be removed;
          reducing the total retires copies while keeping their loan history.
        </p>
        <div className="mt-6 flex justify-end gap-3 border-t border-line pt-5">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-muted disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-action px-5 py-2.5 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-60">
            {saving && <RefreshCw size={16} className="animate-spin" />}{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
