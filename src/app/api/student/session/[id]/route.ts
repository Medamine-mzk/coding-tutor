import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/session/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sess = await getSession(id);
  if (!sess) return NextResponse.json({ error: "Session non trouvée" }, { status: 404 });
  return NextResponse.json({ session: sess });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sess = await getSession(id);
  if (!sess) return NextResponse.json({ error: "Session non trouvée" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const b = body as Partial<import("@/lib/exercise/types").Session> & { currentCode?: string; status?: string };
  const patch: Record<string, unknown> = {};
  if (typeof b.currentCode === "string") patch.currentCode = b.currentCode;
  if (typeof b.status === "string" && ["in_progress", "completed", "abandoned"].includes(b.status)) patch.status = b.status;
  if (b.finishedAt) patch.finishedAt = b.finishedAt;

  const updated = await updateSession(id, patch as never);
  return NextResponse.json({ ok: true, session: updated });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Alias for PATCH — also handles hint/attempt reporting in future
  return PATCH(req, { params } as never);
}
