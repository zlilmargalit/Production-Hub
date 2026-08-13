import { useState } from 'react';
import { useT } from '../../i18n';

const STATUSES = ['planned', 'in_progress', 'on_hold', 'completed', 'cancelled'];

export default function ProjectForm({ project, onSave, onCancel }) {
  const { t } = useT();
  const [name, setName] = useState(project?.name || '');
  const [deadline, setDeadline] = useState(project?.deadline || '');
  const [status, setStatus] = useState(project?.status || 'planned');
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    try { await onSave({ name, deadline: deadline || null, status }); }
    catch (err) { setError(err.message); }
  };

  return <form className="pp-form" onSubmit={submit}>
    <label>{t('productionProjects.name')}<input autoFocus value={name} onChange={(e) => setName(e.target.value)} dir="auto" required /></label>
    <label>{t('productionProjects.deadline')}<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} dir="ltr" /></label>
    <label>{t('productionProjects.status')}<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((item) => <option key={item} value={item}>{t(`productionProjects.status.${item}`)}</option>)}</select></label>
    {error && <p className="pp-error" role="alert">{error}</p>}
    <div className="pp-form-actions"><button className="btn-primary" type="submit">{t(project ? 'productionProjects.save' : 'productionProjects.create')}</button><button className="btn-ghost" type="button" onClick={onCancel}>{t('productionProjects.cancel')}</button></div>
  </form>;
}
