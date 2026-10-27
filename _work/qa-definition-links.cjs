// Behavioral QA for definition navigation. Reuses the deliberately small DOM emulator
// from qa-app.cjs; it does not claim browser layout or real MathJax verification.
const fs = require('node:fs');
const path = require('node:path');
const harness = fs.readFileSync(path.join(__dirname, 'qa-app.cjs'), 'utf8').split('const results=[];')[0];
if (!harness.includes('function makeContext(')) throw new Error('The shared QA harness could not be found.');
const checks = String.raw`
(async () => {
  await flush();
  const D = env.window.WIKI_DATA, S = D.sections;
  const definitions = D.definitions || [];
  const norm = s => String(s || '').trim().replace(/^\$|\$$/g, '').replace(/[\u2010\u2011\u2013\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').toLocaleLowerCase();
  const owners = new Map(S.flatMap(s => [[s.id + '--original', s], ...[...s.blocks, ...(s.editorialBlocks || [])].map(b => [b.id, s])]));
  const results = [];
  const test = async (name, fn) => {
    try {await fn(); results.push({name, pass:true});}
    catch (error) {results.push({name, pass:false, error:error.stack});}
  };
  const activate = async (link, props = {}) => {
    assert.ok(link, 'definition link exists');
    let prevented = false;
    await main().emit('click', {target:link, button:0, ...props, preventDefault:() => {prevented = true;}});
    if (!prevented && !props.ctrlKey && !props.metaKey && !props.shiftKey && !props.altKey && !props.button) await go(link.getAttribute('href').slice(1));
    else await flush();
    return prevented;
  };
  await test('definition catalog contains real source targets', async () => {
    assert.ok(definitions.length > 0, 'rebuild data.js to include the definition catalog');
    assert.equal(env.window.ALGEBRA_WIKI.definitions, definitions.length);
    for (const d of definitions) {
      assert.ok(owners.has(d.target), d.term + ': ' + d.target);
      assert.ok(Array.isArray(d.aliases), d.term + ': aliases');
    }
  });
  await test('concept index offers direct canonical definitions and related sections', async () => {
    await go('concepts');
    const cards = new Map(nodes('.concept-card').map(c => [norm(c.querySelector('h3').textContent), c]));
    for (const d of definitions) {
      const card = cards.get(norm(d.term));
      assert.ok(card, 'canonical concept: ' + d.term);
      const precise = card.querySelectorAll('[data-definition]');
      assert.ok(precise.some(a => a.dataset.definition === d.target), d.term + ' direct target');
      assert.ok(card.querySelectorAll('a').some(a => a.getAttribute('href') === '#' + owners.get(d.target).id), d.term + ' related section');
    }
    for (const card of cards.values()) {
      const links = card.querySelectorAll('[data-definition]');
      assert.equal(new Set(links.map(a => a.dataset.definition)).size, links.length, 'duplicate targets in a concept card');
    }
  });
  await test('definition aliases find their canonical concept', async () => {
    for (const d of definitions.filter(d => d.aliases.length).slice(0, 12)) {
      await go('concepts');
      await input('concept-search', d.aliases[0]);
      assert.ok(nodes('.concept-card').some(c => norm(c.querySelector('h3').textContent) === norm(d.term)), d.term + ' alias ' + d.aliases[0]);
    }
  });
  await test('all rendered article definition links lead to valid precise targets', async () => {
    let sourceLinks = 0;
    for (const s of S) {
      await go(s.id);
      const original = main().querySelector('.original-note');
      const articleLinks = original.querySelectorAll('[data-definition]');
      sourceLinks += articleLinks.length;
      for (const link of nodes('[data-definition]')) {
        assert.ok(owners.has(link.dataset.definition), s.id + ' broken definition');
        assert.equal(link.getAttribute('href'), '#' + link.dataset.definition);
        assert.ok(link.getAttribute('title'), s.id + ' accessible link title');
        assert.equal(link.querySelectorAll('a').length, 0, s.id + ' nested link');
      }
      const shortcuts = nodes('.definition-shortcuts');
      assert.equal(shortcuts.length, (s.definitionLinks || []).length ? 1 : 0, s.id + ' shortcuts');
      for (const shortcut of shortcuts) assert.equal(shortcut.open, false, s.id + ' shortcuts are collapsed');
    }
    assert.ok(sourceLinks > 0, 'source terms are actually linked');
  });
  await test('study guides render linked summaries and key points with precise targets', async () => {
    let guidesWithLinks = 0, summaryLinks = 0, keyPointLinks = 0;
    for (const s of S) {
      await go(s.id);
      const guide = main().querySelector('.guide');
      const links = guide.querySelectorAll('[data-definition]');
      guidesWithLinks += Boolean(links.length);
      summaryLinks += guide.querySelector('p').querySelectorAll('[data-definition]').length;
      keyPointLinks += guide.querySelectorAll('li').reduce((count, li) => count + li.querySelectorAll('[data-definition]').length, 0);
      for (const link of links) {
        assert.ok(owners.has(link.dataset.definition), s.id + ' broken guide definition');
        assert.equal(link.getAttribute('href'), '#' + link.dataset.definition);
        assert.equal(link.querySelectorAll('a').length, 0, s.id + ' nested guide link');
      }
    }
    assert.ok(guidesWithLinks > 1, 'representative study guides contain definition links');
    assert.ok(summaryLinks > 0, 'summary terms link to definitions');
    assert.ok(keyPointLinks > 0, 'key point terms link to definitions');
  });
  await test('definition click routes to the exact block with focus and highlighting', async () => {
    const s = S.find(s => s.definitionLinks?.some(d => owners.get(d.target)?.id !== s.id));
    assert.ok(s, 'cross-section source link exists');
    await go(s.id);
    const link = main().querySelector('.original-note').querySelectorAll('[data-definition]').find(a => owners.get(a.dataset.definition)?.id !== s.id);
    assert.ok(link, 'source contains the cross-section link');
    const target = link.dataset.definition;
    await activate(link);
    assert.equal(env.location.hash, '#' + target);
    assert.equal(scrolls.at(-1), target);
    assert.equal(doc.activeElement.id, target);
    assert.ok(doc.getElementById(target).classList.contains('anchor-target'));
    await go(s.id); // Equivalent hash restoration used by browser Back.
    assert.ok(main().querySelector('.original-note').querySelectorAll('[data-definition]').some(a => a.dataset.definition === target));
  });
  await test('keyboard activation and repeated current-target click keep precise navigation', async () => {
    await go('concepts');
    const link = nodes('[data-definition]')[0];
    assert.ok(link);
    const target = link.dataset.definition;
    await activate(link, {detail:0});
    assert.equal(scrolls.at(-1), target);
    // Add a same-target anchor inside the current article, as used by local definition terms.
    const existing = nodes('[data-definition]').find(a => a.dataset.definition === target);
    const repeated = existing || new Element('a', {'href':'#' + target, 'data-definition':target});
    const count = scrolls.length;
    const preciseHash = env.location.hash;
    assert.equal(await activate(repeated, {detail:0}), true, 'same hash is handled without a route reset');
    assert.equal(scrolls.length, count + 1);
    assert.equal(env.location.hash, preciseHash);
    assert.equal(scrolls.at(-1), target);
  });
  await test('modified definition clicks retain native new-tab behavior', async () => {
    const d = definitions[0];
    assert.ok(d);
    await go(d.target);
    const link = new Element('a', {'href':'#' + d.target, 'data-definition':d.target});
    const count = scrolls.length;
    for (const props of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {button:1}]) assert.equal(await activate(link, props), false);
    assert.equal(scrolls.length, count);
    assert.equal(env.location.hash, '#' + d.target);
  });
  await test('definition navigation reveals every enclosing proof before focusing', async () => {
    await go(S[0].id);
    const target = S[0].id + '--nested-proof-fixture';
    const outer = main().appendChild(new Element('details', {class:'proof'}));
    const inner = outer.appendChild(new Element('details', {class:'proof'}));
    const block = inner.appendChild(new Element('section', {id:target, class:'note-block definition'}));
    const link = new Element('a', {href:'#' + target, 'data-definition':target});
    const child = link.appendChild(new Element('em'));
    env.location.hash = '#' + target;
    const before = typesets.length;
    assert.equal(await activate(child, {detail:0}), true);
    assert.ok(typesets.length > before, 'math finishes before the target scroll');
    assert.equal(outer.open, true);
    assert.equal(inner.open, true);
    assert.equal(doc.activeElement, block);
    assert.equal(scrolls.at(-1), target);
  });
  await test('rapid definition navigation never scrolls to a stale target', async () => {
    for (const d of definitions.slice(0, 12)) {
      env.location.hash = '#' + d.target;
      for (const fn of env.events.hashchange || []) fn();
    }
    await flush();
    assert.equal(scrolls.at(-1), definitions[Math.min(11, definitions.length - 1)].target);
    assert.equal(maxActive, 1);
    assert.equal(errors.length, 0);
  });
  const report = {passed:results.filter(r => r.pass).length, failed:results.filter(r => !r.pass).length, definitions:definitions.length, results, limitation:'Behavioral DOM emulation; not a browser renderer or actual MathJax test.'};
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.failed ? 1 : 0;
})();
`;
new Function('require', '__dirname', 'process', harness + '\n' + checks)(require, __dirname, process);
