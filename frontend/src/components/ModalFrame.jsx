import { useEffect, useRef } from 'react';

/** Native modal provides top-layer isolation, focus containment and Escape. */
export default function ModalFrame({ onClose, children, className = '', ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog aria-label="Library dialog" {...props} ref={ref} aria-modal="true" onCancel={event => { event.preventDefault(); onClose?.(); }}
    className={`m-0 w-full max-w-none h-full max-h-none border-0 ${className}`}>
    {children}
  </dialog>;
}
