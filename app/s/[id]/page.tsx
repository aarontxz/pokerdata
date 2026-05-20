import { notFound } from "next/navigation";
import PokerStats from "../../components/PokerStats";
import { ensureSchema, query } from "../../lib/db";
import type { SnapshotPayload } from "../../lib/snapshotTypes";

export const dynamic = "force-dynamic";

async function loadSnapshot(id: string): Promise<SnapshotPayload | null> {
  await ensureSchema();
  const rows = await query<{ data: SnapshotPayload }>(
    `SELECT data FROM snapshots WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return null;
  return rows[0].data;
}

export default async function SharedSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snapshot = await loadSnapshot(id);
  if (!snapshot) notFound();

  return <PokerStats initialSnapshot={snapshot} snapshotId={id} />;
}
