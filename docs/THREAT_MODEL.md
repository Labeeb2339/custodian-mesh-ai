# Threat model

This document describes the prototype's intended boundaries and its limits. It
does not claim compliance, certification, production readiness, or data
sovereignty.

## Protected assets

- Synthetic row-level farmer, plot, meter, operator, observer, species, and
  exact-location fields inside node adapters
- Role and metric authorization policy
- Approved node tool contracts
- Provenance revision linkage
- Denied-field reports and safe alternatives
- Audit trace content within a single response

## Actors and trust assumptions

| Actor | Assumed capability | Trust level in this demo |
| --- | --- | --- |
| API caller | Supplies arbitrary query text and one supported scenario role | Query text is untrusted; scenario is caller-selected and not authenticated |
| Planner | Proposes nodes and metrics from deterministic rules | Not an authorization authority |
| Policy engine | Filters fields, metrics, nodes, and instruction-boundary signals | Trusted in-process enforcement code |
| Broker | Calls only typed, approved adapter exports | Trusted in-process dispatcher |
| Node adapter | Holds synthetic raw rows and calculates regional aggregates | Output structure is untrusted at the boundary; numerical correctness is not independently attested |
| Provenance registry | Supplies one expected synthetic revision per node | Trusted demo configuration, not external attestation |
| Composer/UI | Presents already-authorized output | Must not recover or infer denied raw values |

A production system must authenticate the caller and agencies independently.
The demo does not treat prompt claims such as “I am an executive” as authority,
but the caller can select any scenario role in the UI or API. This is intentional
for demonstration and is an explicit production blocker.

## Attacker goals considered

- Change role or policy through direct, indirect, authority-spoofed, or
  obfuscated prompt instructions
- Request raw rows, exact identifiers, nested aliases, or sensitive coordinates
- Invoke an unapproved adapter or metric
- Force broad node fan-out for an unrelated query
- Use CSV, JSON, webhook, or file output as an egress sink
- Join row-level identifiers across custodians
- Execute with stale, missing, or conflicting provenance
- Infer a small cell from exact values or counts
- Leak embedded canaries through results, errors, or audit details
- Continue using a node after access is revoked

## Controls implemented

- Strict API shape: only `query` and a supported demo scenario role; streaming
  16 KiB byte cap and 600-character query limit
- Typed plan separate from authorization and execution
- Scenario-specific metric allowlists and exact approved tool names
- Sensitive-field alias detection and safe aggregate alternatives
- Pre-routing denial for raw-only, injection, and external-sink requests
- Simulated preflight provenance-fault checks for fixed regression cases
- Exact runtime result schema validation after every adapter execution
- Complete expected synthetic region-set validation; empty and partial adapter
  datasets are rejected
- Returned source, revision, title, agency, window, and method validation against
  the synthetic registry before results or citations are published
- Fixed `region` grouping and `k >= 5` small-cell suppression
- Module-private row arrays with aggregate-only exports
- Post-schema serialized checks for private field names and canaries as defense in depth
- An explicit broker capability set containing only the three aggregate tools;
  no file, network, raw-export, or arbitrary-tool capability exists
- Trace details contain a query hash and count, not sensitive query text
- Sensitive request text is withheld from the response
- Negative evaluations assert actual aggregate broker calls and reject unexpected
  nodes, independently declared expected metrics, or rejected capability requests

These controls are consistent with least-privilege and decision/execution
separation guidance in the
[OWASP Agentic AI Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html).
The project does not claim OWASP compliance or certification.

## Named egress sinks

The engine has no implementations for outbound HTTP/webhooks, email, message
queues, arbitrary file writes, CSV downloads, or raw JSON export. Its broker
exposes only three typed aggregate capabilities. Evaluation diagnostics record
actual aggregate capability calls and rejected broker requests. They do not
pretend to observe file or network APIs that do not exist in this process.

The dashboard's normal JSON response is an allowed sink only after aggregate
contract validation. Build tooling and package installation can use the network,
but they are outside the query execution boundary.

## Audit and provenance limits

The trace records ordered in-memory decisions for one response. Tests verify
that synthetic canaries and private field names are absent from results and
trace details. The log is not signed, append-only, remotely witnessed, or
tamper-evident.

Citations bind a result to a configured source ID and revision. They do not
verify the truth, quality, legality, or scientific validity of the source.

## Residual risks

- Pattern-based injection and field detection can miss novel encodings,
  languages, aliases, or multi-turn context.
- Any caller can select any demo scenario role because identity is not integrated.
- All nodes share one runtime, so process compromise crosses simulated agency
  boundaries.
- Static synthetic rows are present in the server bundle and are not encrypted
  at rest; they contain no real personal or agency data.
- A compromised adapter could still falsify a plausible finite number inside an
  allowed aggregate field; schema validation prevents structural/raw-field
  expansion but does not establish numerical truth.
- k-threshold suppression alone does not prevent differencing, linkage, or
  repeated-query attacks in a richer system.
- Source revisions are opaque demo strings, not signed manifests or content
  hashes.
- No rate limit, tenant boundary, key management, secret store, incident
  response, retention control, or independent monitoring is implemented.
- The deterministic risk calculation is illustrative and may encode simplistic
  assumptions.

## Non-goals

- Processing real government, personal, operational, ecological, or classified
  data
- Replacing agency data-governance, security, privacy, scientific, or legal
  review
- Claiming that source data physically remains in Sarawak
- Demonstrating end-to-end confidential computing or sovereign cloud controls
- Providing a general natural-language agent or unrestricted data exploration

## Production hardening path

Before any real deployment, separate each custodian into its own administrative
domain; authenticate people, workloads, and agencies; use signed policy and
schema bundles; attest source revisions; encrypt transport and storage; add
query budgeting and anti-differencing controls; centralize redacted monitoring;
perform independent security/privacy review; and run adversarial tests against
the actual deployed boundary.
