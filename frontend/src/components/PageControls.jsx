export default function PageControls({ page, setPage, total, loading, error, reload }) {
  return <div className="my-4 min-w-0 text-sm" aria-live="polite">
    {error && <p role="alert" className="text-danger">{error} <button className="underline" onClick={reload}>Retry loading</button></p>}
    <div className="flex flex-wrap items-center gap-3">
      <span>{total} results · Page {page + 1} of {Math.max(1, Math.ceil(total / 20))}</span>
      <button className="px-3 py-2 border rounded-lg disabled:opacity-40" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Previous page</button>
      <button className="px-3 py-2 border rounded-lg disabled:opacity-40" disabled={loading || (page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Next page</button>
    </div>
  </div>;
}
