/**
 * MetaSafe HEIC/HEIF Metadata Processor
 * Client-side HEIC/HEIF metadata reading and cleaning
 * 
 * HEIC (High Efficiency Image Container) is Apple's default format.
 * Contains EXIF data similar to JPEG but in HEIF container.
 * 
 * Note: Full HEIC parsing requires complex ISOBMFF parsing.
 * This implementation provides basic metadata extraction and
 * recommends conversion to JPEG for full cleaning.
 */

/**
 * Check if file is HEIC/HEIF
 */
function isHEIC(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  const heicTypes = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
  return heicTypes.includes(file.type) || ext === 'heic' || ext === 'heif';
}

/**
 * Read HEIC metadata
 * HEIC uses ISOBMFF container (similar to MP4)
 */
async function readHEICMetadata(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  const metadata = {
    format: 'HEIC/HEIF',
    items: []
  };
  
  try {
    // Check for ftyp box (file type)
    if (buffer.byteLength < 12) {
      metadata.items.push({
        name: 'Error',
        value: 'File too small',
        risk: 'low'
      });
      return metadata;
    }
    
    // Read first box
    const firstBoxSize = view.getUint32(0);
    const firstBoxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    
    if (firstBoxType !== 'ftyp') {
      metadata.items.push({
        name: 'Warning',
        value: 'Not a standard HEIC file',
        risk: 'low'
      });
    }
    
    // Read brand
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    metadata.items.push({
      name: 'Brand',
      value: brand,
      risk: 'low'
    });
    
    // Parse boxes to find EXIF
    let offset = 0;
    let exifFound = false;
    let metaFound = false;
    
    while (offset < buffer.byteLength - 8) {
      const boxSize = view.getUint32(offset);
      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], 
        bytes[offset + 6], bytes[offset + 7]
      );
      
      if (boxSize === 0) break; // End of file
      if (boxSize < 8) break; // Invalid box
      
      if (boxType === 'meta') {
        metaFound = true;
        // Meta box contains item info and EXIF
        metadata.items.push({
          name: 'Metadata Box',
          value: 'Found - may contain EXIF',
          risk: 'high'
        });
        
        // Search for Exif within meta box
        const metaEnd = Math.min(offset + boxSize, buffer.byteLength);
        for (let i = offset; i < metaEnd - 4; i++) {
          if (bytes[i] === 0x45 && bytes[i+1] === 0x78 && 
              bytes[i+2] === 0x69 && bytes[i+3] === 0x66) { // "Exif"
            exifFound = true;
            break;
          }
        }
      }
      
      if (boxType === 'Exif' || boxType === 'exif') {
        exifFound = true;
      }
      
      // Look for GPS data marker
      const boxContent = bytes.slice(offset, Math.min(offset + boxSize, buffer.byteLength));
      const contentStr = String.fromCharCode(...boxContent.slice(0, Math.min(200, boxContent.length)));
      
      if (contentStr.includes('GPS') || contentStr.includes('gps')) {
        metadata.items.push({
          name: 'GPS Data',
          value: 'Location data detected',
          risk: 'critical'
        });
      }
      
      offset += boxSize;
    }
    
    if (exifFound) {
      metadata.items.push({
        name: 'EXIF Data',
        value: 'Present - contains camera/device info',
        risk: 'high'
      });
    }
    
    // Add warning about HEIC limitations
    metadata.items.push({
      name: 'Note',
      value: 'HEIC cleaning converts to JPEG',
      risk: 'low'
    });
    
    // File size
    metadata.items.push({
      name: 'File Size',
      value: formatFileSize(file.size),
      risk: 'low'
    });
    
  } catch (e) {
    console.error('Error reading HEIC:', e);
    metadata.items.push({
      name: 'Error',
      value: e.message,
      risk: 'low'
    });
  }
  
  return metadata;
}

/**
 * Clean HEIC/HEIF metadata — HONESTLY.
 *
 * The only reliable way to strip ALL metadata from a HEIC/HEIF in the browser is
 * to fully DECODE the image and RE-ENCODE it: re-encoding drops every metadata box
 * (EXIF, GPS, XMP, maker notes, thumbnails). We do this with createImageBitmap +
 * canvas. Because browsers cannot *write* HEIC, the output is JPEG.
 *
 * IMPORTANT — why the old approach was removed: it scanned the bytes for the ASCII
 * "Exif"/"GPS" markers and zeroed a few bytes. That was unsafe on two counts:
 *   1. It matched those byte sequences inside the compressed image data too, so it
 *      randomly corrupted pixels.
 *   2. It left the real EXIF/GPS IFD payload (the actual lat/lon) intact while the
 *      app reported "cleaned" — a FALSE sense of safety for exactly the at-risk
 *      users this tool is for.
 *
 * If the browser cannot decode HEIC (Chrome/Firefox today), we do NOT fake it —
 * we throw so the UI shows an honest error instead of a false "clean".
 *
 * @param {File} file
 * @returns {Promise<Blob>} a metadata-free image/jpeg blob
 */
// Lazily-loaded libheif WASM instance (shared across calls). Loaded only when a
// HEIC file is actually cleaned, so normal usage never pays the ~1.4MB cost.
let _libheifPromise = null;
function loadLibheif() {
  if (!_libheifPromise) {
    // libheif-bundle.mjs is self-contained (wasm embedded, no external fetch) and
    // uses only ccall/cwrap — no eval/new Function — so it runs under a CSP of
    // script-src 'self' 'wasm-unsafe-eval' (WASM compilation only, no arbitrary eval).
    _libheifPromise = import('/lib/libheif-bundle.mjs')
      .then((m) => m.default())
      .catch((e) => { _libheifPromise = null; throw e; });
  }
  return _libheifPromise;
}

// Re-encode decoded RGBA pixels through a canvas → metadata-free JPEG.
async function rgbaToJpegBlob(width, height, rgbaImageData) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(rgbaImageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(rgbaImageData, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('HEIC re-encode failed'))), 'image/jpeg', 0.92)
  );
}

async function bitmapToJpegBlob(bitmap) {
  const { width, height } = bitmap;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('HEIC re-encode failed'))), 'image/jpeg', 0.92)
  );
}

// Decode HEIC via libheif (works in every browser), fill an ImageData, re-encode
// to JPEG through canvas. The re-encode drops ALL metadata (EXIF/GPS/XMP/thumbnails).
async function cleanHEICViaLibheif(file) {
  const libheif = await loadLibheif();
  const buffer = new Uint8Array(await file.arrayBuffer());

  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buffer);
  if (!images || images.length === 0) {
    const err = new Error('HEIC_DECODE_FAILED');
    err.code = 'HEIC_DECODE_FAILED';
    throw err;
  }

  const image = images[0]; // primary image
  const width = image.get_width();
  const height = image.get_height();

  // Need a 2D context to allocate an ImageData for libheif to fill.
  const scratch = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const scratchCtx = scratch.getContext('2d');
  const imageData = scratchCtx.createImageData(width, height);

  await new Promise((resolve, reject) => {
    image.display(imageData, (displayData) => {
      if (!displayData) reject(new Error('HEIC_DISPLAY_FAILED'));
      else resolve();
    });
  });

  // Free native memory where the wrapper supports it.
  if (typeof image.free === 'function') image.free();

  return rgbaToJpegBlob(width, height, imageData);
}

/**
 * Clean HEIC/HEIF metadata — HONESTLY, on every browser.
 *
 * Path 1 (fast): browsers that decode HEIC natively (Safari) go through
 * createImageBitmap — quickest, no WASM.
 * Path 2 (universal): everywhere else, decode with the libheif WASM module.
 *
 * Either way the image is fully DECODED and RE-ENCODED to JPEG, which drops every
 * metadata box. If BOTH decoders fail (genuinely broken/unsupported file) we throw
 * instead of returning a fake "clean" — no false sense of safety for at-risk users.
 *
 * @param {File} file
 * @returns {Promise<Blob>} a metadata-free image/jpeg blob
 */
async function cleanHEICMetadata(file) {
  // Path 1: native decode (Safari and any browser with HEIC support).
  try {
    const bitmap = await createImageBitmap(file);
    return await bitmapToJpegBlob(bitmap);
  } catch (_) {
    // Path 2: libheif WASM (Chrome/Firefox/Edge — no native HEIC).
    return cleanHEICViaLibheif(file);
  }
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export { isHEIC, readHEICMetadata, cleanHEICMetadata };
