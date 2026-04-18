import React, { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { playSound } from '../../utils/sounds';
import { recDisplayTitle } from '../../utils/rec';
import { BRAIN_PROVIDERS, RECOMMENDED_BRAINS, getAgentBrain, getModelDisplay } from '../../utils/brainConfig';

export const AGENT_ICONS = {
  'solutions-architect': '\u{1F3D7}',
  'backend-engineer': '\u{2699}',
  'frontend-engineer': '\u{1F3A8}',
  'devops-engineer': '\u{2601}',
  'data-engineer': '\u{1F5C4}',
  'security-auditor': '\u{1F6E1}',
  'qa-lead': '\u{2705}',
  'product-owner': '\u{1F451}',
  'ux-researcher': '\u{1F465}',
  'api-designer': '\u{1F50C}',
  'performance-engineer': '\u{26A1}',
  'technical-writer': '\u{1F4DD}',
  'project-manager': '\u{1F4C5}',
  'code-reviewer': '\u{1F50D}',
};

export const AGENT_INVOKE = {
  'solutions-architect': '@SolutionsArchitect',
  'backend-engineer': '@BackendEngineer',
  'frontend-engineer': '@FrontendEngineer',
  'devops-engineer': '@DevOpsEngineer',
  'data-engineer': '@DataEngineer',
  'security-auditor': '@SecurityAuditor',
  'qa-lead': '@QALead',
  'product-owner': '@ProductOwner',
  'ux-researcher': '@UXResearcher',
  'api-designer': '@APIDesigner',
  'performance-engineer': '@PerformanceEngineer',
  'technical-writer': '@TechnicalWriter',
  'project-manager': '@ProjectManager',
  'code-reviewer': '@CodeReviewer',
};

export const AGENT_DETAILS = {
  'solutions-architect': {
    personality: 'Methodical systems thinker. Designs for scale, maintainability, and team velocity. Speaks in diagrams and trade-offs.',
    expertise: ['System design', 'API architecture', 'Data modeling', 'Tech stack evaluation', 'Domain-driven design'],
    examples: ['Design a microservices architecture for this platform', 'Evaluate whether we should use GraphQL or REST', 'Model the domain entities for the billing system'],
    capabilities: ['Architecture diagrams and decision records', 'Tech stack comparison matrices', 'Data model design', 'Integration pattern selection', 'Scalability analysis'],
    workflow: ['Read project context and features', 'Explore codebase architecture', 'Identify architectural concerns', 'Design solution with trade-offs', 'Write recommendation with approaches'],
    guardrails: ['Won\'t implement code directly', 'Won\'t choose tools without evaluating alternatives', 'Won\'t over-architect for current scale'],
  },
  'backend-engineer': {
    personality: 'Pragmatic builder who ships working code. Thinks in endpoints, queries, and error handling. Values simplicity over cleverness.',
    expertise: ['API implementation', 'Database design', 'Business logic', 'Service patterns', 'Error handling'],
    examples: ['Implement the user authentication API', 'Optimize the slow search query', 'Design the payment processing service'],
    capabilities: ['REST/GraphQL endpoint implementation', 'Database query optimization', 'Service layer architecture', 'Error handling patterns', 'Integration with external APIs'],
    workflow: ['Read API specs and data models', 'Explore existing backend code', 'Implement with tests', 'Handle edge cases and errors', 'Write recommendation for improvements'],
    guardrails: ['Won\'t skip error handling', 'Won\'t ignore database migrations', 'Won\'t bypass validation'],
  },
  'frontend-engineer': {
    personality: 'Cares deeply about user experience and performance. Thinks in components, layouts, and interactions. Pixel-perfect but pragmatic.',
    expertise: ['UI implementation', 'Component architecture', 'Responsive design', 'State management', 'Accessibility'],
    examples: ['Build the dashboard layout with responsive grid', 'Implement the data table with sorting and filtering', 'Create the form wizard with validation'],
    capabilities: ['Component design and implementation', 'Responsive layout systems', 'State management patterns', 'Performance optimization', 'Accessibility compliance'],
    workflow: ['Review wireframes and design specs', 'Explore existing component library', 'Build with accessibility first', 'Test across viewports', 'Write recommendation for UI improvements'],
    guardrails: ['Won\'t ignore accessibility', 'Won\'t skip responsive design', 'Won\'t create components without considering reuse'],
  },
  'devops-engineer': {
    personality: 'Automates everything, hates manual processes. Thinks in pipelines, containers, and infrastructure-as-code. Reliability is religion.',
    expertise: ['CI/CD pipelines', 'Docker/Kubernetes', 'Cloud infrastructure', 'Monitoring', 'Deployment strategies'],
    examples: ['Set up the CI/CD pipeline with automated testing', 'Containerize the application with Docker', 'Configure blue-green deployment for zero downtime'],
    capabilities: ['Pipeline design and implementation', 'Container orchestration', 'Infrastructure as code', 'Monitoring and alerting', 'Deployment automation'],
    workflow: ['Assess current infrastructure', 'Design pipeline architecture', 'Implement with IaC', 'Set up monitoring', 'Write recommendation for infra improvements'],
    guardrails: ['Won\'t deploy without health checks', 'Won\'t skip rollback procedures', 'Won\'t hardcode secrets'],
  },
  'data-engineer': {
    personality: 'Obsessed with data integrity and query performance. Thinks in schemas, indexes, and migration safety. Every millisecond counts.',
    expertise: ['Schema design', 'Query optimization', 'Database migrations', 'ETL pipelines', 'Data modeling'],
    examples: ['Design the schema for the multi-tenant system', 'Optimize queries that are causing timeouts', 'Plan the database migration strategy'],
    capabilities: ['Schema design and normalization', 'Index strategy optimization', 'Migration planning and execution', 'Query performance analysis', 'Data pipeline design'],
    workflow: ['Analyze current data model', 'Profile query performance', 'Design schema improvements', 'Plan safe migrations', 'Write recommendation with benchmarks'],
    guardrails: ['Won\'t run migrations without backups', 'Won\'t skip index analysis', 'Won\'t denormalize without justification'],
  },
  'security-auditor': {
    personality: 'Paranoid in the best way. Thinks in threat models and attack vectors. Assumes every input is hostile until proven otherwise.',
    expertise: ['OWASP Top 10', 'Authentication flows', 'Secrets management', 'Compliance', 'Vulnerability assessment'],
    examples: ['Audit the authentication system for vulnerabilities', 'Review API endpoints for injection risks', 'Assess secrets management practices'],
    capabilities: ['Threat modeling', 'Vulnerability scanning', 'Auth flow analysis', 'Secrets management audit', 'Compliance gap assessment'],
    workflow: ['Map attack surface', 'Review auth and authz flows', 'Check for OWASP Top 10', 'Assess secrets handling', 'Write recommendation with severity ratings'],
    guardrails: ['Won\'t approve security-by-obscurity', 'Won\'t skip input validation checks', 'Won\'t store secrets in code'],
  },
  'qa-lead': {
    personality: 'Quality obsessed, finds edge cases others miss. Believes testing is not a phase but a mindset. Ships confidence, not just code.',
    expertise: ['Test strategy', 'E2E testing', 'Regression suites', 'Load testing', 'Test automation'],
    examples: ['Design the test strategy for the payments module', 'Set up E2E tests for the critical user flows', 'Run load tests before the product launch'],
    capabilities: ['Test pyramid design', 'E2E test automation', 'Load and stress testing', 'Regression suite management', 'Test coverage analysis'],
    workflow: ['Review feature requirements', 'Design test strategy', 'Identify critical paths', 'Set up test automation', 'Write recommendation for test improvements'],
    guardrails: ['Won\'t ship without smoke tests', 'Won\'t skip edge case analysis', 'Won\'t rely solely on unit tests'],
  },
  'product-owner': {
    personality: 'Bridges business and engineering. Thinks in user value and acceptance criteria. Ruthless about prioritization, empathetic about user needs.',
    expertise: ['Requirements gathering', 'User stories', 'Sprint planning', 'Prioritization', 'Stakeholder management'],
    examples: ['Write user stories for the new dashboard feature', 'Prioritize the backlog for next sprint', 'Define acceptance criteria for the search functionality'],
    capabilities: ['Requirements analysis', 'User story creation', 'Backlog prioritization', 'Sprint planning', 'Acceptance criteria definition'],
    workflow: ['Gather requirements from stakeholders', 'Write user stories with acceptance criteria', 'Prioritize using RICE/MoSCoW', 'Plan sprint scope', 'Write recommendation for feature priorities'],
    guardrails: ['Won\'t skip acceptance criteria', 'Won\'t prioritize without data', 'Won\'t scope without engineering input'],
  },
  'ux-researcher': {
    personality: 'Advocates for the user in every decision. Thinks in flows, friction points, and cognitive load. Data-informed but empathy-driven.',
    expertise: ['User flows', 'Wireframes', 'Accessibility audits', 'Usability testing', 'Information architecture'],
    examples: ['Map the onboarding flow and identify friction points', 'Audit the app for WCAG 2.1 compliance', 'Design wireframes for the settings page'],
    capabilities: ['User flow mapping', 'Heuristic evaluation', 'Accessibility audit', 'Wireframe design', 'Usability analysis'],
    workflow: ['Map current user flows', 'Identify friction points', 'Evaluate against heuristics', 'Propose improvements', 'Write recommendation for UX improvements'],
    guardrails: ['Won\'t skip accessibility review', 'Won\'t design without user context', 'Won\'t ignore mobile experience'],
  },
  'api-designer': {
    personality: 'Designs APIs that are a pleasure to consume. Thinks in contracts, consistency, and developer experience. API-first, always.',
    expertise: ['REST/GraphQL design', 'OpenAPI specs', 'API versioning', 'API governance', 'Developer experience'],
    examples: ['Design the REST API for the project management module', 'Create OpenAPI spec for the billing endpoints', 'Plan API versioning strategy'],
    capabilities: ['API contract design', 'OpenAPI/Swagger spec creation', 'Versioning strategy', 'Error response standardization', 'API documentation'],
    workflow: ['Review domain requirements', 'Design resource model', 'Write OpenAPI spec', 'Define error contracts', 'Write recommendation for API improvements'],
    guardrails: ['Won\'t skip error response design', 'Won\'t ignore pagination', 'Won\'t break existing contracts without versioning'],
  },
  'performance-engineer': {
    personality: 'Obsessed with milliseconds and percentiles. Every slow query is a personal affront. Measures twice, optimizes once.',
    expertise: ['Profiling', 'Caching strategies', 'CDN optimization', 'Database tuning', 'Load testing'],
    examples: ['Profile the API endpoints and identify bottlenecks', 'Design the caching strategy for the product catalog', 'Tune database queries for the reports page'],
    capabilities: ['Application profiling', 'Cache strategy design', 'Database query optimization', 'Load test design', 'Performance monitoring'],
    workflow: ['Profile application performance', 'Identify bottlenecks', 'Design optimization strategy', 'Validate with benchmarks', 'Write recommendation with metrics'],
    guardrails: ['Won\'t optimize without measuring first', 'Won\'t add caching without invalidation strategy', 'Won\'t skip load testing before launch'],
  },
  'technical-writer': {
    personality: 'Makes complex things understandable. Believes good docs are a feature, not an afterthought. Writes for the reader, not the author.',
    expertise: ['API documentation', 'Runbooks', 'Architecture Decision Records', 'Onboarding guides', 'Technical specs'],
    examples: ['Write API reference docs for the public endpoints', 'Create a runbook for the deployment process', 'Document the authentication architecture'],
    capabilities: ['API reference documentation', 'Runbook creation', 'ADR authoring', 'Onboarding guide design', 'Technical spec writing'],
    workflow: ['Review existing documentation', 'Identify documentation gaps', 'Write clear, structured docs', 'Add examples and diagrams', 'Write recommendation for doc improvements'],
    guardrails: ['Won\'t write docs without examples', 'Won\'t skip API error documentation', 'Won\'t ignore versioning in docs'],
  },
  'project-manager': {
    personality: 'Keeps projects on track without micromanaging. Thinks in dependencies, risks, and milestones. Communicates status, not excuses.',
    expertise: ['Timeline management', 'Dependency tracking', 'Risk management', 'Status reporting', 'Sprint ceremonies'],
    examples: ['Create a project timeline with milestones', 'Identify risks for the upcoming release', 'Generate a status report for stakeholders'],
    capabilities: ['Timeline and milestone planning', 'Dependency graph analysis', 'Risk assessment and mitigation', 'Status reporting', 'Resource allocation'],
    workflow: ['Assess project scope and timeline', 'Map dependencies and critical path', 'Identify and rate risks', 'Plan milestones', 'Write recommendation for project health'],
    guardrails: ['Won\'t ignore dependencies', 'Won\'t skip risk assessment', 'Won\'t set deadlines without engineering input'],
  },
  'code-reviewer': {
    personality: 'Constructive but thorough. Reads code like a detective reads clues. Cares about the team\'s future self, not just passing CI.',
    expertise: ['PR reviews', 'Code quality assessment', 'Convention enforcement', 'Tech debt identification', 'Refactoring recommendations'],
    examples: ['Review the authentication module for code quality', 'Identify tech debt in the API layer', 'Assess code conventions across the project'],
    capabilities: ['Code quality analysis', 'Convention compliance checking', 'Tech debt scoring', 'Refactoring recommendations', 'Complexity analysis'],
    workflow: ['Read project conventions', 'Analyze code structure', 'Check for code smells', 'Assess complexity metrics', 'Write recommendation for code quality improvements'],
    guardrails: ['Won\'t nitpick style without substance', 'Won\'t approve without understanding context', 'Won\'t ignore test coverage'],
  },
};

export default function AgentDetailPanel({ agentId, onClose }) {
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const allRecommendations = useStore((s) => s.recommendations);
  const agentAliases = useStore((s) => s.agentAliases);
  const setAgentAliases = useStore((s) => s.setAgentAliases);
  const agentBrains = useStore((s) => s.agentBrains);
  const setAgentBrain = useStore((s) => s.setAgentBrain);
  const [aliasInput, setAliasInput] = useState('');
  const [showAliasInput, setShowAliasInput] = useState(false);

  const recommendations = useMemo(
    () => allRecommendations.filter((r) =>
      r.agent?.toLowerCase().replace(/\s+/g, '-') === agentId ||
      r.agentId === agentId
    ),
    [allRecommendations, agentId]
  );

  if (!agent) return null;

  const details = AGENT_DETAILS[agentId] || {};
  const invoke = AGENT_INVOKE[agentId] || `@${agent.name}`;
  const icon = AGENT_ICONS[agentId] || '';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Slide-out panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-forge-surface border-l border-forge-border z-50 shadow-2xl animate-slide-left overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-forge-surface border-b border-forge-border px-6 py-4 z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${agent.color}20` }}
              >
                {icon}
              </div>
              <div>
                <h2 className="font-mono font-bold text-forge-text-primary">
                  {agent.name}
                </h2>
                <div className="text-xs text-forge-text-secondary">{agent.role}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-forge-text-muted hover:text-forge-text-secondary transition-colors text-lg mt-1"
            >
              &times;
            </button>
          </div>

          {/* Invoke badge + aliases */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <code
                className="px-2 py-1 rounded text-xs font-mono"
                style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
              >
                {invoke}
              </code>
              {(agentAliases[agentId] || []).map((alias) => (
                <span
                  key={alias}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono group"
                  style={{ backgroundColor: `${agent.color}10`, color: agent.color }}
                >
                  @{alias}
                  <button
                    onClick={() => {
                      const updated = (agentAliases[agentId] || []).filter(a => a !== alias);
                      setAgentAliases(agentId, updated);
                      playSound('dismiss');
                    }}
                    className="text-forge-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] ml-0.5"
                  >
                    {'\u00D7'}
                  </button>
                </span>
              ))}
              {/* Inline add alias — toggles between + button and input */}
              {showAliasInput ? (
                <input
                  type="text"
                  autoFocus
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aliasInput.trim()) {
                      const current = agentAliases[agentId] || [];
                      if (!current.includes(aliasInput.trim())) {
                        setAgentAliases(agentId, [...current, aliasInput.trim()]);
                        playSound('copy');
                      }
                      setAliasInput('');
                      setShowAliasInput(false);
                    }
                    if (e.key === 'Escape') {
                      setAliasInput('');
                      setShowAliasInput(false);
                    }
                  }}
                  onBlur={() => {
                    if (aliasInput.trim()) {
                      const current = agentAliases[agentId] || [];
                      if (!current.includes(aliasInput.trim())) {
                        setAgentAliases(agentId, [...current, aliasInput.trim()]);
                        playSound('copy');
                      }
                    }
                    setAliasInput('');
                    setShowAliasInput(false);
                  }}
                  placeholder="e.g. TA"
                  className="px-2 py-1 rounded text-xs font-mono w-20
                             bg-forge-bg/80 border border-dashed text-forge-text-secondary
                             placeholder:text-forge-text-muted/40
                             focus:outline-none transition-colors"
                  style={{ borderColor: `${agent.color}50` }}
                />
              ) : (
                <button
                  onClick={() => setShowAliasInput(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono
                             border border-dashed cursor-pointer transition-all
                             hover:opacity-100 opacity-70"
                  style={{
                    backgroundColor: `${agent.color}08`,
                    color: agent.color,
                    borderColor: `${agent.color}40`,
                  }}
                >
                  + alias
                </button>
              )}
              <span className="text-[10px] text-forge-text-muted">
                invoke in terminal
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Brain Selection */}
          <BrainSelector agentId={agentId} agentBrains={agentBrains} setAgentBrain={setAgentBrain} agentColor={agent.color} />

          {/* Personality */}
          {details.personality && (
            <Section title="Personality">
              <p className="text-sm text-forge-text-secondary leading-relaxed italic">
                "{details.personality}"
              </p>
            </Section>
          )}

          {/* Expertise */}
          {details.expertise && (
            <Section title="Expertise">
              <div className="flex flex-wrap gap-1.5">
                {details.expertise.map((skill, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-lg text-[11px] font-medium bg-forge-bg border border-forge-border text-forge-text-secondary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Example Commands */}
          {details.examples && (
            <Section title="Try Asking">
              <div className="space-y-1.5">
                {details.examples.map((example, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-lg bg-forge-bg/70 border border-forge-border/50 text-xs font-mono cursor-pointer hover:border-forge-accent/30 hover:bg-forge-bg transition-all group"
                  >
                    <span style={{ color: agent.color }}>{invoke}</span>{' '}
                    <span className="text-forge-text-secondary group-hover:text-forge-text-primary transition-colors">
                      {example}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recent Recommendations from this agent */}
          {recommendations.length > 0 && (
            <Section title={`Recent Recommendations (${recommendations.length})`}>
              <div className="space-y-2">
                {recommendations.slice(0, 3).map((rec, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-forge-bg/50 border border-forge-border"
                  >
                    <div className="text-xs font-medium text-forge-text-primary">{recDisplayTitle(rec)}</div>
                    <div className="text-[10px] text-forge-text-muted mt-1">{rec.project}</div>
                    {rec.summary && (
                      <div className="text-[11px] text-forge-text-secondary mt-1 leading-relaxed">
                        {rec.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Status */}
          <Section title="Status">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: agent.color }}
              />
              <span className="text-xs text-forge-text-secondary">Ready</span>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function BrainSelector({ agentId, agentBrains, setAgentBrain, agentColor }) {
  const brain = getAgentBrain(agentId, agentBrains);
  const modelInfo = getModelDisplay(brain);
  const recommended = RECOMMENDED_BRAINS[agentId];
  const isRecommended = recommended && brain.model === recommended.model;

  const providers = Object.entries(BRAIN_PROVIDERS);
  const activeProvider = BRAIN_PROVIDERS[brain.provider] || BRAIN_PROVIDERS.claude;

  return (
    <Section title="Brain">
      <div className="space-y-3">
        {/* Provider selector */}
        <div className="flex items-center gap-1.5">
          {providers.map(([key, prov]) => (
            <button
              key={key}
              onClick={() => {
                if (prov.active) {
                  setAgentBrain(agentId, { provider: key, model: prov.models[0]?.id || 'opus' });
                  playSound('click');
                }
              }}
              disabled={!prov.active}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                brain.provider === key
                  ? 'border-current bg-current/10'
                  : prov.active
                    ? 'border-forge-border text-forge-text-muted hover:text-forge-text-secondary hover:border-forge-border/80'
                    : 'border-forge-border/30 text-forge-text-muted/30 cursor-not-allowed'
              }`}
              style={brain.provider === key ? { color: prov.color, borderColor: `${prov.color}40`, backgroundColor: `${prov.color}10` } : undefined}
              title={!prov.active ? 'Coming Soon' : prov.name}
            >
              <span>{prov.icon}</span>
              <span>{prov.name.split(' ')[0]}</span>
              {!prov.active && <span className="text-[9px] opacity-50">Soon</span>}
            </button>
          ))}
        </div>

        {/* Model selector (only for active provider) */}
        {activeProvider.active && activeProvider.models.length > 0 && (
          <div className="space-y-1.5">
            {activeProvider.models.map((model) => {
              const isSelected = brain.model === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    setAgentBrain(agentId, { provider: brain.provider, model: model.id });
                    playSound('click');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all border ${
                    isSelected
                      ? 'border-current/30 bg-current/5'
                      : 'border-forge-border/50 hover:border-forge-border hover:bg-forge-bg/50'
                  }`}
                  style={isSelected ? { borderColor: `${model.color}40`, backgroundColor: `${model.color}08` } : undefined}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isSelected ? '' : 'opacity-30'}`}
                    style={{ backgroundColor: model.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${isSelected ? 'text-forge-text-primary' : 'text-forge-text-secondary'}`}>
                        {model.name}
                      </span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{ color: model.color, backgroundColor: `${model.color}12` }}
                      >
                        {model.tier}
                      </span>
                    </div>
                    <div className="text-[10px] text-forge-text-muted mt-0.5">{model.desc}</div>
                  </div>
                  {isSelected && (
                    <span className="text-xs flex-shrink-0" style={{ color: model.color }}>{'\u2713'}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Recommended preset */}
        {recommended && !isRecommended && (
          <button
            onClick={() => {
              setAgentBrain(agentId, { provider: 'claude', model: recommended.model });
              playSound('click');
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-forge-accent/30
                       text-[11px] text-forge-accent/80 hover:bg-forge-accent/5 hover:border-forge-accent/50 transition-all"
          >
            <span>{'\u2728'}</span>
            <span>Use Recommended: <strong>{BRAIN_PROVIDERS.claude.models.find(m => m.id === recommended.model)?.name}</strong></span>
            <span className="text-forge-text-muted ml-auto text-[10px]">{recommended.reason}</span>
          </button>
        )}

        {/* Current status indicator */}
        {isRecommended && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-forge-bg/50 border border-forge-border/30">
            <span className="text-[10px] text-green-400">{'\u2713'}</span>
            <span className="text-[10px] text-forge-text-muted">Using recommended model</span>
            <span className="text-[10px] text-forge-text-muted/60 ml-auto">{recommended.reason}</span>
          </div>
        )}
      </div>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[10px] font-mono font-semibold text-forge-text-muted uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}
