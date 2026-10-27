// Validate every rendered formula with the same MathJax release as the wiki.
// Set MATHJAX_DIR to an installed mathjax-full/js directory if needed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=process.env.MATHJAX_DIR||path.resolve(__dirname,'../대수학 1/algebra-wiki/_vendor/mathjax-full/js');
const {mathjax}=require(base+'/mathjax.js');
const {TeX}=require(base+'/input/tex.js');
const {SVG}=require(base+'/output/svg.js');
const {liteAdaptor}=require(base+'/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler}=require(base+'/handlers/html.js');
const packages=['base','ams','newcommand','configmacros','physics','mathtools','textmacros','boldsymbol','color','bbox','unicode','extpfeil'];
const filenames={ams:'AmsConfiguration',newcommand:'NewcommandConfiguration',configmacros:'ConfigMacrosConfiguration',physics:'PhysicsConfiguration',mathtools:'MathtoolsConfiguration',textmacros:'TextMacrosConfiguration',boldsymbol:'BoldsymbolConfiguration',color:'ColorConfiguration',bbox:'BboxConfiguration',unicode:'UnicodeConfiguration',extpfeil:'ExtpfeilConfiguration'};
for(const name of packages)if(name!=='base')require(`${base}/input/tex/${name}/${filenames[name]}.js`);
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
let active={},errors=[];
const input=new TeX({packages,macros:{N:'\\mathbb{N}',Z:'\\mathbb{Z}',Q:'\\mathbb{Q}',R:'\\mathbb{R}',C:'\\mathbb{C}',PP:'\\mathbb{P}',Hom:['\\mathrm{Hom}_{#3}(#1,#2)',3],Imm:['\\mathrm{Im}\\left[#1\\right]',1],diam:['\\mathrm{diam}\\left(#1\\right)',1],RightSqP:']',xbigtoto:'\\rightrightarrows'},formatError:(jax,err)=>{errors.push({...active,message:err.message});return jax.formatError(err);}});
const doc=mathjax.document('',{InputJax:input,OutputJax:new SVG({fontCache:'local'})});
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'dist/data.js'),'utf8'),context);
const D=context.window.WIKI_DATA;
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0]==='x'?parseInt(n.slice(1),16):parseInt(n,10))).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
let total=0;
function check(math,section,display){active={section,math};doc.convert(math,{display});total++;}
for(const s of D.sections){
  // Raw TeX source is intentionally excluded from formula rendering.
  const rendered=(s.html+(s.editorialHtml||'')).replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/g,'');
  for(const m of rendered.matchAll(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g))check(decode(m[1]??m[2]),s.id,m[2]!==undefined);
  for(const text of [s.summary,...s.keyPoints,...s.issues.flatMap(i=>[i.original,i.correction,i.reason])])
    for(const m of text.matchAll(/\$([^$]+)\$/g))check(m[1],s.id,false);
}
const report={total,errors};
if(!process.argv.includes('--no-report'))fs.writeFileSync(path.join(__dirname,'_work/math-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({total,errors:errors.length,firstErrors:errors.slice(0,25)},null,2));
if(errors.length)process.exitCode=1;
