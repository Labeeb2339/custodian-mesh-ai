import { APPROVED_TOOLS, NODE_CATALOG } from "../catalog";
import type {
  ExecutionDiagnostics,
  NodeToolResult,
  PlanTask,
} from "../types";
import { aggregateAgriculture } from "./agriculture";
import { aggregateBiodiversity } from "./biodiversity";
import { aggregateEnergy } from "./energy";
import { NodeContractError, validateNodeToolResult } from "./contract";

export { NodeContractError, validateNodeToolResult } from "./contract";

/** The complete executable capability set exposed by the in-process broker. */
export const BROKER_CAPABILITIES = Object.freeze(
  Object.values(APPROVED_TOOLS),
);

export function executeNodeTask(
  task: PlanTask,
  diagnostics: ExecutionDiagnostics,
  adapterOverride?: (metrics: PlanTask["metrics"]) => unknown,
): NodeToolResult {
  const approvedTool = APPROVED_TOOLS[task.node];
  const approvedMetrics = NODE_CATALOG[task.node].publishedMetrics;
  if (
    !BROKER_CAPABILITIES.includes(task.tool) ||
    task.tool !== approvedTool ||
    task.groupBy !== "region" ||
    task.metrics.some((metric) => !approvedMetrics.includes(metric))
  ) {
    diagnostics.rejectedCapabilityCalls += 1;
    throw new NodeContractError("Node task is outside the approved aggregate contract.");
  }

  diagnostics.nodeCalls.push(task.node);
  diagnostics.toolCalls.push(task.tool);
  diagnostics.requestedMetrics.push({ node: task.node, metrics: task.metrics });

  let rawResult: unknown;
  if (adapterOverride) {
    rawResult = adapterOverride([...task.metrics]);
  } else {
    switch (task.node) {
      case "agriculture":
        rawResult = aggregateAgriculture(task.metrics);
        break;
      case "energy":
        rawResult = aggregateEnergy(task.metrics);
        break;
      case "biodiversity":
        rawResult = aggregateBiodiversity(task.metrics);
        break;
    }
  }
  return validateNodeToolResult(rawResult, task);
}
