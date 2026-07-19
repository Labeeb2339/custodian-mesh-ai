import { NODE_CATALOG } from "./catalog";
import type {
  Citation,
  NodeId,
  NodeProvenance,
  ProvenanceFault,
  ProvenanceIssue,
} from "./types";

interface ProvenanceRecord {
  node: NodeId;
  sourceId: string;
  revision: string;
  dataWindow: string;
  sourceTitle: string;
}

const REGISTRY: Record<NodeId, ProvenanceRecord> = {
  agriculture: {
    node: "agriculture",
    sourceId: "syn-agri-regional-2026q2",
    revision: "rev-agri-2026q2-01",
    dataWindow: "2026-Q2 synthetic snapshot",
    sourceTitle: "Synthetic regional paddy resilience aggregates",
  },
  energy: {
    node: "energy",
    sourceId: "syn-energy-regional-2026q2",
    revision: "rev-energy-2026q2-01",
    dataWindow: "2026-Q2 synthetic snapshot",
    sourceTitle: "Synthetic regional grid resilience aggregates",
  },
  biodiversity: {
    node: "biodiversity",
    sourceId: "syn-bio-regional-2026q2",
    revision: "rev-bio-2026q2-01",
    dataWindow: "2026-Q2 synthetic snapshot",
    sourceTitle: "Synthetic regional landscape integrity aggregates",
  },
};

/** Test-only regression simulation used by fixed stale/missing/conflict cases. */
export function simulatePreflightProvenanceFault(
  node: NodeId,
  fault?: { node: NodeId; fault: ProvenanceFault },
): ProvenanceIssue | null {
  if (!fault || fault.node !== node) {
    return null;
  }

  const messages: Record<ProvenanceFault, string> = {
    stale: "Dataset revision is older than the custodian registry entry.",
    missing: "No custodian registry entry exists for the requested dataset.",
    conflict: "Multiple revisions claim to be current; execution was withheld.",
  };

  return { node, status: fault.fault, message: messages[fault.fault] };
}

/** Validate provenance actually returned by an adapter against the registry. */
export function validateAdapterProvenance(
  node: NodeId,
  provenance: NodeProvenance,
): ProvenanceIssue | null {
  const expected = REGISTRY[node];
  if (provenance.sourceId !== expected.sourceId) {
    return {
      node,
      status: "unregistered",
      message: "The adapter returned an unregistered source identifier.",
    };
  }
  if (provenance.revision !== expected.revision) {
    return {
      node,
      status: "stale",
      message: "The adapter revision does not match the current registry entry.",
    };
  }
  if (
    provenance.sourceTitle !== expected.sourceTitle ||
    provenance.agency !== NODE_CATALOG[node].agency ||
    provenance.dataWindow !== expected.dataWindow ||
    provenance.method !== "deterministic-in-memory-aggregate" ||
    provenance.aggregationLevel !== "region" ||
    provenance.suppressionRule !== "k>=5"
  ) {
    return {
      node,
      status: "conflict",
      message: "The adapter provenance fields conflict with the registry entry.",
    };
  }
  return null;
}

export function provenanceFor(
  node: NodeId,
  publishedGroups: number,
): NodeProvenance {
  const record = REGISTRY[node];
  return {
    sourceId: record.sourceId,
    sourceTitle: record.sourceTitle,
    agency: NODE_CATALOG[node].agency,
    revision: record.revision,
    dataWindow: record.dataWindow,
    method: "deterministic-in-memory-aggregate",
    aggregationLevel: "region",
    suppressionRule: "k>=5",
    publishedGroups,
  };
}

export function citationFor(provenance: NodeProvenance, node: NodeId): Citation {
  const issue = validateAdapterProvenance(node, provenance);
  if (issue) {
    throw new Error("Citation withheld because adapter provenance was not registered.");
  }
  return {
    id: `cite-${node}-${provenance.revision}`,
    node,
    title: provenance.sourceTitle,
    agency: provenance.agency,
    sourceId: provenance.sourceId,
    revision: provenance.revision,
    dataWindow: provenance.dataWindow,
    method: `${provenance.method}; ${provenance.aggregationLevel}; ${provenance.suppressionRule}`,
    uri: `synthetic://custodian/${node}/${provenance.sourceId}`,
  };
}
