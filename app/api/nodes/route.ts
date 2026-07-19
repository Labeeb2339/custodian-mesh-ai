import { NODE_CATALOG } from "@/lib/catalog";
import { jsonResponse } from "@/lib/http";
import { NODE_IDS } from "@/lib/types";

export function GET(): Response {
  return jsonResponse({
    mode: "synthetic-demo",
    nodes: NODE_IDS.map((node) => NODE_CATALOG[node]),
    boundary:
      "Only fixed regional aggregates cross node adapters; no raw row endpoint exists.",
  });
}
