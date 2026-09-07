import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
await p.goto(pathToFileURL('/home/user/fantasy-draft-tracker/index.html').href);
await p.waitForTimeout(500);
console.log(await p.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > w + 1 || r.left < -1) bad.push(`${el.tagName}.${el.className}`.slice(0,70) + ` L${Math.round(r.left)} R${Math.round(r.right)} (vw=${w})`);
  });
  return bad.slice(0,12).join('\n') + '\n scrollWidth=' + document.documentElement.scrollWidth;
}));
await b.close();
