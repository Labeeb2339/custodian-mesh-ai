import { NODE_CATALOG } from "../catalog";
import { provenanceFor } from "../provenance";
import type { MetricKey, NodeToolResult } from "../types";
import { mean, publishedRow, round } from "./common";

interface EnergyRecord {
  meterId: string;
  substationCode: string;
  operatorShift: string;
  auditCanary: string;
  region: "Coastal" | "Central" | "Highland";
  loadMw: number;
  renewableMw: number;
  availableCapacityMw: number;
}

// Private synthetic intervals. This array is intentionally not exported.
const RECORDS: EnergyRecord[] = [
  { meterId: "MTR-C-01", substationCode: "SS-C1", operatorShift: "alpha", auditCanary: "CANARY-ENE-01", region: "Coastal", loadMw: 720, renewableMw: 238, availableCapacityMw: 835 },
  { meterId: "MTR-C-02", substationCode: "SS-C2", operatorShift: "bravo", auditCanary: "CANARY-ENE-02", region: "Coastal", loadMw: 760, renewableMw: 251, availableCapacityMw: 872 },
  { meterId: "MTR-C-03", substationCode: "SS-C3", operatorShift: "charlie", auditCanary: "CANARY-ENE-03", region: "Coastal", loadMw: 805, renewableMw: 274, availableCapacityMw: 901 },
  { meterId: "MTR-C-04", substationCode: "SS-C4", operatorShift: "alpha", auditCanary: "CANARY-ENE-04", region: "Coastal", loadMw: 782, renewableMw: 266, availableCapacityMw: 890 },
  { meterId: "MTR-C-05", substationCode: "SS-C5", operatorShift: "bravo", auditCanary: "CANARY-ENE-05", region: "Coastal", loadMw: 748, renewableMw: 247, availableCapacityMw: 861 },
  { meterId: "MTR-M-01", substationCode: "SS-M1", operatorShift: "alpha", auditCanary: "CANARY-ENE-06", region: "Central", loadMw: 940, renewableMw: 282, availableCapacityMw: 1110 },
  { meterId: "MTR-M-02", substationCode: "SS-M2", operatorShift: "bravo", auditCanary: "CANARY-ENE-07", region: "Central", loadMw: 980, renewableMw: 304, availableCapacityMw: 1152 },
  { meterId: "MTR-M-03", substationCode: "SS-M3", operatorShift: "charlie", auditCanary: "CANARY-ENE-08", region: "Central", loadMw: 1015, renewableMw: 315, availableCapacityMw: 1175 },
  { meterId: "MTR-M-04", substationCode: "SS-M4", operatorShift: "alpha", auditCanary: "CANARY-ENE-09", region: "Central", loadMw: 965, renewableMw: 299, availableCapacityMw: 1138 },
  { meterId: "MTR-M-05", substationCode: "SS-M5", operatorShift: "bravo", auditCanary: "CANARY-ENE-10", region: "Central", loadMw: 992, renewableMw: 318, availableCapacityMw: 1163 },
  { meterId: "MTR-H-01", substationCode: "SS-H1", operatorShift: "alpha", auditCanary: "CANARY-ENE-11", region: "Highland", loadMw: 390, renewableMw: 188, availableCapacityMw: 492 },
  { meterId: "MTR-H-02", substationCode: "SS-H2", operatorShift: "bravo", auditCanary: "CANARY-ENE-12", region: "Highland", loadMw: 405, renewableMw: 196, availableCapacityMw: 508 },
  { meterId: "MTR-H-03", substationCode: "SS-H3", operatorShift: "charlie", auditCanary: "CANARY-ENE-13", region: "Highland", loadMw: 418, renewableMw: 207, availableCapacityMw: 521 },
  { meterId: "MTR-H-04", substationCode: "SS-H4", operatorShift: "alpha", auditCanary: "CANARY-ENE-14", region: "Highland", loadMw: 401, renewableMw: 195, availableCapacityMw: 501 },
  { meterId: "MTR-H-05", substationCode: "SS-H5", operatorShift: "bravo", auditCanary: "CANARY-ENE-15", region: "Highland", loadMw: 397, renewableMw: 192, availableCapacityMw: 498 },
];

export function aggregateEnergy(metrics: MetricKey[]): NodeToolResult {
  const rows = ["Coastal", "Central", "Highland"].map((region) => {
    const records = RECORDS.filter((record) => record.region === region);
    const peakLoad = Math.max(...records.map((record) => record.loadMw));
    const renewableShare =
      (records.reduce((total, record) => total + record.renewableMw, 0) /
        records.reduce((total, record) => total + record.loadMw, 0)) *
      100;
    const reserveMargins = records.map(
      (record) =>
        ((record.availableCapacityMw - record.loadMw) / record.loadMw) * 100,
    );
    const reserveMargin = mean(reserveMargins);
    const risk = Math.max(0, Math.min(100, 72 - reserveMargin * 2.2));
    return publishedRow(region, records.length, metrics, {
      renewable_share_pct: round(renewableShare),
      peak_load_mw: round(peakLoad),
      reserve_margin_pct: round(reserveMargin),
      risk_index: round(risk),
    });
  });
  return {
    node: "energy",
    tool: "energy.aggregate_region",
    metrics,
    rows,
    provenance: provenanceFor(
      "energy",
      rows.filter((row) => !row.suppressed).length,
    ),
  };
}

export const ENERGY_PUBLIC_METRICS = NODE_CATALOG.energy.publishedMetrics;
