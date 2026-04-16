import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import ProjectCard from './ProjectCard';
import PhasePipeline from './PhasePipeline';
import ActivityFeed from './ActivityFeed';
import AgentRoster from './AgentRoster';
import TopRecommendations from './TopRecommendations';
import StudioTimeline from './StudioTimeline';
import AgentScoreboard from './AgentScoreboard';
import AutomationPanel from './AutomationPanel';
import GitVisualization from './GitVisualization';
import CodeViz from './CodeViz';
import ArtifactViewer from './ArtifactViewer';
import SettingsPanel from './SettingsPanel';
import HelpPanel from './HelpPanel';
import DiscordChat from './DiscordChat';
import DiscordEventWatcher from './DiscordEventWatcher';
import IdeaBoard from './IdeaBoard';
import MeteringPanel from './MeteringPanel';
import DraggableTabBar from './DraggableTabBar';

const DEFAULT_TABS = [
  { id: 'overview', label: 'Overview', icon: '\u2302' },
  { id: 'timeline', label: 'Timeline', icon: '\u23F1' },
  { id: 'analytics', label: 'Analytics', icon: '\u2605' },
  { id: 'artifacts', label: 'Artifacts', icon: '\uD83D\uDCC4' },
  { id: 'automation', label: 'Automation', icon: '\u2699' },
  { id: 'git', label: 'Git', icon: '\u2387' },
  { id: 'code', label: 'Code Map', icon: '\u2726' },
  { id: 'council', label: 'Discord', icon: '\u229E' },
  { id: 'ideas', label: 'Ideas', icon: '\uD83D\uDCA1' },
  { id: 'metering', label: 'Metering', icon: '\u2B21' },
];

export default function StudioOverview() {
  const projects = useStore((s) => s.projects);
  const setShowNewProjectModal = useStore((s) => s.setShowNewProjectModal);
  const [activeTab, setActiveTab] = useState('overview');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold text-forge-text-primary">
            Studio Overview
          </h1>
          <p className="text-sm text-forge-text-secondary mt-0.5">
            {projects.length} active projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="w-8 h-8 rounded-lg border border-forge-border bg-forge-surface text-forge-text-muted
                       hover:text-forge-accent hover:border-forge-accent/30 transition-colors
                       flex items-center justify-center text-sm"
            title="Help & Documentation"
          >
            ?
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-lg border border-forge-border bg-forge-surface text-forge-text-muted
                       hover:text-forge-accent hover:border-forge-accent/30 transition-colors
                       flex items-center justify-center text-sm"
            title="Settings"
          >
            {'\u2699'}
          </button>
          <button className="btn-primary text-xs" onClick={() => setShowNewProjectModal(true)}>
            + New Project
          </button>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      <DiscordEventWatcher />

      {/* Tab Navigation */}
      <DraggableTabBar
        tabs={DEFAULT_TABS}
        activeTab={activeTab}
        onTabClick={setActiveTab}
        storageKey="studio-tab-order"
      />

      {/* Tab Content */}
      <div className="animate-fade-in" key={activeTab}>
        {activeTab === 'overview' && <OverviewTab projects={projects} />}
        {activeTab === 'timeline' && <StudioTimeline />}
        {activeTab === 'analytics' && <AgentScoreboard />}
        {activeTab === 'artifacts' && <ArtifactViewer />}
        {activeTab === 'automation' && <AutomationPanel />}
        {activeTab === 'git' && <GitVisualization />}
        {activeTab === 'code' && <CodeViz />}
        {activeTab === 'council' && <DiscordChat />}
        {activeTab === 'ideas' && <IdeaBoard />}
        {activeTab === 'metering' && <MeteringPanel />}
      </div>
    </div>
  );
}

function OverviewTab({ projects }) {
  return (
    <div className="space-y-6">
      {/* Phase Pipeline */}
      <PhasePipeline />

      {/* Project Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {projects.map((project, i) => (
          <ProjectCard key={project.slug} project={project} index={i} />
        ))}
      </div>

      {/* Top Recommendations across all projects */}
      <TopRecommendations />

      {/* Bottom row: Agents + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AgentRoster />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
