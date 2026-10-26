ALGEBRA — AN ENGLISH WIKI FOR ALGEBRA I AND II

OPEN THE WIKI
  Open index.html in this folder, or dist/index.html directly.
  No server, installation, or Internet connection is needed for reading.
  Keep the entire dist folder together: its scripts, assets, and source files
  are required. If using the ZIP, extract it before opening index.html.

COVERAGE
  81 topic pages in 8 chapters:
    Group Theory                         23 lecture sections
    Ring Theory                          10 lecture sections
    Field Theory                         15 lecture sections
    Category Theory                       6 lecture sections
    Modules                              11 lecture sections
    Tensor Products                       4 lecture sections
    Algebraic Equations                    8 lecture sections
    Further Topics                        4 supplement sections

  Includes the complete main.tex bodies from both courses, both Algebra II
  supplementary notes. Original English prose, formulas, statement numbering,
  and 125 diagrams are retained.
  Each topic has an English study guide, key points, keywords, and related
  links. Search, concept and statement indexes, course filters, bookmarks,
  reading status, proof folding, and a dark theme work across both courses.

SOURCES AND EDITING
  Algebra I: 2025 Spring; Algebra II: 2025 Fall; SNU graduate courses.
  Lecture by Prof. Dohyeong Kim; notes by Juhyeok Choi.
  Supplementary notes: Juhyeok Choi.
  Copyright in the supplied source materials remains with their authors.

  Original course folders are untouched. source/ contains byte-for-byte
  snapshots; dist/source/ provides downloadable copies from inside the wiki.
  Source labels distinguish overlapping numbering and supplementary versions.
  Supplementary notes are kept separately so their extra material is retained.
  The reference bibliography is included as source/algebra2/references.bib.

  Study guides and correction notes are editorial additions, not official
  errata. The original mathematical statements are preserved. The one-sentence
  Resultants section is labeled as a source stub. Empty proof blocks in the
  lecture notes are identified explicitly.
  Diagrams are reconstructed as HTML/SVG with expandable original TikZ source;
  spacing may differ from a TeX rendering.

  Bookmarks, theme, and reading status are saved in this browser only.
  The unified wiki uses separate storage from the earlier Algebra I wiki.

PROJECT FILES
  dist/         Finished, portable wiki
  web/          HTML, CSS, and JavaScript interface source
  source/       Original TeX source snapshots
  content/      English guides, cross-links, and correction notes (JSON)
  build_wiki.py TeX-to-wiki builder
  diagrams.py   Diagram renderer
  _work/        Validation scripts and reports

REBUILDING
  Requires Python 3.10+ and Pandoc. Reading the finished wiki needs neither.
  Run from the parent Algebra_Wiki folder:
    python Algebra/build_wiki.py
    python Algebra/validate.py
    python Algebra/_work/audit_diagrams.py
    node Algebra/validate_math.cjs
    node Algebra/_work/qa-app.cjs

  Pandoc is found on PATH, from PANDOC_PATH, or from the existing Algebra I
  wiki's bundled converter. Formula QA uses the original wiki's MathJax
  development package by default; set MATHJAX_DIR to another mathjax-full/js
  directory if moving this project elsewhere. The reader's MathJax runtime
  is already bundled under dist/assets/ and is independent of those tools.

  Edit the source snapshots and content metadata, then rebuild. New sections
  also need guides and related links. Preserve source IDs to keep links stable.
  Refresh the portable archive with:
    python Algebra/package_local.py

VALIDATION
  Source coverage, numbering, all block anchors, internal links, diagram
  coverage, source hashes, and local assets are checked by validate.py.
  validate_math.cjs checks formulas with MathJax. _work/qa-app.cjs exercises
  routes and interactions using a DOM emulator; it is not a browser renderer.
  Browser visual QA was unavailable in this execution environment.

LICENSE
  MathJax 3.2.2 is bundled under its Apache 2.0 license:
    dist/assets/mathjax/LICENSE
