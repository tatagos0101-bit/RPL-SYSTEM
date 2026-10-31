import { useState, useEffect, useRef } from 'react';
import {
  PlusSquare, Upload, FileText, CheckCircle2, AlertCircle,
  X, RefreshCw, Search, List, ImagePlus, Trash2,
} from 'lucide-react';
import { addBook, bulkUpload, uploadBookCover, getInventoryWrite, suggestBookCategory } from '../../api/librarian';
import { getCategories } from '../../api/books';
import CategoryReview from '../../components/CategoryReview';
import { extractISBNsFromFile, normalizeISBN, isISBN } from '../../api/isbnFiles';
import { errorMessage, readJournal, saveJournal, reconcileWrite, isDefiniteRejection, sha256, isUnconfirmedISBNRow, removeISBNResults } from '../../api/inventoryWrites';

// ── Shared ISBN fetcher ────────────────────────────────────────────────────────
async function fetchBookByISBN(isbn) {
  const clean = isbn.replace(/[-\s]/g, '');
  const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
  if (gbRes.ok) {
    const gbData = await gbRes.json();
    if (gbData.totalItems > 0) {
      const info = gbData.items[0].volumeInfo;
      const thumbnail = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';

      const suggestion = await suggestBookCategory(info.categories || []);
      const category = suggestion.data.raw_api_label;

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
      const subjects = (info.subjects || []).map((subject) => subject.name || subject).filter(Boolean);
      const suggestion = await suggestBookCategory(subjects);
      const category = suggestion.data.raw_api_label;
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const [coverRetry, setCoverRetry] = useState(null);

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
  const [bulkResults, setBulkResults]   = useState(() => { try { return readJournal().rows || []; } catch { return []; } }); // { isbn, status, data? }
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total }
  const [bulkRunning, setBulkRunning]   = useState(false);
  const [bulkLookupError, setBulkLookupError] = useState('');
  const [selected, setSelected]         = useState(new Set());
  const [bulkCopies, setBulkCopies]     = useState('1');
  const [importing, setImporting]       = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const bulkAbortRef = useRef(false);
  const bulkTextRef = useRef(null);

  // ── Upload (full book data) state ──────────────────────────────────────────
  const [dragging, setDragging]       = useState(false);
  const [file, setFile]               = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');

  const [recoveryVersion, setRecoveryVersion] = useState(0);
  let recovery = {}, recoveryError = '';
  try { recovery = readJournal(); } catch (error) { recoveryError = errorMessage(error); }
  const pendingManual = recovery.manual?.status === 'pending' ? recovery.manual : null;
  const pendingWorkbook = recovery.workbook?.status === 'pending' ? recovery.workbook : null;
  const [categoryError, setCategoryError] = useState('');
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => { if (!cancelled) { setCategories(res.data.map((c) => c.category)); setCategoryError(''); } })
      .catch(() => { if (!cancelled) setCategoryError('Categories could not be loaded.'); });
    return () => { cancelled = true; };
  }, [categoryAttempt]);

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
    const cleanIsbn = normalizeISBN(isbnInput);
    if (!cleanIsbn) return;
    if (!isISBN(cleanIsbn)) {
      setLookupError('Enter an ISBN-10 (which may end in X) or a 13-digit ISBN.');
      return;
    }
    setLookingUp(true);
    setLookupError('');
    setLookupSuccess(false);
    try {
      const data = await fetchBookByISBN(cleanIsbn);
      const { matched, isNew } = { matched: data.category, isNew: !categories.includes(data.category) };
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

  const submitManual = async (payload) => {
    if (submitting) return;
    setSubmitting(true);
    setFormError('');
    setSubmitted(false);
    let request;
    try {
      const previous = readJournal().manual;
      request = previous?.status === 'pending' ? previous : { id: crypto.randomUUID(), payload, status: 'pending' };
      saveJournal('manual', request);
      setRecoveryVersion(value => value + 1);
      const res = await reconcileWrite(request.id, getInventoryWrite, id => addBook(request.payload, id));
      saveJournal('manual', { ...request, status: 'done', result: res.data });
      if (coverFile) {
        try { await uploadBookCover(res.data.id, coverFile); }
        catch { setCoverRetry({ id: res.data.id, file: coverFile }); }
      }
      setSubmitted(true);
      setForm({ title: '', author: '', category: '', year: '', isbn: '', copies: '', location: '', cover_url: '' });
      setIsbnInput(''); setLookupSuccess(false); setLookupError(''); setUseCustomCategory(false);
      removeCoverFile();
    } catch (error) {
      if (request && isDefiniteRejection(error)) {
        try { saveJournal('manual', { ...request, status: 'rejected' }); } catch { /* Keep original request for recovery. */ }
      }
      setFormError(errorMessage(error));
    } finally { setSubmitting(false); setRecoveryVersion(value => value + 1); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pendingManual) { submitManual(); return; }
    setFormError('');

    // ── Client-side validation ─────────────────────────────────────────────
    const t = form.title.trim();
    const a = form.author.trim();
    const c = form.category.trim();
    if (!t) return setFormError('Title is required.');
    if (t.length > 255) return setFormError('Title must be at most 255 characters.');
    if (!a) return setFormError('Author is required.');
    if (a.length > 180) return setFormError('Author must be at most 180 characters.');
    if (!c) return setFormError('Category is required.');
    if (c.length > 1000) return setFormError('Category must be at most 1000 characters.');
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
    if (form.location && form.location.trim().length > 80)
      return setFormError('Shelf location must be at most 80 characters.');
    if (form.cover_url && form.cover_url.trim()) {
      if (!/^https?:\/\//i.test(form.cover_url.trim()))
        return setFormError('Cover URL must start with http:// or https://');
      if (form.cover_url.trim().length > 500)
        return setFormError('Cover URL must be at most 500 characters.');
    }

    submitManual({
      title:          t,
      author:         a,
      category:       c,
      year:           form.year ? parseInt(form.year) : null,
      isbn:           form.isbn ? form.isbn.trim() : null,
      copies_total:   form.copies ? parseInt(form.copies) : 1,
      location_shelf: form.location ? form.location.trim() : null,
      cover_url:      form.cover_url ? form.cover_url.trim() : null,
    });
  };

  // ── Bulk ISBN handlers ─────────────────────────────────────────────────────
  const handleBulkDrop = async (e) => {
    e.preventDefault();
    if (bulkRunning || importing || bulkResults.some(isUnconfirmedISBNRow)) return;
    setBulkDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setBulkFile(dropped); setBulkResults([]); setImportSummary(null); }
  };

  const handleBulkFileChange = (e) => {
    if (bulkRunning || importing || bulkResults.some(isUnconfirmedISBNRow)) return;
    const f = e.target.files[0];
    if (f) { setBulkFile(f); setBulkResults([]); setImportSummary(null); }
  };

  const startBulkLookup = async () => {
    if (bulkRunning) return;
    if (importing || bulkResults.some(row => row.requestId && !row.imported && !row.skipped)) { setFormError('Resolve the pending import rows before starting another lookup.'); return; }
    let isbns = [];
    setBulkLookupError('');

    if (bulkFile) {
      try {
        isbns = await extractISBNsFromFile(bulkFile);
      } catch {
        setBulkLookupError('Could not read this file. Choose a readable .csv, .xlsx, or .xls file and try again.');
        return;
      }
    }

    // Also parse pasted text (one per line, strip dashes/spaces)
    if (bulkText.trim()) {
      const pasted = bulkText
        .split(/[\n,;]+/)
        .map(normalizeISBN)
        .filter(isISBN);
      isbns = [...new Set([...isbns, ...pasted])];
    }

    if (isbns.length === 0) {
      setBulkLookupError('No usable ISBNs found. Put ISBN-10 or ISBN-13 values in an ISBN column (or the first column). Store ISBNs as text in Excel to preserve leading zeroes.');
      return;
    }

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
        results.push({ isbn, status: 'found', data: { ...data, category: data.category } });
      } catch {
        results.push({ isbn, status: 'not_found', data: null });
      }
      setBulkProgress({ done: i + 1, total: isbns.length });
      setBulkResults([...results]);
      if (i < isbns.length - 1) await sleep(150); // gentle rate limiting
    }

    // Auto-select all found books
    const foundSet = new Set(results.filter((r) => r.status === 'found' && !r.imported && !r.skipped).map((r) => r.isbn));
    try { saveJournal('rows', results); } catch (error) { setFormError(errorMessage(error)); }
    setSelected(foundSet);
    setBulkRunning(false);
    setBulkProgress(null);
  };

  const toggleSelect = (isbn) => {
    if (bulkRunning || importing) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(isbn) ? next.delete(isbn) : next.add(isbn);
      return next;
    });
  };

  const toggleAll = () => {
    if (bulkRunning || importing) return;
    const all = bulkResults.map(row => row.isbn);
    if (all.every((isbn) => selected.has(isbn))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(all));
    }
  };

  const clearBulkResults = (isbns, done = false) => {
    if (bulkRunning || importing) return;
    try {
      const remaining = removeISBNResults(bulkResults, isbns);
      setBulkResults(remaining);
      setSelected(previous => new Set([...previous].filter(isbn => !isbns.has(isbn))));
      setImportSummary(null);
      setFormError('');
      if (done || remaining.length === 0) {
        setBulkFile(null);
        setBulkText('');
        setBulkCopies('1');
        setBulkProgress(null);
        setBulkLookupError('');
        setBulkDragging(false);
        bulkTextRef.current?.focus({ preventScroll: true });
        bulkTextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) { setFormError(errorMessage(error)); }
  };

  const handleBulkImport = async () => {
    if (bulkRunning || importing) return;
    const toImport = bulkResults.filter((r) => r.status === 'found' && !r.imported && !r.skipped && selected.has(r.isbn));
    if (toImport.length === 0) return;
    setImporting(true);
    let ok = 0, fail = 0, skipped = 0;
    let rows = [...bulkResults];
    const updateRow = (row) => {
      rows = rows.map(item => item.isbn === row.isbn ? row : item);
      saveJournal('rows', rows);
      setBulkResults([...rows]);
    };
    try {
      for (const original of toImport) {
        let row = { ...original, requestId: original.requestId || crypto.randomUUID() };
        row.payload ||= {
          title: (row.data.title || 'Unknown Title').slice(0, 255),
          author: (row.data.author || 'Unknown Author').slice(0, 180),
          category: (row.data.category || 'General').slice(0, 1000),
          year: row.data.year ? parseInt(row.data.year) : null,
          isbn: row.isbn, copies_total: parseInt(bulkCopies) || 1,
          cover_url: row.data.cover_url ? row.data.cover_url.slice(0, 500) : null,
        };
        updateRow(row);
        try {
          const res = await reconcileWrite(row.requestId, getInventoryWrite, id => addBook(row.payload, id));
          row = { ...row, imported: true, bookId: res.data.id, importError: '' };
          ok++;
        } catch (error) {
          const detail = errorMessage(error);
          if (error?.response?.status === 400 && detail.toLowerCase().includes('already exists')) {
            row = { ...row, skipped: true, importError: 'Already in catalog' }; skipped++;
          } else {
            row = { ...row, importError: detail }; fail++;
            if (isDefiniteRejection(error)) { delete row.requestId; delete row.payload; }
          }
        }
        updateRow(row);
      }
    } catch (error) { setFormError(errorMessage(error)); }
    finally {
      setImporting(false);
      setImportSummary({ ok, fail, skipped });
      setSelected(new Set(rows.filter(row => row.status === 'found' && !row.imported && !row.skipped).map(row => row.isbn)));
    }
  };

  // ── Full-data upload handlers ──────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setUploadResult(null); setUploadError(''); }
  };

  const handleUpload = async () => {
    if (uploading) return;
    if (!file && !pendingWorkbook) return;
    const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
    if (file && file.size > MAX_EXCEL_BYTES) {
      setUploadError('File too large — maximum size is 10 MB.');
      return;
    }
    const ext = file?.name.split('.').pop().toLowerCase();
    if (file && ext !== 'xlsx') {
      setUploadError('Full inventory import requires .xlsx; convert legacy .xls first.');
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadResult(null);
    let request;
    try {
      const previous = readJournal().workbook;
      const digest = file ? await sha256(file) : null;
      if (previous?.status === 'pending' && digest && digest !== previous.digest) throw new Error('Resolve the pending workbook before importing a different file. Reselect the original workbook.');
      request = previous && (previous.status === 'pending' || previous.digest === digest) ? previous : { id: crypto.randomUUID(), digest, filename: file.name, status: 'pending' };
      saveJournal('workbook', request);
      setRecoveryVersion(value => value + 1);
      const res = await reconcileWrite(request.id, getInventoryWrite, id => {
        if (!file) throw new Error('No saved result yet. Reselect the original workbook and retry with this request.');
        const fd = new FormData(); fd.append('file', file);
        return bulkUpload(fd, id, request.digest);
      });
      saveJournal('workbook', { ...request, status: 'done', result: res.data });
      setUploadResult(res.data); setFile(null);
    } catch (error) {
      if (request && isDefiniteRejection(error)) {
        try { saveJournal('workbook', { ...request, status: 'rejected' }); } catch { /* Keep recovery data. */ }
      }
      setUploadError(errorMessage(error));
    } finally { setUploading(false); setRecoveryVersion(value => value + 1); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const foundCount    = bulkResults.filter((r) => r.status === 'found').length;
  const notFoundCount = bulkResults.filter((r) => r.status === 'not_found').length;
  const canLookup = (bulkFile || bulkText.trim()) && !bulkResults.some(row => row.requestId && !row.imported && !row.skipped);
  const bulkBusy = bulkRunning || importing;
  const hasUnconfirmedRows = bulkResults.some(isUnconfirmedISBNRow);
  const selectedHasUnconfirmedRows = bulkResults.some(row => selected.has(row.isbn) && isUnconfirmedISBNRow(row));
  const selectedImportCount = bulkResults.filter(row => selected.has(row.isbn) && row.status === 'found' && !row.imported && !row.skipped).length;

  return (
    <div className="rpl-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-5 md:px-8 pt-8">

        <div aria-live="polite" data-recovery-version={recoveryVersion}>
          {recoveryError && <p role="alert" className="text-danger">{recoveryError}</p>}
          {categoryError && <p role="alert" className="text-danger">{categoryError} <button onClick={() => setCategoryAttempt(value => value + 1)}>Retry categories</button></p>}
          {pendingManual && <p role="alert">The result for “{pendingManual.payload.title}” is unconfirmed. <button disabled={submitting} onClick={() => submitManual()}>Recover saved book request</button></p>}
          {pendingWorkbook && <p role="alert">Workbook “{pendingWorkbook.filename}” has an unconfirmed result. <button disabled={uploading} onClick={handleUpload}>Recover workbook result</button></p>}
          {mode !== 'manual' && formError && <p role="alert" className="text-danger">{formError}</p>}
        </div>
        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <p className="text-sm font-semibold tracking-normal text-link mb-1">
            Librarian Terminal
          </p>
          <h1 className="font-semibold tracking-normal leading-none rpl-title">
            Add <span className="text-link">Book</span>
          </h1>
          <p className="text-sm text-muted font-medium mt-2">
            Add a single book, bulk-search by ISBN, or import via file upload.
          </p>
        </div>

        <CategoryReview />

        {/* Mode Toggle */}
        <div className="animate-fade-in-up delay-100 flex flex-wrap gap-1 bg-panel border border-line p-1.5 rounded-xl mb-7 w-fit shadow-sm">
          {[
            { id: 'manual',     icon: <PlusSquare size={14} />, label: 'Single Book' },
            { id: 'isbn-bulk',  icon: <List size={14} />,       label: 'ISBN Bulk Lookup' },
            { id: 'upload',     icon: <Upload size={14} />,     label: 'Upload File' },
          ].map(({ id, icon, label }) => (
            <button key={id} onClick={() => setMode(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold tracking-normal transition-all ${
                mode === id
                  ? 'bg-action text-white shadow-md '
                  : 'text-muted hover:text-ink '
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── SINGLE BOOK ── */}
        {mode === 'manual' && (
          <div className="animate-fade-in-up delay-200 bg-panel border border-line rounded-xl p-8 shadow-sm">
            {submitted ? (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 bg-success-soft rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-success" />
                </div>
                <h3 className="font-semibold tracking-normal mb-1 rpl-subheading">Book Added!</h3>
                <button className="mt-3 underline" onClick={() => setSubmitted(false)}>{coverRetry ? 'Retry saved book cover' : 'Add another book'}</button>
                <p className="text-sm text-muted font-medium">{coverRetry ? "Book saved, but its cover upload was not confirmed. Use the cover retry button to finish the saved book." : "The book has been added to the catalog."}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <fieldset disabled={submitting || !!pendingManual || !!recoveryError} className="space-y-4">

                {/* ISBN Auto-Fill */}
                <div className="bg-info-soft border border-line rounded-xl p-4">
                  <label className="block text-sm font-semibold tracking-normal text-link mb-2">
                    ISBN Auto-Fill
                  </label>
                  <div className="flex gap-2">
                    <input aria-label="ISBN Auto-Fill"
                      type="text" value={isbnInput}
                      onChange={(e) => { setIsbnInput(e.target.value); setLookupError(''); setLookupSuccess(false); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleIsbnLookup())}
                      placeholder="Enter ISBN-10 or ISBN-13…"
                      className="min-w-0 w-full flex-1 bg-panel border border-line rounded-lg px-4 py-3 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink placeholder:text-muted"
                    />
                    <button type="button" onClick={handleIsbnLookup} disabled={lookingUp || !isbnInput.trim()}
                      className="flex items-center gap-2 px-5 py-3 bg-action hover:bg-action-hover disabled:opacity-50 text-white rounded-lg font-semibold text-sm tracking-normal transition-all">
                      {lookingUp ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                      {lookingUp ? 'Looking up…' : 'Look Up'}
                    </button>
                  </div>
                  {lookupSuccess && (
                    <div className="flex items-center gap-2 mt-2">
                      <CheckCircle2 size={13} className="text-success" />
                      <p className="text-sm font-bold text-success">Book found! Fields have been auto-filled. Review and edit as needed.</p>
                    </div>
                  )}
                  {lookupError && (
                    <div className="flex items-center gap-2 mt-2">
                      <AlertCircle size={13} className="text-danger" />
                      <p className="text-sm font-bold text-danger">{lookupError}</p>
                    </div>
                  )}
                </div>

                {/* Cover preview */}
                {(coverPreviewUrl || form.cover_url) && (
                  <div className="flex items-center gap-4 bg-subtle rounded-xl p-3">
                    <img src={coverPreviewUrl || form.cover_url} alt="Book cover preview"
                      className="w-14 h-20 object-cover rounded-xl shadow-md flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold tracking-normal text-muted mb-0.5">Cover Preview</p>
                      <p className="text-sm font-medium text-muted break-all line-clamp-2">
                        {coverFile ? coverFile.name : form.cover_url}
                      </p>
                    </div>
                    <button aria-label="Close" type="button" onClick={() => {
                      if (coverFile) removeCoverFile();
                      else setForm((p) => ({ ...p, cover_url: '' }));
                    }} className="p-1.5 text-muted hover:text-danger rounded-lg transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {formError && (
                  <div className="flex items-center gap-2 bg-danger-soft border border-danger rounded-xl px-4 py-3">
                    <AlertCircle size={14} className="text-danger flex-shrink-0" />
                    <p className="text-sm font-bold text-danger">{formError}</p>
                  </div>
                )}
                {coverRetry && <div role="alert" className="p-3 border border-line rounded-lg text-sm">
                  Book saved, but its cover upload was not confirmed.
                  <button type="button" disabled={submitting} className="ml-2 underline" onClick={async () => {
                    setSubmitting(true);
                    try { await uploadBookCover(coverRetry.id, coverRetry.file); setCoverRetry(null); }
                    catch { setFormError('Cover upload still could not be confirmed. Retry the cover upload.'); }
                    finally { setSubmitting(false); }
                  }}>Retry cover upload</button>
                </div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Title"  name="title"  value={form.title}  onChange={handleFormChange} required />
                  <Field label="Author" name="author" value={form.author} onChange={handleFormChange} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-semibold tracking-normal text-muted">
                        Category
                      </label>
                      <button type="button"
                        onClick={() => { setUseCustomCategory((v) => !v); setForm((p) => ({ ...p, category: '' })); }}
                        className="text-sm font-semibold tracking-normal text-link hover:text-link transition-colors">
                        {useCustomCategory ? '← Pick existing' : '+ New category'}
                      </button>
                    </div>

                    {useCustomCategory ? (
                      <div className="relative">
                        <input aria-label="Type a new category…"
                          type="text" name="category" value={form.category}
                          onChange={handleFormChange}
                          placeholder="Type a new category…"
                          required
                          maxLength={1000}
                          className="w-full bg-subtle border border-line rounded-lg px-4 py-3.5 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink placeholder:text-muted"
                        />
                        {form.category && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold tracking-normal text-success">
                            Review
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
                        className="w-full bg-subtle border border-transparent border-line rounded-lg px-4 py-3.5 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink appearance-none">
                        <option value="">Select category...</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        <option disabled>──────────</option>
                        <option value="__custom__">+ Type new category…</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">Year Published</label>
                    <select aria-label="Year Published" name="year" value={form.year} onChange={handleFormChange}
                      className="w-full bg-subtle border border-transparent border-line rounded-lg px-4 py-3.5 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink appearance-none">
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
                    <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">
                      Cover Image
                    </label>
                    <input
                      type="text" name="cover_url" value={form.cover_url}
                      onChange={handleFormChange}
                      disabled={!!coverFile}
                      placeholder={coverFile ? `File: ${coverFile.name}` : 'Paste URL or upload below…'}
                      className="w-full bg-subtle border border-transparent border-line rounded-lg px-4 py-3.5 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink placeholder:text-muted disabled:opacity-50"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-px bg-subtle" />
                      <span className="text-sm font-semibold tracking-normal text-muted">or</span>
                      <div className="flex-1 h-px bg-subtle" />
                    </div>
                    <label className={`mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed cursor-pointer transition-all text-sm font-semibold tracking-normal ${
                      coverFile
                        ? 'border-success bg-success-soft bg-success-soft text-success text-success'
                        : 'border-line text-muted hover:border-line hover:text-link hover:text-link'
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

                <button type="submit" disabled={submitting || !!pendingManual || !!recoveryError}
                  className="w-full py-4 bg-action hover:bg-action-hover disabled:opacity-60 text-white rounded-lg font-semibold text-sm tracking-normal transition-all shadow-sm flex items-center justify-center gap-2 mt-2">
                  {submitting ? <RefreshCw size={15} className="animate-spin" /> : <PlusSquare size={15} />}
                  {submitting ? 'Adding...' : 'Add to Catalog'}
                </button>
              </fieldset>
              </form>
            )}
          </div>
        )}

        {/* ── ISBN BULK LOOKUP ── */}
        {mode === 'isbn-bulk' && (
          <div className="animate-fade-in-up delay-200 space-y-5">

            {/* Input area */}
            <div className="bg-panel border border-line rounded-xl p-8 shadow-sm space-y-5">
              <div>
                <p className="text-sm font-semibold tracking-normal text-muted mb-1">Option 1 — Upload a file</p>
                <p className="text-sm text-muted mb-3">
                  Upload an <strong>.xlsx</strong> or <strong>.csv</strong> file. The system will look for a column named <em>ISBN</em>; if none is found, it reads the first column.
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setBulkDragging(true); }}
                  onDragLeave={() => setBulkDragging(false)}
                  onDrop={handleBulkDrop}
                  className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                    bulkDragging
                      ? 'border-line bg-info-soft bg-info-soft'
                      : 'border-line '
                  }`}
                >
                  {bulkFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <CheckCircle2 size={16} className="text-success flex-shrink-0" />
                      <span className="text-sm font-bold text-ink">{bulkFile.name}</span>
                      <button aria-label="Close" onClick={() => setBulkFile(null)} className="p-1 text-muted hover:text-danger rounded-lg transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-muted mb-3">Drag & drop .xlsx / .csv here</p>
                      <label className="px-5 py-2.5 bg-action hover:bg-action-hover text-white rounded-xl font-semibold text-sm tracking-normal cursor-pointer transition-all">
                        Browse File
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkFileChange} />
                      </label>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-subtle" />
                <span className="text-sm font-semibold tracking-normal text-muted">or</span>
                <div className="flex-1 h-px bg-subtle" />
              </div>

              <div>
                <p className="text-sm font-semibold tracking-normal text-muted mb-1">Option 2 — Paste ISBNs</p>
                <p className="text-sm text-muted mb-3">One ISBN per line (or comma-separated). Dashes and spaces are ignored.</p>
                <textarea
                  ref={bulkTextRef}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  placeholder={"9780307474278\n9780743273565\n978-0-06-112008-4\n..."}
                  className="w-full bg-subtle border border-transparent border-line rounded-lg px-4 py-3.5 text-base font-sans outline-none focus:ring-2 focus:ring-line text-ink placeholder:text-muted resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={startBulkLookup}
                  disabled={bulkRunning || !canLookup}
                  className="flex-1 py-4 bg-action hover:bg-action-hover disabled:opacity-50 text-white rounded-lg font-semibold text-sm tracking-normal transition-all flex items-center justify-center gap-2"
                >
                  {bulkRunning ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                  {bulkRunning
                    ? bulkProgress ? `Looking up ${bulkProgress.done} / ${bulkProgress.total}…` : 'Starting…'
                    : 'Look Up All ISBNs'}
                </button>
                {bulkRunning && (
                  <button onClick={() => { bulkAbortRef.current = true; }}
                    className="px-5 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold text-sm tracking-normal transition-all">
                    Stop
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {bulkLookupError && <p role="alert" className="text-sm text-danger">{bulkLookupError}</p>}
              {bulkRunning && bulkProgress && (
                <div className="w-full bg-subtle rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-action h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Results */}
            {bulkResults.length > 0 && (
              <div className="bg-panel border border-line rounded-xl p-4 sm:p-8 shadow-sm space-y-5">

                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold tracking-normal text-muted">
                    Results
                  </span>
                  <span className="px-3 py-1 bg-success-soft text-success rounded-full text-sm font-semibold tracking-normal">
                    {foundCount} found
                  </span>
                  {notFoundCount > 0 && (
                    <span className="px-3 py-1 bg-danger-soft text-danger rounded-full text-sm font-semibold tracking-normal">
                      {notFoundCount} not found
                    </span>
                  )}
                  <button onClick={toggleAll} disabled={bulkBusy}
                    className="ml-auto text-sm font-semibold tracking-normal text-link hover:underline disabled:opacity-40">
                    {bulkResults.every((r) => selected.has(r.isbn))
                      ? 'Deselect All' : 'Select All'}
                  </button>
                  <button type="button" onClick={() => clearBulkResults(selected)}
                    disabled={bulkBusy || !selected.size || selectedHasUnconfirmedRows}
                    className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-danger disabled:opacity-40">
                    <Trash2 size={14} /> Delete selected ({selected.size})
                  </button>
                </div>
                <p className="text-sm text-muted">Delete removes lookup results from this list. Books already added to the catalog stay saved.</p>
                {hasUnconfirmedRows && <p role="status" className="text-sm text-warning">Some import outcomes are unconfirmed. Select those rows and retry adding them before using Delete or Done to clear them.</p>}

                {/* Result rows */}
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {bulkResults.map((row) => (
                    <div key={row.isbn}
                      className={`flex items-center gap-3 rounded-xl p-3 border transition-all ${
                        row.status === 'found'
                          ? selected.has(row.isbn)
                            ? 'border-line border-line bg-info-soft bg-info-soft'
                            : 'border-line bg-subtle '
                          : 'border-danger border-danger bg-danger-soft bg-danger-soft opacity-60'
                      }`}
                    >
                      {/* Checkbox */}
                      <input type="checkbox" aria-label={`Select ISBN ${row.isbn}`} disabled={bulkBusy} checked={selected.has(row.isbn)} onChange={() => toggleSelect(row.isbn)}
                        className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer" />

                      {/* Cover */}
                      {row.status === 'found' && row.data?.cover_url ? (
                        <img src={row.data.cover_url} alt=""
                          className="w-10 h-14 object-cover rounded-lg shadow flex-shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div className="w-10 h-14 bg-subtle rounded-lg flex-shrink-0 flex items-center justify-center">
                          <FileText size={14} className="text-muted" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {row.status === 'found' ? (
                          <>
                            <p className="font-bold text-sm text-ink truncate">{row.data.title || '—'}</p>
                            <p className="text-sm text-muted truncate">{row.data.author || '—'}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {row.data.year && <span className="text-sm text-muted">{row.data.year}</span>}
                              {row.data.category && (
                                <span className="text-sm bg-info-soft text-link px-2 py-0.5 rounded-full font-bold">
                                  {row.data.category}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm font-bold text-danger">Not found</p>
                        )}
                        <p className="text-sm font-sans text-muted mt-0.5 break-all">{row.isbn}</p>
                        {row.imported && <p className="text-sm text-success">Imported — book #{row.bookId}</p>}
                        {row.importError && (
                          <p className="text-sm font-bold text-danger mt-0.5">{row.importError}</p>
                        )}
                      </div>

                      {/* Status icon */}
                      <div className="flex flex-col items-center gap-2 flex-shrink-0">
                        {row.importError
                          ? <AlertCircle size={15} className="text-danger flex-shrink-0" />
                          : row.status === 'found'
                            ? <CheckCircle2 size={15} className="text-success flex-shrink-0" />
                            : <AlertCircle size={15} className="text-danger flex-shrink-0" />}
                        <button type="button" aria-label={`Delete ISBN ${row.isbn} from results`}
                          onClick={() => clearBulkResults(new Set([row.isbn]))}
                          disabled={bulkBusy || isUnconfirmedISBNRow(row)}
                          className="rounded-lg p-2 text-danger hover:bg-danger-soft disabled:opacity-40">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Import controls */}
                {foundCount > 0 && (
                  <div className="pt-4 border-t border-line space-y-3">
                    {importSummary && (
                      <div className={`rounded-xl px-4 py-3 border space-y-0.5 ${
                        importSummary.fail === 0
                          ? 'bg-success-soft bg-success-soft border-success border-success'
                          : 'bg-warning-soft bg-warning-soft border-warning border-warning'
                      }`}>
                        {importSummary.ok > 0 && (
                          <p className="text-sm font-bold text-success">
                            {importSummary.ok} book{importSummary.ok !== 1 ? 's' : ''} added to catalog.
                          </p>
                        )}
                        {importSummary.skipped > 0 && (
                          <p className="text-sm font-bold text-warning">
                            {importSummary.skipped} already in catalog (skipped).
                          </p>
                        )}
                        {importSummary.fail > 0 && (
                          <p className="text-sm font-bold text-danger">
                            {importSummary.fail} failed — see errors below.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <div className="flex-shrink-0">
                        <label className="block text-sm font-semibold tracking-normal text-muted mb-1">Copies each</label>
                        <input aria-label="Copies each" type="number" min="1" value={bulkCopies} onChange={(e) => setBulkCopies(e.target.value)}
                          className="w-24 bg-subtle border border-transparent border-line rounded-lg px-3 py-2.5 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink" />
                      </div>
                      <button
                        onClick={handleBulkImport}
                        disabled={bulkBusy || selectedImportCount === 0}
                        className="flex-1 py-3 bg-action hover:bg-action-hover disabled:opacity-50 text-white rounded-lg font-semibold text-sm tracking-normal transition-all flex items-center justify-center gap-2"
                      >
                        {importing ? <RefreshCw size={14} className="animate-spin" /> : <PlusSquare size={14} />}
                        {importing ? 'Adding to catalog…' : `Add ${selectedImportCount} Selected Book${selectedImportCount !== 1 ? 's' : ''} to Catalog`}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="text-sm text-muted">Done clears this batch and prepares the next ISBN lookup.</p>
                  <button type="button" disabled={bulkBusy || hasUnconfirmedRows}
                    onClick={() => clearBulkResults(new Set(bulkResults.map(row => row.isbn)), true)}
                    className="rounded-lg bg-action px-5 py-3 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-40">
                    Done
                  </button>
                </div>
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
              className={`rounded-xl border-2 border-dashed p-16 text-center transition-all duration-200 ${
                dragging
                  ? 'border-line bg-info-soft bg-info-soft'
                  : 'border-line bg-panel '
              }`}
            >
              <div className="w-16 h-16 bg-info-soft rounded-xl flex items-center justify-center mx-auto mb-5">
                <Upload size={28} className="text-link" />
              </div>
              <p className="font-semibold tracking-normal text-sm text-muted mb-2">
                Drag & drop your file here
              </p>
              <p className="text-sm text-muted font-medium mb-6">
                Full inventory import: .xlsx — max 10 MB
              </p>
              <label className="px-7 py-3.5 bg-action hover:bg-action-hover text-white rounded-xl font-semibold text-sm tracking-normal cursor-pointer transition-all">
                Browse File
                <input type="file" accept=".xlsx" className="hidden"
                  onChange={(e) => { setFile(e.target.files[0]); setUploadResult(null); setUploadError(''); }} />
              </label>
            </div>

            {file && (
              <div className="bg-panel border border-line rounded-xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-success-soft rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={18} className="text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-ink truncate">{file.name}</p>
                  <p className="text-sm text-muted font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button aria-label="Close" onClick={() => setFile(null)} className="p-2 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-all">
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadResult && (
              <div className="bg-success-soft border border-success rounded-xl p-5 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-success flex-shrink-0" />
                <p className="text-sm font-bold text-success">
                    {uploadResult.added} books imported; {uploadResult.skipped} duplicate ISBNs skipped; {uploadResult.errors?.length ?? 0} rows could not be imported.
                </p>
              </div>
            )}
              {uploadResult?.errors?.length > 0 && <ul role="alert" className="p-4 text-sm text-danger">{uploadResult.errors.map((message, index) => <li key={index}>{message}</li>)}</ul>}
            {uploadError && (
              <div className="bg-danger-soft border border-danger rounded-xl p-5 flex items-center gap-3">
                <AlertCircle size={18} className="text-danger flex-shrink-0" />
                <p className="text-sm font-bold text-danger">{uploadError}</p>
              </div>
            )}

            <div className="bg-panel border border-line rounded-xl p-7">
              <div className="flex items-center gap-3 mb-5">
                <AlertCircle size={15} className="text-warning" />
                <h3 className="font-semibold tracking-normal text-ink rpl-subheading">Required Columns</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {['Title', 'Author', 'Category', 'Year', 'ISBN', 'Copies', 'Location', 'Cover URL'].map((col) => (
                  <div key={col} className="px-3 py-2 bg-subtle rounded-xl border border-line text-center">
                    <p className="text-sm font-semibold tracking-normal text-muted">{col}</p>
                  </div>
                ))}
              </div>
              <button onClick={handleUpload} disabled={(!file && !pendingWorkbook) || uploading || !!recoveryError}
                className="w-full py-4 bg-action hover:bg-action-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm tracking-normal transition-all flex items-center justify-center gap-2">
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
    <label className="block text-sm font-semibold tracking-normal text-muted mb-1.5">{label}</label>
    <input
      type={type} name={name} value={value} onChange={onChange}
      placeholder={placeholder} required={required}
      className="w-full bg-subtle border border-transparent border-line rounded-lg px-4 py-3.5 text-base font-medium outline-none focus:ring-2 focus:ring-line text-ink placeholder:text-muted"
    />
  </div>
);
