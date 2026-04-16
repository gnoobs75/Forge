import React, { useState, useMemo } from 'react';
import { useStore } from './store/useStore';
import TitleBar from './components/TitleBar';
import SplitPane from './components/SplitPane';
import Terminal from './components/Terminal';
import Dashboard from './components/Dashboard';
import StatusBar from './components/StatusBar';
import GuidedTutorial from './components/GuidedTutorial';
import NewProjectModal from './components/dashboard/NewProjectModal';

export default function App() {
  const [splitPosition, setSplitPosition] = useState(35);
  const showNewProjectModal = useStore((s) => s.showNewProjectModal);
  const setShowNewProjectModal = useStore((s) => s.setShowNewProjectModal);
  const activeProject = useStore((s) => s.activeProject);
  const projects = useStore((s) => s.projects);

  const terminalScope = useMemo(() => {
    if (!activeProject) {
      return { id: 'studio', label: 'Studio Terminal' };
    }
    const project = projects.find((p) => p.slug === activeProject);
    if (!project) {
      return { id: 'studio', label: 'Studio Terminal' };
    }
    return {
      id: project.slug,
      label: `${project.name} Terminal`,
      repoPath: project.repoPath,
      projectName: project.name,
    };
  }, [activeProject, projects]);

  return (
    <div className="h-screen flex flex-col bg-forge-bg" style={{ background: 'radial-gradient(ellipse at 10% 0%, #242430 0%, #18181C 50%)' }}>
      <TitleBar />
      <SplitPane
        position={splitPosition}
        onPositionChange={setSplitPosition}
        left={<Terminal scope={terminalScope} />}
        right={<Dashboard />}
      />
      <StatusBar />
      <GuidedTutorial />
      {showNewProjectModal && (
        <NewProjectModal onClose={() => setShowNewProjectModal(false)} />
      )}
    </div>
  );
}
