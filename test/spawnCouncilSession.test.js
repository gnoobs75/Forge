import { describe, it, expect, vi, beforeEach } from 'vitest';

// AGENT_INVOKE is exported from a JSX component. The component imports
// React, but the named export we need is plain data, so the static
// dependency tree pulls in React. We mock the module to avoid loading
// the renderer in a node-environment test.
vi.mock('../src/components/dashboard/AgentDetailPanel', () => ({
  AGENT_INVOKE: {
    'solutions-architect': '@SolutionsArchitect',
    'backend-engineer': '@BackendEngineer',
    'frontend-engineer': '@FrontendEngineer',
  },
}));

const { spawnCouncilSession, __private } = await import('../src/utils/spawnCouncilSession.js');
const { defaultInvokeFor, invokeFor, initialsFor, buildLabel, buildSlug } = __private;

describe('spawnCouncilSession helpers', () => {
  describe('defaultInvokeFor', () => {
    it('PascalCases the agent name and prefixes @', () => {
      expect(defaultInvokeFor({ name: 'Solutions Architect' })).toBe('@SolutionsArchitect');
      expect(defaultInvokeFor({ name: 'QA Lead' })).toBe('@QALead');
    });

    it('strips non-alphanumeric characters', () => {
      expect(defaultInvokeFor({ name: 'Dr. Strange-Love' })).toBe('@DrStrangeLove');
    });
  });

  describe('invokeFor', () => {
    it('uses AGENT_INVOKE map when agent id is known', () => {
      expect(invokeFor({ id: 'solutions-architect', name: 'Solutions Architect' }))
        .toBe('@SolutionsArchitect');
    });

    it('falls back to defaultInvokeFor for unknown agents', () => {
      expect(invokeFor({ id: 'unknown-agent', name: 'Some New Role' })).toBe('@SomeNewRole');
    });
  });

  describe('initialsFor', () => {
    it('uses first 2 letters for single-word names', () => {
      expect(initialsFor({ name: 'Friday' })).toBe('FR');
    });

    it('uses initials for multi-word names', () => {
      expect(initialsFor({ name: 'Solutions Architect' })).toBe('SA');
      expect(initialsFor({ name: 'Quality Assurance Lead' })).toBe('QAL');
    });
  });

  describe('buildLabel', () => {
    it('joins full names for 1-3 agents', () => {
      const agents = [
        { name: 'A' }, { name: 'B' }, { name: 'C' },
      ];
      expect(buildLabel(agents)).toBe('Council: A + B + C');
    });

    it('uses initials for 4+ agents', () => {
      const agents = [
        { name: 'Solutions Architect' },
        { name: 'Backend Engineer' },
        { name: 'Frontend Engineer' },
        { name: 'QA Lead' },
      ];
      expect(buildLabel(agents)).toBe('Council: SA + BE + FE + QL');
    });
  });

  describe('buildSlug', () => {
    it('produces a deterministic multi: slug regardless of input order', () => {
      const a = [{ id: 'beta' }, { id: 'alpha' }, { id: 'gamma' }];
      const b = [{ id: 'gamma' }, { id: 'alpha' }, { id: 'beta' }];
      expect(buildSlug(a)).toBe('multi:alpha+beta+gamma');
      expect(buildSlug(b)).toBe(buildSlug(a));
    });
  });
});

describe('spawnCouncilSession (integration)', () => {
  beforeEach(() => {
    // Provide a minimal window stub so the side-effect path doesn't no-op
    // on us — it should accept the input call without throwing.
    globalThis.window = {
      electronAPI: {
        terminal: { input: vi.fn() },
      },
    };
  });

  it('returns null when agents is empty', () => {
    const result = spawnCouncilSession({
      startAgentSession: vi.fn(),
      agents: [],
      project: { slug: 'p', repoPath: '/tmp', name: 'P' },
    });
    expect(result).toBeNull();
  });

  it('returns null when startAgentSession is missing', () => {
    expect(spawnCouncilSession({
      agents: [{ id: 'a', name: 'Agent A', color: '#fff' }],
      project: { slug: 'p' },
    })).toBeNull();
  });

  it('returns null when project is missing', () => {
    expect(spawnCouncilSession({
      startAgentSession: vi.fn(),
      agents: [{ id: 'a', name: 'Agent A', color: '#fff' }],
    })).toBeNull();
  });

  it('calls startAgentSession with the alphabetically-first agent as lead', () => {
    const startAgentSession = vi.fn(() => ({ id: 'session-1' }));
    spawnCouncilSession({
      startAgentSession,
      agents: [
        { id: 'zulu', name: 'Zulu Agent', color: '#fff' },
        { id: 'alpha', name: 'Alpha Agent', color: '#000' },
      ],
      project: { slug: 'p', repoPath: '/tmp', name: 'P' },
    });
    expect(startAgentSession).toHaveBeenCalledTimes(1);
    const [leadAgent, project, extras] = startAgentSession.mock.calls[0];
    expect(leadAgent.id).toBe('alpha');
    expect(extras.agentSlug).toBe('multi:alpha+zulu');
    expect(extras.label).toBe('Council: Alpha Agent + Zulu Agent');
    expect(extras.councilAgents).toHaveLength(2);
  });
});
