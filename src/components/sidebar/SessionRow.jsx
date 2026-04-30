import React, { useState, useEffect, useRef, useCallback } from 'react';

const STATE_EMOJI = {
  starting: '⏳',
  working: '🤔',
  'your-turn': '💬',
  detached: '💤',
  done: '✅',
};

const HOVER_DELAY_MS = 200;
const ARM_TIMEOUT_MS = 3000;
const LIVE_STATES = new Set(['starting', 'working', 'your-turn']);

export default function SessionRow({
  session, isActive, onSelect, onClose, onReattach,
  onHoverShowCwd, onHoverHide,
}) {
  const { id, label, agentColor, state } = session;
  const isLive = LIVE_STATES.has(state);
  const isDetached = state === 'detached';
  const isDone = state === 'done';
  const dimmed = isDetached || isDone;
  const dotColor = dimmed ? '#475569' : agentColor;
  const emoji = STATE_EMOJI[state];

  const [armed, setArmed] = useState(false);
  const armTimerRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const rowRef = useRef(null);

  useEffect(() => () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const cancelArm = useCallback(() => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    setArmed(false);
  }, []);

  const handleClick = () => {
    if (armed) {
      cancelArm();
      return;
    }
    if (isDetached) onReattach(id);
    else onSelect(id);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    if (!isLive) {
      onClose(id);
      return;
    }
    if (armed) {
      cancelArm();
      onClose(id);
    } else {
      setArmed(true);
      armTimerRef.current = setTimeout(() => {
        armTimerRef.current = null;
        setArmed(false);
      }, ARM_TIMEOUT_MS);
    }
  };

  const handleReattachBtn = (e) => {
    e.stopPropagation();
    onReattach(id);
  };

  const handleMouseEnter = () => {
    if (!onHoverShowCwd) return;
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      const rect = rowRef.current?.getBoundingClientRect();
      onHoverShowCwd(session, rect);
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (onHoverHide) onHoverHide();
  };

  const dotClassName = `w-1.5 h-1.5 rounded-full flex-shrink-0 ${
    state === 'working' ? 'animate-pulse' : ''
  } ${state === 'starting' ? 'border border-dashed' : ''}`;
  const dotStyle = {
    backgroundColor: dotColor,
    boxShadow: state === 'your-turn' ? `0 0 6px ${dotColor}80` : undefined,
  };

  const closeIcon = isLive ? '💀' : '🗑️';

  return (
    <div
      ref={rowRef}
      data-testid={`session-row-${id}`}
      data-active={isActive ? 'true' : 'false'}
      data-state={state}
      data-armed={armed ? 'true' : 'false'}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group flex items-center gap-2 pl-7 pr-2 py-1 cursor-pointer text-[11px] font-mono select-none
        ${isActive ? 'bg-forge-bg/60 text-forge-text-secondary' : 'text-forge-text-muted hover:bg-forge-bg/30 hover:text-forge-text-secondary'}
        ${dimmed ? 'opacity-70' : ''}
        ${state === 'your-turn' ? 'text-forge-text-secondary' : ''}`}
      style={isActive ? { boxShadow: `inset 2px 0 0 0 ${dotColor}` } : undefined}
    >
      <span className={dotClassName} style={dotStyle} />
      <span className="flex-shrink-0 text-[12px] leading-none" aria-hidden="true">{emoji}</span>
      <span className="truncate flex-1">{label}</span>
      {isDetached && (
        <button
          type="button"
          aria-label="Reattach session"
          onClick={handleReattachBtn}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[12px] leading-none hover:scale-110 px-1"
          title="Reattach"
        >↻</button>
      )}
      <button
        type="button"
        aria-label="Close session"
        onClick={handleClose}
        className={`flex-shrink-0 transition-opacity text-[12px] leading-none rounded px-1 ${
          armed
            ? 'opacity-100 bg-red-500/30 text-red-300'
            : 'opacity-0 group-hover:opacity-100'
        }`}
        title={isLive ? (armed ? 'Click to confirm kill' : 'Kill session') : 'Remove'}
      >
        {closeIcon}{armed ? '?' : ''}
      </button>
    </div>
  );
}
