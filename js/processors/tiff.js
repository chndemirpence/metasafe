/**
 * MetaSafe TIFF Metadata Processor
 * Client-side TIFF metadata reading and cleaning
 * 
 * TIFF (Tagged Image File Format) contains:
 * - IFD (Image File Directory) with EXIF tags
 * - GPS data
 * - IPTC metadata
 * - XMP metadata
 * - Maker notes
 */

// TIFF constants
const TIFF_LITTLE_ENDIAN = 0x4949; // "II"
const TIFF_BIG_ENDIAN = 0x4D4D; // "MM"
const TIFF_MAGIC = 42;

// Sensitive EXIF tags to remove
const SENSITIVE_TAGS = {
  0x010F: 'Make',
  0x0110: 'Model',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013B: 'Artist',
  0x8298: 'Copyright',
  0x8769: 'ExifIFDPointer',
  0x8825: 'GPSInfoIFDPointer',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0x9010: 'OffsetTime',
  0x9011: 'OffsetTimeOriginal',
  0x927C: 'MakerNote',
  0x9286: 'UserComment',
  0xA420: 'ImageUniqueID'
};

/**
 * Check if file is TIFF
 */
function isTIFF(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  const tiffTypes = ['image/tiff', 'image/tif'];
  return tiffTypes.includes(file.type) || ext === 'tiff' || ext === 'tif';
}

/**
 * Read TIFF metadata
 */
async function readTIFFMetadata(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  
  const metadata = {
    format: 'TIFF',
    items: []
  };
  
  try {
    // Check byte order
    const byteOrder = view.getUint16(0);
    let littleEndian;
    
    if (byteOrder === TIFF_LITTLE_ENDIAN) {
      littleEndian = true;
      metadata.items.push({ name: 'Byte Order', value: 'Little Endian (Intel)', risk: 'low' });
    } else if (byteOrder === TIFF_BIG_ENDIAN) {
      littleEndian = false;
      metadata.items.push({ name: 'Byte Order', value: 'Big Endian (Motorola)', risk: 'low' });
    } else {
      metadata.items.push({ name: 'Error', value: 'Invalid TIFF file', risk: 'low' });
      return metadata;
    }
    
    // Check magic number
    const magic = view.getUint16(2, littleEndian);
    if (magic !== TIFF_MAGIC) {
      metadata.items.push({ name: 'Warning', value: 'Non-standard TIFF magic number', risk: 'low' });
    }
    
    // Get IFD offset
    const ifdOffset = view.getUint32(4, littleEndian);
    
    // Parse IFD
    parseIFD(view, ifdOffset, littleEndian, metadata, buffer);
    
  } catch (e) {
    console.error('Error reading TIFF:', e);
    metadata.items.push({ name: 'Error', value: e.message, risk: 'low' });
  }
  
  return metadata;
}

/**
 * Parse IFD (Image File Directory)
 */
function parseIFD(view, offset, littleEndian, metadata, buffer) {
  if (offset >= buffer.byteLength - 2) return;
  
  const entryCount = view.getUint16(offset, littleEndian);
  
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = offset + 2 + (i * 12);
    if (entryOffset >= buffer.byteLength - 12) break;
    
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
    
    // Check for sensitive tags
    const tagName = SENSITIVE_TAGS[tag];
    if (tagName) {
      let value = '';
      let risk = 'medium';
      
      // Read string values
      if (type === 2) { // ASCII
        const strOffset = count <= 4 ? entryOffset + 8 : valueOffset;
        const bytes = new Uint8Array(buffer, strOffset, Math.min(count - 1, 100));
        value = String.fromCharCode(...bytes).replace(/\0/g, '');
      }
      
      // Special handling for GPS. Check the pointer's VALUE, not just that the
      // tag entry exists: cleanTIFFMetadata() zeroes the pointer (and scrubs
      // the sub-IFD it led to) rather than deleting the entry outright, so a
      // cleaned file still has a GPS-IFD-pointer entry — now pointing at 0.
      // Reporting "present" from the tag alone would make a freshly-cleaned
      // file look like it still has GPS data (and would forever block "0 GPS
      // items" on re-verification of any photo that ever had a location).
      if (tag === 0x8825) {
        if (valueOffset > 0) {
          metadata.items.push({
            name: 'GPS Data',
            value: 'Location data present',
            risk: 'critical'
          });
        }
        continue;
      }

      // Special handling for MakerNote — same reasoning: an external blob
      // that's been zeroed by cleanIFD is no longer "camera-specific data".
      if (tag === 0x927C) {
        if (valueOffset > 0 && count > 0) {
          metadata.items.push({
            name: 'Maker Note',
            value: `${count} bytes of camera-specific data`,
            risk: 'high'
          });
        }
        continue;
      }

      // ExifIFDPointer has its own, valueOffset-aware "EXIF Data" check right
      // below this loop's tagName block — skip the generic push here so a
      // cleaned file (pointer zeroed) doesn't ALSO get a stray, unconditional
      // "ExifIFDPointer: Tag 0x8769" item that never goes away.
      if (tag === 0x8769) continue;

      if (tagName === 'Make' || tagName === 'Model') {
        risk = 'high';
      }

      // For ASCII fields, an empty (post-clean, all-NUL) string means this
      // field is gone — don't report it as "present" via the `Tag 0x..`
      // fallback, or a cleaned file would forever show "Make: Tag 0x10f".
      const isEmptyAscii = type === 2 && value.trim() === '';
      if (!isEmptyAscii) {
        metadata.items.push({
          name: tagName,
          value: value || `Tag 0x${tag.toString(16)}`,
          risk: risk
        });
      }
    }
    
    // Check for EXIF IFD. Same reasoning as the GPS pointer above: check the
    // VALUE (>0), not just that the entry exists — cleanIFD() zeroes this
    // pointer rather than deleting the entry, so a cleaned file still has the
    // ExifIFDPointer tag present, now valued at 0.
    if (tag === 0x8769 && valueOffset > 0 && valueOffset < buffer.byteLength) {
      metadata.items.push({
        name: 'EXIF Data',
        value: 'Extended metadata present',
        risk: 'high'
      });
    }
  }
  
  // Get next IFD offset
  const nextIFDOffset = view.getUint32(offset + 2 + (entryCount * 12), littleEndian);
  if (nextIFDOffset > 0 && nextIFDOffset < buffer.byteLength) {
    metadata.items.push({
      name: 'Additional IFD',
      value: 'Multiple pages/thumbnails',
      risk: 'low'
    });
  }
}

/**
 * Clean TIFF metadata
 */
async function cleanTIFFMetadata(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer.byteLength);
  result.set(new Uint8Array(buffer));
  const resultView = new DataView(result.buffer);
  
  try {
    // Check byte order
    const byteOrder = view.getUint16(0);
    let littleEndian = byteOrder === TIFF_LITTLE_ENDIAN;
    
    if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
      return new Blob([buffer], { type: 'image/tiff' });
    }
    
    // Get IFD offset
    const ifdOffset = view.getUint32(4, littleEndian);
    
    // Clean IFD entries
    cleanIFD(resultView, ifdOffset, littleEndian, result);
    
    return new Blob([result], { type: 'image/tiff' });
    
  } catch (e) {
    console.error('Error cleaning TIFF:', e);
    return new Blob([buffer], { type: 'image/tiff' });
  }
}

// Byte size per TIFF field type (index = type code). Needed to compute the
// TRUE length of a value, since only values >4 bytes are stored at an
// external offset — anything smaller is packed inline in the 4-byte slot.
const TIFF_TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

/**
 * Zero out every entry's VALUE in an IFD — both inline values and, critically,
 * any external data block a valueOffset points to. Recurses into the GPS and
 * EXIF sub-IFDs (via their pointer tags) so their entries get scrubbed too.
 *
 * Earlier version only zeroed the 4-byte GPS/EXIF *pointer* in the parent IFD.
 * That does not touch the GPS/EXIF sub-IFD itself — its entries (GPSLatitude,
 * DateTimeOriginal, MakerNote, ...) are external data blocks living elsewhere
 * in the file, untouched by zeroing the pointer. A tool that scans raw bytes
 * instead of trusting the (now-broken) pointer would still recover the real
 * GPS coordinates. This walks and zeroes the actual sub-IFDs' data too.
 */
function scrubIFD(view, bytes, offset, littleEndian, depth = 0) {
  if (depth > 4) return; // guard against a malformed/cyclic IFD chain
  if (offset < 8 || offset >= bytes.length - 2) return;

  const entryCount = view.getUint16(offset, littleEndian);

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = offset + 2 + (i * 12);
    if (entryOffset + 12 > bytes.length) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
    const typeSize = TIFF_TYPE_SIZE[type] || 1;
    const totalBytes = typeSize * count;
    const isExternal = totalBytes > 4;

    // Recurse into GPS / EXIF sub-IFDs BEFORE zeroing the pointer that leads
    // to them, so their actual entries (not just the pointer) get scrubbed.
    // The pointer itself is a single LONG (4 bytes, always inline).
    if ((tag === 0x8825 || tag === 0x8769) && valueOffset > 0 && valueOffset < bytes.length) {
      scrubIFD(view, bytes, valueOffset, littleEndian, depth + 1);
    }

    if (isExternal) {
      // Real value lives elsewhere in the file — zero THAT, not the pointer.
      // NUL (0x00) for ASCII too, not spaces: TIFF ASCII fields are spec'd as
      // null-terminated, so all-NUL reads back as a proper empty string. A
      // space-filled string is non-empty (just whitespace) and the reader
      // would keep reporting "Make: (blank)" as present forever after clean.
      for (let j = 0; j < totalBytes && (valueOffset + j) < bytes.length; j++) {
        bytes[valueOffset + j] = 0;
      }
    } else {
      // Value fits inline in the entry itself.
      for (let j = 8; j < 12; j++) bytes[entryOffset + j] = 0;
    }
  }
}

/**
 * Clean IFD by zeroing sensitive tag values (top-level entry point).
 */
function cleanIFD(view, offset, littleEndian, bytes) {
  scrubIFD(view, bytes, offset, littleEndian, 0);
}

export { isTIFF, readTIFFMetadata, cleanTIFFMetadata };
