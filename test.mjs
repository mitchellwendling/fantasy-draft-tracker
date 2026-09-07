import { chromium } from 'playwright';
import { pathToFileURL } from 'url';

const URL = pathToFileURL('/home/user/fantasy-draft-tracker/index.html').href;
const errs = [];
let pass = 0, fail = 0;
function ok(name, cond, extra='') {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('dialog', async d => { await d.accept(); });

await page.goto(URL);
await page.waitForTimeout(400);

console.log('\n-- boot --');
ok('no console/page errors', errs.length === 0, errs.join(' | '));
ok('8 team cards', await page.locator('.team-card').count() === 8);
ok('scoreboard rendered', (await page.locator('.sb').count()) >= 5);
ok('history has 8 seasons', await page.evaluate(() => document.querySelectorAll('#histYearSeg button').length) === 8);
ok('empty state shown', await page.locator('.empty-state').isVisible());

console.log('\n-- autocomplete + history lookup --');
await page.fill('#inPlayer', 'bijan');
await page.waitForTimeout(200);
ok('autocomplete opens', await page.locator('.ac-item').count() > 0);
const acText = await page.locator('.ac-item').first().innerText();
ok('suggests Bijan Robinson', /Bijan Robinson/i.test(acText), acText);
ok('shows historical avg', /avg \$/.test(acText), acText);
await page.locator('.ac-item').first().click();
await page.waitForTimeout(150);
ok('position auto-filled to RB', await page.inputValue('#inPos') === 'RB');
const note = await page.locator('#entryNote').innerText();
ok('entry note cites past price', /\$/.test(note), note);

console.log('\n-- record a pick --');
await page.fill('#inPrice', '72');
await page.selectOption('#inTeam', { label: 'Mitchell (me)' });
await page.click('#btnAddPick');
await page.waitForTimeout(250);
ok('pick in feed', (await page.locator('.feed-item').count()) === 1);
ok('feed shows price', /\$72/.test(await page.locator('.feed-item').first().innerText()));
const mitch = await page.locator('.team-card.is-mine').innerText();
ok('Mitchell left = $128', /\$128/.test(mitch), mitch);
ok('Bijan in RB slot', /RB\s*Bijan Robinson/i.test(mitch.replace(/\n/g,' ')), mitch.slice(0,200));
ok('form cleared', await page.inputValue('#inPlayer') === '');
ok('nomination advanced', /Randy/.test(await page.locator('#nomBody').innerText()));

console.log('\n-- max bid math --');
// Mitchell: $128 left, 16 open spots -> max bid 113
ok('max bid = $113', /max \$113/.test(mitch), mitch);

console.log('\n-- duplicate detection --');
await page.fill('#inPlayer', 'Bijan Robinson');
await page.waitForTimeout(200);
const dupNote = await page.locator('#entryNote').innerText();
ok('flags already drafted', /already on Mitchell/i.test(dupNote), dupNote);

console.log('\n-- typed name auto-resolves position --');
await page.fill('#inPlayer', 'Brock Bowers');
await page.locator('#inPlayer').blur();
await page.waitForTimeout(200);
ok('Bowers auto-set to TE', await page.inputValue('#inPos') === 'TE', await page.inputValue('#inPos'));
await page.fill('#inPlayer', 'Jonathan Taylor');
await page.locator('#inPlayer').blur();
await page.waitForTimeout(200);
ok('Taylor auto-set to RB', await page.inputValue('#inPos') === 'RB', await page.inputValue('#inPos'));
// a hand-picked position must survive
await page.selectOption('#inPos', 'WR');
await page.fill('#inPlayer', 'Derrick Henry');
await page.locator('#inPlayer').blur();
await page.waitForTimeout(200);
ok('manual position is respected', await page.inputValue('#inPos') === 'WR', await page.inputValue('#inPos'));
await page.fill('#inPlayer', '');

console.log('\n-- persistence --');
await page.reload();
await page.waitForTimeout(300);
await page.fill('#inPlayer', 'Ja\'Marr Chase');
await page.locator('#inPlayer').blur();
await page.waitForTimeout(150);
ok('Chase auto-set to WR', await page.inputValue('#inPos') === 'WR', await page.inputValue('#inPos'));
await page.fill('#inPrice', '80');
await page.selectOption('#inTeam', { label: 'Ryan' });
await page.click('#btnAddPick');
await page.waitForTimeout(200);
await page.reload();
await page.waitForTimeout(400);
ok('picks survive reload', (await page.locator('.feed-item').count()) === 2);
ok('no errors after reload', errs.length === 0, errs.join(' | '));

console.log('\n-- undo / redo --');
// the undo stack is in-memory, so make a fresh change post-reload to undo
await page.fill('#inPlayer', 'Brock Bowers');
await page.fill('#inPrice', '9');
await page.selectOption('#inTeam', { label: 'Andy' });
await page.click('#btnAddPick');
await page.waitForTimeout(200);
ok('third pick added', (await page.locator('.feed-item').count()) === 3);
await page.click('#btnUndo');
await page.waitForTimeout(200);
ok('undo removes pick', (await page.locator('.feed-item').count()) === 2);
await page.click('#btnRedo');
await page.waitForTimeout(200);
ok('redo restores pick', (await page.locator('.feed-item').count()) === 3);

console.log('\n-- remove a pick --');
await page.locator('.feed-item .fi-x').first().click();
await page.waitForTimeout(200);
ok('pick removed', (await page.locator('.feed-item').count()) === 2);
await page.click('#btnUndo');
await page.waitForTimeout(200);

console.log('\n-- tabs --');
for (const t of ['board','players','history','setup']) {
  await page.click(`.tab[data-tab="${t}"]`);
  await page.waitForTimeout(250);
  ok(`${t} panel visible`, await page.locator(`.panel[data-panel="${t}"]`).isVisible());
}
await page.click('.tab[data-tab="board"]');
await page.waitForTimeout(200);
const boardRows = await page.locator('#boardTable tbody tr').count();
ok('board has 17 slots + 2 totals', boardRows === 19, String(boardRows));

await page.click('.tab[data-tab="players"]');
await page.waitForTimeout(250);
ok('pool table populated', (await page.locator('#poolTable tbody tr').count()) > 100);
await page.fill('#poolSearch', 'kelce');
await page.waitForTimeout(250);
const kelceRow = await page.locator('#poolTable tbody tr').first().innerText();
ok('pool search finds Kelce', /Kelce/i.test(kelceRow), kelceRow);
ok('Kelce shows price history', /\$/.test(kelceRow), kelceRow);

console.log('\n-- market heat is suppressed early --');
await page.click('.tab[data-tab="draft"]');
await page.waitForTimeout(200);
ok('no bogus heat % off a few picks', /early/i.test(await page.locator('#scoreboard').innerText()), await page.locator('#scoreboard').innerText());

await page.click('.tab[data-tab="history"]');
await page.waitForTimeout(250);
await page.fill('#histSearch', 'mccaffery');
await page.waitForTimeout(300);
const histText = await page.locator('#histResult').innerText();
ok('fuzzy history lookup works', /2023|2022|2020/.test(histText), histText.slice(0,160));
await page.fill('#histSearch', 'Christian McCaffrey');
await page.waitForTimeout(300);
ok('correct spelling also matches', /drafts/.test(await page.locator('#histResult').innerText()));
await page.fill('#histSearch', 'zeke');
await page.waitForTimeout(300);
ok('nickname alias works', /drafts/.test(await page.locator('#histResult').innerText()));

console.log('\n-- setup edits --');
await page.click('.tab[data-tab="setup"]');
await page.waitForTimeout(250);
await page.fill('#setBudget', '250');
await page.locator('#setBudget').blur();
await page.waitForTimeout(250);
await page.click('.tab[data-tab="draft"]');
await page.waitForTimeout(250);
ok('budget change flows through', /\$250|of \$2000/.test(await page.locator('#scoreboard').innerText()), await page.locator('#scoreboard').innerText());
await page.click('.tab[data-tab="setup"]');
await page.fill('#setBudget', '200');
await page.locator('#setBudget').blur();
await page.waitForTimeout(200);

console.log('\n-- exports --');
const csv = await page.evaluate(() => {
  const a = document.createElement('a');
  return null;
});
await page.click('.tab[data-tab="draft"]');
await page.waitForTimeout(200);

console.log('\n-- mobile layout --');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
ok('no horizontal page scroll on phone', !hScroll);
await page.screenshot({ path: '/tmp/claude-0/-home-user-herewego/23e5cfd4-28ae-55f9-9ea3-0e4cd75e54d3/scratchpad/mobile.png', fullPage: false });

await page.setViewportSize({ width: 1400, height: 950 });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-0/-home-user-herewego/23e5cfd4-28ae-55f9-9ea3-0e4cd75e54d3/scratchpad/desktop.png' });

console.log('\n-- final --');
ok('zero errors overall', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
