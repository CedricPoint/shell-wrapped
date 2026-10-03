# shell-wrapped

[English](README.md) · **Français**

**Spotify Wrapped, pour votre terminal.** L'outil lit votre historique shell —
celui qui est déjà sur votre disque — et vous dit ce que vous avez réellement
passé l'année à taper. Puis il vous donne une carte à publier.

[![CI](https://github.com/CedricPoint/shell-wrapped/actions/workflows/ci.yml/badge.svg)](https://github.com/CedricPoint/shell-wrapped/actions/workflows/ci.yml)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![dépendances](https://img.shields.io/badge/d%C3%A9pendances-0-brightgreen.svg)](package.json)
[![hors ligne](https://img.shields.io/badge/r%C3%A9seau-jamais-blueviolet.svg)](#votre-historique-reste-chez-vous)
[![licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

```bash
npx github:CedricPoint/shell-wrapped
```

![la carte](docs/card-dark.svg)

```
  shell wrapped   2,400 commands · 22 unique · 10 a day
  2026-01-06 → 2026-09-01

  your top commands

  git           1548  65%  ████████████████████████████████████████
  npm            344  14%  █████████
  cd             111   5%  ███
  docker         106   4%  ███
  ls              78   3%  ██

  you and git
  push 181  ·  checkout 171  ·  log 166  ·  stash 165  ·  status 157

  when you work
  ▃▃▃▃▃▁▁▁▁▇▇█▇██▇▇██▁▁▁▃▃
  0h                       12h                      23h
  busiest at 11:00  ·  Thursday is your day  ·  17% after 22:00
  your biggest day was 2026-02-12, with 19 commands

  habits
      49  asked nicely with sudo
      20  recursive deletions
       4  force pushes
      19  fresh starts (clear)
      38  steps backwards (cd ..)
       1  times you typed :q at a shell

  near misses
  gti → git (3)  ·  sl → ls (3)

  longest streak   22 × git in a row, without doing anything else
```

*(C'est un historique inventé — `npm run demo` le régénère. Le vôtre sera pire.
Le rapport et la carte s'affichent en anglais, pour que la carte reste lisible
partout où elle est partagée.)*

## Votre historique reste chez vous

C'est la partie qui mérite une seconde lecture, parce qu'un historique shell est
le fichier texte le plus sensible de votre machine : il est plein de noms
d'hôtes, de jetons, et de la fois où vous avez tapé un mot de passe au mauvais
endroit.

- **Rien n'est envoyé.** Il n'y a pas une ligne de code réseau dans ce dépôt.
  Pas de télémétrie, pas de statistiques « anonymes », pas de vérification de
  mise à jour.
- **Aucun argument n'atteint jamais la sortie.** Seulement le *nom* d'une
  commande, le nom de sa sous-commande, des compteurs et des dates.
  `curl -H "Authorization: Bearer sk_live_…"` compte pour un `curl` et rien
  d'autre — ni dans le rapport du terminal, ni dans `--json`, ni sur la carte. Un
  test prend un historique truffé de secrets plantés exprès et échoue si l'un
  d'eux apparaît où que ce soit dans la sortie.
- **Rien n'est écrit** tant que vous ne demandez pas `--svg`.

La carte est donc publiable telle quelle. C'était toute la contrainte de départ.

## Ce qu'il lit

| shell | où | horodatage |
| --- | --- | --- |
| zsh | `~/.zsh_history` | oui, avec `EXTENDED_HISTORY` |
| bash | `~/.bash_history` | seulement si `HISTTIMEFORMAT` est défini |
| fish | `~/.local/share/fish/fish_history` | oui |
| PowerShell | `…/PSReadLine/ConsoleHost_history.txt` | non |

Tous ceux qu'il trouve sont lus et fusionnés. Sans horodatage, vous gardez le
classement, les habitudes et les fautes de frappe — seule l'horloge manque.

```bash
shell-wrapped --list            # où il a cherché, et ce qu'il a trouvé
```

## Utilisation

```bash
shell-wrapped                   # tout ce qu'il peut trouver
shell-wrapped --year 2026       # seulement cette année
shell-wrapped --days 30         # seulement ce mois-ci
shell-wrapped --shell fish      # un seul shell
shell-wrapped --file ./historique --shell zsh
shell-wrapped --svg wrapped.svg --theme light
shell-wrapped --json            # le rapport complet, pour vos propres scripts
```

La carte fait 1200×630 — la taille qu'attendent les aperçus sur les réseaux — et
c'est un seul SVG autonome : aucune police externe, aucune image, aucune requête.

<img src="docs/card-light.svg" width="420" alt="le thème clair">

## Le morceau intéressant : les presque-réussites

`gti`, `nmp`, `sl`, `cd..` — le détecteur cherche une commande que vous avez
tapée une ou deux fois et qui se trouve à **une frappe** d'une commande que vous
utilisez toute la journée, puis rapporte la paire.

La subtilité est que les trois fautes de frappe les plus courantes au monde sont
deux lettres inversées, et que la distance de Levenshtein pure compte une
inversion comme deux modifications — une version naïve de ce détecteur ne trouve
donc strictement rien. Celle-ci compte l'échange de deux voisines comme une seule
faute, ce qu'elle est.

## Installation

```bash
npx github:CedricPoint/shell-wrapped          # rien d'installé
npm install -g github:CedricPoint/shell-wrapped
```

Node 18 ou plus récent. Aucune dépendance, aucune étape de construction, aucune
configuration.

## Comme bibliothèque

```js
import { available, read, analyse, card } from 'shell-wrapped';

const entries = available().flatMap(read);
const report = analyse(entries);

console.log(report.busiestHour, report.top[0]);
writeFileSync('card.svg', card(report, { theme: 'light' }));
```

## Tests

34 : chaque format d'historique, les statistiques, le détecteur de fautes de
frappe, la bonne formation de la carte, et la règle de confidentialité ci-dessus.

```bash
npm test
```

## Licence

MIT
