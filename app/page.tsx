import { runQuery } from "@/lib/engine";
import { getEvaluationSnapshot } from "@/lib/evaluations";
import { Dashboard } from "./dashboard";

export default function Home() {
  const initialResult = runQuery({
    query: "Compare paddy, grid, and habitat risk across all sectors.",
    role: "policy-analyst",
  });
  const initialEvaluation = getEvaluationSnapshot();
  return (
    <Dashboard
      initialResult={initialResult}
      initialEvaluation={initialEvaluation}
    />
  );
}
