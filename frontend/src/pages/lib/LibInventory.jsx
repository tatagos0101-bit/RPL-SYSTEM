import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Package, CheckCircle, Clock, BookOpen, Trash2, RefreshCw, ImagePlus, Library, Pencil } from 'lucide-react';
import BookCover from '../../components/BookCover';
import BookEditDialog from '../../components/BookEditDialog';
import { getBooks, getCategories } from '../../api/books';
import { getInventoryStats, deleteBook, uploadBookCover } from '../../api/librarian';

const getStatus = (status) => {
  if (status === 'Not available') return { label: 'Not available', color: 'bg-danger-soft bg-danger-soft text-danger text-danger' };
  if (status === 'Limited') return { label: 'Limited', color: 'bg-warning-soft bg-warning-soft text-warning text-warning' };
  return { label: 'Available', color: 'bg-success-soft bg-success-soft text-success text-success' };
};

const LibInventory = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [invStats, setInvStats] = useState({ total_titles: 0, total_copies: 0, available_copies: 0, borrowed_copies: 0 });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);
  const uploadTargetId = useRef(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([getBooks({ limit: 1000 }), getCategories(), getInventoryStats()])
      .then(([bRes, cRes, sRes]) => {
        setBooks(bRes.data.items ?? bRes.data);
        setCategories(['All', ...cRes.data.map((c) => c.category)]);
        setInvStats(sRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchData, 0);
    return () => clearTimeout(id);
  }, [fetchData]);

  const handleDelete = (id) => {
    if (!window.confirm('Delete this book from inventory?')) return;
    deleteBook(id)
      .then(() => fetchData())
      .catch(() => {});
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
      .catch(() => {})
      .finally(() => setUploadingId(null));
  };

  const filtered = books.filter((b) => {
    const matchCat = activeCategory === 'All' || b.category === activeCategory;
    const matchSearch = b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSaved = (book) => {
    setBooks((current) => current.map((item) => item.id === book.id ? book : item));
    setEditingBook(null);
    setSuccess(`“${book.title}” was updated successfully.`);
    setActiveCategory('All');
    setSearch(book.title);
    fetchData();
  };

  return (
    <div className="rpl-page min-h-screen bg-transparent pt-8 px-6 md:px-12 pb-20 font-sans text-ink transition-colors duration-300">
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

      <div className="max-w-7xl mx-auto">

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
          <StatCard label="Total Books" val={invStats.total_titles ?? 0} icon={<Library size={18} />} color="bg-violet-500" />
          <StatCard label="Total Copies" val={invStats.total_copies ?? 0} icon={<Package size={18} />} color="bg-blue-500" />
          <StatCard label="Available" val={invStats.available_copies ?? 0} icon={<CheckCircle size={18} />} color="bg-emerald-500" />
          <StatCard label="Borrowed" val={invStats.borrowed_copies ?? 0} icon={<Clock size={18} />} color="bg-rose-500" />
        </div>

        {/* Filters */}
        <div className="animate-fade-in-up delay-200 flex flex-col lg:flex-row gap-4 mb-8">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold tracking-normal transition-all border flex-shrink-0 ${
                  activeCategory === cat
                    ? 'bg-action border-line border-line text-white'
                    : 'bg-panel border-line text-muted hover:border-line hover:text-link hover:text-link'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[220px]">
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

        {/* Table */}
        <div className="bg-panel rounded-xl border border-line shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-link" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
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
                            <div>
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
                          <div className="flex items-center justify-end gap-2">
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

const StatCard = ({ label, val, icon, color }) => (
  <div className="bg-panel p-4 sm:p-6 rounded-xl border border-line shadow-sm flex flex-col items-start sm:flex-row sm:items-center gap-3 sm:gap-4 transition-all">
    <div className={`${color} w-12 h-12 rounded-xl flex items-center justify-center text-ink shadow-md flex-shrink-0`}>{icon}</div>
    <div>
      <p className="text-sm font-semibold text-muted tracking-normal mb-0.5">{label}</p>
      <p className="text-3xl font-semibold text-ink tracking-normal leading-none">{val}</p>
    </div>
  </div>
);

export default LibInventory;
