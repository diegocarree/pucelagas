// Páginas renderizadas en servidor: Google (y AdSense) ven contenido real, no una página vacía que se rellena con JS.
const { getData, getHistory } = require('./_data');
const SITE = 'https://pucelagas.es';
const FUELS = {
  diesel: { name: 'Diésel', path: '/diesel-valladolid', key: 'diesel' },
  g95: { name: 'Gasolina 95', path: '/gasolina-95-valladolid', key: 'g95' },
  g98: { name: 'Gasolina 98', path: '/gasolina-98-valladolid', key: 'g98' },
  dieselp: { name: 'Diésel premium', path: '/diesel-premium-valladolid', key: 'dieselP' },
  glp: { name: 'GLP (autogas)', path: '/glp-autogas-valladolid', key: 'glp' },
};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (n == null ? '—' : `${n.toFixed(3).replace('.', ',')} €/L`);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const fechaTxt = (f) => esc(f || new Date().toLocaleDateString('es-ES'));

function layout({ title, desc, canonical, body, ld }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap"><link rel="stylesheet" href="/styles.css">
<style>.wrap{max-width:960px;margin:28px auto;padding:0 20px}.wrap h1{font-size:clamp(28px,4vw,42px);margin:6px 0 14px}.wrap h2{margin:30px 0 10px}.wrap p,.wrap li{line-height:1.7;color:#455149}
.tbl{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)}.tbl th,.tbl td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:14px}.tbl th{background:var(--green-soft);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.tbl .p{font-weight:900;white-space:nowrap}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.chips a{padding:8px 14px;border-radius:99px;background:#fff;border:1px solid var(--line);text-decoration:none;color:var(--ink);font-weight:800;font-size:13px}.chips a.on{background:var(--green);color:#fff}.tblwrap{overflow-x:auto}.crumb{font-size:13px}.crumb a{color:var(--green)}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}</head><body>
<header class="topbar"><a class="brand" href="/"><span class="brand-mark">⛽</span><span class="brand-copy"><span class="brand-name">Pucela<span>Gas</span></span><span class="brand-sub">Precios de carburantes en Valladolid</span></span></a>
<nav class="top-nav"><a href="/">Mapa</a><a href="/diesel-valladolid">Diésel</a><a href="/gasolina-95-valladolid">Gasolina 95</a><a href="/gasolina-98-valladolid">Gasolina 98</a><a href="/guias">Guías</a></nav></header>
<main class="wrap">${body}</main>
<footer><div><strong>PucelaGas</strong> · Datos del Ministerio para la Transición Ecológica y el Reto Demográfico</div><nav><a href="/guias">Guías</a><a href="/acerca.html">Sobre PucelaGas</a><a href="/aviso-legal.html">Aviso legal</a><a href="/privacidad.html">Privacidad</a></nav></footer></body></html>`;
}

function chart(h) {
  if (h.length < 2) return '';
  const all = h.flatMap((x) => [x.avg, x.min]); const lo = Math.min(...all), hi = Math.max(...all), r = hi - lo || 0.01;
  const pts = (k) => h.map((x, i) => `${(i / (h.length - 1) * 560 + 20).toFixed(1)},${(120 - (x[k] - lo) / r * 100).toFixed(1)}`).join(' ');
  return `<h2>Evolución del precio (últimos ${h.length} días)</h2><svg viewBox="0 0 600 140" style="width:100%;background:#fff;border-radius:14px;box-shadow:var(--shadow)" role="img" aria-label="Gráfica de precios"><polyline fill="none" stroke="#ed9417" stroke-width="3" points="${pts('avg')}"/><polyline fill="none" stroke="#0b9a57" stroke-width="3" points="${pts('min')}"/></svg><p><span style="color:#0b9a57">●</span> Más barata: ${eur(h[h.length - 1].min)} · <span style="color:#ed9417">●</span> Media: ${eur(h[h.length - 1].avg)} · Mín. del periodo ${eur(lo)}, máx. ${eur(hi)}.</p>`;
}

function cpPage(d, cp) {
  const list = d.stations.filter((s) => s.zip === cp);
  if (!list.length) return null;
  const rows = list.sort((a, b) => (a.diesel ?? 9) - (b.diesel ?? 9)).map((s) => `<tr><td><a href="/gasolinera/${s.slug}">${esc(s.name)}</a></td><td>${esc(s.address)}</td><td class="p">${eur(s.diesel)}</td><td class="p">${eur(s.g95)}</td><td class="p">${eur(s.g98)}</td></tr>`).join('');
  const body = `<p class="crumb"><a href="/">Inicio</a> › Código postal ${esc(cp)}</p><h1>Gasolineras en el código postal ${esc(cp)} (Valladolid)</h1><p>Hay ${list.length} gasolinera${list.length === 1 ? '' : 's'} en la zona ${esc(cp)} de Valladolid. Precios oficiales actualizados el ${fechaTxt(d.fecha)}.</p><div class="tblwrap"><table class="tbl"><thead><tr><th>Gasolinera</th><th>Dirección</th><th>Diésel</th><th>G95</th><th>G98</th></tr></thead><tbody>${rows}</tbody></table></div><p><a href="/diesel-valladolid">Ver ranking de toda la ciudad →</a></p>`;
  return layout({ title: `Gasolineras en ${cp} Valladolid: precios hoy — PucelaGas`, desc: `Gasolineras del código postal ${cp} de Valladolid con precios de diésel y gasolina.`, canonical: `/gasolineras-cp/${cp}`, body });
}

function fuelPage(d, f, hist = []) {
  const list = d.stations.filter((s) => s[f.key] != null).sort((a, b) => a[f.key] - b[f.key]);
  if (!list.length) return layout({ title: `${f.name} en Valladolid — PucelaGas`, desc: `Precios de ${f.name.toLowerCase()} en Valladolid.`, canonical: f.path,
    body: `<p class="crumb"><a href="/">Inicio</a> › ${f.name}</p><h1>${f.name} en Valladolid</h1><p>Ahora mismo ninguna gasolinera de Valladolid ha publicado precio de ${f.name.toLowerCase()} en la fuente oficial. Vuelve más tarde o consulta el <a href="/diesel-valladolid">ranking de diésel</a> y el de <a href="/gasolina-95-valladolid">gasolina 95</a>.</p>` });
  const prices = list.map((s) => s[f.key]); const best = list[0], worst = list[list.length - 1], media = avg(prices);
  const l50 = (worst[f.key] - best[f.key]) * 50;
  const rows = list.map((s, i) => `<tr><td>${i + 1}</td><td><a href="/gasolinera/${s.slug}">${esc(s.name)}</a></td><td>${esc(s.address)}</td><td class="p">${eur(s[f.key])}</td><td>${esc(s.horario || '—')}</td></tr>`).join('');
  const faq = [
    [`¿Cuál es la gasolinera más barata de Valladolid para ${f.name.toLowerCase()}?`, `Según los últimos datos oficiales (${fechaTxt(d.fecha)}), la más barata es ${best.name} en ${best.address}, con ${eur(best[f.key])}.`],
    [`¿Cuál es el precio medio del ${f.name.toLowerCase()} en Valladolid?`, `El precio medio entre las ${list.length} estaciones con precio es ${eur(media)}.`],
    ['¿Cuánto se ahorra eligiendo bien dónde repostar?', `Entre la estación más barata y la más cara hay ${((worst[f.key] - best[f.key]) * 100).toFixed(1).replace('.', ',')} céntimos por litro: unos ${l50.toFixed(2).replace('.', ',')} € en un depósito de 50 litros.`],
    ['¿De dónde salen los precios?', 'Del servicio público de precios de carburantes del Ministerio para la Transición Ecológica y el Reto Demográfico. Los precios pueden variar tras la última actualización.'],
  ];
  const body = `<p class="crumb"><a href="/">Inicio</a> › ${f.name} en Valladolid</p><h1>${f.name} más barato en Valladolid hoy</h1>
<p>Ranking de las ${list.length} gasolineras de Valladolid con precio de ${f.name.toLowerCase()}. Actualizado: <strong>${fechaTxt(d.fecha)}</strong>. La más barata es <strong>${esc(best.name)}</strong> (${esc(best.address)}) a <strong>${eur(best[f.key])}</strong>; el precio medio es ${eur(media)}.</p>
<div class="chips">${Object.values(FUELS).map((x) => `<a class="${x === f ? 'on' : ''}" href="${x.path}">${x.name}</a>`).join('')}<a href="/">Ver mapa</a></div>
${chart(hist)}<div class="tblwrap"><table class="tbl"><thead><tr><th>#</th><th>Gasolinera</th><th>Dirección</th><th>Precio</th><th>Horario</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Preguntas frecuentes</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}`;
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  return layout({ title: `${f.name} más barato en Valladolid hoy — PucelaGas`, desc: `Ranking de precios de ${f.name.toLowerCase()} en Valladolid: la más barata es ${best.name} a ${eur(best[f.key])}. Datos oficiales.`, canonical: f.path, body, ld });
}

function stationPage(d, id) {
  const s = d.stations.find((x) => x.id === id);
  if (!s) return null;
  const fuelRows = Object.values(FUELS).map((f) => {
    const list = d.stations.filter((x) => x[f.key] != null).sort((a, b) => a[f.key] - b[f.key]);
    const pos = list.findIndex((x) => x.id === s.id) + 1; const m = avg(list.map((x) => x[f.key]));
    if (s[f.key] == null) return `<tr><td>${f.name}</td><td class="p">—</td><td>Sin precio</td><td>—</td></tr>`;
    const diff = (s[f.key] - m) * 100;
    return `<tr><td><a href="${f.path}">${f.name}</a></td><td class="p">${eur(s[f.key])}</td><td>Nº ${pos} de ${list.length}</td><td>${diff <= 0 ? '' : '+'}${diff.toFixed(1).replace('.', ',')} cént. vs media</td></tr>`;
  }).join('');
  const cheaper = d.stations.filter((x) => x.id !== s.id && x.diesel != null).sort((a, b) => a.diesel - b.diesel).slice(0, 3);
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.address}, ${s.zip} Valladolid`)}`;
  const body = `<p class="crumb"><a href="/">Inicio</a> › Gasolineras › ${esc(s.name)}</p><h1>${esc(s.name)} — ${esc(s.address)}, Valladolid</h1>
<p>Precios de carburantes en la gasolinera ${esc(s.name)} (${esc(s.address)}, ${esc(s.zip)} Valladolid), según datos oficiales actualizados el ${fechaTxt(d.fecha)}.</p>
<div class="tblwrap"><table class="tbl"><thead><tr><th>Combustible</th><th>Precio</th><th>Posición en Valladolid</th><th>Comparado con la media</th></tr></thead><tbody>${fuelRows}</tbody></table></div>
<h2>Horario y cómo llegar</h2><p>Horario: <strong>${esc(s.horario || 'no indicado')}</strong>. <a href="${maps}" target="_blank" rel="noopener">Cómo llegar con Google Maps →</a></p>
<h2>Otras gasolineras baratas en Valladolid</h2><ul>${cheaper.map((x) => `<li><a href="/gasolinera/${x.slug}">${esc(x.name)} — ${esc(x.address)}</a> · diésel ${eur(x.diesel)}</li>`).join('')}</ul>
<p><a href="/diesel-valladolid">Ver ranking completo de diésel →</a> · <a href="/gasolineras-cp/${esc(s.zip)}">Gasolineras en el ${esc(s.zip)}</a></p>`;
  const ld = { '@context': 'https://schema.org', '@type': 'GasStation', name: s.name, url: `${SITE}/gasolinera/${s.slug}`,
    address: { '@type': 'PostalAddress', streetAddress: s.address, postalCode: s.zip, addressLocality: 'Valladolid', addressCountry: 'ES' },
    ...(Number.isFinite(s.lat) && Number.isFinite(s.lng) ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } } : {}) };
  return layout({ title: `${s.name} ${s.address}, Valladolid: precios y horario — PucelaGas`, desc: `Precios de diésel y gasolina en ${s.name} (${s.address}, Valladolid), horario y comparación con el resto de gasolineras.`, canonical: `/gasolinera/${s.slug}`, body, ld });
}

module.exports = async (req, res) => {
  try {
    const d = await getData();
    const { tipo, id } = req.query;
    const html = FUELS[tipo] ? fuelPage(d, FUELS[tipo], await getHistory(FUELS[tipo].key)) : tipo === 'cp' ? cpPage(d, String(id)) : tipo === 'estacion' ? stationPage(d, String(id || '').split('-')[0]) : null;
    if (!html) return res.status(404).send(layout({ title: 'No encontrada — PucelaGas', desc: 'Página no encontrada', canonical: '/', body: '<h1>Gasolinera no encontrada</h1><p><a href="/">Volver al mapa</a></p>' }));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).send(html);
  } catch (e) { console.error(e); res.status(502).send('Datos oficiales no disponibles ahora mismo. Inténtalo en unos minutos.'); }
};

module.exports.layout = layout;
module.exports.esc = esc;
