import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import ProjectForm from './ProjectForm';

const isoNow = () => new Date().toISOString().slice(0, 16);
const labelDate = (value) => value ? new Date(value).toLocaleString() : '';

export default function ProjectDetail({ project, tasks, canStructure, api, onRefresh, onToggleAssignedTask }) {
  const { t, tx } = useT();
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [picker, setPicker] = useState([]);
  const [milestone, setMilestone] = useState('');
  const [taskText, setTaskText] = useState('');
  const [attachId, setAttachId] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(isoNow());
  const [error, setError] = useState(null);

  const loadMembers = async () => {
    try { setMembers(await api(`/${project.id}/team-members`)); }
    catch (err) { setError(err.message); }
  };
  const loadProjectTasks = async () => { try { setProjectTasks(await api(`/${project.id}/tasks`)); } catch (err) { setError(err.message); } };
  useEffect(() => { setEditing(false); setError(null); setMilestone(''); setTaskText(''); setNote(''); setOccurredAt(isoNow()); loadMembers(); loadProjectTasks(); if (canStructure) api('/members').then(setPicker).catch((err) => setError(err.message)); }, [project.id, canStructure]);
  const act = async (fn) => { setError(null); try { await fn(); await onRefresh(); await loadMembers(); await loadProjectTasks(); } catch (err) { setError(err.message); } };
  const memberNames = new Map(members.map((member) => [member.id, member.label]));
  const linked = projectTasks;
  const available = tasks.filter((task) => !task.productionProjectId);

  if (editing) return <section className="pp-detail"><ProjectForm project={project} onCancel={() => setEditing(false)} onSave={async (fields) => { await act(() => api(`/${project.id}`, 'PUT', fields)); setEditing(false); }} /></section>;
  return <section className="pp-detail">
    <div className="pp-detail-head"><div><h2 dir="auto">{project.name}</h2><div className="pp-meta"><span className={`pp-status pp-status--${project.status}`}>{t(`productionProjects.status.${project.status}`)}</span>{project.deadline && <span dir="ltr">{project.deadline}</span>}{project.isOverdue && <span className="pp-overdue">{t('productionProjects.overdue')}</span>}</div></div>{canStructure && <button className="btn-ghost" onClick={() => setEditing(true)}>{t('productionProjects.edit')}</button>}</div>
    {error && <p className="pp-error" role="alert">{error}</p>}
    <section className="pp-section"><h3>{t('productionProjects.milestones')}</h3><p>{project.progressPercent === null ? t('productionProjects.noMilestones') : tx('productionProjects.progress', { percent: project.progressPercent })}</p>
      <ul className="pp-rows">{project.milestones.map((item) => <li key={item.id}><input type="checkbox" checked={item.completed} disabled={!canStructure} onChange={() => act(() => api(`/${project.id}/milestones/${item.id}`, 'PUT', { completed: !item.completed }))} /><span dir="auto" className={item.completed ? 'pp-done' : ''}>{item.title}</span>{canStructure && <><button className="pp-text-btn" onClick={() => { const title = window.prompt(t('productionProjects.milestoneTitle'), item.title); if (title !== null) act(() => api(`/${project.id}/milestones/${item.id}`, 'PUT', { title })); }}>{t('productionProjects.edit')}</button><button className="pp-text-btn pp-danger" onClick={() => act(() => api(`/${project.id}/milestones/${item.id}`, 'DELETE'))}>{t('productionProjects.delete')}</button></>}</li>)}</ul>
      {canStructure && <div className="pp-inline"><input value={milestone} dir="auto" placeholder={t('productionProjects.milestoneTitle')} onChange={(e) => setMilestone(e.target.value)} /><button className="btn-ghost" onClick={() => act(async () => { await api(`/${project.id}/milestones`, 'POST', { title: milestone }); setMilestone(''); })}>{t('productionProjects.addMilestone')}</button></div>}</section>
    <section className="pp-section"><h3>{t('productionProjects.tasks')}</h3><ul className="pp-rows">{linked.length === 0 ? <li className="pp-empty">{t('productionProjects.noTasks')}</li> : linked.map((task) => <li key={task.id}><input type="checkbox" checked={Boolean(task.completed)} disabled={!canStructure && !task.assignedToMe} onChange={() => { onToggleAssignedTask(task.id, !task.completed, task).then(loadProjectTasks); }} /><span dir="auto" className={task.completed ? 'pp-done' : ''}>{task.text}</span>{canStructure && <button className="pp-text-btn pp-danger" onClick={() => act(() => api(`/${project.id}/tasks/${task.id}`, 'DELETE'))}>{t('productionProjects.detach')}</button>}</li>)}</ul>
      {canStructure && <><div className="pp-inline"><input value={taskText} dir="auto" placeholder={t('productionProjects.taskTitle')} onChange={(e) => setTaskText(e.target.value)} /><button className="btn-ghost" onClick={() => act(async () => { await api(`/${project.id}/tasks`, 'POST', { text: taskText }); setTaskText(''); })}>{t('productionProjects.createTask')}</button></div><div className="pp-inline"><select value={attachId} onChange={(e) => setAttachId(e.target.value)}><option value="">{t('productionProjects.chooseTask')}</option>{available.map((task) => <option key={task.id} value={task.id}>{task.text}</option>)}</select><button className="btn-ghost" disabled={!attachId} onClick={() => act(async () => { await api(`/${project.id}/tasks/${attachId}`, 'PUT'); setAttachId(''); })}>{t('productionProjects.attach')}</button></div></>}</section>
    <section className="pp-section"><h3>{t('productionProjects.team')}</h3><p className="pp-members">{(project.teamMemberIds || []).length ? project.teamMemberIds.map((id) => <span key={id} dir="auto">{memberNames.get(id) || id}</span>) : t('productionProjects.noTeam')}</p>{canStructure && <div className="pp-picker">{picker.map((member) => <label key={member.id}><input type="checkbox" checked={(project.teamMemberIds || []).includes(member.id)} onChange={(e) => { const ids = project.teamMemberIds || []; act(() => api(`/${project.id}/team`, 'PUT', { teamMemberIds: e.target.checked ? [...ids, member.id] : ids.filter((id) => id !== member.id) })); }} /> <span dir="auto">{member.label}</span></label>)}</div>}</section>
    <section className="pp-section"><h3>{t('productionProjects.communication')}</h3><div className="pp-log">{project.communicationLog.length === 0 ? <p className="pp-empty">{t('productionProjects.noCommunication')}</p> : project.communicationLog.map((entry) => <article key={entry.id}><div><strong dir="auto">{entry.authorNameSnapshot || t('productionProjects.unknownAuthor')}</strong><time dir="ltr">{labelDate(entry.occurredAt)}</time></div><p dir="auto">{entry.note}</p></article>)}</div><div className="pp-log-add"><textarea value={note} dir="auto" placeholder={t('productionProjects.note')} onChange={(e) => setNote(e.target.value)} /><input type="datetime-local" value={occurredAt} dir="ltr" onChange={(e) => setOccurredAt(e.target.value)} /><button className="btn-ghost" disabled={!note.trim()} onClick={() => act(async () => { await api(`/${project.id}/communication-log`, 'POST', { note, occurredAt: new Date(occurredAt).toISOString() }); setNote(''); })}>{t('productionProjects.addNote')}</button></div></section>
  </section>;
}
