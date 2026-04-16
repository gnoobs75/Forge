import React, { useCallback, useRef, useEffect } from 'react';

export default function SplitPane({ position, onPositionChange, left, right }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newPosition = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, newPosition));
      onPositionChange(clamped);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onPositionChange]);

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* Left pane (Terminal) */}
      <div style={{ width: `${position}%` }} className="h-full overflow-hidden">
        {left}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 hover:w-1.5 bg-forge-border hover:bg-forge-accent-blue cursor-col-resize transition-all flex-shrink-0 flex items-center justify-center group/divider"
      >
        <div className="flex flex-col gap-0.5 opacity-0 group-hover/divider:opacity-50 transition-opacity">
          <div className="w-0.5 h-0.5 rounded-full bg-forge-text-muted" />
          <div className="w-0.5 h-0.5 rounded-full bg-forge-text-muted" />
          <div className="w-0.5 h-0.5 rounded-full bg-forge-text-muted" />
        </div>
      </div>

      {/* Right pane (Dashboard) */}
      <div style={{ width: `${100 - position}%` }} className="h-full overflow-hidden">
        {right}
      </div>
    </div>
  );
}
