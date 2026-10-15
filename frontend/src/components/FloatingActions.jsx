import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Escape table overflow while keeping the actions beside their trigger.
export default function FloatingActions({ anchor, onClose, children }) {
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const height = panel.offsetHeight;
      const width = panel.offsetWidth;
      const top = rect.bottom + height + margin * 2 <= window.innerHeight
        ? rect.bottom + margin
        : rect.top - height - margin;
      panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
      panel.style.left = `${Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))}px`;
    };
    const dismissOutside = (event) => {
      if (!panel.contains(event.target) && !anchor.contains(event.target)) onClose();
    };
    const keyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        anchor.focus();
      }
    };
    position();
    panel.querySelector('button')?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', keyDown);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', keyDown);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      role="group"
      aria-label="Member actions"
      className="fixed z-[100] max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] overflow-y-auto bg-panel border border-line rounded-xl shadow-sm p-2 min-w-[170px]"
    >
      {children}
    </div>,
    document.body,
  );
}
