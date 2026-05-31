/* bas-ems — build a single self-contained bas-ems.html (all CSS+JS inlined).
 * Convenience artifact for email/USB demos. The folder version is the primary.
 * Run: bun build-single.mjs   (or: node build-single.mjs)
 */
import { readFileSync, writeFileSync } from 'fs';

let html = readFileSync('index.html', 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g, function (_, href) {
  return '<style>\n/* ' + href + ' */\n' + readFileSync(href, 'utf8') + '\n</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  return '<script>\n/* ' + src + ' */\n' + readFileSync(src, 'utf8') + '\n</script>';
});

writeFileSync('bas-ems.html', html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log('wrote bas-ems.html (' + kb + ' KB, fully self-contained)');
