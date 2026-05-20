import { NextResponse } from "next/server";
import { ensureSchema, query } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const rows = await query<{ data: unknown }>(
      `SELECT data FROM snapshots WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0].data);
  } catch (err) {
    console.error("Failed to load snapshot", err);
    return NextResponse.json({ error: "Failed to load snapshot" }, { status: 500 });
  }
}
