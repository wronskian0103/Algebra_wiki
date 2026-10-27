// Behavioral QA only: deliberately small DOM emulator, not a browser renderer.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.dirname(__dirname);
const decode = s => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
class Element {
  constructor(tag, attrs={}) { this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.parentElement=null;this.listeners={};this.value='';this.open=false;this.hidden='hidden' in attrs;this.dataset={};for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.classList={contains:c=>(this.attrs.class||'').split(/\s+/).includes(c),add:c=>this.classList.toggle(c,true),remove:c=>this.classList.toggle(c,false),toggle:(c,force)=>{const s=new Set((this.attrs.class||'').split(/\s+/).filter(Boolean));const on=force===undefined?!s.has(c):force;on?s.add(c):s.delete(c);this.attrs.class=[...s].join(' ');return on;}}; }
  get id(){return this.attrs.id||'';}
  set innerHTML(html){this._html=html;this.children=[];parseInto(this,html);}
  get innerHTML(){return this._html||'';}
  get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
  set textContent(t){this._html=String(t);this.children=[String(t)];}
  appendChild(c){if(typeof c!=='string')c.parentElement=this;this.children.push(c);return c;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  matches(sel){if(sel.includes(','))return sel.split(',').some(s=>this.matches(s.trim()));if(sel.startsWith('#'))return this.id===sel.slice(1);const a=sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(a)return a[1] in this.attrs&&(a[2]===undefined||this.attrs[a[1]]===a[2]);const [tag,cl]=sel.split('.');return(!tag||this.tagName===tag.toUpperCase())&&(!cl||this.classList.contains(cl));}
  querySelectorAll(sel){const all=[];const visit=e=>{for(const c of e.children)if(typeof c!=='string'){if(c.matches(sel))all.push(c);visit(c);}};visit(this);return all;}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  closest(sel){for(let x=this;x;x=x.parentElement)if(x.matches(sel))return x;return null;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  async emit(type,event={}){event.target??=this;event.preventDefault??=()=>{};for(const fn of this.listeners[type]||[])await fn(event);}
  focus(){doc.activeElement=this;}
  blur(){if(doc.activeElement===this)doc.activeElement=null;}
  scrollIntoView(){scrolls.push(this.id);}
}
function parseInto(parent,html){const stack=[parent],voids=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);let at=0;const re=/<\/?([a-z][\w:-]*)\b([^<>]*?)>/gi;let m;while((m=re.exec(html))){if(m.index>at)stack.at(-1).appendChild(decode(html.slice(at,m.index)));at=re.lastIndex;if(m[0].startsWith('</')){const i=stack.findLastIndex(e=>e.tagName===m[1].toUpperCase());if(i>0)stack.length=i;continue;}const attrs={};const a=/([^\s=/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let am;while((am=a.exec(m[2])))attrs[am[1]]=decode(am[2]??am[3]??am[4]??'');const e=stack.at(-1).appendChild(new Element(m[1],attrs));if(!voids.has(e.tagName)&&!m[0].endsWith('/>'))stack.push(e);}if(at<html.length)stack.at(-1).appendChild(decode(html.slice(at)));}
let doc,scrolls=[],typesets=[],errors=[],activeTypesets=0,maxActive=0;
function makeContext(storageSeed={}){
  doc=new Element('document');doc.innerHTML=fs.readFileSync(path.join(root,'web/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');doc.documentElement=doc.querySelector('html');doc.getElementById=id=>doc.querySelector('#'+id);doc.activeElement=null;
  const events={},storage=new Map(Object.entries(storageSeed));let hash='';
  const location={get hash(){return hash;},set hash(h){hash=h.startsWith('#')?h:'#'+h;},get href(){return'file:///Algebra/dist/index.html'+hash;}};
  const window={document:doc,location,scrollTo:()=>{},print:()=>{},addEventListener:(n,fn)=>(events[n]??=[]).push(fn)};
  const MathJax={startup:{promise:Promise.resolve()},typesetClear:()=>{},typesetPromise:async nodes=>{activeTypesets++;maxActive=Math.max(maxActive,activeTypesets);typesets.push(location.hash);await new Promise(r=>setTimeout(r,1));activeTypesets--;}};
  window.MathJax=MathJax;window.window=window;
  const context=vm.createContext({window,document:doc,location,history:{replaceState:(_,__,h)=>{location.hash=h;}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{clipboard:{writeText:async t=>{context.copied=t;}}},MathJax,URLSearchParams,console:{log:console.log,error:(...a)=>errors.push(a.map(String).join(' '))},setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(root,'dist/data.js'),'utf8'),context,{filename:'data.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'web/app.js'),'utf8'),context,{filename:'app.js'});
  return{context,storage,window,events,location};
}
let env=makeContext();
const main=()=>doc.getElementById('main');
const nodes=sel=>main().querySelectorAll(sel);
async function flush(){await env.window.ALGEBRA_WIKI.ready();await new Promise(r=>setTimeout(r,2));}
async function go(hash){env.location.hash=hash;for(const fn of env.events.hashchange||[])fn();await flush();}
async function click(b){assert.ok(b,'click target exists');await main().emit('click',{target:b});await flush();}
async function input(id,value){const e=doc.getElementById(id);assert.ok(e,'input exists');e.value=value;await main().emit('input',{target:e});await flush();}
async function change(id,value){const e=doc.getElementById(id);assert.ok(e,'select exists');e.value=value;await main().emit('change',{target:e});await flush();}
const results=[];
async function test(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
(async()=>{
  await flush();
  const D=env.window.WIKI_DATA,S=D.sections,byId=Object.fromEntries(S.map(s=>[s.id,s])),bySource=Object.fromEntries(D.sources.map(s=>[s.id,s]));
  await test('home derives counts and cards from unified data',async()=>{
    assert.equal(env.window.ALGEBRA_WIKI.sections,81);assert.equal(env.window.ALGEBRA_WIKI.chapters,8);assert.equal(env.window.ALGEBRA_WIKI.sources,4);
    assert.equal(nodes('.chapter-card').length,D.chapters.length);assert.equal(doc.getElementById('section-count').textContent,'81');assert.equal(doc.getElementById('source-count').textContent,'4 files');
    for(const c of D.chapters)assert.ok(main().textContent.includes(c.title));
    assert.ok(main().textContent.includes('Algebra, connected.'));assert.ok(main().textContent.includes('Algebra I + II')||main().textContent.includes('ALGEBRA I + II'));
  });
  await test('all 81 section routes render source-aware articles',async()=>{
    for(const s of S){
      await go(s.id);assert.ok(main().textContent.includes(s.titleEn),s.id);assert.ok(main().textContent.includes(bySource[s.sourceId].title),s.id+' source absent');
      assert.equal(doc.title,`${s.titleEn} · ${s.course||'Algebra'} · Algebra Wiki`);assert.equal(JSON.parse(env.storage.get('unified-algebra-last')),s.id);
      assert.ok(nodes('a').some(a=>a.getAttribute('href')===bySource[s.sourceId].path),'source download '+s.id);
    }
  });
  await test('all statement and proof anchors exist and representative routes scroll',async()=>{
    const representatives=new Map();
    for(const s of S){await go(s.id);for(const b of s.blocks){assert.ok(doc.getElementById(b.id),`${b.id} absent`);if(!representatives.has(b.kind))representatives.set(b.kind,b.id);}}
    for(const id of representatives.values()){await go(id);assert.equal(scrolls.at(-1),id);}
  });
  await test('all eight chapter routes preserve original section numbers',async()=>{
    for(const c of D.chapters){await go('contents?chapter='+c.n);const expected=S.filter(s=>s.chapterNo===c.n);assert.equal(nodes('.list-row').length,expected.length,c.title);assert.deepEqual(nodes('.row-no').map(e=>e.textContent),Array.from(expected,s=>s.number));}
  });
  await test('chapter and course filters update counts and URL',async()=>{
    await go('contents?chapter=4');assert.equal(nodes('.list-row').length,6);
    await click(nodes('[data-chapter]').find(b=>b.dataset.chapter==='5'));assert.equal(nodes('.list-row').length,11);assert.equal(env.location.hash,'#contents?chapter=5');
    await change('course-filter','Algebra I');assert.equal(nodes('.list-row').length,48);assert.equal(new URLSearchParams(env.location.hash.split('?')[1]).get('course'),'Algebra I');
    await change('course-filter','Algebra II');assert.equal(nodes('.list-row').length,33);
    await go('contents?chapter=8&course=Algebra%20II');assert.equal(nodes('.list-row').length,4);
    await go('contents?chapter=8&course=Algebra%20I');assert.equal(nodes('.list-row').length,0);
  });
  await test('contents live search filters and queues typesetting',async()=>{
    await go('contents');let count=typesets.length;await click(nodes('[data-chapter]').find(b=>b.dataset.chapter==='5'));assert.ok(typesets.length>count);
    count=typesets.length;await input('contents-search','module');assert.ok(nodes('.list-row').length>0&&nodes('.list-row').length<=11);assert.ok(typesets.length>count);
    await input('contents-search','zzzzzzzzzzz');assert.equal(nodes('.list-row').length,0);assert.ok(main().textContent.includes('No matching sections.'));
  });
  await test('skip link focuses main without navigating to a missing route',async()=>{
    await go('a2s01');const before=env.location.hash;let prevented=false;await doc.querySelector('.skip-link').emit('click',{preventDefault:()=>{prevented=true;}});
    assert.ok(prevented);assert.equal(env.location.hash,before);assert.equal(doc.activeElement,main());assert.equal(scrolls.at(-1),'main');assert.ok(main().textContent.includes(byId.a2s01.titleEn));
  });
  await test('statement filters have complete counts and source labels',async()=>{
    await go('theorems');assert.equal(nodes('.theorem-entry').length,D.stats.theorem);
    for(const kind of ['theorem','proposition','lemma','corollary','definition','example']){
      await click(nodes('[data-kind]').find(b=>b.dataset.kind===kind));const entries=nodes('.theorem-entry');assert.equal(entries.length,D.stats[kind],kind);
      for(const entry of entries){const href=entry.querySelector('a').getAttribute('href').slice(1);const s=byId[href.split('--')[0]];assert.equal(entry.querySelector('.tag').textContent,bySource[s.sourceId].title);}
    }
    await click(nodes('[data-kind]').find(b=>b.dataset.kind==='definition'));await input('theorem-search','1.1.1');assert.ok(nodes('.theorem-entry').length>0);
    await input('theorem-search','zzzzzzzzzzz');assert.equal(nodes('.theorem-entry').length,0);
  });
  await test('exercise chapter, problem filters, and homework routes are absent',async()=>{
    assert.equal(D.chapters.length,8);assert.ok(D.chapters.every(c=>!/exercise|solution/i.test(c.title)));
    assert.ok(S.every(s=>!/^hw\d/i.test(s.id)&&s.chapterNo!==9));assert.ok(D.sources.every(s=>!/^hw\d|homework/i.test(s.id)));
    assert.ok(S.every(s=>s.blocks.every(b=>!['problem','exercise','solution'].includes(b.kind))));
    await go('theorems');assert.ok(nodes('[data-kind]').every(b=>!['problem','exercise','solution'].includes(b.dataset.kind)));
    for(const route of ['hw01','hw06','hw01--problem-1']){await go(route);assert.ok(main().textContent.includes('This section could not be found.'));}
    for(const query of ['Homework 1','HW1.1','Exercises and Solutions']){await go('search?q='+encodeURIComponent(query));assert.equal(nodes('.list-row').length,0);}
    await go('contents');assert.ok(nodes('.list-row').every(row=>!/^#hw\d/i.test(row.getAttribute('href'))));
  });
  await test('concept filtering includes both courses and valid cross-source links',async()=>{
    await go('concepts');assert.ok(nodes('.concept-card').length>200);
    const validTargets=new Set(S.flatMap(s=>[s.id,s.id+'--original',...s.blocks.map(b=>b.id)]));
    assert.ok(nodes('a').every(a=>validTargets.has(a.getAttribute('href').slice(1))));
    await input('concept-search','tensor');assert.ok(nodes('.concept-card').length>0);assert.ok(nodes('a').some(a=>a.getAttribute('href').startsWith('#a2')));
    await input('concept-search','Sylow');assert.ok(nodes('.concept-card').length>0);assert.ok(nodes('a').some(a=>a.getAttribute('href').startsWith('#s')));
  });
  await test('bookmarks/read persist across courses with isolated storage keys',async()=>{
    for(const id of ['s01','a2s01','supp01','supp02']){await go(id);await click(nodes('[data-bookmark]')[0]);await click(nodes('[data-read]')[0]);}
    assert.deepEqual(JSON.parse(env.storage.get('unified-algebra-bookmarks')),['s01','a2s01','supp01','supp02']);assert.equal(doc.getElementById('bookmark-count').textContent,'4');assert.equal(env.storage.has('algebra-bookmarks'),false);
    await go('bookmarks');assert.equal(nodes('.list-row').length,4);assert.ok(nodes('.list-row').every(e=>e.textContent.includes('Read')));
    for(const id of ['s01','a2s01','supp01','supp02']){await go(id);assert.ok(nodes('[data-bookmark]')[0].textContent.includes('Bookmarked'));assert.equal(nodes('[data-read]')[0].textContent,'✓ Read');await click(nodes('[data-bookmark]')[0]);await click(nodes('[data-read]')[0]);}
    assert.deepEqual(JSON.parse(env.storage.get('unified-algebra-bookmarks')),[]);assert.deepEqual(JSON.parse(env.storage.get('unified-algebra-read')),[]);await go('bookmarks');assert.equal(nodes('.list-row').length,0);
  });
  await test('proof expand/collapse and copying section links',async()=>{
    for(const id of ['s03','a2s11','a2s29']){
      const s=byId[id];await go(s.id);const proofs=nodes('details.proof');assert.ok(proofs.length>0,id);
      await click(doc.getElementById('expand-proofs'));assert.ok(proofs.every(p=>p.open));await click(doc.getElementById('expand-proofs'));assert.ok(proofs.every(p=>!p.open));
      await click(doc.getElementById('copy-link'));assert.equal(env.context.copied,env.location.href);
    }
  });
  await test('source-stub badge remains visible for the unfinished Resultants source',async()=>{await go('a2s28');assert.ok(nodes('.tag').some(e=>e.textContent==='Source stub'));});
  await test('sources page lists all four downloads, coverage and checksums',async()=>{
    await go('about');for(const source of D.sources){assert.ok(main().textContent.includes(source.title));assert.ok(main().textContent.includes(source.sha256));assert.ok(nodes('a').some(a=>a.getAttribute('href')===source.path));}
    assert.ok(main().textContent.includes('81 topic pages across 8 chapters'));assert.ok(main().textContent.includes('Correction notes · '+S.flatMap(s=>s.issues).length));
  });
  for(const query of ['normal','Galois','tensor','x^2+x+1','A&B','why?','100%','<script>'])await test(`search query roundtrip ${JSON.stringify(query)}`,async()=>{
    doc.getElementById('global-search').value=query;await doc.getElementById('search-form').emit('submit');for(const fn of env.events.hashchange||[])fn();await flush();
    assert.equal(doc.getElementById('global-search').value,query);assert.ok(main().textContent.includes(query));
    for(const row of nodes('.list-row'))assert.ok(row.textContent.includes(bySource[byId[row.getAttribute('href').slice(1)].sourceId].title));
  });
  await test('Galois search spans lecture notes and standalone material',async()=>{
    await go('search?q=Galois');const ids=nodes('.list-row').map(row=>row.getAttribute('href').slice(1));
    assert.ok(ids.some(id=>byId[id].sourceId==='algebra1'));assert.ok(ids.some(id=>byId[id].sourceId==='algebra2'));assert.ok(ids.some(id=>byId[id].sourceId==='integral-galois'));
  });
  await test('unknown and malformed-percent routes show a usable missing-page state',async()=>{
    for(const route of ['unknownroute','bad%']){await go(route);assert.ok(main().textContent.includes('This section could not be found.'));assert.ok(nodes('a').some(a=>a.getAttribute('href')==='#contents'));}
  });
  await test('theme, mobile menu and search shortcut respond',async()=>{
    await doc.getElementById('theme-button').emit('click');assert.equal(doc.documentElement.dataset.theme,'dark');assert.equal(env.storage.get('unified-algebra-theme'),'dark');
    await doc.getElementById('mobile-menu').emit('click');assert.ok(doc.getElementById('sidebar').classList.contains('open'));assert.equal(doc.getElementById('nav-overlay').hidden,false);
    await doc.getElementById('nav-overlay').emit('click');assert.equal(doc.getElementById('sidebar').classList.contains('open'),false);
    doc.activeElement=main();let prevented=false;await doc.emit('keydown',{key:'/',preventDefault:()=>{prevented=true;}});assert.ok(prevented);assert.equal(doc.activeElement,doc.getElementById('global-search'));
  });
  await test('math queue remains serial during rapid cross-source navigation',async()=>{
    for(const hash of ['s01','a2s01','s03','concepts','theorems','supp02','a2s29']){env.location.hash=hash;for(const fn of env.events.hashchange||[])fn();}await flush();assert.equal(maxActive,1);assert.ok(main().textContent.includes(byId.a2s29.titleEn));assert.equal(errors.length,0);
  });
  const report={passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,coverage:{sections:S.length,chapters:D.chapters.length,sources:D.sources.length,anchors:S.reduce((n,s)=>n+s.blocks.length,0),proofs:D.stats.proof},results,math:{calls:typesets.length,maxConcurrent:maxActive,errors},limitation:'Behavioral DOM emulation; this does not verify browser layout or actual MathJax rendering.'};
  if(!process.argv.includes('--no-report'))fs.writeFileSync(path.join(__dirname,'qa-app-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
})();
