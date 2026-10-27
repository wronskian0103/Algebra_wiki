# Algebra Wiki

**Read online: [Algebra Wiki website](https://wronskian0103.github.io/Algebra_wiki/)**

Open the GitHub Pages website to browse both courses, search the notes, and follow linked terms to their definitions. No download or installation is required.

An English wiki connecting Algebra I and Algebra II: **81 topic pages across 8 chapters**, with 125 diagrams and the original lecture-note numbering.

The wiki combines SNU graduate algebra lectures by **Dohyeong Kim**, notes by **Juhyeok Choi**, and two supplementary notes. English study guides, key points, concept links, and correction notes help connect the material across both courses. Exercises and solutions are excluded.

## Read the wiki

Read online at the **[Algebra Wiki website](https://wronskian0103.github.io/Algebra_wiki/)**, or download the repository and open [`index.html`](index.html) in your browser. You can also open [`dist/index.html`](dist/index.html) directly. Keep the entire `dist/` folder together.

Reading the downloaded wiki works offline. MathJax and all other runtime assets are bundled locally; no installation or server is required.

Features include full-text search, chapter and course filters, concept and statement indexes, links between related topics, expandable proofs, bookmarks, reading status, and a dark theme. Underlined terms in the source notes link directly to their definitions; the concept index and each article's **Definitions used here** list offer the same precise links. The destination is highlighted and focused, including inside a collapsed proof. Bookmarks, reading status, and theme preferences are stored in the current browser.

## Contents

| Chapter | Topics | Source |
| --- | ---: | --- |
| Group Theory | 23 | Algebra I |
| Ring Theory | 10 | Algebra I |
| Field Theory | 15 | Algebra I |
| Category Theory | 6 | Algebra II |
| Modules | 11 | Algebra II |
| Tensor Products | 4 | Algebra II |
| Algebraic Equations | 8 | Algebra II |
| Further Topics | 4 | Algebra II supplements |

The main lecture notes are from Spring 2025 and Fall 2025. The supplementary documents cover projective and injective modules, and integral Galois extensions. Downloadable TeX sources and the Algebra II bibliography are available from the wiki's **Sources & corrections** page.

## GitHub Pages

The [Pages workflow](.github/workflows/pages.yml) publishes the checked-in `dist/` folder whenever a commit is pushed to `main`. It can also be run manually from the **Actions** tab. Publication does not require Python, Pandoc, or a build on GitHub.

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The deployment's `github-pages` environment reports the published URL.

The site uses relative asset paths and hash-based navigation, so it works at a GitHub Pages project URL as well as offline. `dist/.nojekyll` is included and recreated by the builder.

When changing the content or interface, rebuild locally and commit the updated `dist/` files along with the source changes. Pushing source changes alone does not rebuild the published wiki.

## Project files

| Path | Purpose |
| --- | --- |
| `dist/` | Complete static website, published by GitHub Pages |
| `web/` | HTML, CSS, and JavaScript interface source |
| `source/` | Original TeX source snapshots |
| `content/` | English study guides, related links, and correction notes |
| `build_wiki.py` | TeX-to-wiki builder |
| `diagrams.py` | Diagram renderer |
| `definition_links.py`, `content/definition-terms-*.json` | Context-aware term linking and curated definition destinations |
| `validate.py`, `validate_math.cjs` | Source, link, structure, and formula checks |
| `_work/audit_diagrams.py`, `_work/qa-app.cjs` | Diagram and interaction checks |
| `package_local.py` | Create the portable offline ZIP |

Generated archives, intermediate snapshots, and QA reports are ignored by Git. Validation scripts and the finished `dist/` site are versioned.

## Rebuild and check

Rebuilding requires Python 3.10+ and [Pandoc](https://pandoc.org/). Set `PANDOC_PATH` to the Pandoc executable if it is not on your `PATH`. Reading and publishing the prepared site need neither.

Run these commands from the repository root:

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

The JavaScript checks require Node.js. Formula validation also needs the development package `mathjax-full` 3.2.2; set `MATHJAX_DIR` to its `js/` directory when running outside the original course workspace. The reader's MathJax runtime is already bundled in `dist/assets/`.

Edit the source snapshots or English metadata, then rebuild. Preserve section IDs to keep existing links stable. New sections need corresponding study guides and related links. The builder writes reports to `_work/` and `package_local.py` creates `Algebra-Wiki.zip` locally.

Add terminology to the definition registries with a canonical `term`, plural or spelling `aliases`, and an existing block `target` (or a section's `--original` anchor for an inline definition). Optional `contexts` restrict chapter numbers; `excludeSections` suppresses a known misleading source usage. Longest phrases are matched first, and indistinguishable meanings are left unlinked. Existing references, code, diagrams, and formula contents are preserved. A single inline math letter can form part of a term such as a p-group or R-module.

`validate.py` checks source coverage, numbering, statement anchors, internal links, source hashes, and local assets. The other checks cover diagrams, formulas, and interface behavior. The interface check uses a DOM emulator; it does not verify browser layout.

## Editorial notes and licenses

The original mathematical statements are preserved. Study guides and correction notes are editorial additions and are not official course errata. Empty source proofs and the short Resultants source stub are identified explicitly. Diagrams are reconstructed as HTML/SVG with expandable original TikZ source; spacing can differ from TeX output.

Copyright in the original lecture notes and supplementary materials remains with their authors. This repository does not grant an additional license to those materials.

MathJax 3.2.2 is bundled under the [Apache License 2.0](dist/assets/mathjax/LICENSE).
