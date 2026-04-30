// JeevesNotes — collapsible Studio Overview panel that surfaces the last
// 10 Studio Steward actions as Jeeves narration. Reads recentActions from
// the stewardStatus slice (App.jsx pipes it from window.coe.steward.onStatus).
//
// Two-line narrative per row:
//   <headline> — <relative-time> in <project>
//     ↳ <why>
//
// Empty state surfaces when the Steward has done nothing yet (or the daemon
// is paused). "View all" dispatches forge:open-help so StudioOverview can
// open HelpPanel directly to the Steward tab.

import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { jeevesNarrate } from '../../utils/jeevesNarrate';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const JEEVES_COLOR = '#A78BFA';
const MAX_ENTRIES = 10;
const EMPTY_ACTIONS = [];

function openStewardTab() {
  window.dispatchEvent(new CustomEvent('forge:open-help', { detail: { tab: 'steward' } }));
}

export default function JeevesNotes() {
  const recentActions = useStore((s) => s.stewardStatus?.recentActions ?? EMPTY_ACTIONS);
  const [open, setOpen] = useState(true);

  const visible = recentActions.slice(0, MAX_ENTRIES);
  const count = visible.length;

  return (
    <div
      className="rounded-xl border border-forge-border bg-forge-surface overflow-hidden"
      style={{ borderColor: `${JEEVES_COLOR}33` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-forge-bg/30 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
            style={{ backgroundColor: `${JEEVES_COLOR}1A`, color: JEEVES_COLOR }}
          >
            {'\u{1FAB6}'}
          </span>
          <div className="text-left">
            <div className="text-sm font-semibold text-forge-text-primary">
              Jeeves&apos; Notes
              <span className="text-forge-text-muted font-normal">
                {' '}— {count} quiet update{count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="text-xs text-forge-text-muted">
              Studio steward — quiet maintenance
            </div>
          </div>
        </div>
        <span className="text-forge-text-muted text-xs">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-forge-border/40">
          {count === 0 ? (
            <div className="py-3 text-sm text-forge-text-muted italic">
              No quiet updates yet. Jeeves takes notes as the studio works.
            </div>
          ) : (
            <ul className="space-y-2 py-2">
              {visible.map((a) => {
                const n = jeevesNarrate(a);
                return (
                  <li key={a.task_id} className="text-sm">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-forge-text-primary font-medium">{n.headline}</span>
                      <span className="text-forge-text-muted text-xs">
                        — {formatRelativeTime(n.when)}
                        {n.where ? ` in ${n.where}` : ''}
                      </span>
                    </div>
                    <div className="text-xs text-forge-text-muted mt-0.5 pl-4 border-l-2"
                         style={{ borderColor: `${JEEVES_COLOR}66` }}>
                      {'↳ '}{n.why}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-2 pt-2 border-t border-forge-border/30 flex justify-end">
            <button
              type="button"
              onClick={openStewardTab}
              className="text-xs text-forge-text-muted hover:text-forge-accent transition-colors"
            >
              View all →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
