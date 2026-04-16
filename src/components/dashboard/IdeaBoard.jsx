import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { processDiscordEvent } from '../../utils/discordChatEngine';
import { playSound } from '../../utils/sounds';
import IdeaCard from './ideas/IdeaCard';

export default function IdeaBoard({ projectFilter: externalProjectFilter }) {
  const ideas = useStore(s => s.ideas);
  const projects = useStore(s => s.projects);
  const agents = useStore(s => s.agents);
  const addIdea = useStore(s => s.addIdea);
  const updateIdea = useStore(s => s.updateIdea);
  const dismissIdea = useStore(s => s.dismissIdea);
  const loadIdeas = useStore(s => s.loadIdeas);
  const startAgentSession = useStore(s => s.startAgentSession);
  const chatEnabled = useStore(s => s.discordChatEnabled);

  const triggerChat = (eventType, payload) => {
    if (!chatEnabled) return;
    processDiscordEvent(eventType, payload, agents);
  };

  const [inputText, setInputText] = useState('');
  const [projectSelect, setProjectSelect] = useState(externalProjectFilter || projects[0]?.slug || '');

  useEffect(() => {
    loadIdeas();
  }, []);

  useEffect(() => {
    if (externalProjectFilter) setProjectSelect(externalProjectFilter);
  }, [externalProjectFilter]);

  // Filter by project
  const filteredIdeas = useMemo(() => {
    const filter = externalProjectFilter || projectSelect;
    if (!filter || filter === 'all') return ideas;
    return ideas.filter(i => i.project === filter);
  }, [ideas, externalProjectFilter, projectSelect]);

  // Bucket into columns
  const activeIdeas = useMemo(
    () => filteredIdeas.filter(i => i.status === 'active' || i.status === 'analyzing'),
    [filteredIdeas]
  );
  const analyzedIdeas = useMemo(
    () => filteredIdeas.filter(i => i.status === 'analyzed'),
    [filteredIdeas]
  );
  const promotedIdeas = useMemo(
    () => filteredIdeas.filter(i => i.status === 'promoted'),
    [filteredIdeas]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const project = externalProjectFilter || projectSelect;
    if (!project) return;

    const idea = {
      id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: inputText.trim(),
      source: 'boss',
      agentId: null,
      agentName: null,
      agentColor: null,
      project,
      status: 'active',
      createdAt: new Date().toISOString(),
      analysis: null,
      recommendation: null,
    };

    addIdea(idea);
    setInputText('');
    playSound('idea-new');

    // Trigger team chat — boss dropped an idea
    const projectName = projects.find(p => p.slug === project)?.name || project;
    triggerChat('boss-idea', {
      projectSlug: project,
      projectName,
      ideaText: idea.text,
    });
  };

  const handleAnalyze = (idea) => {
    // Mark as analyzing (reset if re-analyzing)
    updateIdea(idea.id, { status: 'analyzing', analysis: null });

    // Find the project
    const project = projects.find(p => p.slug === idea.project);
    if (!project) return;

    // Create a special analysis agent session
    const leadAgent = agents.find(a => a.id === 'solutions-architect') || agents[0];
    if (!leadAgent) return;

    const analysisPrompt = [
      `You are the full Forge team. All 14 agents are evaluating this idea.`,
      ``,
      `IDEA: "${idea.text}"`,
      `PROJECT: ${project.name} (${project.slug})`,
      ``,
      `Read the project context at hq-data/projects/${project.slug}/context.md`,
      `Explore the actual project codebase at ${project.repoPath} to ground your analysis.`,
      ``,
      `For each of the 13 agents, provide a score (1-10) and a one-line insight.`,
      `Then provide an overall score (average) and a 2-sentence verdict.`,
      ``,
      `Write the analysis results to the idea file. Update the "analysis" field in the idea JSON at:`,
      `hq-data/${idea._filePath || `projects/${idea.project}/ideas/`}`,
      ``,
      `Format: { "overallScore": N, "verdict": "...", "agents": [{ "agentId": "...", "score": N, "insight": "..." }], "analyzedAt": "ISO-8601" }`,
      `Also update "status" to "analyzed".`,
      ``,
      `If the overall score is 7 or above, also generate a full recommendation JSON`,
      `to hq-data/projects/${project.slug}/recommendations/ following the standard format.`,
    ].join('\n');

    // Store prompt in session — Terminal.jsx creates PTY after xterm is ready
    startAgentSession(
      { ...leadAgent, name: 'Team Analysis' },
      project,
      { prompt: analysisPrompt, cwd: window.forgePaths?.forgeRoot || '', mode: 'auto', flags: '' }
    );

    playSound('spawn');
  };

  const handleDismiss = (idea) => {
    dismissIdea(idea.id);
    playSound('dismiss');

    // Trigger team chat — idea dismissed
    const projectName = projects.find(p => p.slug === idea.project)?.name || idea.project;
    triggerChat('idea-dismissed', {
      agentId: idea.agentId,
      agentName: idea.agentName,
      projectSlug: idea.project,
      projectName,
      ideaText: idea.text,
    });
  };

  const handlePromote = (idea) => {
    updateIdea(idea.id, { status: 'promoted' });
    playSound('brave');

    // Trigger team chat — idea promoted!
    const projectName = projects.find(p => p.slug === idea.project)?.name || idea.project;
    triggerChat('idea-promoted', {
      agentId: idea.agentId,
      agentName: idea.agentName,
      projectSlug: idea.project,
      projectName,
      ideaText: idea.text,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{'\u{1F4A1}'}</span>
          <h2 className="text-sm font-mono font-bold text-forge-text-primary">Idea Board</h2>
          <span className="text-[10px] text-forge-text-muted">
            {filteredIdeas.length} ideas
          </span>
        </div>

        {/* Project selector (only in studio-wide view) */}
        {!externalProjectFilter && (
          <select
            value={projectSelect}
            onChange={(e) => setProjectSelect(e.target.value)}
            className="text-[10px] bg-forge-bg border border-forge-border rounded px-2 py-1 text-forge-text-secondary
                       focus:outline-none focus:border-forge-accent/30"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Boss Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Drop an idea..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-forge-bg border border-forge-border text-forge-text-primary
                       placeholder-forge-text-muted focus:outline-none focus:border-yellow-400/40
                       focus:ring-1 focus:ring-yellow-400/20"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <span className="text-[9px] text-yellow-400/60">{'\u2605'} Boss</span>
          </div>
        </div>
        {!externalProjectFilter && (
          <select
            value={projectSelect}
            onChange={(e) => setProjectSelect(e.target.value)}
            className="text-[10px] bg-forge-bg border border-forge-border rounded px-2 py-2 text-forge-text-secondary
                       focus:outline-none focus:border-forge-accent/30"
          >
            {projects.map(p => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-yellow-400/10 text-yellow-400 border border-yellow-400/20
                     hover:bg-yellow-400/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Post
        </button>
      </form>

      {/* Kanban Columns */}
      <div className="grid grid-cols-3 gap-4">
        {/* Active */}
        <IdeaColumn
          title="Active"
          icon={'\u{1F525}'}
          count={activeIdeas.length}
          color="#F97316"
        >
          {activeIdeas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onAnalyze={handleAnalyze}
              onDismiss={handleDismiss}
            />
          ))}
          {activeIdeas.length === 0 && (
            <EmptyColumn text="No active ideas. Drop one above or wait for your agents." />
          )}
        </IdeaColumn>

        {/* Analyzed */}
        <IdeaColumn
          title="Analyzed"
          icon={'\u{1F50D}'}
          count={analyzedIdeas.length}
          color="#3B82F6"
        >
          {analyzedIdeas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onDismiss={handleDismiss}
              onPromote={handlePromote}
            />
          ))}
          {analyzedIdeas.length === 0 && (
            <EmptyColumn text="Analyzed ideas appear here. Click Analyze on an active idea." />
          )}
        </IdeaColumn>

        {/* Promoted (Trophy Wall) */}
        <IdeaColumn
          title="Promoted"
          icon={'\u{1F3C6}'}
          count={promotedIdeas.length}
          color="#22C55E"
        >
          {promotedIdeas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              compact={true}
            />
          ))}
          {promotedIdeas.length === 0 && (
            <EmptyColumn text="Ideas that become recommendations live here." />
          )}
        </IdeaColumn>
      </div>
    </div>
  );
}

function IdeaColumn({ title, icon, count, color, children }) {
  return (
    <div className="rounded-xl border border-forge-border bg-forge-surface overflow-hidden">
      <div className="px-3 py-2 border-b border-forge-border/50 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-mono font-semibold text-forge-text-primary">{title}</span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {count}
        </span>
      </div>
      <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

function EmptyColumn({ text }) {
  return (
    <div className="text-center py-6">
      <div className="text-[10px] text-forge-text-muted">{text}</div>
    </div>
  );
}
