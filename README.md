# Algebra Wiki

**Current version: 1.0.0** · **[Read the wiki online](https://wronskian0103.github.io/Algebra_wiki/)**

An English wiki connecting Algebra I and Algebra II, from groups, rings, and fields to categories, modules, tensor products, and algebraic geometry. Explore **81 topic pages across 8 chapters**, with **125 diagrams**, linked definitions, and the original lecture-note numbering.

Based on SNU graduate algebra lectures by **Professor Dohyeong Kim**, with notes and supplementary materials by **Juhyeok Choi**. English study guides and related-topic links connect the two courses. Exercises and solutions are excluded.

## Start reading

Open the **[Algebra Wiki website](https://wronskian0103.github.io/Algebra_wiki/)** to read in your browser. No download or installation is required.

For offline reading:

1. Download this repository using **Code → Download ZIP** and extract it.
2. Open [`index.html`](index.html), or open [`dist/index.html`](dist/index.html) directly.
3. Keep the entire `dist/` folder together. MathJax, diagrams, and other runtime assets are bundled locally, so reading requires neither an internet connection nor a server.

## Features

- **Linked definitions.** Click underlined terms in the notes and study guides to jump to the relevant definition. The destination is highlighted, and any enclosing proof opens automatically. The concept index and **Definitions used here** list offer the same direct links.
- **Search and navigation.** Search the notes, filter by chapter or course, and browse concept and statement indexes. Source labels distinguish repeated numbering across documents.
- **Study support.** Each topic includes an English guide, key points, related sections, and correction notes where needed. Proofs expand individually or together.
- **Personal reading tools.** Save bookmarks, mark sections as read, and switch to a dark theme. These preferences are stored in the current browser.
- **Source access.** Download the original TeX notes and bibliography from **Sources & corrections**, and inspect the original TikZ behind each reconstructed diagram.

## Contents

| Chapter | Topic pages | Course |
| --- | ---: | --- |
| Group Theory | 23 | Algebra I |
| Ring Theory | 10 | Algebra I |
| Field Theory | 15 | Algebra I |
| Category Theory | 6 | Algebra II |
| Modules | 11 | Algebra II |
| Tensor Products | 4 | Algebra II |
| Algebraic Equations | 8 | Algebra II |
| Further Topics | 4 | Algebra II supplements |

The main lecture notes cover **Spring 2025** and **Fall 2025**. Two supplementary documents expand on projective and injective modules, and integral Galois extensions.

## Project layout

| Path | Purpose |
| --- | --- |
| [`dist/`](dist/) | Complete static website and bundled offline assets |
| [`web/`](web/) | Interface source: HTML, CSS, and JavaScript |
| [`source/`](source/) | Original TeX snapshots and bibliography |
| [`content/`](content/) | English guides, correction notes, related links, and definition registries |
| [`build_wiki.py`](build_wiki.py) | Build the wiki from the bundled sources |
| [`diagrams.py`](diagrams.py), [`definition_links.py`](definition_links.py) | Render diagrams and link terms to definitions |
| [`validate.py`](validate.py), [`validate_math.cjs`](validate_math.cjs), [`test_definition_links.py`](test_definition_links.py) | Check source coverage, internal links, formulas, and term linking |
| [`_work/`](_work/) | Diagram and interface QA scripts; generated reports |
| [`package_local.py`](package_local.py) | Create the portable offline archive |

Generated archives, intermediate snapshots, and QA reports are ignored by Git. The finished `dist/` site and validation scripts are versioned.

## Build and maintain

Reading the prepared site requires no development tools. Rebuilding requires **Python 3.10+** and **[Pandoc](https://pandoc.org/)**. Set `PANDOC_PATH` if Pandoc is not on your `PATH`.

Run from the repository root:

```sh
python build_wiki.py
python validate.py
python test_definition_links.py
python _work/audit_diagrams.py
node validate_math.cjs
node _work/qa-app.cjs
node _work/qa-definition-links.cjs
python package_local.py
```

The JavaScript checks require Node.js. Formula validation also requires `mathjax-full` **3.2.2**; set `MATHJAX_DIR` to its `js/` directory when running outside the original course workspace. The reader's MathJax runtime is already included in `dist/assets/`.

Edit the source snapshots or English metadata, then rebuild. Preserve section and block IDs so existing links continue to work. New sections also need guides and related links. Build reports are written to `_work/`; the packaging script creates `Algebra-Wiki.zip` locally.

To add a definition link, update the `content/definition-terms-*.json` registries with a canonical `term`, optional spelling or plural `aliases`, and an existing `target` anchor. Use a section's `--original` anchor for an inline definition. Optional `contexts` restrict chapter numbers, while `excludeSections` suppresses misleading usages. The linker prefers the longest phrase, leaves unresolved meanings unlinked, and preserves existing references, code, diagrams, and formula contents.

Validation covers source coverage, numbering, statement anchors, internal links, source hashes, diagrams, formulas, and interface behavior. Interface checks use a DOM emulator and do not verify browser layout.

## GitHub Pages deployment

The [Pages workflow](.github/workflows/pages.yml) publishes the checked-in `dist/` folder when `main` is updated. It can also be started from the **Actions** tab. GitHub serves the prepared files directly; no Python or Pandoc build runs during deployment.

After changing content or the interface, rebuild locally and commit the updated `dist/` files along with the source changes. Pushing source changes alone does not rebuild the website.

To publish a fork, select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. Relative asset paths and hash-based navigation support both GitHub Pages project URLs and offline reading. The builder includes `dist/.nojekyll`.

## Editorial notes and licenses

Original mathematical statements and source numbering are preserved. Study guides and correction notes are editorial additions, not official course errata. Empty source proofs and the unfinished Resultants section are labeled explicitly. Diagrams are reconstructed as HTML/SVG with expandable original TikZ; their spacing may differ from TeX output.

Copyright in the lecture notes and supplementary materials remains with their authors. This repository does not grant an additional license to those materials.

MathJax **3.2.2** is bundled under the [Apache License 2.0](dist/assets/mathjax/LICENSE).
