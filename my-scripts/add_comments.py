#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute un commentaire explicatif AU-DESSUS de chaque instruction d'un code Python.

Usage :  python add_comments.py programme.py [sortie.py]

- Sans 'sortie.py', le résultat est écrit dans programme_commente.py.
- Avec '-' comme sortie, le résultat est affiché dans le terminal.
- Les lignes déjà précédées d'un commentaire sont laissées telles quelles,
  donc relancer le script ne duplique rien.

Le code est analysé avec le module 'ast' (et non ligne par ligne avec des
regex), ce qui gère correctement les instructions sur plusieurs lignes,
les blocs imbriqués, elif / else / except / finally.
"""

import ast
import re
import sys
from pathlib import Path

if sys.version_info < (3, 9):
    sys.exit("Python 3.9 ou plus récent est nécessaire (ast.unparse).")

# --------------------------------------------------------------------------
# Petits outils de formulation
# --------------------------------------------------------------------------
OPS = {
    ast.Add: "la somme", ast.Sub: "la différence", ast.Mult: "le produit",
    ast.Div: "la division réelle", ast.FloorDiv: "le quotient entier",
    ast.Mod: "le reste de la division", ast.Pow: "la puissance",
}
CONVERSIONS = {"int": "entier", "float": "réel", "str": "chaîne", "bool": "booléen"}
AUG_VERBS = {
    ast.Add: "Ajoute {v} à {t}", ast.Sub: "Retire {v} de {t}",
    ast.Mult: "Multiplie {t} par {v}", ast.Div: "Divise {t} par {v}",
    ast.FloorDiv: "Remplace {t} par son quotient entier par {v}",
    ast.Mod: "Remplace {t} par son reste dans la division par {v}",
}


def u(node):
    """Texte source d'un noeud (normalisé)."""
    return ast.unparse(node)


def humanize_condition(node):
    """Transforme une condition Python en français lisible."""
    t = u(node)
    t = re.sub(r"(\w+) % (\w+) == 0", r"\1 est divisible par \2", t)
    t = re.sub(r"(\w+) % 2 == 1", r"\1 est impair", t)
    for old, new in ((" == ", " est égal à "), (" != ", " est différent de "),
                     (" >= ", " est supérieur ou égal à "), (" <= ", " est inférieur ou égal à "),
                     (" > ", " est supérieur à "), (" < ", " est inférieur à "),
                     (" and ", " ET "), (" or ", " OU "), ("not ", "NON ")):
        t = t.replace(old, new)
    return t


def call_name(call):
    """Nom d'une fonction appelée ('print', 'randint', 'upper'...)."""
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return ""


def value_desc(v):
    """Décrit en français ce que représente une expression."""
    if isinstance(v, ast.Call):
        name = call_name(v)
        args = v.args
        if name in CONVERSIONS and args:
            inner = args[0]
            if isinstance(inner, ast.Call) and call_name(inner) == "input":
                return "une valeur lue au clavier, convertie en %s" % CONVERSIONS[name]
            return "la conversion de %s en %s" % (u(inner), CONVERSIONS[name])
        if name == "input":
            return "une valeur lue au clavier (texte)"
        if name == "randint" and len(args) == 2:
            return "un entier aléatoire entre %s et %s (bornes incluses)" % (u(args[0]), u(args[1]))
        if name == "sqrt" and args:
            return "la racine carrée de %s" % u(args[0])
        if name == "round" and len(args) == 2:
            return "%s arrondi à %s décimale(s)" % (u(args[0]), u(args[1]))
        if name == "round" and args:
            return "%s arrondi à l'entier le plus proche" % u(args[0])
        if name == "len" and args:
            return "la longueur de %s" % u(args[0])
        if name == "array" and args and isinstance(args[0], ast.BinOp) and isinstance(args[0].op, ast.Mult):
            return "un tableau de %s case(s) initialisée(s) à %s" % (u(args[0].right), u(args[0].left.elts[0])
                                                                    if isinstance(args[0].left, ast.List) and args[0].left.elts
                                                                    else u(args[0].left))
        if name == "upper" and isinstance(v.func, ast.Attribute):
            return "%s en majuscules" % u(v.func.value)
        if name == "find" and args and isinstance(v.func, ast.Attribute):
            return "la première position de %s dans %s (-1 si absent)" % (u(args[0]), u(v.func.value))
        if name == "open" and args:
            return "le fichier %s ouvert" % u(args[0])
        return "le résultat de l'appel %s" % u(v)
    if isinstance(v, ast.Constant):
        return "la valeur %s" % u(v)
    if isinstance(v, ast.Subscript):
        if isinstance(v.slice, ast.Slice):
            lo = u(v.slice.lower) if v.slice.lower else "le début"
            hi = u(v.slice.upper) if v.slice.upper else "la fin"
            return "la partie de %s entre %s et %s (exclu)" % (u(v.value), lo, hi)
        return "le contenu de la case %s" % u(v)
    if isinstance(v, ast.BinOp) and type(v.op) in OPS:
        return "%s : %s" % (OPS[type(v.op)], u(v))
    return "le résultat de %s" % u(v)


# --------------------------------------------------------------------------
# Un commentaire par type d'instruction
# --------------------------------------------------------------------------
def describe(node):
    """Retourne le commentaire (str) d'une instruction, ou None."""
    if isinstance(node, ast.Import):
        return "Importe le(s) module(s) : %s" % ", ".join(a.name for a in node.names)
    if isinstance(node, ast.ImportFrom):
        return "Importe %s depuis le module %s" % (", ".join(a.name for a in node.names), node.module)

    if isinstance(node, ast.FunctionDef):
        params = [a.arg for a in node.args.args]
        if params:
            return "Définit la fonction %s qui reçoit : %s" % (node.name, ", ".join(params))
        return "Définit la fonction %s (sans paramètre)" % node.name
    if isinstance(node, ast.ClassDef):
        return "Définit la classe %s" % node.name
    if isinstance(node, ast.Return):
        return ("Renvoie %s comme résultat de la fonction" % u(node.value)) if node.value else "Termine la fonction"

    if isinstance(node, ast.Assign):
        return describe_assign(node)
    if isinstance(node, ast.AugAssign):
        verb = AUG_VERBS.get(type(node.op), "Met à jour {t} avec {v}")
        return verb.format(t=u(node.target), v=u(node.value))
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return "Affecte %s à %s" % (value_desc(node.value), u(node.target))

    if isinstance(node, ast.If):
        return "Teste si %s ; si oui, exécute le bloc indenté" % humanize_condition(node.test)
    if isinstance(node, ast.For):
        return describe_for(node)
    if isinstance(node, ast.While):
        return "Répète le bloc tant que %s" % humanize_condition(node.test)
    if isinstance(node, ast.Break):
        return "Sort immédiatement de la boucle"
    if isinstance(node, ast.Continue):
        return "Passe directement à l'itération suivante"
    if isinstance(node, ast.Pass):
        return "Ne fait rien (bloc vide volontaire)"

    if isinstance(node, ast.Try):
        return "Essaie d'exécuter le bloc ; les erreurs sont gérées plus bas"
    if isinstance(node, ast.ExceptHandler):
        return ("Si une erreur %s se produit, exécute ce bloc" % u(node.type)) if node.type \
            else "Si une erreur se produit, exécute ce bloc"
    if isinstance(node, ast.With):
        return "Utilise %s dans un bloc (fermeture automatique)" % ", ".join(u(i.context_expr) for i in node.items)
    if isinstance(node, ast.Raise):
        return "Déclenche une erreur"
    if isinstance(node, ast.Assert):
        return "Vérifie que %s est vrai (sinon erreur)" % humanize_condition(node.test)
    if isinstance(node, ast.Delete):
        return "Supprime : %s" % ", ".join(u(t) for t in node.targets)
    if isinstance(node, (ast.Global, ast.Nonlocal)):
        return "Déclare que %s désigne une variable externe à la fonction" % ", ".join(node.names)

    if isinstance(node, ast.Expr):
        return describe_expr_statement(node.value)
    return None


def describe_assign(node):
    if len(node.targets) != 1:
        return "Affecte %s à plusieurs variables" % value_desc(node.value)
    target, v = node.targets[0], node.value
    t = u(target)

    # Ex. total = total + x  ->  mise à jour d'un accumulateur
    if isinstance(v, ast.BinOp) and isinstance(target, ast.Name) and isinstance(v.left, ast.Name) \
            and v.left.id == target.id and type(v.op) in AUG_VERBS:
        return AUG_VERBS[type(v.op)].format(t=t, v=u(v.right)) + " (mise à jour de la variable)"
    if isinstance(target, ast.Subscript):
        return "Range %s dans la case %s" % (value_desc(v), t)
    if isinstance(target, ast.Tuple):
        return "Affecte simultanément les valeurs à %s" % t
    if isinstance(v, ast.Constant) and v.value in (0, 1) and not isinstance(v.value, bool):
        role = "un compteur ou une somme" if v.value == 0 else "un produit ou un compteur"
        return "Initialise %s à %s (point de départ pour %s)" % (t, v.value, role)
    return "Stocke %s dans %s" % (value_desc(v), t)


def describe_for(node):
    it, var = node.iter, u(node.target)
    if isinstance(it, ast.Call) and call_name(it) == "range":
        a = it.args
        if len(a) == 1:
            return "Boucle : %s prend les valeurs de 0 à %s-1" % (var, u(a[0]))
        if len(a) == 2:
            return "Boucle : %s prend les valeurs de %s à %s-1 (borne finale exclue)" % (var, u(a[0]), u(a[1]))
        if len(a) == 3:
            return "Boucle : %s va de %s jusqu'à %s (exclu) avec un pas de %s" % (var, u(a[0]), u(a[1]), u(a[2]))
    return "Parcourt chaque élément de %s avec la variable %s" % (u(it), var)


def describe_expr_statement(v):
    if isinstance(v, ast.Constant) and isinstance(v.value, str):
        return None  # docstring : inutile de commenter
    if isinstance(v, ast.Call):
        name = call_name(v)
        if name == "print":
            if not v.args:
                return "Affiche une ligne vide"
            if len(v.args) == 1 and isinstance(v.args[0], ast.Constant) and isinstance(v.args[0].value, str):
                return "Affiche le message %s" % u(v.args[0])
            return "Affiche %s" % ", ".join(u(a) for a in v.args)
        if name == "close":
            return "Ferme le fichier"
        if name == "input":
            return "Attend que l'utilisateur appuie sur Entrée"
        return "Appelle %s" % u(v)
    return "Évalue l'expression %s" % u(v)


# --------------------------------------------------------------------------
# Lignes 'else' et 'finally' : elles n'ont pas de noeud propre dans l'AST
# --------------------------------------------------------------------------
def find_keyword_line(lines, keyword, start, end):
    """Cherche (de end vers start, 1-indexé) la ligne commençant par keyword."""
    for ln in range(end, start - 1, -1):
        if re.match(r"\s*%s\s*:" % keyword, lines[ln - 1]):
            return ln
    return None


def extra_comments(node, lines):
    """Commentaires pour else / finally attachés à un noeud composé."""
    found = []
    orelse = getattr(node, "orelse", None)
    if orelse:
        is_elif = isinstance(node, ast.If) and len(orelse) == 1 and isinstance(orelse[0], ast.If) \
            and re.match(r"\s*elif\b", lines[orelse[0].lineno - 1])
        if not is_elif:
            ln = find_keyword_line(lines, "else", node.lineno, orelse[0].lineno - 1)
            if ln:
                msg = "Sinon (aucune condition précédente n'est vraie), exécute ce bloc" \
                    if isinstance(node, ast.If) else "Exécuté si le bloc principal s'est terminé sans erreur / sans break"
                found.append((ln, msg))
    final = getattr(node, "finalbody", None)
    if final:
        ln = find_keyword_line(lines, "finally", node.lineno, final[0].lineno - 1)
        if ln:
            found.append((ln, "Dans tous les cas (erreur ou non), exécute ce bloc"))
    return found


# --------------------------------------------------------------------------
# Programme principal
# --------------------------------------------------------------------------
def add_comments(source):
    """Retourne le code source enrichi de commentaires."""
    tree = ast.parse(source)
    lines = source.splitlines()
    comments = {}  # numéro de ligne (1-indexé) -> liste de commentaires

    for node in ast.walk(tree):
        if not hasattr(node, "lineno") or not isinstance(node, (ast.stmt, ast.ExceptHandler)):
            continue
        text = describe(node)
        if text:
            line_no = node.lineno
            # Un 'elif' est représenté par un If : on le reformule.
            if isinstance(node, ast.If) and re.match(r"\s*elif\b", lines[line_no - 1]):
                text = "Sinon, teste si %s ; si oui, exécute le bloc indenté" % humanize_condition(node.test)
            comments.setdefault(line_no, []).append(text)
        for ln, msg in extra_comments(node, lines):
            comments.setdefault(ln, []).append(msg)

    out = []
    for i, line in enumerate(lines, 1):
        if i in comments:
            already = out and out[-1].strip().startswith("#")
            if not already:  # ne duplique pas un commentaire existant
                indent = re.match(r"\s*", line).group(0)
                out.append("%s# %s" % (indent, " ; ".join(comments[i])))
        out.append(line)
    return "\n".join(out) + "\n"


def main():
    if not 2 <= len(sys.argv) <= 3:
        sys.exit("Usage : python add_comments.py programme.py [sortie.py | -]")

    src_path = Path(sys.argv[1])
    try:
        source = src_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        sys.exit("Fichier introuvable : %s" % src_path)

    try:
        result = add_comments(source)
    except SyntaxError as e:
        sys.exit("Impossible de commenter : erreur de syntaxe ligne %s (%s)" % (e.lineno, e.msg))

    dest = sys.argv[2] if len(sys.argv) == 3 else str(src_path.with_name(src_path.stem + "_commente.py"))
    if dest == "-":
        print(result, end="")
    else:
        Path(dest).write_text(result, encoding="utf-8")
        print("Fichier écrit : %s" % dest)


if __name__ == "__main__":
    main()
