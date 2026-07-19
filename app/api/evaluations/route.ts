import { getEvaluationSnapshot } from "@/lib/evaluations";
import { jsonResponse } from "@/lib/http";

export function GET(): Response {
  return jsonResponse(getEvaluationSnapshot());
}
