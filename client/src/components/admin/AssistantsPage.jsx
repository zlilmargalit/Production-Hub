import PageBar from '../ui/PageBar';
import { ils } from './adminFormat';

// The assistant roster — the administration workspace's Team screen.
//
// Card shape matches Clients so the two list screens read as siblings. What each
// card adds is the one thing you actually want to know at a glance: whether this
// person is still owed money across every project.

export default function AssistantsPage({
  assistants = [], projects = [], loading = false, onAdd, onOpen,
}) {
  // Derived per assistant, never stored: unpaid bookings across all projects.
  // Matched on assistantId, so a booking whose person was removed from the
  // roster simply stops being attributed here — it stays on its work day.
  const owedTo = (id) => projects
    .flatMap((p) => p.workDays || [])
    .flatMap((d) => d.assistants || [])
    .filter((a) => a.assistantId === id && !a.paidAt)
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const dayCount = (id) => projects
    .flatMap((p) => p.workDays || [])
    .filter((d) => (d.assistants || []).some((a) => a.assistantId === id))
    .length;

  return (
    <div className="adm-page">
      <PageBar
        title="Assistants"
        count={assistants.length}
        countLabel={assistants.length === 1 ? 'PERSON' : 'PEOPLE'}
        actions={onAdd ? <button className="btn-primary" onClick={onAdd}>+ Add Assistant</button> : null}
      />

      {loading ? (
        <div className="adm-grid adm-grid--tight">
          {[0, 1, 2].map((i) => <div key={i} className="adm-client-card adm-card--skeleton" />)}
        </div>
      ) : assistants.length === 0 ? (
        <div className="adm-empty">
          <p>No assistants yet. Add the people you book onto work days.</p>
          <div className="adm-empty-actions">
            <button className="btn-primary" onClick={onAdd}>+ Add assistant</button>
          </div>
        </div>
      ) : (
        <div className="adm-grid adm-grid--tight">
          {assistants.map((a) => {
            const owed = Math.round(owedTo(a.id) * 100) / 100;
            const days = dayCount(a.id);
            return (
              <div key={a.id} className="adm-client-card" onClick={() => onOpen?.(a)}
                   role="button" tabIndex={0}
                   onKeyDown={(e) => e.key === 'Enter' && onOpen?.(a)}>
                <h3 dir="auto" className="adm-client-name he">{a.name}</h3>
                <p className="adm-client-caption">
                  {a.dayRate > 0
                    ? <><span className="n">{ils(a.dayRate)}</span> a day</>
                    : 'No day rate set'}
                </p>
                {a.phone && (
                  <p dir="auto" className="adm-client-contact he">
                    <span className="n">{a.phone}</span>
                  </p>
                )}
                <div className="adm-client-foot">
                  <span className="adm-client-projects n">
                    {days} day{days === 1 ? '' : 's'} booked
                  </span>
                  {owed > 0 && (
                    <span className="adm-client-owed n adm-line--alarm">{ils(owed)} owed</span>
                  )}
                </div>
              </div>
            );
          })}

          <button className="adm-add-card" onClick={onAdd}>+ Add Assistant</button>
        </div>
      )}
    </div>
  );
}
