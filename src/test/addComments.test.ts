import { describe, it, expect } from "vitest";
import { addComments, describeLine } from "@/lib/teacher/addComments";

const SOMME = `a = int(input())
b = int(input())
print(a + b)
`;

describe("addComments — port TS de my-scripts/add_comments.py", () => {
  it("commente chaque instruction BAC (lire/afficher/calcul)", () => {
    const out = addComments(SOMME);
    expect(out).toContain("# Stocke une valeur lue au clavier, convertie en entier dans a");
    expect(out).toContain("# Stocke une valeur lue au clavier, convertie en entier dans b");
    expect(out).toContain("# Affiche a + b");
    expect(out).toContain("a = int(input())");
  });

  it("est idempotent (2e passage ne duplique rien)", () => {
    const once = addComments(SOMME);
    const twice = addComments(once);
    expect(twice).toBe(once);
  });

  it("couvre for/if/def/return/tableau/import", () => {
    const code = `from numpy import array
def isPrime(n):
    if n < 2:
        return False
    for i in range(2, n):
        if n % i == 0:
            return False
    return True
n = int(input())
T = array([0] * n)
for i in range(0, n):
    T[i] = int(input())
s = 0
for i in range(0, n):
    s = s + T[i]
print(s)
`;
    const out = addComments(code);
    expect(out).toContain("# Importe array depuis le module numpy");
    expect(out).toContain("# Définit la fonction isPrime qui reçoit : n");
    expect(out).toContain("# Teste si");
    expect(out).toContain("# Renvoie False comme résultat de la fonction");
    expect(out).toContain("# Boucle : i prend les valeurs de 2 à n-1 (borne finale exclue)");
    expect(out).toContain("# Stocke un tableau de n case(s) initialisée(s) à 0 dans T");
    expect(out).toContain("# Range une valeur lue au clavier, convertie en entier dans la case T[i]");
    expect(out).toContain("# Initialise s à 0 (point de départ pour un compteur ou une somme)");
    expect(out).toContain("(mise à jour de la variable)");
  });

  it("signale break/continue comme interdits BAC", () => {
    expect(describeLine("break")).toContain("INTERDIT BAC");
    expect(describeLine("continue")).toContain("INTERDIT BAC");
  });

  it("ne commente pas les docstrings ni les lignes inconnues vides", () => {
    expect(describeLine('"""doc"""')).toBeNull();
    const out = addComments('"""doc"""\nx = 1\n');
    expect(out).toContain('"""doc"""');
    expect(out).toContain("# Initialise x à 1");
  });

  it("gère else/elif/while/upper/slicing", () => {
    const out = addComments(
      `s = input()
ch = s.upper()
if ch == "OUI":
    print("ok")
elif ch == "NON":
    print("non")
else:
    print("?")
i = 0
while i < 3:
    print(ch[i])
    i = i + 1
`
    );
    expect(out).toContain("# Stocke une valeur lue au clavier (texte) dans s");
    expect(out).toContain("# Stocke s en majuscules dans ch");
    expect(out).toContain("# Sinon, teste si");
    expect(out).toContain("# Sinon (aucune condition précédente");
    expect(out).toContain("# Répète le bloc tant que");
  });
});
