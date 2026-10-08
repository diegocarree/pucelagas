// Módulo compartido (el guion bajo evita que Vercel lo exponga como ruta).
const BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';
let cached = null, cachedAt = 0;
const CACHE_MS = 15 * 60 * 1000;
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'PucelaGas/1.0' } });
  if (!r.ok) throw new Error(`Fuente oficial respondió HTTP ${r.status}`);
  return r.json();
}
const price = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const slug = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function getData() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const mun = await getJson(`${BASE}/Listados/MunicipiosPorProvincia/47`);
  const lista = Array.isArray(mun) ? mun : (mun.ListaMunicipios || []);
  const v = lista.find((m) => norm(m.Municipio) === 'VALLADOLID');
  const id = v && (v.IDMunicipio || v.IdMunicipio);
  if (!id) throw new Error('No se encontró Valladolid en la fuente oficial');
  const p = await getJson(`${BASE}/EstacionesTerrestres/FiltroMunicipio/${id}`);
  const stations = (p.ListaEESSPrecio || []).map((r) => ({
    id: String(r.IDEESS), name: String(r['Rótulo'] || 'Gasolinera').trim(), address: String(r['Dirección'] || '').trim(),
    zip: String(r['C.P.'] || '').trim(), horario: String(r.Horario || '').trim(),
    lat: Number(String(r.Latitud).replace(',', '.')), lng: Number(String(r['Longitud (WGS84)']).replace(',', '.')),
    diesel: price(r['Precio Gasoleo A']), g95: price(r['Precio Gasolina 95 E5']), g98: price(r['Precio Gasolina 98 E5']), dieselP: price(r['Precio Gasoleo Premium']), glp: price(r['Precio Gases licuados del petróleo']),
  }));
  stations.forEach((s) => { s.slug = `${s.id}-${slug(s.name)}-${slug(s.address)}`.replace(/-+$/, ''); });
  cached = { fecha: p.Fecha || '', stations };
  cachedAt = Date.now();
  return cached;
}

// Histórico diario: solo funciona si conectas una base KV/Upstash en Vercel (variables KV_REST_API_URL y KV_REST_API_TOKEN).
const KEYS = ['diesel', 'g95', 'g98', 'dieselP', 'glp'];
async function kv(cmd) {
  const u = process.env.KV_REST_API_URL, t = process.env.KV_REST_API_TOKEN;
  if (!u || !t) return null;
  const r = await fetch(u, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify(cmd) });
  return (await r.json()).result;
}
async function saveSnapshot() {
  const d = await getData(); const snap = {};
  for (const k of KEYS) { const p = d.stations.map((s) => s[k]).filter((x) => x != null); if (p.length) snap[k] = { avg: p.reduce((a, b) => a + b, 0) / p.length, min: Math.min(...p) }; }
  await kv(['SET', `pg:${new Date().toISOString().slice(0, 10)}`, JSON.stringify(snap)]);
  return snap;
}
async function getHistory(key, days = 30) {
  const ds = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
  if (!process.env.KV_REST_API_URL) { const h = readHist(); return Object.keys(h).sort().slice(-days).map((day) => h[day][key] && { day, ...h[day][key] }).filter(Boolean); }
  try { const r = await kv(['MGET', ...ds.map((x) => `pg:${x}`)]); if (!r) return [];
    return r.map((v, i) => { const o = v && JSON.parse(v)[key]; return o ? { day: ds[i], ...o } : null; }).filter(Boolean); } catch (e) { return []; }
}
// Histórico en archivo (modo estático): history.json se guarda en el repositorio.
const fs = require('fs'), path = require('path');
const HF = path.join(process.cwd(), 'history.json');
const readHist = () => { try { return JSON.parse(fs.readFileSync(HF, 'utf8')); } catch (e) { return {}; } };
async function snapshotToFile() {
  const d = await getData(); const snap = {};
  for (const k of KEYS) { const p = d.stations.map((s) => s[k]).filter((x) => x != null); if (p.length) snap[k] = { avg: +(p.reduce((a, b) => a + b, 0) / p.length).toFixed(4), min: Math.min(...p) }; }
  const h = readHist(); const day = new Date().toISOString().slice(0, 10);
  if (h[day]) return; // una sola foto por día: evita commits y publicaciones de más
  h[day] = snap;
  const keep = Object.keys(h).sort().slice(-120); fs.writeFileSync(HF, JSON.stringify(Object.fromEntries(keep.map((k) => [k, h[k]])), null, 1));
}
module.exports = { getData, slug, saveSnapshot, snapshotToFile, getHistory };
