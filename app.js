const state = {
  fuel: 'diesel',
  stations: [],
  filtered: [],
  map: null,
  markers: new Map(),
  layer: null,
  updating: false,
  updatedAt: null,
  userLocation: null,
};

const fuelConfig = {
  diesel: { label: 'Diésel', field: 'Precio Gasoleo A' },
  g95: { label: 'Gasolina 95', field: 'Precio Gasolina 95 E5' },
  g98: { label: 'Gasolina 98', field: 'Precio Gasolina 98 E5' },
  dieselp: { label: 'Diésel premium', field: 'Precio Gasoleo Premium' },
  glp: { label: 'GLP', field: 'Precio Gases licuados del petróleo' },
};

const $ = (id) => document.getElementById(id);
const safeText = (value) => String(value ?? '').trim();
const normalizeText = (value) => safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function parsePrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().replace(',', '.').replace(/[^0-9.\-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatPrice(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(3).replace('.', ',')} €/L`;
}

function priceBig(v) {
  if (v === null || v === undefined) return '—';
  const s = Number(v).toFixed(3).replace('.', ',');
  return `${s.slice(0, -1)}<sup>${s.slice(-1)}</sup><small>€/L</small>`;
}

function formatDate(value) {
  const direct = safeText(value);
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const match = direct.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : direct || '—';
}

function parseCoordinate(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(value) {
  return safeText(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function normalizeStation(raw) {
  const name = safeText(raw['Rótulo'] || raw['Rótulo estación'] || raw.Nombre || 'Gasolinera');
  const address = safeText(raw.Dirección);
  const id = safeText(raw.IDEESS || raw.IdEESS || `${name}-${address}`);
  return {
    id,
    slug: safeText(raw.slug),
    name,
    address,
    zip: safeText(raw['C.P.'] || raw.CP),
    municipality: safeText(raw.Municipio),
    province: safeText(raw.Provincia),
    lat: safeText(raw.Latitud || raw.latitud),
    lng: safeText(raw['Longitud (WGS84)'] || raw.Longitud || raw.longitud),
    horario: safeText(raw.Horario || raw.horario),
    margin: safeText(raw.Margen),
    saleType: safeText(raw['Tipo Venta']),
    diesel: raw['Precio Gasoleo A'],
    g95: raw['Precio Gasolina 95 E5'],
    g98: raw['Precio Gasolina 98 E5'],
    glp: raw['Precio Gases licuados del petróleo'],
    dieselp: raw['Precio Gasoleo Premium'],
    raw,
    bucket: 'orange',
    distanceKm: null,
  };
}

function priceFor(station) {
  return parsePrice(station[fuelConfig[state.fuel].field]);
}

// Mantener los nombres del objeto normalizado alineados con la configuración.
function getFuelValue(station) {
  return station[state.fuel];
}

function calculateBuckets(stations) {
  const priced = stations.map((station) => ({ station, price: parsePrice(getFuelValue(station)) })).filter((item) => item.price !== null);
  if (!priced.length) {
    stations.forEach((station) => { station.bucket = 'orange'; });
    return;
  }
  priced.sort((a, b) => a.price - b.price);
  priced.forEach((item, index) => {
    const ratio = priced.length === 1 ? 0 : index / (priced.length - 1);
    item.station.bucket = ratio <= 0.333 ? 'green' : ratio >= 0.666 ? 'red' : 'orange';
  });
  stations.filter((station) => !priced.some((item) => item.station === station)).forEach((station) => { station.bucket = 'orange'; });
}

function createMap() {
  state.map = L.map('map', { zoomControl: false }).setView([41.6523, -4.7245], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);
  state.layer = L.layerGroup().addTo(state.map);
}

function iconFor(bucket, active = false) {
  return L.divIcon({
    className: '',
    html: `<div class="marker ${bucket}${active ? ' active' : ''}"></div>`,
    iconSize: [26, 26], iconAnchor: [13, 25], popupAnchor: [0, -22],
  });
}

function googleMapsUrl(station) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${station.address}, ${station.zip} Valladolid`)}`;
}

function popupHtml(station) {
  const cfg = fuelConfig[state.fuel];
  const price = parsePrice(getFuelValue(station));
  const allPrices = [
    ['Diésel', parsePrice(station.diesel)],
    ['95', parsePrice(station.g95)],
    ['98', parsePrice(station.g98)],
  ].filter((item) => item[1] !== null);
  const prices = allPrices.map(([label, value]) => `<span><b>${label}</b> ${formatPrice(value)}</span>`).join('');
  return `<div class="popup"><h3>${escapeHtml(station.name)}</h3><p>${escapeHtml(station.address)}</p><div class="popup-main ${station.bucket}">${formatPrice(price)}</div><div class="popup-fuels">${prices || '<span>Sin precios disponibles</span>'}</div><a class="popup-btn" href="${googleMapsUrl(station)}" target="_blank" rel="noopener">Cómo llegar →</a></div>`;
}

function renderMap() {
  if (!state.map || !state.layer) return;
  state.layer.clearLayers();
  state.markers.clear();
  const bounds = [];
  state.filtered.forEach((station) => {
    const lat = parseCoordinate(station.lat); const lng = parseCoordinate(station.lng);
    if (lat === null || lng === null) return;
    const marker = L.marker([lat, lng], { icon: iconFor(station.bucket) });
    marker.bindTooltip(`<strong>${escapeHtml(station.name)}</strong><br>${formatPrice(parsePrice(getFuelValue(station)))}`, { direction: 'top', opacity: .96, offset: [0, -10] });
    marker.bindPopup(popupHtml(station));
    marker.addTo(state.layer);
    state.markers.set(station.id, marker);
    bounds.push([lat, lng]);
  });
  if (!state.userLocation && bounds.length) state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
}

function renderBrandOptions() {
  const select = $('brandSelect');
  const current = select.value;
  const names = [...new Set(state.stations.map((station) => station.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  select.innerHTML = '<option value="">Todas</option>' + names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (names.includes(current)) select.value = current;
}

function stationMatchesSearch(station, query) {
  if (!query) return true;
  const haystack = normalizeText(`${station.name} ${station.address} ${station.zip}`);
  return haystack.includes(query);
}

function sortStations(stations) {
  const mode = $('sortSelect').value;
  if (mode === 'name') return [...stations].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (mode === 'distance' && state.userLocation) return [...stations].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  return [...stations].sort((a, b) => {
    const pa = parsePrice(getFuelValue(a)); const pb = parsePrice(getFuelValue(b));
    if (pa === null && pb !== null) return 1; if (pa !== null && pb === null) return -1;
    return (pa ?? 999) - (pb ?? 999) || a.name.localeCompare(b.name, 'es');
  });
}

function renderList() {
  const sorted = sortStations(state.filtered);
  $('countText').textContent = `${sorted.length} ${sorted.length === 1 ? 'estación' : 'estaciones'}`;
  $('fuelPill').textContent = fuelConfig[state.fuel].label;
  const list = $('stationList');
  if (!sorted.length) {
    list.innerHTML = '<div class="empty">No hay resultados con estos filtros.</div>';
    return;
  }
  list.innerHTML = sorted.map((station) => {
    const price = parsePrice(getFuelValue(station));
    const distance = station.distanceKm !== null ? `<span class="distance">${station.distanceKm.toFixed(1).replace('.', ',')} km</span>` : '';
    return `<button class="station-item" type="button" data-id="${escapeHtml(station.id)}"><div class="station-row"><div><div class="station-name">${escapeHtml(station.name)}</div><div class="station-address">${escapeHtml(station.address)}</div></div><div class="price ${station.bucket}-text">${priceBig(price)}</div></div><div class="station-meta"><span>${escapeHtml(station.horario || 'Horario no indicado')}</span>${distance ? `<span>·</span>${distance}` : ''}</div></button>`;
  }).join('');
  list.querySelectorAll('.station-item').forEach((button) => button.addEventListener('click', () => focusStation(button.dataset.id)));
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateDistances() {
  if (!state.userLocation) {
    state.stations.forEach((station) => { station.distanceKm = null; });
    return;
  }
  state.stations.forEach((station) => {
    const lat = parseCoordinate(station.lat); const lng = parseCoordinate(station.lng);
    station.distanceKm = lat === null || lng === null ? null : calculateDistanceKm(state.userLocation.lat, state.userLocation.lng, lat, lng);
  });
}

function updateStats() {
  const prices = state.filtered.map((station) => parsePrice(getFuelValue(station))).filter((price) => price !== null);
  const best = prices.length ? Math.min(...prices) : null;
  const worst = prices.length ? Math.max(...prices) : null;
  const avg = prices.length ? prices.reduce((sum, p) => sum + p, 0) / prices.length : null;
  const bestStation = best === null ? null : state.filtered.find((station) => parsePrice(getFuelValue(station)) === best);
  const liters = Number($('litresRange').value || 50);
  const saving = best !== null && worst !== null ? (worst - best) * liters : null;
  $('bestPrice').textContent = formatPrice(best);
  $('bestStation').textContent = bestStation ? bestStation.name : 'Sin precios disponibles';
  $('heroBestPrice').innerHTML = priceBig(best);
  $('heroBestLabel').textContent = `${fuelConfig[state.fuel].label} más barato`;
  $('avgPrice').textContent = formatPrice(avg);
  $('statStations').textContent = String(prices.length);
  $('stationCoverage').textContent = `${state.filtered.length} mostradas`;
  $('saving50').textContent = worst === null || best === null ? '—' : `${((worst - best) * 50).toFixed(2).replace('.', ',')} €`;
  $('savingDynamic').textContent = saving === null ? '—' : `${saving.toFixed(2).replace('.', ',')} €`;
  $('savingDynamicText').textContent = saving === null ? 'No hay suficientes precios para calcularlo' : `${liters} L · desde ${formatPrice(best)} hasta ${formatPrice(worst)}`;
}

function renderRanking() {
  const list = $('rankingList');
  const priced = [...state.filtered].map((station) => ({ station, price: parsePrice(getFuelValue(station)) })).filter((item) => item.price !== null).sort((a, b) => a.price - b.price).slice(0, 5);
  $('rankingFuel').textContent = fuelConfig[state.fuel].label;
  if (!priced.length) { list.innerHTML = '<div class="empty">No hay precios disponibles.</div>'; return; }
  list.innerHTML = priced.map((item, index) => `<div class="ranking-row"><div class="rank">${index + 1}</div><div><div class="ranking-name">${escapeHtml(item.station.name)}</div><div class="ranking-address">${escapeHtml(item.station.address)}</div></div><div class="ranking-price" style="color:${item.station.bucket === 'green' ? 'var(--green)' : 'var(--ink)'}">${priceBig(item.price)}</div></div>`).join('');
}

function applyFilters() {
  const query = normalizeText($('searchInput').value);
  const brand = $('brandSelect').value;
  state.filtered = state.stations.filter((station) => stationMatchesSearch(station, query) && (!brand || station.name === brand) && (!$('open24').checked || /24\s*H/i.test(station.horario)));
  calculateBuckets(state.stations);
  renderList();
  renderMap();
  updateStats();
  renderRanking();
  renderNearestBanner();
}

function setFuel(fuel) {
  state.fuel = fuel;
  document.querySelectorAll('.fuel-tab').forEach((button) => button.classList.toggle('active', button.dataset.fuel === fuel));
  applyFilters();
}

function focusStation(id) {
  const station = state.stations.find((item) => item.id === id);
  const marker = state.markers.get(id);
  if (!station || !marker) return;
  state.map.setView(marker.getLatLng(), 16, { animate: true });
  marker.openPopup();
  openStationDialog(station);
}

function openStationDialog(station) {
  const mapUrl = googleMapsUrl(station);
  $('dialogContent').innerHTML = `<div class="dialog-head"><span class="section-kicker">GASOLINERA</span><h3>${escapeHtml(station.name)}</h3><p>${escapeHtml(station.address)} · ${escapeHtml(station.zip)}</p></div><div class="dialog-prices"><div class="dialog-price"><span>Diésel</span><strong>${formatPrice(parsePrice(station.diesel))}</strong></div><div class="dialog-price"><span>Gasolina 95</span><strong>${formatPrice(parsePrice(station.g95))}</strong></div><div class="dialog-price"><span>Gasolina 98</span><strong>${formatPrice(parsePrice(station.g98))}</strong></div></div><div class="dialog-details"><div class="dialog-detail"><span>Horario</span><strong>${escapeHtml(station.horario || 'No indicado')}</strong></div><div class="dialog-detail"><span>Distancia</span><strong>${station.distanceKm !== null ? `${station.distanceKm.toFixed(1).replace('.', ',')} km` : 'Activa “Mi ubicación”'}</strong></div><div class="dialog-detail"><span>Municipio</span><strong>${escapeHtml(station.municipality || 'Valladolid')}</strong></div><div class="dialog-detail"><span>Código estación</span><strong>${escapeHtml(station.id)}</strong></div></div><div class="dialog-actions"><a class="main" href="/gasolinera/${escapeHtml(station.slug || station.id)}">Ficha completa</a><a class="main" href="${mapUrl}" target="_blank" rel="noopener">Cómo llegar</a><button class="ghost" value="close">Cerrar</button></div>`;
  const dialog = $('stationDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
}

function renderNearestBanner() {
  const banner = $('nearestBanner');
  if (!state.userLocation) { banner.classList.add('hidden'); banner.innerHTML = ''; return; }
  const nearest = [...state.filtered].filter((station) => station.distanceKm !== null).sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!nearest) { banner.classList.add('hidden'); return; }
  banner.innerHTML = `La más cercana es <strong>${escapeHtml(nearest.name)}</strong>, a ${nearest.distanceKm.toFixed(1).replace('.', ',')} km · ${formatPrice(parsePrice(getFuelValue(nearest)))}.`;
  banner.classList.remove('hidden');
}

function locateUser() {
  if (!navigator.geolocation) {
    showLocationError('Tu navegador no permite geolocalización.');
    return;
  }
  $('mapStatus').textContent = 'Buscando tu ubicación…';
  navigator.geolocation.getCurrentPosition((position) => {
    state.userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    updateDistances();
    state.map.setView([state.userLocation.lat, state.userLocation.lng], 13, { animate: true });
    $('mapStatus').textContent = 'Ubicación activada';
    $('sortSelect').value = 'distance';
    applyFilters();
  }, (error) => {
    console.warn(error);
    showLocationError('No se ha podido obtener tu ubicación. Comprueba el permiso del navegador.');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
}

function showLocationError(message) {
  $('errorBox').textContent = message;
  $('errorBox').classList.remove('hidden');
}

async function loadData() {
  if (state.updating) return;
  state.updating = true;
  $('refreshBtn').disabled = true;
  $('statusText').textContent = 'Actualizando precios…';
  $('updatedText').textContent = 'Consultando datos oficiales';
  $('mapStatus').textContent = 'Actualizando…';
  $('statusDot').className = 'status-dot';
  $('errorBox').classList.add('hidden');
  try {
    const response = await fetch(`/data.json?ts=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
    state.stations = (data.stations || []).map(normalizeStation).filter((station) => parseCoordinate(station.lat) !== null && parseCoordinate(station.lng) !== null);
    state.updatedAt = data.fecha || new Date().toISOString();
    updateDistances();
    renderBrandOptions();
    calculateBuckets(state.stations);
    applyFilters();
    const formatted = formatDate(state.updatedAt);
    $('statusText').textContent = `${state.stations.length} gasolineras encontradas`;
    $('updatedText').textContent = `Actualizado ${formatted}`;
    $('sourceStamp').textContent = `Actualización: ${formatted}`;
    $('statusDot').className = 'status-dot ok';
    $('mapStatus').textContent = 'Datos en directo';
  } catch (error) {
    console.error(error);
    $('statusText').textContent = 'No se pudieron cargar los precios';
    $('updatedText').textContent = 'Revisa la conexión o la API';
    $('statusDot').className = 'status-dot bad';
    $('mapStatus').textContent = 'Datos no disponibles';
    $('errorBox').textContent = `No se han podido consultar los datos oficiales. ${error.message}`;
    $('errorBox').classList.remove('hidden');
  } finally {
    state.updating = false;
    $('refreshBtn').disabled = false;
  }
}

// Eventos
for (const button of document.querySelectorAll('.fuel-tab')) button.addEventListener('click', () => setFuel(button.dataset.fuel));
$('searchInput').addEventListener('input', applyFilters);
$('brandSelect').addEventListener('change', applyFilters);
$('open24').addEventListener('change', applyFilters);
$('sortSelect').addEventListener('change', () => { renderList(); applyFilters(); });
$('clearBtn').addEventListener('click', () => { $('searchInput').value = ''; $('brandSelect').value = ''; $('sortSelect').value = state.userLocation ? 'distance' : 'price'; applyFilters(); });
$('refreshBtn').addEventListener('click', loadData);
$('locateBtn').addEventListener('click', locateUser);
$('heroLocateBtn').addEventListener('click', locateUser);
$('mapLocateBtn').addEventListener('click', locateUser);
$('litresRange').addEventListener('input', () => { $('litresValue').textContent = `${$('litresRange').value} L`; updateStats(); });
$('year').textContent = new Date().getFullYear();

createMap();
loadData();
setInterval(loadData, 15 * 60 * 1000);
