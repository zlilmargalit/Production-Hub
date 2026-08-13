import { useState } from 'react';
import IconButton from '../ui/IconButton';
import { digitsOnly, phoneChars, isEmail } from '../../utils/fieldInput';
import { useT } from '../../i18n';

// Add / edit a client. Same modal shape as CrewManager's form so the two screens
// feel like one app.
//
// The field list mirrors validateClient() on the server exactly — anything not
// listed there would be silently dropped on save, which is worse than not
// offering it. Chrome is English; every value the user types can be Hebrew, so
// the inputs carry dir="auto" and let the browser decide per value.

const PAYMENT_TERMS = [30, 60, 90];

const EMPTY = {
  name: '', businessId: '', contactName: '', email: '', phone: '',
  invoiceAddress: '', paymentTerms: 30, notes: '',
};

export default function ClientForm({ client = null, onSave, onClose }) {
  const { t } = useT();
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(client || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fields that can only hold digits are filtered here, so the character is
  // never accepted rather than rejected after the fact.
  const CLEAN = {
    paymentTerms: Number,
    businessId:   digitsOnly,
    phone:        phoneChars,
  };

  const set = (e) => {
    const { name, value } = e.target;
    const clean = CLEAN[name];
    setForm((f) => ({ ...f, [name]: clean ? clean(value) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;                       // double-submit would create twice
    // Email is judged whole, not per keystroke — an address is only wrong once
    // it is finished being typed.
    if (!isEmail(form.email)) {
      setError(t('client.error.email'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      // The server's own message is more useful than a generic one — it names
      // the offending field.
      setError(err.message || t('client.error.save'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{client ? t('clients.edit') : t('clients.add')}</h2>
          <IconButton onClick={onClose}>✕</IconButton>
        </div>

        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>{t('client.nameRequired')}</label>
              <input
                dir="auto" name="name" value={form.name} onChange={set}
                required autoFocus placeholder={t('client.namePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('client.businessNumber')}</label>
              <input dir="auto" name="businessId" value={form.businessId} onChange={set}
                     inputMode="numeric" placeholder={t('client.businessPlaceholder')} />
            </div>

            <div className="form-group">
              <label>{t('client.paymentTerms')}</label>
              <select name="paymentTerms" value={form.paymentTerms} onChange={set}>
                {PAYMENT_TERMS.map((days) => (
                  <option key={days} value={days}>{t('client.net')} {days}</option>
                ))}
              </select>
              <span className="field-hint">
                {t('client.paymentTermsHint')}
              </span>
            </div>

            <div className="form-group">
              <label>{t('client.contactName')}</label>
              <input dir="auto" name="contactName" value={form.contactName} onChange={set}
                     placeholder={t('client.contactPlaceholder')} />
            </div>

            <div className="form-group">
              <label>{t('admin.phone')}</label>
              <input dir="auto" name="phone" value={form.phone} onChange={set} inputMode="tel" />
            </div>

            <div className="form-group span-2">
              <label>{t('admin.email')}</label>
              {/* type="text" with our own check on submit, not type="email": the
                  native validation bubble is styled and worded by the browser and
                  ignores this app's error line. isEmail() allows an empty value,
                  because the field is optional. */}
              <input dir="auto" name="email" value={form.email} onChange={set}
                     inputMode="email" placeholder={t('client.emailPlaceholder')} />
            </div>

            <div className="form-group span-2">
              <label>{t('client.invoiceAddress')}</label>
              <input dir="auto" name="invoiceAddress" value={form.invoiceAddress} onChange={set}
                     placeholder={t('client.invoicePlaceholder')} />
            </div>

            <div className="form-group span-2">
              <label>{t('admin.notes')}</label>
              <textarea dir="auto" name="notes" rows={3} value={form.notes} onChange={set} />
            </div>
          </div>

          {error && <p className="adm-form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? t('common.saving') : client ? t('common.saveChanges') : t('clients.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
