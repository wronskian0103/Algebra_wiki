// Behavioral checks for the 1.1.0 editorial release; shares qa-app.cjs's DOM emulator.
// This does not substitute for browser layout or real MathJax verification.
const fs = require('node:fs');
const path = require('node:path');
const harness = fs.readFileSync(path.join(__dirname, 'qa-app.cjs'), 'utf8').split('const results=[];')[0];
if (!harness.includes('function makeContext(')) throw new Error('The shared QA harness could not be found.');
const checks = String.raw`
(async () => {
  await flush();
  const D = env.window.WIKI_DATA, S = D.sections;
  const allBlocks = s => [...s.blocks, ...(s.editorialBlocks || [])];
  const pages = S.filter(s => s.contentKind === 'editorial');
  const originals = S.filter(s => s.sourceId !== 'editorial');
  const sources = new Map(D.sources.map(s => [s.id, s]));
  const owner = new Map(S.flatMap(s => allBlocks(s).map(b => [b.id, {s, b}])));
  const supplemental = S.flatMap(s => (s.editorialEntries || []).map(entry => ({s, entry})));
  const results = [];
  const test = async (name, fn) => {
    try {await fn(); results.push({name, pass:true});}
    catch (error) {results.push({name, pass:false, error:error.stack});}
  };
  await test('1.1.0 contains three new pages and preserves the original source baseline', async () => {
    assert.equal(D.version, '1.1.0');
    assert.equal(S.length, 84);
    assert.equal(D.chapters.length, 8);
    assert.equal(pages.length, 3);
    assert.deepEqual(Array.from(pages, p => p.id).sort(), ['ed-formal-power-series', 'ed-free-pid-modules', 'ed-noetherian-modules']);
    assert.equal(originals.length, 81);
    assert.equal(originals.reduce((n, s) => n + s.blocks.length, 0), 997);
    assert.equal(D.sources.filter(s => s.id !== 'editorial').length, 4);
    assert.ok(sources.has('editorial'));
    const expected = [...Array.from({length:48}, (_, i) => 's' + String(i + 1).padStart(2, '0')), ...Array.from({length:29}, (_, i) => 'a2s' + String(i + 1).padStart(2, '0')), ...Array.from({length:4}, (_, i) => 'supp' + String(i + 1).padStart(2, '0'))];
    assert.deepEqual(Array.from(originals, s => s.id), expected);
    for (const s of originals) for (const b of s.blocks) assert.match(b.id, new RegExp('^' + s.id + '--b[0-9]{3}$'));
  });
  await test('new pages occupy the approved reading order and chapter counts', async () => {
    for (const [id, before, after] of [['ed-formal-power-series', 's30', 's31'], ['ed-noetherian-modules', 'a2s09', 'a2s10'], ['ed-free-pid-modules', 'a2s15', 'a2s16']]) {
      const at = S.findIndex(s => s.id === id);
      assert.ok(at > 0, id);
      assert.equal(S[at - 1].id, before);
      assert.equal(S[at + 1].id, after);
      await go(id);
      const nav = main().querySelector('.prev-next');
      assert.ok(nav.querySelectorAll('a').some(a => a.getAttribute('href') === '#' + before));
      assert.ok(nav.querySelectorAll('a').some(a => a.getAttribute('href') === '#' + after));
    }
    assert.equal(S.filter(s => s.chapterNo === 2).length, 11);
    assert.equal(S.filter(s => s.chapterNo === 5).length, 13);
    assert.equal(S.filter(s => s.course === 'Algebra I').length, 49);
    assert.equal(S.filter(s => s.course === 'Algebra II').length, 35);
  });
  await test('editorial standalone pages show accurate provenance and manuscript downloads', async () => {
    for (const s of pages) {
      await go(s.id);
      assert.equal(s.sourceId, 'editorial');
      assert.match(s.number, /^E(?:2|5)\.[12]$/);
      assert.ok(main().textContent.includes('EDITORIAL NOTES'));
      assert.ok(nodes('.tag').some(e => e.textContent === 'Editorial supplement'));
      assert.ok(main().textContent.includes(sources.get('editorial').title));
      assert.ok(!main().querySelector('.article-meta').textContent.includes('lines '), 'no invented lecture lines');
      assert.ok(s.bodyPath && nodes('a').some(a => a.getAttribute('href') === s.bodyPath && a.getAttribute('download') !== null));
      assert.ok(fs.existsSync(path.join(root, 'dist', s.bodyPath)), s.id + ' portable manuscript');
      assert.equal(main().querySelector('.source-details').querySelector('code').textContent, s.body);
      assert.ok(allBlocks(s).every(b => b.origin === 'editorial' && b.sourceId === 'editorial'));
    }
  });
  await test('host supplements render after original notes, before related links, with stable entry anchors', async () => {
    assert.ok(supplemental.length > 0);
    for (const s of S.filter(s => s.editorialEntries?.length)) {
      await go(s.id);
      const article = main().querySelector('article');
      const original = article.querySelector('.original-note');
      const supplement = article.querySelector('.editorial-supplement');
      const related = doc.getElementById(s.id + '--related');
      assert.ok(supplement, s.id + ' supplement');
      assert.ok(article.children.indexOf(original) < article.children.indexOf(supplement), s.id + ' original first');
      assert.ok(article.children.indexOf(supplement) < article.children.indexOf(related), s.id + ' related last');
      assert.ok(supplement.textContent.includes('Editorial supplement'));
      for (const entry of s.editorialEntries) {
        const element = doc.getElementById(entry.id);
        assert.ok(element && element.closest('.editorial-supplement'), entry.id);
        assert.ok(element.textContent.includes(entry.titleEn));
        assert.ok(element.querySelectorAll('a').some(a => a.getAttribute('href') === entry.bodyPath && a.getAttribute('download') !== null), entry.id + ' manuscript');
        assert.ok(fs.existsSync(path.join(root, 'dist', entry.bodyPath)), entry.id + ' portable manuscript');
        assert.ok(main().querySelector('.article-toc').querySelectorAll('a').some(a => a.getAttribute('href') === '#' + entry.id), entry.id + ' TOC');
      }
      for (const b of s.blocks) assert.equal(doc.getElementById(b.id).closest('.editorial-supplement'), null, b.id + ' stays in source notes');
      assert.equal(main().querySelector('.source-details').querySelector('code').textContent, s.body, s.id + ' original TeX preserved');
    }
  });
  await test('editorial block anchors navigate and reveal proofs with keyboard focus', async () => {
    for (const {s, b} of owner.values()) if (b.origin === 'editorial') {
      await go(b.id);
      const element = doc.getElementById(b.id);
      assert.ok(element, b.id);
      assert.equal(scrolls.at(-1), b.id);
      assert.equal(doc.activeElement, element);
      if (b.kind === 'proof') assert.equal(element.open, true, b.id + ' proof is revealed');
      if (s.contentKind !== 'editorial') assert.ok(element.closest('.editorial-supplement'), b.id + ' editorial location');
    }
    const {entry} = supplemental[0];
    await go(entry.id);
    assert.equal(doc.activeElement.id, entry.id);
    assert.equal(scrolls.at(-1), entry.id);
  });
  await test('statement index includes editorial additions with editorial source labels', async () => {
    const counts = {};
    for (const {b} of owner.values()) counts[b.kind] = (counts[b.kind] || 0) + 1;
    for (const [kind, count] of Object.entries(counts)) assert.equal(D.stats[kind], count, kind + ' combined data statistics');
    for (const kind of ['definition', 'theorem', 'proposition', 'lemma', 'corollary', 'example']) {
      await go('theorems?kind=' + kind);
      const entries = nodes('.theorem-entry');
      assert.equal(entries.length, counts[kind] || 0);
      for (const e of entries) {
        const target = e.querySelector('a').getAttribute('href').slice(1);
        const {s, b} = owner.get(target);
        if (b.origin === 'editorial') {
          assert.equal(e.dataset.blockSource, 'editorial');
          assert.equal(e.querySelector('.tag').textContent, sources.get('editorial').title);
          assert.ok(e.querySelector('small').textContent.includes(sources.get('editorial').shortTitle || sources.get('editorial').title));
          assert.ok(!e.querySelector('small').textContent.includes('Algebra I lecture'), 'host source must not be used');
        }
      }
    }
  });
  await test('editorial definitions appear in the concept index with editorial citations', async () => {
    const definitions = (D.definitions || []).filter(d => owner.get(d.target)?.b.origin === 'editorial');
    assert.ok(definitions.length > 0);
    await go('concepts');
    for (const d of definitions) {
      const links = nodes('[data-definition]').filter(a => a.dataset.definition === d.target);
      assert.ok(links.length, d.term + ' direct concept link');
      assert.ok(links.every(a => a.getAttribute('title').includes(sources.get('editorial').shortTitle || sources.get('editorial').title)), d.term + ' editorial citation');
    }
  });
  await test('supplement titles and standalone pages are searchable in the unified reading order', async () => {
    for (const {s, entry} of supplemental) {
      await go('search?q=' + encodeURIComponent(entry.titleEn));
      assert.ok(nodes('.list-row').some(a => a.getAttribute('href') === '#' + s.id), entry.id + ' unified search');
    }
    for (const s of pages) {
      await go('search?q=' + encodeURIComponent(s.titleEn));
      assert.ok(nodes('.list-row').some(a => a.getAttribute('href') === '#' + s.id), s.id + ' search');
    }
  });
  await test('editorial page bookmarks persist and source downloads remain available', async () => {
    for (const s of pages) {await go(s.id); await click(nodes('[data-bookmark]')[0]);}
    await go('bookmarks');
    assert.deepEqual(nodes('.list-row').map(a => a.getAttribute('href').slice(1)), Array.from(pages, s => s.id));
    for (const s of pages) {await go(s.id); await click(nodes('[data-bookmark]')[0]);}
    await go('about');
    assert.ok(main().textContent.includes('1.1.0'));
    assert.ok(nodes('a').some(a => a.getAttribute('href') === 'history.md'));
    assert.ok(fs.existsSync(path.join(root, 'dist/history.md')), 'portable version history');
    assert.ok(main().textContent.includes(sources.get('editorial').title));
    for (const source of D.sources.filter(s => s.id !== 'editorial')) assert.ok(nodes('a').some(a => a.getAttribute('href') === source.path), source.id + ' original download');
    await go('home');
    assert.ok(nodes('.release-version').some(e => e.textContent.includes('1.1.0')));
    assert.equal(errors.length, 0);
    assert.equal(maxActive, 1);
  });
  const report = {passed:results.filter(r => r.pass).length, failed:results.filter(r => !r.pass).length, version:D.version, pages:pages.length, inArticleSupplements:supplemental.length, results, limitation:'Behavioral DOM emulation; not a browser renderer or actual MathJax test.'};
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.failed ? 1 : 0;
})();
`;
new Function('require', '__dirname', 'process', harness + '\n' + checks)(require, __dirname, process);
