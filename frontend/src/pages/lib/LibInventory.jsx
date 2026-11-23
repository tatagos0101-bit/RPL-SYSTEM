import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Package, CheckCircle, Clock, BookOpen, Trash2, RefreshCw, ImagePlus, Library, Pencil, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import BookCover from '../../components/BookCover';
import BookEditDialog from '../../components/BookEditDialog';
import BookDetailsDialog from '../../components/BookDetailsDialog';
import { getCategories } from '../../api/books';
import { getInventoryStats, deleteBook, uploadBookCover } from '../../api/librarian';

const getStatus = (status) => {
  if (status === 'Not available') return { label: 'Not available', color: 'bg-danger-soft bg-danger-soft text-danger text-danger' };
  if (status === 'Limited') return { label: 'Limited', color: 'bg-warning-soft bg-warning-soft text-warning text-warning' };
  return { label: 'Available', color: 'bg-success-soft bg-success-soft text-success text-success' };
};

const LibInventory = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [invStats, setInvStats] = useState({ total_titles: 0, total_copies: 0, available_copies: 0, borrowed_copies: 0 });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [uploadingId, setUploadingId] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [viewingBook, setViewingBook] = useState(null);
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);
  const uploadTargetId = useRef(null);

  const listing = useServerPage('/api/inventory/books', { search, category: activeCategory === 'All' ? '' : activeCategory });
  const { items: books, setItems: setBooks, loading, reload } = listing;
  const [operationError, setOperationError] = useState('');
  const fetchData = useCallback(() => {
    setOperationError('');
    reload();
    getCategories().then(({ data }) => setCategories(['All', ...data.map(c => c.category)])).catch(() => setOperationError('Categories unavailable. Retry loading.'));
    getInventoryStats().then(({ data }) => setInvStats(data)).catch(() => setOperationError('Inventory totals unavailable. Retry loading.'));
  }, [reload]);
  useEffect(() => { const timer = setTimeout(fetchData, 0); return () => clearTimeout(timer); }, [fetchData]);

  const handleDelete = (id) => {
    if (!window.confirm('Delete this book from inventory?')) return;
    deleteBook(id)
      .then(() => fetchData())
      .catch(err => setOperationError(err.response?.data?.detail || 'Operation could not be confirmed. Refresh before retrying.'));
  };

  const handleCoverClick = (bookId) => {
    uploadTargetId.current = bookId;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTargetId.current) return;
    setUploadingId(uploadTargetId.current);
    uploadBookCover(uploadTargetId.current, file)
      .then(() => fetchData())
      .catch(() => setOperationError('Cover upload could not be confirmed. Click the cover to retry.'))
      .finally(() => setUploadingId(null));
  };

  const filtered = books;

  const handleSaved = (book) => {
    setBooks((current) => current.map((item) => item.id === book.id ? book : item));
    setEditingBook(null);
    setSuccess(`“${book.title}” was updated successfully.`);
    setActiveCategory('All');
    setSearch(book.title);
    fetchData();
  };

  return (
    <div className="rpl-page min-h-screen w-full min-w-0 bg-transparent pt-8 px-4 sm:px-6 lg:px-8 pb-20 font-sans text-ink transition-colors duration-300">
      {viewingBook && <BookDetailsDialog book={viewingBook} onClose={() => setViewingBook(null)} />}
      {editingBook && <BookEditDialog key={editingBook.id} book={editingBook} categories={categories}
        onClose={() => setEditingBook(null)} onSaved={handleSaved} />}
      {/* Hidden file input for cover upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="w-full min-w-0">
        {operationError && <p role="alert">{operationError} <button className="underline" onClick={fetchData}>Retry loading</button></p>}

        {/* Header */}
        <header className="animate-fade-in-up flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <p className="text-sm font-semibold tracking-normal text-muted mb-2">
              Librarian Terminal
            </p>
            <h1 className="font-semibold tracking-normal leading-none rpl-title">
              Book <span className="text-link">Inventory</span>
            </h1>
          </div>
          <button
            onClick={() => navigate('/librarian/add-book')}
            className="flex items-center gap-3 bg-action hover:bg-action-hover text-white px-7 py-4 rounded-lg font-semibold text-sm tracking-normal transition-all shadow-sm"
          >
            <Plus size={16} /> Add New Book
          </button>
        </header>

        {/* Stats */}
        {success && <p role="status" className="mb-6 rounded-xl border border-success bg-success-soft px-5 py-4 text-sm font-semibold text-success">{success}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10 animate-fade-in-up delay-100">
          <StatCard label="Total Books" val={invStats.total_titles ?? 0} icon={<Library size={18} />} color="bg-info-soft text-link" />
          <StatCard label="Total Copies" val={invStats.total_copies ?? 0} icon={<Package size={18} />} color="bg-subtle text-muted" />
          <StatCard label="Available" val={invStats.available_copies ?? 0} icon={<CheckCircle size={18} />} color="bg-success-soft text-success" />
          <StatCard label="Borrowed" val={invStats.borrowed_copies ?? 0} icon={<Clock size={18} />} color="bg-warning-soft text-warning" />
        </div>

        {/* Filters */}
        <div className="animate-fade-in-up delay-200 flex flex-col lg:flex-row lg:items-center gap-4 mb-8">
          <InventoryCategories categories={categories} activeCategory={activeCategory} onSelect={setActiveCategory} />
          <div className="relative w-full min-w-0 lg:w-80 lg:flex-none">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input aria-label="Search title or author..."
              type="text"
              placeholder="Search title or author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-panel border border-line rounded-lg py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-line font-medium text-base text-muted placeholder:text-muted"
            />
          </div>
        </div>

        <PageControls {...listing} />
        {/* Table */}
        <div className="bg-panel rounded-xl border border-line shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-link" />
            </div>
          ) : (
            <div className="overflow-x-auto" tabIndex="0" role="region" aria-label="Book inventory, scroll horizontally for more columns">
              <table className="staff-inventory-table w-full text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-8 py-5 text-sm font-semibold tracking-normal text-muted">Book</th>
                    <th className="px-4 py-5 text-sm font-semibold tracking-normal text-muted">Category</th>
                    <th className="px-4 py-5 text-sm font-semibold tracking-normal text-muted">Year</th>
                    <th className="px-4 py-5 text-sm font-semibold tracking-normal text-muted text-center">Copies</th>
                    <th className="px-4 py-5 text-sm font-semibold tracking-normal text-muted">Status</th>
                    <th className="px-8 py-5 text-sm font-semibold tracking-normal text-muted">Shelf</th>
                    <th className="px-8 py-5 text-sm font-semibold tracking-normal text-muted text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {filtered.map((book) => {
                    const status = getStatus(book.availability_status);
                    return (
                      <tr key={book.id} className="group hover:bg-info-soft hover:bg-subtle transition-all duration-200">
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-14 rounded-xl overflow-hidden bg-subtle flex-shrink-0">
                              <BookCover src={book.cover_url} alt={book.title} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-ink">{book.title}</p>
                              <p className="text-sm text-muted font-medium">{book.author}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-bold text-muted">{book.category}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-sans text-muted">{book.year ?? '—'}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-sm font-semibold text-ink">{book.copies_available}</span>
                          <span className="text-sm text-muted font-medium"> / {book.copies_total}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-sm font-sans text-muted">{book.location_shelf || '—'}</td>
                        <td className="px-8 py-4 text-right">
                          <div className="inventory-actions flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setViewingBook(book)} aria-label={`View details for ${book.title}`} style={{ minHeight: 44 }}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-link hover:bg-info-soft">
                              <Eye size={14} aria-hidden="true" /> View details
                            </button>
                            <button type="button" onClick={() => { setSuccess(''); setEditingBook(book); }}
                              aria-label={`Edit ${book.title}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-info-soft px-3 py-2 text-sm font-bold text-link hover:bg-info-soft">
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() => handleCoverClick(book.id)}
                              disabled={uploadingId === book.id}
                              title="Upload cover image"
                              aria-label={`Upload cover for ${book.title}`}
                              className="p-2 text-muted hover:text-link hover:bg-info-soft rounded-lg transition-all duration-200 disabled:opacity-50"
                            >
                              {uploadingId === book.id
                                ? <RefreshCw size={15} className="animate-spin" />
                                : <ImagePlus size={15} />}
                            </button>
                            <button
                              onClick={() => handleDelete(book.id)}
                              aria-label={`Delete ${book.title}`}
                              className="p-2 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-all duration-200"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="text-center py-20 text-muted">
                  <Package size={40} className="mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-bold tracking-normal">No books found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function InventoryCategories({ categories, activeCategory, onSelect }) {
  const trackRef = useRef(null);
  const trackId = useId();
  const [position, setPosition] = useState({ previous: false, next: false });

  useEffect(() => {
    const track = trackRef.current;
    const update = () => {
      const previous = track.scrollLeft > 4;
      const next = track.scrollLeft + track.clientWidth < track.scrollWidth - 4;
      setPosition(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    const frame = requestAnimationFrame(update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(track);
    Array.from(track.children).forEach(child => observer?.observe(child));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      track.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [categories]);

  const move = direction => {
    const track = trackRef.current;
    track.scrollBy({ left: direction * Math.max(track.clientWidth * .8, 160),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const overflow = position.previous || position.next;
  const arrowClass = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-panel text-link hover:bg-info-soft disabled:opacity-30';

  return <div className="flex min-w-0 flex-1 items-center gap-2">
    {overflow && <button type="button" className={arrowClass} aria-label="Scroll genres left" aria-controls={trackId} disabled={!position.previous} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>}
    <div ref={trackRef} id={trackId} role="region" aria-label="Book categories" tabIndex={0} className="flex min-w-0 flex-1 gap-2 overflow-x-auto no-scrollbar px-1 py-1.5">
      {categories.map(cat => <button key={cat} type="button" onClick={() => onSelect(cat)} aria-pressed={activeCategory === cat}
        className={`shrink-0 whitespace-nowrap rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition-colors ${activeCategory === cat ? 'bg-action text-white' : 'bg-panel text-muted hover:bg-info-soft hover:text-link'}`}>{cat}</button>)}
    </div>
    {overflow && <button type="button" className={arrowClass} aria-label="Scroll genres right" aria-controls={trackId} disabled={!position.next} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button>}
  </div>;
}

const StatCard = ({ label, val, icon, color }) => (
  <div className="bg-panel p-4 sm:p-6 rounded-xl border border-line shadow-sm flex flex-col items-start sm:flex-row sm:items-center gap-3 sm:gap-4 transition-all">
    <div className={`${color} w-12 h-12 rounded-xl border border-line flex items-center justify-center flex-shrink-0`}>{icon}</div>
    <div>
      <p className="text-sm font-semibold text-muted tracking-normal mb-0.5">{label}</p>
      <p className="text-3xl font-semibold text-ink tracking-normal leading-none">{val}</p>
    </div>
  </div>
);

export default LibInventory;
