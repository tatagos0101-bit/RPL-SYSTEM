import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Package, CheckCircle, Clock, BookOpen, Trash2, RefreshCw, ImagePlus, Library } from 'lucide-react';
import BookCover from '../../components/BookCover';
import { getBooks, getCategories } from '../../api/books';
import { getInventoryStats, deleteBook, uploadBookCover } from '../../api/librarian';

const getStatus = (status) => {
  if (status === 'Not available') return { label: 'Not available', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' };
  if (status === 'Limited') return { label: 'Limited', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' };
  return { label: 'Available', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' };
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

  return (
    <div className="min-h-screen bg-transparent pt-8 px-6 md:px-12 pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">
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
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500 mb-2">
              Librarian Terminal
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">
              Book <span className="text-blue-600">Inventory</span>
            </h1>
          </div>
          <button
            onClick={() => navigate('/librarian/add-book')}
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-7 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/40 active:scale-95"
          >
            <Plus size={16} /> Add New Book
          </button>
        </header>

        {/* Stats */}
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
                className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border flex-shrink-0 ${
                  activeCategory === cat
                    ? 'bg-slate-900 dark:bg-blue-600 border-slate-900 dark:border-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search title or author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Book</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Category</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Year</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-center">Copies</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Shelf</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {filtered.map((book) => {
                    const status = getStatus(book.availability_status);
                    return (
                      <tr key={book.id} className="group hover:bg-blue-50/60 dark:hover:bg-slate-700/40 transition-all duration-200">
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 flex-shrink-0">
                              <BookCover src={book.cover_url} alt={book.title} />
                            </div>
                            <div>
                              <p className="font-bold text-sm text-slate-900 dark:text-white">{book.title}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{book.author}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{book.category}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{book.year}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-sm font-black text-slate-900 dark:text-white">{book.copies_available}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium"> / {book.copies_total}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-xs font-mono text-slate-400">{book.location_shelf || '—'}</td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                            <button
                              onClick={() => handleCoverClick(book.id)}
                              disabled={uploadingId === book.id}
                              title="Upload cover image"
                              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all duration-200 hover:scale-110 disabled:opacity-50"
                            >
                              {uploadingId === book.id
                                ? <RefreshCw size={15} className="animate-spin" />
                                : <ImagePlus size={15} />}
                            </button>
                            <button
                              onClick={() => handleDelete(book.id)}
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all duration-200 hover:scale-110"
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
                <div className="text-center py-20 text-slate-400 dark:text-slate-600">
                  <Package size={40} className="mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-bold uppercase tracking-widest">No books found</p>
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
  <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1">
    <div className={`${color} w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">{val}</p>
    </div>
  </div>
);

export default LibInventory;
