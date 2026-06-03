import { useState, useRef } from 'react';

export function useSavedPill() {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  const flash = () => {
    setShow(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 2200);
  };

  return { show, flash };
}

export default function SavedPill({ show }) {
  return (
    <span className={`saved-pill${show ? ' show' : ''}`}>
      <span className="saved-pill-check">✓</span>
      Saved
    </span>
  );
}
