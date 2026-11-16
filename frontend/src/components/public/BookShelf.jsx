import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Local viewport controls only. The caller owns all book queries and paging.
export default function BookShelf({ heading, headingLevel = 2, label, controlsLabel = 'books', kind = 'books', horizontal = false, resetKey, description, headingAction, before, after, children }) {
  const trackRef = useRef(null);
  const headingId = useId();
  const [position, setPosition] = useState({ previous: false, next: false });
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  useEffect(() => {
    const track = trackRef.current;
    const update = () => {
      const previous = track.scrollLeft > 4;
      const next = track.scrollLeft + track.clientWidth < track.scrollWidth - 4;
      setPosition(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(track);
    Array.from(track.children).forEach(child => observer.observe(child));
    track.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      track.removeEventListener('scroll', update);
    };
  }, [children]);

  useEffect(() => {
    // Keep pagination controls mounted and reset only the local book viewport.
    trackRef.current.scrollLeft = 0;
  }, [resetKey]);

  const scroll = (direction) => {
    const track = trackRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.8, 160), behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <section className={`catalog-rail catalog-rail-${kind}${horizontal ? ' catalog-rail-horizontal' : ''}`} aria-labelledby={headingId}>
      <div className="catalog-rail-heading">
        <div><Heading id={headingId}>{heading}</Heading>{description}</div>
        <div className="catalog-rail-tools">{headingAction}
          <div className="catalog-rail-controls" hidden={!position.previous && !position.next}>
            <button type="button" aria-label={`Scroll ${controlsLabel} left`} disabled={!position.previous} onClick={() => scroll(-1)}>
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Scroll ${controlsLabel} right`} disabled={!position.next} onClick={() => scroll(1)}>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {before}
      <div ref={trackRef} className="catalog-rail-track" role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
      {after}
    </section>
  );
}
