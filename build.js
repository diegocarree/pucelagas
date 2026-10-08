// Genera la web completa como archivos estáticos en /dist. Uso: node build.js
const fs = require('fs'), path = require('path');
const { snapshotToFile } = require('./_data');
const OUT = path.join(__dirname, 'dist');
const run = async (file, query) => {
  const r = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = b; return this; } };
  await require('./' + file)({ method: 'GET', query }, r);
  if (r.code !== 200) throw new Error(`${file} ${JSON.stringify(query)} devolvió ${r.code}`);
  return r.body;
};
const write = (rel, content) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content)); };
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  await snapshotToFile();                                   // guarda el precio medio/mínimo de hoy
  const data = await run('gasolineras.js', {});
  if (!data.stations.length) throw new Error('El Ministerio no devolvió gasolineras');
  write('data.json', data);
  for (const f of ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'manifest.webmanifest', 'robots.txt', 'acerca.html', 'privacidad.html', 'aviso-legal.html', 'ads.txt'])
    if (fs.existsSync(f)) write(f, fs.readFileSync(f, 'utf8'));
  const fuels = { diesel: 'diesel-valladolid', g95: 'gasolina-95-valladolid', g98: 'gasolina-98-valladolid', dieselp: 'diesel-premium-valladolid', glp: 'glp-autogas-valladolid' };
  for (const [tipo, p] of Object.entries(fuels)) write(`${p}.html`, await run('seo.js', { tipo }));
  for (const s of data.stations) write(`gasolinera/${s.slug}.html`, await run('seo.js', { tipo: 'estacion', id: s.slug }));
  for (const z of new Set(data.stations.map((s) => s['C.P.']).filter(Boolean))) write(`gasolineras-cp/${z}.html`, await run('seo.js', { tipo: 'cp', id: z }));
  write('guias.html', await run('guias.js', {}));
  for (const g of ['gasolina-95-vs-98', 'como-ahorrar-combustible', 'donde-repostar-mas-barato']) write(`guias/${g}.html`, await run('guias.js', { slug: g }));
  write('sitemap.xml', await run('sitemap.js', {}));
  write('404.html', '<!doctype html><meta charset="utf-8"><title>No encontrada — PucelaGas</title><link rel="stylesheet" href="/styles.css"><main class="seo-section" style="margin:40px auto;max-width:700px"><div class="seo-copy"><h1>Página no encontrada</h1><p><a href="/">Volver al mapa</a></p></div></main>');
  write('_headers', '/data.json\n  Cache-Control: public, max-age=300\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
  console.log(`OK: ${data.stations.length} gasolineras, web generada en dist/`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
