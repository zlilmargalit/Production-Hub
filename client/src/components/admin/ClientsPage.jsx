import PageBar from '../ui/PageBar';
import { ils, todayStr } from './adminFormat';
import { useT } from '../../i18n';

// Clients — reuses the crew-card grid shape. Chrome English, names Hebrew/RTL.

export default function ClientsPage({ clients = [], projects = [], loading = false, onAdd, onOpen }) {
  const { t, tx } = useT();
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
        title={t('clients.title')}
        count={clients.length}
        countLabel={t('clients.count')}
        actions={onAdd ? <button className="btn-primary" onClick={onAdd}>+ {t('clients.add')}</button> : null}
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
                <h3 dir="auto" className="adm-client-name he">{c.name}</h3>
                <p className="adm-client-caption">
                  {c.businessId ? <span className="n">{c.businessId}</span> : t('clients.noBusinessNumber')}
                  {' · '}{tx('clients.netTerms', { days: c.paymentTerms })}
                </p>
                {/* The separator belongs between two values, so it only appears
                    when there are two — a phone with no contact name must not
                    render as "· 052 000 0000". */}
                {(c.contactName || c.phone) && (
                  <p dir="auto" className="adm-client-contact he">
                    {c.contactName}
                    {c.contactName && c.phone ? ' · ' : null}
                    {c.phone ? <span className="n">{c.phone}</span> : null}
                  </p>
                )}
                <div className="adm-client-foot">
                  <span className="adm-client-projects n">
                    {tx(s.count === 1 ? 'clients.projects.one' : 'clients.projects.many', { count: s.count })}
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
          <button className="adm-add-card" onClick={onAdd}>+ {t('clients.add')}</button>
        </div>
      )}
    </div>
  );
}
