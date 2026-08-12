import { useState } from 'react';
import IconButton from '../ui/IconButton';
import { decimalOnly } from '../../utils/fieldInput';
import { ils, fmtDate, todayStr } from './adminFormat';

// One control, used on a purchase and on every return. Uploading is a two-step
// job — store the file, then attach its URL to the record — and the caller owns
// the second step because a purchase is patched while a return is created with
// the URL already in hand.
function ReceiptButton({ url, label = 'Receipt', busy, onPick, scope = '' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                 // so re-picking the same file re-fires
    if (!file) return;
    setUploading(true); setError(null);
    try { await onPick(file); }
    catch (err) { setError(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <span className="adm-receipt">
      {url && (
        <a className="adm-receipt-link" href={`${url}${scope}`} target="_blank" rel="noreferrer">{label}</a>
      )}
      <label className={`adm-receipt-pick${uploading ? ' is-busy' : ''}`}>
        {uploading ? 'Uploading…' : url ? 'Replace' : `+ ${label}`}
        <input type="file" accept="image/*,application/pdf" hidden
               disabled={busy || uploading} onChange={pick} />
      </label>
      {error && <span className="adm-receipt-error">{error}</span>}
    </span>
  );
}

// Purchases and returns — the tracking surface.
//
// This is the part of the job the rest of the app exists to support: buying on
// your own card for a client, taking back what was not used, and knowing at any
// moment how much of your own money is still sitting in a shop.
//
// Every figure shown is derived server-side by derivePurchase — returnedAmount,
// outstanding and riskState. The panel never computes money itself, so a total
// can never disagree with the rows above it.

const RISK_LABEL = {
  overdue:    { text: 'Deadline passed', level: 'alarm' },
  open:       { text: 'Still out',       level: 'waiting' },
  unverified: { text: 'Back — not checked against the bank', level: 'waiting' },
  settled:    { text: 'Settled',         level: 'settled' },
  kept:       { text: 'Kept on purpose', level: 'settled' },
};

function ReturnRow({ ret, scope = '' }) {
  return (
    <li className="adm-return">
      <span className="adm-return-date n">{fmtDate(ret.date)}</span>
      <span className="adm-return-amount n">−{ils(ret.amount)}</span>
      {ret.receiptFileUrl
        ? <a className="adm-return-receipt" href={`${ret.receiptFileUrl}${scope}`} target="_blank" rel="noreferrer">Credit note</a>
        : <span className="adm-return-receipt adm-return-receipt--none">No credit note</span>}
    </li>
  );
}

function Purchase({ purchase: p, busy, handlers }) {
  const [addingReturn, setAddingReturn] = useState(false);
  const [ret, setRet] = useState({ date: todayStr(), amount: '', receiptFileUrl: null });

  const risk = RISK_LABEL[p.riskState] || RISK_LABEL.open;
  const returns = p.returns || [];

  const confirmReturn = async () => {
    if (!ret.amount) return;
    await handlers.addReturn(p.id, {
      date: ret.date,
      amount: Number(ret.amount) || 0,
      receiptFileUrl: ret.receiptFileUrl,
    });
    setRet({ date: todayStr(), amount: '', receiptFileUrl: null });
    setAddingReturn(false);
  };

  return (
    <li className={`adm-purchase adm-purchase--${p.riskState}`}>
      <div className="adm-purchase-head">
        <span dir="auto" className="adm-purchase-store">{p.storeName || 'Unnamed shop'}</span>
        <span className="adm-purchase-date n">{fmtDate(p.date)}</span>
        <span className="adm-purchase-amount n">{ils(p.amount)}</span>
        <IconButton danger onClick={() => handlers.removePurchase(p.id)} title="Remove purchase">✕</IconButton>
      </div>

      <p className={`adm-line adm-line--${risk.level}`}>
        {risk.text}
        {p.outstanding > 0 && <> · <span className="n">{ils(p.outstanding)}</span> still out</>}
        {/* The deadline only matters while something is still out. Once it is
            all back it is history, and repeating it reads as a live warning. */}
        {p.returnDeadline && p.outstanding > 0 && !p.keptOnPurpose && (
          <> · by <span className="n">{fmtDate(p.returnDeadline)}</span></>
        )}
      </p>

      {returns.length > 0 && (
        <ul className="adm-returns">
          {returns.map((r) => <ReturnRow key={r.id} ret={r} scope={handlers.scope} />)}
          <li className="adm-return adm-return--total">
            <span className="adm-return-date">Returned</span>
            <span className="adm-return-amount n">{ils(p.returnedAmount)}</span>
          </li>
        </ul>
      )}

      {addingReturn ? (
        <div className="adm-inline-add">
          <input type="date" value={ret.date}
                 onChange={(e) => setRet((r) => ({ ...r, date: e.target.value }))} />
          <input dir="ltr" inputMode="decimal" placeholder="Amount returned" value={ret.amount}
                 onChange={(e) => setRet((r) => ({ ...r, amount: decimalOnly(e.target.value) }))}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') { e.preventDefault(); confirmReturn(); }
                   if (e.key === 'Escape') { e.preventDefault(); setAddingReturn(false); }
                 }} />
          <ReceiptButton
            url={ret.receiptFileUrl} label="Credit note" busy={busy} scope={handlers.scope}
            onPick={async (file) => {
              const url = await handlers.uploadReceipt(file);
              setRet((r) => ({ ...r, receiptFileUrl: url }));
            }}
          />
          <button type="button" className="btn-primary btn-sm"
                  disabled={busy || !ret.amount} onClick={confirmReturn}>Record</button>
          <button type="button" className="btn-secondary btn-sm"
                  onClick={() => setAddingReturn(false)}>Cancel</button>
        </div>
      ) : (
        <div className="adm-purchase-actions">
          {p.outstanding > 0 && !p.keptOnPurpose && (
            <button type="button" className="btn-ghost btn-sm"
                    onClick={() => setAddingReturn(true)}>+ Return</button>
          )}
          {/* Kept on purpose takes a purchase out of the "chase this" total
              without pretending the money came back. */}
          <button type="button" className="btn-ghost btn-sm" disabled={busy}
                  onClick={() => handlers.setPurchaseFlag(p.id, { keptOnPurpose: !p.keptOnPurpose })}>
            {p.keptOnPurpose ? 'Not kept after all' : 'Kept on purpose'}
          </button>
          {/* Separate from the return itself: the shop saying it refunded you
              and the money appearing on the statement are two different facts. */}
          {p.outstanding === 0 && !p.keptOnPurpose && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy}
                    onClick={() => handlers.setPurchaseFlag(p.id, { bankVerified: !p.bankVerified })}>
              {p.bankVerified ? '✓ Seen on the statement' : 'Mark seen on the statement'}
            </button>
          )}
          <ReceiptButton
            url={p.receiptFileUrl} busy={busy} scope={handlers.scope}
            onPick={async (file) => {
              const url = await handlers.uploadReceipt(file);
              await handlers.setPurchaseFlag(p.id, { receiptFileUrl: url });
            }}
          />
        </div>
      )}

      {p.issue && <p dir="auto" className="adm-purchase-issue">{p.issue}</p>}
    </li>
  );
}

const BLANK = { storeName: '', date: todayStr(), amount: '', receiptNumber: '', returnDeadline: '' };

export default function PurchasesPanel({ project, busy = false, handlers }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState(null);

  const purchases = project.purchases || [];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.amount) return;
    setError(null);
    try {
      await handlers.addPurchase({
        storeName: form.storeName,
        date: form.date,
        amount: Number(form.amount) || 0,
        receiptNumber: form.receiptNumber,
        returnDeadline: form.returnDeadline || null,
      });
      setForm(BLANK);
      setAdding(false);
    } catch (err) {
      setError(err.message || 'Could not add the purchase');
    }
  };

  return (
    <div className="adm-purchases">
      {purchases.length === 0 && !adding && (
        <p className="adm-none">
          Nothing bought on this project yet. Add a purchase to start tracking what comes back.
        </p>
      )}

      {purchases.length > 0 && (
        <ul className="adm-purchase-list">
          {purchases.map((p) => (
            <Purchase key={p.id} purchase={p} busy={busy} handlers={handlers} />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="adm-purchase-form">
          <div className="adm-inline-add">
            <input dir="auto" placeholder="Shop" value={form.storeName}
                   onChange={(e) => set('storeName', e.target.value)} autoFocus />
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            <input dir="ltr" inputMode="decimal" placeholder="Amount" value={form.amount}
                   onChange={(e) => set('amount', decimalOnly(e.target.value))} />
          </div>
          <div className="adm-inline-add">
            <input dir="auto" placeholder="Receipt number" value={form.receiptNumber}
                   onChange={(e) => set('receiptNumber', e.target.value)} />
            <label className="adm-inline-check">
              Return by
              <input type="date" value={form.returnDeadline}
                     onChange={(e) => set('returnDeadline', e.target.value)} />
            </label>
            <button type="button" className="btn-primary btn-sm"
                    disabled={busy || !form.amount} onClick={submit}>Add purchase</button>
            <button type="button" className="btn-secondary btn-sm"
                    onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
          </div>
          {error && <p className="adm-form-error">{error}</p>}
        </div>
      ) : (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(true)}>
          + Purchase
        </button>
      )}

      {project.outstandingOnCard > 0 && (
        <p className="adm-purchase-total adm-line adm-line--waiting">
          {ils(project.outstandingOnCard)} of your own money still out
        </p>
      )}
      {project.keptOnPurposeTotal > 0 && (
        <p className="adm-purchase-total adm-line adm-line--settled">
          {ils(project.keptOnPurposeTotal)} kept on purpose
        </p>
      )}
    </div>
  );
}
