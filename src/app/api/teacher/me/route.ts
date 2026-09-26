import { NextRequest, NextResponse } from "next/server";
import { getTeacherFromRequest } from "@/lib/teacher/auth";

export async function GET(req: NextRequest) {
  const teacher = getTeacherFromRequest(req);
  if (!teacher) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, teacher });
}
