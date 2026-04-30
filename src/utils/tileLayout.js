// Pure helpers for the tile-mode terminal grid.
//
// Extracted from CoE's Terminal.jsx so the math is unit-testable and so
// Forge's Terminal.jsx can stay smaller. No React, no DOM — pass in the
// pinnedSlots map ({1: scopeId, 2: scopeId, ...}) and get back a layout
// description.
//
// Slots are numbered 1..4. The layout follows CoE's geometry:
//   1 slot   → fullscreen (single)
//   2 slots  → 2 columns, 1 row
//   3 slots  → s1 takes the left column; s2 + s3 stack the right column
//   4 slots  → 2x2 grid, slot order s1 s2 / s3 s4

const SHIFT_NUM_KEYS = { '!': 1, '@': 2, '#': 3, '$': 4, ')': 0 };

export function computeTileMode(pinnedSlots) {
  const slots = Object.keys(pinnedSlots).map(Number).filter(n => n >= 1 && n <= 4);
  if (slots.length === 0) return { mode: 'single', layoutCount: 0 };
  return { mode: 'tile', layoutCount: Math.max(...slots) };
}

export function computeTileGridStyle(layoutCount) {
  switch (layoutCount) {
    case 1:
      return { display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
    case 2:
      return { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' };
    case 3:
      return {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: '"s1 s2" "s1 s3"',
      };
    case 4:
      return {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: '"s1 s2" "s3 s4"',
      };
    default:
      return {};
  }
}

export function slotGridArea(slot) {
  return `s${slot}`;
}

// Find the next pinned slot after `currentSlot`, wrapping at 4. Returns null
// when no other slot is pinned, or when currentSlot itself isn't pinned.
export function findNextPinnedSlot(currentSlot, pinnedSlots) {
  if (!pinnedSlots[currentSlot]) return null;
  for (let i = 1; i <= 4; i++) {
    const candidate = ((currentSlot - 1 + i) % 4) + 1;
    if (candidate === currentSlot) continue;
    if (pinnedSlots[candidate]) return candidate;
  }
  return null;
}

// Given a KeyboardEvent-like object and the current pinnedSlots map, return
// { action: 'focus' | 'pin' | 'unpin' | null, slot?: number }.
//
// - Ctrl+1..4         → focus pinned slot N (no-op if not pinned)
// - Ctrl+Shift+1..4   → pin focused tab to slot N
// - Ctrl+Shift+0      → unpin focused tab
export function resolveTileHotkey(event, pinnedSlots) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return { action: null };

  if (event.shiftKey) {
    let slot = null;
    if (SHIFT_NUM_KEYS[event.key] !== undefined) {
      slot = SHIFT_NUM_KEYS[event.key];
    } else if (/^[0-4]$/.test(event.key)) {
      slot = Number(event.key);
    }
    if (slot === 0) return { action: 'unpin' };
    if (slot >= 1 && slot <= 4) return { action: 'pin', slot };
    return { action: null };
  }

  if (/^[1-4]$/.test(event.key)) {
    const slot = Number(event.key);
    if (pinnedSlots[slot]) return { action: 'focus', slot };
  }
  return { action: null };
}
