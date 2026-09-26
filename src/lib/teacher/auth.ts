import { NextRequest, NextResponse } from "next/server";
import { getTeacherBySessionToken } from "./store";
import type { Teacher } from "./types";

const COOKIE_NAME = "teacher_session";

export function setTeacherSessionCookie(res: NextResponse, token: string, expiresAt: number) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearTeacherSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", expires: new Date(0) });
}

export function getTeacherFromRequest(req: NextRequest): Teacher | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getTeacherBySessionToken(token);
}

export function requireTeacher(req: NextRequest): { teacher: Teacher; token: string } | { error: NextResponse } {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  const teacher = getTeacherBySessionToken(token);
  if (!teacher) {
    return { error: NextResponse.json({ error: "Session expirée" }, { status: 401 }) };
  }
  return { teacher, token };
}

export const TEACHER_COOKIE_NAME = COOKIE_NAME;
