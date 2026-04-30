import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { jeevesNarrate } from '../../utils/jeevesNarrate';

const JEEVES_COLOR = '#A78BFA';
const EMPTY_ACTIONS = [];

export default function ActivityFeed() {
  const activityLog = useStore((s) => s.activityLog);
  const stewardActions = useStore((s) => s.stewardStatus?.recentActions ?? EMPTY_ACTIONS);

  // Merge Jeeves' Steward actions into the activity feed alongside agent
  // entries. Sorted by most recent so Jeeves rises to the top whenever
  // the Steward fired more recently than any council agent.
  const merged = useMemo(() => {
    const jeevesEntries = stewardActions.map((a) => {
      const n = jeevesNarrate(a);
      return {
        id: `steward-${a.task_id}`,
        agent: 'Jeeves',
        agentColor: JEEVES_COLOR,
        action: n.headline,
        project: n.where || '',
        timestamp: n.when || a.completed_at || a.started_at || null,
      };
    });
    return [...activityLog, ...jeevesEntries].sort((a, b) =>
      (b.timestamp || '').localeCompare(a.timestamp || '')
    );
  }, [activityLog, stewardActions]);

  return (
    <div className="card">
      <h2 className="text-xs font-mono font-semibold text-forge-text-secondary uppercase tracking-wider mb-3">
        Agent Activity
      </h2>
      <div className="space-y-2">
        {merged.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-forge-text-muted">No agent activity yet</p>
          </div>
        ) : (
          merged.map((activity, i) => (
            <div
              key={activity.id || i}
              className="flex items-start gap-2 p-2 rounded-lg bg-forge-bg/50 hover:bg-forge-surface-hover transition-colors"
            >
              <div
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ backgroundColor: activity.agentColor }}
              />
              <div className="min-w-0">
                <div className="text-[11px] text-forge-text-primary">
                  <span className="font-medium" style={{ color: activity.agentColor }}>
                    {activity.agent}
                  </span>
                  {' '}{activity.action}
                </div>
                <div className="text-[10px] text-forge-text-muted mt-0.5">
                  {activity.project}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
