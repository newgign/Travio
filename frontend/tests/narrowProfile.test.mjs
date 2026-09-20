import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';

const read=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');
// Exact relevant selectors, including specificity and media applicability.
function declarations(sheets,selectors,width) {
  const result={},priority={};
  for(const sheet of sheets)postcss.parse(sheet).walkRules(rule=>{
    for(let p=rule.parent;p;p=p.parent)if(p.type==='atrule') {
      const max=p.params.match(/max-width:\s*(\d+)px/);
      if(p.name!=='media'||!max||width>Number(max[1]))return;
    }
    for(const selector of rule.selectors)if(selectors.includes(selector)) {
      const normalized=selector.replace(/:is\(([^)]+)\)/g,(_,options)=>options.split(',').sort((a,b)=>(b.match(/\./g)||[]).length-(a.match(/\./g)||[]).length)[0]);
      const rank=(normalized.match(/\.[\w-]+|:last-child/g)||[]).length;
      rule.walkDecls(d=>{if(rank>=(priority[d.prop]??-1)){result[d.prop]=d.value;priority[d.prop]=rank;}});
    }
  });
  return result;
}
test('3W.2 summary wrapping at narrow widths without touching account behavior',async t=>{
  let requests=0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('No provider/payment HTTP');});
  const [profile,consumer,account,page]=await Promise.all(['styles/Profile.css','styles/Consumer.css','styles/AccountPages.css','pages/Profile.jsx'].map(read));
  const sheets=[account,profile,consumer];
  const nameSelectors=['.account-page h2','.consumer-shell :is(h1,h2,h3,p,dd,dt,.account-status,.context-chip,.stay-price)','.consumer-shell .profile-page .profile-summary h2'];
  const textSelectors=['.profile-summary > div','.consumer-shell .profile-summary > div:last-child','.consumer-shell .profile-page .profile-summary > div:last-child'];
  for(const width of [320,360,390,600,1440]) {
    const name=declarations(sheets,nameSelectors,width),text=declarations(sheets,textSelectors,width);
    if(width<=600){assert.equal(name['overflow-wrap'],'break-word');assert.equal(name['word-break'],'normal');}
    else assert.equal(name['overflow-wrap'],'anywhere','desktop baseline unchanged');
    assert.equal(text['min-width'],'0');
    if(width<=360)assert.equal(text['flex-basis'],'100%');
    else assert.equal(text['flex-basis'],undefined,'no forced stack at wider widths');
    const avatar=declarations(sheets,['.profile-avatar'],width);
    assert.equal(avatar.flex,'0 0 72px','existing avatar cannot shrink');
    const email=declarations(sheets,['.account-page p','.consumer-shell .profile-page .profile-summary p'],width);
    assert.equal(email['overflow-wrap'],'anywhere');
  }
  assert.match(page,/<h2>\{accountName\(user\)\}<\/h2><p>\{user.email\}<\/p>/);
  assert.match(consumer,/\.profile-summary \{ flex-wrap:wrap/);
  // CSS-only patch leaves all handlers and their existing regression coverage intact.
  for(const handler of ['actions.save()','onClick={actions.cancel}','actions.savePassword()'])assert.ok(page.includes(handler));
  const newRules=[];
  postcss.parse(profile).walkRules(rule=>{if(rule.selector.startsWith('.consumer-shell .profile-page .profile-summary'))newRules.push(rule.toString());});
  assert.equal(newRules.length,3);
  assert.doesNotMatch(newRules.join(''),/anywhere[^}]*h2|break-all|transform|position|margin|overflow-x|width:\s*\d+px/);
  assert.equal(requests,0);
  t.diagnostic('CSS/source evidence only. No runtime implementation added; HTTP/provider/payment=0. Browser geometry NOT RUN.');
});
