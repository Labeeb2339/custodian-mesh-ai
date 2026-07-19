import { APPROVED_TOOLS, NODE_CATALOG } from "../catalog";
import type {
  MetricKey,
  NodeToolResult,
  PlanTask,
} from "../types";

const RESULT_KEYS = ["metrics", "node", "provenance", "rows", "tool"];
const ROW_KEYS = [
  "cellSizeBand",
  "recordsAggregated",
  "region",
  "suppressed",
  "values",
];
const PROVENANCE_KEYS = [
  "agency",
  "aggregationLevel",
  "dataWindow",
  "method",
  "publishedGroups",
  "revision",
  "sourceId",
  "sourceTitle",
  "suppressionRule",
];
const PUBLISHED_REGIONS = new Set(["Coastal", "Central", "Highland"]);

export class NodeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeContractError";
  }
}

function fail(path: string, expectation: string): never {
  throw new NodeContractError(
    `Adapter result rejected at ${path}: ${expectation}.`,
  );
}

function exactKeys(actual: PropertyKey[], expected: string[]): boolean {
  if (actual.some((key) => typeof key !== "string")) {
    return false;
  }
  return (
    [...(actual as string[])].sort().join("\u0000") ===
    [...expected].sort().join("\u0000")
  );
}

function exactDataObject(
  value: unknown,
  expectedKeys: string[],
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "an object with the documented keys");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, "a plain data object");
  }
  const keys = Reflect.ownKeys(value);
  if (!exactKeys(keys, expectedKeys)) {
    fail(path, `exact keys ${expectedKeys.join(", ")}`);
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${path}.${key}`, "an enumerable data property");
    }
  }
  return value as Record<string, unknown>;
}

function denseDataArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, "an array");
  }
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  if (!exactKeys(Reflect.ownKeys(value), expectedKeys)) {
    fail(path, "a dense array without custom properties");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${path}[${index}]`, "an enumerable data element");
    }
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    fail(path, "a non-empty trimmed string");
  }
  return value;
}

function sameSequence(actual: unknown[], expected: MetricKey[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

/**
 * Runtime trust boundary for every adapter result. TypeScript types alone do
 * not protect the runtime from a buggy or compromised adapter.
 */
export function validateNodeToolResult(
  value: unknown,
  task: PlanTask,
): NodeToolResult {
  if (
    task.tool !== APPROVED_TOOLS[task.node] ||
    task.groupBy !== "region" ||
    task.metrics.length === 0 ||
    new Set(task.metrics).size !== task.metrics.length ||
    task.metrics.some(
      (metric) => !NODE_CATALOG[task.node].publishedMetrics.includes(metric),
    )
  ) {
    fail("task", "one approved regional aggregate capability");
  }

  const result = exactDataObject(value, RESULT_KEYS, "result");
  if (result.node !== task.node) {
    fail("result.node", `the requested node ${task.node}`);
  }
  if (result.tool !== task.tool) {
    fail("result.tool", `the requested tool ${task.tool}`);
  }

  const metrics = denseDataArray(result.metrics, "result.metrics");
  if (!sameSequence(metrics, task.metrics)) {
    fail("result.metrics", "the exact requested metric sequence");
  }

  const rows = denseDataArray(result.rows, "result.rows");
  const seenRegions = new Set<string>();
  let publishedGroups = 0;

  for (const [index, candidate] of rows.entries()) {
    const path = `result.rows[${index}]`;
    const row = exactDataObject(candidate, ROW_KEYS, path);
    const region = nonEmptyString(row.region, `${path}.region`);
    if (!PUBLISHED_REGIONS.has(region) || seenRegions.has(region)) {
      fail(`${path}.region`, "one unique documented synthetic region");
    }
    seenRegions.add(region);

    const values = exactDataObject(
      row.values,
      task.metrics,
      `${path}.values`,
    );
    if (typeof row.suppressed !== "boolean") {
      fail(`${path}.suppressed`, "a boolean");
    }

    if (row.suppressed) {
      if (
        row.cellSizeBand !== "<5" ||
        row.recordsAggregated !== null ||
        task.metrics.some((metric) => values[metric] !== null)
      ) {
        fail(
          path,
          "a suppressed cell with <5 band, null count, and null metrics",
        );
      }
      continue;
    }

    if (
      row.cellSizeBand !== "5+" ||
      typeof row.recordsAggregated !== "number" ||
      !Number.isSafeInteger(row.recordsAggregated) ||
      row.recordsAggregated < 5
    ) {
      fail(path, "a published cell with a safe integer count of at least five");
    }
    for (const metric of task.metrics) {
      const metricValue = values[metric];
      if (typeof metricValue !== "number" || !Number.isFinite(metricValue)) {
        fail(`${path}.values.${metric}`, "a finite published number");
      }
    }
    publishedGroups += 1;
  }
  if (seenRegions.size !== PUBLISHED_REGIONS.size) {
    fail(
      "result.rows",
      "exactly one row for each documented synthetic region",
    );
  }

  const provenance = exactDataObject(
    result.provenance,
    PROVENANCE_KEYS,
    "result.provenance",
  );
  for (const key of [
    "sourceId",
    "sourceTitle",
    "agency",
    "revision",
    "dataWindow",
  ]) {
    nonEmptyString(provenance[key], `result.provenance.${key}`);
  }
  if (provenance.method !== "deterministic-in-memory-aggregate") {
    fail("result.provenance.method", "the documented aggregation method");
  }
  if (provenance.aggregationLevel !== "region") {
    fail("result.provenance.aggregationLevel", "the regional aggregation level");
  }
  if (provenance.suppressionRule !== "k>=5") {
    fail("result.provenance.suppressionRule", "the k>=5 rule");
  }
  if (provenance.publishedGroups !== publishedGroups) {
    fail(
      "result.provenance.publishedGroups",
      "the number of unsuppressed result rows",
    );
  }

  return value as NodeToolResult;
}
