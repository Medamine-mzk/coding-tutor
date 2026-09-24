import { describe, it, expect } from "vitest";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

describe("rateLimit", () => {
  it("allows first request and decrements remaining", () => {
    const res = checkRateLimit("test-a", "1.1.1.1", 5, 60000);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(4);
  });

  it("blocks after max and returns 0 remaining", () => {
    const key = "test-b";
    const ip = "2.2.2.2";
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit(key, ip, 5, 60000);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, ip, 5, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after window", async () => {
    const key = "test-c";
    const ip = "3.3.3.3";
    checkRateLimit(key, ip, 1, 10);
    const blocked = checkRateLimit(key, ip, 1, 10);
    expect(blocked.allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 15));
    const after = checkRateLimit(key, ip, 1, 10);
    expect(after.allowed).toBe(true);
  });

  it("isolates by storeKey and ip", () => {
    const r1 = checkRateLimit("store1", "4.4.4.4", 1, 60000);
    expect(r1.allowed).toBe(true);
    const r2 = checkRateLimit("store2", "4.4.4.4", 1, 60000);
    expect(r2.allowed).toBe(true);
    const r3 = checkRateLimit("store1", "5.5.5.5", 1, 60000);
    expect(r3.allowed).toBe(true);
  });

  it("rateLimitHeaders includes X-RateLimit-* and Retry-After", () => {
    const now = Date.now();
    const resetAt = now + 30000;
    const headers = rateLimitHeaders(2, resetAt, 5);
    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["X-RateLimit-Remaining"]).toBe("2");
    expect(headers["X-RateLimit-Reset"]).toBe(String(Math.floor(resetAt / 1000)));
    expect(headers["Retry-After"]).toBeDefined();
  });

  it("API routes return rate limit headers (integration)", async () => {
    const { POST: parsePOST } = await import("@/app/api/exercise/parse/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/exercise/parse", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ text: "Hello" }),
    });
    const res = await parsePOST(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });
});
