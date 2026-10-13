import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, Search } from 'lucide-react';
import { bulkCopyQRPdf, getBookCopies, getCopyQRImage } from '../../api/librarian';
import { API_BASE_URL } from '../../api/urls';

export default function LibQRBulk() {
  const [copies, setCopies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    getBookCopies({ limit: 10000 })
      .then((res) => setCopies(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCopies([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return copies;
    return copies.filter((copy) =>
      copy.title.toLowerCase().includes(query) ||
      copy.author.toLowerCase().includes(query) ||
      copy.qr_code.toLowerCase().includes(query)
    );
  }, [copies, search]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map((copy) => copy.id)));
  const clearAll = () => setSelected(new Set());

  const downloadQR = (copy) => {
    setDownloading(copy.id);
    getCopyQRImage(copy.id)
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR-${copy.qr_code}.png`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => setDownloading(null));
  };

  const downloadBulk = () => {
    const ids = selected.size > 0 ? [...selected] : filtered.map((copy) => copy.id);
    setDownloading('bulk');
    bulkCopyQRPdf(ids)
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Copy-QR-Codes.pdf';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => setDownloading(null));
  };

  return (
    <div className="min-h-screen bg-transparent pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">
      <div className="w-full max-w-none px-5 md:px-8 pt-8">
        <div className="animate-fade-in-up flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-1">
              Librarian Terminal
            </p>
            <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none">
              Print <span className="text-blue-600">Copy QR</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2">
              Print one scannable label for each physical book copy.
              {selected.size > 0 && <span className="ml-2 text-blue-600 font-black">{selected.size} selected</span>}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {selected.size > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 active:scale-95"
              >
                Clear
              </button>
            )}
            <button
              onClick={selectAll}
              className="group flex items-center gap-2 px-5 py-3 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-blue-400 hover:shadow-md transition-all duration-200 active:scale-95"
            >
              <Printer size={14} /> Select Visible
            </button>
            <button
              onClick={downloadBulk}
              disabled={downloading === 'bulk' || filtered.length === 0}
              className="group flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all duration-200 shadow-lg shadow-blue-200 dark:shadow-blue-900/40 active:scale-95"
            >
              {downloading === 'bulk'
                ? <RefreshCw size={14} className="animate-spin" />
                : <Download size={14} className="group-hover:scale-110 transition-transform duration-200" />}
              {selected.size > 0 ? `Export ${selected.size}` : 'Export Visible'}
            </button>
          </div>
        </div>

        <div className="relative mb-6 max-w-md animate-fade-in-up delay-100">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search title, author, or copy QR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <RefreshCw size={28} className="animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7 gap-4">
            {filtered.map((copy, i) => {
              const isSelected = selected.has(copy.id);
              return (
                <div
                  key={copy.id}
                  onClick={() => toggleSelect(copy.id)}
                  className={`group animate-fade-in-up backdrop-blur-sm rounded-[1.25rem] p-4 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 cursor-pointer border-2 ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 shadow-lg shadow-blue-200/60 dark:shadow-blue-900/40'
                      : 'bg-white/80 dark:bg-slate-900 border-transparent hover:shadow-xl hover:shadow-blue-100/60 dark:hover:shadow-black/40 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className={`w-24 h-24 rounded-xl mb-3 flex items-center justify-center border transition-all duration-200 overflow-hidden ${
                    isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:border-blue-200'
                  }`}>
                    <img
                      src={`${API_BASE_URL}/api/inventory/book-copies/${copy.id}/qr`}
                      alt={copy.qr_code}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">
                    Copy {copy.copy_number}
                  </p>
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 font-mono mb-1 truncate w-full">
                    {copy.qr_code}
                  </p>
                  <p className="w-full min-w-0 text-[11px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 mb-1 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors duration-200">
                    {copy.title}
                  </p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium truncate w-full">
                    {copy.author}
                  </p>
                  <p className="text-[8px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest mt-1 truncate w-full">
                    {copy.location_shelf || 'Shelf not set'}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadQR(copy); }}
                    disabled={downloading === copy.id}
                    className="mt-3 w-full py-1.5 border border-blue-200 dark:border-slate-700 rounded-xl text-[8px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-600 dark:hover:bg-blue-600 dark:hover:border-blue-600 transition-all duration-200 active:scale-95 disabled:opacity-50"
                  >
                    {downloading === copy.id ? '...' : 'Download'}
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16 text-slate-400 text-xs font-black uppercase tracking-widest">
                No copy QR labels found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
