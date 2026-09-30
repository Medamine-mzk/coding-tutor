import { describe, it, expect } from "vitest";
import {
  createTeacher,
  teacherIdForEmail,
  createMagicToken,
  consumeMagicToken,
  createTeacherSession,
  getTeacherBySessionToken,
} from "@/lib/teacher/store";

describe("teacher auth stateless (serverless-safe)", () => {
  it("derives a stable teacher id per email", async () => {
    expect(teacherIdForEmail("Prof@Lycee.tn")).toBe(teacherIdForEmail("prof@lycee.tn"));
    expect((await createTeacher("prof@lycee.tn", "Prof")).id).toBe(teacherIdForEmail("prof@lycee.tn"));
  });

  it("magic token round-trips without shared memory", () => {
    const { token } = createMagicToken("prof@lycee.tn", "Prof");
    expect(token).toContain(".");
    const rec = consumeMagicToken(token);
    expect(rec).toEqual({ email: "prof@lycee.tn", name: "Prof" });
  });

  it("rejects tampered magic tokens", () => {
    const { token } = createMagicToken("prof@lycee.tn", "Prof");
    const [payload] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ email: "admin@lycee.tn", name: "Admin", exp: Date.now() + 60000 }),
      "utf-8"
    ).toString("base64url");
    expect(consumeMagicToken(`${forgedPayload}.${token.split(".")[1]}`)).toBeNull();
    expect(consumeMagicToken(`${payload}.invalidsig`)).toBeNull();
    expect(consumeMagicToken("garbage")).toBeNull();
  });

  it("session token embeds the teacher and validates anywhere", async () => {
    const teacher = await createTeacher("sess@lycee.tn", "Sess Prof");
    const { token, expiresAt } = createTeacherSession(teacher);
    expect(expiresAt).toBeGreaterThan(Date.now());
    const back = getTeacherBySessionToken(token);
    expect(back).toEqual({ id: teacher.id, email: teacher.email, name: teacher.name, created_at: teacher.created_at });
  });

  it("rejects tampered or malformed session tokens", async () => {
    const teacher = await createTeacher("sess2@lycee.tn", "Sess2");
    const { token } = createTeacherSession(teacher);
    const [payload, sig] = token.split(".");
    expect(getTeacherBySessionToken(`${payload}tampered.${sig}`)).toBeNull();
    expect(getTeacherBySessionToken("nope")).toBeNull();
    expect(getTeacherBySessionToken("")).toBeNull();
  });
});
