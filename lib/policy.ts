import { NODE_CATALOG } from "./catalog";
import { stableHash } from "./planner";
import type {
  DeniedField,
  MetricKey,
  NodeId,
  PlanTask,
  PolicyDecision,
  QueryPlan,
  UserRole,
} from "./types";

const ROLE_METRICS: Record<UserRole, Record<NodeId, MetricKey[]>> = {
  "policy-analyst": {
    agriculture: NODE_CATALOG.agriculture.publishedMetrics,
    energy: NODE_CATALOG.energy.publishedMetrics,
    biodiversity: NODE_CATALOG.biodiversity.publishedMetrics,
  },
  executive: {
    agriculture: NODE_CATALOG.agriculture.publishedMetrics,
    energy: NODE_CATALOG.energy.publishedMetrics,
    biodiversity: NODE_CATALOG.biodiversity.publishedMetrics,
  },
  "public-reviewer": {
    agriculture: ["yield_t_ha", "soil_moisture_index", "risk_index"],
    energy: ["renewable_share_pct", "risk_index"],
    biodiversity: [
      "habitat_condition_index",
      "protected_coverage_pct",
      "risk_index",
    ],
  },
};

const SAFE_ALTERNATIVES: Record<string, string> = {
  farmer_name: "Request a regional farm-count or yield aggregate.",
  household_address: "Request a regional agriculture risk aggregate.",
  plot_id: "Request a regional plot-count band or yield aggregate.",
  meter_id: "Request regional load or renewable-share aggregates.",
  operator_shift: "Request a regional reserve-margin aggregate.",
  exact_coordinates: "Request a regional habitat-condition aggregate.",
  nest_location: "Request protected-coverage by region.",
  observer_profile_location: "Request a regional observation-count band.",
  raw_rows: "Use the approved regional aggregate tools.",
  cross_node_join_key: "Compare independently aggregated regional metrics.",
  system_prompt: "Ask a domain question without requesting hidden instructions.",
  audit_controls: "Audit trace is mandatory and cannot be disabled.",
  unapproved_tool: "Use only the published regional aggregate tools.",
  synthetic_canary: "Request aggregate metrics without internal marker values.",
};

function rawFieldDenials(plan: QueryPlan): DeniedField[] {
  return plan.signals.rawFields.map((request) => ({
    field: request.field,
    node: request.node,
    ruleId: "POL-RAW-001",
    reason: `The ${request.matchedAlias} field is outside every aggregate tool contract.`,
    safeAlternative:
      SAFE_ALTERNATIVES[request.field] ?? "Request a published aggregate instead.",
  }));
}

function filterTaskForRole(
  task: PlanTask,
  role: UserRole,
): { task: PlanTask | null; denied: DeniedField[] } {
  const allowed = ROLE_METRICS[role][task.node];
  const approvedMetrics = task.metrics.filter((metric) => allowed.includes(metric));
  const denied = task.metrics
    .filter((metric) => !allowed.includes(metric))
    .map((metric) => ({
      field: metric,
      node: task.node,
      ruleId: "POL-ROLE-002",
      reason: `${role} cannot request this operational metric.`,
      safeAlternative: `Use one of: ${allowed.join(", ")}.`,
    }));
  return {
    task:
      approvedMetrics.length > 0
        ? { ...task, metrics: approvedMetrics }
        : null,
    denied,
  };
}

export function evaluatePolicy(
  plan: QueryPlan,
  role: UserRole,
  revokedNodes: NodeId[] = [],
): PolicyDecision {
  const deniedFields = rawFieldDenials(plan);
  const appliedRules = ["POL-BOUNDARY-001", "POL-ROLE-002", "POL-TOOL-003"];

  if (plan.signals.injectionSignals.length > 0) {
    deniedFields.push({
      field: "instruction_override",
      node: "system",
      ruleId: "POL-INJECTION-004",
      reason: `Instruction-boundary signal detected: ${plan.signals.injectionSignals.join(", ")}.`,
      safeAlternative: "Submit a direct domain question without policy-changing instructions.",
    });
    appliedRules.push("POL-INJECTION-004");
  }

  if (plan.signals.egressSignals.length > 0) {
    deniedFields.push({
      field: "egress_sink",
      node: "system",
      ruleId: "POL-EGRESS-005",
      reason: `Unapproved output sink detected: ${plan.signals.egressSignals.join(", ")}.`,
      safeAlternative: "Use the on-screen aggregate response only.",
    });
    appliedRules.push("POL-EGRESS-005");
  }

  if (plan.signals.roleClaimedInPrompt) {
    deniedFields.push({
      field: "role_override",
      node: "system",
      ruleId: "POL-IDENTITY-006",
      reason: "Prompt text cannot change the caller-selected demo scenario role.",
      safeAlternative: `The demo continues under the selected ${role} scenario policy.`,
    });
    appliedRules.push("POL-IDENTITY-006");
  }

  const blockedByInstruction =
    plan.signals.injectionSignals.length > 0 ||
    plan.signals.egressSignals.length > 0;
  const approvedTasks: PlanTask[] = [];
  if (!blockedByInstruction) {
    for (const task of plan.tasks) {
      if (revokedNodes.includes(task.node)) {
        deniedFields.push({
          field: "node_access",
          node: task.node,
          ruleId: "POL-REVOCATION-007",
          reason: "Custodian access was revoked before execution.",
          safeAlternative: "Retry after the custodian restores access.",
        });
        appliedRules.push("POL-REVOCATION-007");
        continue;
      }
      const filtered = filterTaskForRole(task, role);
      deniedFields.push(...filtered.denied);
      if (filtered.task) {
        approvedTasks.push(filtered.task);
      }
    }
  }

  let verdict: PolicyDecision["verdict"];
  if (plan.intent === "out-of-scope" && deniedFields.length === 0) {
    verdict = "abstain";
  } else if (approvedTasks.length === 0) {
    verdict = "deny";
  } else if (deniedFields.length > 0) {
    verdict = "partial";
  } else {
    verdict = "allow";
  }

  return {
    id: `decision-${stableHash(`${plan.id}:${role}:${revokedNodes.join(",")}`)}`,
    policyVersion: "custodian-policy-1.0",
    role,
    verdict,
    approvedTasks,
    deniedFields,
    appliedRules: [...new Set(appliedRules)],
  };
}
