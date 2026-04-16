import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Draggable tab bar with localStorage persistence.
 * Renders tabs in user-defined order, supports drag-to-reorder.
 */
export default function DraggableTabBar({ tabs, activeTab, onTabClick, storageKey }) {
  // Load persisted order or use default
  const [orderedIds, setOrderedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`forge-tabs-${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate: keep only IDs that exist in tabs, append any new ones
        const tabIds = new Set(tabs.map(t => t.id));
        const valid = parsed.filter(id => tabIds.has(id));
        const missing = tabs.filter(t => !valid.includes(t.id)).map(t => t.id);
        return [...valid, ...missing];
      }
    } catch { /* ignore */ }
    return tabs.map(t => t.id);
  });

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);

  // Build ordered tab list from IDs
  const tabMap = Object.fromEntries(tabs.map(t => [t.id, t]));
  const orderedTabs = orderedIds.map(id => tabMap[id]).filter(Boolean);

  const persistOrder = useCallback((ids) => {
    try { localStorage.setItem(`forge-tabs-${storageKey}`, JSON.stringify(ids)); } catch { /* ignore */ }
  }, [storageKey]);

  // Sync if tabs array changes (new tabs added)
  useEffect(() => {
    const tabIds = new Set(tabs.map(t => t.id));
    const currentIds = new Set(orderedIds);
    const missing = tabs.filter(t => !currentIds.has(t.id)).map(t => t.id);
    const removed = orderedIds.filter(id => !tabIds.has(id));
    if (missing.length || removed.length) {
      const updated = orderedIds.filter(id => tabIds.has(id)).concat(missing);
      setOrderedIds(updated);
      persistOrder(updated);
    }
  }, [tabs]);

  const handleDragStart = (e, idx) => {
    dragItem.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Make drag image slightly transparent
    if (e.target) {
      e.dataTransfer.setDragImage(e.target, e.target.offsetWidth / 2, e.target.offsetHeight / 2);
    }
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverItem.current = idx;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from === null || to === null || from === to) {
      setDragIdx(null);
      return;
    }
    const updated = [...orderedIds];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setOrderedIds(updated);
    persistOrder(updated);
    dragItem.current = null;
    dragOverItem.current = null;
    setDragIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div className="flex items-center gap-1 border-b border-forge-border overflow-x-auto scrollbar-hide">
      {orderedTabs.map((tab, idx) => (
        <button
          key={tab.id}
          draggable
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onClick={() => onTabClick(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 cursor-grab active:cursor-grabbing select-none ${
            activeTab === tab.id
              ? 'border-forge-accent text-forge-accent'
              : 'border-transparent text-forge-text-muted hover:text-forge-text-secondary hover:border-forge-border'
          } ${dragIdx === idx ? 'opacity-40' : ''}`}
        >
          <span className="text-sm">{tab.icon}</span>
          {tab.label}
          {tab.badge > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-red-500/20 text-red-400 leading-none">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
