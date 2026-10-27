"""Regression checks for notation-safe, context-aware definition links."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import unittest

from definition_links import Linker, Tree, guide_markup, load_definitions

ROOT = Path(__file__).resolve().parent


def entry(term, target, **extra):
    return dict(term=term, target=target, aliases=[], sectionId=target.split('--')[0],
                chapterNo=1, sourceId='algebra1', **extra)


SECTION = dict(id='s03', chapterNo=1, sourceId='algebra1')


class Audit(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.text, self.links, self.stack = [], [], []
        self.feed(source)

    def handle_data(self, value):
        self.text.append(value)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            if 'a' in self.stack:
                raise AssertionError('Nested anchors')
            self.links.append(attrs)
        if tag not in {'br', 'img', 'hr', 'wbr', 'input', 'meta', 'link', 'col'}:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if self.stack.pop() != tag:
            raise AssertionError('Unbalanced anchors or source tags')

    def handle_startendtag(self, tag, attrs):
        pass


class DefinitionLinks(unittest.TestCase):
    def setUp(self):
        self.linker = Linker([
            entry('group', 's02--b001',),
            dict(entry('normal subgroup', 's02--b002'), aliases=['normal subgroups']),
            dict(entry('p-group', 's08--b001'), aliases=['p-groups']),
            entry('module', 'a2s07--b001'),
            dict(entry('left module', 'a2s07--b001'), aliases=['left R-module']),
        ])

    def link(self, source, section=SECTION):
        output, used, count = self.linker.link(source, section)
        self.assertEqual(''.join(Audit(source).text), ''.join(Audit(output).text))
        Tree(output)  # strict nesting, including emphasis split by links
        return output, used, count

    def test_longest_alias_and_word_boundaries(self):
        result, used, n = self.link('<p>Normal subgroups of a group, subgroup and groupoid.</p>')
        self.assertEqual(n, 2)
        self.assertIn('>Normal subgroups</a>', result)
        self.assertEqual({d['term'] for d in used}, {'normal subgroup', 'group'})

    def test_inline_emphasis_and_entities(self):
        result, _, n = self.link('<p>A <em>normal</em>&nbsp;subgroup &amp; a group.</p>')
        self.assertEqual(n, 2)
        self.assertIn('><em>normal</em>&nbsp;subgroup</a>', result)
        self.assertIn('&amp;', result)

    def test_math_bridge_keeps_formula_exact(self):
        source = r'<p>A <span class="math inline">\(p\)</span>-group and a left <span class="math inline">\(R\)</span>-module.</p>'
        result, _, n = self.link(source)
        self.assertEqual(n, 2)
        self.assertEqual(re.findall(r'<span class="math inline">.*?</span>', source),
                         re.findall(r'<span class="math inline">.*?</span>', result))

    def test_formula_code_diagrams_and_existing_links_opaque(self):
        source = (r'<p><a href="#s02">group</a> <span class="math inline">\(\text{group}\)</span> '
                  '<code>group</code> group</p><pre>group</pre>'
                  '<figure class="note-diagram"><svg><text>group</text></svg><figcaption>group</figcaption></figure>')
        result, _, n = self.link(source)
        self.assertEqual(n, 1)
        self.assertIn('<a href="#s02">group</a>', result)
        self.assertIn('<pre>group</pre>', result)
        self.assertIn('<svg><text>group</text></svg>', result)

    def test_self_links_and_repetitions(self):
        source = '<section id="s02--b001"><p>A group is a group.</p></section><p>group group</p>'
        result, _, n = self.link(source, dict(SECTION, id='s02'))
        self.assertEqual(n, 1)
        self.assertIn('<p>A group is a group.</p>', result)

    def test_contexts_disambiguate_and_unresolved_ties_are_skipped(self):
        self.linker = Linker([
            dict(entry('torsion', 's02--b001'), contexts=[1, 3]),
            dict(entry('torsion', 'a2s07--b001'), contexts=[5, 6]),
        ])
        a, _, _ = self.link('<p>torsion</p>')
        b, _, _ = self.link('<p>torsion</p>', dict(SECTION, chapterNo=5))
        self.assertIn('href="#s02--b001"', a)
        self.assertIn('href="#a2s07--b001"', b)
        self.linker = Linker([entry('foo', 's01--b001'), entry('foo', 's02--b001')])
        self.assertEqual(self.link('<p>foo</p>')[2], 0)

    def test_unicode_punctuation_and_whitespace(self):
        result, _, n = self.link('<p>p\u2011groups; normal\n subgroups; pre-group.</p>')
        self.assertEqual(n, 2)
        self.assertIn('p\u2011groups</a>', result)

    def test_guides_escape_html_and_protect_dollar_formulae(self):
        original = 'A group < a module; $\\text{group}$ and $p$-groups.'
        markup = guide_markup(original)
        result, _, n = self.link(markup)
        self.assertEqual(n, 3)
        self.assertIn('&lt;', result)
        self.assertIn('$\\text{group}$</span>', result)
        self.assertIn('>$p$</span>-groups</a>', result)
        self.assertEqual(''.join(Audit(result).text), original)

    def test_published_data_targets_and_balanced_links(self):
        raw = (ROOT / 'dist/data.js').read_text(encoding='utf-8')
        data = json.loads(raw[len('window.WIKI_DATA='):].strip().removesuffix(';').replace('<\\/', '</'))
        definitions = load_definitions(ROOT, data['sections'])
        self.assertEqual(len(definitions), len(data['definitions']))
        all_targets = {b['id'] for s in data['sections'] for b in s['blocks']}
        all_targets.update(s['id'] + '--original' for s in data['sections'])
        count = 0
        for section in data['sections']:
            parsed = Audit(section['html'])
            Tree(section['html'])
            actual = {(d['term'], d['target']) for d in section['definitionLinks']}
            self.assertTrue(all(target in all_targets for _, target in actual))
            for a in parsed.links:
                if a.get('class') == 'definition-link':
                    self.assertIn(a['data-definition'], all_targets)
                    self.assertEqual(a['href'], '#' + a['data-definition'])
                    count += 1
        self.assertGreater(count, 1000)


if __name__ == '__main__':
    unittest.main()
