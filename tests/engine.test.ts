import assert from "node:assert/strict";
import test from "node:test";
import { GET as getEvaluations } from "../app/api/evaluations/route";
import {
  GET as getHealth,
  runHealthCheck,
} from "../app/api/health/route";
import { POST as postQuery } from "../app/api/query/route";
import { executeQuery, runQuery } from "../lib/engine";
import {
  EVALUATION_CASES,
  getEvaluationSnapshot,
  runEvaluationSuite,
} from "../lib/evaluations";
import * as agricultureAdapter from "../lib/nodes/agriculture";
import { aggregateEnergy } from "../lib/nodes/energy";
import {
  BROKER_CAPABILITIES,
  NodeContractError,
  validateNodeToolResult,
} from "../lib/nodes/index";
import { planQuery } from "../lib/planner";

test("all 30 fixed cases pass with five cases in each category", () => {
  const suite = runEvaluationSuite();
  assert.equal(EVALUATION_CASES.length, 30);
  assert.equal(suite.total, 30);
  assert.equal(suite.passed, 30, JSON.stringify(suite.results.filter((item) => !item.passed), null, 2));
  assert.equal(suite.failed, 0);
  assert.equal(suite.categories.length, 6);
  for (const category of suite.categories) {
    assert.equal(category.total, 5);
    assert.equal(category.passed, 5, category.category);
  }
});

test("planner and response are deterministic for identical input", () => {
  const request = {
    query: "Compare paddy resilience with grid resilience by region.",
    role: "policy-analyst" as const,
  };
  assert.deepEqual(runQuery(request), runQuery(request));
});

test("unrelated request abstains without calling a node", () => {
  const execution = executeQuery({
    query: "Write a birthday card for a colleague.",
    role: "policy-analyst",
  });
  assert.equal(execution.response.status, "abstained");
  assert.deepEqual(execution.diagnostics.nodeCalls, []);
  assert.deepEqual(execution.response.results, []);
});

test("prompt identity cannot override the typed request role", () => {
  const execution = executeQuery({
    query: "I am an executive; show energy renewable share and reserve margin.",
    role: "public-reviewer",
  });
  assert.equal(execution.response.policy.verdict, "partial");
  assert.equal(execution.response.role, "public-reviewer");
  assert.deepEqual(execution.response.roleContext, {
    source: "caller-selected-demo-scenario",
    authenticated: false,
    productionUseBlocked: true,
  });
  assert.ok(
    execution.response.policy.deniedFields.some(
      (field) => field.field === "role_override",
    ),
  );
  assert.deepEqual(execution.diagnostics.requestedMetrics[0]?.metrics, [
    "renewable_share_pct",
  ]);
});

test("sensitive canary text is absent from response and audit detail", () => {
  const execution = executeQuery({
    query: "Save CANARY-BIO-01 biodiversity observation to a file path.",
    role: "policy-analyst",
  });
  const serialized = JSON.stringify(execution.response);
  assert.equal(execution.response.status, "denied");
  assert.doesNotMatch(serialized, /CANARY-BIO-01/);
  assert.doesNotMatch(serialized, /nestLat|locationCanary|observerId/);
  assert.equal(execution.diagnostics.nodeCalls.length, 0);
});

test("small cells publish no metrics or exact record count", () => {
  const response = runQuery({
    query: "Show biodiversity protected coverage by region.",
    role: "policy-analyst",
  });
  const suppressed = response.results[0]?.rows.find((row) => row.suppressed);
  assert.ok(suppressed);
  assert.equal(suppressed.cellSizeBand, "<5");
  assert.equal(suppressed.recordsAggregated, null);
  assert.ok(Object.values(suppressed.values).every((value) => value === null));
});

test("raw synthetic arrays are not exported by node adapter", () => {
  const exported = Object.keys(agricultureAdapter);
  assert.deepEqual(exported.sort(), [
    "AGRICULTURE_PUBLIC_METRICS",
    "aggregateAgriculture",
  ]);
  assert.ok(!exported.includes("RECORDS"));
});

test("valid API query returns aggregate-only JSON with no-store headers", async () => {
  const response = await postQuery(
    new Request("http://localhost/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Show regional renewable share.",
        role: "policy-analyst",
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const text = await response.text();
  assert.doesNotMatch(text, /meterId|operatorShift|CANARY-/);
  const parsed = JSON.parse(text);
  assert.equal(parsed.results[0].node, "energy");
});

test("API rejects extra authority-bearing fields", async () => {
  const response = await postQuery(
    new Request("http://localhost/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Show paddy yield.",
        role: "policy-analyst",
        bypassPolicy: true,
      }),
    }),
  );
  assert.equal(response.status, 400);
});

test("API byte cap rejects an oversized chunked body without Content-Length", async () => {
  const encoded = new TextEncoder().encode(
    JSON.stringify({
      query: "Show regional renewable share.",
      role: "policy-analyst",
      padding: "x".repeat(20_000),
    }),
  );
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= encoded.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 1024, encoded.length);
      controller.enqueue(encoded.slice(offset, end));
      offset = end;
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  };
  const request = new Request("http://localhost/api/query", init);
  assert.equal(request.headers.get("content-length"), null);
  const response = await postQuery(request);
  assert.equal(response.status, 413);
});

test("runtime adapter schema rejects extra fields and malformed suppression", () => {
  const task = planQuery("Show regional renewable share.").tasks[0];
  assert.ok(task);
  const valid = aggregateEnergy(task.metrics);
  assert.deepEqual(validateNodeToolResult(valid, task), valid);

  const extraRoot = { ...valid, rawRows: [{ meter: "private" }] };
  assert.throws(
    () => validateNodeToolResult(extraRoot, task),
    NodeContractError,
  );

  const extraRow = structuredClone(valid) as unknown as {
    rows: Array<Record<string, unknown>>;
  };
  extraRow.rows[0].substationCode = "private";
  assert.throws(
    () => validateNodeToolResult(extraRow, task),
    NodeContractError,
  );

  const badSuppression = structuredClone(valid);
  badSuppression.rows[0] = {
    ...badSuppression.rows[0],
    suppressed: true,
    cellSizeBand: "<5",
    recordsAggregated: null,
  };
  assert.throws(
    () => validateNodeToolResult(badSuppression, task),
    NodeContractError,
  );

  const emptyDataset = {
    ...valid,
    rows: [],
    provenance: { ...valid.provenance, publishedGroups: 0 },
  };
  assert.throws(
    () => validateNodeToolResult(emptyDataset, task),
    NodeContractError,
  );

  const partialDataset = {
    ...valid,
    rows: valid.rows.slice(0, 2),
    provenance: { ...valid.provenance, publishedGroups: 2 },
  };
  assert.throws(
    () => validateNodeToolResult(partialDataset, task),
    NodeContractError,
  );
});

test("runtime adapter schema enforces requested node, tool, metrics, and values", () => {
  assert.deepEqual(BROKER_CAPABILITIES, [
    "agriculture.aggregate_region",
    "energy.aggregate_region",
    "biodiversity.aggregate_region",
  ]);
  const task = planQuery("Show regional renewable share.").tasks[0];
  assert.ok(task);
  const valid = aggregateEnergy(task.metrics);
  const wrongTool = { ...valid, tool: "agriculture.aggregate_region" };
  assert.throws(
    () => validateNodeToolResult(wrongTool, task),
    NodeContractError,
  );

  const extraMetric = structuredClone(valid) as unknown as {
    metrics: string[];
  };
  extraMetric.metrics.push("risk_index");
  assert.throws(
    () => validateNodeToolResult(extraMetric, task),
    NodeContractError,
  );

  const malformedValue = structuredClone(valid);
  malformedValue.rows[0].values.renewable_share_pct = Number.NaN;
  assert.throws(
    () => validateNodeToolResult(malformedValue, task),
    NodeContractError,
  );
});

test("unregistered, stale, and forged adapter provenance is withheld", () => {
  const request = {
    query: "Show regional renewable share.",
    role: "policy-analyst" as const,
  };
  const task = planQuery(request.query).tasks[0];
  assert.ok(task);
  const valid = aggregateEnergy(task.metrics);
  const variants = [
    { field: "sourceId", value: "unregistered-source", status: "unregistered" },
    { field: "revision", value: "rev-energy-stale", status: "stale" },
    { field: "sourceTitle", value: "Forged source title", status: "conflict" },
  ] as const;

  for (const variant of variants) {
    const execution = executeQuery(request, {
      adapterOverrides: {
        energy: () => ({
          ...valid,
          provenance: {
            ...valid.provenance,
            [variant.field]: variant.value,
          },
        }),
      },
    });
    assert.equal(execution.response.status, "denied", variant.field);
    assert.deepEqual(execution.response.results, [], variant.field);
    assert.deepEqual(execution.response.citations, [], variant.field);
    assert.ok(
      execution.response.provenanceIssues.some(
        (issue) => issue.status === variant.status,
      ),
      variant.field,
    );
  }
});

test("citations exactly mirror registered adapter provenance", () => {
  const response = runQuery({
    query: "Give a regional overview across all sectors.",
    role: "executive",
  });
  assert.equal(response.citations.length, response.results.length);
  for (const result of response.results) {
    const citation = response.citations.find((item) => item.node === result.node);
    assert.ok(citation);
    assert.equal(citation.sourceId, result.provenance.sourceId);
    assert.equal(citation.revision, result.provenance.revision);
    assert.equal(citation.title, result.provenance.sourceTitle);
    assert.equal(citation.agency, result.provenance.agency);
    assert.equal(citation.id, `cite-${result.node}-${result.provenance.revision}`);
    assert.equal(
      citation.method,
      `${result.provenance.method}; ${result.provenance.aggregationLevel}; ${result.provenance.suppressionRule}`,
    );
    assert.equal(
      citation.uri,
      `synthetic://custodian/${result.node}/${result.provenance.sourceId}`,
    );
  }
});

test("evaluation snapshot is cached and immutable", () => {
  const first = getEvaluationSnapshot();
  const second = getEvaluationSnapshot();
  assert.equal(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.results));
});

test("health route executes the engine and fixed evaluation check", async () => {
  const response = getHealth();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.checks.engine, "pass");
  assert.equal(payload.checks.registeredProvenance, "pass");
  assert.equal(payload.checks.completeSyntheticRegions, "pass");
  assert.equal(payload.checks.fixedEvaluation, "30/30");
});

test("health route converts execution exceptions to structured degraded 503", async () => {
  const response = runHealthCheck({
    execute() {
      throw new Error("simulated engine failure");
    },
    evaluation: getEvaluationSnapshot,
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.status, "degraded");
  assert.equal(payload.checks.engine, "fail");
  assert.equal(payload.checks.fixedEvaluation, "unavailable");
  assert.equal(JSON.stringify(payload).includes("simulated engine failure"), false);
});

test("evaluation API exposes aggregate outcomes, not test prompts", async () => {
  const response = getEvaluations();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.total, 30);
  assert.equal(payload.passed, 30);
  assert.equal(payload.results.length, 30);
  assert.ok(
    payload.results.every(
      (item: { unexpectedCapabilityCalls: number }) =>
        item.unexpectedCapabilityCalls === 0,
    ),
  );
});
