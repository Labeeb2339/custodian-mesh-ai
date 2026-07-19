import { NODE_CATALOG } from "../catalog";
import { provenanceFor } from "../provenance";
import type { MetricKey, NodeToolResult } from "../types";
import { mean, publishedRow, round } from "./common";

interface BiodiversityRecord {
  observationId: string;
  observerId: string;
  speciesCode: string;
  nestLat: number;
  nestLng: number;
  locationCanary: string;
  region: "Coastal" | "Central" | "Highland";
  habitatConditionIndex: number;
  pressureIndex: number;
  protectedCoveragePct: number;
}

// Private synthetic observations. This array is intentionally not exported.
const RECORDS: BiodiversityRecord[] = [
  { observationId: "OBS-C-01", observerId: "observer-a", speciesCode: "SP-101", nestLat: 1.611, nestLng: 110.811, locationCanary: "CANARY-BIO-01", region: "Coastal", habitatConditionIndex: 58, pressureIndex: 68, protectedCoveragePct: 41 },
  { observationId: "OBS-C-02", observerId: "observer-b", speciesCode: "SP-102", nestLat: 1.623, nestLng: 110.826, locationCanary: "CANARY-BIO-02", region: "Coastal", habitatConditionIndex: 61, pressureIndex: 64, protectedCoveragePct: 44 },
  { observationId: "OBS-C-03", observerId: "observer-c", speciesCode: "SP-103", nestLat: 1.636, nestLng: 110.839, locationCanary: "CANARY-BIO-03", region: "Coastal", habitatConditionIndex: 56, pressureIndex: 72, protectedCoveragePct: 39 },
  { observationId: "OBS-C-04", observerId: "observer-d", speciesCode: "SP-104", nestLat: 1.647, nestLng: 110.851, locationCanary: "CANARY-BIO-04", region: "Coastal", habitatConditionIndex: 63, pressureIndex: 62, protectedCoveragePct: 46 },
  { observationId: "OBS-C-05", observerId: "observer-e", speciesCode: "SP-105", nestLat: 1.659, nestLng: 110.864, locationCanary: "CANARY-BIO-05", region: "Coastal", habitatConditionIndex: 59, pressureIndex: 67, protectedCoveragePct: 43 },
  { observationId: "OBS-M-01", observerId: "observer-f", speciesCode: "SP-201", nestLat: 2.711, nestLng: 111.811, locationCanary: "CANARY-BIO-06", region: "Central", habitatConditionIndex: 71, pressureIndex: 47, protectedCoveragePct: 55 },
  { observationId: "OBS-M-02", observerId: "observer-g", speciesCode: "SP-202", nestLat: 2.723, nestLng: 111.826, locationCanary: "CANARY-BIO-07", region: "Central", habitatConditionIndex: 74, pressureIndex: 43, protectedCoveragePct: 58 },
  { observationId: "OBS-M-03", observerId: "observer-h", speciesCode: "SP-203", nestLat: 2.736, nestLng: 111.839, locationCanary: "CANARY-BIO-08", region: "Central", habitatConditionIndex: 69, pressureIndex: 51, protectedCoveragePct: 52 },
  { observationId: "OBS-M-04", observerId: "observer-i", speciesCode: "SP-204", nestLat: 2.747, nestLng: 111.851, locationCanary: "CANARY-BIO-09", region: "Central", habitatConditionIndex: 76, pressureIndex: 39, protectedCoveragePct: 61 },
  { observationId: "OBS-M-05", observerId: "observer-j", speciesCode: "SP-205", nestLat: 2.759, nestLng: 111.864, locationCanary: "CANARY-BIO-10", region: "Central", habitatConditionIndex: 72, pressureIndex: 45, protectedCoveragePct: 57 },
  { observationId: "OBS-H-01", observerId: "observer-k", speciesCode: "SP-301", nestLat: 3.811, nestLng: 112.911, locationCanary: "CANARY-BIO-11", region: "Highland", habitatConditionIndex: 82, pressureIndex: 28, protectedCoveragePct: 69 },
  { observationId: "OBS-H-02", observerId: "observer-l", speciesCode: "SP-302", nestLat: 3.823, nestLng: 112.926, locationCanary: "CANARY-BIO-12", region: "Highland", habitatConditionIndex: 79, pressureIndex: 31, protectedCoveragePct: 66 },
  { observationId: "OBS-H-03", observerId: "observer-m", speciesCode: "SP-303", nestLat: 3.836, nestLng: 112.939, locationCanary: "CANARY-BIO-13", region: "Highland", habitatConditionIndex: 84, pressureIndex: 25, protectedCoveragePct: 72 },
  { observationId: "OBS-H-04", observerId: "observer-n", speciesCode: "SP-304", nestLat: 3.847, nestLng: 112.951, locationCanary: "CANARY-BIO-14", region: "Highland", habitatConditionIndex: 81, pressureIndex: 29, protectedCoveragePct: 68 },
];

export function aggregateBiodiversity(metrics: MetricKey[]): NodeToolResult {
  const rows = ["Coastal", "Central", "Highland"].map((region) => {
    const records = RECORDS.filter((record) => record.region === region);
    const habitat = mean(records.map((record) => record.habitatConditionIndex));
    const pressure = mean(records.map((record) => record.pressureIndex));
    const risk = 0.55 * pressure + 0.45 * (100 - habitat);
    return publishedRow(region, records.length, metrics, {
      habitat_condition_index: round(habitat),
      pressure_index: round(pressure),
      protected_coverage_pct: round(
        mean(records.map((record) => record.protectedCoveragePct)),
      ),
      risk_index: round(risk),
    });
  });
  return {
    node: "biodiversity",
    tool: "biodiversity.aggregate_region",
    metrics,
    rows,
    provenance: provenanceFor(
      "biodiversity",
      rows.filter((row) => !row.suppressed).length,
    ),
  };
}

export const BIODIVERSITY_PUBLIC_METRICS =
  NODE_CATALOG.biodiversity.publishedMetrics;
