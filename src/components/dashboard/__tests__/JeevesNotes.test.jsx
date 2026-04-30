// JeevesNotes render tests — covers empty state, action narration,
// expand/collapse, and the "View all" affordance that opens HelpPanel
// to the Steward tab.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock useStore BEFORE importing JeevesNotes so we can swap stewardActions
// per test case.
let mockStewardActions = [];
vi.mock('../../../store/useStore', () => ({
  useStore: vi.fn((selector) => selector({ stewardStatus: { recentActions: mockStewardActions } })),
}));

import JeevesNotes from '../JeevesNotes.jsx';

function action(overrides = {}) {
  return {
    task_id: 't-1',
    rule_id: 'rec-resolved-update-history',
    completed_at: new Date().toISOString(),
    outcome: 'success',
    output: 'journaled ARE-018-card-ledger for arena → 3464f028',
    error: null,
    project: 'arena',
    source: 'hq',
    kind: 'file-changed',
    payload: { path: 'projects/arena/recommendations/ARE-018-card-ledger.json' },
    ...overrides,
  };
}

describe('JeevesNotes — empty state', () => {
  beforeEach(() => { mockStewardActions = []; cleanup(); });

  it('renders the empty-state message when there are no actions', () => {
    render(<JeevesNotes />);
    expect(screen.getByText(/No quiet updates yet\. Jeeves takes notes as the studio works\./)).toBeInTheDocument();
  });

  it('uses zero count in the header when empty', () => {
    render(<JeevesNotes />);
    expect(screen.getByText(/Jeeves' Notes/)).toBeInTheDocument();
    expect(screen.getByText(/0 quiet updates/)).toBeInTheDocument();
  });
});

describe('JeevesNotes — action narration', () => {
  beforeEach(() => { cleanup(); });

  it('renders the headline and why for each action (two-line narrative)', () => {
    mockStewardActions = [
      action({ task_id: 'a', output: 'journaled ARE-018-card-ledger for arena → abc12345' }),
    ];
    render(<JeevesNotes />);
    expect(screen.getByText('Logged ARE-018-card-ledger to history.json')).toBeInTheDocument();
    expect(screen.getByText(/Triggered when ARE-018-card-ledger flipped to resolved\. Appended one entry\./)).toBeInTheDocument();
  });

  it('limits the displayed list to 10 actions even when more are present', () => {
    mockStewardActions = Array.from({ length: 15 }, (_, i) =>
      action({ task_id: `t-${i}`, output: `journaled REC-${String(i).padStart(3, '0')} for arena → sha${i}` }),
    );
    render(<JeevesNotes />);
    expect(screen.getByText('Logged REC-000 to history.json')).toBeInTheDocument();
    expect(screen.getByText('Logged REC-009 to history.json')).toBeInTheDocument();
    expect(screen.queryByText('Logged REC-010 to history.json')).not.toBeInTheDocument();
  });

  it('shows the project and a relative time hint per action', () => {
    mockStewardActions = [
      action({ task_id: 'a', project: 'arena' }),
    ];
    render(<JeevesNotes />);
    expect(screen.getByText(/arena/)).toBeInTheDocument();
  });
});

describe('JeevesNotes — collapse / expand', () => {
  beforeEach(() => {
    mockStewardActions = [action()];
    cleanup();
  });

  it('is expanded by default and shows action narratives', () => {
    render(<JeevesNotes />);
    expect(screen.getByText('Logged ARE-018-card-ledger to history.json')).toBeInTheDocument();
  });

  it('hides body when the header toggle is clicked', () => {
    render(<JeevesNotes />);
    const toggle = screen.getByRole('button', { name: /Jeeves' Notes/i });
    fireEvent.click(toggle);
    expect(screen.queryByText('Logged ARE-018-card-ledger to history.json')).not.toBeInTheDocument();
  });
});

describe('JeevesNotes — View all link', () => {
  beforeEach(() => { mockStewardActions = [action()]; cleanup(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('dispatches forge:open-help with tab=steward when View all is clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<JeevesNotes />);
    const link = screen.getByRole('button', { name: /View all/i });
    fireEvent.click(link);
    const helpEvents = dispatchSpy.mock.calls
      .map(([evt]) => evt)
      .filter((evt) => evt instanceof CustomEvent && evt.type === 'forge:open-help');
    expect(helpEvents).toHaveLength(1);
    expect(helpEvents[0].detail).toEqual({ tab: 'steward' });
  });
});
