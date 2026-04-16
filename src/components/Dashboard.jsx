import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { classifyGitChange } from '../utils/classifyGitChange';
import StudioOverview from './dashboard/StudioOverview';
import ProjectDetail from './dashboard/ProjectDetail';
import AgentProfile from './dashboard/AgentProfile';
import FridayPanel from './dashboard/FridayPanel';
import FridayPersona from './dashboard/FridayPersona';
import FloatingMiniOrb from './dashboard/friday/FloatingMiniOrb';

// View depth: overview=0, detail/agent=1
function getViewDepth(activeProject, activeAgent) {
  if (activeAgent || activeProject) return 1;
  return 0;
}

export default function Dashboard() {
  const activeProject = useStore((s) => s.activeProject);
  const activeAgent = useStore((s) => s.activeAgent);
  const activePersona = useStore((s) => s.activePersona);
  const agents = useStore((s) => s.agents);
  const loadFromFiles = useStore((s) => s.loadFromFiles);
  const startWatching = useStore((s) => s.startWatching);

  const [activeView, setActiveView] = useState(null);

  // Clear Friday view when navigating to a project/agent via any path
  useEffect(() => {
    if ((activeProject || activeAgent) && activeView) {
      setActiveView(null);
    }
  }, [activeProject, activeAgent]);

  const prevDepth = useRef(getViewDepth(activeProject, activeAgent));
  const [transitionClass, setTransitionClass] = useState('animate-slide-up');

  useEffect(() => {
    const newDepth = getViewDepth(activeProject, activeAgent);
    if (newDepth > prevDepth.current) {
      setTransitionClass('animate-slide-up');
    } else if (newDepth < prevDepth.current) {
      setTransitionClass('animate-slide-down');
    }
    prevDepth.current = newDepth;
  }, [activeProject, activeAgent]);

  // Setup Friday IPC listeners once at app level (persistent — survives tab navigation)
  const setupFridayListeners = useStore((s) => s.setupFridayListeners);
  useEffect(() => {
    const cleanup = setupFridayListeners();
    return cleanup;
  }, [setupFridayListeners]);

  useEffect(() => {
    // Load saved data first, THEN seed defaults only if nothing was persisted
    loadFromFiles().then(() => {
      useStore.getState().seedDefaultAutomation();
    });
    startWatching();

    // Port monitor listener
    const cleanups = [];
    if (window.electronAPI?.ports) {
      const removePortStatus = window.electronAPI.ports.onStatus((data) => {
        useStore.setState({ portHealth: data });
      });
      cleanups.push(removePortStatus);
    }

    // Register automation IPC listeners

    if (window.electronAPI?.automation) {
      // Schedule fired → spawn automation task
      const removeSchedule = window.electronAPI.automation.onScheduleFired((schedule) => {
        console.log('[Forge] Schedule fired:', schedule.agentName, schedule.action);
        const store = useStore.getState();

        if (schedule.project === 'all') {
          // Run for all projects
          store.projects.forEach((project, i) => {
            setTimeout(() => {
              store.startAutomationTask(schedule.agentId, schedule.agentName, project, schedule.action);
              store.logAutomationExecution({
                id: Date.now() + i,
                type: 'schedule',
                agentId: schedule.agentId,
                agentName: schedule.agentName,
                agentColor: schedule.agentColor,
                projectSlug: project.slug,
                action: schedule.action,
                status: 'started',
                timestamp: new Date().toISOString(),
              });
            }, i * 5000);
          });
        } else {
          const project = store.projects.find(p => p.slug === schedule.project);
          if (project) {
            store.startAutomationTask(schedule.agentId, schedule.agentName, project, schedule.action);
            store.logAutomationExecution({
              id: Date.now(),
              type: 'schedule',
              agentId: schedule.agentId,
              agentName: schedule.agentName,
              agentColor: schedule.agentColor,
              projectSlug: project.slug,
              action: schedule.action,
              status: 'started',
              timestamp: new Date().toISOString(),
            });
          }
        }
      });
      cleanups.push(removeSchedule);

      // Git change → classify → emit automation event
      const removeGit = window.electronAPI.automation.onGitChange((data) => {
        console.log('[Forge] Git change detected:', data.slug);
        const classification = classifyGitChange({
          commits: data.commits,
          numstat: data.numstat,
        });
        console.log('[Forge] Classification:', classification.summary);

        useStore.getState().emitAutomationEvent('git-push', {
          projectSlug: data.slug,
          repoPath: data.repoPath,
          classification,
        });
      });
      cleanups.push(removeGit);
    }

    return () => {
      cleanups.forEach(fn => fn && fn());
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't capture when typing in inputs or terminal
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.target.closest('.xterm')) return;

      const store = useStore.getState();

      // Escape: clear agent first, then project, then activeView
      if (e.key === 'Escape') {
        if (store.activeAgent) {
          store.setActiveAgent(null);
          return;
        }
        if (store.activeProject) {
          store.setActiveProject(null);
          return;
        }
        setActiveView(null);
        return;
      }

      // 1-9: switch to project by index
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const idx = parseInt(e.key) - 1;
        if (idx < store.projects.length) {
          store.setActiveProject(store.projects[idx].slug);
          setActiveView(null);
        }
      }

      // 0 or H: go to studio overview
      if ((e.key === '0' || e.key.toLowerCase() === 'h') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        store.setActiveAgent(null);
        store.setActiveProject(null);
        setActiveView(null);
      }

      // N: open new project modal
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        store.setShowNewProjectModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeAgentData = activeAgent ? agents.find((a) => a.id === activeAgent) : null;

  // Determine breadcrumb
  const renderBreadcrumb = () => {
    const goHome = () => {
      useStore.getState().setActiveAgent(null);
      useStore.getState().setActiveProject(null);
      setActiveView(null);
    };

    return (
      <div className="flex items-center gap-2">
        <NavButton
          active={!activeProject && !activeAgent && !activeView}
          onClick={goHome}
        >
          Studio Overview
        </NavButton>
        <span className="text-forge-text-muted text-xs">|</span>
        <NavButton
          active={activeView === 'friday'}
          onClick={() => {
            useStore.getState().setActiveAgent(null);
            useStore.getState().setActiveProject(null);
            setActiveView('friday');
          }}
          style={{ color: activeView === 'friday' ? '#D946EF' : undefined }}
        >
          {activePersona.shortName}
        </NavButton>
        {activeView === 'friday' && (
          <>
            <span className="text-forge-text-muted text-xs">/</span>
            <span className="text-xs font-medium" style={{ color: '#D946EF' }}>
              Studio Director
            </span>
          </>
        )}
        {(activeView === 'friday' || activeView === 'friday-persona') && (
          <>
            <span className="text-forge-text-muted text-xs">|</span>
            <NavButton
              active={activeView === 'friday-persona'}
              onClick={() => {
                useStore.getState().setActiveAgent(null);
                useStore.getState().setActiveProject(null);
                setActiveView('friday-persona');
              }}
              style={{ color: activeView === 'friday-persona' ? '#D946EF' : undefined }}
            >
              Persona
            </NavButton>
          </>
        )}
        {activeAgent && activeAgentData && (
          <>
            <span className="text-forge-text-muted text-xs">/</span>
            <span className="text-xs font-medium" style={{ color: activeAgentData.color }}>
              {activeAgentData.name}
            </span>
          </>
        )}
        {!activeAgent && activeProject && (
          <>
            <span className="text-forge-text-muted text-xs">/</span>
            <span className="text-xs font-medium text-forge-text-primary">
              {useStore.getState().projects.find((p) => p.slug === activeProject)?.name}
            </span>
          </>
        )}
      </div>
    );
  };

  // Determine content — activeAgent takes priority
  const viewKey = activeView || activeAgent || activeProject || 'overview';
  const renderContent = () => {
    if (activeView === 'friday') return <FridayPanel />;
    if (activeView === 'friday-persona') return <FridayPersona />;
    if (activeAgent) return <AgentProfile agentId={activeAgent} />;
    if (activeProject) return <ProjectDetail slug={activeProject} />;
    return <StudioOverview />;
  };

  return (
    <div className="h-full flex flex-col bg-forge-bg">
      {/* Dashboard header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-forge-border bg-forge-surface/50">
        {renderBreadcrumb()}
        <div className="flex items-center gap-1">
          <QuickAction
            label="Architecture Review"
            tooltip="@SolutionsArchitect review system architecture for all active projects"
          />
          <QuickAction
            label="Test Coverage"
            tooltip="@QALead analyze test coverage and gaps"
          />
          <QuickAction
            label="Sprint Plan"
            tooltip="@ProjectManager plan this week's sprint priorities"
          />
        </div>
      </div>

      {/* Dashboard content */}
      <div className={`flex-1 min-h-0 ${activeView === 'friday-persona' || activeView === 'friday' ? '' : 'overflow-y-auto p-4'}`}>
        <div key={viewKey} className={`${transitionClass} ${activeView === 'friday-persona' || activeView === 'friday' ? 'h-full' : ''}`}>
          {renderContent()}
        </div>
      </div>

      <FloatingMiniOrb onNavigateToFriday={() => {
        useStore.getState().setActiveAgent(null);
        useStore.getState().setActiveProject(null);
        setActiveView('friday');
      }} />
    </div>
  );
}

function NavButton({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={style}
      className={`text-xs font-medium transition-colors ${
        active
          ? 'text-forge-accent'
          : 'text-forge-text-secondary hover:text-forge-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function QuickAction({ label, tooltip }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        className="px-2 py-1 text-[10px] font-medium text-forge-text-muted border border-forge-border rounded
                   hover:text-forge-text-secondary hover:border-forge-accent-blue/30 transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {label}
      </button>
      {showTooltip && tooltip && (
        <div className="absolute top-full right-0 mt-1 px-3 py-2 bg-forge-surface border border-forge-border rounded-lg shadow-lg z-30 whitespace-nowrap animate-fade-in">
          <div className="text-[10px] text-forge-text-muted mb-0.5">Copy to terminal:</div>
          <code className="text-[11px] text-forge-accent font-mono">{tooltip}</code>
        </div>
      )}
    </div>
  );
}
