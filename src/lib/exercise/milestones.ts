import type { Exercise, Locale, Milestone } from "./types";

function nanoid(): string {
  return Math.random().toString(36).slice(2, 9);
}

type MilestoneDef = {
  title: Record<Locale, string>;
  successCriteria: string;
  hintSeeds: string[];
  when?: (ex: Exercise) => boolean;
};

const BASE_MILESTONES: MilestoneDef[] = [
  {
    title: { fr: "Lire les entrées", ar: "قراءة المدخلات", en: "Read the input" },
    successCriteria: "Student correctly reads and parses stdin",
    hintSeeds: ["What does input() return?", "Remember input() gives a string, convert if needed"],
  },
  {
    title: { fr: "Gérer le cas limite", ar: "معالجة الحالة الحدّية", en: "Handle the edge case" },
    successCriteria: "Empty or zero or single-element input handled without crash",
    hintSeeds: ["What should happen if the list is empty?", "Try n=0 or empty line"],
    when: (ex) => !ex.statement.toLowerCase().includes("facture"),
  },
  {
    title: { fr: "Convertir les unités", ar: "تحويل الوحدات", en: "Convert units" },
    successCriteria: "Convert km to m (×1000) and minutes to seconds (×60)",
    hintSeeds: ["1 km = 1000 m", "1 min = 60 s", "distance_m = distance_km * 1000"],
    when: (ex) => ex.statement.toLowerCase().includes("vitesse") && ex.statement.toLowerCase().includes("distance"),
  },
  {
    title: { fr: "Calculer la vitesse", ar: "حساب السرعة", en: "Calculate speed" },
    successCriteria: "vitesse = distance_m / temps_s",
    hintSeeds: ["vitesse = distance / temps", "Que vaut distance/temps après conversion ?"],
    when: (ex) => ex.statement.toLowerCase().includes("vitesse"),
  },
  {
    title: { fr: "Gérer la division par zéro", ar: "معالجة القسمة على الصفر", en: "Handle division by zero" },
    successCriteria: "If temps == 0, handle without crash (print 0 or message)",
    hintSeeds: ["Que faire si temps = 0 ?", "if temps_min == 0: print(0)"],
    when: (ex) => ex.statement.toLowerCase().includes("vitesse") && ex.statement.toLowerCase().includes("temps"),
  },
  {
    title: { fr: "Lire login et mot de passe", ar: "قراءة اسم المستخدم وكلمة المرور", en: "Read login and password" },
    successCriteria: "Both strings read via input()",
    hintSeeds: ["login = input()", "motdepasse = input()"],
    when: (ex) => ex.statement.toLowerCase().includes("login") && ex.statement.toLowerCase().includes("mot de passe"),
  },
  {
    title: { fr: "Vérifier l'égalité", ar: "التحقق من التساوي", en: "Check equality" },
    successCriteria: "Condition login==admin and password==admin",
    hintSeeds: ["if login == \"admin\" and mdp == \"admin\":", "Attention aux guillemets"],
    when: (ex) => ex.statement.toLowerCase().includes("login") && ex.statement.toLowerCase().includes("admin"),
  },
  {
    title: { fr: "Afficher le message", ar: "عرض الرسالة", en: "Display message" },
    successCriteria: "Print Bienvenue or incorrecte",
    hintSeeds: ["print(\"Bienvenue\") vs print(\"incorrecte\")"],
    when: (ex) => ex.statement.toLowerCase().includes("login") && ex.statement.toLowerCase().includes("bienvenue"),
  },
  {
    title: { fr: "Initialiser l'accumulateur", ar: "تهيئة المجمّع", en: "Initialize the accumulator" },
    successCriteria: "Variable for result/sum/count initialized correctly",
    hintSeeds: ["Think about starting value for sum vs product", "Where should count start?"],
    when: (ex) => !ex.statement.toLowerCase().includes("facture") && (ex.concepts.includes("loops") || ex.statement.toLowerCase().includes("somme") || ex.statement.toLowerCase().includes("sum")),
  },
  {
    title: { fr: "Boucler sur les données", ar: "التكرار على البيانات", en: "Loop over the data" },
    successCriteria: "For loop iterates over correct range or collection",
    hintSeeds: ["for i in range(n):", "Iterate with a for loop and an accumulator"],
    when: (ex) => ex.concepts.includes("loops"),
  },
  {
    title: { fr: "Appliquer la condition", ar: "تطبيق الشرط", en: "Apply the condition" },
    successCriteria: "If/else correctly filters or branches",
    hintSeeds: ["Where does the if belong inside the loop?", "What is the condition for this element?"],
    when: (ex) => ex.concepts.includes("conditionals"),
  },
  {
    title: { fr: "Gérer la collection", ar: "إدارة المجموعة", en: "Handle the collection" },
    successCriteria: "List/dict/string processed correctly",
    hintSeeds: ["Append to list with .append()", "Access by index vs iteration"],
    when: (ex) => ex.concepts.includes("lists") || ex.concepts.includes("dictionaries") || ex.concepts.includes("strings"),
  },
  {
    title: { fr: "Calculer le montant TTC", ar: "حساب المبلغ مع الضريبة", en: "Calculate TTC amount" },
    successCriteria: "TTC = HT * 1.2 (TVA 20%)",
    hintSeeds: ["MontantTTC = MontantHT + MontantHT*0.2", "ttc = prix * qte * 1.2", "20% = *0.2"],
    when: (ex) => ex.statement.toLowerCase().includes("facture") && ex.statement.toLowerCase().includes("tva"),
  },
  {
    title: { fr: "Cumuler le total de la facture", ar: "تجميع المجموع", en: "Accumulate invoice total" },
    successCriteria: "Total = sum of TTC amounts",
    hintSeeds: ["total = 0 avant la boucle", "total += ttc", "Somme des TTC"],
    when: (ex) => ex.statement.toLowerCase().includes("facture"),
  },
  {
    title: { fr: "Définir la fonction", ar: "تعريف الدالة", en: "Define the function" },
    successCriteria: "Function signature with correct parameters exists",
    hintSeeds: ["def solve(...):", "What should the function return?"],
    when: (ex) => ex.concepts.includes("functions"),
  },
  {
    title: { fr: "Cas de base récursif", ar: "الحالة الأساسية", en: "Base case for recursion" },
    successCriteria: "Base case returns correct value for n=0 or empty",
    hintSeeds: ["When does recursion stop?", "Return for n==0?"],
    when: (ex) => ex.concepts.includes("recursion"),
  },
  {
    title: { fr: "Étape récursive", ar: "الخطوة التراجعية", en: "Recursive step" },
    successCriteria: "Recursive call reduces problem size",
    hintSeeds: ["Call the function with n-1", "Combine result of recursion"],
    when: (ex) => ex.concepts.includes("recursion"),
  },
  {
    title: { fr: "Afficher / Retourner le résultat", ar: "إظهار / إرجاع النتيجة", en: "Display / Return the result" },
    successCriteria: "Final print or return matches expected output",
    hintSeeds: ["print(result)", "Return vs print? Check statement"],
  },
];

export function generateMilestones(exercise: Exercise): Milestone[] {
  // Filter base to those that apply
  const applicable = BASE_MILESTONES.filter((m) => !m.when || m.when(exercise));

  // Ensure at least 3, at most 7. Keep order as defined, but always include first, edge, and last
  let selected = [...applicable];
  if (selected.length < 3) {
    selected = BASE_MILESTONES.slice(0, 3);
  }
  if (selected.length > 7) {
    // Keep first 2, last 1, and pick middle ones with priority to concepts that match difficulty
    const first = selected.slice(0, 2);
    const last = selected.slice(-1);
    const middle = selected.slice(2, -1).slice(0, 4); // cap middle
    selected = [...first, ...middle, ...last];
    selected = selected.slice(0, 7);
  }

  // If still <3, pad with generic
  if (selected.length < 3) {
    selected = BASE_MILESTONES.slice(0, 3);
  }

  // Deduplicate titles
  const seen = new Set<string>();
  selected = selected.filter((m) => {
    const key = m.title.fr;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build Milestone objects
  const locale = exercise.uiLocale;
  return selected.map((def, idx) => ({
    id: `ms_${nanoid()}`,
    exerciseId: exercise.id,
    order: idx + 1,
    title: def.title[locale] ?? def.title.fr,
    successCriteria: def.successCriteria,
    hintSeeds: def.hintSeeds,
  }));
}
