import { useT } from '../../i18n';

export default function ProjectList({ projects, selectedId, onSelect, onNew, canStructure }) {
  const { t, tx } = useT();
  return <section className="pp-list"><div className="pp-list-head"><h2>{t('productionProjects.all')}</h2>{canStructure && <button className="btn-primary" onClick={onNew}>{t('productionProjects.new')}</button>}</div>
    {projects.length === 0 ? <p className="pp-empty">{t('productionProjects.empty')}</p> : projects.map((project) => <button key={project.id} className={`pp-project-card${selectedId === project.id ? ' pp-project-card--active' : ''}`} onClick={() => onSelect(project.id)}>
      <strong dir="auto">{project.name}</strong><span className={`pp-status pp-status--${project.status}`}>{t(`productionProjects.status.${project.status}`)}</span>
      <small dir="ltr">{project.deadline || t('productionProjects.noDeadline')}</small>
      <small>{project.progressPercent === null ? t('productionProjects.noMilestones') : tx('productionProjects.progress', { percent: project.progressPercent })}</small>
      {project.isOverdue && <span className="pp-overdue">{t('productionProjects.overdue')}</span>}
    </button>)}</section>;
}
