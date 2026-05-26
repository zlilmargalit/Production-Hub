import { useEffect } from 'react';

/**
 * Reusable confirmation modal.
 *
 * Props:
 *   title       — bold heading
 *   message     — body text
 *   confirmLabel — default "Yes"
 *   cancelLabel  — default "No"
 *   danger       — true = confirm button is red, false = blue (default true)
 *   onConfirm   — called when user clicks the confirm button
 *   onCancel    — called when user clicks cancel or the backdrop
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  danger = true,
  onConfirm,
  onCancel,
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="modal-overlay confirm-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-icon ${danger ? 'confirm-icon--danger' : 'confirm-icon--info'}`}>
          {danger ? '⚠' : '●'}
        </div>
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn-confirm-danger' : 'btn-primary'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
