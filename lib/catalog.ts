import type {
  MetricKey,
  NodeCatalogEntry,
  NodeId,
  ToolName,
} from "./types";

export const METRIC_LABELS: Record<MetricKey, string> = {
  yield_t_ha: "Paddy yield",
  irrigation_stress_pct: "Irrigation stress",
  soil_moisture_index: "Soil moisture",
  renewable_share_pct: "Renewable share",
  peak_load_mw: "Peak load",
  reserve_margin_pct: "Reserve margin",
  habitat_condition_index: "Habitat condition",
  pressure_index: "Habitat pressure",
  protected_coverage_pct: "Protected coverage",
  risk_index: "Composite risk",
};

export const METRIC_UNITS: Record<MetricKey, string> = {
  yield_t_ha: "t/ha",
  irrigation_stress_pct: "%",
  soil_moisture_index: "/100",
  renewable_share_pct: "%",
  peak_load_mw: "MW",
  reserve_margin_pct: "%",
  habitat_condition_index: "/100",
  pressure_index: "/100",
  protected_coverage_pct: "%",
  risk_index: "/100",
};

export const NODE_CATALOG: Record<NodeId, NodeCatalogEntry> = {
  agriculture: {
    id: "agriculture",
    name: "Paddy Resilience Node",
    agency: "Synthetic Agriculture Custodian",
    description:
      "Publishes regional yield, water-stress, soil, and risk aggregates.",
    tool: "agriculture.aggregate_region",
    publishedMetrics: [
      "yield_t_ha",
      "irrigation_stress_pct",
      "soil_moisture_index",
      "risk_index",
    ],
    boundary: "Raw plot and farmer records stay inside this adapter.",
    status: "online",
  },
  energy: {
    id: "energy",
    name: "Grid Resilience Node",
    agency: "Synthetic Energy Custodian",
    description:
      "Publishes regional load, renewable-share, reserve, and risk aggregates.",
    tool: "energy.aggregate_region",
    publishedMetrics: [
      "renewable_share_pct",
      "peak_load_mw",
      "reserve_margin_pct",
      "risk_index",
    ],
    boundary: "Raw interval, meter, and operator records stay inside this adapter.",
    status: "online",
  },
  biodiversity: {
    id: "biodiversity",
    name: "Landscape Integrity Node",
    agency: "Synthetic Biodiversity Custodian",
    description:
      "Publishes regional habitat, pressure, protection, and risk aggregates.",
    tool: "biodiversity.aggregate_region",
    publishedMetrics: [
      "habitat_condition_index",
      "pressure_index",
      "protected_coverage_pct",
      "risk_index",
    ],
    boundary: "Raw observation and sensitive-location records stay inside this adapter.",
    status: "online",
  },
};

export const APPROVED_TOOLS: Record<NodeId, ToolName> = {
  agriculture: "agriculture.aggregate_region",
  energy: "energy.aggregate_region",
  biodiversity: "biodiversity.aggregate_region",
};
