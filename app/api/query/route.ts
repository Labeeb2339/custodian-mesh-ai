import { runQuery } from "@/lib/engine";
import { jsonResponse } from "@/lib/http";
import { USER_ROLES, type QueryRequest, type UserRole } from "@/lib/types";

const MAX_QUERY_LENGTH = 600;
const MAX_BODY_BYTES = 16_384;

class BodyTooLargeError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(value: unknown): QueryRequest | null {
  if (!isObject(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !["query", "role"].includes(key))) {
    return null;
  }
  if (
    typeof value.query !== "string" ||
    value.query.trim().length < 3 ||
    value.query.trim().length > MAX_QUERY_LENGTH ||
    typeof value.role !== "string" ||
    !USER_ROLES.includes(value.role as UserRole)
  ) {
    return null;
  }
  return { query: value.query.trim(), role: value.role as UserRole };
}

async function readByteCappedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_BODY_BYTES
  ) {
    throw new BodyTooLargeError();
  }

  if (!request.body) {
    throw new SyntaxError("Missing request body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel("Request body exceeded the byte limit");
        } catch {
          // Cancellation is best-effort; the byte-cap verdict does not change.
        }
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  return JSON.parse(text) as unknown;
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await readByteCappedJson(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return jsonResponse({ error: "Request body is too large." }, 413);
    }
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }
  const parsed = parseRequest(payload);
  if (!parsed) {
    return jsonResponse(
      {
        error:
          "Expected only query (3-600 characters) and a caller-selected demo scenario role.",
      },
      400,
    );
  }
  try {
    return jsonResponse(runQuery(parsed));
  } catch {
    return jsonResponse(
      { error: "The deterministic query pipeline could not complete safely." },
      500,
    );
  }
}
