// Local regression uses explicit browser fixtures. --staging-public is read-only.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(tmpdir(), 'asedeliya-3c-tools/node_modules/playwright'));
const staging = process.argv.includes('--staging-public');
const base = staging ? 'https://asedeliya-staging-web.onrender.com' : 'http://127.0.0.1:4173';
const evidence = { staging, checks: [], errors: [] };
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const context = await browser.newContext();
  const user = {id:1,role:'user',full_name:'Local acceptance fixture with a deliberately long name',email:'local.acceptance.long.email.for.responsive.test@example.com',phone:null,preferred_language:'ru'};
  if(!staging) {
    await context.route('**/api/**', async route => {
      const url=new URL(route.request().url());
      let data=[]; let status=200;
      if(url.pathname.endsWith('/auth/login')) data={user,token:'local-ui-fixture'};
      else if(route.request().headers().authorization !== 'Bearer local-ui-fixture' && !url.pathname.includes('/catalog/') && !url.pathname.includes('/special-offers')) { status=401; data={message:'Session expired'}; }
      else if(url.pathname.endsWith('/auth/profile')) data=user;
      else if(url.pathname.endsWith('/favorites')) data={data:[]};
      else if(url.pathname.endsWith('/payments/readiness')) data={payment:{mode:'disabled',provider:'none',realChargesEnabled:false}};
      else if(url.pathname.endsWith('/notifications/status')) data={channel:{mode:'disabled'}};
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
  }
  const page=await context.newPage();
  page.on('pageerror', e=>evidence.errors.push(e.message));
  page.on('dialog', dialog=>dialog.accept());
  await page.goto(base);
  if(!staging) await page.evaluate(user=>{localStorage.setItem('token','local-ui-fixture');localStorage.setItem('user',JSON.stringify(user));},user);
  for(const [width,height] of [[390,844],[768,1024],[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});
    if(staging) {
      const route='/results?provider=hotelbeds&country=Turkey&city=Antalya&destinationCode=AYT&departureDate=2026-12-01&nights=7&people=2&children=1&childrenAges=8&food=AI&stars=5';
      let searchRequests=0;
      const listener=req=>{if(req.url().includes('/api/search'))searchRequests++;};
      page.on('request',listener);
      await page.goto(base+route);
      await page.waitForTimeout(2000);
      await page.reload();
      await page.waitForTimeout(1500);
      const text=await page.locator('body').innerText();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      evidence.checks.push({label:'results query/F5 provider error',width,overflow,searchRequests,body:text.slice(0,1600)});
      const filter=page.locator('.mobile-filter-button');
      if(await filter.isVisible()) {
        await filter.click(); await page.waitForTimeout(150);
        evidence.checks.push({label:'filters modal',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});
      }
      await page.screenshot({path:path.join(tmpdir(),`asedeliya-3c-search-${width}.png`),fullPage:true});
      page.off('request',listener);
    } else {
      await page.goto(base+'/profile'); await page.waitForSelector('.profile-hero');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`profile overflow ${width}`);
      assert.equal(await page.locator('input[type=date]').inputValue(),'');
      evidence.checks.push({label:'profile long name/email, blank DOB, no overflow',width,pass:true});
    }
  }
  if(staging) {
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/'); await page.locator('.nav-toggle').click();
    evidence.checks.push({label:'mobile anonymous login navigation',visible:await page.locator('a[href="/login"]:visible').count()});
    await page.screenshot({path:path.join(tmpdir(),'asedeliya-3c-menu.png'),fullPage:false});
    await page.goto(base+'/profile'); await page.waitForURL('**/login');
    evidence.checks.push({label:'anonymous direct profile redirects after hydration',pass:true});
    // Inspect the served JS without logging its contents.
    const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src));
    let forbidden=false, apiUrl=false;
    for(const src of scripts){const text=await (await context.request.get(src)).text(); forbidden ||= /postgres(?:ql)?:\/\/|JWT_SECRET|HOTELBEDS_(?:LIVE_)?API_(?:KEY|SECRET)|DATABASE_URL/.test(text);apiUrl ||= text.includes('https://asedeliya-staging-api.onrender.com/api');}
    evidence.checks.push({label:'served bundle public API URL and secret markers',apiUrl,forbidden});
  } else {
    await page.setViewportSize({width:390,height:844});
    await page.locator('.nav-toggle').click();
    assert.equal(await page.getByRole('button',{name:'Выйти',exact:true}).isVisible(),true);
    evidence.checks.push({label:'mobile logout action visible',pass:true});
    await page.setViewportSize({width:1366,height:768});
    const other=await context.newPage();await other.goto(base+'/my-bookings');await other.waitForTimeout(200);
    await page.getByRole('button',{name:'Выйти',exact:true}).click();
    await other.waitForURL('**/login');
    evidence.checks.push({label:'cross-tab logout removes protected page',pass:true});
    await page.goto(base+'/profile'); await page.waitForURL('**/login');
    await page.locator('input[type=email]').fill('local@example.com');await page.locator('input[type=password]').fill('local-fixture-only');await page.locator('button[type=submit]').click();await page.waitForURL(base+'/');
    await page.goto(base+'/profile');await page.waitForSelector('.profile-hero');await page.reload();await page.waitForSelector('.profile-hero');
    evidence.checks.push({label:'repeat login and F5 restore auth',pass:true});
    await page.evaluate(()=>localStorage.setItem('token','invalid-ui-fixture'));await page.goto(base+'/profile');await page.waitForURL('**/login');
    evidence.checks.push({label:'401 removes protected page without reload',pass:true});
    await page.goBack();await page.waitForTimeout(200);
    assert.equal(new URL(page.url()).pathname === '/profile',false);
    evidence.checks.push({label:'back after expired session cannot restore profile',pass:true});
    await page.goto(base+'/');await page.setViewportSize({width:390,height:844});await page.locator('.nav-toggle').click();
    assert.equal(await page.locator('a[href="/login"]:visible').count(),1);
    await page.locator('.mobile-nav-account a[href="/login"]').click();
    await page.waitForURL('**/login');
    evidence.checks.push({label:'mobile login action visible',pass:true});
  }
  console.log(JSON.stringify(evidence));
} finally {
  fs.writeFileSync(path.join(tmpdir(),`asedeliya-3c-ui-${staging?'staging':'local'}.json`),JSON.stringify(evidence,null,2));
  await browser.close();
}
