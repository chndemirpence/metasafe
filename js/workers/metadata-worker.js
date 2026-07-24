/**
 * MetaSafe Metadata Worker
 * Handles heavy file processing (read/clean metadata) off the main thread.
 * 
 * Communication via postMessage:
 *   Main → Worker: { id, action: 'read'|'clean', fileBuffer, fileType, fileName }
 *   Worker → Main: { id, action, result?, error? }
 */

// Polyfill: some libraries (piexif, pdf-lib) reference 'window' which doesn't exist in workers
if (typeof window === 'undefined') {
  self.window = self;
}
if (typeof document === 'undefined') {
  self.document = { createElement: () => ({}) }; // Minimal stub
}

// Load libraries (they attach to globalThis/self)
importScripts('/lib/piexif.js', '/lib/pdf-lib.min.js', '/lib/jszip.min.js');

// Import processor modules won't work here (they use ES module exports).
// Instead, we inline the core logic for reading/cleaning.
// This worker handles: JPEG, PNG (OffscreenCanvas), WebP, PDF, Office

// ===== JPEG Processing =====
function readJpegInWorker(arrayBuffer) {
  // Convert ArrayBuffer to data URL for piexif
  const binary = new Uint8Array(arrayBuffer);
  let binaryStr = '';
  for (let i = 0; i < binary.length; i++) {
    binaryStr += String.fromCharCode(binary[i]);
  }
  const dataUrl = 'data:image/jpeg;base64,' + btoa(binaryStr);
  
  const exifObj = piexif.load(dataUrl);
  const items = [];
  const riskCounts = { high: 0, medium: 0, low: 0 };
  
  const HIGH_RISK = ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSLatitudeRef', 'GPSLongitudeRef',
    'SerialNumber', 'BodySerialNumber', 'LensSerialNumber', 'CameraOwnerName', 'OwnerName', 'Artist', 'Copyright'];
  const MEDIUM_RISK = ['Make', 'Model', 'Software', 'HostComputer', 'DateTimeOriginal', 'CreateDate',
    'ModifyDate', 'LensModel', 'LensMake'];
  
  function getRisk(key) {
    if (HIGH_RISK.includes(key)) return 'high';
    if (MEDIUM_RISK.includes(key)) return 'medium';
    return 'low';
  }
  
  const ifdNames = { '0th': piexif.ImageIFD, 'Exif': piexif.ExifIFD, 'GPS': piexif.GPSIFD, '1st': piexif.ImageIFD };
  
  for (const [ifdKey, ifdTagMap] of Object.entries(ifdNames)) {
    const ifd = exifObj[ifdKey];
    if (!ifd) continue;
    for (const [tagId, value] of Object.entries(ifd)) {
      if (value === undefined || value === null) continue;
      let tagName = null;
      for (const [name, id] of Object.entries(ifdTagMap)) {
        if (id === parseInt(tagId)) { tagName = name; break; }
      }
      if (!tagName) tagName = `Unknown_${ifdKey}_${tagId}`;
      const risk = getRisk(tagName);
      items.push({ key: tagName, label: tagName, value: String(value).substring(0, 100), risk, ifd: ifdKey });
      riskCounts[risk]++;
    }
  }
  
  // Check thumbnail
  let hasThumbnail = false;
  if (exifObj['thumbnail'] && exifObj['thumbnail'].length > 0) {
    items.push({ key: 'EmbeddedThumbnail', label: 'Gömülü Thumbnail', value: `${exifObj['thumbnail'].length} byte`, risk: 'medium' });
    riskCounts.medium++;
    hasThumbnail = true;
  }
  
  return { items, riskCounts, hasThumbnail, raw: exifObj };
}

function cleanJpegInWorker(arrayBuffer) {
  const binary = new Uint8Array(arrayBuffer);
  let binaryStr = '';
  for (let i = 0; i < binary.length; i++) {
    binaryStr += String.fromCharCode(binary[i]);
  }
  const dataUrl = 'data:image/jpeg;base64,' + btoa(binaryStr);
  
  // Remove all EXIF
  const cleanDataUrl = piexif.remove(dataUrl);
  
  // Convert back to ArrayBuffer
  const cleanBinary = atob(cleanDataUrl.split(',')[1]);
  const cleanBuffer = new ArrayBuffer(cleanBinary.length);
  const cleanView = new Uint8Array(cleanBuffer);
  for (let i = 0; i < cleanBinary.length; i++) {
    cleanView[i] = cleanBinary.charCodeAt(i);
  }
  
  return cleanBuffer;
}

// ===== PNG Processing (OffscreenCanvas) =====
async function cleanPngInWorker(arrayBuffer) {
  const blob = new Blob([arrayBuffer], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const cleanBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await cleanBlob.arrayBuffer();
}

// ===== WebP Processing (OffscreenCanvas) =====
async function cleanWebpInWorker(arrayBuffer) {
  const blob = new Blob([arrayBuffer], { type: 'image/webp' });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const cleanBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
  return await cleanBlob.arrayBuffer();
}

// ===== PDF Processing =====
async function readPdfInWorker(arrayBuffer) {
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { updateMetadata: false });
  const items = [];
  const riskCounts = { high: 0, medium: 0, low: 0 };
  
  const fields = [
    { key: 'Author', getter: () => pdfDoc.getAuthor(), risk: 'high' },
    { key: 'Creator', getter: () => pdfDoc.getCreator(), risk: 'high' },
    { key: 'Producer', getter: () => pdfDoc.getProducer(), risk: 'high' },
    { key: 'Title', getter: () => pdfDoc.getTitle(), risk: 'medium' },
    { key: 'Subject', getter: () => pdfDoc.getSubject(), risk: 'medium' },
    { key: 'Keywords', getter: () => pdfDoc.getKeywords(), risk: 'medium' },
    { key: 'CreationDate', getter: () => pdfDoc.getCreationDate(), risk: 'medium' },
    { key: 'ModDate', getter: () => pdfDoc.getModificationDate(), risk: 'medium' }
  ];
  
  for (const f of fields) {
    try {
      const val = f.getter();
      if (val !== undefined && val !== null && val !== '') {
        const displayVal = val instanceof Date ? val.toISOString() : String(val);
        items.push({ key: f.key, label: f.key, value: displayVal, risk: f.risk });
        riskCounts[f.risk]++;
      }
    } catch (e) { /* skip */ }
  }
  
  return { items, riskCounts, pageCount: pdfDoc.getPageCount() };
}

async function cleanPdfInWorker(arrayBuffer) {
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setCreator('');
  pdfDoc.setProducer('');
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));
  const cleanBytes = await pdfDoc.save({ updateMetadata: false });
  return cleanBytes.buffer;
}

// ===== Message Handler =====
self.onmessage = async function(e) {
  const { id, action, fileBuffer, fileType, fileName } = e.data;
  
  try {
    let result;
    
    if (action === 'read') {
      switch (fileType) {
        case 'jpeg': result = readJpegInWorker(fileBuffer); break;
        case 'pdf': result = await readPdfInWorker(fileBuffer); break;
        default: result = { items: [], riskCounts: { high: 0, medium: 0, low: 0 } };
      }
      self.postMessage({ id, action, result });
      
    } else if (action === 'clean') {
      let cleanedBuffer;
      switch (fileType) {
        case 'jpeg': cleanedBuffer = cleanJpegInWorker(fileBuffer); break;
        case 'png': cleanedBuffer = await cleanPngInWorker(fileBuffer); break;
        case 'webp': cleanedBuffer = await cleanWebpInWorker(fileBuffer); break;
        case 'pdf': cleanedBuffer = await cleanPdfInWorker(fileBuffer); break;
        default:
          self.postMessage({ id, action, error: 'Unsupported type for worker: ' + fileType });
          return;
      }
      // Transfer buffer back (zero-copy)
      self.postMessage({ id, action, result: cleanedBuffer }, [cleanedBuffer]);
      
    } else if (action === 'ping') {
      self.postMessage({ id, action: 'pong', result: 'ready' });
    }
    
  } catch (err) {
    self.postMessage({ id, action, error: err.message || 'Worker error' });
  }
};

// Signal ready
self.postMessage({ id: 'init', action: 'ready', result: 'MetaSafe worker ready' });
