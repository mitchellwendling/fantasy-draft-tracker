/* Inline everything into one portable .html file (dist/draft-tracker.html).
 * Handy for emailing to yourself, AirDropping to a phone, or opening from a
 * USB stick in a basement with no wifi. Run: node build.mjs */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
let html = read('./index.html');

html = html.replace('<link rel="stylesheet" href="styles.css">',
  '<style>\n' + read('./styles.css') + '\n</style>');

for (const src of ['data/history.js', 'data/players.js', 'app.js']) {
  html = html.replace(`<script src="${src}"></script>`,
    '<script>\n' + read('./' + src) + '\n</script>');
}

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/draft-tracker.html', import.meta.url), html);
console.log('dist/draft-tracker.html  ' + (html.length / 1024).toFixed(0) + ' KB');

/* Second target: the same app as an Artifact body fragment. Artifacts supply
 * their own <!doctype>/<html>/<head>/<body>, so this emits title + style +
 * body contents only. */
{
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
  const out = '<title>Auction Draft Room</title>\n' + style + '\n' + body.trim() + '\n';
  writeFileSync(new URL('./dist/artifact.html', import.meta.url), out);
  console.log('dist/artifact.html       ' + (out.length / 1024).toFixed(0) + ' KB');
}
