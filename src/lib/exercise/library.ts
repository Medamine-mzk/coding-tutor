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
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["Aucune contrainte"],
    examples: [
      { input: "(vide)", output: "Bonjour, monde !" },
    ],
    difficulty: 1,
    concepts: ["strings"],
  },
  {
    id: "lib_02_sum",
    uiLocale: "fr",
    title: "Somme de deux nombres",
    statement: "Lire deux entiers chacun sur sa ligne et afficher leur somme sur une ligne.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["-1000 ≤ a, b ≤ 1000"],
    examples: [
      { input: "2\n3", output: "5" },
      { input: "0\n0", output: "0" },
    ],
    difficulty: 1,
    concepts: ["loops"],
  },
  {
    id: "lib_03_even",
    uiLocale: "fr",
    title: "Pair ou impair",
    statement: "Lire un entier n et afficher pair si n est pair, impair sinon.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
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
    statement: "Lire deux entiers a et b chacun sur sa ligne et afficher le plus grand.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["-1000 ≤ a, b ≤ 1000"],
    examples: [
      { input: "3\n7", output: "7" },
    ],
    difficulty: 1,
    concepts: ["conditionals"],
  },
  {
    id: "lib_05_sum1n",
    uiLocale: "fr",
    title: "Somme de 1 à n",
    statement: "Lire un entier n et afficher la somme 1+2+...+n. Si n ≤ 0, afficher 0.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["-1000 ≤ n ≤ 1000"],
    examples: [
      { input: "5", output: "15" },
    ],
    difficulty: 2,
    concepts: ["loops"],
  },
  {
    id: "lib_06_fact",
    uiLocale: "fr",
    title: "Factorielle iterative",
    statement: "Lire un entier n (0 ≤ n ≤ 10) et afficher n! . Par définition 0! = 1.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 10"],
    examples: [
      { input: "5", output: "120" },
    ],
    difficulty: 2,
    concepts: ["loops"],
  },
  {
    id: "lib_07_vowels",
    uiLocale: "fr",
    title: "Compter les voyelles",
    statement: "Lire une ligne de texte et compter les voyelles (a,e,i,o,u,y).",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["longueur ≤ 1000"],
    examples: [
      { input: "Bonjour", output: "3" },
    ],
    difficulty: 2,
    concepts: ["strings", "loops"],
  },
  {
    id: "lib_08_palindrome",
    uiLocale: "fr",
    title: "Palindrome",
    statement: "Lire une ligne et vérifier si palindrome (ignorer casse).",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["longueur ≤ 100"],
    examples: [
      { input: "radar", output: "oui" },
    ],
    difficulty: 2,
    concepts: ["strings", "conditionals"],
  },
  {
    id: "lib_09_sumArray",
    uiLocale: "fr",
    title: "Somme tableau",
    statement: "Lire n puis n entiers chacun sur sa ligne et afficher leur somme. Si n=0, afficher 0.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "3\n1\n2\n3", output: "6" },
    ],
    difficulty: 2,
    concepts: ["arrays", "loops"],
  },
  {
    id: "lib_10_maxArray",
    uiLocale: "fr",
    title: "Maximum tableau",
    statement: "Lire n puis n entiers chacun sur sa ligne et afficher le maximum. Si n=0, afficher empty.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "3\n1\n5\n2", output: "5" },
    ],
    difficulty: 2,
    concepts: ["arrays", "conditionals"],
  },
  {
    id: "lib_11_reverse",
    uiLocale: "fr",
    title: "Inverser tableau",
    statement: "Lire n puis n entiers chacun sur sa ligne et afficher la liste inversée.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "3\n1\n2\n3", output: "3\n2\n1" },
    ],
    difficulty: 2,
    concepts: ["arrays"],
  },
  {
    id: "lib_12_filterEven",
    uiLocale: "fr",
    title: "Filtrer pairs",
    statement: "Lire n puis n entiers chacun sur sa ligne et afficher seulement les pairs, ou none.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 100"],
    examples: [
      { input: "4\n1\n2\n3\n4", output: "2\n4" },
    ],
    difficulty: 2,
    concepts: ["arrays", "loops", "conditionals"],
  },
  {
    id: "lib_13_average",
    uiLocale: "fr",
    title: "Moyenne",
    statement: "Lire n puis n entiers chacun sur sa ligne et afficher la moyenne avec 2 dÃ©cimales (ex: 4.00). Si n=0, 0.00.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 â‰¤ n â‰¤ 100"],
    examples: [
      { input: "3\n2\n4\n6", output: "4.00" },
    ],
    difficulty: 2,
    concepts: ["arrays", "loops", "math"],
  },
  {
    id: "lib_14_isPrime",
    uiLocale: "fr",
    title: "isPrime",
    statement: "Définir isPrime(n) et lire un entier pour afficher True/False.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 1000"],
    examples: [
      { input: "7", output: "True" },
    ],
    difficulty: 3,
    concepts: ["functions", "loops", "conditionals"],
  },
  {
    id: "lib_15_fibIter",
    uiLocale: "fr",
    title: "Fibonacci iteratif",
    statement: "Lire n et afficher le n-ième Fibonacci (F0=0,F1=1).",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 30"],
    examples: [
      { input: "6", output: "8" },
    ],
    difficulty: 3,
    concepts: ["loops", "functions"],
  },
  {
    id: "lib_16_gcd",
    uiLocale: "fr",
    title: "PGCD de deux nombres",
    statement: "Lire deux entiers a puis b chacun sur sa ligne et afficher leur PGCD (algorithme d'Euclide avec boucle While).",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["1 ≤ a,b ≤ 1000"],
    examples: [
      { input: "48\n18", output: "6" },
    ],
    difficulty: 3,
    concepts: ["loops", "math"],
  },
  {
    id: "lib_17_factRec",
    uiLocale: "fr",
    title: "Facto recursive",
    statement: "Définir factorial(n) récursivement et afficher n!.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 10"],
    examples: [
      { input: "5", output: "120" },
    ],
    difficulty: 4,
    concepts: ["recursion", "functions"],
  },
  {
    id: "lib_18_fibRec",
    uiLocale: "fr",
    title: "Fibonacci recursif",
    statement: "Définir fib(n) récursif où fib(0)=0,fib(1)=1.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 20"],
    examples: [
      { input: "6", output: "8" },
    ],
    difficulty: 4,
    concepts: ["recursion"],
  },
  {
    id: "lib_19_wordCount",
    uiLocale: "fr",
    title: "Compter occurrences",
    statement: "Lire une ligne de mots et afficher le mot le plus fréquent.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["mots ≤ 100"],
    examples: [
      { input: "chat chien chat", output: "chat" },
    ],
    difficulty: 3,
    concepts: ["dictionaries", "strings"],
  },
  {
    id: "lib_20_bubbleSort",
    uiLocale: "fr",
    title: "Tri à bulles",
    statement: "Lire n puis n entiers chacun sur sa ligne et afficher la liste triée par tri à bulles.",
    ioSpec: "Entrée : valeurs lues au clavier (une par ligne). Sortie : affichée sur une ou plusieurs lignes.",
    constraints: ["0 ≤ n ≤ 50"],
    examples: [
      { input: "3\n3\n1\n2", output: "1\n2\n3" },
    ],
    difficulty: 3,
    concepts: ["arrays", "loops", "conditionals"],
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
