import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  PlusSquare, Upload, FileText, CheckCircle2, AlertCircle,
  X, RefreshCw, Search, List, ImagePlus,
} from 'lucide-react';
import { addBook, bulkUpload, uploadBookCover } from '../../api/librarian';
import { getCategories } from '../../api/books';

// ── Shared ISBN fetcher ────────────────────────────────────────────────────────
async function fetchBookByISBN(isbn) {
  const clean = isbn.replace(/[-\s]/g, '');
  const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
  if (gbRes.ok) {
    const gbData = await gbRes.json();
    if (gbData.totalItems > 0) {
      const info = gbData.items[0].volumeInfo;
      const thumbnail = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';

      // Try every category segment Google Books returns to find the best label
      let category = '';
      if (info.categories?.length) {
        const segments = info.categories.flatMap((c) =>
          c.split(/[/&]/).map((s) => s.trim()).filter(Boolean)
        );
        // Prefer a segment that looks like a genre (longer, not all-caps abbreviation)
        category = segments.find((s) => s.length > 3) || segments[0] || '';
      }

      return {
        title:     info.title || '',
        author:    info.authors ? info.authors.join(', ') : '',
        category,
        year:      info.publishedDate ? info.publishedDate.slice(0, 4) : '',
        cover_url: thumbnail.replace('http://', 'https://').replace('&zoom=1', '&zoom=0'),
      };
    }
  }
  // Fallback: Open Library
  const olRes = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
  );
  if (olRes.ok) {
    const olData = await olRes.json();
    const key = `ISBN:${clean}`;
    if (olData[key]) {
      const info = olData[key];
      const cover = info.cover?.large || info.cover?.medium || info.cover?.small || '';
      // Open Library subjects can be verbose — take the shortest clean one
      const subjects = (info.subjects || []).map((s) => s.name || s).filter(Boolean);
      const category = subjects.sort((a, b) => a.length - b.length)[0] || '';
      return {
        title:     info.title || '',
        author:    info.authors ? info.authors.map((a) => a.name).join(', ') : '',
        category,
        year:      info.publish_date ? info.publish_date.slice(-4) : '',
        cover_url: cover,
      };
    }
  }
  throw new Error('Not found');
}

// Returns matched existing category, raw API value (as suggestion), or empty string
function matchCategory(raw, categories) {
  if (!raw) return { matched: '', isNew: false };
  const exact   = categories.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (exact) return { matched: exact, isNew: false };
  const partial = categories.find((c) => raw.toLowerCase().includes(c.toLowerCase()));
  if (partial) return { matched: partial, isNew: false };
  return { matched: raw, isNew: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Extract ISBNs from an uploaded file ───────────────────────────────────────
async function extractISBNsFromFile(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h).toLowerCase().trim());
  const isbnCol = headers.findIndex((h) => h.includes('isbn'));
  const colIdx = isbnCol >= 0 ? isbnCol : 0;

  return rows
    .slice(isbnCol >= 0 ? 1 : 0) // skip header row only if we found an isbn column
    .map((row) => String(row[colIdx] || '').replace(/[-\s]/g, '').trim())
    .filter((v) => /^\d{10}(\d{3})?$/.test(v)); // valid ISBN-10 or ISBN-13
}

// ══════════════════════════════════════════════════════════════════════════════
export default function LibAddBook() {
  const [mode, setMode] = useState('manual'); // 'manual' | 'isbn-bulk' | 'upload'
  const [categories, setCategories] = useState([]);

  // ── Manual form state ──────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: '', author: '', category: '', year: '',
    isbn: '', copies: '', location: '', cover_url: '',
  });
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [formError, setFormError]     = useState('');

  // ── Category custom-input mode ────────────────────────────────────────────
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  // ── Cover image file upload state ─────────────────────────────────────────
  const [coverFile, setCoverFile]           = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const coverFileInputRef                   = useRef(null);

  // ── Single ISBN lookup state ───────────────────────────────────────────────
  const [isbnInput, setIsbnInput]         = useState('');
  const [lookingUp, setLookingUp]         = useState(false);
  const [lookupError, setLookupError]     = useState('');
  const [lookupSuccess, setLookupSuccess] = useState(false);

  // ── Bulk ISBN state ────────────────────────────────────────────────────────
  const [bulkFile, setBulkFile]         = useState(null);
  const [bulkText, setBulkText]         = useState('');
  const [bulkDragging, setBulkDragging] = useState(false);
  const [bulkResults, setBulkResults]   = useState([]); // { isbn, status, data? }
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total }
  const [bulkRunning, setBulkRunning]   = useState(false);
  const [selected, setSelected]         = useState(new Set());
  const [bulkCopies, setBulkCopies]     = useState('1');
  const [importing, setImporting]       = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const bulkAbortRef = useRef(false);

  // ── Upload (full book data) state ──────────────────────────────────────────
  const [dragging, setDragging]       = useState(false);
  const [file, setFile]               = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data.map((c) => c.category)))
      .catch(() => {});
  }, []);

  // ── Single book handlers ───────────────────────────────────────────────────
  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    // Typing a URL manually clears any queued file
    if (e.target.name === 'cover_url' && coverFile) removeCoverFile();
  };

  const handleCoverFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverFile(f);
    setCoverPreviewUrl(URL.createObjectURL(f));
    setForm((prev) => ({ ...prev, cover_url: '' }));
  };

  const removeCoverFile = () => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverFile(null);
    setCoverPreviewUrl('');
    if (coverFileInputRef.current) coverFileInputRef.current.value = '';
  };

  const handleIsbnLookup = async () => {
    const cleanIsbn = isbnInput.trim().replace(/[-\s]/g, '');
    if (!cleanIsbn) return;
    if (!/^\d{10}(\d{3})?$/.test(cleanIsbn)) {
      setLookupError('Invalid ISBN — must be 10 or 13 digits.');
      return;
    }
    setLookingUp(true);
    setLookupError('');
    setLookupSuccess(false);
    try {
      const data = await fetchBookByISBN(isbnInput.trim());
      const { matched, isNew } = matchCategory(data.category, categories);
      setForm((prev) => ({
        ...prev,
        isbn:      isbnInput.trim(),
        title:     data.title     || prev.title,
        author:    data.author    || prev.author,
        year:      data.year      || prev.year,
        cover_url: data.cover_url || prev.cover_url,
        category:  matched        || prev.category,
      }));
      if (matched && isNew) setUseCustomCategory(true);
      setLookupSuccess(true);
    } catch {
      setLookupError('Book not found. Check the ISBN and try again.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    // ── Client-side validation ─────────────────────────────────────────────
    const t = form.title.trim();
    const a = form.author.trim();
    const c = form.category.trim();
    if (!t) return setFormError('Title is required.');
    if (t.length > 500) return setFormError('Title must be at most 500 characters.');
    if (!a) return setFormError('Author is required.');
    if (a.length > 200) return setFormError('Author must be at most 200 characters.');
    if (!c) return setFormError('Category is required.');
    if (c.length > 100) return setFormError('Category must be at most 100 characters.');
    if (form.year) {
      const yr = parseInt(form.year);
      if (isNaN(yr) || yr < 1000 || yr > 2200) return setFormError('Year must be between 1000 and 2200.');
    }
    if (form.isbn) {
      const cleanIsbn = form.isbn.trim().replace(/[-\s]/g, '');
      if (!/^[\dX]{8,20}$/i.test(cleanIsbn)) return setFormError('Invalid ISBN format.');
    }
    if (form.copies) {
      const cp = parseInt(form.copies);
      if (isNaN(cp) || cp < 1 || cp > 10000) return setFormError('Copies must be between 1 and 10,000.');
    }
    if (form.location && form.location.trim().length > 100)
      return setFormError('Shelf location must be at most 100 characters.');
    if (form.cover_url && form.cover_url.trim()) {
      if (!/^https?:\/\//i.test(form.cover_url.trim()))
        return setFormError('Cover URL must start with http:// or https://');
      if (form.cover_url.trim().length > 500)
        return setFormError('Cover URL must be at most 500 characters.');
    }

    setSubmitting(true);
    addBook({
      title:          t,
      author:         a,
      category:       c,
      year:           form.year ? parseInt(form.year) : null,
      isbn:           form.isbn ? form.isbn.trim() : null,
      copies_total:   form.copies ? parseInt(form.copies) : 1,
      location_shelf: form.location ? form.location.trim() : null,
      cover_url:      form.cover_url ? form.cover_url.trim() : null,
    })
      .then(async (res) => {
        if (coverFile) {
          try { await uploadBookCover(res.data.id, coverFile); } catch { /* cover upload failed, book still added */ }
        }
        setSubmitted(true);
        setForm({ title: '', author: '', category: '', year: '', isbn: '', copies: '', location: '', cover_url: '' });
        setIsbnInput('');
        setLookupSuccess(false);
        setLookupError('');
        setUseCustomCategory(false);
        removeCoverFile();
        setTimeout(() => setSubmitted(false), 3000);
      })
      .catch((err) => setFormError(err?.response?.data?.detail || 'Failed to add book. Please try again.'))
      .finally(() => setSubmitting(false));
  };

  // ── Bulk ISBN handlers ─────────────────────────────────────────────────────
  const handleBulkDrop = async (e) => {
    e.preventDefault();
    setBulkDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setBulkFile(dropped); setBulkResults([]); setImportSummary(null); }
  };

  const handleBulkFileChange = (e) => {
    const f = e.target.files[0];
    if (f) { setBulkFile(f); setBulkResults([]); setImportSummary(null); }
  };

  const startBulkLookup = async () => {
    let isbns = [];

    if (bulkFile) {
      try {
        isbns = await extractISBNsFromFile(bulkFile);
      } catch {
        isbns = [];
      }
    }

    // Also parse pasted text (one per line, strip dashes/spaces)
    if (bulkText.trim()) {
      const pasted = bulkText
        .split(/[\n,;]+/)
        .map((s) => s.replace(/[-\s]/g, '').trim())
        .filter((v) => /^\d{10}(\d{3})?$/.test(v));
      isbns = [...new Set([...isbns, ...pasted])];
    }

    if (isbns.length === 0) return;

    setBulkRunning(true);
    setBulkResults([]);
    setSelected(new Set());
    setImportSummary(null);
    bulkAbortRef.current = false;
    setBulkProgress({ done: 0, total: isbns.length });

    const results = [];
    for (let i = 0; i < isbns.length; i++) {
      if (bulkAbortRef.current) break;
      const isbn = isbns[i];
      try {
        const data = await fetchBookByISBN(isbn);
        results.push({ isbn, status: 'found', data: { ...data, category: matchCategory(data.category, categories) } });
      } catch {
        results.push({ isbn, status: 'not_found', data: null });
      }
      setBulkProgress({ done: i + 1, total: isbns.length });
      setBulkResults([...results]);
      if (i < isbns.length - 1) await sleep(150); // gentle rate limiting
    }

    // Auto-select all found books
    const foundSet = new Set(results.filter((r) => r.status === 'found').map((r) => r.isbn));
    setSelected(foundSet);
    setBulkRunning(false);
    setBulkProgress(null);
  };

  const toggleSelect = (isbn) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(isbn) ? next.delete(isbn) : next.add(isbn);
      return next;
    });
  };

  const toggleAll = () => {
    const found = bulkResults.filter((r) => r.status === 'found').map((r) => r.isbn);
    if (found.every((isbn) => selected.has(isbn))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(found));
    }
  };

  const handleBulkImport = async () => {
    const toImport = bulkResults.filter((r) => r.status === 'found' && selected.has(r.isbn));
    if (toImport.length === 0) return;
    setImporting(true);
    let ok = 0, fail = 0, skipped = 0;
    const rowErrors = {};
    for (const row of toImport) {
      try {
        await addBook({
          title:          (row.data.title  || 'Unknown Title').slice(0, 255),
          author:         (row.data.author || 'Unknown Author').slice(0, 180),
          category:       (row.data.category || categories[0] || 'General').slice(0, 80),
          year:           row.data.year ? parseInt(row.data.year) : null,
          isbn:           row.isbn,
          copies_total:   parseInt(bulkCopies) || 1,
          cover_url:      row.data.cover_url ? row.data.cover_url.slice(0, 500) : null,
        });
        ok++;
      } catch (err) {
        const detail = err?.response?.data?.detail || '';
        if (detail.toLowerCase().includes('already exists')) {
          skipped++;
          rowErrors[row.isbn] = 'Already in catalog';
        } else {
          fail++;
          rowErrors[row.isbn] = detail || 'Failed to add';
        }
      }
    }
    // Mark rows with errors in results
    setBulkResults((prev) =>
      prev.map((r) =>
        rowErrors[r.isbn] ? { ...r, importError: rowErrors[r.isbn] } : r
      )
    );
    setImporting(false);
    setImportSummary({ ok, fail, skipped });
    setSelected(new Set());
  };

  // ── Full-data upload handlers ──────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setUploadResult(null); setUploadError(''); }
  };

  const handleUpload = () => {
    if (!file) return;
    const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_EXCEL_BYTES) {
      setUploadError('File too large — maximum size is 10 MB.');
      return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      setUploadError('Only .xlsx or .xls files are accepted.');
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    bulkUpload(fd)
      .then((res) => { setUploadResult(res.data); setFile(null); })
      .catch((err) => setUploadError(err?.response?.data?.detail || 'Upload failed. Check your file format.'))
      .finally(() => setUploading(false));
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const foundCount    = bulkResults.filter((r) => r.status === 'found').length;
  const notFoundCount = bulkResults.filter((r) => r.status === 'not_found').length;
  const canLookup     = bulkFile || bulkText.trim();

  return (
    <div className="min-h-screen bg-transparent pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-5 md:px-8 pt-8">

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-1">
            Librarian Terminal
          </p>
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none">
            Add <span className="text-blue-600">Book</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2">
            Add a single book, bulk-search by ISBN, or import via file upload.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="animate-fade-in-up delay-100 flex flex-wrap gap-1 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 p-1.5 rounded-2xl mb-7 w-fit shadow-sm">
          {[
            { id: 'manual',     icon: <PlusSquare size={14} />, label: 'Single Book' },
            { id: 'isbn-bulk',  icon: <List size={14} />,       label: 'ISBN Bulk Lookup' },
            { id: 'upload',     icon: <Upload size={14} />,     label: 'Upload File' },
          ].map(({ id, icon, label }) => (
            <button key={id} onClick={() => setMode(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── SINGLE BOOK ── */}
        {mode === 'manual' && (
          <div className="animate-fade-in-up delay-200 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm">
            {submitted ? (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-1">Book Added!</h3>
                <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">The book has been added to the catalog.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* ISBN Auto-Fill */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">
                    ISBN Auto-Fill
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text" value={isbnInput}
                      onChange={(e) => { setIsbnInput(e.target.value); setLookupError(''); setLookupSuccess(false); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleIsbnLookup())}
                      placeholder="Enter ISBN-10 or ISBN-13…"
                      className="flex-1 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    />
                    <button type="button" onClick={handleIsbnLookup} disabled={lookingUp || !isbnInput.trim()}
                      className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
                      {lookingUp ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                      {lookingUp ? 'Looking up…' : 'Look Up'}
                    </button>
                  </div>
                  {lookupSuccess && (
                    <div className="flex items-center gap-2 mt-2">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Book found! Fields have been auto-filled. Review and edit as needed.</p>
                    </div>
                  )}
                  {lookupError && (
                    <div className="flex items-center gap-2 mt-2">
                      <AlertCircle size={13} className="text-rose-500" />
                      <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{lookupError}</p>
                    </div>
                  )}
                </div>

                {/* Cover preview */}
                {(coverPreviewUrl || form.cover_url) && (
                  <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3">
                    <img src={coverPreviewUrl || form.cover_url} alt="Book cover preview"
                      className="w-14 h-20 object-cover rounded-xl shadow-md flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Cover Preview</p>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 break-all line-clamp-2">
                        {coverFile ? coverFile.name : form.cover_url}
                      </p>
                    </div>
                    <button type="button" onClick={() => {
                      if (coverFile) removeCoverFile();
                      else setForm((p) => ({ ...p, cover_url: '' }));
                    }} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {formError && (
                  <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl px-4 py-3">
                    <AlertCircle size={14} className="text-rose-600 flex-shrink-0" />
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400">{formError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Title"  name="title"  value={form.title}  onChange={handleFormChange} required />
                  <Field label="Author" name="author" value={form.author} onChange={handleFormChange} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        Category
                      </label>
                      <button type="button"
                        onClick={() => { setUseCustomCategory((v) => !v); setForm((p) => ({ ...p, category: '' })); }}
                        className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                        {useCustomCategory ? '← Pick existing' : '+ New category'}
                      </button>
                    </div>

                    {useCustomCategory ? (
                      <div className="relative">
                        <input
                          type="text" name="category" value={form.category}
                          onChange={handleFormChange}
                          placeholder="Type a new category…"
                          required
                          maxLength={100}
                          className="w-full bg-slate-100 dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                        />
                        {form.category && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                            New
                          </span>
                        )}
                      </div>
                    ) : (
                      <select name="category" value={form.category}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setUseCustomCategory(true);
                            setForm((p) => ({ ...p, category: '' }));
                          } else {
                            handleFormChange(e);
                          }
                        }}
                        required
                        className="w-full bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 appearance-none">
                        <option value="">Select category...</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        <option disabled>──────────</option>
                        <option value="__custom__">+ Type new category…</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Year Published</label>
                    <select name="year" value={form.year} onChange={handleFormChange}
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 appearance-none">
                      <option value="">Select year...</option>
                      {Array.from({ length: new Date().getFullYear() - 1799 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="ISBN" name="isbn" value={form.isbn} onChange={handleFormChange} placeholder="e.g. 978-3-16-148410-0" />
                  <Field label="Number of Copies" name="copies" type="number" value={form.copies} onChange={handleFormChange} placeholder="e.g. 3" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Shelf Location" name="location" value={form.location} onChange={handleFormChange} placeholder="e.g. Aisle 3, Shelf B" />

                  {/* Cover Image — URL or file upload */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
                      Cover Image
                    </label>
                    <input
                      type="text" name="cover_url" value={form.cover_url}
                      onChange={handleFormChange}
                      disabled={!!coverFile}
                      placeholder={coverFile ? `File: ${coverFile.name}` : 'Paste URL or upload below…'}
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-50"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">or</span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <label className={`mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-[10px] font-black uppercase tracking-widest ${
                      coverFile
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}>
                      <ImagePlus size={14} />
                      {coverFile ? 'Change Image' : 'Upload Image'}
                      <input
                        ref={coverFileInputRef}
                        type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleCoverFileChange}
                      />
                    </label>
                  </div>
                </div>

                <button type="submit" disabled={submitting}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/40 active:scale-[0.98] flex items-center justify-center gap-2 mt-2">
                  {submitting ? <RefreshCw size={15} className="animate-spin" /> : <PlusSquare size={15} />}
                  {submitting ? 'Adding...' : 'Add to Catalog'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── ISBN BULK LOOKUP ── */}
        {mode === 'isbn-bulk' && (
          <div className="animate-fade-in-up delay-200 space-y-5">

            {/* Input area */}
            <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm space-y-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Option 1 — Upload a file</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Upload an <strong>.xlsx</strong> or <strong>.csv</strong> file. The system will look for a column named <em>ISBN</em>; if none is found, it reads the first column.
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setBulkDragging(true); }}
                  onDragLeave={() => setBulkDragging(false)}
                  onDrop={handleBulkDrop}
                  className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                    bulkDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {bulkFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{bulkFile.name}</span>
                      <button onClick={() => setBulkFile(null)} className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">Drag & drop .xlsx / .csv here</p>
                      <label className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest cursor-pointer transition-all">
                        Browse File
                        <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleBulkFileChange} />
                      </label>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Option 2 — Paste ISBNs</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">One ISBN per line (or comma-separated). Dashes and spaces are ignored.</p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  placeholder={"9780307474278\n9780743273565\n978-0-06-112008-4\n..."}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={startBulkLookup}
                  disabled={bulkRunning || !canLookup}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {bulkRunning ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                  {bulkRunning
                    ? bulkProgress ? `Looking up ${bulkProgress.done} / ${bulkProgress.total}…` : 'Starting…'
                    : 'Look Up All ISBNs'}
                </button>
                {bulkRunning && (
                  <button onClick={() => { bulkAbortRef.current = true; }}
                    className="px-5 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all">
                    Stop
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {bulkRunning && bulkProgress && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Results */}
            {bulkResults.length > 0 && (
              <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm space-y-5">

                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                    Results
                  </span>
                  <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                    {foundCount} found
                  </span>
                  {notFoundCount > 0 && (
                    <span className="px-3 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {notFoundCount} not found
                    </span>
                  )}
                  {foundCount > 0 && (
                    <button onClick={toggleAll}
                      className="ml-auto text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline">
                      {bulkResults.filter((r) => r.status === 'found').every((r) => selected.has(r.isbn))
                        ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {/* Result rows */}
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {bulkResults.map((row) => (
                    <div key={row.isbn}
                      className={`flex items-center gap-3 rounded-2xl p-3 border transition-all ${
                        row.status === 'found'
                          ? selected.has(row.isbn)
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                          : 'border-rose-100 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-900/10 opacity-60'
                      }`}
                    >
                      {/* Checkbox */}
                      {row.status === 'found' ? (
                        <input type="checkbox" checked={selected.has(row.isbn)} onChange={() => toggleSelect(row.isbn)}
                          className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer" />
                      ) : (
                        <div className="w-4 h-4 flex-shrink-0" />
                      )}

                      {/* Cover */}
                      {row.status === 'found' && row.data?.cover_url ? (
                        <img src={row.data.cover_url} alt=""
                          className="w-10 h-14 object-cover rounded-lg shadow flex-shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div className="w-10 h-14 bg-slate-200 dark:bg-slate-700 rounded-lg flex-shrink-0 flex items-center justify-center">
                          <FileText size={14} className="text-slate-400" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {row.status === 'found' ? (
                          <>
                            <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{row.data.title || '—'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.data.author || '—'}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {row.data.year && <span className="text-[10px] text-slate-400">{row.data.year}</span>}
                              {row.data.category && (
                                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                                  {row.data.category}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Not found</p>
                        )}
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">{row.isbn}</p>
                        {row.importError && (
                          <p className="text-[10px] font-bold text-rose-500 mt-0.5">{row.importError}</p>
                        )}
                      </div>

                      {/* Status icon */}
                      {row.importError
                        ? <AlertCircle size={15} className="text-rose-400 flex-shrink-0" />
                        : row.status === 'found'
                          ? <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                          : <AlertCircle size={15} className="text-rose-400 flex-shrink-0" />}
                    </div>
                  ))}
                </div>

                {/* Import controls */}
                {foundCount > 0 && (
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    {importSummary && (
                      <div className={`rounded-2xl px-4 py-3 border space-y-0.5 ${
                        importSummary.fail === 0
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                      }`}>
                        {importSummary.ok > 0 && (
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {importSummary.ok} book{importSummary.ok !== 1 ? 's' : ''} added to catalog.
                          </p>
                        )}
                        {importSummary.skipped > 0 && (
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            {importSummary.skipped} already in catalog (skipped).
                          </p>
                        )}
                        {importSummary.fail > 0 && (
                          <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                            {importSummary.fail} failed — see errors below.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <div className="flex-shrink-0">
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Copies each</label>
                        <input type="number" min="1" value={bulkCopies} onChange={(e) => setBulkCopies(e.target.value)}
                          className="w-24 bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200" />
                      </div>
                      <button
                        onClick={handleBulkImport}
                        disabled={importing || selected.size === 0}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {importing ? <RefreshCw size={14} className="animate-spin" /> : <PlusSquare size={14} />}
                        {importing ? 'Adding to catalog…' : `Add ${selected.size} Selected Book${selected.size !== 1 ? 's' : ''} to Catalog`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── UPLOAD FILE ── */}
        {mode === 'upload' && (
          <div className="animate-fade-in-up delay-200 space-y-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`rounded-[2.5rem] border-2 border-dashed p-16 text-center transition-all duration-200 ${
                dragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900 backdrop-blur-sm'
              }`}
            >
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Upload size={28} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="font-black uppercase tracking-widest text-sm text-slate-700 dark:text-slate-300 mb-2">
                Drag & drop your file here
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mb-6">
                Supports .xlsx and .csv — max 10 MB
              </p>
              <label className="px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest cursor-pointer transition-all">
                Browse File
                <input type="file" accept=".xlsx,.csv" className="hidden"
                  onChange={(e) => { setFile(e.target.files[0]); setUploadResult(null); setUploadError(''); }} />
              </label>
            </div>

            {file && (
              <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => setFile(null)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all">
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadResult && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-[2rem] p-5 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  {uploadResult.imported ?? uploadResult.count ?? 'Books'} books imported successfully!
                </p>
              </div>
            )}
            {uploadError && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-[2rem] p-5 flex items-center gap-3">
                <AlertCircle size={18} className="text-rose-600 flex-shrink-0" />
                <p className="text-sm font-bold text-rose-800 dark:text-rose-300">{uploadError}</p>
              </div>
            )}

            <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] p-7">
              <div className="flex items-center gap-3 mb-5">
                <AlertCircle size={15} className="text-amber-500" />
                <h3 className="font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">Required Columns</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {['Title', 'Author', 'Category', 'Year', 'ISBN', 'Copies', 'Location', 'Cover URL'].map((col) => (
                  <div key={col} className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">{col}</p>
                  </div>
                ))}
              </div>
              <button onClick={handleUpload} disabled={!file || uploading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2">
                {uploading ? <RefreshCw size={15} className="animate-spin" /> : <FileText size={15} />}
                {uploading ? 'Processing...' : 'Process & Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Field = ({ label, name, value, onChange, type = 'text', placeholder = '', required = false }) => (
  <div>
    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
    <input
      type={type} name={name} value={value} onChange={onChange}
      placeholder={placeholder} required={required}
      className="w-full bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
    />
  </div>
);
