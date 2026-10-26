"""Check source coverage, portable links, provenance, and generated wiki structure."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
from html.parser import HTMLParser
from build_wiki import SOURCES, mask_comments

ROOT = Path(__file__).resolve().parent


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links = [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if attrs.get('href', '').startswith('#'):
            self.links.append(attrs['href'][1:])


def main():
    raw = (ROOT / 'dist/data.js').read_text(encoding='utf-8')
    data = json.loads(raw[len('window.WIKI_DATA='):].strip().removesuffix(';').replace('<\\/', '</'))
    sections, sources = data['sections'], {s['id']: s for s in data['sources']}
    errors, ids, links = [], [], []
    kinds, source_counts = Counter(), {}
    for section in sections:
        parser = Links()
        parser.feed(section['html'])
        ids.append(section['id'])
        ids.extend(parser.ids)
        links.extend(parser.links)
        links.extend(section['related'])
        blocks = section['blocks']
        expected = Counter(re.findall(r'\\begin\{(definition|theorem|lemma|proposition|corollary|example|remark|proof|problem)\}', mask_comments(section['body'])))
        actual = Counter(b['kind'] for b in blocks)
        if actual != expected:
            errors.append(f"Block coverage: {section['id']}: {expected} / {actual}")
        kinds.update(actual)
        if any(b['id'] not in parser.ids for b in blocks):
            errors.append('Missing statement anchor: ' + section['id'])
        if len(parser.ids) != len(set(parser.ids)):
            errors.append('Duplicate HTML IDs: ' + section['id'])
        diagrams = len(re.findall(r'\\begin\{(?:tikzcd|tikzpicture)\}', mask_comments(section['body'])))
        if diagrams != section['html'].count('<figure class="note-diagram">'):
            errors.append('Diagram coverage: ' + section['id'])
        if not section['summary'] or not section['keyPoints']:
            errors.append('Missing English guide: ' + section['id'])
        if re.search('[가-힣]', section['titleEn'] + section['summary'] + section['html']):
            errors.append('Non-English rendered content: ' + section['id'])
        if re.search(r'WIKI(?:DIAGRAM|REF)\d', section['html']):
            errors.append('Unresolved placeholder: ' + section['id'])
        if section['sourceId'] not in sources:
            errors.append('Unknown source: ' + section['id'])
    if len(ids) != len(set(ids)):
        errors.append('Duplicate global IDs')
    for target in links:
        if target not in set(ids):
            errors.append('Broken internal link: ' + target)
    for spec in SOURCES:
        source = sources[spec['id']]
        file = ROOT / source['path']
        bundled = ROOT / 'dist' / source['path']
        if file.read_bytes() != bundled.read_bytes():
            errors.append('Changed downloadable source: ' + spec['id'])
        if hashlib.sha256(file.read_bytes()).hexdigest() != source['sha256']:
            errors.append('Source hash mismatch: ' + spec['id'])
        text = mask_comments(file.read_text(encoding='utf-8'))
        expected = len(re.findall(r'\\section\{', text))
        actual = sum(s['sourceId'] == spec['id'] for s in sections)
        source_counts[spec['id']] = actual
        if expected != actual:
            errors.append(f"Section coverage: {spec['id']}: {expected} / {actual}")
    if dict(kinds) != data['stats']:
        errors.append('Statement statistics mismatch')
    index = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
    for attr, value in re.findall(r'(src|href)="([^"]+)"', index):
        if not value.startswith(('#', 'data:', 'http')) and not (ROOT / 'dist' / value).exists():
            errors.append('Missing portable asset: ' + value)
    report = dict(sections=len(sections), sources=source_counts, blocks=dict(kinds),
                  diagrams=data['diagramCount'], links=len(links), errors=errors)
    (ROOT / '_work/validation-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
