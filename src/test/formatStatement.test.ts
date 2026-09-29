import { describe, it, expect } from "vitest";
import { formatStatementBody } from "@/lib/exercise/formatStatement";

const TEACHER_MD = `# Statement
Lire un entier n et afficher la somme 1+2+...+n. Si n ≤ 0, afficher 0.

## Examples
- input: 5
  output: 15

## Constraints
- -1000 ≤ n ≤ 1000`;

describe("formatStatementBody", () => {
  it("extrait le corps sans marqueurs markdown", () => {
    const body = formatStatementBody(TEACHER_MD);
    expect(body).toBe("Lire un entier n et afficher la somme 1+2+...+n. Si n ≤ 0, afficher 0.");
    expect(body).not.toContain("#");
  });

  it("laisse le texte brut inchangé", () => {
    expect(formatStatementBody("Lire deux entiers")).toBe("Lire deux entiers");
    expect(formatStatementBody("")).toBe("");
  });

  it("coupe aux sections ## même sans # Statement", () => {
    const body = formatStatementBody("Faire X.\n## Examples\n- input: 1");
    expect(body).toBe("Faire X.");
  });
});
