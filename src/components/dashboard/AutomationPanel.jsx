import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { playSound } from '../../utils/sounds';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const FREQUENCIES = [
  { id: 'daily', label: 'Daily', desc: 'Every day' },
  { id: 'weekly', label: 'Weekly', desc: 'Every Monday' },
  { id: 'biweekly', label: 'Bi-weekly', desc: 'Every other Monday' },
  { id: 'monthly', label: 'Monthly', desc: '1st of each month' },
  { id: 'on-phase-change', label: 'Phase Change', desc: 'When project enters new phase' },
  { id: 'on-milestone', label: 'Milestone', desc: 'When progress hits 25/50/75/100%' },
];

const CHAIN_EVENTS = [
  { id: 'rec-created', label: 'New Recommendation', desc: 'When any agent creates a recommendation' },
  { id: 'rec-implemented', label: 'Rec Implemented', desc: 'When a recommendation is auto-implemented' },
  { id: 'rec-resolved', label: 'Rec Resolved', desc: 'When a recommendation is manually resolved' },
];

const TRIGGER_EVENTS = [
  { id: 'git-push', label: 'Git Push', desc: 'When code is pushed to a game repo' },
  { id: 'file-changed', label: 'File Changed', desc: 'When a specific file type changes' },
  { id: 'build-complete', label: 'Build Complete', desc: 'When a build/export finishes' },
  { id: 'new-competitor', label: 'New Competitor', desc: 'When competitor data is updated' },
];

const TRIGGER_CONDITIONS = [
  { id: 'always', label: 'Always' },
  { id: 'knowledgeWorthy', label: 'Knowledge-worthy changes only' },
  { id: 'significant', label: 'Significant changes only' },
];

const TYPE_BADGES = {
  schedule: { label: 'SCHED', color: '#EAB308' },
  chain: { label: 'CHAIN', color: '#8B5CF6' },
  trigger: { label: 'TRIG', color: '#F97316' },
};

export default function AutomationPanel() {
  const agents = useStore((s) => s.agents);
  const projects = useStore((s) => s.projects);
  const automationSchedules = useStore((s) => s.automationSchedules);
  const agentChains = useStore((s) => s.agentChains);
  const eventTriggers = useStore((s) => s.eventTriggers);
  const automationExecutionLog = useStore((s) => s.automationExecutionLog);
  const addSchedule = useStore((s) => s.addSchedule);
  const removeSchedule = useStore((s) => s.removeSchedule);
  const toggleSchedule = useStore((s) => s.toggleSchedule);
  const updateSchedule = useStore((s) => s.updateSchedule);
  const addChain = useStore((s) => s.addChain);
  const removeChain = useStore((s) => s.removeChain);
  const updateChain = useStore((s) => s.updateChain);
  const addTrigger = useStore((s) => s.addTrigger);
  const removeTrigger = useStore((s) => s.removeTrigger);
  const updateTrigger = useStore((s) => s.updateTrigger);
  const startAutomationTask = useStore((s) => s.startAutomationTask);

  const [activeTab, setActiveTab] = useState('schedules');

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-forge-border pb-2">
        {['schedules', 'chains', 'triggers', 'log'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-forge-surface text-forge-accent border-b-2 border-forge-accent'
                : 'text-forge-text-muted hover:text-forge-text-secondary'
            }`}
          >
            {tab === 'schedules' ? '\u23F0 Schedules'
              : tab === 'chains' ? '\u26D3 Chains'
              : tab === 'triggers' ? '\u26A1 Triggers'
              : '\u{1F4CB} Log'}
            <span className="ml-1.5 text-xs text-forge-text-muted">
              ({tab === 'schedules' ? automationSchedules.length
                : tab === 'chains' ? agentChains.length
                : tab === 'triggers' ? eventTriggers.length
                : automationExecutionLog.length})
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'schedules' && (
        <SchedulesTab
          schedules={automationSchedules}
          agents={agents}
          projects={projects}
          onAdd={addSchedule}
          onRemove={removeSchedule}
          onToggle={toggleSchedule}
          onUpdate={updateSchedule}
          onRunNow={startAutomationTask}
        />
      )}

      {activeTab === 'chains' && (
        <ChainsTab
          chains={agentChains}
          agents={agents}
          projects={projects}
          onAdd={addChain}
          onRemove={removeChain}
          onUpdate={updateChain}
          onRunNow={startAutomationTask}
        />
      )}

      {activeTab === 'triggers' && (
        <TriggersTab
          triggers={eventTriggers}
          agents={agents}
          projects={projects}
          onAdd={addTrigger}
          onRemove={removeTrigger}
          onUpdate={updateTrigger}
          onRunNow={startAutomationTask}
        />
      )}

      {activeTab === 'log' && (
        <ExecutionLogTab log={automationExecutionLog} />
      )}
    </div>
  );
}

function DefaultBadge() {
  return (
    <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider rounded bg-forge-accent/15 text-forge-accent">
      DEFAULT
    </span>
  );
}

function SchedulesTab({ schedules, agents, projects, onAdd, onRemove, onToggle, onUpdate, onRunNow }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [formData, setFormData] = useState({ agent: '', project: 'all', frequency: 'weekly', action: '' });

  const handleAdd = () => {
    if (!formData.agent || !formData.action) return;
    const agent = agents.find(a => a.id === formData.agent);
    onAdd({
      id: `sched-${Date.now()}`,
      agentId: formData.agent,
      agentName: agent?.name || formData.agent,
      agentColor: agent?.color || '#666',
      project: formData.project,
      frequency: formData.frequency,
      action: formData.action,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    playSound('copy');
    setShowForm(false);
    setFormData({ agent: '', project: 'all', frequency: 'weekly', action: '' });
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditData({ agent: s.agentId, project: s.project || 'all', frequency: s.frequency, action: s.action });
  };

  const saveEdit = (id) => {
    const agent = agents.find(a => a.id === editData.agent);
    onUpdate(id, {
      agentId: editData.agent,
      agentName: agent?.name || editData.agent,
      agentColor: agent?.color || '#666',
      project: editData.project,
      frequency: editData.frequency,
      action: editData.action,
    });
    playSound('copy');
    setEditingId(null);
  };

  const handleRunNow = (s) => {
    onRunNow(s.agentId, s.agentName, s.project === 'all' ? projects[0]?.slug : s.project, s.action);
    playSound('copy');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-forge-text-muted">
          Schedule agents to run automatically at set intervals
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors"
        >
          + Add Schedule
        </button>
      </div>

      {showForm && (
        <div className="card !bg-forge-bg/80 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Agent</label>
              <select value={formData.agent} onChange={(e) => setFormData({ ...formData, agent: e.target.value })} className="input-field text-xs">
                <option value="">Select agent...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Project</label>
              <select value={formData.project} onChange={(e) => setFormData({ ...formData, project: e.target.value })} className="input-field text-xs">
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Frequency</label>
              <select value={formData.frequency} onChange={(e) => setFormData({ ...formData, frequency: e.target.value })} className="input-field text-xs">
                {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label} — {f.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Action / Prompt</label>
              <input type="text" value={formData.action} onChange={(e) => setFormData({ ...formData, action: e.target.value })} placeholder="e.g. Run competitive analysis" className="input-field text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-forge-text-muted hover:text-forge-text-secondary">Cancel</button>
            <button onClick={handleAdd} className="btn-primary !text-xs !py-1.5">Create Schedule</button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-sm text-forge-text-muted">No schedules configured yet</p>
          <p className="text-xs text-forge-text-muted/60 mt-1">Schedule agents to run automatically</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => editingId === s.id ? (
            <div key={s.id} className="card !bg-forge-bg/80 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Agent</label>
                  <select value={editData.agent} onChange={(e) => setEditData({ ...editData, agent: e.target.value })} className="input-field text-xs">
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Project</label>
                  <select value={editData.project} onChange={(e) => setEditData({ ...editData, project: e.target.value })} className="input-field text-xs">
                    <option value="all">All Projects</option>
                    {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Frequency</label>
                  <select value={editData.frequency} onChange={(e) => setEditData({ ...editData, frequency: e.target.value })} className="input-field text-xs">
                    {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label} — {f.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Action / Prompt</label>
                  <input type="text" value={editData.action} onChange={(e) => setEditData({ ...editData, action: e.target.value })} className="input-field text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setEditingId(null)} className="text-xs text-forge-text-muted hover:text-forge-text-secondary">Cancel</button>
                <button onClick={() => saveEdit(s.id)} className="btn-primary !text-xs !py-1.5">Save</button>
              </div>
            </div>
          ) : (
            <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              s.enabled ? 'bg-forge-bg/50 border-forge-border' : 'bg-forge-bg/20 border-forge-border/30 opacity-50'
            }`}>
              <button
                onClick={() => onToggle(s.id)}
                className={`w-8 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                  s.enabled ? 'bg-green-400' : 'bg-forge-border'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  s.enabled ? 'left-3.5' : 'left-0.5'
                }`} />
              </button>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.agentColor }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: s.agentColor }}>{s.agentName}</span>
                  <span className="text-xs text-forge-text-muted">{FREQUENCIES.find(f => f.id === s.frequency)?.label || s.frequency}</span>
                  {s.project !== 'all' && <span className="text-xs text-forge-text-muted/60">{s.project}</span>}
                  {s.isDefault && <DefaultBadge />}
                </div>
                <p className="text-xs text-forge-text-secondary truncate">{s.action}</p>
              </div>
              <button
                onClick={() => handleRunNow(s)}
                className="px-2 py-1 text-[10px] font-medium rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                title="Run this schedule now"
              >
                Run Now
              </button>
              <button
                onClick={() => startEdit(s)}
                className="text-forge-text-muted hover:text-forge-accent transition-colors text-sm"
                title="Edit schedule"
              >
                {'\u270E'}
              </button>
              <button
                onClick={() => { onRemove(s.id); playSound('dismiss'); }}
                className="text-forge-text-muted hover:text-red-400 transition-colors text-sm"
              >
                {'\u2715'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChainsTab({ chains, agents, projects, onAdd, onRemove, onUpdate, onRunNow }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [formData, setFormData] = useState({ sourceAgent: '', targetAgent: '', event: 'rec-created', action: '' });

  const handleAdd = () => {
    if (!formData.sourceAgent || !formData.targetAgent || !formData.action) return;
    const isAny = formData.sourceAgent === 'any';
    const source = isAny ? null : agents.find(a => a.id === formData.sourceAgent);
    const target = agents.find(a => a.id === formData.targetAgent);
    onAdd({
      id: `chain-${Date.now()}`,
      sourceAgentId: formData.sourceAgent,
      sourceAgentName: isAny ? 'Any Agent' : (source?.name || formData.sourceAgent),
      sourceAgentColor: isAny ? '#666' : (source?.color || '#666'),
      targetAgentId: formData.targetAgent,
      targetAgentName: target?.name || formData.targetAgent,
      targetAgentColor: target?.color || '#666',
      event: formData.event,
      action: formData.action,
      createdAt: new Date().toISOString(),
    });
    playSound('copy');
    setShowForm(false);
    setFormData({ sourceAgent: '', targetAgent: '', event: 'rec-created', action: '' });
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditData({ sourceAgent: c.sourceAgentId, targetAgent: c.targetAgentId, event: c.event, action: c.action });
  };

  const saveEdit = (id) => {
    const isAny = editData.sourceAgent === 'any';
    const source = isAny ? null : agents.find(a => a.id === editData.sourceAgent);
    const target = agents.find(a => a.id === editData.targetAgent);
    onUpdate(id, {
      sourceAgentId: editData.sourceAgent,
      sourceAgentName: isAny ? 'Any Agent' : (source?.name || editData.sourceAgent),
      sourceAgentColor: isAny ? '#666' : (source?.color || '#666'),
      targetAgentId: editData.targetAgent,
      targetAgentName: target?.name || editData.targetAgent,
      targetAgentColor: target?.color || '#666',
      event: editData.event,
      action: editData.action,
    });
    playSound('copy');
    setEditingId(null);
  };

  const handleRunNow = (c) => {
    const proj = projects?.[0]?.slug || 'expedition';
    onRunNow(c.targetAgentId, c.targetAgentName, proj, c.action);
    playSound('copy');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-forge-text-muted">
          Chain agents together — one agent's output triggers another
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors"
        >
          + Add Chain
        </button>
      </div>

      {showForm && (
        <div className="card !bg-forge-bg/80 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">When this agent</label>
              <select value={formData.sourceAgent} onChange={(e) => setFormData({ ...formData, sourceAgent: e.target.value })} className="input-field text-xs">
                <option value="">Select source...</option>
                <option value="any">Any Agent</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Does this</label>
              <select value={formData.event} onChange={(e) => setFormData({ ...formData, event: e.target.value })} className="input-field text-xs">
                {CHAIN_EVENTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Then trigger</label>
              <select value={formData.targetAgent} onChange={(e) => setFormData({ ...formData, targetAgent: e.target.value })} className="input-field text-xs">
                <option value="">Select target...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">To do this</label>
              <input type="text" value={formData.action} onChange={(e) => setFormData({ ...formData, action: e.target.value })} placeholder="e.g. Evaluate retention impact" className="input-field text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-forge-text-muted">Cancel</button>
            <button onClick={handleAdd} className="btn-primary !text-xs !py-1.5">Create Chain</button>
          </div>
        </div>
      )}

      {chains.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-sm text-forge-text-muted">No agent chains configured</p>
          <p className="text-xs text-forge-text-muted/60 mt-1">Connect agents so one triggers another</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chains.map(c => editingId === c.id ? (
            <div key={c.id} className="card !bg-forge-bg/80 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">When this agent</label>
                  <select value={editData.sourceAgent} onChange={(e) => setEditData({ ...editData, sourceAgent: e.target.value })} className="input-field text-xs">
                    <option value="any">Any Agent</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Does this</label>
                  <select value={editData.event} onChange={(e) => setEditData({ ...editData, event: e.target.value })} className="input-field text-xs">
                    {CHAIN_EVENTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Then trigger</label>
                  <select value={editData.targetAgent} onChange={(e) => setEditData({ ...editData, targetAgent: e.target.value })} className="input-field text-xs">
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">To do this</label>
                  <input type="text" value={editData.action} onChange={(e) => setEditData({ ...editData, action: e.target.value })} className="input-field text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setEditingId(null)} className="text-xs text-forge-text-muted">Cancel</button>
                <button onClick={() => saveEdit(c.id)} className="btn-primary !text-xs !py-1.5">Save</button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-2 p-3 rounded-lg bg-forge-bg/50 border border-forge-border">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.sourceAgentColor }} />
              <span className="text-sm font-medium" style={{ color: c.sourceAgentColor }}>{c.sourceAgentName}</span>
              <span className="text-xs text-forge-text-muted">{CHAIN_EVENTS.find(e => e.id === c.event)?.label}</span>
              <span className="text-forge-accent">{'\u2192'}</span>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.targetAgentColor }} />
              <span className="text-sm font-medium" style={{ color: c.targetAgentColor }}>{c.targetAgentName}</span>
              <span className="text-xs text-forge-text-secondary truncate flex-1">{c.action}</span>
              {c.isDefault && <DefaultBadge />}
              <button
                onClick={() => handleRunNow(c)}
                className="px-2 py-1 text-[10px] font-medium rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                title="Run target agent now"
              >
                Run Now
              </button>
              <button
                onClick={() => startEdit(c)}
                className="text-forge-text-muted hover:text-forge-accent transition-colors text-sm"
                title="Edit chain"
              >
                {'\u270E'}
              </button>
              <button onClick={() => { onRemove(c.id); playSound('dismiss'); }} className="text-forge-text-muted hover:text-red-400 text-sm">{'\u2715'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TriggersTab({ triggers, agents, projects, onAdd, onRemove, onUpdate, onRunNow }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [formData, setFormData] = useState({ event: 'git-push', agent: '', project: 'all', action: '', condition: 'always' });

  const handleAdd = () => {
    if (!formData.agent || !formData.action) return;
    const agent = agents.find(a => a.id === formData.agent);
    onAdd({
      id: `trigger-${Date.now()}`,
      event: formData.event,
      condition: formData.condition !== 'always' ? formData.condition : undefined,
      agentId: formData.agent,
      agentName: agent?.name || formData.agent,
      agentColor: agent?.color || '#666',
      project: formData.project,
      action: formData.action,
      createdAt: new Date().toISOString(),
    });
    playSound('copy');
    setShowForm(false);
    setFormData({ event: 'git-push', agent: '', project: 'all', action: '', condition: 'always' });
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditData({ event: t.event, agent: t.agentId, project: t.project || 'all', action: t.action, condition: t.condition || 'always' });
  };

  const saveEdit = (id) => {
    const agent = agents.find(a => a.id === editData.agent);
    onUpdate(id, {
      event: editData.event,
      condition: editData.condition !== 'always' ? editData.condition : undefined,
      agentId: editData.agent,
      agentName: agent?.name || editData.agent,
      agentColor: agent?.color || '#666',
      project: editData.project,
      action: editData.action,
    });
    playSound('copy');
    setEditingId(null);
  };

  const handleRunNow = (t) => {
    const proj = t.project === 'all' ? (projects?.[0]?.slug || 'expedition') : t.project;
    onRunNow(t.agentId, t.agentName, proj, t.action);
    playSound('copy');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-forge-text-muted">
          Trigger agents based on real-world events
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-forge-accent/10 text-forge-accent border border-forge-accent/20 hover:bg-forge-accent/20 transition-colors"
        >
          + Add Trigger
        </button>
      </div>

      {showForm && (
        <div className="card !bg-forge-bg/80 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">When this happens</label>
              <select value={formData.event} onChange={(e) => setFormData({ ...formData, event: e.target.value })} className="input-field text-xs">
                {TRIGGER_EVENTS.map(e => <option key={e.id} value={e.id}>{e.label} — {e.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Condition</label>
              <select value={formData.condition} onChange={(e) => setFormData({ ...formData, condition: e.target.value })} className="input-field text-xs">
                {TRIGGER_CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Run this agent</label>
              <select value={formData.agent} onChange={(e) => setFormData({ ...formData, agent: e.target.value })} className="input-field text-xs">
                <option value="">Select agent...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">For project</label>
              <select value={formData.project} onChange={(e) => setFormData({ ...formData, project: e.target.value })} className="input-field text-xs">
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">With action</label>
              <input type="text" value={formData.action} onChange={(e) => setFormData({ ...formData, action: e.target.value })} placeholder="e.g. Run launch readiness check" className="input-field text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-forge-text-muted">Cancel</button>
            <button onClick={handleAdd} className="btn-primary !text-xs !py-1.5">Create Trigger</button>
          </div>
        </div>
      )}

      {triggers.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-sm text-forge-text-muted">No event triggers configured</p>
          <p className="text-xs text-forge-text-muted/60 mt-1">React to real events like git pushes or builds</p>
        </div>
      ) : (
        <div className="space-y-2">
          {triggers.map(t => editingId === t.id ? (
            <div key={t.id} className="card !bg-forge-bg/80 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">When this happens</label>
                  <select value={editData.event} onChange={(e) => setEditData({ ...editData, event: e.target.value })} className="input-field text-xs">
                    {TRIGGER_EVENTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Condition</label>
                  <select value={editData.condition} onChange={(e) => setEditData({ ...editData, condition: e.target.value })} className="input-field text-xs">
                    {TRIGGER_CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">Run this agent</label>
                  <select value={editData.agent} onChange={(e) => setEditData({ ...editData, agent: e.target.value })} className="input-field text-xs">
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">For project</label>
                  <select value={editData.project} onChange={(e) => setEditData({ ...editData, project: e.target.value })} className="input-field text-xs">
                    <option value="all">All Projects</option>
                    {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-forge-text-muted uppercase mb-1 block">With action</label>
                  <input type="text" value={editData.action} onChange={(e) => setEditData({ ...editData, action: e.target.value })} className="input-field text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setEditingId(null)} className="text-xs text-forge-text-muted">Cancel</button>
                <button onClick={() => saveEdit(t.id)} className="btn-primary !text-xs !py-1.5">Save</button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="flex items-center gap-2 p-3 rounded-lg bg-forge-bg/50 border border-forge-border">
              <span className="text-sm">{'\u26A1'}</span>
              <span className="text-xs text-forge-text-muted">{TRIGGER_EVENTS.find(e => e.id === t.event)?.label}</span>
              {t.condition && (
                <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-forge-surface-hover text-forge-text-muted">
                  {TRIGGER_CONDITIONS.find(c => c.id === t.condition)?.label || t.condition}
                </span>
              )}
              <span className="text-forge-accent">{'\u2192'}</span>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.agentColor }} />
              <span className="text-sm font-medium" style={{ color: t.agentColor }}>{t.agentName}</span>
              {t.project !== 'all' && <span className="text-xs text-forge-text-muted/60">{t.project}</span>}
              <span className="text-xs text-forge-text-secondary truncate flex-1">{t.action}</span>
              {t.isDefault && <DefaultBadge />}
              <button
                onClick={() => handleRunNow(t)}
                className="px-2 py-1 text-[10px] font-medium rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                title="Run this trigger now"
              >
                Run Now
              </button>
              <button
                onClick={() => startEdit(t)}
                className="text-forge-text-muted hover:text-forge-accent transition-colors text-sm"
                title="Edit trigger"
              >
                {'\u270E'}
              </button>
              <button onClick={() => { onRemove(t.id); playSound('dismiss'); }} className="text-forge-text-muted hover:text-red-400 text-sm">{'\u2715'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutionLogTab({ log }) {
  if (!log || log.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-sm text-forge-text-muted">No automation executions yet</p>
        <p className="text-xs text-forge-text-muted/60 mt-1">Executions from schedules, chains, and triggers will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-forge-text-muted">
        Recent automation executions ({log.length} total)
      </p>
      {log.slice(0, 50).map((entry, i) => {
        const typeBadge = TYPE_BADGES[entry.type] || TYPE_BADGES.trigger;
        return (
          <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-forge-bg/50 border border-forge-border">
            {/* Type badge */}
            <span
              className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded"
              style={{ backgroundColor: `${typeBadge.color}20`, color: typeBadge.color }}
            >
              {typeBadge.label}
            </span>
            {/* Agent */}
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.agentColor || '#666' }} />
            <span className="text-sm font-medium" style={{ color: entry.agentColor || '#ccc' }}>
              {entry.agentName}
            </span>
            {/* Project */}
            {entry.projectSlug && (
              <span className="text-xs text-forge-text-muted">{entry.projectSlug}</span>
            )}
            {/* Action */}
            <span className="text-xs text-forge-text-secondary truncate flex-1">{entry.action}</span>
            {/* Status */}
            <span className={`text-[10px] font-mono ${
              entry.status === 'started' ? 'text-cyan-400' :
              entry.status === 'completed' ? 'text-green-400' :
              entry.status === 'failed' ? 'text-red-400' : 'text-forge-text-muted'
            }`}>
              {entry.status}
            </span>
            {/* Time */}
            <span className="text-[10px] text-forge-text-muted w-24 text-right flex-shrink-0">
              {entry.timestamp ? formatRelativeTime(entry.timestamp) : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
