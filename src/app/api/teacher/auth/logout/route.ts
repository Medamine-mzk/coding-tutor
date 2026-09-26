import { NextRequest, NextResponse } from "next/server";
import { clearTeacherSessionCookie, getTeacherFromRequest } from "@/lib/teacher/auth";
import { deleteTeacherSession } from "@/lib/teacher/store";

export async function POST(req: NextRequest) {
  const teacher = getTeacherFromRequest(req);
  const token = req.cookies.get("teacher_session")?.value;
  if (token) deleteTeacherSession(token);
  const res = NextResponse.json({ ok: true });
  clearTeacherSessionCookie(res);
  return res;
}

export async function GET(req: NextRequest) {
  // Allow GET for simple link
  const token = req.cookies.get("teacher_session")?.value;
  if (token) deleteTeacherSession(token);
  const res = NextResponse.redirect(new URL("/", req.url));
  clearTeacherSessionCookie(res);
  return res;
}
