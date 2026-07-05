import { useEffect, useRef, useState } from 'react';

/**
 * Custom animated cursor:
 *  - Small dot: snaps exactly to pointer position (no lag)
 *  - Larger ring: follows with lerp lag (factor 0.12)
 *  - Both expand on hoverable elements, contract on mousedown
 *  - Hidden on touch-only devices
 */
export default function CustomCursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);
  const mouse   = useRef({ x: -300, y: -300 });
  const ringPos = useRef({ x: -300, y: -300 });
  const raf     = useRef(null);
  const visibleRef = useRef(false);

  const [hover,   setHover]   = useState(false);
  const [active,  setActive]  = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    // Don't show on touch-only devices
    if (navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches) return;

    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    /* ── RAF loop: lerp ring, snap dot ── */
    const LERP = 0.13;
    const tick = () => {
      ringPos.current.x += (mouse.current.x - ringPos.current.x) * LERP;
      ringPos.current.y += (mouse.current.y - ringPos.current.y) * LERP;

      dot.style.transform  = `translate(${mouse.current.x}px, ${mouse.current.y}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px) translate(-50%, -50%)`;

      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    /* ── Event listeners ── */
    const onMove = (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
    };

    const onOver = (e) => {
      const el = e.target;
      const hoverable = el.closest('a, button, [role="button"], input, textarea, select, label, [data-cursor-hover]');
      setHover(!!hoverable);
    };

    const onDown  = () => setActive(true);
    const onUp    = () => setActive(false);
    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    window.addEventListener('mousemove',  onMove,  { passive: true });
    window.addEventListener('mouseover',  onOver,  { passive: true });
    window.addEventListener('mousedown',  onDown);
    window.addEventListener('mouseup',    onUp);
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.documentElement.addEventListener('mouseenter', onEnter);

    // Hide system cursor globally
    document.documentElement.classList.add('custom-cursor-active');

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseover',  onOver);
      window.removeEventListener('mousedown',  onDown);
      window.removeEventListener('mouseup',    onUp);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.documentElement.removeEventListener('mouseenter', onEnter);
      document.documentElement.classList.remove('custom-cursor-active');
    };
  }, []);

  return (
    <>
      {/* Dot — snaps instantly */}
      <div
        ref={dotRef}
        className="cursor-dot"
        style={{
          position:        'fixed',
          top:             0,
          left:            0,
          pointerEvents:   'none',
          zIndex:          99999,
          borderRadius:    '50%',
          width:           hover ? '8px'  : active ? '4px'  : '6px',
          height:          hover ? '8px'  : active ? '4px'  : '6px',
          backgroundColor: hover ? 'rgba(59,130,246,1)' : 'rgba(59,130,246,0.9)',
          opacity:         visible ? 1 : 0,
          mixBlendMode:    'normal',
        }}
      />

      {/* Ring — lags behind */}
      <div
        ref={ringRef}
        className="cursor-ring"
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          pointerEvents: 'none',
          zIndex:        99998,
          borderRadius:  '50%',
          border:        `2px solid ${hover ? 'rgba(59,130,246,0.7)' : active ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.35)'}`,
          width:         hover  ? '46px' : active ? '22px' : '36px',
          height:        hover  ? '46px' : active ? '22px' : '36px',
          backgroundColor: hover ? 'rgba(59,130,246,0.08)' : 'transparent',
          opacity:       visible ? 1 : 0,
        }}
      />
    </>
  );
}
