# Implémentation en Python des conventions algorithmiques

* **Niveau :** BAC Informatique (Tunisie)
* **Année Scolaire :** 2022/2023
* **Langage :** Python
* **Source :** Ministère de l’Éducation - Direction Générale des Programmes et de la Formation Continue

---

## 📌 Résumé pour l'Examen

Dans le cadre des épreuves pratiques et écrites du BAC Informatique, les élèves sont autorisés et tenus d'utiliser les éléments suivants :

1. **Entrées / Sorties :** Lire et écrire des données avec `input()` et `print()`.
2. **Conversions :** Convertir les types avec `int()`, `float()`, `bool()`, `str()`.
3. **Tableaux :** Déclarer et parcourir des tableaux à 1D et 2D avec `numpy.array`.
4. **Enregistrements :** Implémenter des enregistrements avec `dict()`.
5. **Fichiers :** Manipuler des fichiers texte et binaires avec `open()` et le module `pickle`.
6. **Structures Conditionnelles :** Utiliser `if`, `elif`, `else`, et `match / case`.
7. **Structures Itératives :** Utiliser `for` et `while` (*sans l'instruction `break`*).
8. **Subdivision (Modules) :** Définir et appeler des fonctions/procédures avec `def` et `return`.
9. **Opérateurs & Fonctions :** Utiliser exclusivement les opérateurs et fonctions prédéfinies autorisés.
10. **Conformité :** Respecter rigoureusement les interdictions officielles.

---

## 🚫 Interdictions Strictes

* ❌ **Pas de `break`** dans les boucles `for` et `while`.
* ❌ **Pas d'affichage direct de tableau :** `print(T)` est interdit. L'affichage doit se faire élément par élément.
* ❌ **Pas de retour multiple :** `return` ne doit renvoyer qu'un seul résultat de type simple.
* ❌ **Pas de fonctions non listées :** Utiliser uniquement les fonctions prédéfinies autorisées dans ce document.
* ❌ **Pas de sélecteurs non scalaires** dans la structure `match/case`.
* ❌ **Pas de tableaux `numpy` dynamiques ou non homogènes.**
* ❌ **Pas de typage explicite** lors de la déclaration d'une variable simple.

---

## 1. Commentaires, Entrées/Sorties et Affectation

### Syntax des commentaires
* **Ligne simple :** `# commentaire`
* **Multi-lignes :** `''' commentaire '''`
> 💡 *Note : Python est sensible à la casse (majuscules/minuscules).*

### Entrées / Sorties & Affectation

| Algorithmique | Python |
| :--- | :--- |
| `Lire(Objet)` | `Objet = input()` |
| `Lire(Objet)` avec message | `Objet = input('message')` |
| `Écrire("Message", Objet, Expression)` | `print("Message", Objet, Expression)` |
| `Écrire_nl("Message", Objet, Expression)` | `print("Message", Objet, Expression, "\n")` |
| `Objet ← Expression` | `Objet = Expression` |

**Remarques Importantes :**
* Par défaut, la fonction `input()` retourne une chaîne de caractères (`str`).
* `\n` permet d'ajouter un retour à la ligne.
* L'affectation directe (`=`) ne concerne que les variables de type simple.

---

## 2. Types Simples et Conversions

### Types de données de base

| Type Algorithmique | Type Python |
| :--- | :--- |
| Entier | `int` |
| Réel | `float` |
| Booléen | `bool` |
| Caractère | `str` |
| Chaîne de caractères | `str` |

### Fonctions de Conversion

| Conversion | Syntaxe Python | Exemple |
| :--- | :--- | :--- |
| `str` ➔ `int` | `int(ch)` | `x = int("3")` |
| `str` ➔ `float` | `float(ch)` | `x = float("3.2")` |
| `str` ➔ `bool` | `bool(ch)` | `x = bool("0")` *(retourne `True`)* |
| `int` ➔ `str` | `str(x)` | `x = str(3)` *(retourne `"3"`)* |

---

## 3. Tableaux avec `numpy`

### Imports autorisés
```python
from numpy import array
from numpy import *
import numpy as alias
```

### Déclaration de tableaux
* **Tableau 1D :**
  ```python
  T = array([Type_élément] * N)
  T = array([valeur_initiale] * N)
  ```
* **Tableau 2D (Matrices) :**
  ```python
  T = array([[Type_élément] * Colonnes] * Lignes)
  T = array([[valeur_initiale] * Colonnes] * Lignes)
  ```
* **Syntaxe avec type explicite (`dtype`) :**
  ```python
  Nom_tableau = array([Valeur_initiale] * N, dtype=Type_élément)
  ```

### Exemples d'utilisation

| Déclaration Python | Explication |
| :--- | :--- |
| `T = array([5] * 10)` | Tableau de 10 entiers initialisés à `5` |
| `T = array([float()] * 10)` | Tableau de 10 réels initialisés à `0.0` |
| `T = array([str] * 10)` | Tableau de 10 chaînes de caractères |
| `T = array([str()] * 10)` | Tableau de 10 caractères vides |
| `T = array([''] * 10, dtype='U20')` | Tableau de 10 chaînes vides (max 20 caractères) |
| `T = array([[int()] * 10] * 30)` | Matrice de 30 lignes × 10 colonnes d'entiers |

**Propriétés des tableaux :**
* **Homogène :** Tous les éléments doivent être de même type.
* **Statique :** La taille est fixée dès la création.
* **Accès :** `T[i]` pour 1D, `T[i][j]` pour 2D.

---

## 4. Enregistrements avec `dict`

| Algorithmique | Python |
| :--- | :--- |
| **Déclaration :**<br>`Nom_rec : Enregistrement`<br>`  Champ1 : Type1`<br>`  Champ2 : Type2`<br>`Fin` | `Nom_enregistrement = dict(Nom_champ1 = Type_champ1, Nom_champ2 = Type_champ2)` |
| **Accès au champ :**<br>`Nom_rec.Champ1` | `Nom_Enregistrement['Nom_Champ1']` |

---

## 5. Gestion des Fichiers

### 5.1 Fichiers de Données (Binaires)

* **Ouverture :** `Nom_logique = open('Chemin\\Nom_physique', 'Mode')`
  * Modes : `'rb'` (Lecture), `'wb'` (Écriture/Création), `'ab'` (Ajout)
* **Lecture :**
  ```python
  from pickle import load, dump
  Objet = load(Nom_logique)
  ```
* **Écriture :**
  ```python
  dump(Objet, Nom_logique)
  ```
* **Test de fin de fichier (EOF) :**
  ```python
  Fin_fichier = False
  while not Fin_fichier:
      try:
          x = load(Nom_logique)
      except:
          Fin_fichier = True
  ```
* **Fermeture :** `Nom_logique.close()`

---

### 5.2 Fichiers Texte

* **Ouverture :** `Nom_logique = open('Chemin\\Nom_physique', 'Mode')`
  * Modes : `'r'` (Lecture), `'w'` (Écriture/Création), `'a'` (Ajout)
* **Lecture complète :** `ch = Nom_logique.read()`
* **Lecture ligne par ligne :** `ch = Nom_logique.readline()`
* **Écriture :** `Nom_logique.write(ch)`
* **Écriture avec saut de ligne :** `Nom_logique.write(ch + "\n")`
* **Test de fin de fichier :**
  ```python
  ch = Nom_logique.readline()
  while ch != "":
      # Traitement
      ch = Nom_logique.readline()
  ```
  > 💡 *Note : La fin d'un fichier texte est marquée par la chaîne vide `""`.*
* **Fermeture :** `Nom_logique.close()`

---

## 6. Structures Conditionnelles

### Forme Simple (`if`)
```python
if Condition:
    Traitement
```

### Forme Alternative (`if / else`)
```python
if Condition:
    Traitement1
else:
    Traitement2
```

### Forme Imbriquée (`if / elif / else`)
```python
if Condition1:
    Traitement1
elif Condition2:
    Traitement2
else:
    TraitementN
```

### Selon / Choix (`match / case`) *(Python 3.10+)*
```python
match Selecteur:
    case Valeur1:
        Traitement1
    case Valeur2_1 | Valeur2_2:
        Traitement2
    case Selecteur if V3_1 <= Selecteur <= V3_2:
        Traitement3
    case _:
        TraitementN
```
> ⚠️ *Le sélecteur doit obligatoirement être de type scalaire.*

---

## 7. Structures Itératives (Boucles)

### 1. Boucle `for` (Pour)
```python
for compteur in range(Début, Fin + 1, Pas):
    Traitement
```
* **Remarques :**
  * La borne supérieure de `range()` est exclusive, d'où l'utilisation de `Fin + 1`.
  * Le pas peut être positif ou négatif (par défaut : `1`).

### 2. Boucle `while` (Tant que)
```python
while Condition:
    Traitement
```

### 3. Structure `Répéter ... Jusqu'à`
Doit être implémentée au moyen d'une boucle `while` avec une condition appropriée (l'utilisation de `break` est strictement interdite).

---

## 8. Modules (Fonctions & Procédures)

### Déclaration

* **Fonction :**
  ```python
  def Nom_module(pf1, pf2, ..., pfn):
      # Traitement
      return resultat
  ```
  *(Note : `return` ne peut renvoyer qu'un seul résultat de type simple).*

* **Procédure :**
  ```python
  def Nom_module(pf1, pf2, ..., pfn):
      # Traitement
  ```

### Appel des modules

* **Appel d'une Fonction :** `Objet = Nom_module(pe1, ..., pen)`
* **Appel d'une Procédure :** `Nom_module(pe1, ..., pen)`

### Passage de paramètres
* En Python, les **dictionnaires**, **tableaux (`numpy`)**, et **fichiers** sont automatiquement passés **par référence**.

### Portée des variables
* Toute variable déclarée à l'intérieur d'un module a une **portée locale**.
* Pour rendre une variable globale dans un module, utiliser le mot-clé `global`.
* ⚠️ Une variable globale **ne doit pas** figurer dans la liste des paramètres du module.

---

## 9. Opérateurs Autorisés

### Opérateurs Arithmétiques
| Opération | Algorithmique | Python |
| :--- | :---: | :---: |
| Somme | `+` | `+` |
| Soustraction | `-` | `-` |
| Multiplication | `*` | `*` |
| Division réelle | `/` | `/` |
| Division entière | `Div` | `//` |
| Reste division entière | `Mod` | `%` |

### Opérateurs de Comparaison
| Opération | Algorithmique | Python |
| :--- | :---: | :---: |
| Égal | `=` | `==` |
| Différent | `≠` | `!=` |
| Strictement supérieur | `>` | `>` |
| Supérieur ou égal | `≥` | `>=` |
| Strictement inférieur | `<` | `<` |
| Inférieur ou égal | `≤` | `<=` |
| Appartenance | `∈` | `in` |

### Opérateurs Logiques
| Opération | Algorithmique | Python |
| :--- | :---: | :---: |
| Négation | `Non` | `not` |
| Conjonction | `Et` | `and` |
| Disjonction | `Ou` | `or` |

---

## 10. Fonctions Prédéfinies Autorisées

### Fonctions Numériques
| Algorithmique | Python | Observation / Import |
| :--- | :--- | :--- |
| `Arrondi(x)` | `round(x)` | — |
| `RacineCarré(x)` | `sqrt(x)` | Requis : `import math` ou `from math import sqrt` |
| `Aléa(vi, vf)` | `randint(vi, vf)` | Requis : `import random` ou `from random import randint` |
| `Ent(x)` | `int(x)` | — |
| `Abs(x)` | `abs(x)` | — |

### Fonctions sur les Caractères
| Algorithmique | Python |
| :--- | :--- |
| `Ord(c)` | `ord(c)` |
| `Chr(d)` | `chr(d)` |

### Fonctions sur les Chaînes de Caractères
| Algorithmique | Python |
| :--- | :--- |
| `Long(ch)` | `len(ch)` |
| `Pos(ch1, ch2)` | `ch2.find(ch1)` |
| `Convch(x)` | `str(x)` |
| `Estnum(ch)` | `ch.isdecimal()` |
| `Valeur(ch)` | `int(ch)` ou `float(ch)` |
| `Sous_chaine(ch, d, f)` | `ch[d:f]` |
| `Effacer(ch, d, f)` | `ch = ch[:d] + ch[f:]` |
| `Majus(ch)` | `ch.upper()` |
| Concaténation | `ch1 + ch2` |

---

## 📦 Modules (Imports) Officiellement Autorisés

```python
from numpy import array
from numpy import *
import numpy as alias
import math               # Pour math.sqrt
import random             # Pour random.randint
from pickle import load, dump
```