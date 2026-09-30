import { NextRequest, NextResponse } from "next/server";
import { consumeMagicToken, createTeacher, createTeacherSession } from "@/lib/teacher/store";
import { setTeacherSessionCookie } from "@/lib/teacher/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 400 });
  }

  const rec = consumeMagicToken(token);
  if (!rec) {
    return NextResponse.json({ error: "Lien invalide ou expiré (15 min)" }, { status: 400 });
  }

  const teacher = createTeacher(rec.email, rec.name);
  const sess = createTeacherSession(teacher);

  // For browser flow, redirect to teacher dashboard with cookie set
  // For API clients, also return JSON if Accept: application/json
  const wantsJSON = req.headers.get("accept")?.includes("application/json");
  if (wantsJSON) {
    const res = NextResponse.json({ ok: true, teacher, token: sess.token });
    setTeacherSessionCookie(res, sess.token, sess.expiresAt);
    return res;
  }

  const res = NextResponse.redirect(new URL("/teacher", req.url));
  setTeacherSessionCookie(res, sess.token, sess.expiresAt);
  return res;
}

export async function POST(req: NextRequest) {
  // Allow POST {token} as well for SPA flow
  let token: string | null = null;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token ?? null;
  } catch {
    token = req.nextUrl.searchParams.get("token");
  }
  if (!token) return NextResponse.json({ error: "Token manquant" }, { status: 400 });
  const rec = consumeMagicToken(token);
  if (!rec) return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
  const teacher = createTeacher(rec.email, rec.name);
  const sess = createTeacherSession(teacher);
  const res = NextResponse.json({ ok: true, teacher, token: sess.token });
  setTeacherSessionCookie(res, sess.token, sess.expiresAt);
  return res;
}
