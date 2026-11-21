import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { ArrowLeft, Clock, Camera, Pause, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StationPrivacyNotice from '../../components/StationPrivacyNotice';
import { StationAttendance } from '../../components/StationAttendance';
import { getStoredAuth, homeForRole } from '../../api/authRoutes';
import { updatePresence } from '../../api/entryAttendance';
import { faceBoxToStyle, summarizeFaceResults } from '../../api/entryFaceOverlay';
import { ENTRY_SCAN_INTERVAL_MS, entryStationRetryDelay } from '../../api/entryStationState';
import { clearStoredEntryStationPin, entryStationFaceAuth, getEntryStationLogs, getStoredEntryStationPin, storeEntryStationPin } from '../../api/entryStation';
import '../../styles/entrance.css';

const constraints = {width: 640, height: 480, facingMode: 'user', aspectRatio: 4/3};
const hints = {
  too_dark: 'Low light. Improve the lighting. Scanning continues.',
  no_face: 'No face detected. Face the camera to record your visit.',
  too_far: 'Move closer to the camera.',
  liveness_uncertain: 'Live face not confirmed. Face the camera in even lighting.',
  'Spoofing Detected': 'Live face not confirmed. Use the camera directly.',
};
const clockFormat = new Intl.DateTimeFormat('en-PH', {timeZone: 'Asia/Manila', dateStyle:'medium', timeStyle:'medium'});
function StationClock() {
  const [now,setNow] = useState(new Date());
  useEffect(() => { const t=setInterval(() => setNow(new Date()),1000); return () => clearInterval(t); },[]);
  return <div className="entrance-clock"><Clock size={24}/><div><small>Philippine time</small>{clockFormat.format(now)}</div></div>;
}
function EntranceCamera({pin,lock,onAttendance}) {
  const [active,setActive] = useState(false);
  const [hint,setHint] = useState('');
  const [faces,setFaces] = useState([]);
  const camera = useRef(null);
  const scan = useRef(null);
  const presence = useRef({});
  const stop = useCallback(() => {
    scan.current?.abort();
    camera.current?.video?.srcObject?.getTracks().forEach(track => track.stop());
    setActive(false); setFaces([]); setHint('');
  },[]);
  useEffect(() => {
    const hide = () => { if(document.hidden) stop(); };
    document.addEventListener('visibilitychange',hide);
    return () => document.removeEventListener('visibilitychange',hide);
  },[stop]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    scan.current = controller;
    let pending = false;
    let next = 0;
    const capture = async () => {
      if (pending || controller.signal.aborted || document.hidden || Date.now() < next) return;
      const frame = camera.current?.getScreenshot();
      if (!frame) return;
      pending = true; next = Date.now()+ENTRY_SCAN_INTERVAL_MS;
      try {
        const {data} = await entryStationFaceAuth(frame,pin,Object.keys(presence.current).map(Number),controller.signal);
        if (controller.signal.aborted) return;
        if (data.message === 'no_face') presence.current = updatePresence(presence.current,[]);
        if (hints[data.message]) { setFaces([]); setHint(hints[data.message]); return; }
        const results = summarizeFaceResults(data);
        if (results.length) presence.current = updatePresence(presence.current,results);
        setFaces(results);
        setHint(results.length ? (results.some(f => !f.matched) ? 'Unrecognized visitor. Staff can record a manual entry.' : 'Recognition complete.') : data.matched ? 'Member recognized.' : 'Face not recognized. Staff can record a manual entry.');
        if (results.some(f => !f.matched || ['time_in','time_out','time_out_updated'].includes(f.session_action)) || (!results.length && data.matched)) onAttendance();
      } catch(err) {
        if (controller.signal.aborted) return;
        if (err.response?.status === 403) { lock(); return; }
        next = Date.now()+entryStationRetryDelay(err);
        setFaces([]); setHint('Recognition service unavailable. Scanning will retry automatically.');
      } finally { pending = false; }
    };
    const timer = setInterval(capture,250);
    return () => { controller.abort(); clearInterval(timer); };
  },[active,pin,lock,onAttendance]);
  return <section className="entrance-camera">
    {!active && <StationPrivacyNotice/>}
    <div className="entrance-camera-heading"><span><i/> {active ? 'Live camera' : 'Camera paused'}</span>
      <button onClick={() => { if(active) stop(); else {setHint(''); setActive(true);} }}>{active ? <Pause size={15}/> : <Camera size={15}/>} {active ? 'Pause camera' : 'Start camera'}</button></div>
    <div className="entrance-stage">{active ? <>
      <Webcam ref={camera} audio={false} screenshotFormat="image/jpeg" screenshotQuality={0.8} videoConstraints={constraints}
        onUserMediaError={() => { stop(); setHint('Camera unavailable. Check permissions or record a manual entry.'); }} />
      {faces.map(face => <div aria-hidden="true" key={face.key} className={'entrance-box '+(face.matched ? 'matched' : '')} style={faceBoxToStyle(face.face_box)}/>)}
    </> : <div className="entrance-off"><Camera size={32}/><span>Camera paused</span></div>}</div>
    <div className="entrance-hint" role="status"><Info size={19}/><div>{hint || (active ? 'Scanning for visitors.' : 'Read the facial processing notice before starting the camera.')}
    {faces.map(f => <p key={f.key}>{f.label} · {f.subLabel}{f.session_action && ' · '+f.session_action.replaceAll('_',' ')}</p>)}</div></div>
    {active && <small>Group scanning is active</small>}
    {active && <StationPrivacyNotice/>}
    <small>Starting the camera does not record a visitor’s consent. Scanning pauses when this page is hidden.</small>
  </section>;
}
export default function EntryGate() {
  const navigate=useNavigate();
  const [pin,setPin]=useState('');
  const [input,setInput]=useState('');
  const [checking,setChecking]=useState(false);
  const [error,setError]=useState('');
  const [online,setOnline]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const session=useRef(null);
  const lock=useCallback(() => {
    session.current?.abort(); session.current=null;
    clearStoredEntryStationPin(); setPin(''); setInput(''); setChecking(false); setError('Enter the station PIN again.');
  },[]);
  const unlock=useCallback(async value => {
    session.current?.abort();
    const controller=new AbortController(); session.current=controller;
    setChecking(true); setError('');
    try {
      await getEntryStationLogs(value,30,controller.signal);
      if(controller.signal.aborted) return;
      storeEntryStationPin(value); setInput(''); setPin(value); setOnline(true);
    } catch(err) {
      if(controller.signal.aborted) return;
      clearStoredEntryStationPin(); setError(err.response?.status===403 ? 'Check the station PIN and try again.' : 'Unable to unlock the station. Check the connection.');
    } finally { if(!controller.signal.aborted) setChecking(false); }
  },[]);
  useEffect(() => {
    const stored=getStoredEntryStationPin(); if(stored) unlock(stored);
    return () => session.current?.abort();
  },[unlock]);
  const changed=useCallback(() => setRefresh(v => v+1),[]);
  const back=() => {
    if(window.history.state?.idx>0) navigate(-1);
    else { const auth=getStoredAuth(); navigate(auth.isLoggedIn ? homeForRole(auth.role) : '/', {replace:true}); }
  };
  return <main className="entrance">
    <header><div><button aria-label="Back to previous page" onClick={back}><ArrowLeft size={18}/></button><span>Rizal Provincial Library</span></div><StationClock/></header>
    {!pin ? <form className="entrance-card entrance-unlock" onSubmit={e => { e.preventDefault(); if(input.trim()) unlock(input.trim()); }}>
      <h1>Unlock station</h1><p>Enter the station PIN to open the entrance camera and attendance log.</p><StationPrivacyNotice/>
      <label>Station PIN<input type="password" required value={input} onChange={e => setInput(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button className="entrance-primary" disabled={checking}>{checking ? 'Checking…' : 'Unlock Station'}</button>
    </form> : <div className="entrance-workspace"><div className="entrance-title"><div><h1>Entrance station</h1><p>Face the camera to record your visit.</p></div><small>{online ? 'Connected' : 'Connection unavailable'}</small></div>
      <div className="entrance-columns"><EntranceCamera pin={pin} lock={lock} onAttendance={changed}/><StationAttendance pin={pin} lock={lock} signal={session.current.signal} refresh={refresh} connection={setOnline}/></div></div>}
  </main>;
}
