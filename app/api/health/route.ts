import { executeQuery } from "@/lib/engine";
import { getEvaluationSnapshot } from "@/lib/evaluations";
import { jsonResponse } from "@/lib/http";

interface HealthDependencies {
  execute: typeof executeQuery;
  evaluation: typeof getEvaluationSnapshot;
}

const DEFAULT_DEPENDENCIES: HealthDependencies = {
  execute: executeQuery,
  evaluation: getEvaluationSnapshot,
};

export function runHealthCheck(
  dependencies: HealthDependencies = DEFAULT_DEPENDENCIES,
): Response {
  try {
    const execution = dependencies.execute({
      query: "Show regional renewable share.",
      role: "policy-analyst",
    });
    const evaluation = dependencies.evaluation();
    const result = execution.response.results[0];
    const citation = execution.response.citations[0];
    const regionsHealthy =
      result?.rows.length === 3 &&
      result.rows
        .map((row) => row.region)
        .sort()
        .join(",") === "Central,Coastal,Highland";
    const registeredProvenanceHealthy =
      result !== undefined &&
      citation !== undefined &&
      citation.node === result.node &&
      citation.sourceId === result.provenance.sourceId &&
      citation.revision === result.provenance.revision &&
      citation.title === result.provenance.sourceTitle;
    const engineHealthy =
      execution.response.status === "completed" &&
      execution.response.results.length === 1 &&
      execution.response.citations.length === 1 &&
      execution.response.provenanceIssues.length === 0 &&
      regionsHealthy &&
      registeredProvenanceHealthy;
    const evaluationHealthy =
      evaluation.total === 30 &&
      evaluation.passed === 30 &&
      evaluation.failed === 0;
    const healthy = engineHealthy && evaluationHealthy;

    return jsonResponse(
      {
        status: healthy ? "ok" : "degraded",
        service: "custodian-mesh-ai",
        mode: "deterministic",
        data: "synthetic-only",
        nodeCount: 3,
        plannerVersion: "planner-1.0",
        policyVersion: "custodian-policy-1.0",
        checks: {
          engine: engineHealthy ? "pass" : "fail",
          registeredProvenance: registeredProvenanceHealthy ? "pass" : "fail",
          completeSyntheticRegions: regionsHealthy ? "pass" : "fail",
          fixedEvaluation: `${evaluation.passed}/${evaluation.total}`,
        },
      },
      healthy ? 200 : 503,
    );
  } catch {
    return jsonResponse(
      {
        status: "degraded",
        service: "custodian-mesh-ai",
        mode: "deterministic",
        data: "synthetic-only",
        checks: {
          engine: "fail",
          registeredProvenance: "unavailable",
          completeSyntheticRegions: "unavailable",
          fixedEvaluation: "unavailable",
        },
      },
      503,
    );
  }
}

export function GET(): Response {
  return runHealthCheck();
}
