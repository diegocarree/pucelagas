const { getData } = require('./_data');
const SITE = 'https://pucelagas.es';
module.exports = async (req, res) => {
  const fixed = ['/diesel-premium-valladolid', '/glp-autogas-valladolid', '/guias', '/guias/gasolina-95-vs-98', '/guias/como-ahorrar-combustible', '/guias/donde-repostar-mas-barato', '/', '/diesel-valladolid', '/gasolina-95-valladolid', '/gasolina-98-valladolid', '/acerca.html', '/aviso-legal.html', '/privacidad.html'];
  let dyn = [];
  try { const st = (await getData()).stations; dyn = [...st.map((s) => `/gasolinera/${s.slug}`), ...[...new Set(st.map((s) => s.zip))].filter(Boolean).map((z) => `/gasolineras-cp/${z}`)]; } catch (e) { console.error(e); }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...fixed, ...dyn].map((u) => `<url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>`);
};
