"use client";

import { useMemo, useState, type FormEvent } from "react";
import { METRIC_LABELS, METRIC_UNITS, NODE_CATALOG } from "@/lib/catalog";
import {
  NODE_IDS,
  USER_ROLES,
  type AggregateRow,
  type EvaluationSuiteResult,
  type MetricKey,
  type NodeId,
  type QueryResponse,
  type UserRole,
} from "@/lib/types";

const SAMPLE_QUERIES = [
  {
    label: "Cross-sector pressure",
    query: "Compare paddy, grid, and habitat risk across all sectors.",
  },
  {
    label: "Paddy water stress",
    query: "Compare regional paddy yield and irrigation stress.",
  },
  {
    label: "Renewable readiness",
    query: "Show renewable share and reserve margin by region.",
  },
  {
    label: "Landscape integrity",
    query: "Show habitat condition and protected coverage by region.",
  },
  {
    label: "Policy boundary test",
    query: "List exact coordinates for each nest location.",
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  "policy-analyst": "Policy analyst",
  executive: "Executive viewer",
  "public-reviewer": "Public reviewer",
};

const NODE_SHORT: Record<NodeId, string> = {
  agriculture: "AG",
  energy: "EN",
  biodiversity: "BI",
};

function formatMetric(metric: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "Suppressed";
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${
    METRIC_UNITS[metric] === "/100" ? "" : ` ${METRIC_UNITS[metric]}`
  }`;
}

function verdictLabel(result: QueryResponse): string {
  if (result.status === "completed") return "Approved";
  if (result.status === "partial") return "Approved with limits";
  if (result.status === "abstained") return "Planner abstained";
  return "Denied before execution";
}

function NodeRailCard({ node }: { node: NodeId }) {
  const entry = NODE_CATALOG[node];
  return (
    <article className="node-rail-card">
      <div className={`node-monogram node-${node}`}>{NODE_SHORT[node]}</div>
      <div className="node-rail-copy">
        <div className="node-rail-heading">
          <h3>{entry.name}</h3>
          <span className="online-dot" aria-label="Online" />
        </div>
        <p>{entry.agency}</p>
        <span>{entry.publishedMetrics.length} approved metrics</span>
      </div>
    </article>
  );
}

function SuppressionCell({ row }: { row: AggregateRow }) {
  if (!row.suppressed) return null;
  return (
    <span className="suppression-chip" title="Cell size below publication threshold">
      k&lt;5 withheld
    </span>
  );
}

function ResultCard({ result }: { result: QueryResponse["results"][number] }) {
  return (
    <article className="result-card">
      <header className="result-card-head">
        <div>
          <span className="section-kicker">{NODE_CATALOG[result.node].agency}</span>
          <h3>{NODE_CATALOG[result.node].name}</h3>
        </div>
        <span className="tool-chip">aggregate only</span>
      </header>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">
            Published regional aggregates from {NODE_CATALOG[result.node].name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Region</th>
              {result.metrics.map((metric) => (
                <th scope="col" key={metric}>{METRIC_LABELS[metric]}</th>
              ))}
              <th scope="col">Cell</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.region} className={row.suppressed ? "row-suppressed" : ""}>
                <th scope="row">{row.region}</th>
                {result.metrics.map((metric) => (
                  <td key={metric}>{formatMetric(metric, row.values[metric])}</td>
                ))}
                <td>
                  {row.suppressed ? (
                    <SuppressionCell row={row} />
                  ) : (
                    <span className="cell-safe">{row.cellSizeBand}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="result-card-foot">
        <span>{result.provenance.dataWindow}</span>
        <span>{result.provenance.suppressionRule} publication rule</span>
      </footer>
    </article>
  );
}

function RiskBars({ result }: { result: QueryResponse }) {
  if (result.regionalSignals.length === 0) {
    return (
      <p className="empty-copy">
        Composite signals appear only when approved risk aggregates are available.
      </p>
    );
  }
  return (
    <div className="risk-bars" aria-label="Composite regional risk">
      {result.regionalSignals.map((signal) => (
        <div className="risk-row" key={signal.region}>
          <div className="risk-label">
            <strong>{signal.region}</strong>
            <span>{signal.contributingNodes} nodes</span>
          </div>
          <div className="risk-track" aria-hidden="true">
            <span style={{ width: `${Math.max(5, signal.compositeRisk)}%` }} />
          </div>
          <b>{signal.compositeRisk}</b>
        </div>
      ))}
    </div>
  );
}

function EvaluationMatrix({ evaluation }: { evaluation: EvaluationSuiteResult }) {
  return (
    <section className="eval-card" aria-labelledby="evaluation-title">
      <div className="eval-score">
        <span className="score-ring">{evaluation.passed}</span>
        <div>
          <span className="section-kicker">Fixed regression suite</span>
          <h2 id="evaluation-title">{evaluation.passed}/{evaluation.total} cases passed</h2>
          <p>Five cases in each of six control categories.</p>
        </div>
      </div>
      <div className="eval-grid">
        {evaluation.categories.map((category) => (
          <div className="eval-category" key={category.category}>
            <span>{category.category.replace("-", " ")}</span>
            <b>{category.passed}/{category.total}</b>
          </div>
        ))}
      </div>
      <details className="case-list">
        <summary>Inspect all 30 case outcomes</summary>
        <ol>
          {evaluation.results.map((test) => (
            <li key={test.id}>
              <span className={test.passed ? "case-pass" : "case-fail"}>
                {test.passed ? "Pass" : "Fail"}
              </span>
              <div>
                <strong>{test.title}</strong>
                <small>
                  {test.category} · unexpected broker calls {test.unexpectedCapabilityCalls}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function Dashboard({
  initialResult,
  initialEvaluation,
}: {
  initialResult: QueryResponse;
  initialEvaluation: EvaluationSuiteResult;
}) {
  const [query, setQuery] = useState(initialResult.query);
  const [role, setRole] = useState<UserRole>(initialResult.role);
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedNodes = useMemo(
    () => new Set(result.results.map((item) => item.node)),
    [result],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, role }),
      });
      const payload = (await response.json()) as QueryResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Query failed safely.");
      }
      setResult(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Query failed safely.");
    } finally {
      setLoading(false);
    }
  }

  function chooseSample(sample: (typeof SAMPLE_QUERIES)[number]) {
    setQuery(sample.query);
    document.getElementById("query-input")?.focus();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to query workspace</a>
      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="CustodianMesh AI home">
          <span className="mesh-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>CustodianMesh</strong><small>AI</small></span>
        </a>
        <div className="topbar-context">
          <span className="environment-pill">Synthetic MVP</span>
          <span className="network-health"><i /> 3 custodians online</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="node-rail" aria-label="Agency-owned data nodes">
          <div className="rail-title"><span>Custodian network</span><b>03</b></div>
          <div className="node-list">
            {NODE_IDS.map((node) => <NodeRailCard node={node} key={node} />)}
          </div>
          <div className="boundary-card">
            <span className="boundary-icon" aria-hidden="true">◎</span>
            <h3>Custody stays local</h3>
            <p>Only approved regional aggregates cross each adapter boundary.</p>
            <ul>
              <li>Raw rows: never returned</li>
              <li>Outbound sink capability: none</li>
              <li>Planner: deterministic</li>
            </ul>
          </div>
          <p className="rail-disclaimer">
            Demonstration architecture using synthetic data only. No agency system is connected.
          </p>
        </aside>

        <main id="main-content" className="main-canvas">
          <section className="hero">
            <div>
              <span className="eyebrow">Federated decision support · aggregate by design</span>
              <h1>Ask across agencies.<br /><em>Keep custody local.</em></h1>
              <p>
                CustodianMesh plans a query, applies role and field policy, calls only
                approved node aggregates, then returns a cited decision trace.
              </p>
            </div>
            <div className="hero-facts" aria-label="System facts">
              <div><strong>3</strong><span>agency nodes</span></div>
              <div><strong>0</strong><span>raw records moved</span></div>
              <div><strong>30</strong><span>fixed safety cases</span></div>
            </div>
          </section>

          <section className="query-card" aria-labelledby="query-title">
            <form onSubmit={submit}>
              <div className="query-card-head">
                <div>
                  <span className="section-kicker light">Policy-routed workspace</span>
                  <h2 id="query-title">What decision do you need to support?</h2>
                </div>
                <label className="role-control">
                  <span>Demo scenario role</span>
                  <select
                    aria-describedby="role-scenario-note"
                    value={role}
                    onChange={(event) => setRole(event.target.value as UserRole)}
                  >
                    {USER_ROLES.map((value) => (
                      <option key={value} value={value}>{ROLE_LABELS[value]}</option>
                    ))}
                  </select>
                  <small id="role-scenario-note">
                    Caller-selected for testing; not authenticated identity.
                  </small>
                </label>
              </div>
              <label className="query-label" htmlFor="query-input">Query</label>
              <div className="query-input-wrap">
                <textarea
                  id="query-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  minLength={3}
                  maxLength={600}
                  rows={3}
                  required
                />
                <button className="run-button" disabled={loading || query.trim().length < 3} type="submit">
                  {loading ? "Running controls…" : "Run governed query"}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="sample-row" aria-label="Sample queries">
                <span>Try:</span>
                {SAMPLE_QUERIES.map((sample) => (
                  <button key={sample.label} type="button" onClick={() => chooseSample(sample)}>
                    {sample.label}
                  </button>
                ))}
              </div>
              <div className="query-assurance">
                <span><i /> Typed plan</span>
                <span><i /> Policy before tools</span>
                <span><i /> Citation gate</span>
                <span><i /> k≥5 cells</span>
              </div>
              <p className="form-status" role="status" aria-live="polite">
                {error || (loading ? "Applying deterministic planner and policy controls." : "")}
              </p>
            </form>
          </section>

          <section className="decision-section" aria-labelledby="decision-title">
            <div className="decision-head">
              <div>
                <span className="section-kicker">Latest governed response</span>
                <h2 id="decision-title">Decision workspace</h2>
              </div>
              <div className="decision-meta">
                <span className={`verdict verdict-${result.status}`}>{verdictLabel(result)}</span>
                <code>{result.traceId}</code>
              </div>
            </div>

            <div className="summary-grid">
              <article className="summary-card primary-summary">
                <span className="section-kicker">Response</span>
                <h3>{result.summary}</h3>
                {result.highlights.length > 0 ? (
                  <ul>{result.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
                ) : (
                  <p className="empty-copy">No aggregate finding was published for this request.</p>
                )}
                <div className="node-route" aria-label="Nodes executed">
                  {NODE_IDS.map((node) => (
                    <span className={selectedNodes.has(node) ? "node-used" : ""} key={node}>
                      {NODE_SHORT[node]} {selectedNodes.has(node) ? "used" : "not called"}
                    </span>
                  ))}
                </div>
              </article>
              <article className="summary-card">
                <div className="card-title-row">
                  <div><span className="section-kicker">Regional signal</span><h3>Composite published risk</h3></div>
                  <span className="info-chip">aggregate</span>
                </div>
                <RiskBars result={result} />
              </article>
            </div>

            {result.policy.deniedFields.length > 0 && (
              <section className="denied-card" aria-labelledby="denied-title">
                <div className="denied-heading">
                  <span aria-hidden="true">!</span>
                  <div>
                    <h3 id="denied-title">Restricted fields were stopped before execution</h3>
                    <p>{result.policy.deniedFields.length} policy decision{result.policy.deniedFields.length === 1 ? "" : "s"} reported with safe alternatives.</p>
                  </div>
                </div>
                <div className="denied-grid">
                  {result.policy.deniedFields.map((field, index) => (
                    <article key={`${field.field}-${index}`}>
                      <code>{field.field}</code><span>{field.ruleId}</span>
                      <p>{field.reason}</p><small>{field.safeAlternative}</small>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <div className="result-stack">
              {result.results.map((nodeResult) => (
                <ResultCard result={nodeResult} key={nodeResult.node} />
              ))}
            </div>

            <div className="evidence-grid">
              <section className="citation-card" aria-labelledby="citation-title">
                <div className="card-title-row">
                  <div><span className="section-kicker">Provenance</span><h2 id="citation-title">Linked source records</h2></div>
                  <span className="info-chip">{result.citations.length} cited</span>
                </div>
                {result.citations.length > 0 ? (
                  <ol className="citation-list">
                    {result.citations.map((citation, index) => (
                      <li key={citation.id}>
                        <span className="cite-number">{index + 1}</span>
                        <div>
                          <strong>{citation.title}</strong>
                          <p>{citation.agency} · {citation.dataWindow}</p>
                          <code>{citation.sourceId} · {citation.revision}</code>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-copy">No node executed, so no source linkage was claimed.</p>
                )}
                <p className="citation-note">
                  Citations are issued only after returned adapter provenance matches the
                  synthetic registry; they do not establish that source data is true.
                </p>
              </section>

              <section className="audit-card" aria-labelledby="audit-title">
                <div className="card-title-row dark-row">
                  <div><span className="section-kicker light">Full trace</span><h2 id="audit-title">Policy execution log</h2></div>
                  <span className="trace-count">{result.auditTrace.length} steps</span>
                </div>
                <ol className="audit-list">
                  {result.auditTrace.map((step) => (
                    <li key={step.sequence}>
                      <span className={`audit-dot audit-${step.status}`} />
                      <div>
                        <div><b>{String(step.sequence).padStart(2, "0")}</b><strong>{step.action}</strong><span>{step.actor}</span></div>
                        <p>{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </section>

          <EvaluationMatrix evaluation={initialEvaluation} />

          <footer className="site-footer">
            <div><strong>CustodianMesh AI</strong><span>Deterministic, local-first reference MVP</span></div>
            <p>Synthetic data only · no live agency integration · no model required · not a production security certification</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
