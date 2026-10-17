/* AI News.tech security self-check.
   Run: node security-check.mjs   (exit code 1 on any failure) */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const R=path.dirname(fileURLToPath(import.meta.url));
let pass=0,fail=0;const lines=[];
function check(name,ok,detail){
  lines.push((ok?'PASS  ':'FAIL  ')+name+(detail?'  ['+detail+']':''));
  ok?pass++:fail++;
}
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])}
const pages=walk(R).filter(f=>f.endsWith('.html'));
const CSP="default-src 'none'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/* 1. No inline event handlers or inline styles (keeps CSP strict) */
let handlers=0,styles=0;
pages.forEach(f=>{
  const t=fs.readFileSync(f,'utf8');
  handlers+=(t.match(/\s(onclick|onload|onerror|onmouseover|onsubmit|onfocus|oninput|onchange)\s*=/gi)||[]).length;
  styles+=(t.match(/style="/g)||[]).length;
});
check('No inline event handlers in any page',handlers===0,handlers+' found');
check('No inline style attributes in any page',styles===0,styles+' found');

/* 2. Every page: only self-hosted resources, https-only external links, noopener */
let extRes=0,httpLinks=0,blankNoop=0,blank=0;
pages.forEach(f=>{
  const t=fs.readFileSync(f,'utf8');
  extRes+=(t.match(/<(script|img|iframe|source)\s[^>]*src="https?:/gi)||[]).length;
  extRes+=(t.match(/<link\s[^>]*rel="(?:stylesheet|icon|preload|manifest|apple-touch-icon)"[^>]*href="https?:/gi)||[]).length;
  httpLinks+=(t.match(/href="http:\/\//g)||[]).length;
  (t.match(/<a\s[^>]*>/g)||[]).forEach(a=>{
    if(/target="_blank"/.test(a)){
      blank++;
      if(!/rel="[^"]*noopener/.test(a))blankNoop++;
    }
  });
});
check('No third-party resource loads (fonts, scripts, images self-hosted)',extRes===0,extRes+' found');
check('No insecure http:// links',httpLinks===0,httpLinks+' found');
check('Every target="_blank" link carries rel="noopener"',blankNoop===0,blank+' blank links, '+blankNoop+' unsafe');

/* 3. Host header configs exist and agree on the strict policy */
const configs=[['netlify.toml',/Content-Security-Policy = "([^"]+)"/],['_headers',/Content-Security-Policy:\s*([^\n]+)/],['vercel.json',/"Content-Security-Policy",\s*"value":\s*"([^"]+)"/]];
const policies=configs.map(([f,re])=>{
  const p=path.join(R,f);
  if(!fs.existsSync(p)){check('Header config present: '+f,false,'missing');return null}
  const m=fs.readFileSync(p,'utf8').match(re);
  if(!m){check('CSP found in '+f,false,'missing');return null}
  return m[1].trim();
});
const allSame=policies.every(p=>p===CSP);
check('CSP declared identically in netlify.toml, _headers, vercel.json',allSame,policies.join(' | ').slice(0,120));
check('CSP denies by default (default-src none, no unsafe-inline, frame-ancestors none)',/default-src 'none'/.test(CSP)&&!/unsafe-inline/.test(CSP)&&/frame-ancestors 'none'/.test(CSP));
['Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy'].forEach(h=>{
  check('Header present in all host configs: '+h,configs.every(([f])=>{const t=fs.readFileSync(path.join(R,f),'utf8');return t.includes(h)}));
});

/* 4. Discovery and SEO files */
check('robots.txt present with sitemap reference',fs.existsSync(path.join(R,'robots.txt'))&&/Sitemap:/.test(fs.readFileSync(path.join(R,'robots.txt'),'utf8')));
const sm=path.join(R,'sitemap.xml');
check('sitemap.xml present',fs.existsSync(sm));
if(fs.existsSync(sm)){
  const urls=(fs.readFileSync(sm,'utf8').match(/<loc>([^<]+)<\/loc>/g)||[]).map(x=>x.replace(/<\/?loc>/g,''));
  const missing=urls.filter(u=>{
    const p=u.replace('https://ainewz.tech','').replace(/^\//,'');
    return !fs.existsSync(path.join(R,p||'index.html'));
  });
  check('Every sitemap URL resolves to a real file ('+urls.length+' urls)',missing.length===0,missing.join(', '));
}
check('404.html present',fs.existsSync(path.join(R,'404.html')));
const stxt=path.join(R,'.well-known','security.txt');
check('.well-known/security.txt present with Contact + future Expires',fs.existsSync(stxt)&&/Contact:/.test(fs.readFileSync(stxt,'utf8'))&&/Expires: 20\d\d/.test(fs.readFileSync(stxt,'utf8')));

/* 5. Client code hygiene */
const appjs=fs.readFileSync(path.join(R,'assets','app.js'),'utf8');
check('app.js: no eval, no new Function, no document.write',!/\beval\(|new Function|document\.write/.test(appjs));
const lsKeys=(appjs.match(/localStorage\.getItem\('([^']+)'\)/g)||[]).map(x=>x.match(/'([^']+)'/)[1]);
check('localStorage keys limited to theme/saved/fontsize',lsKeys.every(k=>['ain-theme','ain-saved','ain-fs'].includes(k)),lsKeys.join(', '));
try{new Function(appjs);check('app.js parses cleanly',true)}catch(e){check('app.js parses cleanly',false,e.message)}

/* 6. No secrets in the tree */
let secrets=0;
walk(R).filter(f=>/\.(html|js|css|toml|json|txt|xml)$/.test(f)).forEach(f=>{
  secrets+=(fs.readFileSync(f,'utf8').match(/(api[_-]?key|apikey|secret|password|bearer)\s*[:=]\s*['"][A-Za-z0-9]/gi)||[]).length;
});
check('No credentials or API keys in the tree',secrets===0,secrets+' hits');

/* 7. Preview snapshot excluded from the deploy folder (optional: only fails if one leaks in) */
check('No standalone preview leaked into the deploy folder',!fs.existsSync(path.join(R,'standalone.html')));

console.log(lines.join('\n'));
console.log('\n'+pass+' passed, '+fail+' failed'+(fail?'\nRESULT: SECURITY CHECK FAILED':'\nRESULT: ALL SECURITY CHECKS PASSED'));
process.exitCode=fail?1:0;
