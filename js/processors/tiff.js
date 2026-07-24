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
      
      // Special handling for GPS
      if (tag === 0x8825) {
        metadata.items.push({
          name: 'GPS Data',
          value: 'Location data present',
          risk: 'critical'
        });
        continue;
      }
      
      // Special handling for MakerNote
      if (tag === 0x927C) {
        metadata.items.push({
          name: 'Maker Note',
          value: `${count} bytes of camera-specific data`,
          risk: 'high'
        });
        continue;
      }
      
      if (tagName === 'Make' || tagName === 'Model') {
        risk = 'high';
      }
      
      metadata.items.push({
        name: tagName,
        value: value || `Tag 0x${tag.toString(16)}`,
        risk: risk
      });
    }
    
    // Check for EXIF IFD
    if (tag === 0x8769 && valueOffset < buffer.byteLength) {
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

/**
 * Clean IFD by zeroing sensitive tag values
 */
function cleanIFD(view, offset, littleEndian, bytes) {
  if (offset >= bytes.length - 2) return;
  
  const entryCount = view.getUint16(offset, littleEndian);
  
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = offset + 2 + (i * 12);
    if (entryOffset >= bytes.length - 12) break;
    
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
    
    // Check if this is a sensitive tag
    if (SENSITIVE_TAGS[tag]) {
      // Zero out the value
      if (type === 2 && count > 4) { // ASCII string stored at offset
        // Zero out the string
        for (let j = 0; j < count && (valueOffset + j) < bytes.length; j++) {
          bytes[valueOffset + j] = 0x20; // Space
        }
      } else {
        // Zero out inline value
        for (let j = 8; j < 12; j++) {
          bytes[entryOffset + j] = 0;
        }
      }
    }
    
    // If GPS IFD pointer, zero it
    if (tag === 0x8825) {
      for (let j = 8; j < 12; j++) {
        bytes[entryOffset + j] = 0;
      }
    }
  }
}

export { isTIFF, readTIFFMetadata, cleanTIFFMetadata };
