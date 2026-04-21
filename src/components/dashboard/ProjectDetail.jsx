import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { recDisplayTitle } from '../../utils/rec';
import { playSound } from '../../utils/sounds';
import { getAgentBrain, getModelFlag } from '../../utils/brainConfig';
import RecFileActions from './RecFileActions';
import ChartRenderer from './ChartRenderer';
import KnowledgeHub from './KnowledgeHub';
import ProgressDetail from './ProgressDetail';
import FeatureOverview from './FeatureOverview';
import ProjectEnvironment from './ProjectEnvironment';
import SocialHub from './SocialHub';
import DraggableTabBar from './DraggableTabBar';

const MarketingBuilder = lazy(() => import('./MarketingBuilder'));
import IdeaBoard from './IdeaBoard';
import ProjectDocs from './ProjectDocs';
import ProjectTools from './ProjectTools';
import ProjectApiSpecs from './ProjectApiSpecs';
import ProjectMcpTools from './ProjectMcpTools';
import ProjectBugs, { getOpenBugCount } from './ProjectBugs';

const PHASE_LIST = [
  { id: 'discovery', name: 'Discovery' },
  { id: 'design', name: 'Design' },
  { id: 'build', name: 'Build' },
  { id: 'test', name: 'Test' },
  { id: 'deploy', name: 'Deploy' },
  { id: 'maintain', name: 'Maintain' },
];

const PHASE_COLORS = {
  discovery: '#8B5CF6',
  design: '#06B6D4',
  build: '#3B82F6',
  test: '#EAB308',
  deploy: '#F97316',
  maintain: '#22C55E',
};

const PLATFORM_LABELS = {
  dev: 'Dev',
  staging: 'Staging',
  prod: 'Production',
  local: 'Local',
};

const EFFORT_COLORS = {
  none: 'text-green-400',
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
};

const IMPACT_COLORS = {
  baseline: 'text-forge-text-muted',
  low: 'text-orange-400',
  medium: 'text-yellow-400',
  high: 'text-green-400',
};

// Phase-specific agent suggestions — which agents are most relevant at each phase
const PHASE_AGENTS = {
  discovery: [
    { invoke: '@ProductOwner', prompt: 'gather and prioritize requirements for this project', label: 'Gather Requirements' },
    { invoke: '@SolutionsArchitect', prompt: 'evaluate tech stack options for this project', label: 'Evaluate Stack' },
    { invoke: '@UXResearcher', prompt: 'conduct user research and map user flows', label: 'User Research' },
  ],
  design: [
    { invoke: '@SolutionsArchitect', prompt: 'design the system architecture', label: 'System Design' },
    { invoke: '@APIDesigner', prompt: 'design API contracts and OpenAPI specs', label: 'API Contracts' },
    { invoke: '@DataEngineer', prompt: 'design the database schema', label: 'Schema Design' },
    { invoke: '@UXResearcher', prompt: 'create wireframes for key user flows', label: 'Wireframes' },
  ],
  build: [
    { invoke: '@BackendEngineer', prompt: 'implement the API endpoints', label: 'Implement APIs' },
    { invoke: '@FrontendEngineer', prompt: 'build the UI components', label: 'Build UI' },
    { invoke: '@DevOpsEngineer', prompt: 'set up CI/CD pipeline', label: 'Setup CI/CD' },
    { invoke: '@SolutionsArchitect', prompt: 'review architecture decisions', label: 'Architecture Review' },
  ],
  test: [
    { invoke: '@QALead', prompt: 'design test strategy and create test plan', label: 'Test Strategy' },
    { invoke: '@SecurityAuditor', prompt: 'run security audit against OWASP Top 10', label: 'Security Scan' },
    { invoke: '@PerformanceEngineer', prompt: 'run load tests and profile performance', label: 'Load Test' },
    { invoke: '@CodeReviewer', prompt: 'review code quality and conventions', label: 'Code Review' },
  ],
  deploy: [
    { invoke: '@DevOpsEngineer', prompt: 'prepare deployment runbook and execute', label: 'Deploy' },
    { invoke: '@QALead', prompt: 'run smoke tests in production', label: 'Smoke Tests' },
    { invoke: '@PerformanceEngineer', prompt: 'set up monitoring and alerting', label: 'Monitoring' },
  ],
  maintain: [
    { invoke: '@PerformanceEngineer', prompt: 'review performance metrics and optimize', label: 'Performance Review' },
    { invoke: '@SecurityAuditor', prompt: 'run vulnerability scan', label: 'Vuln Scan' },
    { invoke: '@CodeReviewer', prompt: 'identify and plan tech debt reduction', label: 'Tech Debt' },
    { invoke: '@ProjectManager', prompt: 'run project retrospective', label: 'Retrospective' },
  ],
};

export default function ProjectDetail({ slug }) {
  const project = useStore((s) => s.projects.find((p) => p.slug === slug));
  const setProjectPhase = useStore((s) => s.setProjectPhase);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const startAgentSession = useStore((s) => s.startAgentSession);
  const agentBrains = useStore((s) => s.agentBrains);
  const allRecommendations = useStore((s) => s.recommendations);
  const agents = useStore((s) => s.agents);

  const recommendations = useMemo(
    () => allRecommendations.filter((r) => r.project === slug),
    [allRecommendations, slug]
  );

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showProgressDetail, setShowProgressDetail] = useState(false);
  const [activeGameTab, setActiveGameTab] = useState('overview');
  const [openBugCount, setOpenBugCount] = useState(0);
  const [specsKind, setSpecsKind] = useState('api'); // 'mcp' | 'api' — drives tab label + component
  const archiveProject = useStore((s) => s.archiveProject);

  // Load open bug count for tab badge
  React.useEffect(() => {
    getOpenBugCount(slug).then(setOpenBugCount);
  }, [slug, activeGameTab]);

  // Detect whether this project has an MCP catalog; fall back to API specs otherwise.
  React.useEffect(() => {
    if (!window.electronAPI?.hq) return;
    let cancelled = false;
    window.electronAPI.hq.readFile(`projects/${slug}/mcp/index.json`).then((res) => {
      if (cancelled) return;
      setSpecsKind(res?.ok ? 'mcp' : 'api');
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (!project) return null;

  const currentPhaseIndex = PHASE_LIST.findIndex((p) => p.id === project.phase);
  const phaseColor = PHASE_COLORS[project.phase] || '#64748b';
  const phaseAgents = PHASE_AGENTS[project.phase] || [];

  return (
    <div className="space-y-6">
      {/* Header with back context */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-mono font-bold text-forge-text-primary">
              {project.name}
            </h1>
            <div className="flex items-center gap-1.5">
              {(project.techStack || project.platforms || []).map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 text-[10px] font-medium bg-forge-surface-hover rounded text-forge-text-secondary"
                >
                  {PLATFORM_LABELS[t] || t}
                </span>
              ))}
            </div>
          </div>
          <p className="text-sm text-forge-text-secondary mt-1">
            {project.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="px-3 py-1.5 text-[10px] font-medium text-forge-text-muted border border-forge-border rounded-lg
                       hover:text-red-400 hover:border-red-400/30 transition-colors"
          >
            Archive
          </button>
        </div>
      </div>

      {/* Archive confirmation */}
      {showArchiveConfirm && (
        <div className="p-3 rounded-lg bg-red-400/10 border border-red-400/30 flex items-center justify-between">
          <span className="text-xs text-red-400">Remove {project.name} from your dashboard?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowArchiveConfirm(false)}
              className="px-3 py-1 text-xs text-forge-text-secondary hover:text-forge-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => archiveProject(slug)}
              className="px-3 py-1 text-xs bg-red-400/20 text-red-400 rounded hover:bg-red-400/30 transition-colors"
            >
              Archive
            </button>
          </div>
        </div>
      )}

      {/* Environment */}
      <ProjectEnvironment project={project} />

      {/* Phase Progress Bar */}
      <div className="card">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-4 border-l-2 border-forge-accent pl-3">
          Development Phase
        </h2>
        <div className="flex items-center gap-1">
          {PHASE_LIST.map((phase, i) => {
            const isCurrent = phase.id === project.phase;
            const isPast = i < currentPhaseIndex;
            const color = PHASE_COLORS[phase.id];

            return (
              <React.Fragment key={phase.id}>
                <button
                  onClick={() => { setProjectPhase(slug, phase.id); playSound('click'); }}
                  className={`flex-1 py-2 px-2 rounded-lg text-center transition-all duration-200 ${
                    isCurrent
                      ? 'ring-2 ring-offset-1 ring-offset-forge-bg'
                      : isPast
                      ? 'opacity-70'
                      : 'opacity-40 hover:opacity-70'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? `${color}30` : isPast ? `${color}15` : `${color}08`,
                    ringColor: isCurrent ? color : 'transparent',
                  }}
                >
                  <div
                    className="text-[10px] font-medium"
                    style={{ color: isCurrent || isPast ? color : '#8891a0' }}
                  >
                    {phase.name}
                  </div>
                  {isCurrent && (
                    <div className="w-1.5 h-1.5 rounded-full mx-auto mt-1" style={{ backgroundColor: color }} />
                  )}
                </button>
                {i < PHASE_LIST.length - 1 && (
                  <div
                    className="w-4 h-0.5 flex-shrink-0"
                    style={{ backgroundColor: isPast ? color : '#3F465B' }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Progress"
          value={`${project.progress}%`}
          color={phaseColor}
          icon={<ProgressRing progress={project.progress} color={phaseColor} />}
          onClick={() => { setShowProgressDetail(!showProgressDetail); playSound('click'); }}
          clickable
        />
        <StatCard
          label="Phase"
          value={PHASE_LIST.find((p) => p.id === project.phase)?.name || project.phase}
          color={phaseColor}
        />
        <StatCard
          label="Client"
          value={project.client || 'Internal'}
        />
        <StatCard
          label="Recommendations"
          value={recommendations.length.toString()}
          color="#C52638"
        />
      </div>

      {/* Progress Breakdown (toggled by clicking Progress card) */}
      {showProgressDetail && (
        <ProgressDetail slug={slug} project={project} />
      )}

      {/* Tab Navigation */}
      <DraggableTabBar
        tabs={GAME_TABS.map(t => {
          if (t.id === 'specs') {
            return specsKind === 'mcp'
              ? { ...t, label: 'MCP', icon: '\uD83E\uDDE0' }
              : { ...t, label: 'API', icon: '\uD83D\uDD0C' };
          }
          if (t.id === 'bugs' && openBugCount > 0) return { ...t, badge: openBugCount };
          return t;
        })}
        activeTab={activeGameTab}
        onTabClick={(id) => { setActiveGameTab(id); playSound('tab'); }}
        storageKey="game-tab-order"
      />

      {/* Tab Content */}
      <div className="animate-fade-in" key={activeGameTab}>
        {activeGameTab === 'overview' && (
          <OverviewContent
            slug={slug}
            project={project}
            phaseColor={phaseColor}
            phaseAgents={phaseAgents}
            agents={agents}
            agentBrains={agentBrains}
            setActiveAgent={setActiveAgent}
            startAgentSession={startAgentSession}
            recommendations={recommendations}
          />
        )}
        {activeGameTab === 'features' && (
          <FeatureOverview slug={slug} project={project} />
        )}
        {activeGameTab === 'bugs' && (
          <ProjectBugs slug={slug} />
        )}
        {activeGameTab === 'ideas' && (
          <IdeaBoard projectFilter={slug} />
        )}
        {activeGameTab === 'specs' && (
          specsKind === 'mcp'
            ? <ProjectMcpTools slug={slug} />
            : <ProjectApiSpecs slug={slug} />
        )}
        {activeGameTab === 'integrations' && (
          <div className="card text-center py-12">
            <div className="text-3xl mb-2 opacity-30">🔗</div>
            <p className="text-sm text-forge-text-muted">Integration status and configs will appear here</p>
            <p className="text-xs text-forge-text-muted mt-1">Ask <code className="text-forge-accent-blue">@DevOpsEngineer</code> to set up integrations</p>
          </div>
        )}
        {activeGameTab === 'tools' && (
          <ProjectTools slug={slug} project={project} />
        )}
        {activeGameTab === 'docs' && (
          <ProjectDocs slug={slug} />
        )}
      </div>
    </div>
  );
}

const GAME_TABS = [
  { id: 'overview', label: 'Overview', icon: '\u2302' },
  { id: 'features', label: 'Features', icon: '\u2726' },
  { id: 'bugs', label: 'Bugs', icon: '\uD83D\uDC1B' },
  { id: 'ideas', label: 'Ideas', icon: '\uD83D\uDCA1' },
  { id: 'specs', label: 'API', icon: '\uD83D\uDD0C' }, // label/icon swap to MCP when project has mcp/index.json
  { id: 'integrations', label: 'Integrations', icon: '\uD83D\uDD17' },
  { id: 'tools', label: 'Project Tools', icon: '\uD83D\uDD27' },
  { id: 'docs', label: 'Docs', icon: '\uD83D\uDCC4' },
];

function OverviewContent({ slug, project, phaseColor, phaseAgents, agents, agentBrains, setActiveAgent, startAgentSession, recommendations }) {
  return (
    <div className="space-y-6">
      {/* Knowledge Hub */}
      <KnowledgeHub slug={slug} project={project} />

      {/* Phase-Specific Agent Suggestions */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
            Suggested Actions for{' '}
            <span style={{ color: phaseColor }}>
              {project.phase}
            </span>{' '}
            Phase
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {phaseAgents.map((suggestion, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border hover:border-forge-accent-blue/30 transition-all cursor-pointer group"
              title={`${suggestion.invoke} ${suggestion.prompt}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-forge-text-primary group-hover:text-forge-accent-blue transition-colors">
                  {suggestion.label}
                </div>
                <span className="text-[10px] text-forge-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                  copy
                </span>
              </div>
              <div className="text-[10px] text-forge-text-muted mt-1 font-mono truncate">
                <span className="text-forge-accent">{suggestion.invoke}</span>{' '}
                {suggestion.prompt}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Agent Bar */}
      <div className="card">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3 border-l-2 border-forge-accent pl-3">
          Ask Your Team About {project.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                if (window.electronAPI?.terminal) {
                  const brain = getAgentBrain(agent.id, agentBrains);
                  const mFlag = getModelFlag(brain);
                  startAgentSession(agent, project, { modelFlag: mFlag });
                  playSound('spawn');
                } else {
                  setActiveAgent(agent.id);
                }
              }}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-forge-border bg-forge-bg/50 text-[10px]
                         font-medium transition-all hover:scale-105"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${agent.color}40`;
                e.currentTarget.style.backgroundColor = `${agent.color}10`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '';
                e.currentTarget.style.backgroundColor = '';
              }}
              title={`@${agent.name.replace(/\s+/g, '')} — ${agent.role}`}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              <span className="text-forge-text-secondary">{agent.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <RecommendationsSection
        recommendations={recommendations}
        projectName={project.name}
      />
    </div>
  );
}

function StatCard({ label, value, color, icon, onClick, clickable }) {
  const Wrapper = clickable ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`card text-center ${clickable ? 'cursor-pointer hover:ring-1 hover:ring-forge-accent/30 progress-glow' : ''}`}
    >
      {icon && <div className="flex justify-center mb-1">{icon}</div>}
      <div className="text-[10px] text-forge-text-muted uppercase tracking-wider">
        {label}
        {clickable && <span className="ml-1 opacity-50">click for details</span>}
      </div>
      <div
        className="text-lg font-mono font-bold mt-1 truncate"
        style={{ color: color || '#e2e8f0' }}
      >
        {value}
      </div>
    </Wrapper>
  );
}

function ProgressRing({ progress, color }) {
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#3F465B" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

function RecommendationsSection({ recommendations, projectName }) {
  const [showHistory, setShowHistory] = useState(false);

  const activeRecs = useMemo(
    () => recommendations.filter((r) => r.status !== 'resolved' && r.status !== 'dismissed'),
    [recommendations]
  );
  const implementedRecs = useMemo(
    () => recommendations.filter((r) => r.resolvedBy === 'auto-implement'),
    [recommendations]
  );
  const manualResolvedRecs = useMemo(
    () => recommendations.filter((r) => r.status === 'resolved' && r.resolvedBy !== 'auto-implement'),
    [recommendations]
  );
  const dismissedRecs = useMemo(
    () => recommendations.filter((r) => r.status === 'dismissed'),
    [recommendations]
  );
  const historyCount = implementedRecs.length + manualResolvedRecs.length + dismissedRecs.length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
          Agent Recommendations ({activeRecs.length})
        </h2>
        {historyCount > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[10px] text-forge-text-muted hover:text-forge-text-secondary transition-colors"
          >
            {showHistory ? 'Hide' : 'Show'} {historyCount} history
          </button>
        )}
      </div>

      {activeRecs.length === 0 && !showHistory ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2 opacity-30">&#x1F52E;</div>
          <p className="text-sm text-forge-text-muted">
            {historyCount > 0 ? 'All caught up!' : 'No recommendations yet'}
          </p>
          {historyCount === 0 && (
            <p className="text-xs text-forge-text-muted mt-1">
              Try: <code className="text-forge-accent-blue">@MarketAnalyst analyze competitors for {projectName}</code>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {activeRecs.map((rec, i) => (
            <ExpandableRecCard key={`active-${i}`} rec={rec} />
          ))}
          {showHistory && (
            <>
              {implementedRecs.length > 0 && (
                <>
                  <div className="border-t border-forge-border/50 pt-3 mt-3">
                    <span className="text-[10px] font-mono text-green-400 uppercase tracking-wider">
                      Implemented
                    </span>
                  </div>
                  {implementedRecs.map((rec, i) => (
                    <ExpandableRecCard key={`impl-${i}`} rec={rec} />
                  ))}
                </>
              )}
              {manualResolvedRecs.length > 0 && (
                <>
                  <div className="border-t border-forge-border/50 pt-3 mt-3">
                    <span className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">
                      Resolved
                    </span>
                  </div>
                  {manualResolvedRecs.map((rec, i) => (
                    <ExpandableRecCard key={`resolved-${i}`} rec={rec} />
                  ))}
                </>
              )}
              {dismissedRecs.length > 0 && (
                <>
                  <div className="border-t border-forge-border/50 pt-3 mt-3">
                    <span className="text-[10px] font-mono text-forge-text-muted uppercase tracking-wider">
                      Dismissed
                    </span>
                  </div>
                  {dismissedRecs.map((rec, i) => (
                    <ExpandableRecCard key={`dismissed-${i}`} rec={rec} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ExpandableRecCard({ rec }) {
  const [expanded, setExpanded] = useState(false);
  const updateStatus = useStore((s) => s.updateRecommendationStatus);
  const startImplementation = useStore((s) => s.startImplementation);
  const projects = useStore((s) => s.projects);
  const implementationSessions = useStore((s) => s.implementationSessions);
  const isResolved = rec.status === 'resolved' || rec.status === 'dismissed';

  const handleAction = (e, status) => {
    e.stopPropagation();
    updateStatus(rec, status);
    playSound(status === 'resolved' ? 'resolve' : status === 'dismissed' ? 'dismiss' : 'click');
  };

  const handleImplement = (e, mode, approachId) => {
    e.stopPropagation();
    const project = projects.find(p => p.slug === rec.project);
    if (!project || !project.repoPath) return;
    // Guard: already running
    const existing = implementationSessions.find(
      s => s.recTimestamp === rec.timestamp && s.recTitle === rec.title && s.status === 'running'
    );
    if (existing) return; // Terminal will pick it up
    startImplementation(rec, project, mode, approachId);
    playSound('spawn');
  };

  return (
    <div
      className={`p-3 rounded-lg border-l-2 border transition-all cursor-pointer ${
        isResolved
          ? 'bg-forge-surface/40 border-forge-border/50 opacity-75 border-l-transparent'
          : 'bg-forge-bg/50 border-forge-border hover:border-forge-accent-blue/30'
      }`}
      style={!isResolved ? { borderLeftColor: 'transparent' } : undefined}
      onMouseEnter={(e) => { if (!isResolved) e.currentTarget.style.borderLeftColor = rec.agentColor; }}
      onMouseLeave={(e) => { if (!isResolved) e.currentTarget.style.borderLeftColor = 'transparent'; }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Agent tag + status */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
              style={{
                backgroundColor: `${rec.agentColor}15`,
                color: rec.agentColor,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: rec.agentColor }}
              />
              {rec.agent}
            </span>
            {rec.boldness && (
              <span className={`text-xs font-medium ${
                rec.boldness === 'wild' ? 'text-red-400' :
                rec.boldness === 'spicy' ? 'text-orange-400' :
                'text-green-400'
              }`}>
                {rec.boldness === 'wild' ? 'WILD' : rec.boldness === 'spicy' ? 'SPICY' : 'SAFE'}
              </span>
            )}
            {isResolved && (
              <span className="text-xs">
                {rec.resolvedBy === 'auto-implement' ? (
                  <span className="text-green-400 font-medium">{'\u26A1'} IMPLEMENTED</span>
                ) : rec.status === 'resolved' ? (
                  <span className="text-green-400/70">{'\u2713'} Resolved</span>
                ) : (
                  <span className="text-forge-text-muted">{'\u2014'} Dismissed</span>
                )}
                {(rec.resolvedAt || rec.dismissedAt) && (
                  <span className="ml-1 text-forge-text-muted">
                    {formatRelativeTime(rec.resolvedAt || rec.dismissedAt)}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className={`text-sm font-medium leading-tight ${isResolved ? 'text-forge-text-secondary line-through' : 'text-forge-text-primary'}`}>
            {recDisplayTitle(rec)}
          </div>
          <div className="text-sm text-forge-text-secondary mt-1 leading-relaxed">{rec.summary}</div>
          <RecFileActions rec={rec} />
        </div>

        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span
            className="text-forge-text-muted text-xs inline-block transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            {'\u25BC'}
          </span>
          {rec.approaches && (
            <span className="text-[11px] text-forge-text-muted">{rec.approaches.length} options</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2">
          {rec.approaches && rec.approaches.map((approach) => (
            <div
              key={approach.id}
              className={`p-3 rounded-lg border transition-all ${
                rec.recommended === approach.id
                  ? 'border-l-[3px] border-forge-accent/40 bg-forge-accent/5'
                  : 'border-forge-border/50 bg-forge-surface/30'
              }`}
              style={rec.recommended === approach.id ? { borderLeftColor: '#C52638' } : undefined}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {rec.recommended === approach.id && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-forge-accent/20 text-forge-accent uppercase tracking-wider">
                      Recommended
                    </span>
                  )}
                  <span className="text-sm font-semibold text-forge-text-primary">
                    {approach.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {approach.effort && (
                    <span className={`text-xs ${EFFORT_COLORS[approach.effort] || 'text-forge-text-muted'}`}>
                      Effort: {approach.effort}
                    </span>
                  )}
                  {approach.impact && (
                    <span className={`text-xs ${IMPACT_COLORS[approach.impact] || 'text-forge-text-muted'}`}>
                      Impact: {approach.impact}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-forge-text-secondary leading-relaxed">
                {approach.description}
              </p>
              {approach.trade_offs && (
                <p className="text-xs text-forge-text-muted mt-2 italic leading-relaxed">
                  Trade-offs: {approach.trade_offs}
                </p>
              )}
              {/* Per-approach Plan/Auto buttons */}
              {!isResolved && rec.implementable !== false && (
                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-forge-border/20">
                  <button
                    onClick={(e) => handleImplement(e, 'plan', approach.id)}
                    disabled={!window.electronAPI}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-forge-accent-blue/10 text-forge-accent-blue
                               border border-forge-accent-blue/20 hover:bg-forge-accent-blue/20 transition-colors
                               disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {'\u25B6'} Plan
                  </button>
                  <button
                    onClick={(e) => handleImplement(e, 'auto', approach.id)}
                    disabled={!window.electronAPI}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-400/10 text-orange-400
                               border border-orange-400/20 hover:bg-orange-400/20 transition-colors
                               disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {'\u26A1'} Auto
                  </button>
                  {rec.recommended === approach.id && (
                    <span className="text-[11px] text-forge-text-muted/50 ml-1">recommended</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {rec.reasoning && (
            <div className="mt-3 p-3 rounded-lg border-l-2 border-forge-accent/30 bg-forge-surface/20">
              <div className="text-xs font-medium text-forge-accent uppercase tracking-wider mb-1">
                Why this approach
              </div>
              <p className="text-sm text-forge-text-secondary leading-relaxed">{rec.reasoning}</p>
            </div>
          )}

          {/* Chart data visualization */}
          {rec.chartData && <ChartRenderer chartData={rec.chartData} />}

          {/* Action buttons */}
          <div className="mt-3 pt-3 border-t border-forge-border/30 flex items-center gap-2">
            {!isResolved ? (
              <>
                <button
                  onClick={(e) => handleAction(e, 'resolved')}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-green-400/10 text-green-400
                             border border-green-400/20 hover:bg-green-400/20 transition-colors"
                >
                  Resolve
                </button>
                <button
                  onClick={(e) => handleAction(e, 'dismissed')}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-forge-text-muted
                             border border-forge-border hover:text-forge-text-secondary hover:border-forge-text-muted/30 transition-colors"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                onClick={(e) => handleAction(e, 'active')}
                className="px-4 py-2 text-xs font-medium rounded-lg text-forge-text-muted
                           border border-forge-border hover:text-forge-text-secondary transition-colors"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
