// LatestDailyReportsStrip — compact cross-project surface for the
// 3 most-recent daily reports. Mounted in StudioOverview alongside
// TopRecommendations. Each row links visually to its project but the click
// just expands the body inline so users don't lose their place.
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../../store/useStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { playSound } from '../../utils/sounds';

const stripMd = {
  p: ({ children }) => (
    <p className="text-sm text-forge-text-secondary leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 ml-2">{children}</ul>,
  li: ({ children }) => <li className="text-sm text-forge-text-secondary leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-forge-text-primary">{children}</strong>,
  code: ({ children }) => (
    <code className="px-1 py-0.5 rounded text-xs font-mono bg-forge-surface-hover text-forge-accent-blue">
      {children}
    </code>
  ),
};

export default function LatestDailyReportsStrip() {
  const reports = useStore((s) => s.dailyReports);
  const projects = useStore((s) => s.projects);

  const top3 = useMemo(() => reports.slice(0, 3), [reports]);

  if (top3.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider border-l-2 border-forge-accent pl-3">
          Latest Daily Reports
        </h2>
        <span className="text-[10px] text-forge-text-muted">
          {reports.length} total across all projects
        </span>
      </div>
      <div className="space-y-2">
        {top3.map((report, i) => (
          <StripRow
            key={report._filePath || `${report.timestamp}-${i}`}
            report={report}
            projectName={projects.find((p) => p.slug === report.project)?.name || report.project}
          />
        ))}
      </div>
    </div>
  );
}

function StripRow({ report, projectName }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="p-2.5 rounded-lg border-l-2 border bg-forge-bg/50 border-forge-border
                 hover:border-forge-accent-blue/30 transition-all cursor-pointer"
      style={{ borderLeftColor: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = report.agentColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = 'transparent'; }}
      onClick={() => { setExpanded(!expanded); playSound('click'); }}
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium"
          style={{
            backgroundColor: `${report.agentColor}15`,
            color: report.agentColor,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: report.agentColor }}
          />
          {report.agent}
        </span>
        <span className="text-xs text-forge-text-muted">{projectName}</span>
        <span className="text-[10px] text-forge-text-muted">
          {formatRelativeTime(report.timestamp)}
        </span>
      </div>
      <div className="text-sm font-medium text-forge-text-primary leading-tight">
        {report.title}
      </div>
      <div className="text-xs text-forge-text-secondary mt-0.5 leading-relaxed">
        {report.summary}
      </div>
      {expanded && report.body && (
        <div className="mt-2 pt-2 border-t border-forge-border/30"
             onClick={(e) => e.stopPropagation()}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={stripMd}>
            {report.body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
