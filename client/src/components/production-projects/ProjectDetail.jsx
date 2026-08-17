import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import ProjectForm from './ProjectForm';
import CommunicationLog from './CommunicationLog';

export default function ProjectDetail({ project, tasks, canStructure, api, onRefresh, onToggleAssignedTask }) {
  const { t, tx } = useT();
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [picker, setPicker] = useState([]);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDueDate, setMilestoneDueDate] = useState('');
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [milestoneDraft, setMilestoneDraft] = useState({ title: '', dueDate: '' });
  const [taskText, setTaskText] = useState('');
  const [attachId, setAttachId] = useState('');
  const [error, setError] = useState(null);

  const loadMembers = async () => {
    try { setMembers(await api(`/${project.id}/team-members`)); }
    catch (err) { setError(err.message); }
  };
  const loadProjectTasks = async () => { try { setProjectTasks(await api(`/${project.id}/tasks`)); } catch (err) { setError(err.message); } };
  useEffect(() => { setEditing(false); setError(null); setMilestoneTitle(''); setMilestoneDueDate(''); setEditingMilestoneId(null); setTaskText(''); loadMembers(); loadProjectTasks(); if (canStructure) api('/members').then(setPicker).catch((err) => setError(err.message)); }, [project.id, canStructure]);
  const act = async (fn) => { setError(null); try { await fn(); await onRefresh(); await loadMembers(); await loadProjectTasks(); } catch (err) { setError(err.message); } };
  const memberNames = new Map(members.map((member) => [member.id, member.label]));
  const linked = projectTasks;
  const available = tasks.filter((task) => !task.productionProjectId);

  if (editing) return <section className="pp-detail"><ProjectForm project={project} onCancel={() => setEditing(false)} onSave={async (fields) => { await act(() => api(`/${project.id}`, 'PUT', fields)); setEditing(false); }} /></section>;
  return <section className="pp-detail">
    <div className="pp-detail-head"><div><h2 dir="auto">{project.name}</h2>{project.category && <p className="pp-category" dir="auto">{project.category}</p>}<div className="pp-meta"><span className={`pp-status pp-status--${project.status}`}>{t(`productionProjects.status.${project.status}`)}</span>{project.startDate && <span><span>{t('productionProjects.startDate')}</span> <time dir="ltr">{project.startDate}</time></span>}{project.deadline && <span><span>{t('productionProjects.deadline')}</span> <time dir="ltr">{project.deadline}</time></span>}{project.isOverdue && <span className="pp-overdue">{t('productionProjects.overdue')}</span>}</div></div>{canStructure && <button className="btn-ghost" onClick={() => setEditing(true)}>{t('productionProjects.edit')}</button>}</div>
    {error && <p className="pp-error" role="alert">{error}</p>}
    <section className="pp-section"><h3>{t('productionProjects.milestones')}</h3><p>{project.progressPercent === null ? t('productionProjects.noMilestones') : tx('productionProjects.progress', { percent: project.progressPercent })}</p>
      <ul className="pp-rows">{project.milestones.map((item) => <li key={item.id}>{editingMilestoneId === item.id ? <div className="pp-milestone-edit"><input value={milestoneDraft.title} dir="auto" aria-label={t('productionProjects.milestoneTitle')} onChange={(e) => setMilestoneDraft((draft) => ({ ...draft, title: e.target.value }))} /><input type="date" value={milestoneDraft.dueDate} dir="ltr" aria-label={t('productionProjects.milestoneDueDate')} onChange={(e) => setMilestoneDraft((draft) => ({ ...draft, dueDate: e.target.value }))} /><button className="btn-ghost" disabled={!milestoneDraft.title.trim()} onClick={() => act(async () => { await api(`/${project.id}/milestones/${item.id}`, 'PUT', { title: milestoneDraft.title, dueDate: milestoneDraft.dueDate || null }); setEditingMilestoneId(null); })}>{t('productionProjects.save')}</button><button className="pp-text-btn" onClick={() => setEditingMilestoneId(null)}>{t('productionProjects.cancel')}</button></div> : <><input type="checkbox" checked={item.completed} disabled={!canStructure} onChange={() => act(() => api(`/${project.id}/milestones/${item.id}`, 'PUT', { completed: !item.completed }))} /><span className="pp-milestone-content"><span dir="auto" className={item.completed ? 'pp-done' : ''}>{item.title}</span>{item.dueDate && <small><span>{t('productionProjects.milestoneDueDate')}</span> <time dir="ltr">{item.dueDate}</time></small>}</span>{canStructure && <><button className="pp-text-btn" onClick={() => { setEditingMilestoneId(item.id); setMilestoneDraft({ title: item.title, dueDate: item.dueDate || '' }); }}>{t('productionProjects.edit')}</button><button className="pp-text-btn pp-danger" onClick={() => act(() => api(`/${project.id}/milestones/${item.id}`, 'DELETE'))}>{t('productionProjects.delete')}</button></>}</>}</li>)}</ul>
      {canStructure && <div className="pp-inline pp-milestone-add"><input value={milestoneTitle} dir="auto" placeholder={t('productionProjects.milestoneTitle')} aria-label={t('productionProjects.milestoneTitle')} onChange={(e) => setMilestoneTitle(e.target.value)} /><input type="date" value={milestoneDueDate} dir="ltr" aria-label={t('productionProjects.milestoneDueDate')} onChange={(e) => setMilestoneDueDate(e.target.value)} /><button className="btn-ghost" disabled={!milestoneTitle.trim()} onClick={() => act(async () => { await api(`/${project.id}/milestones`, 'POST', { title: milestoneTitle, dueDate: milestoneDueDate || null }); setMilestoneTitle(''); setMilestoneDueDate(''); })}>{t('productionProjects.addMilestone')}</button></div>}</section>
    <section className="pp-section"><h3>{t('productionProjects.tasks')}</h3><ul className="pp-rows">{linked.length === 0 ? <li className="pp-empty">{t('productionProjects.noTasks')}</li> : linked.map((task) => <li key={task.id}><input type="checkbox" checked={Boolean(task.completed)} disabled={!canStructure && !task.assignedToMe} onChange={() => { onToggleAssignedTask(task.id, !task.completed, task).then(loadProjectTasks); }} /><span dir="auto" className={task.completed ? 'pp-done' : ''}>{task.text}</span>{canStructure && <button className="pp-text-btn pp-danger" onClick={() => act(() => api(`/${project.id}/tasks/${task.id}`, 'DELETE'))}>{t('productionProjects.detach')}</button>}</li>)}</ul>
      {canStructure && <><div className="pp-inline"><input value={taskText} dir="auto" placeholder={t('productionProjects.taskTitle')} onChange={(e) => setTaskText(e.target.value)} /><button className="btn-ghost" onClick={() => act(async () => { await api(`/${project.id}/tasks`, 'POST', { text: taskText }); setTaskText(''); })}>{t('productionProjects.createTask')}</button></div><div className="pp-inline"><select value={attachId} onChange={(e) => setAttachId(e.target.value)}><option value="">{t('productionProjects.chooseTask')}</option>{available.map((task) => <option key={task.id} value={task.id}>{task.text}</option>)}</select><button className="btn-ghost" disabled={!attachId} onClick={() => act(async () => { await api(`/${project.id}/tasks/${attachId}`, 'PUT'); setAttachId(''); })}>{t('productionProjects.attach')}</button></div></>}</section>
    <section className="pp-section"><h3>{t('productionProjects.team')}</h3><p className="pp-members">{(project.teamMemberIds || []).length ? project.teamMemberIds.map((id) => <span key={id} dir="auto">{memberNames.get(id) || id}</span>) : t('productionProjects.noTeam')}</p>{canStructure && <div className="pp-picker">{picker.map((member) => <label key={member.id}><input type="checkbox" checked={(project.teamMemberIds || []).includes(member.id)} onChange={(e) => { const ids = project.teamMemberIds || []; act(() => api(`/${project.id}/team`, 'PUT', { teamMemberIds: e.target.checked ? [...ids, member.id] : ids.filter((id) => id !== member.id) })); }} /> <span dir="auto">{member.label}</span></label>)}</div>}</section>
    <CommunicationLog project={project} members={members} canStructure={canStructure} api={api} act={act} />
  </section>;
}
