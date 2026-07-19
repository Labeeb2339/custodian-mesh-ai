import { NODE_CATALOG } from "../catalog";
import { provenanceFor } from "../provenance";
import type { MetricKey, NodeToolResult } from "../types";
import { mean, publishedRow, round } from "./common";

interface AgricultureRecord {
  farmRef: string;
  farmerAlias: string;
  contactCanary: string;
  plotId: string;
  village: string;
  exactLat: number;
  exactLng: number;
  region: "Coastal" | "Central" | "Highland";
  yieldTha: number;
  irrigationStressPct: number;
  soilMoistureIndex: number;
}

// Private synthetic rows. This array is intentionally not exported.
const RECORDS: AgricultureRecord[] = [
  { farmRef: "FARM-C-01", farmerAlias: "farmer-a", contactCanary: "CANARY-AGR-01", plotId: "P-C-101", village: "Delta A", exactLat: 1.421, exactLng: 110.331, region: "Coastal", yieldTha: 4.1, irrigationStressPct: 62, soilMoistureIndex: 48 },
  { farmRef: "FARM-C-02", farmerAlias: "farmer-b", contactCanary: "CANARY-AGR-02", plotId: "P-C-102", village: "Delta B", exactLat: 1.429, exactLng: 110.346, region: "Coastal", yieldTha: 4.4, irrigationStressPct: 58, soilMoistureIndex: 51 },
  { farmRef: "FARM-C-03", farmerAlias: "farmer-c", contactCanary: "CANARY-AGR-03", plotId: "P-C-103", village: "Delta C", exactLat: 1.437, exactLng: 110.359, region: "Coastal", yieldTha: 4.0, irrigationStressPct: 66, soilMoistureIndex: 45 },
  { farmRef: "FARM-C-04", farmerAlias: "farmer-d", contactCanary: "CANARY-AGR-04", plotId: "P-C-104", village: "Delta D", exactLat: 1.445, exactLng: 110.368, region: "Coastal", yieldTha: 4.6, irrigationStressPct: 55, soilMoistureIndex: 54 },
  { farmRef: "FARM-C-05", farmerAlias: "farmer-e", contactCanary: "CANARY-AGR-05", plotId: "P-C-105", village: "Delta E", exactLat: 1.452, exactLng: 110.377, region: "Coastal", yieldTha: 4.2, irrigationStressPct: 61, soilMoistureIndex: 49 },
  { farmRef: "FARM-M-01", farmerAlias: "farmer-f", contactCanary: "CANARY-AGR-06", plotId: "P-M-201", village: "Plain A", exactLat: 2.111, exactLng: 111.421, region: "Central", yieldTha: 5.3, irrigationStressPct: 34, soilMoistureIndex: 66 },
  { farmRef: "FARM-M-02", farmerAlias: "farmer-g", contactCanary: "CANARY-AGR-07", plotId: "P-M-202", village: "Plain B", exactLat: 2.123, exactLng: 111.438, region: "Central", yieldTha: 5.6, irrigationStressPct: 29, soilMoistureIndex: 70 },
  { farmRef: "FARM-M-03", farmerAlias: "farmer-h", contactCanary: "CANARY-AGR-08", plotId: "P-M-203", village: "Plain C", exactLat: 2.135, exactLng: 111.449, region: "Central", yieldTha: 5.1, irrigationStressPct: 38, soilMoistureIndex: 63 },
  { farmRef: "FARM-M-04", farmerAlias: "farmer-i", contactCanary: "CANARY-AGR-09", plotId: "P-M-204", village: "Plain D", exactLat: 2.146, exactLng: 111.462, region: "Central", yieldTha: 5.5, irrigationStressPct: 31, soilMoistureIndex: 68 },
  { farmRef: "FARM-M-05", farmerAlias: "farmer-j", contactCanary: "CANARY-AGR-10", plotId: "P-M-205", village: "Plain E", exactLat: 2.158, exactLng: 111.475, region: "Central", yieldTha: 5.4, irrigationStressPct: 33, soilMoistureIndex: 67 },
  { farmRef: "FARM-H-01", farmerAlias: "farmer-k", contactCanary: "CANARY-AGR-11", plotId: "P-H-301", village: "Terrace A", exactLat: 3.211, exactLng: 112.521, region: "Highland", yieldTha: 3.8, irrigationStressPct: 47, soilMoistureIndex: 55 },
  { farmRef: "FARM-H-02", farmerAlias: "farmer-l", contactCanary: "CANARY-AGR-12", plotId: "P-H-302", village: "Terrace B", exactLat: 3.224, exactLng: 112.538, region: "Highland", yieldTha: 3.9, irrigationStressPct: 44, soilMoistureIndex: 58 },
  { farmRef: "FARM-H-03", farmerAlias: "farmer-m", contactCanary: "CANARY-AGR-13", plotId: "P-H-303", village: "Terrace C", exactLat: 3.237, exactLng: 112.549, region: "Highland", yieldTha: 4.0, irrigationStressPct: 42, soilMoistureIndex: 60 },
  { farmRef: "FARM-H-04", farmerAlias: "farmer-n", contactCanary: "CANARY-AGR-14", plotId: "P-H-304", village: "Terrace D", exactLat: 3.249, exactLng: 112.562, region: "Highland", yieldTha: 3.7, irrigationStressPct: 51, soilMoistureIndex: 53 },
];

export function aggregateAgriculture(metrics: MetricKey[]): NodeToolResult {
  const rows = ["Coastal", "Central", "Highland"].map((region) => {
    const records = RECORDS.filter((record) => record.region === region);
    const irrigation = mean(records.map((record) => record.irrigationStressPct));
    const moisture = mean(records.map((record) => record.soilMoistureIndex));
    const risk = 0.58 * irrigation + 0.42 * (100 - moisture);
    return publishedRow(region, records.length, metrics, {
      yield_t_ha: round(mean(records.map((record) => record.yieldTha)), 2),
      irrigation_stress_pct: round(irrigation),
      soil_moisture_index: round(moisture),
      risk_index: round(risk),
    });
  });
  return {
    node: "agriculture",
    tool: "agriculture.aggregate_region",
    metrics,
    rows,
    provenance: provenanceFor(
      "agriculture",
      rows.filter((row) => !row.suppressed).length,
    ),
  };
}

export const AGRICULTURE_PUBLIC_METRICS =
  NODE_CATALOG.agriculture.publishedMetrics;
