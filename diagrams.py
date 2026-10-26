"""Reconstruct the course's TikZ diagrams as accessible HTML and SVG.

This is deliberately a renderer for the constructs in the supplied notes, not a
general TikZ interpreter.  The original TikZ remains available under every
figure.  Balanced parsing matters here: node expressions and quoted arrow
labels can contain brackets, commas, and even their own matrix environments.
"""
import ast
import html
import math
import operator
import re


def mathnode(value):
    value = value.strip()
    if value.startswith('$') and value.endswith('$'):
        value = value[1:-1]
    return r'\(' + html.escape(value) + r'\)'


def _uncomment(source):
    return re.sub(r'(?<!\\)(?:\\\\)*%[^\n]*',
                  lambda m: m[0][:m[0].index('%')], source)


def _group(source, start, opener='[', closer=']'):
    """Return the interior and end position of a balanced TeX group."""
    if start >= len(source) or source[start] != opener:
        raise ValueError('Expected ' + opener)
    depth, braces, quoted, i = 1, 0, False, start + 1
    while i < len(source):
        char = source[i]
        if char == '\\':
            # Escaped delimiters are ordinary TeX characters, not grouping.
            i += 2
            continue
        if char == '"' and braces == 0:
            quoted = not quoted
        elif not quoted:
            if opener != '{' and char == '{':
                braces += 1
            elif opener != '{' and char == '}':
                braces = max(0, braces - 1)
            elif braces == 0 and char == opener:
                depth += 1
            elif braces == 0 and char == closer:
                depth -= 1
                if depth == 0:
                    return source[start + 1:i], i + 1
        i += 1
    raise ValueError('Unclosed TeX group: ' + source[start:start + 80])


def _split_top(source, separator):
    """Split only outside braces, brackets, quotes and nested environments."""
    parts, start, i = [], 0, 0
    braces = brackets = environments = 0
    quoted = False
    while i < len(source):
        if not braces and not brackets and not quoted and not environments:
            if source.startswith(separator, i):
                parts.append(source[start:i])
                i += len(separator)
                # TikZ-CD allows a row-spacing argument after a row break.
                if separator == r'\\':
                    while i < len(source) and source[i].isspace():
                        i += 1
                    if i < len(source) and source[i] == '[':
                        _, i = _group(source, i)
                start = i
                continue
        char = source[i]
        if char == '\\':
            env = re.match(r'\\(begin|end)\{[^{}]+\}', source[i:])
            if env:
                environments += 1 if env[1] == 'begin' else -1
                environments = max(0, environments)
                i += len(env[0])
            else:
                i += 2
            continue
        if char == '"' and not braces:
            quoted = not quoted
        elif not quoted:
            if char == '{':
                braces += 1
            elif char == '}':
                braces = max(0, braces - 1)
            elif not braces and char == '[':
                brackets += 1
            elif not braces and char == ']':
                brackets = max(0, brackets - 1)
        i += 1
    parts.append(source[start:])
    return parts


def _cell(source):
    """Separate a cell's mathematical node from its arrow declarations."""
    labels, arrows, cursor = [], [], 0
    for match in re.finditer(r'\\(?:arrow|ar)(?![A-Za-z])\s*\[', source):
        if match.start() < cursor:
            continue
        options, end = _group(source, match.end() - 1)
        labels.append(source[cursor:match.start()])
        arrows.append(options)
        cursor = end
    labels.append(source[cursor:])
    return ''.join(labels).strip(), arrows


def _arrow(options, x, y):
    pieces = [part.strip() for part in _split_top(options, ',')]
    direction = next((p for p in pieces if re.fullmatch('[rlud]+', p)), '')
    label, swapped = '', False
    for piece in pieces:
        if piece.startswith('"'):
            # Braces can contain literal quotes; only a top-level quote closes
            # a TikZ-CD label.  Keep primes inside a formula intact.
            braces, i = 0, 1
            while i < len(piece):
                if piece[i] == '\\':
                    i += 2
                    continue
                if piece[i] == '{':
                    braces += 1
                elif piece[i] == '}':
                    braces = max(0, braces - 1)
                elif piece[i] == '"' and not braces:
                    label = piece[1:i]
                    swapped = piece[i + 1:].lstrip().startswith("'")
                    break
                i += 1
            break
    return {'x': x, 'y': y,
            'tx': x + direction.count('r') - direction.count('l'),
            'ty': y + direction.count('d') - direction.count('u'),
            'label': label, 'swapped': swapped, 'pieces': pieces,
            'options': options, 'loop': any(p.startswith('loop ') for p in pieces)}


def parse_commutative(source):
    """Expose the parsed topology so the source audit can verify every edge."""
    clean = _uncomment(source).strip()
    if clean.startswith('['):
        _, end = _group(clean, 0)
        clean = clean[end:]
    rows = [_split_top(row, '&') for row in _split_top(clean, r'\\') if row.strip()]
    nodes, arrows = [], []
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            label, declarations = _cell(cell)
            if label:
                nodes.append((x, y, label))
            arrows.extend(_arrow(opts, x, y) for opts in declarations)
    return rows, nodes, arrows


def _node_width(value):
    """Conservative pre-MathJax width, used to space neighboring columns."""
    commands = re.findall(r'\\([A-Za-z]+)', value)
    plain = re.sub(r'\\[A-Za-z]+\*?', 'x', value)
    plain = re.sub(r'[{}_$^]', '', plain)
    plain = re.sub(r'\s+', ' ', plain)
    # Course macros such as Hom render several more glyphs than their name's
    # replacement character.  Delimiter commands render no additional glyphs.
    extra = sum(4 if c in ('Hom', 'End', 'Aut', 'Gal') else
                2 if c in ('mathrm', 'operatorname') else 0 for c in commands)
    return max(44, min(1000, (len(plain) + extra) * 7.1 + 18))


def _number_option(options, name, default=0):
    found = re.search(r'\b' + re.escape(name) + r'\s*(?:=\s*([\d.]+))?', options)
    return float(found[1]) if found and found[1] else default if found else 0


def _defs(index):
    return (
        f'<marker id="tip{index}" markerWidth="8" markerHeight="8" refX="7" '
        'refY="4" orient="auto" markerUnits="userSpaceOnUse">'
        '<path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor"/></marker>'
        f'<marker id="bar{index}" viewBox="-2 -6 4 12" markerWidth="4" '
        'markerHeight="12" refX="0" refY="0" orient="auto" '
        'markerUnits="userSpaceOnUse"><path d="M0,-5 V5" '
        'stroke="currentColor" fill="none"/></marker>'
        f'<marker id="hook{index}" viewBox="-2 -7 10 14" markerWidth="10" '
        'markerHeight="14" refX="5" refY="0" orient="auto" '
        'markerUnits="userSpaceOnUse"><path d="M5,-5 C-3,-5 -3,0 5,0" '
        'stroke="currentColor" fill="none"/></marker>'
    )


def commutative(source, index):
    rows, nodes, arrows = parse_commutative(source)
    if not rows:
        raise ValueError('Empty TikZ-CD diagram')
    columns = max(map(len, rows))
    node_map = {(x, y): label for x, y, label in nodes}
    widths = [max((_node_width(label) for x, _, label in nodes if x == col),
                  default=44) for col in range(columns)]
    centers = [max(105, widths[0] / 2 + 30)]
    for col in range(1, columns):
        centers.append(centers[-1] + max(220, (widths[col-1] + widths[col]) / 2 + 100))
    width = max(500, centers[-1] + max(105, widths[-1] / 2 + 30))
    top = 100 if any(a['loop'] for a in arrows) else 50
    row_step = 130
    height = max(190, top + (len(rows) - 1) * row_step + 50)

    def xy(x, y):
        # Directions in the notes land on matrix cells.  Retaining a useful
        # extrapolation also makes a malformed source visible to the audit.
        cx = centers[x] if 0 <= x < len(centers) else centers[0] + x * 220
        return cx, top + y * row_step

    def inset(x, y, ux, uy):
        if (x, y) not in node_map:
            return 6
        halfwidth = _node_width(node_map[x, y]) / 2 + 8
        return min(halfwidth / abs(ux) if ux else float('inf'),
                   22 / abs(uy) if uy else float('inf'))

    lines, labels, descriptions = [], [], []
    for arrow in arrows:
        x, y, tx, ty = (arrow[k] for k in ('x', 'y', 'tx', 'ty'))
        label, opts, pieces = arrow['label'], arrow['options'], arrow['pieces']
        a, b = xy(x, y), xy(tx, ty)
        keys = {p for p in pieces if not p.startswith('"')}
        double = 'double' in keys or 'equal' in keys
        marker = '' if 'dash' in keys or 'equal' in keys else f' marker-end="url(#tip{index})"'
        if 'mapsto' in keys:
            marker += f' marker-start="url(#bar{index})"'
        if 'hook' in keys:
            marker += f' marker-start="url(#hook{index})"'
        dash = ' stroke-dasharray="6 5"' if 'dashed' in keys else ''
        edge_data = f' data-from="{x},{y}" data-to="{tx},{ty}"'
        from_label = node_map.get((x, y), f'cell {x + 1},{y + 1}')
        to_label = node_map.get((tx, ty), f'cell {tx + 1},{ty + 1}')
        style_name = ('identity loop' if arrow['loop'] else 'equality' if double else
                      'inclusion' if 'hook' in keys else 'element map' if 'mapsto' in keys else
                      'unoriented edge' if 'dash' in keys else 'arrow')
        descriptions.append(f'{style_name} from {from_label} to {to_label}' +
                            (f', labelled {label}' if label else '') +
                            (', dashed' if 'dashed' in keys else ''))
        if arrow['loop']:
            # All supplied loops are above a node.  Keep them visible instead
            # of silently dropping the zero-length direction, as before.
            sx, sy, ex, ey = a[0] - 17, a[1] - 19, a[0] + 17, a[1] - 19
            path = f'M{sx},{sy} C{sx-70},{sy-80} {ex+70},{ey-80} {ex},{ey}'
            lines.append(f'<path d="{path}"{edge_data}{marker}{dash}/>')
            lx, ly = a[0], a[1] - 82
        else:
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dy)
            if not length:
                raise ValueError('Arrow has neither direction nor loop: ' + opts)
            ux, uy = dx / length, dy / length
            # (uy,-ux) is TikZ's left normal in downward-positive SVG space.
            nx, ny = uy, -ux
            shift = (_number_option(opts, 'shift left', .7) -
                     _number_option(opts, 'shift right', .7)) * 10
            bend = (_number_option(opts, 'bend left', 20) -
                    _number_option(opts, 'bend right', 20))
            si, ei = inset(x, y, ux, uy), inset(tx, ty, ux, uy)
            sx, sy = a[0] + ux * si + nx * shift, a[1] + uy * si + ny * shift
            ex, ey = b[0] - ux * ei + nx * shift, b[1] - uy * ei + ny * shift
            cx, cy = (sx + ex) / 2 + nx * bend * 2, (sy + ey) / 2 + ny * bend * 2
            for offset in (-2.5, 2.5) if double else (0,):
                ox, oy = nx * offset, ny * offset
                if bend:
                    edge = (f'<path d="M{sx+ox},{sy+oy} Q{cx+ox},{cy+oy} '
                            f'{ex+ox},{ey+oy}"')
                else:
                    edge = f'<line x1="{sx+ox}" y1="{sy+oy}" x2="{ex+ox}" y2="{ey+oy}"'
                lines.append(edge + edge_data + marker + dash + '/>')
            side = -1 if arrow['swapped'] else 1
            description = any('description' in p for p in pieces)
            distance = 0 if description else side * 25
            lx = (sx + ex) / 2 + nx * distance
            ly = (sy + ey) / 2 + ny * distance
            if bend:
                lx += nx * bend
                ly += ny * bend
        if label:
            labels.append(f'<span class="diagram-label" style="left:{lx/width*100}%;'
                          f'top:{ly/height*100}%">{mathnode(label)}</span>')
    for x, y, label in nodes:
        nx, ny = xy(x, y)
        labels.append(f'<span class="diagram-node" data-cell="{x},{y}" '
                      f'style="left:{nx/width*100}%;top:{ny/height*100}%">'
                      f'{mathnode(label)}</span>')
    description = 'Commutative diagram. ' + '; '.join(descriptions)
    return (
        '<div class="diagram-scroll"><div class="diagram" role="group" '
        f'aria-label="{html.escape(description, quote=True)}" '
        f'data-node-count="{len(nodes)}" data-arrow-count="{len(arrows)}" '
        f'style="width:{width}px;aspect-ratio:{width}/{height}">'
        f'<svg class="diagram-edges" aria-hidden="true" viewBox="0 0 {width} {height}">'
        f'<defs>{_defs(index)}</defs><g stroke="currentColor" stroke-width="1.35" '
        f'fill="none">{"".join(lines)}</g></svg>{"".join(labels)}</div></div>'
    )


def construction(source, index):
    values = dict(re.findall(r'\\def\\(\w+)\{([\d.]+)\}', source))
    clean = _uncomment(source)
    for key in sorted(values, key=len, reverse=True):
        clean = re.sub(r'\\' + re.escape(key) + r'(?![A-Za-z])', values[key], clean)

    def number(value):
        # Only arithmetic expressions are needed for these four constructions.
        operations = {ast.Add: operator.add, ast.Sub: operator.sub,
                      ast.Mult: operator.mul, ast.Div: operator.truediv}
        def evaluate(node):
            if isinstance(node, ast.Constant) and type(node.value) in (int, float):
                return node.value
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                return evaluate(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
            if isinstance(node, ast.BinOp) and type(node.op) in operations:
                return operations[type(node.op)](evaluate(node.left), evaluate(node.right))
            raise ValueError('Unsupported construction coordinate: ' + value)
        return float(evaluate(ast.parse(value.strip(), mode='eval').body))

    def coord(value):
        return tuple(number(n) for n in value.split(','))

    commands, points = [], []
    pattern = (r'\\draw\s*(\[[^\]]*\])?\s*\(([^)]+)\)\s*'
               r'(?:--\s*\(([^)]+)\)|circle\s*\(([^)]+)\)|arc\s*\(([^)]+)\))\s*'
               r'(?:node\s*\[([^\]]+)\]\s*\{(.*?)\})?\s*;')
    for match in re.finditer(pattern, clean, re.S):
        opts, p, line, circle, arc, place, label = match.groups()
        p = coord(p)
        points.append(p)
        kind, q = 'line', coord(line) if line else None
        if q:
            points.append(q)
        if circle:
            kind, q = 'circle', number(circle)
            points.extend([(p[0] - q, p[1] - q), (p[0] + q, p[1] + q)])
        if arc:
            kind, q = 'arc', tuple(number(n) for n in arc.split(':'))
            start, end, radius = q
            cx = p[0] - radius * math.cos(math.radians(start))
            cy = p[1] - radius * math.sin(math.radians(start))
            for angle in (start, end, *range(math.ceil(min(start, end) / 90) * 90,
                                           math.floor(max(start, end) / 90) * 90 + 1, 90)):
                points.append((cx + radius * math.cos(math.radians(angle)),
                               cy + radius * math.sin(math.radians(angle))))
        commands.append((kind, p, q, opts or '', place, label))
    if not points:
        raise ValueError('No supported geometric drawing commands')
    x0, x1 = min(p[0] for p in points) - 1, max(p[0] for p in points) + 1
    y0, y1 = min(p[1] for p in points) - 1, max(p[1] for p in points) + 1
    scale = min(45, 480 / (x1 - x0), 360 / (y1 - y0))
    width, height = (x1 - x0) * scale, (y1 - y0) * scale

    def xy(point):
        return (point[0] - x0) * scale, (y1 - point[1]) * scale

    svg, labels = [], []
    for kind, p, q, opts, place, label in commands:
        x, y = xy(p)
        attrs = f' marker-end="url(#geo{index})"' if '->' in opts else ''
        if 'dashed' in opts:
            attrs += ' stroke-dasharray="5 4"'
        endpoint = p
        if kind == 'line':
            ex, ey = xy(q)
            endpoint = q
            svg.append(f'<line x1="{x}" y1="{y}" x2="{ex}" y2="{ey}"{attrs}/>')
        elif kind == 'circle':
            svg.append(f'<circle cx="{x}" cy="{y}" r="{q*scale}"/>')
        else:
            start, end, radius = q
            cx = p[0] - radius * math.cos(math.radians(start))
            cy = p[1] - radius * math.sin(math.radians(start))
            target = (cx + radius * math.cos(math.radians(end)),
                      cy + radius * math.sin(math.radians(end)))
            ex, ey = xy(target)
            large = 1 if abs(end - start) > 180 else 0
            svg.append(f'<path d="M{x},{y} A{radius*scale},{radius*scale} '
                       f'0 {large} {1 if end < start else 0} {ex},{ey}"/>')
        if label and label.strip():
            lx, ly = xy(endpoint)
            if place == 'left':
                lx -= 18
            if place == 'right':
                lx += 18
            if place == 'above':
                ly -= 16
            if place == 'below':
                ly += 20
            labels.append(f'<span class="diagram-label" style="left:{lx/width*100}%;'
                          f'top:{ly/height*100}%">{mathnode(label)}</span>')
    description = 'Geometric construction of arithmetic operations and square roots'
    return (
        '<div class="diagram-scroll"><div class="diagram construction" role="group" '
        f'aria-label="{description}" data-command-count="{len(commands)}" '
        f'style="width:{width}px;aspect-ratio:{width}/{height}">'
        f'<svg class="diagram-edges" aria-hidden="true" viewBox="0 0 {width} {height}">'
        f'<defs><marker id="geo{index}" markerWidth="8" markerHeight="8" '
        'refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" '
        'fill="none" stroke="currentColor"/></marker></defs>'
        f'<g stroke="currentColor" fill="none" stroke-width="1.25">'
        f'{"".join(svg)}</g></svg>{"".join(labels)}</div></div>'
    )


def render(kind, body, index):
    if kind not in ('tikzcd', 'tikzpicture'):
        raise ValueError('Unsupported diagram environment: ' + kind)
    picture = commutative(body, index) if kind == 'tikzcd' else construction(body, index)
    return (
        f'<figure class="note-diagram">{picture}<figcaption>Diagram {index} '
        'from the notes · reconstructed in HTML/SVG</figcaption>'
        '<details class="diagram-source"><summary>TikZ source</summary><pre><code>'
        f'{html.escape(body.strip())}</code></pre></details></figure>'
    )
