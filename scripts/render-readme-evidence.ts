import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runEvaluationSuite } from "../lib/evaluations";
import type { EvaluationCategory } from "../lib/types";

const outputUrl = new URL(
  "../public/custodian-evaluation.svg",
  import.meta.url,
);

const categoryOrder: EvaluationCategory[] = [
  "routing",
  "provenance",
  "least-privilege",
  "prompt-injection",
  "forbidden-fields",
  "raw-data-egress",
];

const categoryLabel: Record<EvaluationCategory, [string, string?]> = {
  routing: ["Routing"],
  provenance: ["Provenance"],
  "least-privilege": ["Least", "privilege"],
  "prompt-injection": ["Prompt", "injection"],
  "forbidden-fields": ["Forbidden", "fields"],
  "raw-data-egress": ["Raw-data", "egress"],
};

const verdictColor = {
  allow: "#2d7157",
  partial: "#c58a24",
  deny: "#a44738",
  abstain: "#6f7770",
};

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

function renderSvg() {
  const suite = runEvaluationSuite();
  if (suite.total !== 30 || suite.passed !== 30 || suite.failed !== 0) {
    throw new Error("The README figure expects the fixed 30-case suite to pass.");
  }

  const unexpectedCapabilityCalls = suite.results.reduce(
    (total, result) => total + result.unexpectedCapabilityCalls,
    0,
  );
  const verdictCounts = Object.fromEntries(
    ["allow", "partial", "deny", "abstain"].map((verdict) => [
      verdict,
      suite.results.filter((result) => result.verdict === verdict).length,
    ]),
  ) as Record<"allow" | "partial" | "deny" | "abstain", number>;

  const columns = categoryOrder.map((category, columnIndex) => {
    const entries = suite.results.filter((result) => result.category === category);
    if (entries.length !== 5 || entries.some((result) => !result.passed)) {
      throw new Error(`Expected five passing ${category} evaluation cases.`);
    }
    const x = 78 + columnIndex * 226;
    const [firstLine, secondLine] = categoryLabel[category];
    const heading = secondLine
      ? `<text x="${x}" y="145" class="category">${firstLine}</text><text x="${x}" y="169" class="category">${secondLine}</text>`
      : `<text x="${x}" y="157" class="category">${firstLine}</text>`;
    const tiles = entries.map((entry, rowIndex) => {
      const y = 196 + rowIndex * 59;
      const number = entry.id.split("-").at(-1) ?? String(rowIndex + 1);
      return `<g>
        <title>${escapeXml(entry.title)} — ${entry.verdict}; expected behavior passed</title>
        <rect x="${x}" y="${y}" width="190" height="43" rx="4" fill="${verdictColor[entry.verdict]}"/>
        <text x="${x + 16}" y="${y + 28}" class="tile-id">${number}</text>
        <text x="${x + 166}" y="${y + 29}" text-anchor="end" class="check">✓</text>
      </g>`;
    });
    return `<g>${heading}${tiles.join("")}</g>`;
  });

  const verdictOrder = ["deny", "allow", "partial", "abstain"] as const;
  let cursor = 78;
  const totalWidth = 1040;
  const segments = verdictOrder.map((verdict) => {
    const count = verdictCounts[verdict];
    const width = (count / suite.total) * totalWidth;
    const result = `<rect x="${cursor.toFixed(2)}" y="600" width="${width.toFixed(2)}" height="38" fill="${verdictColor[verdict]}"/>
      ${width >= 100 ? `<text x="${(cursor + width / 2).toFixed(2)}" y="625" text-anchor="middle" class="segment">${count} ${verdict}</text>` : ""}`;
    cursor += width;
    return result;
  });

  const legend = verdictOrder.map((verdict, index) => {
    const x = 78 + index * 225;
    return `<rect x="${x}" y="666" width="16" height="16" rx="2" fill="${verdictColor[verdict]}"/><text x="${x + 26}" y="680" class="legend">${verdictCounts[verdict]} ${verdict}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="780" viewBox="0 0 1500 780" role="img" aria-labelledby="title desc">
  <title id="title">CustodianMesh fixed policy evaluation</title>
  <desc id="desc">Thirty fixed evaluation cases grouped into routing, provenance, least privilege, prompt injection, forbidden fields, and raw-data egress. All expected behaviors pass. The suite contains 18 deny, 6 allow, 5 partial, and 1 abstain verdict.</desc>
  <style>
    .title{font:700 35px Georgia,serif;fill:#173c2e;letter-spacing:.4px}.subtitle,.legend,.footer{font:500 16px Inter,Segoe UI,sans-serif;fill:#53685f}.category{font:700 20px Georgia,serif;fill:#173c2e}.tile-id{font:700 16px ui-monospace,SFMono-Regular,Consolas,monospace;fill:#fff9e9}.check{font:700 19px Inter,Segoe UI,sans-serif;fill:#fff9e9}.segment{font:700 15px Inter,Segoe UI,sans-serif;fill:#fff9e9;text-transform:uppercase}.rule{stroke:#c8b990;stroke-width:1}
  </style>
  <rect width="1500" height="780" fill="#f4ecd8"/>
  <path d="M0 78C280 18 510 116 760 58S1230 15 1500 91" fill="none" stroke="#d8cda9" stroke-width="2"/>
  <path d="M0 100C300 38 530 136 780 80S1240 38 1500 110" fill="none" stroke="#e3d9bd" stroke-width="1"/>
  <text x="78" y="64" class="title">FIXED POLICY EVALUATION</text>
  <text x="78" y="103" class="subtitle">Six policy boundaries · five maintained cases each · expected behavior shown by ✓</text>
  <path d="M78 120H1422" class="rule"/>
  ${columns.join("")}
  <text x="78" y="568" class="category">Observed verdict mix</text>
  <rect x="78" y="600" width="1040" height="38" fill="#d8cfb8"/>
  ${segments.join("")}
  ${legend.join("")}
  <path d="M78 715H1422" class="rule"/>
  <text x="78" y="750" class="footer">${suite.passed}/${suite.total} expected behaviors · ${unexpectedCapabilityCalls} unexpected capability calls · eval-1.0 fixed regression suite</text>
  <text x="1422" y="750" text-anchor="end" class="footer">Not a production security or compliance benchmark</text>
</svg>
`;
}

const expected = renderSvg();
const check = process.argv.includes("--check");
const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

if (check) {
  let current = "";
  try {
    current = readFileSync(outputUrl, "utf8");
  } catch {
    // A missing file is reported by the stale-evidence message below.
  }
  if (normalizeLineEndings(current) !== expected) {
    process.stderr.write(
      `README evidence is stale. Run npm run evidence:render (${fileURLToPath(outputUrl)}).\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("README evidence matches the fixed evaluation suite.\n");
  }
} else {
  writeFileSync(outputUrl, expected, "utf8");
  process.stdout.write(`Wrote ${fileURLToPath(outputUrl)}\n`);
}
