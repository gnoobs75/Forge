// DailyReportsPanel — surfaces files written under
// `hq-data/projects/{slug}/daily-reports/`. Reports are status updates,
// verification passes, and context refreshes — the things that don't fit the
// recommendation schema (no approaches, nothing to "pick"). Loaded into the
// `dailyReports` slice by useStore.loadDailyReports().
//
// Schema (see CLAUDE.md "Daily Report Output Format"):
//   required: agent, agentColor, project, timestamp, type ("daily-report"),
//             title, summary, body
//   optional: highlights[], concerns[], next_steps[]
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { playSound } from '../../utils/sounds';

// Same markdown component overrides as ProjectDocs so reports inherit the
// dashboard typography. Kept local to avoid coupling the two files.
const mdComponents = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-forge-text-primary mt-4 mb-2 pb-1 border-b border-forge-border/30">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold text-forge-text-primary mt-4 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-forge-text-primary mt-3 mb-1.5">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs font-semibold text-forge-text-secondary mt-3 mb-1 uppercase tracking-wider">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-forge-text-secondary leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 ml-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 ml-2">{children}</ol>,
  li: ({ children }) => <li className="text-sm text-forge-text-secondary leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="text-forge-accent hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-forge-text-primary">{children}</strong>,
  em: ({ children }) => <em className="italic text-forge-text-secondary">{children}</em>,
  code: ({ inline, children }) => {
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-forge-surface-hover text-forge-accent-blue">
          {children}
        </code>
      );
    }
    return (
      <pre className="p-3 rounded-lg bg-forge-bg/80 border border-forge-border/30 overflow-x-auto mb-2">
        <code className="text-xs font-mono text-forge-text-secondary leading-relaxed">{children}</code>
      </pre>
    );
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-forge-accent/40 pl-3 my-2 text-sm text-forge-text-muted italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-forge-border/30 my-3" />,
};

export default function DailyReportsPanel({ projectSlug }) {
  const allReports = useStore((s) => s.dailyReports);
  const projects = useStore((s) => s.projects);

  // When projectSlug is provided, scope to that project. Otherwise show every
  // report (used by StudioOverview's cross-project strip).
  const reports = useMemo(() => {
    if (!projectSlug) return allReports;
    return allReports.filter((r) => r.project === projectSlug);
  }, [allReports, projectSlug]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
          Daily Reports ({reports.length})
        </h2>
        <span className="text-[10px] text-forge-text-muted">
          status updates, verification passes, context refreshes
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-2 opacity-30">{'\uD83D\uDCDD'}</div>
          <p className="text-sm text-forge-text-muted">
            No daily reports yet. Studio Producer and QA Advisor write their daily standups here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report, i) => (
            <ReportCard
              key={report._filePath || `${report.timestamp}-${i}`}
              report={report}
              projectName={projects.find((p) => p.slug === report.project)?.name || report.project}
              showProject={!projectSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report, projectName, showProject }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-3 rounded-lg border-l-2 border bg-forge-bg/50 border-forge-border
                 hover:border-forge-accent-blue/30 transition-all cursor-pointer animate-slide-up"
      style={{ borderLeftColor: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = report.agentColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = 'transparent'; }}
      onClick={() => { setExpanded(!expanded); playSound('click'); }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Agent + project + timestamp */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
              style={{
                backgroundColor: `${report.agentColor}15`,
                color: report.agentColor,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: report.agentColor }}
              />
              {report.agent}
            </span>
            {showProject && (
              <span className="text-xs text-forge-text-muted">{projectName}</span>
            )}
            <span className="text-[10px] text-forge-text-muted">
              {formatRelativeTime(report.timestamp)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-forge-surface-hover text-forge-text-muted">
              REPORT
            </span>
          </div>

          {/* Title */}
          <div className="text-sm font-medium leading-tight text-forge-text-primary">
            {report.title}
          </div>

          {/* Summary */}
          <div className="text-sm text-forge-text-secondary mt-1 leading-relaxed">
            {report.summary}
          </div>
        </div>

        {/* Expand indicator */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span
            className="text-forge-text-muted text-xs inline-block transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            {'\u25BC'}
          </span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-forge-border/30 space-y-3"
             onClick={(e) => e.stopPropagation()}>
          {/* Body — markdown */}
          <div className="reports-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {report.body || ''}
            </ReactMarkdown>
          </div>

          {/* Optional bullet sections — only render if non-empty */}
          {Array.isArray(report.highlights) && report.highlights.length > 0 && (
            <BulletSection
              label="Highlights"
              color="#22C55E"
              items={report.highlights}
            />
          )}
          {Array.isArray(report.concerns) && report.concerns.length > 0 && (
            <BulletSection
              label="Concerns"
              color="#F59E0B"
              items={report.concerns}
            />
          )}
          {Array.isArray(report.next_steps) && report.next_steps.length > 0 && (
            <BulletSection
              label="Next Steps"
              color="#3B82F6"
              items={report.next_steps}
            />
          )}

          {/* File path footer */}
          {report._filePath && (
            <div className="text-[10px] text-forge-text-muted/60 font-mono pt-2 border-t border-forge-border/20">
              {report._filePath}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BulletSection({ label, color, items }) {
  return (
    <div
      className="p-3 rounded-lg border-l-2"
      style={{
        borderLeftColor: color,
        backgroundColor: `${color}08`,
      }}
    >
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color }}
      >
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-sm text-forge-text-secondary leading-relaxed flex items-start gap-2"
          >
            <span className="flex-shrink-0 mt-1.5" style={{ color }}>{'\u2022'}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
