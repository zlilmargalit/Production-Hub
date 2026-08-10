import PageBar from '../ui/PageBar';
import { ils, todayStr } from './adminFormat';

// Clients — reuses the crew-card grid shape. Chrome English, names Hebrew/RTL.

export default function ClientsPage({ clients = [], projects = [], loading = false, onAdd, onOpen }) {
  const today = todayStr();

  // Derived per client, never stored: how many projects, and what is overdue.
  const summary = (client) => {
    const mine = projects.filter((p) => p.clientId === client.id);
    const owed = mine
      .filter((p) => p.status === 'invoiced')
      .reduce((s, p) => s + Number(p.rate || 0) * (1 + Number(p.vatRate ?? 0.18)), 0);
    const overdue = mine.some(
      (p) => p.status === 'invoiced' && p.paymentDueAt && today > p.paymentDueAt
    );
    return { count: mine.length, owed: Math.round(owed * 100) / 100, overdue };
  };

  return (
    <div className="adm-page">
      <PageBar
        title="Clients"
        count={clients.length}
        countLabel="CLIENTS"
        actions={onAdd ? <button className="btn-primary" onClick={onAdd}>+ Add Client</button> : null}
      />

      {loading ? (
        <div className="adm-grid adm-grid--tight">
          {[0, 1, 2].map((i) => <div key={i} className="adm-client-card adm-card--skeleton" />)}
        </div>
      ) : (
        <div className="adm-grid adm-grid--tight">
          {clients.map((c) => {
            const s = summary(c);
            return (
              <div key={c.id} className="adm-client-card" onClick={() => onOpen?.(c)}
                   role="button" tabIndex={0}
                   onKeyDown={(e) => e.key === 'Enter' && onOpen?.(c)}>
                <h3 className="adm-client-name he">{c.name}</h3>
                <p className="adm-client-caption">
                  {c.businessId ? <span className="n">{c.businessId}</span> : 'No business number'}
                  {' · '}<span className="n">Net {c.paymentTerms}</span>
                </p>
                {(c.contactName || c.phone) && (
                  <p className="adm-client-contact he">
                    {c.contactName}{c.phone ? <> · <span className="n">{c.phone}</span></> : null}
                  </p>
                )}
                <div className="adm-client-foot">
                  <span className="adm-client-projects n">
                    {s.count} project{s.count === 1 ? '' : 's'}
                  </span>
                  {s.owed > 0 && (
                    <span className={`adm-client-owed n${s.overdue ? ' adm-line--alarm' : ''}`}>
                      {ils(s.owed)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Dashed add card closes the grid, matching the crew screens. */}
          <button className="adm-add-card" onClick={onAdd}>+ Add Client</button>
        </div>
      )}
    </div>
  );
}
