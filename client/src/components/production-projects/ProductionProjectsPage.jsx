import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import PageBar from '../ui/PageBar';
import ProjectList from './ProjectList';
import ProjectDetail from './ProjectDetail';
import ProjectForm from './ProjectForm';

export default function ProductionProjectsPage({ projects, tasks, workspaceId, api, onRefresh, onToggleAssignedTask, initialProjectId = null }) {
  const { t } = useT();
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const appliedInitialProjectId = useRef(null);
  // The owner-only directory is also the least-privilege capability check.
  // /api/me has no artist-scope ownership flag; the server remains authoritative.
  const [canStructure, setCanStructure] = useState(false);
  useEffect(() => { let active = true; setCanStructure(false); api('/members').then(() => { if (active) setCanStructure(true); }).catch(() => { if (active) setCanStructure(false); }); return () => { active = false; }; }, [api, workspaceId]);
  useEffect(() => {
    if (
      initialProjectId
      && appliedInitialProjectId.current !== initialProjectId
      && projects.some((project) => project.id === initialProjectId)
    ) {
      appliedInitialProjectId.current = initialProjectId;
      setSelectedId(initialProjectId);
    }
  }, [initialProjectId, projects]);
  const selected = projects.find((project) => project.id === selectedId) || projects[0] || null;
  const create = async (fields) => { const project = await api('', 'POST', fields); await onRefresh(); setSelectedId(project.id); setCreating(false); };
  return <div className="pp-page"><PageBar title={t('productionProjects.title')} count={projects.length} countLabel={t('productionProjects.count')} />
    {creating ? <ProjectForm onSave={create} onCancel={() => setCreating(false)} /> : <div className="pp-layout"><ProjectList projects={projects} selectedId={selected?.id} onSelect={setSelectedId} onNew={() => setCreating(true)} canStructure={canStructure} />{selected ? <ProjectDetail key={selected.id} project={selected} tasks={tasks} canStructure={canStructure} api={api} onRefresh={onRefresh} onToggleAssignedTask={onToggleAssignedTask} /> : <div className="pp-detail pp-empty">{t('productionProjects.select')}</div>}</div>}
  </div>;
}
