import React, { useState } from 'react';
import { useStore } from '../../store/useStore';

const HELP_TABS = [
  { id: 'overview', label: 'How It Works', icon: '\u{1F3F0}' },
  { id: 'agents', label: 'The 14 Agents', icon: '\u{1F9D9}' },
  { id: 'workflows', label: 'Workflows', icon: '\u{1F504}' },
  { id: 'ecosystem', label: 'Ecosystem', icon: '\u{1F30D}' },
  { id: 'technical', label: 'Technical', icon: '\u{1F527}' },
];

export default function HelpPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const agents = useStore(s => s.agents);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-4 z-50 bg-forge-surface rounded-2xl border border-forge-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-forge-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-forge-accent/20 to-purple-500/20 border border-forge-accent/30 flex items-center justify-center text-xl">
              {'\u{1F3F0}'}
            </div>
            <div>
              <h2 className="font-mono font-bold text-forge-text-primary text-lg">The Forge</h2>
              <div className="text-xs text-forge-text-secondary">Software Development Studio</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-forge-border text-forge-text-muted hover:text-forge-text-primary hover:border-forge-text-muted transition-colors flex items-center justify-center text-sm"
          >
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-forge-border/50 flex-shrink-0 overflow-x-auto">
          {HELP_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-forge-accent/10 text-forge-accent border border-forge-accent/20'
                  : 'text-forge-text-muted hover:text-forge-text-secondary hover:bg-forge-bg/50'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && <OverviewSection />}
          {activeTab === 'agents' && <AgentsSection agents={agents} />}
          {activeTab === 'workflows' && <WorkflowsSection />}
          {activeTab === 'ecosystem' && <EcosystemSection />}
          {activeTab === 'technical' && <TechnicalSection />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-forge-border/50 flex items-center justify-between text-[10px] text-forge-text-muted flex-shrink-0">
          <span>The Forge v1.0.0 — 14 AI agents, file-based data, Claude Max</span>
          <span>Built for software development teams</span>
        </div>
      </div>
    </>
  );
}

// ─── Overview Section ───

function OverviewSection() {
  return (
    <div className="space-y-8">
      {/* Executive Summary */}
      <Card title="What Is This?" accent="#8B5CF6">
        <p className="text-sm text-forge-text-secondary leading-relaxed">
          The Forge is an <strong className="text-forge-text-primary">AI-powered software development studio</strong>.
          It gives development teams a full virtual engineering organization — 14 specialized AI agents that analyze
          your projects, write recommendations, and implement changes directly in your codebase.
        </p>
        <p className="text-sm text-forge-text-secondary leading-relaxed mt-2">
          Think of it as having a Solutions Architect, Security Auditor, QA Lead, Performance Engineer, and 10 other
          specialists on your team — all running on Claude, coordinated through a development studio dashboard.
        </p>
      </Card>

      {/* Core Flow Diagram */}
      <Card title="The Core Loop" accent="#3B82F6">
        <FlowDiagram steps={[
          { icon: '\u{1F3AE}', label: 'Your Projects', desc: 'Project codebases', color: '#3B82F6' },
          { icon: '\u{1F9D9}', label: 'Agents Analyze', desc: 'Read code + context', color: '#8B5CF6' },
          { icon: '\u{1F4DD}', label: 'Recommendations', desc: 'JSON files with approaches', color: '#F97316' },
          { icon: '\u{1F4CA}', label: 'Dashboard Shows', desc: 'Visual cards + charts', color: '#22C55E' },
          { icon: '\u{1F6E0}', label: 'You Decide', desc: 'Plan, Auto, or Dismiss', color: '#EAB308' },
          { icon: '\u{1F4BB}', label: 'Claude Implements', desc: 'Terminal session', color: '#0EA5E9' },
        ]} />
        <p className="text-[11px] text-forge-text-muted mt-3 text-center">
          Agents write JSON files. Dashboard reads them. No AI calls from the dashboard — all intelligence runs in Claude terminal sessions.
        </p>
      </Card>

      {/* Three Pillars */}
      <div className="grid grid-cols-3 gap-4">
        <Pillar
          icon={'\u{1F4AC}'}
          title="Team Chat"
          desc="Agents banter in real-time via Groq (Llama 3.1 8B). React to events, debate ideas. Cheap tokens, big personality."
          color="#F55036"
        />
        <Pillar
          icon={'\u{1F4A1}'}
          title="Idea Board"
          desc="Agents drop daily ideas. You drop yours. Click Analyze for a full multi-agent scoring via Claude. Winners get promoted to recommendations."
          color="#EAB308"
        />
        <Pillar
          icon={'\u{1F680}'}
          title="Implementation"
          desc="Click Plan or Auto on any recommendation. A Claude terminal session opens, reads the codebase, and implements the approach you chose."
          color="#22C55E"
        />
      </div>

      {/* What Makes It Different */}
      <Card title="Key Principles" accent="#10B981">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'File-Based', desc: 'All data is JSON/MD files on disk. No database, no cloud. You own everything.' },
            { label: 'Code-Grounded', desc: 'Agents explore your actual codebase before advising. Not generic tips — specific, grounded recommendations.' },
            { label: 'Claude Max', desc: 'Runs on your Claude subscription. No API keys needed for the real work. Groq handles cheap banter.' },
            { label: 'Multi-Project', desc: 'Manage multiple projects simultaneously. Each with its own context, phases, and agent history.' },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border/50">
              <div className="text-xs font-semibold text-forge-text-primary">{item.label}</div>
              <div className="text-[10px] text-forge-text-muted mt-1">{item.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Agents Section ───

const AGENT_DETAILS = {
  'solutions-architect': {
    department: 'Architecture',
    outputs: ['System design docs', 'Tech stack evaluations', 'Architecture decision records', 'Integration patterns'],
    triggers: 'Manual invoke, design phase suggestions, git changes',
    works_with: ['Backend Engineer', 'API Designer', 'Data Engineer'],
  },
  'backend-engineer': {
    department: 'Engineering',
    outputs: ['API implementations', 'Database queries', 'Service layer code', 'Error handling patterns'],
    triggers: 'Manual invoke, build phase suggestions',
    works_with: ['Solutions Architect', 'Data Engineer', 'API Designer'],
  },
  'frontend-engineer': {
    department: 'Engineering',
    outputs: ['UI components', 'Responsive layouts', 'State management', 'Accessibility fixes'],
    triggers: 'Manual invoke, build phase suggestions',
    works_with: ['UX Researcher', 'API Designer', 'Performance Engineer'],
  },
  'devops-engineer': {
    department: 'Operations',
    outputs: ['CI/CD pipelines', 'Docker configs', 'Infrastructure as code', 'Monitoring dashboards'],
    triggers: 'Manual invoke, deploy phase suggestions, git changes',
    works_with: ['Backend Engineer', 'Security Auditor', 'Performance Engineer'],
  },
  'data-engineer': {
    department: 'Engineering',
    outputs: ['Schema designs', 'Migration plans', 'Query optimization reports', 'ETL pipelines'],
    triggers: 'Manual invoke, design phase suggestions',
    works_with: ['Solutions Architect', 'Backend Engineer', 'Performance Engineer'],
  },
  'security-auditor': {
    department: 'Security',
    outputs: ['Vulnerability reports', 'Auth flow audits', 'Compliance assessments', 'Threat models'],
    triggers: 'Manual invoke, test phase suggestions, git changes',
    works_with: ['Backend Engineer', 'DevOps Engineer', 'Solutions Architect'],
  },
  'qa-lead': {
    department: 'Quality',
    outputs: ['Test strategies', 'E2E test suites', 'Load test reports', 'Test coverage analysis'],
    triggers: 'Manual invoke, test phase suggestions, implementation completion',
    works_with: ['Backend Engineer', 'Frontend Engineer', 'Performance Engineer'],
  },
  'product-owner': {
    department: 'Product',
    outputs: ['User stories', 'Acceptance criteria', 'Backlog priorities', 'Sprint plans'],
    triggers: 'Manual invoke, discovery phase suggestions',
    works_with: ['UX Researcher', 'Project Manager', 'Solutions Architect'],
  },
  'ux-researcher': {
    department: 'Design',
    outputs: ['User flow maps', 'Wireframes', 'Accessibility audits', 'Usability reports'],
    triggers: 'Manual invoke, discovery and design phase suggestions',
    works_with: ['Frontend Engineer', 'Product Owner'],
  },
  'api-designer': {
    department: 'Architecture',
    outputs: ['OpenAPI specs', 'API versioning plans', 'Error contract standards', 'API documentation'],
    triggers: 'Manual invoke, design phase suggestions',
    works_with: ['Solutions Architect', 'Backend Engineer', 'Technical Writer'],
  },
  'performance-engineer': {
    department: 'Engineering',
    outputs: ['Performance profiles', 'Cache strategy designs', 'Load test results', 'Optimization recommendations'],
    triggers: 'Manual invoke, test and maintain phase suggestions',
    works_with: ['Backend Engineer', 'DevOps Engineer', 'Data Engineer'],
  },
  'technical-writer': {
    department: 'Documentation',
    outputs: ['API references', 'Runbooks', 'Architecture Decision Records', 'Onboarding guides'],
    triggers: 'Manual invoke, maintain phase suggestions',
    works_with: ['API Designer', 'Solutions Architect', 'DevOps Engineer'],
  },
  'project-manager': {
    department: 'Operations',
    outputs: ['Project timelines', 'Risk assessments', 'Status reports', 'Sprint plans'],
    triggers: 'Manual invoke, all phases, scheduled weekly reports',
    works_with: ['Product Owner', 'QA Lead', 'All agents (coordination)'],
  },
  'code-reviewer': {
    department: 'Quality',
    outputs: ['Code quality reports', 'Convention audits', 'Tech debt assessments', 'Refactoring recommendations'],
    triggers: 'Manual invoke, test and maintain phase suggestions, git changes',
    works_with: ['Backend Engineer', 'Frontend Engineer', 'Security Auditor'],
  },
};

const DEPT_COLORS = {
  Architecture: '#0EA5E9',
  Engineering: '#3B82F6',
  Operations: '#06B6D4',
  Security: '#EF4444',
  Quality: '#DC2626',
  Product: '#EAB308',
  Design: '#8B5CF6',
  Documentation: '#EC4899',
};

function AgentsSection({ agents }) {
  const [selectedAgent, setSelectedAgent] = useState(null);

  return (
    <div className="space-y-6">
      {/* Department Overview Diagram */}
      <Card title="Studio Organization" accent="#8B5CF6">
        <p className="text-[11px] text-forge-text-muted mb-4">
          14 agents organized across 8 departments. Each agent has specific outputs, triggers, and collaboration patterns.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(
            agents.reduce((acc, agent) => {
              const dept = AGENT_DETAILS[agent.id]?.department || 'Other';
              if (!acc[dept]) acc[dept] = [];
              acc[dept].push(agent);
              return acc;
            }, {})
          ).map(([dept, deptAgents]) => (
            <div key={dept} className="rounded-lg border border-forge-border/50 overflow-hidden">
              <div
                className="px-2 py-1.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: DEPT_COLORS[dept] || '#666' }}
              >
                {dept}
              </div>
              <div className="p-1.5 space-y-1">
                {deptAgents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(selectedAgent === a.id ? null : a.id)}
                    className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors ${
                      selectedAgent === a.id
                        ? 'bg-forge-accent/10 text-forge-accent'
                        : 'hover:bg-forge-bg/50 text-forge-text-secondary'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ backgroundColor: a.color }} />
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Agent Detail */}
      {selectedAgent && (
        <AgentDetailCard agent={agents.find(a => a.id === selectedAgent)} />
      )}

      {/* Full Agent Roster */}
      <Card title="Agent Directory" accent="#3B82F6">
        <div className="space-y-2">
          {agents.map(agent => {
            const details = AGENT_DETAILS[agent.id] || {};
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                className="w-full text-left p-3 rounded-lg border border-forge-border/50 hover:border-forge-border bg-forge-bg/30 hover:bg-forge-bg/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: agent.color }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-forge-text-primary">{agent.name}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: `${DEPT_COLORS[details.department] || '#666'}20`, color: DEPT_COLORS[details.department] || '#666' }}
                      >
                        {details.department || 'General'}
                      </span>
                    </div>
                    <div className="text-[10px] text-forge-text-muted truncate">{agent.role}</div>
                  </div>
                  <span className="text-[10px] text-forge-text-muted">{'\u276F'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function AgentDetailCard({ agent }) {
  if (!agent) return null;
  const details = AGENT_DETAILS[agent.id] || {};

  return (
    <Card title={agent.name} accent={agent.color}>
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
            style={{ backgroundColor: agent.color }}
          >
            {agent.name.charAt(0)}
          </div>
          <div>
            <div className="text-sm font-semibold text-forge-text-primary">{agent.name}</div>
            <div className="text-xs text-forge-text-secondary mt-0.5">{agent.role}</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${DEPT_COLORS[details.department] || '#666'}20`, color: DEPT_COLORS[details.department] || '#666' }}
              >
                {details.department}
              </span>
              <span className="text-[9px] text-forge-text-muted">@{agent.id}</span>
            </div>
          </div>
        </div>

        {details.outputs && (
          <div>
            <div className="text-[10px] font-semibold text-forge-text-primary uppercase tracking-wider mb-1.5">Outputs</div>
            <div className="flex flex-wrap gap-1.5">
              {details.outputs.map(o => (
                <span key={o} className="text-[10px] px-2 py-1 rounded-lg bg-forge-bg border border-forge-border/50 text-forge-text-secondary">
                  {o}
                </span>
              ))}
            </div>
          </div>
        )}

        {details.triggers && (
          <div>
            <div className="text-[10px] font-semibold text-forge-text-primary uppercase tracking-wider mb-1.5">Triggered By</div>
            <div className="text-[11px] text-forge-text-secondary">{details.triggers}</div>
          </div>
        )}

        {details.works_with && (
          <div>
            <div className="text-[10px] font-semibold text-forge-text-primary uppercase tracking-wider mb-1.5">Collaborates With</div>
            <div className="text-[11px] text-forge-text-secondary">{details.works_with.join(' \u2022 ')}</div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Workflows Section ───

function WorkflowsSection() {
  return (
    <div className="space-y-8">
      {/* How Agents Get Triggered */}
      <Card title="How Agents Get Triggered" accent="#F97316">
        <p className="text-[11px] text-forge-text-muted mb-4">
          Agents can be activated in 5 different ways. Each produces recommendations, analysis, or direct implementation.
        </p>
        <div className="space-y-3">
          <TriggerRow
            num="1"
            title="Manual Invoke"
            desc="Click an agent in the 'Ask Your Team' bar on any project page. Opens a Claude terminal session with the agent's skill file and project context loaded."
            path="ProjectDetail \u2192 Agent Button \u2192 Terminal Session \u2192 Agent Greets You"
            color="#3B82F6"
          />
          <TriggerRow
            num="2"
            title="Phase-Specific Suggestions"
            desc="Each project phase (Discovery through Maintain) surfaces 3-5 relevant agents. Click a suggestion to run that agent's specialty task."
            path="ProjectDetail \u2192 Phase Suggestion \u2192 Agent Task \u2192 Recommendation Written"
            color="#8B5CF6"
          />
          <TriggerRow
            num="3"
            title="Automation Schedules"
            desc="Configured in the Automation tab. Agents run on daily/weekly/monthly schedules (e.g., Studio Producer weekly report)."
            path="Timer (60s) \u2192 Schedule Match \u2192 Terminal Spawn \u2192 Agent Runs \u2192 Output Written"
            color="#22C55E"
          />
          <TriggerRow
            num="4"
            title="Chain Reactions"
            desc="When one agent produces a recommendation, another can be auto-triggered. E.g., Market Analyst rec triggers Monetization review."
            path="Rec Created \u2192 Chain Match \u2192 Target Agent Spawns \u2192 Follow-up Rec"
            color="#EAB308"
          />
          <TriggerRow
            num="5"
            title="Git Change Triggers"
            desc="Git poller detects new commits. Configured agents auto-run (e.g., Tech Architect audits code after significant pushes)."
            path="Git Poll (120s) \u2192 HEAD Changed \u2192 Trigger Match \u2192 Agent Runs"
            color="#F97316"
          />
        </div>
      </Card>

      {/* Recommendation Lifecycle */}
      <Card title="Recommendation Lifecycle" accent="#22C55E">
        <LifecycleDiagram steps={[
          { label: 'Agent Writes', desc: 'JSON file to hq-data/projects/{slug}/recommendations/', color: '#3B82F6', status: 'Created' },
          { label: 'Dashboard Shows', desc: 'Card appears with title, summary, approaches, trade-offs', color: '#8B5CF6', status: 'Active' },
          { label: 'You Choose', desc: 'Pick an approach: Plan (discuss first) or Auto (implement now)', color: '#EAB308', status: 'Active' },
          { label: 'Claude Implements', desc: 'Terminal session reads prompt, explores code, makes changes', color: '#F97316', status: 'Running' },
          { label: 'Auto-Resolve', desc: 'Exit code 0 = success, rec marked resolved. Exit 1 = needs attention.', color: '#22C55E', status: 'Resolved' },
        ]} />
      </Card>

      {/* Idea Board Flow */}
      <Card title="Idea Board Flow" accent="#EAB308">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-forge-text-primary mb-2">Agent Ideas (Automatic)</div>
            <FlowDiagram steps={[
              { icon: '\u{231B}', label: 'Daily Timer', desc: 'Once per day', color: '#EAB308' },
              { icon: '\u{1F3B2}', label: 'Select 3-4 Agents', desc: 'Context-aware', color: '#8B5CF6' },
              { icon: '\u{26A1}', label: 'Groq Generates', desc: 'One idea each', color: '#F55036' },
              { icon: '\u{1F4CB}', label: 'Posted to Board', desc: 'Active column', color: '#22C55E' },
            ]} vertical />
          </div>
          <div>
            <div className="text-xs font-semibold text-forge-text-primary mb-2">Analysis (On-Demand)</div>
            <FlowDiagram steps={[
              { icon: '\u{2728}', label: 'Click Analyze', desc: 'On any idea', color: '#3B82F6' },
              { icon: '\u{1F4BB}', label: 'Claude Session', desc: 'Full council scores', color: '#0EA5E9' },
              { icon: '\u{1F4CA}', label: '13 Agent Scores', desc: '1-10 each', color: '#7C3AED' },
              { icon: '\u{1F3C6}', label: 'Promote if 7+', desc: 'Becomes a rec', color: '#22C55E' },
            ]} vertical />
          </div>
        </div>
      </Card>

      {/* Team Chat Events */}
      <Card title="Team Chat Event Pipeline" accent="#F55036">
        <p className="text-[11px] text-forge-text-muted mb-3">
          Studio events trigger chat messages via Groq. One poster agent, 1-3 reactor agents with personality-driven commentary.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-forge-border/50">
                <th className="text-left py-2 text-forge-text-muted font-medium">Event</th>
                <th className="text-left py-2 text-forge-text-muted font-medium">Poster Agent</th>
                <th className="text-left py-2 text-forge-text-muted font-medium">Rate Limit</th>
              </tr>
            </thead>
            <tbody className="text-forge-text-secondary">
              {[
                ['New recommendation', 'The writing agent', '30s debounce'],
                ['Rec resolved/dismissed', 'Studio Producer / QA', '30s debounce'],
                ['Implementation started', 'Tech Architect', '30s debounce'],
                ['Implementation finished', 'QA Advisor', '30s debounce'],
                ['Git changes detected', 'Tech Architect', '30s debounce'],
                ['Idea posted', 'The posting agent', '30s debounce'],
                ['Boss drops idea', 'Random curious agent', '30s debounce'],
                ['Idea analyzed', 'High/low scorers', '30s debounce'],
              ].map(([event, poster, limit]) => (
                <tr key={event} className="border-b border-forge-border/20">
                  <td className="py-1.5">{event}</td>
                  <td className="py-1.5">{poster}</td>
                  <td className="py-1.5 text-forge-text-muted">{limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[10px] text-forge-text-muted">
          Global limits: max 8 messages per 5-min window, 30 per hour hard cap.
        </div>
      </Card>
    </div>
  );
}

// ─── Ecosystem Section ───

function EcosystemSection() {
  return (
    <div className="space-y-8">
      {/* The Big Picture */}
      <Card title="System Architecture" accent="#0EA5E9">
        <div className="rounded-xl border border-forge-border overflow-hidden">
          {/* Layers */}
          <ArchLayer
            name="YOU (The Boss)"
            color="#EAB308"
            items={['Dashboard UI', 'Terminal Sessions', 'Idea Board', 'Click to implement']}
          />
          <ArchLayer
            name="Dashboard (React + Electron)"
            color="#3B82F6"
            items={['10-tab Studio Overview', 'Project Detail views', 'Team Chat', 'Recommendation cards', 'Settings']}
          />
          <ArchLayer
            name="Data Layer (hq-data/)"
            color="#22C55E"
            items={['projects/{slug}/', 'recommendations/', 'ideas/', 'knowledge/', 'activity-log.json', 'team-chat/']}
          />
          <ArchLayer
            name="AI Layer"
            color="#8B5CF6"
            items={['Claude Max (real work)', 'Groq/Llama 3.1 8B (chat banter)', '14 agent skill files (.md)', 'Agent personalities (banter)']}
          />
          <ArchLayer
            name="Project Repositories"
            color="#F97316"
            items={['Configured via project.repoPath', 'Each project points to its codebase', 'Agents explore code at runtime']}
            last
          />
        </div>
      </Card>

      {/* Data Flow */}
      <Card title="Data Flow" accent="#22C55E">
        <div className="grid grid-cols-3 gap-4">
          <DataFlowBox
            title="Write Path"
            icon="\u{270F}"
            color="#F97316"
            items={[
              'Agent runs in terminal',
              'Writes JSON to hq-data/',
              'chokidar detects change',
              'Dashboard reloads data',
              'UI updates instantly',
            ]}
          />
          <DataFlowBox
            title="Read Path"
            icon="\u{1F4D6}"
            color="#3B82F6"
            items={[
              'Dashboard mounts',
              'loadFromFiles() runs',
              'Reads all project dirs',
              'Parses JSON/MD files',
              'Zustand store updates',
            ]}
          />
          <DataFlowBox
            title="Chat Path"
            icon="\u{1F4AC}"
            color="#F55036"
            items={[
              'Event detected in store',
              'chatEngine selects agents',
              'IPC to main process',
              'Groq API call (Llama 3.1)',
              'Message added to feed',
            ]}
          />
        </div>
      </Card>

      {/* Security Model */}
      <Card title="Security Model" accent="#EF4444">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-green-400/5 border border-green-400/20">
            <div className="text-xs font-semibold text-green-400 mb-2">Safe</div>
            <ul className="text-[10px] text-forge-text-secondary space-y-1">
              <li>API keys encrypted via OS keychain (safeStorage)</li>
              <li>Renderer never sees raw secrets</li>
              <li>contextIsolation: true, nodeIntegration: false</li>
              <li>All IPC goes through preload bridge</li>
              <li>File paths validated (no path traversal)</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border/50">
            <div className="text-xs font-semibold text-forge-text-primary mb-2">Design Choices</div>
            <ul className="text-[10px] text-forge-text-secondary space-y-1">
              <li>Groq API calls from main process only</li>
              <li>Claude runs via node-pty (real terminal)</li>
              <li>File watcher scoped to hq-data/ only</li>
              <li>No external network calls from renderer</li>
              <li>All data stored locally, never uploaded</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* File System Map */}
      <Card title="File System Map" accent="#06B6D4">
        <pre className="text-[10px] text-forge-text-secondary font-mono leading-relaxed overflow-x-auto p-3 rounded-lg bg-forge-bg border border-forge-border/50">
{`hq-data/
  activity-log.json              # All agent activity
  team-chat/
    messages/YYYY-MM-DD.json     # Daily chat logs
  knowledge/                     # Market intelligence DB
    steam-*.json, ios-*.json     # Platform-specific data
  projects/
    expedition/
      project.json               # Project config
      context.md                 # Context brief for agents
      progress.json              # Completion tracking
      features.json              # Feature registry
      recommendations/           # Agent recommendation JSONs
        YYYY-MM-DD-agent-title.json
      ideas/                     # Idea board entries
        YYYY-MM-DD-source-slug.json
      store-drafts/              # Store listing copy
      checklists/                # QA checklists
      social-hub.json            # Social post drafts
    ttr-ios/  ...
    ttr-roblox/  ...
  automation/
    schedules.json               # Cron-like agent schedules
    chains.json                  # Agent chain reactions
    triggers.json                # Git change triggers
    execution-log.json           # Automation run history
  reports/                       # Archived HTML reports`}
        </pre>
      </Card>
    </div>
  );
}

// ─── Technical Section ───

function TechnicalSection() {
  return (
    <div className="space-y-8">
      <Card title="Tech Stack" accent="#0EA5E9">
        <div className="grid grid-cols-3 gap-3">
          {[
            { name: 'Electron', desc: 'Desktop shell, IPC, PTY management', ver: 'v28+' },
            { name: 'React 18', desc: 'Dashboard UI, component architecture', ver: 'v18.2' },
            { name: 'Vite', desc: 'Build tool, dev server, code splitting', ver: 'v6.4' },
            { name: 'Zustand', desc: 'State management (no Redux)', ver: 'v5' },
            { name: 'Three.js', desc: 'Avatar grid, code galaxy, confetti', ver: 'Code-split' },
            { name: 'Recharts', desc: 'Analytics charts, scoreboard', ver: 'Code-split' },
            { name: 'xterm.js', desc: 'Terminal emulator in browser', ver: 'v5' },
            { name: 'node-pty', desc: 'Pseudo-terminal spawning', ver: 'Native' },
            { name: 'chokidar', desc: 'File system watcher', ver: 'v3' },
            { name: 'Tailwind CSS', desc: 'Utility-first styling', ver: 'v3' },
            { name: 'Groq API', desc: 'Llama 3.1 8B for chat banter', ver: 'REST' },
            { name: 'Claude Max', desc: 'Real agent work via terminal', ver: 'CLI' },
          ].map(t => (
            <div key={t.name} className="p-2 rounded-lg bg-forge-bg/50 border border-forge-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-forge-text-primary">{t.name}</span>
                <span className="text-[9px] text-forge-text-muted">{t.ver}</span>
              </div>
              <div className="text-[9px] text-forge-text-muted mt-0.5">{t.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="IPC Handler Map" accent="#8B5CF6">
        <p className="text-[11px] text-forge-text-muted mb-3">
          All communication between renderer and main process goes through Electron IPC via the preload bridge.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-forge-border/50">
                <th className="text-left py-1.5 text-forge-text-muted font-medium">Channel</th>
                <th className="text-left py-1.5 text-forge-text-muted font-medium">Type</th>
                <th className="text-left py-1.5 text-forge-text-muted font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-forge-text-secondary font-mono">
              {[
                ['terminal:create', 'send', 'Spawn a PTY terminal'],
                ['terminal:create-implementation', 'send', 'Spawn implementation session with prompt'],
                ['terminal:create-agent-session', 'send', 'Spawn agent CLI conversation'],
                ['terminal:input / resize / kill', 'send', 'Terminal I/O control'],
                ['terminal:data / exit', 'event', 'Terminal output + exit notifications'],
                ['hq:read-file / read-dir / write-file', 'invoke', 'File I/O on hq-data/'],
                ['hq:start-watching', 'send', 'Start chokidar file watcher'],
                ['hq:file-changed', 'event', 'File change notifications'],
                ['groq:generate', 'invoke', 'Groq LLM API call (team chat)'],
                ['groq:get-usage', 'invoke', 'Daily token/request usage'],
                ['git:get-data / get-code-stats', 'invoke', 'Git repo information'],
                ['secrets:get-status / set / remove', 'invoke', 'Encrypted credential management'],
                ['report:generate / send-email', 'invoke', 'HTML report generation + email'],
                ['agent:read-skill / write-skill', 'invoke', 'Agent .md skill file I/O'],
              ].map(([channel, type, purpose]) => (
                <tr key={channel} className="border-b border-forge-border/20">
                  <td className="py-1.5 text-forge-accent-blue">{channel}</td>
                  <td className="py-1.5">
                    <span className={`px-1 rounded ${type === 'invoke' ? 'bg-blue-400/10 text-blue-400' : type === 'send' ? 'bg-green-400/10 text-green-400' : 'bg-yellow-400/10 text-yellow-400'}`}>
                      {type}
                    </span>
                  </td>
                  <td className="py-1.5 font-sans text-forge-text-muted">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Build Output" accent="#22C55E">
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'index.js', size: '~383 KB', desc: 'Main React bundle (dashboard + all components)' },
            { name: 'three.js', size: '~514 KB', desc: 'Three.js (code-split, lazy loaded)' },
            { name: 'recharts.js', size: '~580 KB', desc: 'Recharts (code-split, lazy loaded)' },
            { name: 'xterm.js', size: '~291 KB', desc: 'Terminal emulator' },
            { name: 'AvatarGrid.js', size: '~3.5 KB', desc: 'Three.js avatar grid (code-split)' },
            { name: 'MarketingBuilder.js', size: '~19 KB', desc: 'Marketing page builder (code-split)' },
          ].map(b => (
            <div key={b.name} className="flex items-center gap-3 p-2 rounded-lg bg-forge-bg/50 border border-forge-border/50">
              <div>
                <div className="text-[11px] font-mono text-forge-text-primary">{b.name}</div>
                <div className="text-[9px] text-forge-text-muted">{b.desc}</div>
              </div>
              <span className="text-[10px] font-mono text-forge-text-muted ml-auto">{b.size}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Zustand Pattern Warning" accent="#EF4444">
        <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/20">
          <div className="text-xs font-semibold text-red-400 mb-1">Infinite Re-render Prevention</div>
          <p className="text-[11px] text-forge-text-secondary leading-relaxed">
            Zustand v5 + useSyncExternalStore causes infinite re-renders when selectors return new object
            references (e.g., <code className="text-red-400">.filter()</code>, <code className="text-red-400">.map()</code>).
            Always use <code className="text-green-400">useMemo</code> to cache derived data from store selectors.
            Get the raw array from store, then filter in useMemo.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── Reusable Visual Components ───

function Card({ title, accent, children }) {
  return (
    <div className="rounded-xl border border-forge-border bg-forge-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-forge-border/50 flex items-center gap-2">
        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-xs font-mono font-bold text-forge-text-primary">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FlowDiagram({ steps, vertical = false }) {
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'items-center'} gap-1`}>
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div className={`flex ${vertical ? 'items-center gap-3' : 'flex-col items-center'} ${vertical ? '' : 'flex-1'}`}>
            <div
              className={`${vertical ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center text-sm border flex-shrink-0`}
              style={{ backgroundColor: `${step.color}15`, borderColor: `${step.color}30`, color: step.color }}
            >
              {step.icon}
            </div>
            <div className={vertical ? '' : 'text-center mt-1'}>
              <div className="text-[10px] font-semibold text-forge-text-primary">{step.label}</div>
              <div className="text-[9px] text-forge-text-muted">{step.desc}</div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className={`${vertical ? 'ml-[15px] h-4 w-0.5' : 'w-4 h-0.5 flex-shrink-0'} rounded-full bg-forge-border`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function LifecycleDiagram({ steps }) {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div className="flex-1 min-w-[120px] relative">
            <div
              className="h-1.5 rounded-full"
              style={{ backgroundColor: step.color }}
            />
            <div className="mt-2 px-1">
              <div className="flex items-center gap-1">
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${step.color}20`, color: step.color }}
                >
                  {step.status}
                </span>
              </div>
              <div className="text-[10px] font-semibold text-forge-text-primary mt-1">{step.label}</div>
              <div className="text-[9px] text-forge-text-muted mt-0.5">{step.desc}</div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-start pt-[3px]">
              <span className="text-[10px] text-forge-text-muted">{'\u25B6'}</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Pillar({ icon, title, desc, color }) {
  return (
    <div className="p-4 rounded-xl border border-forge-border bg-forge-bg/30 text-center">
      <div
        className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-xl mb-3"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="text-xs font-semibold text-forge-text-primary mb-1">{title}</div>
      <div className="text-[10px] text-forge-text-muted leading-relaxed">{desc}</div>
    </div>
  );
}

function TriggerRow({ num, title, desc, path, color }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-forge-bg/30 border border-forge-border/30">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
        style={{ backgroundColor: color }}
      >
        {num}
      </div>
      <div className="flex-1">
        <div className="text-xs font-semibold text-forge-text-primary">{title}</div>
        <div className="text-[10px] text-forge-text-secondary mt-0.5">{desc}</div>
        <div className="text-[9px] text-forge-text-muted mt-1 font-mono">{path}</div>
      </div>
    </div>
  );
}

function ArchLayer({ name, color, items, last = false }) {
  return (
    <div className={`${last ? '' : 'border-b border-forge-border/30'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-2 h-full min-h-[40px] rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1">
          <div className="text-xs font-semibold" style={{ color }}>{name}</div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {items.map(item => (
              <span key={item} className="text-[9px] px-1.5 py-0.5 rounded bg-forge-bg/50 border border-forge-border/30 text-forge-text-muted">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataFlowBox({ title, icon, color, items }) {
  return (
    <div className="rounded-lg border border-forge-border overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: `${color}10` }}>
        <span>{icon}</span>
        <span className="text-[11px] font-semibold" style={{ color }}>{title}</span>
      </div>
      <div className="p-3 space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[9px] w-4 h-4 rounded-full flex items-center justify-center bg-forge-bg border border-forge-border text-forge-text-muted font-mono">
              {i + 1}
            </span>
            <span className="text-[10px] text-forge-text-secondary">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
