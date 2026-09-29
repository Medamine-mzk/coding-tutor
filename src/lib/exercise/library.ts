import type { Exercise } from "./types";
import { visibleTestsFromExamples, generateHiddenTests } from "./tests";
import { buildExerciseFromHeuristics } from "./parser";

type RawLib = {
  id: string;
  uiLocale: Exercise["uiLocale"];
  title: string;
  statement: string;
  ioSpec: string;
  constraints: string[];
  examples: { input: string; output: string }[];
  difficulty: Exercise["difficulty"];
  concepts: Exercise["concepts"];
};

const RAW: RawLib[] = [
  {
    id: "lib_01_hello",
    uiLocale: "fr",
    title: "Bonjour le monde",
    statement: "Écrire un programme qui affiche Bonjour, monde ! sur une ligne.",
    ioSpec: "Entrée : aucune. Sortie : une ligne contenant Bonjour, monde !",
    constraints: ["Aucune contrainte"],
    examples: [{ input: "", output: "Bonjour, monde !" }],
    difficulty: 1,
    concepts: [],
  },
  {
    id: "lib_02_sum",
    uiLocale: "fr",
    title: "Somme de deux nombres",
    statement: "Lire deux entiers sur deux lignes (ou séparés par un espace) et afficher leur somme sur une ligne.",
    ioSpec: "Entrée : deux entiers a et b. Sortie : a + b.",
    constraints: ["-1000 ≤ a, b ≤ 1000"],
    examples: [
      { input: "2 3", output: "5" },
      { input: "0 0", output: "0" },
    ],
    difficulty: 1,
    concepts: ["loops"],
  },
  {
    id: "lib_03_even",
    uiLocale: "fr",
    title: "Pair ou impair",
    statement: "Lire un entier n et afficher pair si n est pair, impair sinon.",
    ioSpec: "Entrée : un entier n. Sortie : pair ou impair.",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples: [
      { input: "4", output: "pair" },
      { input: "5", output: "impair" },
    ],
    difficulty: 1,
    concepts: ["conditionals"],
  },
  {
    id: "lib_04_max2",
    uiLocale: "fr",
    title: "Maximum de deux nombres",
    statement: "Lire deux entiers a et b et afficher le plus grand.",
    ioSpec: "Entrée : deux entiers a b. Sortie : max(a, b).",
    constraints: ["-1000 ≤ a, b ≤ 1000"],
    examples: [
      { input: "3 7", output: "7" },
      { input: "5 5", output: "5" },
    ],
    difficulty: 1,
    concepts: ["conditionals"],
  },
  {
    id: "lib_05_sum1n",
    uiLocale: "fr",
    title: "Somme de 1 à n",
    statement: "Lire un entier n et afficher la somme 1+2+...+n. Si n ≤ 0, afficher 0.",
    ioSpec: "Entrée : un entier n. Sortie : somme.",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples: [
      { input: "5", output: "15" },
      { input: "0", output: "0" },
    ],
    difficulty: 2,
    concepts: ["loops"],
  },
  {
    id: "lib_06_fact",
    uiLocale: "fr",
    title: "Factorielle itérative",
    statement: "Lire un entier n (0 ≤ n ≤ 10) et afficher n! . Par définition 0! = 1.",
    ioSpec: "Entrée : n. Sortie : n!",
    constraints: ["0 ≤ n ≤ 10"],
    examples: [
      { input: "5", output: "120" },
      { input: "0", output: "1" },
    ],
    difficulty: 2,
    concepts: ["loops"],
  },
  {
    id: "lib_07_vowels",
    uiLocale: "ar",
    title: "عدّ الحروف المتحركة",
    statement: "اقرأ سطرا نصيا واحسب عدد الحروف المتحركة (a, e, i, o, u, y, بالحالتين).",
    ioSpec: "الإدخال: سطر واحد. الإخراج: عدد الحروف المتحركة.",
    constraints: ["طول النص ≤ 1000"],
    examples: [
      { input: "Bonjour", output: "3" },
      { input: "bcdfg", output: "0" },
    ],
    difficulty: 2,
    concepts: ["strings", "loops"],
  },
  {
    id: "lib_08_palindrome",
    uiLocale: "ar",
    title: "هل النص متناظر؟",
    statement: "اقرأ سطرا وتحقق إذا كان متناظرا (palindrome) مع تجاهل حالة الأحرف. اطبع oui أو non.",
    ioSpec: "الإدخال: سطر. الإخراج: oui/non.",
    constraints: ["طول ≤ 100"],
    examples: [
      { input: "radar", output: "oui" },
      { input: "hello", output: "non" },
    ],
    difficulty: 2,
    concepts: ["strings", "conditionals"],
  },
  {
    id: "lib_09_sumArray",
    uiLocale: "fr",
    title: "Somme d'un tableau",
    statement: "Lire n puis n entiers sur une ligne et afficher leur somme. Si n=0, afficher 0.",
    ioSpec: "Entrée : n puis liste de n entiers. Sortie : somme.",
    constraints: ["0 ≤ n ≤ 100", "-1000 ≤ valeur ≤ 1000"],
    examples: [
      { input: "3\n1 2 3", output: "6" },
      { input: "0\n", output: "0" },
    ],
    difficulty: 2,
    concepts: ["lists", "loops"],
  },
  {
    id: "lib_10_maxArray",
    uiLocale: "en",
    title: "Maximum in array",
    statement: "Read n then n integers and print the maximum. If n=0, print 'empty'.",
    ioSpec: "Input: n then list. Output: max or empty.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "3\n1 5 2", output: "5" },
      { input: "0\n", output: "empty" },
    ],
    difficulty: 2,
    concepts: ["lists", "conditionals"],
  },
  {
    id: "lib_11_reverse",
    uiLocale: "fr",
    title: "Inverser un tableau",
    statement: "Lire n puis n entiers et afficher la liste inversée séparée par des espaces.",
    ioSpec: "Entrée : n puis liste. Sortie : liste inversée.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "3\n1 2 3", output: "3 2 1" },
      { input: "1\n5", output: "5" },
    ],
    difficulty: 2,
    concepts: ["lists"],
  },
  {
    id: "lib_12_filterEven",
    uiLocale: "en",
    title: "Filter even numbers",
    statement: "Read n then n integers and print only the even ones separated by spaces, or 'none' if none.",
    ioSpec: "Input: n then list. Output: evens or none.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "4\n1 2 3 4", output: "2 4" },
      { input: "3\n1 3 5", output: "none" },
    ],
    difficulty: 2,
    concepts: ["lists", "loops", "conditionals"],
  },
  {
    id: "lib_13_average",
    uiLocale: "fr",
    title: "Moyenne d'une liste",
    statement: "Lire n puis n entiers et afficher la moyenne avec 2 décimales. Si n=0, afficher 0.00.",
    ioSpec: "Entrée : n puis liste. Sortie : moyenne formatée.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "3\n2 4 6", output: "4.00" },
      { input: "0\n", output: "0.00" },
    ],
    difficulty: 2,
    concepts: ["loops", "math"],
  },
  {
    id: "lib_14_isPrime",
    uiLocale: "en",
    title: "isPrime function",
    statement: "Define a function isPrime(n) that returns True if n is prime, False otherwise. The main program reads an integer and prints True/False using isPrime.",
    ioSpec: "Input: integer n. Output: True or False.",
    constraints: ["0 ≤ n ≤ 1000"],
    examples: [
      { input: "7", output: "True" },
      { input: "4", output: "False" },
    ],
    difficulty: 3,
    concepts: ["functions", "loops", "conditionals"],
  },
  {
    id: "lib_15_fibIter",
    uiLocale: "fr",
    title: "Fibonacci itératif",
    statement: "Lire n et afficher le n-ième nombre de Fibonacci (F0=0, F1=1).",
    ioSpec: "Entrée : n. Sortie : Fn.",
    constraints: ["0 ≤ n ≤ 30"],
    examples: [
      { input: "6", output: "8" },
      { input: "0", output: "0" },
    ],
    difficulty: 3,
    concepts: ["loops", "functions"],
  },
  {
    id: "lib_16_gcd",
    uiLocale: "fr",
    title: "PGCD de deux nombres",
    statement: "Lire deux entiers a et b et afficher leur PGCD (Plus Grand Commun Diviseur). Utiliser l'algorithme d'Euclide. Exemple Bac.",
    ioSpec: "Entrée : a b. Sortie : PGCD.",
    constraints: ["1 ≤ a, b ≤ 1000"],
    examples: [
      { input: "48 18", output: "6" },
      { input: "7 13", output: "1" },
    ],
    difficulty: 3,
    concepts: ["loops", "math"],
  },
  {
    id: "lib_17_factRec",
    uiLocale: "ar",
    title: "العاملي التراجعي",
    statement: "عرّف دالة تراجعية factorial(n) تحسب عاملي n. البرنامج الرئيسي يقرأ n ويطبع النتيجة. 0! = 1.",
    ioSpec: "الإدخال: n (0 ≤ n ≤ 10). الإخراج: n!",
    constraints: ["0 ≤ n ≤ 10"],
    examples: [
      { input: "5", output: "120" },
      { input: "0", output: "1" },
    ],
    difficulty: 4,
    concepts: ["recursion", "functions"],
  },
  {
    id: "lib_18_fibRec",
    uiLocale: "en",
    title: "Recursive Fibonacci",
    statement: "Define a recursive function fib(n) where fib(0)=0, fib(1)=1. Main reads n and prints fib(n).",
    ioSpec: "Input: n. Output: fib(n).",
    constraints: ["0 ≤ n ≤ 20"],
    examples: [
      { input: "6", output: "8" },
      { input: "1", output: "1" },
    ],
    difficulty: 4,
    concepts: ["recursion"],
  },
  {
    id: "lib_19_wordCount",
    uiLocale: "fr",
    title: "Compter les occurrences (dictionnaire)",
    statement: "Lire une ligne de mots séparés par des espaces et afficher le mot le plus fréquent. En cas d'égalité, le premier.",
    ioSpec: "Entrée : ligne de mots. Sortie : mot le plus fréquent.",
    constraints: ["nombre de mots ≤ 100"],
    examples: [
      { input: "chat chien chat", output: "chat" },
      { input: "a b c", output: "a" },
    ],
    difficulty: 3,
    concepts: ["dictionaries", "strings"],
  },
  {
    id: "lib_20_bubbleSort",
    uiLocale: "fr",
    title: "Tri à bulles",
    statement: "Lire n puis n entiers et afficher la liste triée par ordre croissant en utilisant le tri à bulles. Exemple Bac.",
    ioSpec: "Entrée : n puis liste. Sortie : liste triée.",
    constraints: ["0 ≤ n ≤ 50"],
    examples: [
      { input: "3\n3 1 2", output: "1 2 3" },
      { input: "0\n", output: "" },
    ],
    difficulty: 3,
    concepts: ["lists", "loops", "conditionals"],
  },
];

function buildExercise(raw: RawLib): Exercise {
  // Use parser's heuristic builder to get base, then override with library-specific overrides
  const text = `${raw.title}\n${raw.statement}\nEntrée: ${raw.examples[0]?.input ?? ""} → Sortie: ${raw.examples[0]?.output ?? ""}\nContraintes: ${raw.constraints.join("; ")}`;
  const base = buildExerciseFromHeuristics(text, "library", raw.uiLocale);

  // Override with precise library data
  const ex: Exercise = {
    ...base,
    id: raw.id,
    title: raw.title,
    statement: raw.statement,
    ioSpec: raw.ioSpec,
    constraints: raw.constraints,
    examples: raw.examples,
    difficulty: raw.difficulty,
    concepts: raw.concepts,
    source: "library",
    uiLocale: raw.uiLocale,
  };

  // Regenerate tests for library (more accurate)
  ex.visibleTests = visibleTestsFromExamples(ex);
  // For library, hidden tests are curated per exercise — use generator but ensure at least 2
  const hidden = generateHiddenTests(ex);
  // Add library-specific hidden edge: for Hello world, hidden is empty ->0
  if (raw.id === "lib_01_hello") {
    ex.hiddenTests = [{ id: "t_hid_hello", input: "", expected: "Bonjour, monde !", kind: "stdout", hidden: true, category: "no input" }];
  } else {
    ex.hiddenTests = hidden;
  }
  ex.hiddenTestsRef = `ref_${ex.id}`;

  return ex;
}

export const LIBRARY_EXERCISES: Exercise[] = RAW.map(buildExercise);

export function getLibraryExercise(id: string): Exercise | undefined {
  return LIBRARY_EXERCISES.find((e) => e.id === id);
}

export function libraryStats() {
  return {
    total: LIBRARY_EXERCISES.length,
    byLocale: {
      fr: LIBRARY_EXERCISES.filter((e) => e.uiLocale === "fr").length,
      ar: LIBRARY_EXERCISES.filter((e) => e.uiLocale === "ar").length,
      en: LIBRARY_EXERCISES.filter((e) => e.uiLocale === "en").length,
    },
    byDifficulty: {
      1: LIBRARY_EXERCISES.filter((e) => e.difficulty === 1).length,
      2: LIBRARY_EXERCISES.filter((e) => e.difficulty === 2).length,
      3: LIBRARY_EXERCISES.filter((e) => e.difficulty === 3).length,
      4: LIBRARY_EXERCISES.filter((e) => e.difficulty === 4).length,
      5: LIBRARY_EXERCISES.filter((e) => e.difficulty === 5).length,
    },
  };
}
