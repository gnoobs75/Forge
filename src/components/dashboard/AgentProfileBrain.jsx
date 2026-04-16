import React, { useState, useEffect, useCallback } from 'react';
import { getSkillFileName } from '../../utils/agentSkillMap';
import { AGENT_DETAILS } from './AgentDetailPanel';

// Parse markdown into sections, respecting code fences
function parseSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = { title: '', lines: [] };
  let inCodeFence = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
    }
    if (!inCodeFence && line.startsWith('## ')) {
      if (current.title || current.lines.length > 0) {
        sections.push({ title: current.title, content: current.lines.join('\n').trim() });
      }
      current = { title: line.slice(3).trim(), lines: [] };
    } else if (!inCodeFence && line.startsWith('# ') && sections.length === 0 && current.lines.length === 0) {
      // Top-level title
      current.title = line.slice(2).trim();
    } else {
      current.lines.push(line);
    }
  }
  if (current.title || current.lines.length > 0) {
    sections.push({ title: current.title, content: current.lines.join('\n').trim() });
  }
  return sections;
}

// Detect section type from title
function sectionType(title) {
  const t = title.toLowerCase();
  if (t.includes('identity') || t.includes('who you are')) return 'identity';
  if (t.includes('personality')) return 'personality';
  if (t.includes('before you work') || t.includes('before you begin') || t.includes('mandatory')) return 'before-work';
  if (t.includes('capabilities') || t.includes('core capabilities') || t.includes('what you do')) return 'capabilities';
  if (t.includes('workflow') || t.includes('process') || t.includes('how you work')) return 'workflow';
  if (t.includes('output format') || t.includes('output') || t.includes('format')) return 'output';
  if (t.includes("don't") || t.includes('guardrail') || t.includes('boundaries') || t.includes('never')) return 'guardrails';
  if (t.includes('example') || t.includes('try asking')) return 'examples';
  return 'generic';
}

function SectionRenderer({ title, content, agentColor }) {
  const type = sectionType(title);

  // Parse content lines
  const lines = content.split('\n').filter(l => l.trim());

  switch (type) {
    case 'identity':
      return (
        <div className="pl-3 border-l-[3px] py-1" style={{ borderColor: agentColor }}>
          <div className="text-sm text-forge-text-primary leading-relaxed">
            {lines.map((l, i) => <p key={i} className="mb-1">{cleanLine(l)}</p>)}
          </div>
        </div>
      );

    case 'personality':
      return (
        <blockquote
          className="border-l-[3px] pl-4 py-2 text-sm text-forge-text-secondary leading-relaxed italic"
          style={{ borderColor: agentColor }}
        >
          {lines.map((l, i) => <p key={i} className="mb-1">{cleanLine(l)}</p>)}
        </blockquote>
      );

    case 'before-work':
      return (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const numbered = l.match(/^\d+\.\s+(.*)/);
            const text = numbered ? numbered[1] : cleanLine(l);
            return (
              <div key={i} className="flex gap-2.5 items-start">
                {numbered ? (
                  <span className="w-5 h-5 rounded-full bg-amber-400/15 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {numbered[0].match(/^\d+/)[0]}
                  </span>
                ) : (
                  <span className="text-amber-400/60 mt-0.5 flex-shrink-0">!</span>
                )}
                <span className="text-xs text-forge-text-secondary leading-relaxed">{text}</span>
              </div>
            );
          })}
        </div>
      );

    case 'capabilities':
      return (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const bullet = l.match(/^[-*]\s+(.*)/);
            const numbered = l.match(/^\d+\.\s+(.*)/);
            const text = bullet ? bullet[1] : numbered ? numbered[1] : cleanLine(l);
            const boldMatch = text.match(/^\*\*(.*?)\*\*[:\s]*(.*)/);
            return (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: agentColor }} />
                <div className="text-xs text-forge-text-secondary leading-relaxed">
                  {boldMatch ? (
                    <><span className="text-forge-text-primary font-semibold">{boldMatch[1]}</span> {boldMatch[2]}</>
                  ) : text}
                </div>
              </div>
            );
          })}
        </div>
      );

    case 'workflow':
      return (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const numbered = l.match(/^\d+\.\s+(.*)/);
            const text = numbered ? numbered[1] : cleanLine(l);
            return (
              <div key={i} className="flex gap-3 items-start">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: `${agentColor}15`, color: agentColor }}
                >
                  {numbered ? numbered[0].match(/^\d+/)[0] : i + 1}
                </div>
                <div className="text-xs text-forge-text-secondary leading-relaxed pt-0.5">{text}</div>
              </div>
            );
          })}
        </div>
      );

    case 'output':
      return (
        <div className="rounded-lg bg-[#0d1117] border border-forge-border/50 p-3 overflow-x-auto">
          <pre className="text-[11px] font-mono text-forge-text-secondary leading-relaxed whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      );

    case 'guardrails':
      return (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const bullet = l.match(/^[-*]\s+(.*)/);
            const text = bullet ? bullet[1] : cleanLine(l);
            return (
              <div key={i} className="flex gap-2.5 items-start">
                <span className="text-red-400/60 text-xs mt-0.5 flex-shrink-0">&times;</span>
                <div className="text-xs text-forge-text-muted leading-relaxed">{text}</div>
              </div>
            );
          })}
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          {lines.map((l, i) => {
            const bullet = l.match(/^[-*]\s+(.*)/);
            const text = bullet ? bullet[1] : cleanLine(l);
            return (
              <div key={i} className="flex gap-2 items-start">
                {bullet && <span className="text-forge-text-muted mt-1 flex-shrink-0 text-[8px]">&#9679;</span>}
                <div className="text-xs text-forge-text-secondary leading-relaxed">{text}</div>
              </div>
            );
          })}
        </div>
      );
  }
}

function cleanLine(line) {
  return line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
}

export default function AgentProfileBrain({ agentId, agentColor }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const [saving, setSaving] = useState(false);

  const fileName = getSkillFileName(agentId);

  const loadSkill = useCallback(async () => {
    if (!window.electronAPI?.agent) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.agent.readSkill(fileName);
      if (result.ok) {
        setContent(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [fileName]);

  useEffect(() => { loadSkill(); }, [loadSkill]);

  const handleEdit = () => {
    setEditBuffer(content || '');
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditBuffer('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await window.electronAPI.agent.writeSkill(fileName, editBuffer);
      if (result.ok) {
        setContent(editBuffer);
        setEditing(false);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const sections = content ? parseSections(content) : [];

  // Fallback for browser mode — show AGENT_DETAILS hardcoded data
  if (!window.electronAPI?.agent) {
    const details = AGENT_DETAILS[agentId];
    if (!details) return null;
    return (
      <div className="card">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
          Agent Brain
        </h2>
        <p className="text-[11px] text-forge-text-muted italic mb-3">
          Run in Electron to view and edit agent skill files.
        </p>
        {details.personality && (
          <blockquote
            className="border-l-[3px] pl-4 py-2 text-sm text-forge-text-secondary leading-relaxed italic"
            style={{ borderColor: agentColor }}
          >
            "{details.personality}"
          </blockquote>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider">
          Agent Brain
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-forge-text-muted font-mono">{fileName}</span>
          {!editing ? (
            <button
              onClick={handleEdit}
              disabled={loading || !content}
              className="px-2.5 py-1 text-[10px] font-medium rounded-lg border border-forge-border
                         text-forge-text-secondary hover:text-forge-text-primary hover:border-forge-accent/30 transition-colors
                         disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2.5 py-1 text-[10px] font-medium rounded-lg bg-green-400/10 text-green-400
                           border border-green-400/20 hover:bg-green-400/20 transition-colors
                           disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="px-2.5 py-1 text-[10px] font-medium rounded-lg border border-forge-border
                           text-forge-text-muted hover:text-forge-text-secondary transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="text-forge-text-muted text-xs">Loading skill file...</div>
        </div>
      )}

      {error && (
        <div className="text-center py-4">
          <div className="text-red-400/80 text-xs">{error}</div>
        </div>
      )}

      {editing ? (
        <textarea
          value={editBuffer}
          onChange={(e) => setEditBuffer(e.target.value)}
          className="w-full h-[500px] bg-[#0d1117] border border-forge-border/50 rounded-lg p-4
                     text-xs font-mono text-forge-text-secondary leading-relaxed resize-y
                     focus:outline-none focus:border-forge-accent/40"
          spellCheck={false}
        />
      ) : (
        sections.length > 0 && (
          <div className="space-y-4">
            {sections.map((s, i) => (
              <div key={i}>
                {s.title && (
                  <div
                    className="text-[11px] font-semibold text-forge-text-primary uppercase tracking-wider mb-2"
                    style={{ color: i === 0 ? agentColor : undefined }}
                  >
                    {s.title}
                  </div>
                )}
                {s.content && <SectionRenderer title={s.title} content={s.content} agentColor={agentColor} />}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
