import { useState } from 'react';
import IconButton from '../ui/IconButton';
import { phoneChars, decimalOnly } from '../../utils/fieldInput';
import { useT } from '../../i18n';

// Add / edit someone on the assistant roster.
//
// The roster holds who exists and what they usually cost. It does NOT hold what
// they are owed — that belongs to each booking on a work day, so changing a day
// rate here can never restate money already agreed for a day worked.

const EMPTY = { name: '', phone: '', dayRate: '', notes: '' };

export default function AssistantForm({ assistant = null, onSave, onDelete, onClose }) {
  const { t } = useT();
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...(assistant || {}),
    dayRate: assistant?.dayRate ? String(assistant.dayRate) : '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const CLEAN = { phone: phoneChars, dayRate: decimalOnly };

  const set = (e) => {
    const { name, value } = e.target;
    const clean = CLEAN[name];
    setForm((f) => ({ ...f, [name]: clean ? clean(value) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...form, dayRate: Number(form.dayRate) || 0 });
      onClose();
    } catch (err) {
      setError(err.message || t('admin.error.save'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{assistant ? t('assistants.edit') : t('assistants.add')}</h2>
          <IconButton onClick={onClose}>✕</IconButton>
        </div>

        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>{t('admin.nameRequired')}</label>
              <input dir="auto" name="name" value={form.name} onChange={set}
                     required autoFocus placeholder={t('admin.fullName')} />
            </div>

            <div className="form-group">
              <label>{t('admin.phone')}</label>
              <input dir="auto" name="phone" value={form.phone} onChange={set} inputMode="tel" />
            </div>

            <div className="form-group">
              <label>{t('assistants.dayRate')}</label>
              <input dir="ltr" name="dayRate" value={form.dayRate} onChange={set}
                     inputMode="decimal" placeholder="0" />
              <span className="field-hint">
                {t('assistants.dayRateHint')}
              </span>
            </div>

            <div className="form-group span-2">
              <label>{t('admin.notes')}</label>
              <textarea dir="auto" name="notes" rows={3} value={form.notes} onChange={set} />
            </div>
          </div>

          {error && <p className="adm-form-error">{error}</p>}

          <div className="form-actions">
            {/* Deleting only removes them from the roster; days they already
                worked keep their name and amount. */}
            {assistant && onDelete && (
              <button type="button" className="btn-ghost adm-danger-action"
                      onClick={() => onDelete(assistant)}>
                {t('assistants.remove')}
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? t('common.saving') : assistant ? t('common.saveChanges') : t('assistants.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
