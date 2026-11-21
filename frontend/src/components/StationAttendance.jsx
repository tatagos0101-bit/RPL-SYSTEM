import { useCallback, useEffect, useRef, useState } from 'react';
import { getEntryStationLogs, recordManualEntry, recordManualExit, searchOpenVisits } from '../api/entryStation';
import { attendanceTimestamp } from '../api/entryAttendance';
import { parseApiDateTime } from '../api/dateTime';
import { ENTRY_LOG_MIN_INTERVAL_MS, entryStationRetryDelay } from '../api/entryStationState';

function VisitTime({ value }) {
  const date = parseApiDateTime(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return <time dateTime={value} title={attendanceTimestamp(value)}>
    <span>{date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</span>
    <small>{date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}</small>
  </time>;
}

export function StationAttendance({ pin, lock, signal, refresh, connection }) {
  const [rows, setRows] = useState([]);
  const [listError, setListError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [revision, setRevision] = useState(0);
  const writing = useRef(false);
  const sequence = useRef(0);
  const nextRead = useRef(0);
  const refreshList = useRef(null);
  const reject = useCallback(err => {
    if (err.response?.status === 403) { lock(); return true; }
    return false;
  }, [lock]);

  useEffect(() => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel);
    let pending = false;
    const read = async () => {
      if (pending || controller.signal.aborted || signal.aborted || Date.now() < nextRead.current) return;
      pending = true;
      const generation = sequence.current;
      try {
        const {data} = open ? await searchOpenVisits(pin, search, skip, controller.signal) : await getEntryStationLogs(pin, 30, controller.signal);
        if (controller.signal.aborted || signal.aborted || generation !== sequence.current) return;
        setRows(open ? data.items : data); setTotal(open ? data.total : data.length);
        if (open && skip > 0 && !data.items.length) setSkip(Math.max(0, skip - 20));
        setListError(''); connection(true);
        nextRead.current = Date.now() + ENTRY_LOG_MIN_INTERVAL_MS;
      } catch (err) {
        if (controller.signal.aborted || signal.aborted || reject(err)) return;
        setListError('Attendance unavailable. Check the connection.'); connection(false);
        nextRead.current = Date.now() + entryStationRetryDelay(err);
      } finally { pending = false; if (!controller.signal.aborted && !signal.aborted) setLoading(false); }
    };
    refreshList.current = read;
    read();
    const timer = setInterval(read, 10000);
    return () => { refreshList.current = null; clearInterval(timer); cancel(); signal.removeEventListener('abort', cancel); };
  }, [pin, signal, open, search, skip, revision, reject, connection]);

  useEffect(() => { refreshList.current?.(); }, [refresh]);

  async function write(e, exitId) {
    e.preventDefault();
    if (writing.current || signal.aborted) return;
    writing.current = true; setBusy(true); setFeedback('');
    try {
      let request = draft;
      if (!exitId && !request) {
        if (!name.trim() || !location.trim()) { setFeedback('Enter a visitor name and location.'); return; }
        request = {request_id: crypto.randomUUID(), visitor_name: name.trim(), visitor_location: location.trim()};
        setDraft(request);
      }
      const {data} = exitId ? await recordManualExit(pin, exitId, signal) : await recordManualEntry(pin, request, signal);
      if (signal.aborted) return;
      sequence.current++;
      setRows(previous => open ? previous.filter(row => row.id !== data.id) : [data, ...previous.filter(row => row.id !== data.id)].slice(0, 30));
      if (!exitId) { setName(''); setLocation(''); setDraft(null); }
      setFeedback(exitId ? 'Exit recorded.' : 'Entry recorded.');
      nextRead.current = 0; setRevision(v => v + 1);
    } catch (err) {
      if (signal.aborted || reject(err)) return;
      if (!exitId && err.response?.status === 422) { setDraft(null); setFeedback('Check the visitor name and location.'); }
      else setFeedback(exitId ? 'Exit unconfirmed. Check attendance or retry the same exit.' : 'Entry unconfirmed. Retry this same entry to confirm.');
    } finally { writing.current = false; if (!signal.aborted) setBusy(false); }
  }
  function changeList(action) {
    sequence.current++; nextRead.current = 0; setRows([]); setLoading(true); setListError(''); action(); setRevision(v => v + 1);
  }
  return <div className="entrance-side">
    <form className="entrance-card" onSubmit={e => write(e)}>
      <h2>Manual visitor</h2>
      <label>Visitor name<input required maxLength={150} placeholder="Full name" value={name} readOnly={!!draft} onChange={e => setName(e.target.value)} /></label>
      <label>Location<input required maxLength={200} placeholder="City, municipality or barangay" value={location} readOnly={!!draft} onChange={e => setLocation(e.target.value)} /></label>
      <button className="entrance-primary" disabled={busy}>{busy ? 'Recording…' : draft ? 'Retry entry' : 'Record entry'}</button>
      <p role="status">{feedback}</p>
    </form>
    <section className="entrance-card"><h2>{open ? 'Open manual visits' : 'Recent attendance'}</h2>
      <button type="button" onClick={() => changeList(() => { setOpen(!open); setSkip(0); })}>{open ? 'Recent attendance' : 'Open manual visits'}</button>
      {open && <form onSubmit={e => { e.preventDefault(); changeList(() => { setSearch(input.trim()); setSkip(0); }); }}><label>Search open visits<input value={input} onChange={e => setInput(e.target.value)} /></label><button>Search</button></form>}
      {listError && <p role="status">{listError}</p>}
      {loading ? <p>Loading attendance…</p> : !rows.length ? <p>{listError ? 'No attendance available.' : 'No visits to display.'}</p> :
        <div className="entrance-log"><table><thead><tr><th>Visitor</th><th>Time in</th><th>Time out</th></tr></thead><tbody>{rows.map(row =>
          <tr key={row.id}><td><strong>{row.visitor_name || row.member_name || 'Unknown'}</strong><small>{row.visitor_name ? 'Manual entry' : row.member_id || (row.granted ? 'Member' : 'Unregistered')}</small>{row.visitor_location && <small>{row.visitor_location}</small>}</td>
          <td><VisitTime value={row.accessed_at}/></td><td>{row.time_out ? <VisitTime value={row.time_out}/> : row.entry_type === 'manual' && row.visitor_name && row.granted && row.is_inside ? <button disabled={busy} onClick={e => write(e,row.id)}>Record exit</button> : row.is_inside ? 'Inside' : '—'}</td></tr>
        )}</tbody></table></div>}
      {open && <div className="entrance-pages"><button disabled={!skip} onClick={() => changeList(() => setSkip(skip - 20))}>Previous</button><span>{total ? skip+1 : 0}–{Math.min(skip+20,total)} of {total}</span><button disabled={skip+20 >= total} onClick={() => changeList(() => setSkip(skip + 20))}>Next</button></div>}
    </section>
  </div>;
}
