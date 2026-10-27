"""Compile separately authored supplements without renumbering lecture sources."""
from collections import Counter
import hashlib
import html
import json
from pathlib import Path
import re
import shutil

KINDS = ('definition', 'theorem', 'lemma', 'proposition', 'corollary', 'example', 'remark', 'proof')


def load_editorial(root, dist, sections, chapters, convert, preamble, plain, mask_comments):
    directory = root / 'content/editorial'
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    entries = []
    for name in manifest['includes']:
        entries.extend(json.loads((directory / name).read_text(encoding='utf-8')))
    by_id = {s['id']: s for s in sections}
    seen, statistics = set(), Counter({k: 0 for k in KINDS})
    pending, manuscripts = [], []
    for spec in entries:
        path = (root / spec['bodyPath']).resolve()
        if not path.is_relative_to(directory.resolve()) or path.suffix != '.tex':
            raise ValueError('Editorial manuscript must be a TeX file in content/editorial')
        raw = path.read_text(encoding='utf-8')
        body = mask_comments(raw)
        runtime_path = 'editorial/' + path.relative_to(directory).as_posix()
        is_page = spec['mode'] == 'page'
        section_id = spec['id'] if is_page else spec['hostSectionId']
        if is_page and ('--' in section_id or section_id in by_id):
            raise ValueError('Invalid editorial section ID: ' + section_id)
        anchor = section_id if is_page else section_id + '--ed-' + spec['id']
        if anchor in seen:
            raise ValueError('Duplicate editorial entry: ' + anchor)
        seen.add(anchor)
        blocks, count = [], 0
        pattern = r'\\begin\{(' + '|'.join(KINDS) + r')\}(?:\[([^\]]*)\])?\s*\\label\{([\w-]+)\}'
        matches = list(re.finditer(pattern, body))
        if len(matches) != len(re.findall(r'\\begin\{(?:' + '|'.join(KINDS) + r')\}', body)):
            raise ValueError('Every editorial statement/proof needs an immediate semantic label: ' + str(path))
        for m in matches:
            kind, title, label = m.groups()
            if kind not in ('proof', 'remark'):
                count += 1
            number = spec['number'] + '.' + str(count) if kind not in ('proof', 'remark') else ''
            blocks.append(dict(id=anchor + '--' + label, kind=kind, number=number,
                               title=title or '', excerpt='', origin='editorial', sourceId='editorial',
                               bodyPath=runtime_path))
            statistics[kind] += 1
        if len({b['id'] for b in blocks}) != len(blocks):
            raise ValueError('Duplicate editorial semantic label: ' + str(path))
        references = {}
        def link(m):
            key = 'WIKIEDREF' + str(len(references)) + 'END'
            references[key] = ('<a class="cross-reference" href="#' + html.escape(m[1], quote=True)
                               + '">' + html.escape(m[2]) + '</a>')
            return key
        body = re.sub(r'\\wikilink\{([^{}]+)\}\{([^{}]+)\}', link, body)
        if r'\wikilink' in body or re.search(r'\\(?:eqref|ref)\{', body):
            raise ValueError('Use explicit wikilink targets in editorial manuscripts: ' + str(path))
        body = re.sub(r'\\label\{[^}]*\}', '', body)
        rendered = convert(preamble + r'\begin{document}' + '\n' + body + r'\end{document}').strip()
        cursor = iter(blocks)
        def decorate(m):
            block = next(cursor)
            kind, content = m[1], m[2]
            if block['kind'] != kind:
                raise ValueError('Editorial block order mismatch: ' + str(path))
            heading = re.match(r'^\s*<p><(?:strong|em)>([\s\S]*?)</(?:strong|em)>[\s.]*', content)
            subtitle = ''
            if heading:
                if kind not in ('proof', 'remark'):
                    subtitle = re.sub(r'^[A-Za-z]+\s+[\d.]+\s*', '', heading[1])
                content = '<p>' + content[heading.end():]
            block['title'] = plain(subtitle).strip('()') if subtitle else block['title']
            block['excerpt'] = plain(content)[:240]
            title = kind.title() + (' ' + block['number'] if block['number'] else '')
            if not plain(content).strip():
                raise ValueError('Empty editorial block: ' + block['id'])
            if kind == 'proof':
                return (f'<details class="note-block proof editorial-block" id="{block["id"]}"><summary>{title}'
                        f'<span>Expand proof</span></summary><div class="proof-body">{content}</div></details>')
            return (f'<section class="note-block {kind} editorial-block" id="{block["id"]}"><header><div>'
                    f'<span class="block-kind">{title}</span>'
                    + (' <span class="block-title">' + subtitle + '</span>' if subtitle else '')
                    + f'</div><a href="#{block["id"]}" class="block-anchor" aria-label="Link to {title}">#</a></header>{content}</section>')
        rendered = re.sub(r'<div class="(' + '|'.join(KINDS) + r')">([\s\S]*?)</div>', decorate, rendered)
        if list(cursor):
            raise ValueError('Missing rendered editorial blocks: ' + str(path))
        for key, value in references.items():
            rendered = rendered.replace(key, value)
        entry = dict(id=anchor, titleEn=spec['titleEn'], number=spec['number'],
                     summary=spec.get('summary', ''), html=rendered, blocks=blocks, bodyPath=runtime_path)
        if is_page:
            section = dict(id=section_id, title=spec['titleEn'], titleEn=spec['titleEn'],
                           contentKind='editorial', chapterNo=spec['chapterNo'],
                           chapter=chapters[spec['chapterNo'] - 1]['title'], number=spec['number'],
                           sourceNumber=spec['number'], sourceId='editorial', course=spec['course'],
                           body=raw, bodyPath=runtime_path, html=rendered, blocks=blocks,
                           searchText=plain(rendered), terms=[], summary=spec['summary'],
                           keyPoints=spec['keyPoints'], keywords=spec.get('keywords', []),
                           related=spec.get('related', []), issues=[])
            pending.append((spec['insertAfter'], section))
            by_id[section_id] = section
        else:
            host = by_id[section_id]
            host.setdefault('editorialEntries', []).append(entry)
            host.setdefault('editorialBlocks', []).extend(blocks)
            host['searchText'] += ' ' + spec['titleEn'] + ' ' + plain(rendered)
            for related in spec.get('related', []):
                if related not in host['related'] and related != host['id']:
                    host['related'].append(related)
        destination = dist / runtime_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
        manuscripts.append(dict(path=runtime_path, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                                entryId=anchor))
    for after, section in pending:
        position = next(i for i, s in enumerate(sections) if s['id'] == after)
        sections.insert(position + 1, section)
        for target in section['related']:
            if target not in by_id:
                raise ValueError('Unknown related section: ' + target)
            if section['id'] not in by_id[target]['related']:
                by_id[target]['related'].append(section['id'])
    for section in sections:
        if section.get('editorialEntries'):
            section['editorialHtml'] = '\n'.join(e['html'] for e in section['editorialEntries'])
    return dict(statistics), manuscripts
