"""Audit source-to-SVG preservation for every supplied course diagram."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import sys

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parent
sys.path.insert(0, str(PROJECT))
from diagrams import parse_commutative, render
from build_wiki import SOURCES


class FigureAudit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.nodes = 0
        self.edges = 0
        self.command_count = 0
        self.marker_ids = set()
        self.marker_refs = []
        self.has_accessible_name = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'diagram-node' in attrs.get('class', '').split():
            self.nodes += 1
        if 'data-from' in attrs:
            self.edges += 1
        if 'data-command-count' in attrs:
            self.command_count = int(attrs['data-command-count'])
        if tag == 'marker':
            self.marker_ids.add(attrs['id'])
        for key in ('marker-start', 'marker-end'):
            if key in attrs:
                self.marker_refs.append(attrs[key][5:-1])
        if attrs.get('role') == 'group' and attrs.get('aria-label'):
            self.has_accessible_name = True


def main():
    files = [PROJECT / source['path'] for source in SOURCES]
    report = {'files': [], 'totals': Counter(), 'missing_endpoint_nodes': []}
    index = 0
    for path in files:
        text = path.read_text(encoding='utf-8')
        count = Counter()
        for match in re.finditer(r'\\begin\{(tikzcd|tikzpicture)\}(.*?)\\end\{\1\}', text, re.S):
            kind, body = match.groups()
            index += 1
            picture = render(kind, body, index)
            check = FigureAudit()
            check.feed(picture)
            assert check.has_accessible_name, (path, index, 'missing accessible name')
            assert all(ref in check.marker_ids for ref in check.marker_refs), (path, index, 'dangling marker')
            count[kind] += 1
            if kind == 'tikzcd':
                rows, nodes, arrows = parse_commutative(body)
                source_arrows = len(re.findall(r'\\(?:arrow|ar)(?![A-Za-z])\s*\[', body))
                assert len(arrows) == source_arrows, (path, index, 'lost arrow declaration')
                assert check.nodes == len(nodes), (path, index, 'lost mathematical node')
                expected_edges = sum(2 if 'double' in a['pieces'] or 'equal' in a['pieces'] else 1 for a in arrows)
                assert check.edges == expected_edges, (path, index, 'lost SVG edge')
                positions = {(x, y) for x, y, _ in nodes}
                for arrow in arrows:
                    if (arrow['tx'], arrow['ty']) not in positions:
                        report['missing_endpoint_nodes'].append({
                            'source': str(path.relative_to(ROOT)), 'diagram': count[kind],
                            'arrow': arrow['options'], 'to': [arrow['tx'], arrow['ty']]})
                count['nodes'] += len(nodes)
                count['arrows'] += len(arrows)
                count['loops'] += sum(a['loop'] for a in arrows)
                count['double'] += sum('double' in a['pieces'] or 'equal' in a['pieces'] for a in arrows)
                count['mapsto'] += sum('mapsto' in a['pieces'] for a in arrows)
                count['hook'] += sum('hook' in a['pieces'] for a in arrows)
                count['shifted'] += sum('shift ' in a['options'] for a in arrows)
                count['bent'] += sum('bend ' in a['options'] for a in arrows)
            else:
                expected_commands = len(re.findall(r'\\draw\b', body))
                assert check.command_count == expected_commands, (path, index, 'lost geometric command')
                count['construction_commands'] += check.command_count
        report['files'].append({'source': str(path.relative_to(ROOT)), **count})
        report['totals'].update(count)

    # The exact parsing hazards observed in the Algebra II notes, plus nested
    # matrix row separators and a quoted label with both commas and brackets.
    specimen = r'''[row sep=tiny]
      R[x] \arrow[r, "{f(x,y),g[z]}"'] & \Hom{R[x]}{M}{A} \\
      {\begin{matrix}a&b\\c&d\end{matrix}} \arrow[r, mapsto] & N
    '''
    rows, nodes, arrows = parse_commutative(specimen)
    assert len(rows) == 2 and all(len(row) == 2 for row in rows)
    assert len(nodes) == 4 and len(arrows) == 2
    assert arrows[0]['label'] == '{f(x,y),g[z]}' and arrows[0]['swapped']
    assert nodes[1][2] == r'\Hom{R[x]}{M}{A}'
    assert r'\begin{matrix}a&b\\c&d\end{matrix}' in nodes[2][2]
    rendered = render('tikzcd', specimen, 'regression')
    assert 'marker-start="url(#barregression)"' in rendered
    assert 'g[z]' in rendered
    assert not report['missing_endpoint_nodes'], report['missing_endpoint_nodes']
    output = PROJECT / '_work' / 'diagram-audit.json'
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(report['totals'], ensure_ascii=True, sort_keys=True))
    print('All mathematical nodes, arrows, loops, and geometric commands preserved.')


if __name__ == '__main__':
    main()
