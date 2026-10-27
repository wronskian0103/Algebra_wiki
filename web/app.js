/* A portable, source-aware algebra wiki. No server or network connection required. */
(() => {
  'use strict';
  const D = window.WIKI_DATA;
  const main = document.getElementById('main');
  if (!D || !D.sections?.length) {
    main.innerHTML = '<div class="empty-state"><h1>The wiki data could not be loaded.</h1><p>Keep data.js beside index.html and open index.html again.</p></div>';
    return;
  }
  const S = D.sections;
  const byId = Object.fromEntries(S.map(s => [s.id, s]));
  const sources = Array.isArray(D.sources) ? D.sources : Object.values(D.sources || {});
  const bySource = Object.fromEntries(sources.map(s => [s.id, s]));
  const chapters = (D.chapters || []).map(c => ({...c, count: S.filter(s => String(s.chapterNo) === String(c.n)).length}));
  const byChapter = Object.fromEntries(chapters.map(c => [c.n, c]));
  const courses = [...new Set(S.map(s => s.course).filter(Boolean))];
  const kinds = {definition:'Definition', theorem:'Theorem', lemma:'Lemma', proposition:'Proposition', corollary:'Corollary', example:'Example', remark:'Remark', proof:'Proof'};
  const definitionOwners = new Map(S.flatMap(s => [
    [s.id + '--original', {section:s, block:{kind:'section', number:s.number}}],
    ...s.blocks.map(b => [b.id, {section:s, block:b}])
  ]));
  const definitions = (Array.isArray(D.definitions) ? D.definitions : [])
    .filter(d => d.term && definitionOwners.has(d.target))
    .map(d => ({...d, aliases:Array.isArray(d.aliases) ? d.aliases : [], ...definitionOwners.get(d.target)}));
  const normalizeTerm = value => String(value || '').trim().replace(/^\$|\$$/g, '').replace(/[\u2010\u2011\u2013\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').toLocaleLowerCase();
  const definitionsByTerm = new Map();
  definitions.forEach(d => [d.term, ...d.aliases].forEach(term => {
    const key = normalizeTerm(term);
    if (!key) return;
    if (!definitionsByTerm.has(key)) definitionsByTerm.set(key, []);
    if (!definitionsByTerm.get(key).some(candidate => candidate.target === d.target)) definitionsByTerm.get(key).push(d);
  }));
  const stats = S.reduce((counts, s) => {s.blocks.forEach(b => {counts[b.kind] = (counts[b.kind] || 0) + 1;}); return counts;}, {});
  const issues = S.flatMap(s => s.issues || []);
  const numberedKinds = Object.keys(kinds).filter(k => !['proof', 'remark'].includes(k));
  const statementCount = numberedKinds.reduce((n, k) => n + (stats[k] || 0), 0);
  const proofCount = stats.proof || 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const pad = value => String(value).padStart(2, '0');
  const sourceFor = s => bySource[s.sourceId] || {};
  const sourceLabel = s => sourceFor(s).title || s.course || 'Lecture notes';
  const citation = s => {
    const label = sourceFor(s).shortTitle || sourceLabel(s).replace(/\s+lecture notes$/i, '');
    return [s.course && s.course !== label ? s.course : '', label, s.sourceNumber || s.number].filter(Boolean).join(' · ');
  };
  const chapterFor = s => byChapter[s.chapterNo] || {title:'Algebra', n:s.chapterNo};
  const sourceDownload = s => {
    const source = sourceFor(s);
    return source.path ? `<a href="${escape(source.path)}" download class="button small">Download ${escape(source.file || 'LaTeX source')} ↗</a>` : '';
  };
  const readStore = (key, fallback) => {try {return JSON.parse(localStorage.getItem(`unified-algebra-${key}`)) ?? fallback;} catch {return fallback;}};
  const save = (key, value) => {try {localStorage.setItem(`unified-algebra-${key}`, JSON.stringify(value));} catch {}};
  let bookmarks = new Set(readStore('bookmarks', []).filter(id => byId[id]));
  let read = new Set(readStore('read', []).filter(id => byId[id]));
  let routeVersion = 0, localFilter = '', localQuery = '', localCourse = '', mathQueue = Promise.resolve(), toastTimer;

  function notice(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2300);
  }
  function typeset() {
    const version = routeVersion;
    mathQueue = mathQueue.catch(() => {}).then(async () => {
      if (version !== routeVersion) return;
      try {
        if (!window.MathJax?.startup?.promise) return;
        await MathJax.startup.promise;
        if (version !== routeVersion) return;
        await MathJax.typesetPromise([main]);
        if (version === routeVersion) window.AlgebraDiagramLayout?.fit(main);
      } catch (error) {console.error('Math rendering', error);}
    });
    return mathQueue;
  }
  function current() {
    const hash = location.hash.slice(1) || 'home';
    const at = hash.indexOf('?');
    return {base: at < 0 ? hash : hash.slice(0, at), params: new URLSearchParams(at < 0 ? '' : hash.slice(at + 1))};
  }
  function mount(html) {
    window.MathJax?.typesetClear?.([main]);
    main.innerHTML = html;
  }
  function pageTitle(eyebrow, title, description) {
    return `<div class="page-title"><div class="eyebrow">${escape(eyebrow)}</div><h1>${escape(title)}</h1><p>${escape(description)}</p></div>`;
  }
  function setBreadcrumb(chapter, title) {
    document.getElementById('breadcrumb').innerHTML = `Study space <span>/</span> ${chapter ? escape(chapter) + ' <span>/</span> ' : ''}${escape(title)}`;
  }
  function updateNav(route) {
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === route));
    const chapter = byId[current().base.split('--')[0]]?.chapterNo || current().params.get('chapter');
    document.querySelectorAll('[data-nav-chapter]').forEach(a => a.classList.toggle('active', String(a.dataset.navChapter) === String(chapter)));
    document.getElementById('bookmark-count').textContent = bookmarks.size;
  }
  function setMenu(open) {
    document.getElementById('sidebar').classList.toggle('open', open);
    document.getElementById('nav-overlay').hidden = !open;
    document.getElementById('mobile-menu').setAttribute('aria-expanded', String(open));
  }
  function row(s, detail = false) {
    return `<a class="list-row" href="#${escape(s.id)}"><span class="row-no">${escape(s.number)}</span><div><h3>${escape(s.titleEn)} ${read.has(s.id) ? '<span class="tag">Read</span>' : ''}</h3><small>${escape(citation(s))}${s.title && s.title !== s.titleEn ? ' · ' + escape(s.title) : ''}</small>${detail ? `<p>${escape(s.summary)}</p>` : ''}</div><span class="row-arrow">↗</span></a>`;
  }
  function home() {
    const last = readStore('last', '');
    const resume = byId[last] || S[0];
    const paths = [chapters[0], chapters.find(c => c.n === 4), chapters.find(c => c.n === 6), chapters.find(c => c.n === 7)].filter(Boolean);
    mount(`<section class="hero"><div><div class="eyebrow">ALGEBRA I + II · ONE CONNECTED NOTEBOOK</div><h1>Algebra, connected.<br>One idea at a time.</h1><p>Groups, rings, and fields. Categories, modules, and tensor products.<br>Follow the definitions, theorems, and proofs across both courses in one English wiki.</p><div class="actions"><a class="button primary" href="#${resume.id}">${byId[last] ? 'Continue reading' : 'Start reading'} <span>↗</span></a><a class="button" href="#contents">Explore the contents <span>→</span></a></div></div><div class="hero-art" aria-hidden="true"><svg viewBox="0 0 260 242"><path d="M60 45L200 68L190 182L48 164Z M60 45L125 121L200 68 M190 182L125 121L48 164" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="125" cy="121" r="68" fill="none" stroke="currentColor" stroke-dasharray="2 6"/></svg><span class="art-word a">G</span><span class="art-word b">R-Mod</span><span class="art-word center">⊗</span><span class="art-word c">Gal(K/k)</span><span class="art-word d">K/k</span><small>STRUCTURE &amp; CONNECTION</small></div></section>
      <div class="stats"><div class="stat"><strong>${S.length}</strong><span>topic pages</span></div><div class="stat"><strong>${statementCount}</strong><span>statements &amp; examples</span></div><div class="stat"><strong>${proofCount}</strong><span>proofs</span></div><div class="stat"><strong>${D.diagramCount || 0}</strong><span>diagrams</span></div></div>
      <section><div class="section-heading"><h2>Two courses. A shared language.</h2><a href="#contents">Browse every section →</a></div><div class="chapter-cards">${chapters.map(c => {
        const list = S.filter(s => String(s.chapterNo) === String(c.n));
        return `<a class="chapter-card" href="#contents?chapter=${c.n}"><div class="card-head"><span>CHAPTER ${pad(c.n)} · ${escape(c.course || '')}</span><span>↗</span></div><div class="card-symbol">${escape(c.symbol || 'A')}</div><h3>${escape(c.title)}</h3><p>${escape(c.description)}</p><div class="card-bottom"><span>${c.count} sections</span><span>${list.length ? escape(list[0].number) + ' – ' + escape(list.at(-1).number) : ''}</span></div></a>`;
      }).join('')}</div></section>
      <div class="home-lower"><section><div class="section-heading"><h2>Follow a path through the ideas</h2><a href="#concepts">All concepts →</a></div><div class="path-list">${paths.map((c, index) => {
        const first = S.find(s => String(s.chapterNo) === String(c.n));
        return `<div class="path-item"><span class="path-no">${pad(index + 1)}</span><div><a href="#${first.id}"><strong>${escape(c.title)}</strong><small>${escape(c.description)}</small></a></div><a href="#${first.id}" aria-label="Explore ${escape(c.title)}">↗</a></div>`;
      }).join('')}</div></section><section><div class="section-heading"><h2>The sources behind this wiki</h2></div><div class="source-panel"><div class="eyebrow">FROM YOUR ALGEBRA MATERIALS</div><h3>Both courses, brought together.</h3><p>Lecture notes and supplementary topics share one search and concept index. Original numbering is preserved and labeled by source. Study guides and related links connect the ideas across courses.</p><a href="#about">Sources and editorial principles ↗</a></div></section></div>`);
    setBreadcrumb('', 'Wiki home');
  }
  function contents(params) {
    localFilter = params.get('chapter') || '';
    localCourse = params.get('course') || '';
    localQuery = '';
    mount(pageTitle('CONTENTS', 'Contents', 'Read in course order or filter by chapter. Original section numbers are preserved within each source.') + `<div class="toolbar" id="contents-toolbar"><button class="filter-button ${!localFilter ? 'active' : ''}" data-chapter="">All · ${S.length}</button>${chapters.map(c => `<button class="filter-button ${localFilter === String(c.n) ? 'active' : ''}" data-chapter="${c.n}">${escape(c.title)} · ${c.count}</button>`).join('')}</div><div class="contents-searchbar"><label class="course-select-label">Course <select class="course-select" id="course-filter"><option value="">All courses</option>${courses.map(course => `<option value="${escape(course)}" ${course === localCourse ? 'selected' : ''}>${escape(course)}</option>`).join('')}</select></label><input class="local-search" id="contents-search" type="search" aria-label="Search contents" placeholder="Find a section"></div><div id="contents-list"></div>`);
    updateContents();
    setBreadcrumb('', 'Contents');
  }
  function updateContents() {
    const query = localQuery.toLowerCase();
    const filtered = S.filter(s => (!localFilter || String(s.chapterNo) === localFilter) && (!localCourse || s.course === localCourse) && (!query || [s.title, s.titleEn, s.summary, sourceLabel(s), ...(s.keywords || [])].join(' ').toLowerCase().includes(query)));
    document.getElementById('contents-list').innerHTML = filtered.length ? chapters.map(c => {
      const list = filtered.filter(s => String(s.chapterNo) === String(c.n));
      return list.length ? `<div class="chapter-separator">CHAPTER ${pad(c.n)} · ${escape(c.title)} <span>${escape(c.course || '')} · ${list.length} sections</span></div><div class="section-list">${list.map(s => row(s, true)).join('')}</div>` : '';
    }).join('') : '<div class="empty-state">No matching sections. Try another chapter or course.</div>';
    typeset();
  }
  function issueMarkup(issue) {
    return `<div class="issue"><p class="original"><strong>Original</strong> ${escape(issue.original)}</p><p><strong>Suggested correction</strong> ${escape(issue.correction)}</p><p>${escape(issue.reason)}</p></div>`;
  }
  function definitionLabel(d) {
    const label = d.block.kind === 'section' ? 'Source notes' : `${kinds[d.block.kind] || 'Definition'} ${d.block.number || ''}`.trim();
    return `${label} · ${citation(d.section)}`;
  }
  function definitionAnchor(term, target, label, className = 'definition-link') {
    const owner = definitionOwners.get(target);
    if (!owner) return '';
    const title = `Definition of ${term} · ${definitionLabel(owner)}`;
    return `<a class="${className}" href="#${escape(target)}" data-definition="${escape(target)}" title="${escape(title)}">${escape(label)}</a>`;
  }
  function sectionDefinitions(s) {
    const seen = new Set();
    const links = (s.definitionLinks || []).filter(d => {
      const key = normalizeTerm(d.term) + '|' + d.target;
      if (!d.term || !definitionOwners.has(d.target) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!links.length) return '';
    return `<details class="definition-shortcuts"><summary>Definitions used here <span>${links.length}</span></summary><p>Follow an underlined term in the notes, or choose one here.</p><div>${links.map(d => definitionAnchor(d.term, d.target, d.term)).join('')}</div></details>`;
  }
  function article(s, anchor) {
    const source = sourceFor(s), chapter = chapterFor(s);
    const numbered = s.blocks.filter(b => !['proof', 'remark'].includes(b.kind));
    const index = S.indexOf(s), prev = S[index - 1], next = S[index + 1];
    mount(`<div class="article-layout"><article><header class="article-header"><div class="eyebrow">CHAPTER ${pad(s.chapterNo)} · ${escape(chapter.title)} <span>/</span> ${escape(s.course || '')}</div><h1>${escape(s.titleEn)}</h1><div class="article-english">${escape(citation(s))}${s.title && s.title !== s.titleEn ? ' · ' + escape(s.title) : ''}</div><div class="article-meta"><span>${escape(sourceLabel(s))}${s.line ? ` · lines ${s.line}–${s.sourceLineEnd || s.line}` : ''}</span><span>${numbered.length} statements and examples</span><span>${s.blocks.filter(b => b.kind === 'proof').length} proofs</span><span class="tag">${escape(s.sourceStatus || 'Source text preserved')}</span></div><div class="actions"><button class="button small" data-bookmark="${s.id}">${bookmarks.has(s.id) ? '★ Bookmarked' : '☆ Bookmark'}</button><button class="button small" data-read="${s.id}">${read.has(s.id) ? '✓ Read' : 'Mark as read'}</button><button class="button small" id="copy-link">Copy section link ↗</button></div></header>
      <section class="guide" id="${s.id}--guide"><h2>A guide to this section</h2><p>${s.summaryHtml ?? escape(s.summary)}</p>${s.keyPoints?.length ? `<ul>${s.keyPoints.map((p, i) => `<li>${s.keyPointsHtml?.[i] ?? escape(p)}</li>`).join('')}</ul>` : ''}</section>
      ${sectionDefinitions(s)}
      ${s.issues?.length ? `<details class="issues-panel"><summary>${s.issues.length} correction notes · original text preserved</summary>${s.issues.map(issueMarkup).join('')}</details>` : ''}
      <div class="article-heading" id="${s.id}--original"><span>SOURCE NOTES · ${escape(s.course || '')}</span><button id="expand-proofs">Expand all proofs</button></div><div class="original-note">${s.html}</div>
      <section id="${s.id}--related"><h2 class="article-heading">Related sections</h2><div class="related-links">${(s.related || []).filter(id => byId[id]).map(id => `<a href="#${id}"><small>${escape(citation(byId[id]))}</small>${escape(byId[id].titleEn)} ↗</a>`).join('') || '<p class="muted">Browse the concept index for more connections.</p>'}</div></section>
      <details class="source-details"><summary>View this section’s LaTeX source${s.line ? ' · from line ' + s.line : ''}</summary><pre><code>${escape(s.body)}</code></pre><p>${sourceDownload(s)}</p></details>
      <nav class="prev-next" aria-label="Previous and next sections"><div>${prev ? `<a href="#${prev.id}"><small>← Previous · ${escape(citation(prev))}</small>${escape(prev.titleEn)}</a>` : '<a href="#contents">Back to contents</a>'}</div><div>${next ? `<a href="#${next.id}"><small>Next · ${escape(citation(next))} →</small>${escape(next.titleEn)}</a>` : '<a href="#contents">Back to contents →</a>'}</div></nav></article>
      <aside class="article-toc" aria-label="On this page"><h3>On this page</h3><a href="#${s.id}--guide">Study guide</a><a href="#${s.id}--original">Source notes</a>${numbered.map(b => `<a href="#${b.id}" title="${escape((b.excerpt || '').slice(0, 90))}">${escape(kinds[b.kind] || b.kind)} ${escape(b.number)}</a>`).join('')}<a href="#${s.id}--related" class="toc-label">Related sections →</a></aside></div>`);
    save('last', s.id);
    setBreadcrumb(chapter.title, s.titleEn);
    if (anchor) {
      const version = routeVersion;
      typeset().then(() => {if (version === routeVersion) scrollAnchor(anchor);});
    }
  }
  function scrollAnchor(id) {
    const element = document.getElementById(id);
    if (!element) return;
    for (let ancestor = element; ancestor && ancestor !== main; ancestor = ancestor.parentElement) {
      if (ancestor.matches('details.proof')) ancestor.open = true;
    }
    main.querySelectorAll('.anchor-target').forEach(target => target.classList.remove('anchor-target'));
    element.classList.add('anchor-target');
    element.setAttribute('tabindex', '-1');
    element.focus({preventScroll:true});
    element.scrollIntoView({behavior:'instant', block:'start'});
  }
  const concepts = (() => {
    const map = new Map();
    S.forEach(s => [...(s.terms || []), ...(s.keywords || [])].forEach(raw => {
      const term = raw.trim().replace(/^\$|\$$/g, '');
      if (!term || term.length > 85 || term.includes('\\begin') || /\n/.test(term)) return;
      const key = normalizeTerm(term);
      if (!map.has(key)) map.set(key, {term, ids:[]});
      if (!map.get(key).ids.includes(s.id)) map.get(key).ids.push(s.id);
    }));
    definitions.forEach(d => {
      const key = normalizeTerm(d.term);
      if (!map.has(key)) map.set(key, {term:d.term, ids:[]});
    });
    return [...map.entries()].map(([key, c]) => {
      c.definitions = definitionsByTerm.get(key) || [];
      c.definitions.forEach(d => {if (!c.ids.includes(d.section.id)) c.ids.push(d.section.id);});
      c.searchTerms = normalizeTerm([c.term, ...c.definitions.flatMap(d => [d.term, ...d.aliases])].join(' '));
      return c;
    }).sort((a, b) => a.term.localeCompare(b.term));
  })();
  function conceptView() {
    localQuery = '';
    mount(pageTitle('CONCEPT INDEX', 'Concept index', 'Look up a term and go directly to its definition. Related section links connect the ideas across both courses.') + `<div class="toolbar"><span class="index-count">${concepts.length} terms</span><input class="local-search" id="concept-search" type="search" placeholder="e.g. normal, tensor, exact" aria-label="Search concepts"></div><div class="concept-grid" id="concept-list"></div>`);
    updateConcepts();
    setBreadcrumb('', 'Concept index');
  }
  function updateConcepts() {
    const list = concepts.filter(c => c.searchTerms.includes(normalizeTerm(localQuery)));
    document.getElementById('concept-list').innerHTML = list.length ? list.map(c => `<div class="concept-card"><h3>${escape(c.term)}</h3>${c.definitions.length ? `<div class="concept-definitions">${c.definitions.map(d => definitionAnchor(c.term, d.target, definitionLabel(d) + ' →', 'definition-link concept-definition')).join('')}</div>` : ''}${c.ids.map(id => `<a href="#${id}"><span>${escape(citation(byId[id]))}</span> ${escape(byId[id].titleEn)} ↗</a>`).join('')}</div>`).join('') : '<div class="empty-state">No matching terms.</div>';
    typeset();
  }
  function theoremView(params) {
    localQuery = '';
    const available = numberedKinds.filter(k => stats[k]);
    localFilter = available.includes(params.get('kind')) ? params.get('kind') : (available.includes('theorem') ? 'theorem' : available[0]);
    mount(pageTitle('STATEMENTS & PROOFS', 'Statement index', 'Search by original statement number or content. Course and source labels distinguish repeated numbering.') + `<div class="toolbar" id="theorem-toolbar">${available.map(kind => `<button class="filter-button ${localFilter === kind ? 'active' : ''}" data-kind="${kind}">${kinds[kind]} · ${stats[kind]}</button>`).join('')}<input class="local-search" id="theorem-search" type="search" placeholder="Search by number or content" aria-label="Search statements"></div><div id="theorem-list"></div>`);
    updateTheorems();
    setBreadcrumb('', 'Statement index');
  }
  function updateTheorems() {
    const query = localQuery.toLowerCase();
    const list = S.flatMap(s => s.blocks.filter(b => b.kind === localFilter && (!query || `${b.number} ${b.excerpt} ${s.titleEn} ${s.title} ${sourceLabel(s)} ${s.course}`.toLowerCase().includes(query))).map(b => ({s, b})));
    document.getElementById('theorem-list').innerHTML = `<div class="index-count">${list.length} entries</div>` + (list.length ? list.map(({s, b}) => `<div class="theorem-entry"><div class="statement-title"><a href="#${b.id}">${escape(kinds[b.kind] || b.kind)} ${escape(b.number)}${b.title ? ' · ' + escape(b.title) : ''} ↗</a><span class="tag">${escape(sourceLabel(s))}</span></div><p>${escape(b.excerpt)}</p><small>${escape(citation(s))} · ${escape(s.titleEn)}</small></div>`).join('') : '<div class="empty-state">No matching entries.</div>');
    typeset();
  }
  function bookmarkView() {
    mount(pageTitle('YOUR COLLECTION', 'Bookmarks', 'Keep sections from either course together. Bookmarks and reading status are saved in this browser.') + `<div class="section-list">${S.filter(s => bookmarks.has(s.id)).map(s => row(s, true)).join('') || '<div class="empty-state"><h3>No bookmarks yet.</h3><p>Select ☆ Bookmark at the top of a section to save it here.</p><a class="button" href="#contents">Browse contents →</a></div>'}</div>`);
    setBreadcrumb('', 'Bookmarks');
  }
  function highlight(value, query) {
    const text = String(value || '');
    if (!query) return escape(text);
    const lower = text.toLowerCase(), needle = query.toLowerCase();
    let index = 0, output = '', position;
    while ((position = lower.indexOf(needle, index)) >= 0) {
      output += escape(text.slice(index, position)) + `<mark>${escape(text.slice(position, position + query.length))}</mark>`;
      index = position + query.length;
    }
    return output + escape(text.slice(index));
  }
  function searchView(params) {
    const query = (params.get('q') || '').trim();
    document.getElementById('global-search').value = query;
    const needle = query.toLowerCase();
    const list = query ? S.filter(s => [s.title, s.titleEn, s.summary, s.searchText, s.course, sourceLabel(s), ...(s.keywords || []), ...(s.terms || []), ...(s.issues || []).map(i => i.correction)].join(' ').toLowerCase().includes(needle)) : [];
    mount(pageTitle('SEARCH', 'Search results', query ? `${list.length} sections matching “${query}”` : 'Enter a search term and press Enter.') + `<div class="section-list">${list.length ? list.map(s => {
      const full = s.searchText || '';
      const at = full.toLowerCase().indexOf(needle), start = Math.max(0, at - 65);
      const snippet = at >= 0 ? (start ? '…' : '') + full.slice(start, start + 230) + (full.length > start + 230 ? '…' : '') : s.summary;
      return `<a class="list-row" href="#${s.id}"><span class="row-no">${escape(s.number)}</span><div><h3>${highlight(s.titleEn, query)}</h3><small>${escape(citation(s))} · ${escape(sourceLabel(s))}</small><p>${highlight(snippet, query)}</p></div><span class="row-arrow">↗</span></a>`;
    }).join('') : query ? '<div class="empty-state"><h3>No results found.</h3><p>Try another term or spelling.</p></div>' : ''}</div>`);
    setBreadcrumb('', 'Search');
  }
  function aboutView() {
    mount(pageTitle('ABOUT THIS WIKI', 'Sources & correction notes', 'An English study wiki bringing Algebra I and Algebra II lecture notes and supplements into one connected collection.') + `<div class="about-body"><h2>Source documents</h2><p>The original materials remain available as downloads. Each section and statement identifies its source, so numbering shared by different documents remains unambiguous.</p><div class="source-table-scroll"><table><thead><tr><th>Source</th><th>Course / term</th><th>Coverage</th><th>Original</th></tr></thead><tbody>${sources.map(source => {
      const list = S.filter(s => s.sourceId === source.id);
      return `<tr><td>${escape(source.title)}${source.author ? `<small class="table-detail">Notes · ${escape(source.author)}</small>` : ''}${source.lecturer ? `<small class="table-detail">Lecture · ${escape(source.lecturer)}</small>` : ''}</td><td>${escape(source.course || '')}${source.term ? `<small class="table-detail">${escape(source.term)}</small>` : ''}</td><td>${list.length} sections${source.lines ? `<small class="table-detail">${Number(source.lines).toLocaleString()} source lines</small>` : ''}</td><td>${source.path ? `<a class="source-file-link" href="${escape(source.path)}" download>${escape(source.file || 'LaTeX')} ↗</a>` : 'Included notes'}</td></tr>`;
    }).join('')}</tbody></table></div><p>${S.length} topic pages across ${chapters.length} chapters: ${chapters.map(c => `${c.count} in ${c.title}`).join(', ')}.</p><div class="actions"><button class="button small" id="print-page">Print this page</button></div><p>Algebra II also includes a <a class="source-file-link" href="source/algebra2/references.bib" download>bibliography file ?</a>.</p><h2>Editorial principles</h2><p>The source notes, formulas, examples, and proofs are preserved. Section numbers and statement numbers follow each original document; course and source labels distinguish repeated numbers. Cross-references link to their targets. The ${D.diagramCount || 0} diagrams are presented alongside their available source code.</p><p>English titles, study guides, key points, the unified chapter organization, and related links are editorial additions for navigation. Related sections connect topics across both courses. Identified source errors are discussed separately below, with the source text retained. These suggestions are not an official course errata sheet.</p><h2>How to use this wiki</h2><ul><li>Use the top search box to search the full collection. Press <kbd>/</kbd> to focus it.</li><li>Filter the contents by chapter or course, or follow the course order with the previous and next links.</li><li>Use the concept index for connections across courses and the statement index to browse definitions, theorems, and examples.</li><li>Expand a proof individually or use “Expand all proofs” in a section.</li><li>Bookmarks, reading status, color theme, and the last section are stored locally in this browser and do not sync across devices.</li><li>Open <code>dist/index.html</code> to browse offline. Keep its neighboring files and asset folders together; the MathJax formula renderer is included.</li></ul><h2>Correction notes · ${issues.length}</h2>${issues.length ? '<p>These notes also appear in the relevant sections for comparison with the original text.</p>' : '<p>No separate correction notes are recorded for this collection.</p>'}${S.filter(s => s.issues?.length).map(s => `<details class="issues-panel"><summary>${escape(citation(s))} · ${escape(s.titleEn)} · ${s.issues.length} notes</summary><p><a href="#${s.id}">Open section ↗</a></p>${s.issues.map(issueMarkup).join('')}</details>`).join('')}<h2>Rebuilding and licenses</h2><p>The build scripts and English study metadata are included in the project folder. See the project README for the rebuild command and the source layout.</p><p>Formulas are rendered with MathJax 3.2.2. <a class="source-file-link" href="assets/mathjax/LICENSE">MathJax license</a> · Copyright in the original notes remains with their authors.</p><details class="source-details"><summary>Source file SHA-256 checksums</summary>${sources.map(source => `<p><strong>${escape(source.title)}</strong></p><code>${escape(source.sha256 || 'Not recorded')}</code>`).join('')}</details></div>`);
    setBreadcrumb('', 'About this wiki');
  }
  function navigate() {
    routeVersion++;
    localFilter = ''; localQuery = ''; localCourse = '';
    const {base, params} = current();
    const id = base.split('--')[0];
    setMenu(false);
    document.title = 'Algebra · A connected wiki';
    if (byId[id]) {
      article(byId[id], base !== id ? base : null);
      document.title = `${byId[id].titleEn} · ${byId[id].course || 'Algebra'} · Algebra Wiki`;
      updateNav('contents');
    } else {
      const pages = {home, contents:() => contents(params), concepts:conceptView, theorems:() => theoremView(params), bookmarks:bookmarkView, search:() => searchView(params), about:aboutView};
      if (pages[base]) pages[base]();
      else {
        mount(pageTitle('PAGE NOT FOUND', 'This section could not be found.', 'Use the contents or search to find the topic you need.') + '<a class="button" href="#contents">Browse contents →</a>');
        setBreadcrumb('', 'Page not found');
      }
      updateNav(base);
    }
    if (!base.includes('--')) window.scrollTo({top:0, behavior:'instant'});
    typeset();
  }
  function updateContentsAddress() {
    const params = new URLSearchParams();
    if (localFilter) params.set('chapter', localFilter);
    if (localCourse) params.set('course', localCourse);
    history.replaceState(null, '', '#contents' + (params.size ? '?' + params.toString() : ''));
    updateNav('contents');
  }
  document.getElementById('section-count').textContent = S.length;
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault(); main.focus(); main.scrollIntoView({behavior:'instant', block:'start'});
  });
  document.getElementById('source-count').textContent = `${sources.length} files`;
  document.getElementById('chapter-nav').innerHTML = chapters.map(c => `<a href="#contents?chapter=${c.n}" data-nav-chapter="${c.n}"><span class="chapter-number">${pad(c.n)}</span><span>${escape(c.title)}<small>${escape(c.course || '')} · ${c.count} sections</small></span><span class="chapter-arrow">↗</span></a>`).join('');
  document.getElementById('search-form').addEventListener('submit', event => {
    event.preventDefault();
    location.hash = 'search?q=' + encodeURIComponent(document.getElementById('global-search').value.trim());
  });
  document.getElementById('theme-button').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {localStorage.setItem('unified-algebra-theme', dark ? 'dark' : 'light');} catch {}
  });
  document.getElementById('mobile-menu').addEventListener('click', () => setMenu(!document.getElementById('sidebar').classList.contains('open')));
  document.getElementById('nav-overlay').addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault(); document.getElementById('global-search').focus();
    }
    if (event.key === 'Escape') setMenu(false);
  });
  main.addEventListener('click', async event => {
    const link = event.target.closest('[data-definition]');
    if (link && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (!event.button || event.button === 0)) {
      const target = link.dataset.definition;
      if (location.hash === '#' + target && document.getElementById(target)) {
        event.preventDefault();
        const version = routeVersion;
        await typeset();
        if (version === routeVersion) scrollAnchor(target);
      }
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.chapter !== undefined) {
      localFilter = button.dataset.chapter;
      localCourse = '';
      document.getElementById('course-filter').value = '';
      document.querySelectorAll('[data-chapter]').forEach(b => b.classList.toggle('active', b === button));
      updateContentsAddress(); updateContents();
    }
    if (button.dataset.kind) {
      localFilter = button.dataset.kind;
      document.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('active', b === button));
      history.replaceState(null, '', '#theorems?kind=' + localFilter);
      updateTheorems();
    }
    if (button.dataset.bookmark) {
      const id = button.dataset.bookmark;
      bookmarks.has(id) ? bookmarks.delete(id) : bookmarks.add(id);
      save('bookmarks', [...bookmarks]);
      button.textContent = bookmarks.has(id) ? '★ Bookmarked' : '☆ Bookmark';
      document.getElementById('bookmark-count').textContent = bookmarks.size;
      notice(bookmarks.has(id) ? 'Bookmark saved.' : 'Bookmark removed.');
    }
    if (button.dataset.read) {
      const id = button.dataset.read;
      read.has(id) ? read.delete(id) : read.add(id);
      save('read', [...read]);
      button.textContent = read.has(id) ? '✓ Read' : 'Mark as read';
    }
    if (button.id === 'copy-link') {
      try {await navigator.clipboard.writeText(location.href); notice('Section link copied.');}
      catch {notice('Copy this section’s address from the address bar.');}
    }
    if (button.id === 'expand-proofs') {
      const all = [...main.querySelectorAll('details.proof')];
      const open = all.some(detail => !detail.open);
      all.forEach(detail => {detail.open = open;});
      button.textContent = open ? 'Collapse all proofs' : 'Expand all proofs';
    }
    if (button.id === 'print-page') window.print();
  });
  main.addEventListener('input', event => {
    if (event.target.id === 'contents-search') {localQuery = event.target.value; updateContents();}
    if (event.target.id === 'concept-search') {localQuery = event.target.value; updateConcepts();}
    if (event.target.id === 'theorem-search') {localQuery = event.target.value; updateTheorems();}
  });
  main.addEventListener('change', event => {
    if (event.target.id === 'course-filter') {
      localCourse = event.target.value;
      localFilter = '';
      document.querySelectorAll('[data-chapter]').forEach(button => button.classList.toggle('active', button.dataset.chapter === ''));
      updateContentsAddress(); updateContents();
    }
  });
  window.addEventListener('resize', () => window.AlgebraDiagramLayout?.schedule(main));
  main.addEventListener('toggle', () => window.AlgebraDiagramLayout?.schedule(main), true);
  window.addEventListener('hashchange', navigate);
  navigate();
  window.ALGEBRA_WIKI = {sections:S.length, chapters:chapters.length, concepts:concepts.length, definitions:definitions.length, sources:sources.length, ready:() => mathQueue};
})();
