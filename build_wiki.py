"""Build the English, offline Algebra wiki from its bundled lecture sources.

Requires Python 3.10+ and Pandoc. PANDOC_PATH may name a Pandoc executable.
Original TeX is kept verbatim under source/; display-only repairs are recorded.
"""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import hashlib
import html
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
WORK = ROOT / '_work'
TYPES = {k: k.title() for k in ('definition', 'theorem', 'lemma', 'proposition',
         'corollary', 'example', 'remark', 'proof')}

CHAPTERS = [
    (1, 'Group Theory', 'Groups, actions, structure, and universal constructions', 'G', 'Algebra I'),
    (2, 'Ring Theory', 'Ideals, localization, and factorization', 'R', 'Algebra I'),
    (3, 'Field Theory', 'Extensions, finite fields, and Galois theory', 'K', 'Algebra I'),
    (4, 'Category Theory', 'Functors, universal properties, and adjunctions', 'C', 'Algebra II'),
    (5, 'Modules', 'Exactness, projectivity, injectivity, and structure', 'M', 'Algebra II'),
    (6, 'Tensor Products', 'Multilinearity, flatness, and change of scalars', '⊗', 'Algebra II'),
    (7, 'Algebraic Equations', 'Integral extensions, algebraic geometry, and spectra', 'V', 'Algebra II'),
    (8, 'Further Topics', 'Expanded module notes and prime ideal decomposition', '+', 'Algebra II'),
]
SOURCES = [
    dict(id='algebra1', title='Algebra I lecture notes', path='source/algebra1/main.tex',
         course='Algebra I', term='2025 Spring', lecturer='Dohyeong Kim', prefix='s', chapterOffset=0),
    dict(id='algebra2', title='Algebra II lecture notes', path='source/algebra2/main.tex',
         course='Algebra II', term='2025 Fall', lecturer='Dohyeong Kim', prefix='a2s', chapterOffset=3),
    dict(id='projective-injective', title='Projective and Injective Modules',
         path='source/algebra2/Projective Modules and Injective Modules.tex',
         course='Algebra II', term='2025 Fall', prefix='supp', start=0, chapter=8),
    dict(id='integral-galois', title='Integral Galois Extensions',
         path='source/algebra2/Integral Galois Extensions.tex',
         course='Algebra II', term='2025 Fall', prefix='supp', start=2, chapter=8),
]


class Plain(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = Plain()
    parser.feed(value)
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()


def mask_comments(text):
    # Keep positions and line numbers stable while ignoring commented commands.
    return re.sub(r'(?<!\\)%[^\n]*', lambda m: ' ' * len(m[0]), text)


def braced(text, pos):
    if text[pos] != '{':
        raise ValueError('Expected brace')
    depth, start = 1, pos + 1
    pos += 1
    while depth:
        if text[pos] == '{' and text[pos - 1] != '\\':
            depth += 1
        elif text[pos] == '}' and text[pos - 1] != '\\':
            depth -= 1
        pos += 1
    return text[start:pos - 1], pos


def find_pandoc():
    candidates = [os.environ.get('PANDOC_PATH'), shutil.which('pandoc'),
                  str(ROOT.parent / '대수학 1/algebra-wiki/_vendor/pypandoc/files/pandoc.exe')]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise SystemExit('Pandoc was not found. Install Pandoc or set PANDOC_PATH to its executable.')


def main():
    from diagrams import render as render_diagram
    WORK.mkdir(exist_ok=True)
    DIST.mkdir(exist_ok=True)
    (DIST / '.nojekyll').touch()
    pandoc = find_pandoc()

    def convert(document):
        result = subprocess.run([pandoc, '--from=latex', '--to=html5', '--mathjax', '--wrap=none'],
                                input=document, text=True, encoding='utf-8', capture_output=True,
                                check=True, cwd=ROOT)
        return result.stdout

    chapters = [dict(n=n, title=t, en=d, description=d, symbol=s, course=c)
                for n, t, d, s, c in CHAPTERS]
    sections, source_texts, preambles = [], {}, {}
    for spec in SOURCES:
        src = (ROOT / spec['path']).read_text(encoding='utf-8')
        source_texts[spec['id']] = src
        clean = mask_comments(src)
        begin = clean.index(r'\begin{document}') + len(r'\begin{document}')
        end_doc = clean.index(r'\end{document}')
        preambles[spec['id']] = src[:begin - len(r'\begin{document}')]
        matches = []
        for m in re.finditer(r'\\(chapter|section)\{', clean[begin:end_doc]):
            start = begin + m.start()
            title, end = braced(src, begin + m.end() - 1)
            matches.append(dict(kind=m[1], title=title, start=start, end=end))
        entries, chapter_no, section_no = [], 0, 0
        for i, m in enumerate(matches):
            if m['kind'] == 'chapter':
                chapter_no += 1
                section_no = 0
                continue
            section_no += 1
            title = m['title']
            if title.startswith(r'\texorpdfstring'):
                _, p = braced(title, title.index('{'))
                title, _ = braced(title, p)
            title = title.replace(r'\"o', 'ö')
            n = spec.get('start', 0) + len(entries) + 1
            entries.append(dict(id=f"{spec['prefix']}{n:02}", title=title,
                                chapterNo=spec.get('chapter', chapter_no + spec.get('chapterOffset', 0)),
                                number=f'{chapter_no}.{section_no}' if chapter_no else str(section_no),
                                start=m['start'], end=m['end'],
                                stop=matches[i + 1]['start'] if i + 1 < len(matches) else end_doc))
        for entry in entries:
            body = src[entry['end']:entry['stop']]
            section = dict(id=entry['id'], title=entry['title'], chapterNo=entry['chapterNo'],
                           chapter=chapters[entry['chapterNo'] - 1]['title'], number=entry['number'],
                           sourceNumber=entry['number'], sourceId=spec['id'], course=spec['course'],
                           line=src[:entry['start']].count('\n') + 1,
                           sourceLineEnd=src[:entry['stop']].count('\n') + 1,
                           body=body, terms=re.findall(r'\\emph\{([^{}]+)\}', body))
            if section['id'] == 'a2s28':
                section['sourceStatus'] = 'Source stub'
            sections.append(section)

    meta, issues = {}, []
    for file in sorted((ROOT / 'content').glob('*.json')):
        values = json.loads(file.read_text(encoding='utf-8'))
        if file.stem.endswith('-issues'):
            issues.extend(values)
        else:
            meta.update({m['id']: m for m in values})

    # Add universal-property and commutative-algebra bridges in both directions.
    bridges = [('s17', 'a2s03'), ('s18', 'a2s15'), ('s20', 'a2s14'),
               ('s21', 'a2s17'), ('s22', 'a2s05'), ('s23', 'a2s06'),
               ('s25', 'a2s07'), ('s26', 'a2s19'), ('s27', 'a2s19'),
               ('s28', 'a2s29'), ('s29', 'a2s29'), ('s30', 'a2s15'),
               ('s31', 'a2s25'), ('s45', 'a2s23'), ('s46', 'supp04')]
    labels, stats = {}, Counter({kind: 0 for kind in TYPES})
    block_pattern = r'\\begin\{(' + '|'.join(TYPES) + r')\}'
    for section in sections:
        count, blocks = 0, []
        matches = list(re.finditer(block_pattern, mask_comments(section['body'])))
        for i, m in enumerate(matches):
            kind = m[1]
            if kind not in ('remark', 'proof'):
                count += 1
            stats[kind] += 1
            number = (section['number'] + '.' + str(count)) if kind not in ('remark', 'proof') else ''
            block = dict(id=f"{section['id']}--b{i + 1:03}", kind=kind, number=number, title='')
            blocks.append(block)
            stop = matches[i + 1].start() if i + 1 < len(matches) else len(section['body'])
            for label in re.findall(r'\\label\{([^}]+)\}', section['body'][m.end():stop]):
                labels[(section['sourceId'], label)] = block
        section['blocks'] = blocks

    diagram_count, broken_refs, conversion_warnings = 0, [], []
    for section in sections:
        body = mask_comments(section['body'])
        # The bibliography is offered as a source download, not unprocessed TeX in an article.
        body = re.sub(r'\\(?:bibliography|bibliographystyle|nocite)\{[^}]*\}', '', body)
        diagrams, refs = {}, {}

        def replace_diagram(m):
            nonlocal diagram_count
            diagram_count += 1
            key = f'WIKIDIAGRAM{diagram_count:04}'
            diagrams[key] = render_diagram(m[1], m[2], diagram_count)
            return '\n\n' + key + '\n\n'

        body = re.sub(r'\\begin\{(tikzcd|tikzpicture)\}([\s\S]*?)\\end\{\1\}', replace_diagram, body)
        body = re.sub(r'\\(?:begin|end)\{figure\}(?:\[[^]]*\])?', '', body)
        body = body.replace(r'\centering', '')

        def replace_ref(m):
            key = f'WIKIREF{len(refs):04}'
            target = labels.get((section['sourceId'], m[1]))
            if target:
                refs[key] = (f'<a class="cross-reference" href="#{target["id"]}" '
                             f'title="{TYPES[target["kind"]]} {target["number"]}">{target["number"] or html.escape(m[1])}</a>')
            else:
                broken_refs.append(dict(section=section['id'], label=m[1]))
                refs[key] = html.escape(m[1])
            return key

        body = re.sub(r'\\(?:eqref|ref)\{([^}]+)\}', replace_ref, body)
        body = re.sub(r'\\label\{[^}]*\}', '', body)
        preamble = preambles[section['sourceId']]
        doc = preamble + r'\begin{document}\section{' + section['title'] + '}\n' + body + r'\end{document}'
        converted = convert(doc)
        converted = re.sub(r'<h\d[^>]*>[\s\S]*?</h\d>', '', converted, count=1).strip()
        cursor = iter(section['blocks'])

        def decorate(m):
            block = next(cursor)
            if block['kind'] != m[1]:
                raise ValueError(f"Block order mismatch in {section['id']}: {block['kind']} / {m[1]}")
            kind, content = block['kind'], m[2]
            heading = re.match(r'^\s*<p><(?:strong|em)>([\s\S]*?)</(?:strong|em)>[\s.]*', content)
            subtitle = ''
            if heading:
                if kind not in ('proof', 'remark'):
                    subtitle = re.sub(r'^[A-Za-z]+\s+[\d.]+\s*', '', heading[1])
                content = '<p>' + content[heading.end():]
            if subtitle:
                block['title'] = plain(subtitle).strip('()')
            block['excerpt'] = plain(content)[:240]
            title = TYPES[kind]
            title += (' ' + block['number']) if block['number'] else ''
            if kind == 'proof':
                if not plain(content).strip('□◻∎ \t\r\n'):
                    block['sourceEmpty'] = True
                    content = '<p class="source-gap">Source note: this proof block is empty in the original.</p>'
                    block['excerpt'] = 'This proof block is empty in the original source.'
                return (f'<details class="note-block proof" id="{block["id"]}"><summary>{title}'
                        f'<span>Expand {title.lower()}</span></summary><div class="proof-body">{content}</div></details>')
            return (f'<section class="note-block {kind}" id="{block["id"]}"><header><div>'
                    f'<span class="block-kind">{title}</span>' + (' <span class="block-title">' + subtitle + '</span>' if subtitle else '')
                    + f'</div><a href="#{block["id"]}" class="block-anchor" aria-label="Link to {title}">#</a></header>{content}</section>')

        converted = re.sub(r'<div class="(' + '|'.join(TYPES) + r')">([\s\S]*?)</div>', decorate, converted)
        remaining = list(cursor)
        if remaining:
            raise ValueError(f"Missing blocks in {section['id']}: {remaining}")
        def diagram_paragraph(m):
            content = m[1]
            if 'WIKIDIAGRAM' not in content:
                return m[0]
            # Block figures cannot be children of a paragraph or an emphasis
            # wrapper. Pandoc sometimes groups consecutive figure placeholders.
            content = re.sub(r'</?em>', '', content)
            if re.fullmatch(r'\s*WIKIDIAGRAM\d+\s*', content):
                return content.strip()
            return '<div class="diagram-context">' + content + '</div>'
        converted = re.sub(r'<p>([\s\S]*?)</p>', diagram_paragraph, converted)
        for key, value in diagrams.items():
            converted = re.sub(r'<p>\s*(?:<em>)?' + key + r'(?:</em>)?\s*</p>', lambda _: value, converted)
            # Adjacent diagrams can share a Pandoc paragraph with a line break.
            converted = converted.replace(key, value)
        for key, value in refs.items():
            converted = converted.replace(key, value)
        if re.search(r'WIKIDIAGRAM|WIKIREF', converted):
            raise ValueError('Unresolved placeholder in ' + section['id'])
        section['html'] = converted
        section['searchText'] = plain(converted)
        section['terms'] = list(dict.fromkeys(plain(t) for t in section['terms'] if len(t) < 100))
        section.update(meta.get(section['id'], {}))
        for key, default in [('titleEn', section['title']), ('summary', ''), ('keyPoints', []),
                             ('keywords', []), ('related', [])]:
            section.setdefault(key, default)
        for a, b in bridges:
            if section['id'] in (a, b):
                other = b if section['id'] == a else a
                if other not in section['related']:
                    section['related'].append(other)
        section['issues'] = [issue for issue in issues if issue.get('section') == section['id']]
        print(section['id'], len(converted), len(section['blocks']), flush=True)

    sources = []
    for spec in SOURCES:
        src = source_texts[spec['id']]
        sources.append(dict(id=spec['id'], title=spec['title'], course=spec['course'], term=spec['term'],
                            author='Juhyeok Choi', lecturer=spec.get('lecturer', ''), path=spec['path'],
                            file=Path(spec['path']).name, lines=src.count('\n') + 1,
                            sha256=hashlib.sha256((ROOT / spec['path']).read_bytes()).hexdigest()))
    for chapter in chapters:
        chapter['count'] = sum(s['chapterNo'] == chapter['n'] for s in sections)
    data = dict(sections=sections, chapters=chapters, sources=sources, stats=dict(stats),
                diagramCount=diagram_count, issues=issues)
    (DIST / 'data.js').write_text('window.WIKI_DATA=' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + ';\n', encoding='utf-8')
    shutil.copytree(ROOT / 'source', DIST / 'source', dirs_exist_ok=True)
    for name in ('index.html', 'app.js', 'style.css', 'diagram-layout.js'):
        file = ROOT / 'web' / name
        if file.exists():
            shutil.copyfile(file, DIST / name)
    report = dict(sections=len(sections), chapters=len(chapters), blocks=dict(stats), diagrams=diagram_count,
                  brokenRefs=broken_refs, metadataCount=len(meta), issues=len(issues), warnings=conversion_warnings)
    (WORK / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (WORK / 'sections.json').write_text(json.dumps(sections, ensure_ascii=False, indent=2), encoding='utf-8')
    if broken_refs:
        raise ValueError(broken_refs)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
