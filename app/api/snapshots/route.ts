import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { ensureSchema, query } from "../../lib/db";
import type { SnapshotPayload } from "../../lib/snapshotTypes";

export const runtime = "nodejs";

function generateId(): string {
  // 12 bytes base64url => 16 chars, URL safe.
  return randomBytes(12).toString("base64url");
}

function isValidPayload(body: unknown): body is SnapshotPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    b.version === 1 &&
    Array.isArray(b.sessions) &&
    Array.isArray(b.sessionTimeRanges) &&
    Array.isArray(b.aliasGroups) &&
    !!b.selectedNameByPlayer &&
    typeof b.selectedNameByPlayer === "object"
  );
}

// Reject absurdly large payloads to avoid abuse.
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (decompressed)
const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB (on the wire)

export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > MAX_COMPRESSED_BYTES) {
      return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
    }
    const isGzip = request.headers.get("content-encoding") === "gzip";
    const text = (isGzip ? gunzipSync(raw) : raw).toString("utf-8");
    if (text.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "Invalid snapshot payload" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const id = generateId();
    await query(
      `INSERT INTO snapshots (id, data) VALUES ($1, $2::jsonb)`,
      [id, JSON.stringify(body)],
    );
    return NextResponse.json({ id });
  } catch (err) {
    console.error("Failed to save snapshot", err);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}
