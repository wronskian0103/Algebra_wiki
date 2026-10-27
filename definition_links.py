"""Link curated algebra terms to their source definitions without changing notation.

Only prose is matched. Existing links, code, diagrams and compound formulae are
opaque; a single inline math letter may participate in a term such as p-group.
Text and raw formula markup are retained. Inline wrappers may be split around a
link that crosses an emphasis boundary, keeping the resulting HTML well formed.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from html import escape, unescape
from html.parser import HTMLParser
import json
import re


VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
INLINE = set('em strong b i small span sup sub abbr mark s u'.split())
PROTECTED = set('a header summary pre code script style textarea svg figure figcaption button'.split())
PUNCTUATION = str.maketrans({'\u2010': '-', '\u2011': '-', '\u2013': '-', '\u2212': '-',
                            '\u2018': "'", '\u2019': "'"})
ENTITY = re.compile(r'&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][A-Za-z\d]+);?')


def normalize(value):
    return re.sub(r'\s+', ' ', value.translate(PUNCTUATION)).strip().casefold()


@dataclass
class Node:
    tag: str = ''
    attrs: dict = field(default_factory=dict)
    start: str = ''
    end: str = ''
    children: list = field(default_factory=list)
    raw: str = ''

    def html(self):
        return self.raw if not self.tag else self.start + ''.join(c.html() for c in self.children) + self.end

    def clone(self, children):
        return Node(self.tag, self.attrs, self.start, self.end, children)


class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=False)
        self.root = Node('root')
        self.stack = [self.root]
        self.feed(html)
        self.close()
        if len(self.stack) != 1:
            raise ValueError('Unbalanced source HTML')

    def append_raw(self, raw):
        children = self.stack[-1].children
        if children and not children[-1].tag:
            children[-1].raw += raw
        else:
            children.append(Node(raw=raw))

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.get_starttag_text())
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, dict(attrs), self.get_starttag_text()))

    def handle_endtag(self, tag):
        if self.stack[-1].tag != tag:
            raise ValueError(f'Unbalanced source HTML: {self.stack[-1].tag} / {tag}')
        self.stack.pop().end = '</' + tag + '>'

    def handle_data(self, data):
        self.append_raw(data)

    def handle_entityref(self, name):
        self.append_raw('&' + name + ';')

    def handle_charref(self, name):
        self.append_raw('&#' + name + ';')

    def handle_comment(self, data):
        # Comments are opaque and cannot become part of an English term.
        self.stack[-1].children.append(Node('comment', start='<!--' + data + '-->'))


def math_letter(node):
    if node.tag != 'span' or not {'math', 'inline'} <= set(node.attrs.get('class', '').split()):
        return None
    raw = unescape(''.join(c.html() for c in node.children)).strip()
    if raw.startswith(r'\(') and raw.endswith(r'\)'):
        raw = raw[2:-2]
    elif raw.startswith('$') and raw.endswith('$'):
        raw = raw[1:-1]
    else:
        return None
    m = re.fullmatch(r'\s*(?:([A-Za-z])|\\mathbb\{([NZQRC])\})\s*', raw)
    return (m[1] or m[2]) if m else None


def opaque(node):
    classes = set(node.attrs.get('class', '').split())
    return node.tag in PROTECTED or bool(classes & {'math', 'diagram', 'note-diagram', 'diagram-source'})


def transparent(node):
    return node.tag in INLINE and not opaque(node) and not node.attrs.get('id')


def visible(node):
    if not node.tag:
        return unescape(node.raw)
    letter = math_letter(node)
    if letter:
        return letter
    if transparent(node):
        return ''.join(visible(c) for c in node.children)
    return '\ufffc'


def text_slice(raw, start, stop):
    """Slice decoded text while retaining original entity spellings."""
    spans, cursor = [], 0
    for m in ENTITY.finditer(raw):
        spans.extend((i, i + 1) for i in range(cursor, m.start()))
        decoded = unescape(m[0])
        spans.extend([(m.start(), m.end())] * len(decoded))
        cursor = m.end()
    spans.extend((i, i + 1) for i in range(cursor, len(raw)))
    return raw[spans[start][0]:spans[stop - 1][1]] if start < stop else ''


def slice_forest(nodes, start, stop):
    result, offset = [], 0
    for node in nodes:
        length = len(visible(node))
        lo, hi = max(0, start - offset), min(length, stop - offset)
        if lo < hi:
            if lo == 0 and hi == length:
                result.append(node)
            elif not node.tag:
                result.append(Node(raw=text_slice(node.raw, lo, hi)))
            elif transparent(node):
                result.append(node.clone(slice_forest(node.children, lo, hi)))
            else:
                raise ValueError('Attempt to split protected markup')
        offset += length
    return result


def load_definitions(root, sections):
    by_id = {s['id']: s for s in sections}
    blocks = {b['id']: (s, b) for s in sections for b in [*s['blocks'], *s.get('editorialBlocks', [])]}
    result = []
    registries = [*sorted((root / 'content').glob('definition-terms-*.json')),
                  *sorted((root / 'content/editorial').glob('definitions-*.json'))]
    for path in registries:
        for entry in json.loads(path.read_text(encoding='utf-8')):
            term, target = entry['term'], entry['target']
            if target in blocks:
                section, block = blocks[target]
            elif target.endswith('--original') and target.split('--')[0] in by_id:
                section = by_id[target.split('--')[0]]
                block = dict(kind='section', number=section['number'])
            else:
                raise ValueError(f'Unknown definition destination: {term} / {target}')
            result.append(dict(entry, sectionId=section['id'], chapterNo=section['chapterNo'],
                               sourceId=block.get('sourceId', section['sourceId']), kind=block['kind'], number=block['number']))
    return result


class Linker:
    def __init__(self, definitions):
        self.definitions = definitions
        self.by_alias = defaultdict(list)
        for d in definitions:
            for alias in dict.fromkeys([d['term'], *d.get('aliases', [])]):
                self.by_alias[normalize(alias)].append(d)
        aliases = sorted(self.by_alias, key=lambda a: (-len(a), a))
        patterns = [r'\s+'.join(re.escape(word) for word in alias.split()) for alias in aliases]
        self.pattern = re.compile(r'(?<![\w-])(?:' + '|'.join(patterns) + r')(?![\w-])', re.I)

    def resolve(self, alias, section):
        candidates = [d for d in self.by_alias[normalize(alias)]
                      if (not d.get('contexts') or section['chapterNo'] in d['contexts'])
                      and section['id'] not in d.get('excludeSections', [])]
        if not candidates:
            return None
        def score(d):
            return (bool(d.get('contexts')), d['sectionId'] == section['id'],
                    d['chapterNo'] == section['chapterNo'], d['sourceId'] == section['sourceId'],
                    not d['sourceId'].startswith(('projective-', 'integral-')))
        best = max(score(d) for d in candidates)
        winners = [d for d in candidates if score(d) == best]
        if len({d['target'] for d in winners}) != 1:
            return None  # Never choose between indistinguishable meanings by file order.
        return winners[0]

    def link(self, source, section, skip_original_self=True):
        tree = Tree(source)
        used, count = {}, 0

        def link_run(nodes, block):
            nonlocal count
            text = ''.join(visible(n) for n in nodes)
            matched, seen = [], set()
            for m in self.pattern.finditer(text.translate(PUNCTUATION)):
                d = self.resolve(m[0], section)
                if not d or d['target'] == block or (skip_original_self and d['target'] == section['id'] + '--original'):
                    continue
                key = (d['term'], d['target'])
                if key in seen:
                    continue
                seen.add(key)
                used[key] = dict(term=d['term'], target=d['target'])
                matched.append((m.start(), m.end(), d))
            if not matched:
                return nodes
            result, cursor = [], 0
            for start, stop, d in matched:
                result.extend(slice_forest(nodes, cursor, start))
                title = escape('Definition of ' + d['term'], quote=True)
                target = escape(d['target'], quote=True)
                anchor = f'<a class="definition-link" data-definition="{target}" href="#{target}" title="{title}">'
                result.append(Node('a', {'class': 'definition-link'}, anchor, '</a>', slice_forest(nodes, start, stop)))
                count += 1
                cursor = stop
            result.extend(slice_forest(nodes, cursor, len(text)))
            return result

        def walk(parent, block=''):
            block = parent.attrs.get('id', block)
            children, run = [], []
            for node in parent.children:
                # Existing anchors/formulae are inline opaque tokens so a phrase
                # can never accidentally join the prose on either side of them.
                if not node.tag or transparent(node) or node.tag in INLINE or node.tag in {'a', 'code', 'br', 'wbr'}:
                    run.append(node)
                else:
                    children.extend(link_run(run, block))
                    run = []
                    if not opaque(node):
                        walk(node, block)
                    children.append(node)
            children.extend(link_run(run, block))
            parent.children = children

        walk(tree.root)
        output = ''.join(n.html() for n in tree.root.children)
        return output, sorted(used.values(), key=lambda d: d['term'].casefold()), count


def guide_markup(text):
    """Escape editorial prose and mark formulae opaque before term matching."""
    parts = re.split(r'(\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])', text)
    return ''.join(('<span class="math ' + ('display' if part.startswith(r'\[') else 'inline') + '">'
                    + escape(part) + '</span>') if i % 2 else escape(part)
                   for i, part in enumerate(parts))


def add_definition_links(root, sections):
    definitions = load_definitions(root, sections)
    linker, count, guide_count, editorial_count, linked_sections = Linker(definitions), 0, 0, 0, 0
    for section in sections:
        section['html'], section['definitionLinks'], n = linker.link(section['html'], section)
        if section.get('contentKind') == 'editorial':
            editorial_count += n
        else:
            count += n
        used = {(d['term'], d['target']): d for d in section['definitionLinks']}
        for entry in section.get('editorialEntries', []):
            entry['html'], references, m = linker.link(entry['html'], section)
            used.update({(d['term'], d['target']): d for d in references})
            editorial_count += m
        if section.get('editorialEntries'):
            section['editorialHtml'] = '\n'.join(e['html'] for e in section['editorialEntries'])
        guide_html = []
        section_guide_count = 0
        for text in [section['summary'], *section['keyPoints']]:
            rendered, references, m = linker.link(guide_markup(text), section, skip_original_self=False)
            guide_html.append(rendered)
            used.update({(d['term'], d['target']): d for d in references})
            section_guide_count += m
        section['summaryHtml'], section['keyPointsHtml'] = guide_html[0], guide_html[1:]
        section['definitionLinks'] = sorted(used.values(), key=lambda d: d['term'].casefold())
        guide_count += section_guide_count
        linked_sections += bool(n + section_guide_count or section.get('editorialEntries'))
    return definitions, dict(terms=len(definitions), links=count + guide_count + editorial_count, sourceLinks=count,
                             guideLinks=guide_count, editorialLinks=editorial_count, sections=linked_sections)
