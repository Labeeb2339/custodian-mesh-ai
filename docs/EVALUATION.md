# Evaluation protocol

CustodianMesh AI includes a fixed, deterministic 30-case suite in
`lib/evaluations.ts`. It is a regression harness for this implementation, not a
benchmark against other systems and not proof of general security.

## Matrix

| Category | Cases | Required behavior |
| --- | ---: | --- |
| Routing | 5 | Route only to relevant custodians; abstain without fan-out when out of scope |
| Provenance | 5 | Link current revisions; block missing, stale, conflicting, or fabricated provenance |
| Least privilege | 5 | Enforce scenario metrics, revocation, prompt/scenario separation, and small-cell suppression |
| Prompt injection | 5 | Stop direct, indirect, obfuscated, authority-spoofed, and tool-override attempts before node execution |
| Forbidden fields | 5 | Deny or remove identity, nested alias, serial, profile-location, and coordinate requests |
| Raw-data egress | 5 | Deny row dumps, cross-node joins, and sink/canary requests before aggregate routing |

Each category contains exactly five cases. The suite checks the final verdict,
actual node calls, required denied field, citation/provenance state, and where
applicable the fully suppressed small cell.

## Broker-call rule

A negative test passes only when the decision matches and all instrumented
broker checks hold:

- No unexpected aggregate adapter call
- No unauthorized metric call
- No rejected broker capability request

Least-privilege cases declare their expected broker metric sets directly in the
test expectations. They are not inferred from `response.policy.deniedFields`,
so a policy regression that both permits and fails to report a metric still
fails the matrix.

It also fails if a known synthetic canary reaches a response. The broker exposes
only the three aggregate tools; it has no network, file, raw-export, or
arbitrary-tool capability. Diagnostics therefore report actual aggregate broker
calls and do not claim visibility into non-existent file/network APIs.

## Run and inspect

```bash
npm test
```

Expected local result for this revision: eighteen Node test cases pass, including the
single test that runs all 30 fixed evaluations. The machine-readable aggregate
suite is cached as one immutable module snapshot and returned by
`GET /api/evaluations`; prompts are intentionally not included in that endpoint.

Build and rendered-output checks:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:rendered
```

`tests/engine.test.ts` additionally checks determinism, out-of-scope abstention,
scenario-role precedence, canary absence, small-cell suppression, non-exported raw
arrays, the chunked byte cap, malicious adapter-result structures, actual
returned-provenance mismatches, exact citation linkage, cached evaluations,
health execution and structured failure responses, strict API input, and safe
evaluation output. The rendered test verifies
the production HTML contains the product and fixed evaluation surface without
starter copy.

## What the suite does not establish

- It covers a finite set of English patterns, so “30/30” does not mean
  injection-proof or universally safe.
- Diagnostics observe only the explicit in-process aggregate broker, not
  independent runtime, filesystem, or network telemetry.
- Synthetic canary absence is tested, but the audit trace is not tamper-evident.
- Citation checks validate exact linkage to the synthetic registry, not truth or
  external source authenticity.
- No real agency boundary, identity provider, persistence layer, or external
  service is exercised.
- The suite is deterministic; it does not measure model quality because the
  verified default uses no model.

Add cases whenever a new route, role, field alias, adapter, egress sink,
provenance state, or policy rule is introduced. Adversarial cases should be
re-run against the deployed production boundary rather than relying only on
unit instrumentation.
