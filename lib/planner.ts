import { APPROVED_TOOLS, NODE_CATALOG } from "./catalog";
import type {
  MetricKey,
  NodeId,
  PlanTask,
  QueryIntent,
  QueryPlan,
  SensitiveFieldRequest,
} from "./types";

const NODE_PATTERNS: Record<NodeId, RegExp> = {
  agriculture:
    /\b(agriculture|agri|paddy|rice|yield|irrigation|soil|farm|farmer|plot)\b/i,
  energy:
    /\b(energy|grid|electricity|load|renewable|reserve|meter|substation|power)\b/i,
  biodiversity:
    /\b(biodiversity|habitat|species|landscape|protected|ecology|nest|observer)\b/i,
};

const BROAD_SCOPE_PATTERN =
  /\b(all nodes|all sectors|cross[- ]?sector|whole system|regional overview|system overview|resilience overview)\b/i;

const SENSITIVE_PATTERNS: Array<{
  field: string;
  node: NodeId | "cross-node";
  alias: string;
  pattern: RegExp;
}> = [
  {
    field: "farmer_name",
    node: "agriculture",
    alias: "farmer identity/contact",
    pattern: /\b(farmer[_ .-]?(names?|contacts?|phones?)|farm[_ .-]?contacts?)\b/i,
  },
  {
    field: "household_address",
    node: "agriculture",
    alias: "household.address",
    pattern: /\b(household[._ -]?address|home[._ -]?address)\b/i,
  },
  {
    field: "plot_id",
    node: "agriculture",
    alias: "plot/farm identifier",
    pattern: /\b(plot|farm)[_ .-]?(id|identifier|reference)\b/i,
  },
  {
    field: "meter_id",
    node: "energy",
    alias: "meter identifier/serial",
    pattern: /\b(meter[._ -]?(id|identifier|serial)|device[._ -]?serial)\b/i,
  },
  {
    field: "operator_shift",
    node: "energy",
    alias: "operator shift",
    pattern: /\b(operator[._ -]?(name|shift|roster))\b/i,
  },
  {
    field: "exact_coordinates",
    node: "biodiversity",
    alias: "exact coordinates/location",
    pattern:
      /\b(exact[._ -]?(coordinates|location|latitude|longitude)|gps[._ -]?point)\b/i,
  },
  {
    field: "nest_location",
    node: "biodiversity",
    alias: "nest/sighting location",
    pattern: /\b(nest|sighting)[._ -]?(location|coordinates|lat|lng)\b/i,
  },
  {
    field: "observer_profile_location",
    node: "biodiversity",
    alias: "observer.profile.location",
    pattern: /observer[._ -]?profile[._ -]?location/i,
  },
  {
    field: "raw_rows",
    node: "cross-node",
    alias: "raw/row-level records",
    pattern:
      /\b(raw(?:[._ -]+[a-z]+){0,2}[._ -]+(row|rows|record|records|data)|row[._ -]?level|individual records)\b/i,
  },
  {
    field: "cross_node_join_key",
    node: "cross-node",
    alias: "row-level join",
    pattern:
      /\b(join|link|merge|match)\b.{0,32}\b(rows|records|ids|identifiers|people|households)\b/i,
  },
  {
    field: "system_prompt",
    node: "cross-node",
    alias: "system/developer prompt",
    pattern: /\b(system|developer)[_ .-]?(prompt|message|instructions?)\b/i,
  },
  {
    field: "audit_controls",
    node: "cross-node",
    alias: "audit disable/bypass",
    pattern: /\b(disable|erase|hide|skip)\b.{0,24}\b(audit|trace|logging|logs)\b/i,
  },
  {
    field: "unapproved_tool",
    node: "cross-node",
    alias: "raw export or adapter tool",
    pattern:
      /\b(raw[_ .-]?export|record[_ .-]?reader|direct[_ .-]?adapter|unapproved[_ .-]?tool)\b/i,
  },
  {
    field: "synthetic_canary",
    node: "cross-node",
    alias: "internal canary marker",
    pattern: /\bCANARY-[A-Z]{3}-\d{2}\b/i,
  },
];

const METRIC_PATTERNS: Array<{
  metric: MetricKey;
  node: NodeId;
  pattern: RegExp;
}> = [
  { metric: "yield_t_ha", node: "agriculture", pattern: /\b(yield|tonnes? per hectare|t\/ha)\b/i },
  {
    metric: "irrigation_stress_pct",
    node: "agriculture",
    pattern: /\b(irrigation|water stress)\b/i,
  },
  {
    metric: "soil_moisture_index",
    node: "agriculture",
    pattern: /\b(soil moisture|soil condition)\b/i,
  },
  {
    metric: "renewable_share_pct",
    node: "energy",
    pattern: /\b(renewable|clean energy)\b/i,
  },
  {
    metric: "peak_load_mw",
    node: "energy",
    pattern: /\b(peak load|demand|load)\b/i,
  },
  {
    metric: "reserve_margin_pct",
    node: "energy",
    pattern: /\b(reserve margin|grid reserve|headroom)\b/i,
  },
  {
    metric: "habitat_condition_index",
    node: "biodiversity",
    pattern: /\b(habitat condition|habitat integrity)\b/i,
  },
  {
    metric: "pressure_index",
    node: "biodiversity",
    pattern: /\b(habitat pressure|ecological pressure|pressure index)\b/i,
  },
  {
    metric: "protected_coverage_pct",
    node: "biodiversity",
    pattern: /\b(protected coverage|protected area|protection)\b/i,
  },
  {
    metric: "risk_index",
    node: "agriculture",
    pattern: /\b(risk|resilience|stress|vulnerability)\b/i,
  },
  {
    metric: "risk_index",
    node: "energy",
    pattern: /\b(risk|resilience|stress|vulnerability)\b/i,
  },
  {
    metric: "risk_index",
    node: "biodiversity",
    pattern: /\b(risk|resilience|stress|vulnerability)\b/i,
  },
];

const INJECTION_PATTERNS: Array<{ signal: string; pattern: RegExp }> = [
  {
    signal: "instruction-override",
    pattern: /\b(ignore|override|forget)\b.{0,28}\b(policy|rules|instructions?|safeguards?)\b/i,
  },
  {
    signal: "authority-spoof",
    pattern: /\b(system message|developer message|administrator override|root access)\b/i,
  },
  {
    signal: "indirect-injection",
    pattern: /\b(retrieved|attached|quoted|external)\b.{0,28}\b(note|document|text|instruction)\b.{0,40}\b(says|tells|requires|orders)\b/i,
  },
  {
    signal: "policy-bypass",
    pattern: /\b(bypass|disable|evade|circumvent)\b.{0,24}\b(policy|guard|filter|broker|controls?)\b/i,
  },
  {
    signal: "fabricated-citation",
    pattern: /\b(fake|fabricate|invent|nonexistent)\b.{0,24}\b(citation|source|provenance)\b/i,
  },
];

const EGRESS_PATTERNS: Array<{ signal: string; pattern: RegExp }> = [
  {
    signal: "bulk-structured-dump",
    pattern: /\b(export|dump|download|return)\b.{0,28}\b(csv|json|ndjson|all rows|raw rows)\b/i,
  },
  {
    signal: "network-sink",
    pattern: /\b(send|post|upload|forward|exfiltrate)\b.{0,40}\b(url|webhook|endpoint|server|internet|http)\b/i,
  },
  {
    signal: "file-sink",
    pattern: /\b(write|save|append|copy)\b.{0,32}\b(file|disk|path|folder|share)\b/i,
  },
];

const DEFAULT_METRICS: Record<NodeId, MetricKey[]> = {
  agriculture: ["yield_t_ha", "irrigation_stress_pct", "risk_index"],
  energy: ["renewable_share_pct", "reserve_margin_pct", "risk_index"],
  biodiversity: [
    "habitat_condition_index",
    "protected_coverage_pct",
    "risk_index",
  ],
};

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function detectSensitiveFields(query: string): SensitiveFieldRequest[] {
  return SENSITIVE_PATTERNS.flatMap((candidate) =>
    candidate.pattern.test(query)
      ? [
          {
            field: candidate.field,
            node: candidate.node,
            matchedAlias: candidate.alias,
          },
        ]
      : [],
  );
}

function detectInjectionSignals(query: string): string[] {
  const signals = INJECTION_PATTERNS.flatMap((candidate) =>
    candidate.pattern.test(query) ? [candidate.signal] : [],
  );
  const compact = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    compact.includes("ignorepolicy") ||
    compact.includes("bypasspolicy") ||
    compact.includes("disablesafeguard")
  ) {
    signals.push("obfuscated-policy-bypass");
  }
  return [...new Set(signals)];
}

function selectNodes(query: string): NodeId[] {
  const selected = (Object.entries(NODE_PATTERNS) as Array<[NodeId, RegExp]>)
    .filter(([, pattern]) => pattern.test(query))
    .map(([node]) => node);
  if (selected.length === 0 && BROAD_SCOPE_PATTERN.test(query)) {
    return ["agriculture", "energy", "biodiversity"];
  }
  return selected;
}

function selectMetrics(query: string, node: NodeId): MetricKey[] {
  const explicit = METRIC_PATTERNS.filter(
    (candidate) => candidate.node === node && candidate.pattern.test(query),
  ).map((candidate) => candidate.metric);
  return explicit.length > 0 ? [...new Set(explicit)] : DEFAULT_METRICS[node];
}

function classifyIntent(
  query: string,
  nodes: NodeId[],
  sensitiveFields: SensitiveFieldRequest[],
  injectionSignals: string[],
  egressSignals: string[],
): QueryIntent {
  if (nodes.length === 0 && sensitiveFields.length === 0) {
    return "out-of-scope";
  }
  if (
    sensitiveFields.length > 0 ||
    injectionSignals.length > 0 ||
    egressSignals.length > 0
  ) {
    return "policy-probe";
  }
  if (nodes.length > 1 || /\b(compare|overlap|across|versus|combined)\b/i.test(query)) {
    return "cross-domain-compare";
  }
  if (/\b(risk|stress|vulnerability|priority|resilience)\b/i.test(query)) {
    return "risk-scan";
  }
  return "sector-overview";
}

export function planQuery(query: string): QueryPlan {
  const normalizedQuery = normalizeQuery(query);
  const requestedNodes = selectNodes(normalizedQuery);
  const rawFields = detectSensitiveFields(normalizedQuery);
  const injectionSignals = detectInjectionSignals(normalizedQuery);
  const egressSignals = EGRESS_PATTERNS.flatMap((candidate) =>
    candidate.pattern.test(normalizedQuery) ? [candidate.signal] : [],
  );
  const explicitSafeMetricCount = new Set(
    METRIC_PATTERNS.filter((candidate) => candidate.pattern.test(normalizedQuery)).map(
      (candidate) => `${candidate.node}:${candidate.metric}`,
    ),
  ).size;
  const roleClaimedInPrompt =
    /\b(i am|act as|treat me as|my role is)\b.{0,20}\b(executive|admin|administrator|custodian|auditor)\b/i.test(
      normalizedQuery,
    );

  const intent = classifyIntent(
    normalizedQuery,
    requestedNodes,
    rawFields,
    injectionSignals,
    egressSignals,
  );
  const rawOnly = rawFields.length > 0 && explicitSafeMetricCount === 0;
  const mustBlockBeforeRouting =
    injectionSignals.length > 0 || egressSignals.length > 0 || rawOnly;

  const tasks: PlanTask[] = mustBlockBeforeRouting
    ? []
    : requestedNodes.map((node, index) => ({
        id: `task-${index + 1}-${node}`,
        node,
        tool: APPROVED_TOOLS[node],
        groupBy: "region",
        metrics: selectMetrics(normalizedQuery, node).filter((metric) =>
          NODE_CATALOG[node].publishedMetrics.includes(metric),
        ),
        rationale: `Use the ${NODE_CATALOG[node].name} approved regional aggregate.`,
      }));

  return {
    id: `plan-${stableHash(normalizedQuery.toLowerCase())}`,
    version: "planner-1.0",
    normalizedQuery,
    intent,
    requestedNodes,
    tasks,
    signals: {
      rawFields,
      injectionSignals,
      egressSignals,
      explicitSafeMetricCount,
      roleClaimedInPrompt,
    },
  };
}
