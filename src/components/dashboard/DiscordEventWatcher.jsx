// DiscordEventWatcher — always-mounted headless component that fires Discord hooks
// Extracted from DiscordChat so hooks work regardless of active tab
import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { processDiscordEvent } from '../../utils/discordChatEngine';
import { runDailyGeneration, hasGeneratedToday } from '../../utils/ideaEngine';

export default function DiscordEventWatcher() {
  const agents = useStore(s => s.agents);
  const discordChatEnabled = useStore(s => s.discordChatEnabled);
  const recommendations = useStore(s => s.recommendations);
  const implementationSessions = useStore(s => s.implementationSessions);
  const activityLog = useStore(s => s.activityLog);
  const projects = useStore(s => s.projects);
  const addIdea = useStore(s => s.addIdea);
  const ideas = useStore(s => s.ideas);

  const prevRecsRef = useRef(recommendations.length);
  const prevSessionsRef = useRef(JSON.stringify(implementationSessions.map(s => s.id + s.status)));
  const prevActivityRef = useRef(activityLog.length);

  // Daily idea generation trigger
  useEffect(() => {
    if (!discordChatEnabled) return;
    if (hasGeneratedToday()) return;

    const timer = setTimeout(() => {
      const chatTrigger = (eventType, payload) => {
        processDiscordEvent(eventType, payload, agents);
      };
      runDailyGeneration(projects, agents, activityLog, recommendations, addIdea, chatTrigger);
    }, 30000);

    return () => clearTimeout(timer);
  }, [discordChatEnabled]);

  // Recommendation events
  useEffect(() => {
    if (!discordChatEnabled) return;
    if (recommendations.length > prevRecsRef.current) {
      const newRec = recommendations[0];
      if (newRec) {
        const agentId = agents.find(a => a.name === newRec.agent)?.id;
        processDiscordEvent('rec-created', {
          agentId,
          agentName: newRec.agent,
          recTitle: newRec.title,
          projectSlug: newRec.project,
          projectName: newRec.project,
        }, agents);
      }
    }
    prevRecsRef.current = recommendations.length;
  }, [recommendations.length, discordChatEnabled]);

  // Implementation session events
  useEffect(() => {
    if (!discordChatEnabled) return;
    const currentKey = JSON.stringify(implementationSessions.map(s => s.id + s.status));
    if (currentKey === prevSessionsRef.current) return;

    const prevIds = new Set(JSON.parse(prevSessionsRef.current || '[]'));
    for (const session of implementationSessions) {
      const key = session.id + session.status;
      if (!prevIds.has(key)) {
        if (session.status === 'running' && session.type !== 'agent-session') {
          processDiscordEvent('impl-started', {
            recTitle: session.recTitle || session.label,
            projectSlug: session.projectSlug,
            projectName: session.projectSlug,
          }, agents);
        } else if (session.status === 'finished' || session.status === 'exited') {
          processDiscordEvent('impl-finished', {
            recTitle: session.recTitle || session.label,
            projectSlug: session.projectSlug,
            projectName: session.projectSlug,
            exitCode: session.exitCode,
          }, agents);
        }
      }
    }
    prevSessionsRef.current = currentKey;
  }, [implementationSessions, discordChatEnabled]);

  // Activity log events
  useEffect(() => {
    if (!discordChatEnabled) return;
    if (activityLog.length > prevActivityRef.current && activityLog.length > 0) {
      const latest = activityLog[0];
      const agentId = agents.find(a => a.name === latest.agent)?.id;
      if (agentId) {
        processDiscordEvent('activity-logged', {
          agentId,
          agentName: latest.agent,
          projectSlug: latest.project,
          projectName: latest.project,
        }, agents);
      }
    }
    prevActivityRef.current = activityLog.length;
  }, [activityLog.length, discordChatEnabled]);

  // Git change events
  useEffect(() => {
    if (!discordChatEnabled) return;
    if (!window.electronAPI?.automation) return;

    const cleanup = window.electronAPI.automation.onGitChange((data) => {
      processDiscordEvent('git-change', {
        projectSlug: data.slug,
        projectName: data.slug,
        fileCount: data.numstat?.split('\n').filter(Boolean).length || 0,
      }, agents);
    });

    return cleanup;
  }, [discordChatEnabled]);

  return null; // headless — no UI
}
