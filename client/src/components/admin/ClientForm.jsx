import { useState } from 'react';
import IconButton from '../ui/IconButton';

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
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(client || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'paymentTerms' ? Number(value) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;                       // double-submit would create twice
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      // The server's own message is more useful than a generic one — it names
      // the offending field.
      setError(err.message || 'Could not save the client');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{client ? 'Edit Client' : 'Add Client'}</h2>
          <IconButton onClick={onClose}>✕</IconButton>
        </div>

        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>Client name *</label>
              <input
                dir="auto" name="name" value={form.name} onChange={set}
                required autoFocus placeholder="Agency, production company or brand"
              />
            </div>

            <div className="form-group">
              <label>Business number</label>
              <input dir="auto" name="businessId" value={form.businessId} onChange={set}
                     placeholder="ח.פ. / ע.מ." />
            </div>

            <div className="form-group">
              <label>Payment terms</label>
              <select name="paymentTerms" value={form.paymentTerms} onChange={set}>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t} value={t}>Net {t}</option>
                ))}
              </select>
              <span className="field-hint">
                Sets the invoice due date on this client&#39;s projects.
              </span>
            </div>

            <div className="form-group">
              <label>Contact name</label>
              <input dir="auto" name="contactName" value={form.contactName} onChange={set}
                     placeholder="Who you actually talk to" />
            </div>

            <div className="form-group">
              <label>Phone</label>
              <input dir="auto" name="phone" value={form.phone} onChange={set} inputMode="tel" />
            </div>

            <div className="form-group span-2">
              <label>Email</label>
              {/* Deliberately type="text": type="email" blocks submit on anything
                  without an @, and invoices go to real addresses that are pasted,
                  not typed. The server stores it as free text. */}
              <input dir="auto" name="email" value={form.email} onChange={set} />
            </div>

            <div className="form-group span-2">
              <label>Invoice address</label>
              <input dir="auto" name="invoiceAddress" value={form.invoiceAddress} onChange={set}
                     placeholder="Where the invoice is sent" />
            </div>

            <div className="form-group span-2">
              <label>Notes</label>
              <textarea dir="auto" name="notes" rows={3} value={form.notes} onChange={set} />
            </div>
          </div>

          {error && <p className="adm-form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : client ? 'Save changes' : 'Add client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
