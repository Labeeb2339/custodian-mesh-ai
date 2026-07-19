export const NODE_IDS = ["agriculture", "energy", "biodiversity"] as const;

export type NodeId = (typeof NODE_IDS)[number];

export const USER_ROLES = [
  "policy-analyst",
  "executive",
  "public-reviewer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type QueryIntent =
  | "sector-overview"
  | "risk-scan"
  | "cross-domain-compare"
  | "policy-probe"
  | "out-of-scope";

export type MetricKey =
  | "yield_t_ha"
  | "irrigation_stress_pct"
  | "soil_moisture_index"
  | "renewable_share_pct"
  | "peak_load_mw"
  | "reserve_margin_pct"
  | "habitat_condition_index"
  | "pressure_index"
  | "protected_coverage_pct"
  | "risk_index";

export type ToolName =
  | "agriculture.aggregate_region"
  | "energy.aggregate_region"
  | "biodiversity.aggregate_region";

export interface QueryRequest {
  query: string;
  role: UserRole;
}

export interface PlannerSignals {
  rawFields: SensitiveFieldRequest[];
  injectionSignals: string[];
  egressSignals: string[];
  explicitSafeMetricCount: number;
  roleClaimedInPrompt: boolean;
}

export interface PlanTask {
  id: string;
  node: NodeId;
  tool: ToolName;
  groupBy: "region";
  metrics: MetricKey[];
  rationale: string;
}

export interface QueryPlan {
  id: string;
  version: "planner-1.0";
  normalizedQuery: string;
  intent: QueryIntent;
  requestedNodes: NodeId[];
  tasks: PlanTask[];
  signals: PlannerSignals;
}

export interface SensitiveFieldRequest {
  field: string;
  node: NodeId | "cross-node";
  matchedAlias: string;
}

export interface DeniedField {
  field: string;
  node: NodeId | "cross-node" | "system";
  ruleId: string;
  reason: string;
  safeAlternative: string;
}

export type PolicyVerdict = "allow" | "partial" | "deny" | "abstain";

export interface PolicyDecision {
  id: string;
  policyVersion: "custodian-policy-1.0";
  role: UserRole;
  verdict: PolicyVerdict;
  approvedTasks: PlanTask[];
  deniedFields: DeniedField[];
  appliedRules: string[];
}

export interface AggregateRow {
  region: string;
  values: Partial<Record<MetricKey, number | null>>;
  cellSizeBand: "<5" | "5+";
  recordsAggregated: number | null;
  suppressed: boolean;
}

export interface NodeProvenance {
  sourceId: string;
  sourceTitle: string;
  agency: string;
  revision: string;
  dataWindow: string;
  method: "deterministic-in-memory-aggregate";
  aggregationLevel: "region";
  suppressionRule: "k>=5";
  publishedGroups: number;
}

export interface NodeToolResult {
  node: NodeId;
  tool: ToolName;
  metrics: MetricKey[];
  rows: AggregateRow[];
  provenance: NodeProvenance;
}

export interface Citation {
  id: string;
  node: NodeId;
  title: string;
  agency: string;
  sourceId: string;
  revision: string;
  dataWindow: string;
  method: string;
  uri: string;
}

export interface ProvenanceIssue {
  node: NodeId;
  status: "stale" | "missing" | "conflict" | "unregistered";
  message: string;
}

export interface AuditStep {
  sequence: number;
  phase:
    | "gateway"
    | "planner"
    | "policy"
    | "broker"
    | "node"
    | "provenance"
    | "composer";
  actor: string;
  action: string;
  status: "ok" | "denied" | "suppressed" | "skipped";
  detail: string;
}

export interface RegionalSignal {
  region: string;
  compositeRisk: number;
  contributingNodes: number;
}

export interface QueryResponse {
  traceId: string;
  query: string;
  role: UserRole;
  roleContext: {
    source: "caller-selected-demo-scenario";
    authenticated: false;
    productionUseBlocked: true;
  };
  status: "completed" | "partial" | "denied" | "abstained";
  summary: string;
  highlights: string[];
  plan: QueryPlan;
  policy: PolicyDecision;
  results: NodeToolResult[];
  regionalSignals: RegionalSignal[];
  citations: Citation[];
  provenanceIssues: ProvenanceIssue[];
  auditTrace: AuditStep[];
  mode: "deterministic";
  generatedFromSyntheticData: true;
}

export interface NodeCatalogEntry {
  id: NodeId;
  name: string;
  agency: string;
  description: string;
  tool: ToolName;
  publishedMetrics: MetricKey[];
  boundary: string;
  status: "online";
}

export type EvaluationCategory =
  | "routing"
  | "provenance"
  | "least-privilege"
  | "prompt-injection"
  | "forbidden-fields"
  | "raw-data-egress";

export type ProvenanceFault = "stale" | "missing" | "conflict";

export interface EvaluationExpectation {
  verdict: PolicyVerdict;
  allowedNodes: NodeId[];
  expectedMetrics?: Array<{ node: NodeId; metrics: MetricKey[] }>;
  forbidAllNodeCalls?: boolean;
  requiredDeniedField?: string;
  provenanceFault?: { node: NodeId; fault: ProvenanceFault };
  revokedNodes?: NodeId[];
  requireSuppressedCell?: boolean;
}

export interface EvaluationCase {
  id: string;
  category: EvaluationCategory;
  title: string;
  request: QueryRequest;
  expectation: EvaluationExpectation;
}

export interface ExecutionDiagnostics {
  nodeCalls: NodeId[];
  toolCalls: ToolName[];
  requestedMetrics: Array<{ node: NodeId; metrics: MetricKey[] }>;
  rejectedCapabilityCalls: number;
}

export interface EngineOptions {
  /** Test seam for exercising runtime adapter-result controls. Never set by API routes. */
  adapterOverrides?: Partial<
    Record<NodeId, (metrics: MetricKey[]) => unknown>
  >;
  provenanceFault?: { node: NodeId; fault: ProvenanceFault };
  revokedNodes?: NodeId[];
}

export interface EngineExecution {
  response: QueryResponse;
  diagnostics: ExecutionDiagnostics;
}

export interface EvaluationResult {
  id: string;
  category: EvaluationCategory;
  title: string;
  passed: boolean;
  verdict: PolicyVerdict;
  nodeCalls: NodeId[];
  unexpectedCapabilityCalls: number;
  detail: string;
}

export interface EvaluationSuiteResult {
  version: "eval-1.0";
  total: 30;
  passed: number;
  failed: number;
  categories: Array<{
    category: EvaluationCategory;
    passed: number;
    total: 5;
  }>;
  results: EvaluationResult[];
}
