/**
 * MetaSafe Batch Correlation Risk Detector
 *
 * Every metadata cleaner — ours included, up to this point — treats files one
 * at a time: strip this photo's GPS, strip that document's author, done.
 * But at-risk users rarely post ONE file; they post a batch. Even when EVERY
 * file in that batch is individually "clean", the batch as a whole can still
 * deanonymize:
 *
 *  - Multiple photos whose (now-removed-per-file, but originally recorded)
 *    GPS points cluster within a short radius reveal a "base of operations"
 *    (home, office, safehouse) — the correlation exists in the ORIGINAL
 *    files, before any single-file cleaning, and no single-file tool ever
 *    looks at the batch as a whole to warn about it.
 *  - The same camera/phone Make+Model+Serial across several photos links them
 *    to one physical device, even if each photo's own EXIF is later stripped.
 *  - The same Author/Creator name across several documents links otherwise
 *    unrelated files to one identity.
 *
 * This module runs over the batch's ALREADY-READ metadata (before or after
 * cleaning — it's a same-source-device/same-place question, not a "does this
 * one file still contain X" question) and surfaces cross-file patterns no
 * competitor tool (ExifCleaner, ImageOptim, exiftool GUIs — all single-file)
 * checks for. Everything here runs client-side over data already in memory;
 * no network request, no map tile fetch (see js/utils/gps-map.js for why).
 */

// Haversine distance in kilometers between two lat/lon points.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Group files whose GPS points are all within `radiusKm` of at least one
// other point in the same group (simple union-find over a distance graph).
function clusterByProximity(points, radiusKm) {
  const n = points.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haversineKm(points[i].coords, points[j].coords) <= radiusKm) union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(points[i]);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

// Field-name fallback matches the pattern used across app.js/processors: an
// item's field name may live in .key, .label, or .name depending on which
// processor produced it — never one canonical shape across the codebase.
function fieldNameOf(item) {
  return String(item.key ?? item.label ?? item.name ?? '').toLowerCase();
}

const DEVICE_FIELD_PATTERNS = ['serial', 'imageuniqueid', 'lensserialnumber', 'bodyserialnumber'];
const MAKE_MODEL_PATTERNS = ['make', 'model'];
const AUTHOR_FIELD_PATTERNS = ['creator', 'author', 'artist', 'lastmodifiedby'];

/**
 * @param {Array<{name: string, metadata: {items: Array}, gpsCoords: {lat,lon}|null}>} fileDataList
 * @returns {Array<{type: string, severity: 'high'|'medium', message: string, files: string[]}>}
 */
export function analyzeBatchCorrelation(fileDataList) {
  const findings = [];
  const candidates = fileDataList.filter((f) => f && f.metadata);
  if (candidates.length < 2) return findings; // correlation needs at least 2 files

  // --- 1. GPS proximity clustering ("pattern of life") ---
  const withGps = candidates
    .filter((f) => f.gpsCoords && typeof f.gpsCoords.lat === 'number')
    .map((f) => ({ name: f.name, coords: f.gpsCoords }));
  const RADIUS_KM = 2; // ~city-block-to-neighborhood scale; tune conservatively
  for (const cluster of clusterByProximity(withGps, RADIUS_KM)) {
    findings.push({
      type: 'gps-cluster',
      severity: 'high',
      message: `${cluster.length} dosyanın konumu birbirine ${RADIUS_KM} km'den yakın — tek tek temizlesen bile birlikte paylaşınca bir "üs" (ev/işyeri) bölgesi ortaya çıkabilir.`,
      files: cluster.map((c) => c.name)
    });
  }

  // --- 2. Same device across files (Make/Model or Serial match) ---
  const deviceValueToFiles = new Map(); // normalized "make|model" or serial -> Set(names)
  for (const f of candidates) {
    const items = f.metadata.items || [];
    const make = items.find((i) => fieldNameOf(i) === 'make')?.value;
    const model = items.find((i) => fieldNameOf(i) === 'model')?.value;
    if (make || model) {
      const key = `makemodel:${String(make || '').trim().toLowerCase()}|${String(model || '').trim().toLowerCase()}`;
      if (!deviceValueToFiles.has(key)) deviceValueToFiles.set(key, new Set());
      deviceValueToFiles.get(key).add(f.name);
    }
    for (const item of items) {
      if (DEVICE_FIELD_PATTERNS.some((p) => fieldNameOf(item).includes(p)) && item.value) {
        const key = `serial:${String(item.value).trim().toLowerCase()}`;
        if (!deviceValueToFiles.has(key)) deviceValueToFiles.set(key, new Set());
        deviceValueToFiles.get(key).add(f.name);
      }
    }
  }
  for (const [key, names] of deviceValueToFiles) {
    if (names.size < 2) continue;
    const isSerial = key.startsWith('serial:');
    findings.push({
      type: 'device-match',
      severity: isSerial ? 'high' : 'medium',
      message: isSerial
        ? `${names.size} dosya aynı cihaz seri numarasını taşıyor — bu dosyalar tek bir fiziksel cihaza bağlanabilir.`
        : `${names.size} dosya aynı cihaz marka/modelini taşıyor — kanıt olarak zayıf ama yine de bir bağlantı sinyali.`,
      files: [...names]
    });
  }

  // --- 3. Same author/creator across documents ---
  const authorValueToFiles = new Map();
  for (const f of candidates) {
    const items = f.metadata.items || [];
    for (const item of items) {
      if (AUTHOR_FIELD_PATTERNS.some((p) => fieldNameOf(item).includes(p)) && item.value && String(item.value).trim()) {
        const key = String(item.value).trim().toLowerCase();
        if (!authorValueToFiles.has(key)) authorValueToFiles.set(key, new Set());
        authorValueToFiles.get(key).add(f.name);
      }
    }
  }
  for (const [, names] of authorValueToFiles) {
    if (names.size < 2) continue;
    findings.push({
      type: 'author-match',
      severity: 'medium',
      message: `${names.size} dosya aynı yazar/oluşturan adını taşıyor — bu dosyalar aynı kişiye bağlanabilir.`,
      files: [...names]
    });
  }

  return findings;
}
