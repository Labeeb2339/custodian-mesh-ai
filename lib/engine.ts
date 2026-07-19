import { METRIC_LABELS, NODE_CATALOG } from "./catalog";
import { executeNodeTask, NodeContractError } from "./nodes";
import { planQuery, stableHash } from "./planner";
import { evaluatePolicy } from "./policy";
import {
  citationFor,
  simulatePreflightProvenanceFault,
  validateAdapterProvenance,
} from "./provenance";
import type {
  AuditStep,
  DeniedField,
  EngineExecution,
  EngineOptions,
  ExecutionDiagnostics,
  NodeToolResult,
  PolicyDecision,
  QueryRequest,
  QueryResponse,
  RegionalSignal,
} from "./types";

const FORBIDDEN_OUTPUT_MARKERS = [
  "CANARY-",
  "farmRef",
  "farmerAlias",
  "contactCanary",
  "plotId",
  "exactLat",
  "exactLng",
  "meterId",
  "operatorShift",
  "auditCanary",
  "observationId",
  "observerId",
  "speciesCode",
  "nestLat",
  "nestLng",
  "locationCanary",
];

function emptyDiagnostics(): ExecutionDiagnostics {
  return {
    nodeCalls: [],
    toolCalls: [],
    requestedMetrics: [],
    rejectedCapabilityCalls: 0,
  };
}

function pushAudit(
  trace: AuditStep[],
  step: Omit<AuditStep, "sequence">,
): void {
  trace.push({ sequence: trace.length + 1, ...step });
}

function recalculateVerdict(decision: PolicyDecision): PolicyDecision["verdict"] {
  if (decision.approvedTasks.length === 0) {
    return "deny";
  }
  return decision.deniedFields.length > 0 ? "partial" : "allow";
}

function denyForProvenanceIssues(
  decision: PolicyDecision,
  issues: Array<{ node: NodeToolResult["node"]; message: string }>,
): PolicyDecision {
  const affectedNodes = new Set(issues.map((issue) => issue.node));
  const provenanceDenials: DeniedField[] = issues.map((issue) => ({
    field: "provenance",
    node: issue.node,
    ruleId: "PROV-GATE-001",
    reason: issue.message,
    safeAlternative: "Wait for the custodian registry to expose one current revision.",
  }));
  const updated: PolicyDecision = {
    ...decision,
    approvedTasks: decision.approvedTasks.filter(
      (task) => !affectedNodes.has(task.node),
    ),
    deniedFields: [...decision.deniedFields, ...provenanceDenials],
    appliedRules: [...new Set([...decision.appliedRules, "PROV-GATE-001"])],
  };
  updated.verdict = recalculateVerdict(updated);
  return updated;
}

function applySimulatedPreflightFault(
  decision: PolicyDecision,
  options: EngineOptions,
  trace: AuditStep[],
) {
  if (!options.provenanceFault) {
    return { decision, issues: [] };
  }
  const affectedTask = decision.approvedTasks.find(
    (task) => task.node === options.provenanceFault?.node,
  );
  if (!affectedTask) {
    return { decision, issues: [] };
  }
  const issue = simulatePreflightProvenanceFault(
    affectedTask.node,
    options.provenanceFault,
  );
  if (!issue) {
    return { decision, issues: [] };
  }
  pushAudit(trace, {
    phase: "provenance",
    actor: "regression-harness",
    action: `simulate ${affectedTask.node} registry fault`,
    status: "denied",
    detail: `${issue.message} This pre-execution fault is a fixed-suite regression simulation.`,
  });
  return {
    decision: denyForProvenanceIssues(decision, [issue]),
    issues: [issue],
  };
}

function assertAggregateBoundary(results: NodeToolResult[]): void {
  const serialized = JSON.stringify(results);
  const leakedMarkers = FORBIDDEN_OUTPUT_MARKERS.filter((marker) =>
    serialized.includes(marker),
  );
  if (leakedMarkers.length > 0) {
    throw new NodeContractError("Node output failed the aggregate egress boundary.");
  }
}

function regionalSignals(results: NodeToolResult[]): RegionalSignal[] {
  const byRegion = new Map<string, number[]>();
  for (const result of results) {
    for (const row of result.rows) {
      const risk = row.values.risk_index;
      if (row.suppressed || typeof risk !== "number") {
        continue;
      }
      const values = byRegion.get(row.region) ?? [];
      values.push(risk);
      byRegion.set(row.region, values);
    }
  }
  return [...byRegion.entries()]
    .map(([region, values]) => ({
      region,
      compositeRisk:
        Math.round(
          (values.reduce((total, value) => total + value, 0) / values.length) *
            10,
        ) / 10,
      contributingNodes: values.length,
    }))
    .sort((left, right) => right.compositeRisk - left.compositeRisk);
}

function buildHighlights(
  results: NodeToolResult[],
  signals: RegionalSignal[],
): string[] {
  const highlights = results.flatMap((result) => {
    const ranked = result.rows
      .filter(
        (row) => !row.suppressed && typeof row.values.risk_index === "number",
      )
      .sort(
        (left, right) =>
          Number(right.values.risk_index) - Number(left.values.risk_index),
      );
    const top = ranked[0];
    return top
      ? [
          `${NODE_CATALOG[result.node].name}: ${top.region} has the highest published risk index (${top.values.risk_index}/100).`,
        ]
      : [];
  });
  if (signals[0] && signals[0].contributingNodes > 1) {
    highlights.unshift(
      `${signals[0].region} is the highest cross-node composite among published aggregates (${signals[0].compositeRisk}/100).`,
    );
  }
  return highlights.slice(0, 4);
}

function statusFor(decision: PolicyDecision): QueryResponse["status"] {
  switch (decision.verdict) {
    case "allow":
      return "completed";
    case "partial":
      return "partial";
    case "abstain":
      return "abstained";
    case "deny":
      return "denied";
  }
}

function summaryFor(decision: PolicyDecision, resultCount: number): string {
  const provenanceWithheld = decision.deniedFields.some(
    (field) => field.field === "provenance",
  );
  if (decision.verdict === "abstain") {
    return "No governed node matched this request, so the planner abstained without broad fan-out.";
  }
  if (decision.verdict === "deny") {
    if (provenanceWithheld) {
      return "The result path was withheld because provenance did not pass the synthetic registry gate.";
    }
    return "The request was denied before any unapproved node operation. Review the field report for a safe aggregate alternative.";
  }
  if (decision.verdict === "partial") {
    if (provenanceWithheld) {
      return `Registered aggregates completed across ${resultCount} node${resultCount === 1 ? "" : "s"}; a provenance-gated result path was withheld before composition.`;
    }
    return `Approved aggregate components completed across ${resultCount} node${resultCount === 1 ? "" : "s"}; restricted fields were omitted before execution.`;
  }
  return `Approved regional aggregates completed across ${resultCount} custodian node${resultCount === 1 ? "" : "s"}.`;
}

export function executeQuery(
  request: QueryRequest,
  options: EngineOptions = {},
): EngineExecution {
  const diagnostics = emptyDiagnostics();
  const trace: AuditStep[] = [];
  const plan = planQuery(request.query);
  const traceId = `trace-${stableHash(`${request.role}:${plan.id}`)}`;

  pushAudit(trace, {
    phase: "gateway",
    actor: "request-gateway",
    action: "accept typed query",
    status: "ok",
    detail: `Accepted caller-selected demo scenario=${request.role}; queryHash=${stableHash(plan.normalizedQuery)}; characters=${plan.normalizedQuery.length}.`,
  });
  pushAudit(trace, {
    phase: "planner",
    actor: "deterministic-planner",
    action: "classify and route",
    status: plan.intent === "out-of-scope" ? "skipped" : "ok",
    detail: `Intent=${plan.intent}; routedNodes=${plan.requestedNodes.length}; candidateTasks=${plan.tasks.length}.`,
  });

  let decision = evaluatePolicy(plan, request.role, options.revokedNodes ?? []);
  pushAudit(trace, {
    phase: "policy",
    actor: "policy-engine",
    action: "enforce role and field contracts",
    status:
      decision.verdict === "deny"
        ? "denied"
        : decision.verdict === "abstain"
          ? "skipped"
          : "ok",
    detail: `Verdict=${decision.verdict}; approvedTasks=${decision.approvedTasks.length}; deniedFields=${decision.deniedFields.length}.`,
  });

  const provenanceGate = applySimulatedPreflightFault(decision, options, trace);
  decision = provenanceGate.decision;
  const results: NodeToolResult[] = [];
  const provenanceIssues = [...provenanceGate.issues];

  for (const task of decision.approvedTasks) {
    pushAudit(trace, {
      phase: "broker",
      actor: "least-privilege-broker",
      action: `approve ${task.tool}`,
      status: "ok",
      detail: `Fixed groupBy=region; metrics=${task.metrics.join(",")}.`,
    });
    const result = executeNodeTask(
      task,
      diagnostics,
      options.adapterOverrides?.[task.node],
    );
    const suppressed = result.rows.filter((row) => row.suppressed).length;
    pushAudit(trace, {
      phase: "node",
      actor: `${task.node}-adapter`,
      action: "execute in-node aggregate",
      status: suppressed > 0 ? "suppressed" : "ok",
      detail: `PublishedGroups=${result.provenance.publishedGroups}; suppressedGroups=${suppressed}; runtimeSchema=accepted.`,
    });
    const provenanceIssue = validateAdapterProvenance(
      result.node,
      result.provenance,
    );
    if (provenanceIssue) {
      provenanceIssues.push(provenanceIssue);
      decision = denyForProvenanceIssues(decision, [provenanceIssue]);
      pushAudit(trace, {
        phase: "provenance",
        actor: "registry",
        action: `validate returned ${task.node} provenance`,
        status: "denied",
        detail: provenanceIssue.message,
      });
      continue;
    }
    pushAudit(trace, {
      phase: "provenance",
      actor: "registry",
      action: `validate returned ${task.node} provenance`,
      status: "ok",
      detail:
        "The adapter source, revision, title, agency, window, and method matched the registry.",
    });
    results.push(result);
  }

  assertAggregateBoundary(results);
  pushAudit(trace, {
    phase: "broker",
    actor: "egress-validator",
    action: "validate aggregate response contract",
    status: "ok",
    detail:
      "Every result matched the exact runtime schema; the canary/private-field denylist was also clear as defense in depth.",
  });

  const signals = regionalSignals(results);
  const citations = results.map((result) =>
    citationFor(result.provenance, result.node),
  );
  pushAudit(trace, {
    phase: "composer",
    actor: "deterministic-composer",
    action: "compose cited response",
    status: decision.verdict === "deny" ? "denied" : "ok",
    detail: `AggregateResults=${results.length}; registryMatchedCitations=${citations.length}.`,
  });

  const sensitiveRequest =
    plan.signals.rawFields.length > 0 ||
    plan.signals.injectionSignals.length > 0 ||
    plan.signals.egressSignals.length > 0;
  const responsePlan = sensitiveRequest
    ? { ...plan, normalizedQuery: "[withheld by sensitive-input policy]" }
    : plan;
  const response: QueryResponse = {
    traceId,
    query: sensitiveRequest
      ? "Sensitive request text withheld from the response."
      : plan.normalizedQuery,
    role: request.role,
    roleContext: {
      source: "caller-selected-demo-scenario",
      authenticated: false,
      productionUseBlocked: true,
    },
    status: statusFor(decision),
    summary: summaryFor(decision, results.length),
    highlights: buildHighlights(results, signals),
    plan: responsePlan,
    policy: decision,
    results,
    regionalSignals: signals,
    citations,
    provenanceIssues,
    auditTrace: trace,
    mode: "deterministic",
    generatedFromSyntheticData: true,
  };
  return { response, diagnostics };
}

export function runQuery(
  request: QueryRequest,
  options: EngineOptions = {},
): QueryResponse {
  return executeQuery(request, options).response;
}

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric as keyof typeof METRIC_LABELS] ?? metric;
}
