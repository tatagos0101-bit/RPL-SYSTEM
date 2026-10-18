import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState } from 'react';
import { Download, Printer, RefreshCw, Search } from 'lucide-react';
import { bulkCopyQRPdf, exportAllCopyQRs, getCopyQRImage } from '../../api/librarian';
import { API_BASE_URL } from '../../api/urls';

export default function LibQRBulk() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [downloading, setDownloading] = useState(null);

  const listing = useServerPage('/api/inventory/book-copies', { search }, '/api/inventory/book-copies/count');
  const { items: filtered, loading } = listing;
  const [downloadError, setDownloadError] = useState('');
  const [exportProgress, setExportProgress] = useState('');
  const [retryDownload, setRetryDownload] = useState(null);

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
    setDownloadError(''); setRetryDownload(null);
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
      .catch(() => { setDownloadError('QR download failed. Please retry.'); setRetryDownload(() => () => downloadQR(copy)); })
      .finally(() => setDownloading(null));
  };

  const downloadBulk = async (all = false) => {
    if (!all && !selected.size) return;
    const ids = [...selected];
    setDownloadError(''); setRetryDownload(null); setDownloading('bulk'); setExportProgress('Preparing export…');
    try {
      const res = await (all ? exportAllCopyQRs(search, (done, total) => setExportProgress(`Preparing ${done} of ${total} labels…`)) : bulkCopyQRPdf(ids));
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url;
      a.download = all ? 'All-Copy-QR-Codes.zip' : 'Copy-QR-Codes.pdf';
      a.click(); URL.revokeObjectURL(url);
    } catch {
      setDownloadError('Export failed. Your selection is preserved. Selected PDFs allow up to 1,000 copies; use all matching for larger exports.');
      setRetryDownload(() => () => downloadBulk(all));
    } finally { setDownloading(null); setExportProgress(''); }
  };

  return (
    <div className="rpl-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">
      <div className="w-full max-w-none px-5 md:px-8 pt-8">
        <div className="animate-fade-in-up flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-sm font-semibold tracking-normal text-link mb-1">
              Librarian Terminal
            </p>
            <h1 className="font-semibold tracking-normal leading-none rpl-title">
              Print <span className="text-link">Copy QR</span>
            </h1>
            <p className="text-sm text-muted font-medium mt-2">
              Print one scannable label for each physical book copy.
              {selected.size > 0 && <span className="ml-2 text-link font-semibold">{selected.size} selected</span>}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {selected.size > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-2 px-5 py-3 bg-subtle text-muted rounded-lg font-semibold text-sm tracking-normal hover:bg-subtle transition-all duration-200"
              >
                Clear
              </button>
            )}
            <button
              onClick={selectAll}
              disabled={loading || !!listing.error}
              className="group flex items-center gap-2 px-5 py-3 bg-panel border border-line text-muted rounded-lg font-semibold text-sm tracking-normal hover:border-line hover:shadow-md transition-all duration-200"
            >
              <Printer size={14} /> Select Visible
            </button>
            <button
              onClick={() => downloadBulk(false)}
              disabled={!!downloading || selected.size === 0}
              className="group flex items-center gap-2 px-5 py-3 bg-action hover:bg-action-hover disabled:opacity-60 text-white rounded-lg font-semibold text-sm tracking-normal transition-all duration-200 shadow-sm"
            >
              {downloading === 'bulk'
                ? <RefreshCw size={14} className="animate-spin" />
                : <Download size={14} className="transition-transform duration-200" />}
              {`Export selected (${selected.size})`}
            </button>
            <button className="px-4 py-3 border rounded-lg" onClick={() => downloadBulk(true)} disabled={!!downloading || loading || !!listing.error || !listing.total}>Export all matching ({listing.total}) · ZIP</button>
          </div>
        </div>
        <PageControls {...listing} />
        {exportProgress && <p role="status">{exportProgress}</p>}
        {downloadError && <p role="alert" className="text-danger">{downloadError} <button onClick={retryDownload} disabled={!!downloading}>Retry download</button></p>}
        <div className="relative mb-6 max-w-md animate-fade-in-up delay-100">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={15} />
          <input aria-label="Search title, author, or copy QR..."
            type="text"
            placeholder="Search title, author, or copy QR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-panel border border-line rounded-lg py-3 pl-11 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line text-muted placeholder:text-muted"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <RefreshCw size={28} className="animate-spin text-link" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7 gap-4">
            {filtered.map((copy, i) => {
              const isSelected = selected.has(copy.id);
              return (
                <div
                  key={copy.id}
                  onClick={() => toggleSelect(copy.id)}
                  className={`group animate-fade-in-up rounded-xl p-4 flex flex-col items-center text-center transition-all duration-300 cursor-pointer border-2 ${
                    isSelected
                      ? 'bg-info-soft bg-info-soft border-line shadow-sm '
                      : 'bg-panel border-transparent hover:shadow-sm hover:border-line hover:border-line'
                  }`}
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className={`w-24 h-24 rounded-xl mb-3 flex items-center justify-center border transition-all duration-200 overflow-hidden ${
                    isSelected
                      ? 'bg-info-soft bg-info-soft border-line border-line'
                      : 'bg-subtle border-line group-hover:bg-info-soft group-hover:bg-info-soft group-hover:border-line'
                  }`}>
                    <img
                      src={`${API_BASE_URL}/api/inventory/book-copies/${copy.id}/qr`}
                      alt={copy.qr_code}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-sm font-semibold tracking-normal text-link mb-1">
                    Copy {copy.copy_number}
                  </p>
                  <p className="text-sm font-semibold text-muted font-sans mb-1 truncate w-full">
                    {copy.qr_code}
                  </p>
                  <p className="w-full min-w-0 text-sm font-bold text-ink leading-tight line-clamp-2 mb-1 group-hover:text-link transition-colors duration-200">
                    {copy.title}
                  </p>
                  <p className="text-sm text-muted font-medium truncate w-full">
                    {copy.author}
                  </p>
                  <p className="text-sm text-muted font-semibold tracking-normal mt-1 truncate w-full">
                    {copy.location_shelf || 'Shelf not set'}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadQR(copy); }}
                    disabled={!!downloading}
                    className="mt-3 w-full py-1.5 border border-line rounded-lg text-sm font-semibold tracking-normal text-link hover:bg-action hover:text-white hover:border-line transition-all duration-200 disabled:opacity-50"
                  >
                    {downloading === copy.id ? '...' : 'Download'}
                  </button>
                </div>
              );
            })}
            {!listing.error && filtered.length === 0 && (
              <div className="col-span-full text-center py-16 text-muted text-sm font-semibold tracking-normal">
                No copy QR labels found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
