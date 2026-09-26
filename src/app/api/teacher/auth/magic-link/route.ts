import { NextRequest, NextResponse } from "next/server";
import { createMagicToken } from "@/lib/teacher/store";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function getIP(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rate = checkRateLimit("teacher-magic-link", ip, RATE_MAX, RATE_WINDOW_MS);
  const headers = rateLimitHeaders(rate.remaining, rate.resetAt, RATE_MAX);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Trop de requêtes. Réessaie." }, { status: 429, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400, headers });
  }

  const { email, name } = body as { email?: string; name?: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400, headers });
  }

  const { token, expiresAt } = createMagicToken(email, name ?? "");
  const verifyUrl = `${req.nextUrl.origin}/api/teacher/auth/verify?token=${encodeURIComponent(token)}`;

  // In production you would send an email via Resend/Supabase. For MVP, log and return token for dev.
  console.log(`[teacher magic-link] ${email} -> ${verifyUrl} (expires ${new Date(expiresAt).toISOString()})`);

  const isDev = process.env.NODE_ENV !== "production";
  return NextResponse.json(
    {
      ok: true,
      // Do not expose token in production; dev only for testing without email
      ...(isDev ? { tokenForDev: token, verifyUrl } : {}),
      message: isDev ? "Lien magique généré (voir logs serveur). En prod, il serait envoyé par email." : "Lien magique envoyé par email (si l'adresse existe).",
    },
    { headers }
  );
}
