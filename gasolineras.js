const { getData } = require('./_data');
// Devuelve el JSON crudo para el mapa (mismo formato que antes).
const BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  try {
    const d = await getData();
    const f = (n) => (n == null ? '' : String(n).replace('.', ','));
    res.status(200).json({ fecha: d.fecha, municipio: 'Valladolid', source: 'Ministerio para la Transición Ecológica y el Reto Demográfico',
      stations: d.stations.map((s) => ({ IDEESS: s.id, 'Rótulo': s.name, 'Dirección': s.address, 'C.P.': s.zip, Horario: s.horario,
        Latitud: String(s.lat), 'Longitud (WGS84)': String(s.lng), 'Precio Gasoleo A': f(s.diesel), 'Precio Gasolina 95 E5': f(s.g95), 'Precio Gasolina 98 E5': f(s.g98), 'Precio Gasoleo Premium': f(s.dieselP), 'Precio Gases licuados del petróleo': f(s.glp), Municipio: 'VALLADOLID', slug: s.slug })) });
  } catch (e) { console.error(e); res.status(502).json({ error: 'No se pudieron consultar los precios oficiales en este momento.', detail: e.message }); }
};
