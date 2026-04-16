// Sample recommendations for dev/browser mode (loaded when Electron APIs aren't available)
// In production, these come from hq-data/ files via the file watcher

export const SAMPLE_RECOMMENDATIONS = [
  {
    agent: "Solutions Architect",
    agentColor: "#0EA5E9",
    project: "sample-project",
    timestamp: "2026-03-15T08:00:00Z",
    type: "recommendation",
    title: "API Gateway pattern — centralize auth, rate limiting, and routing",
    summary: "Current architecture has auth logic duplicated across 6 services. An API gateway would consolidate cross-cutting concerns and simplify service internals.",
    approaches: [
      {
        id: 1,
        name: "Kong/Nginx API Gateway",
        description: "Deploy Kong or Nginx as a reverse proxy handling auth, rate limiting, and request routing. Services become pure business logic.",
        trade_offs: "Adds infrastructure complexity. Single point of failure without HA config.",
        effort: "medium",
        impact: "high"
      },
      {
        id: 2,
        name: "Custom Express middleware gateway",
        description: "Build a lightweight Node.js gateway with shared middleware for auth, logging, and rate limiting.",
        trade_offs: "More control but more maintenance. Need to handle scaling yourself.",
        effort: "medium",
        impact: "medium"
      },
      {
        id: 3,
        name: "Service mesh (Istio/Linkerd)",
        description: "Deploy a service mesh for transparent mTLS, traffic management, and observability.",
        trade_offs: "Heavy operational overhead. Overkill for current scale but future-proof.",
        effort: "high",
        impact: "high"
      }
    ],
    recommended: 1,
    reasoning: "Kong provides production-grade gateway capabilities out of the box. Fastest path to consolidating auth and rate limiting without building custom infrastructure.",
    phase_relevant: ["design", "build"],
    status: "active"
  },
  {
    agent: "Backend Engineer",
    agentColor: "#3B82F6",
    project: "sample-project",
    timestamp: "2026-03-15T09:30:00Z",
    type: "recommendation",
    title: "Database query optimization — N+1 queries on user dashboard endpoint",
    summary: "The /api/dashboard endpoint executes 47 queries per request due to N+1 loading of user projects and their dependencies. Eager loading would reduce this to 3 queries.",
    approaches: [
      {
        id: 1,
        name: "Eager loading with JOIN queries",
        description: "Refactor ORM queries to use eager loading (include/populate). Fetch users, projects, and deps in 3 queries max.",
        trade_offs: "Larger result sets per query. May need query tuning for large datasets.",
        effort: "low",
        impact: "high"
      },
      {
        id: 2,
        name: "DataLoader batching pattern",
        description: "Implement DataLoader-style batching to coalesce individual lookups into batch queries per tick.",
        trade_offs: "More architectural change. Better for GraphQL but adds complexity for REST.",
        effort: "medium",
        impact: "high"
      }
    ],
    recommended: 1,
    reasoning: "Eager loading is the simplest fix with the biggest impact. 47 queries down to 3 is a 15x reduction in DB round trips.",
    phase_relevant: ["build", "test"],
    status: "active"
  },
  {
    agent: "Security Auditor",
    agentColor: "#EF4444",
    project: "sample-project",
    timestamp: "2026-03-15T10:00:00Z",
    type: "recommendation",
    title: "Auth flow audit — JWT tokens lack rotation, refresh tokens stored in localStorage",
    summary: "Three critical findings: JWTs have no expiry rotation, refresh tokens in localStorage are XSS-vulnerable, and password reset tokens don't expire.",
    approaches: [
      {
        id: 1,
        name: "HttpOnly cookie + token rotation",
        description: "Move refresh tokens to HttpOnly secure cookies. Implement JWT rotation with 15-min access tokens and 7-day refresh tokens.",
        trade_offs: "Requires CORS config changes. Mobile clients need different flow.",
        effort: "medium",
        impact: "high"
      },
      {
        id: 2,
        name: "Session-based auth with Redis",
        description: "Replace JWT entirely with server-side sessions stored in Redis. Simpler revocation, no token management.",
        trade_offs: "Adds Redis dependency. Stateful servers complicate horizontal scaling.",
        effort: "high",
        impact: "high"
      }
    ],
    recommended: 1,
    reasoning: "HttpOnly cookies with token rotation is the industry standard fix. Addresses XSS vector immediately while keeping the JWT architecture intact.",
    phase_relevant: ["build", "deploy"],
    status: "active"
  },
  {
    agent: "QA Lead",
    agentColor: "#DC2626",
    project: "sample-project",
    timestamp: "2026-03-15T11:00:00Z",
    type: "recommendation",
    title: "Test coverage gaps — critical payment flow has 12% coverage",
    summary: "Payment processing, user registration, and data export flows are under 20% test coverage. These are the highest-risk paths with the least safety net.",
    approaches: [
      {
        id: 1,
        name: "Integration test blitz for critical paths",
        description: "Write integration tests for the top 5 critical flows: payment, registration, password reset, data export, and role permissions.",
        trade_offs: "2-3 days of focused test writing. Delays feature work but de-risks deployment.",
        effort: "medium",
        impact: "high"
      },
      {
        id: 2,
        name: "Contract testing + E2E smoke suite",
        description: "Add Pact contract tests for API boundaries plus a Playwright E2E smoke suite for happy paths.",
        trade_offs: "More infrastructure setup. But catches both API drift and UI regressions.",
        effort: "high",
        impact: "high"
      }
    ],
    recommended: 1,
    reasoning: "Integration tests for critical paths give the highest confidence-per-hour. Payment and auth flows breaking in production is unacceptable.",
    phase_relevant: ["test", "deploy"],
    status: "active"
  },
  {
    agent: "Performance Engineer",
    agentColor: "#F97316",
    project: "sample-project",
    timestamp: "2026-03-15T12:00:00Z",
    type: "recommendation",
    title: "API response times — P95 at 2.3s, target is 500ms",
    summary: "The project list endpoint P95 is 2.3 seconds. Root cause: unindexed query on projects table (1.2M rows) plus synchronous thumbnail generation on each request.",
    approaches: [
      {
        id: 1,
        name: "Add composite index + async thumbnail generation",
        description: "Add a composite index on (user_id, updated_at) and move thumbnail generation to a background job with CDN caching.",
        trade_offs: "Index adds ~200MB storage. Background job needs queue infrastructure.",
        effort: "medium",
        impact: "high"
      },
      {
        id: 2,
        name: "Read replica + Redis caching layer",
        description: "Route read queries to a replica. Cache hot project lists in Redis with 60s TTL.",
        trade_offs: "Adds infrastructure cost. Cache invalidation complexity.",
        effort: "high",
        impact: "high"
      }
    ],
    recommended: 1,
    reasoning: "The composite index alone should cut query time from 1.8s to ~50ms. Combined with async thumbnails, P95 should drop below 300ms.",
    phase_relevant: ["build", "deploy"],
    status: "active"
  },
  {
    agent: "Code Reviewer",
    agentColor: "#D4A574",
    project: "sample-project",
    timestamp: "2026-03-15T13:00:00Z",
    type: "recommendation",
    title: "Tech debt audit — 340 TODO comments, 28 suppressed linter warnings",
    summary: "Codebase scan found 340 TODOs (67 marked FIXME), 28 eslint-disable comments, and 12 functions over 200 lines. The auth module has the highest density.",
    approaches: [
      {
        id: 1,
        name: "Prioritized cleanup sprints",
        description: "Triage TODOs by severity. Dedicate 20% of each sprint to resolving FIXMEs in critical modules (auth, payments, data export).",
        trade_offs: "Slows feature velocity by ~20%. But prevents debt compounding.",
        effort: "medium",
        impact: "high"
      },
      {
        id: 2,
        name: "Automated quality gates in CI",
        description: "Add CI checks that fail on new eslint-disable comments, functions over 150 lines, and uncategorized TODOs.",
        trade_offs: "Prevents new debt but doesn't address existing backlog.",
        effort: "low",
        impact: "medium"
      }
    ],
    recommended: 1,
    reasoning: "Cleanup sprints address the existing backlog while quality gates (approach 2) should be added alongside to prevent regression. Start with the auth module.",
    phase_relevant: ["build", "maintain"],
    status: "active"
  }
];

// Raw context.md content for dev/browser mode (keyed by project slug)
export const SAMPLE_PROJECT_CONTEXTS = {};

// File inventory per project for dev/browser mode
export const SAMPLE_DIR_INVENTORY = {};

export const SAMPLE_ACTIVITY = [
  {
    id: 1,
    agent: "Solutions Architect",
    agentColor: "#0EA5E9",
    action: "Completed API gateway architecture review — Kong recommended",
    project: "Sample Project",
    timestamp: "2026-03-15T08:00:00Z",
  },
  {
    id: 2,
    agent: "Backend Engineer",
    agentColor: "#3B82F6",
    action: "Identified N+1 query issue on dashboard endpoint — 47 queries per request",
    project: "Sample Project",
    timestamp: "2026-03-15T09:30:00Z",
  },
  {
    id: 3,
    agent: "Security Auditor",
    agentColor: "#EF4444",
    action: "Security audit completed — 3 critical vulnerabilities found in auth flow",
    project: "Sample Project",
    timestamp: "2026-03-15T10:00:00Z",
  },
  {
    id: 4,
    agent: "QA Lead",
    agentColor: "#DC2626",
    action: "Test coverage report — 78% overall, payment flow critically low at 12%",
    project: "Sample Project",
    timestamp: "2026-03-15T11:00:00Z",
  },
  {
    id: 5,
    agent: "Performance Engineer",
    agentColor: "#F97316",
    action: "API profiling complete — P95 latency at 2.3s, composite index fix proposed",
    project: "Sample Project",
    timestamp: "2026-03-15T12:00:00Z",
  },
  {
    id: 6,
    agent: "Code Reviewer",
    agentColor: "#D4A574",
    action: "Tech debt audit — 340 TODOs, 28 suppressed linter warnings, auth module highest density",
    project: "Sample Project",
    timestamp: "2026-03-15T13:00:00Z",
  },
  {
    id: 7,
    agent: "DevOps Engineer",
    agentColor: "#06B6D4",
    action: "CI/CD pipeline review — build times reduced from 12min to 4min with layer caching",
    project: "Sample Project",
    timestamp: "2026-03-15T14:00:00Z",
  },
  {
    id: 8,
    agent: "Data Engineer",
    agentColor: "#7C3AED",
    action: "Schema migration plan drafted — 3 tables need normalization, zero-downtime strategy",
    project: "Sample Project",
    timestamp: "2026-03-15T15:00:00Z",
  },
  {
    id: 9,
    agent: "API Designer",
    agentColor: "#22C55E",
    action: "OpenAPI spec generated for v2 endpoints — 23 routes documented with examples",
    project: "Sample Project",
    timestamp: "2026-03-15T16:00:00Z",
  },
  {
    id: 10,
    agent: "Product Owner",
    agentColor: "#EAB308",
    action: "Sprint planning complete — 14 stories prioritized, 3 blockers escalated",
    project: "Sample Project",
    timestamp: "2026-03-15T17:00:00Z",
  },
];
