# CustodianMesh AI

![CustodianMesh AI social preview](public/custodian-mesh-social.png)

I built CustodianMesh AI as a full-stack TypeScript demonstration of
policy-gated, federated decision support. It routes a typed request to three
simulated agency-owned nodes—agriculture, energy, and biodiversity—then releases
only approved regional aggregates with provenance, denied-field reporting, and
an inspectable audit trace.

The default path is deterministic and runs without a model, API key, paid
service, database, or real agency data. Every record and agency name in the
demo is synthetic.

> This is an independent technical prototype, not a Sarawak Government or
> Sarawak AI Centre system. It is not connected to an agency, certified for
> production, or evidence that a deployment is compliant, secure, or
> sovereign.

## Why this project exists

Public reporting on Sarawak's AI direction describes a federated approach in
which agencies retain data custodianship instead of moving all data into one
central store. CustodianMesh turns that idea into an inspectable prototype:
the planner proposes a route, programmatic policy decides what may execute,
and each simulated custodian exposes one narrow aggregate-only tool.

The project is informed by, but is not affiliated with:

- [Sarawak AI Centre / UKAS reporting on federated data governance](https://ukas.sarawak.gov.my/web/subpage/news_view/40407)
- [OWASP Agentic AI Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/)
- [IMDA Model AI Governance Framework for Agentic AI](https://www.imda.gov.sg/-/media/imda/files/about/emerging-tech-and-research/artificial-intelligence/mgf-for-agentic-ai.pdf)

## What is implemented

- Deterministic typed planner with no broad fan-out on unrelated queries
- Three in-process synthetic custodians with module-private raw rows
- Demo-scenario role and metric allowlists for `policy-analyst`, `executive`, and
  `public-reviewer`
- Exact approved tool contracts with fixed `region` grouping
- k-anonymity-style small-cell suppression (`k >= 5`)
- Runtime provenance validation against the synthetic registry before citation
- Exact runtime result schemas for node, tool, metrics, complete regions, suppression, and provenance
- Field-level denial reasons and safe aggregate alternatives
- Aggregate egress validation with synthetic canary checks
- Citation records and a phase-by-phase execution trace
- Thirty fixed evaluation cases: five each for routing, provenance,
  least privilege, prompt injection, forbidden fields, and raw-data egress
- Responsive dashboard and JSON API routes
- Automated type, unit, policy, build, and rendered-output checks

## Run locally

Prerequisites: Node.js `>=22.13.0` and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Run the verification pipeline:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:rendered
```

Or use the condensed project check:

```bash
npm run check
```

## API

`POST /api/query` accepts exactly two fields. `role` is a caller-selected demo
scenario, not authenticated identity or production authorization. Prompt text
cannot change that selected scenario.

```json
{
  "query": "Compare paddy resilience with grid resilience by region.",
  "role": "policy-analyst"
}
```

Other routes:

| Route | Purpose |
| --- | --- |
| `GET /api/nodes` | Safe node catalog and published metric contracts |
| `GET /api/evaluations` | Aggregate outcomes for the fixed 30-case suite |
| `GET /api/health` | Live deterministic engine check plus cached evaluation health; structured 503 on failure |

Responses use `Cache-Control: no-store`. Query bodies are read through a
streaming 16 KiB byte cap even when `Content-Length` is absent, query text is
limited to 600 characters, and unexpected authority-bearing properties are
rejected. Query responses explicitly report `authenticated: false` and the
production-use blocker in `roleContext`.

## Enforcement boundary

The planner does not authorize tools. It produces a typed plan. A separate
policy engine filters tasks and metrics before the broker can call a node.
Node adapters export aggregate functions, not their synthetic row arrays. Every
returned result is checked against an exact runtime schema, including requested
node/tool/metrics, row keys and values, small-cell invariants, and provenance
shape. Empty or partial synthetic region sets are rejected. Returned provenance
must then match the synthetic registry before a
result or citation is published. A private-field/canary denylist remains a
second layer rather than the primary validator.

This is a useful executable boundary, but not a production security perimeter:
all three nodes run in one process, demo scenario roles are supplied by the caller, the
provenance registry is synthetic, and there is no cryptographic audit log,
agency identity, network isolation, or real source attestation.

See [Architecture](docs/ARCHITECTURE.md), [Threat model](docs/THREAT_MODEL.md),
and [Evaluation protocol](docs/EVALUATION.md).

## Repository map

```text
app/                 Dashboard and API routes
lib/planner.ts       Deterministic intent and route planner
lib/policy.ts        Role, field, revocation, and tool enforcement
lib/engine.ts        Provenance gate, broker, egress checks, composition
lib/nodes/           Simulated custodian adapters with private synthetic rows
lib/evaluations.ts   Fixed 30-case evaluation suite
tests/               Engine, API, privacy, and rendered-output tests
docs/                Architecture, threat model, and evaluation claims
```

## Limitations

- Citations show which registered synthetic source revision produced an
  aggregate; they do not establish that the underlying claim is true.
- The finite prompt-injection suite demonstrates tested behavior only. It does
  not make the system injection-proof.
- The policy is code, not a substitute for legal, privacy, security, or domain
  review.
- The cross-node risk score is a demonstration calculation, not an official
  operational or scientific metric.
- No persistence is used; requests and results are transient.

## License

[MIT](LICENSE)
