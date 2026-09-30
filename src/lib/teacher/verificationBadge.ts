/** Honest badge: how the teacher reference was verified (or not). */
export function verificationLabel(verified: boolean, method?: string | null): string {
  if (!verified) return "⚠ à vérifier";
  if (method === "remote") return "✓ vérifié (exécution distante)";
  if (method === "llm_dryrun") return "✓ vérifié (IA — à confirmer)";
  return "✓ vérifié";
}
