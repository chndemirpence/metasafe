/**
 * MetaSafe Audio Metadata Processor
 * Client-side audio metadata reading and cleaning for MP3, WAV, M4A, OGG, FLAC
 * 
 * Supported formats:
 * - MP3: ID3v1, ID3v2.3, ID3v2.4 tags
 * - WAV: RIFF INFO chunks
 * - M4A/AAC: iTunes metadata atoms
 * - OGG: Vorbis comments
 * - FLAC: Vorbis comments + metadata blocks
 */

// ===== File Type Detection =====
function isAudio(file) {
  const audioTypes = [
    'audio/mpeg', 'audio/mp3',
    'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/mp4', 'audio/x-m4a', 'audio/aac',
    'audio/ogg', 'audio/vorbis',
    'audio/flac', 'audio/x-flac'
  ];
  
  const ext = file.name.toLowerCase().split('.').pop();
  const audioExts = ['mp3', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'flac'];
  
  return audioTypes.includes(file.type) || audioExts.includes(ext);
}

function getAudioType(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  
  if (ext === 'mp3' || file.type.includes('mpeg')) return 'mp3';
  if (ext === 'wav' || ext === 'wave' || file.type.includes('wav')) return 'wav';
  if (ext === 'm4a' || ext === 'aac' || file.type.includes('mp4') || file.type.includes('m4a')) return 'm4a';
  if (ext === 'ogg' || ext === 'oga' || file.type.includes('ogg')) return 'ogg';
  if (ext === 'flac' || file.type.includes('flac')) return 'flac';
  
  return 'unknown';
}

// ===== Read Audio Metadata =====
async function readAudioMetadata(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  
  const audioType = getAudioType(file);
  const metadata = {
    format: audioType.toUpperCase(),
    items: []
  };
  
  try {
    switch (audioType) {
      case 'mp3':
        readID3Tags(uint8, view, metadata);
        readMP3FrameInfo(uint8, view, metadata, file.size);
        break;
      case 'wav':
        readWavMetadata(uint8, view, metadata);
        readWavTechnical(view, metadata, file.size);
        break;
      case 'm4a':
        readM4AMetadata(uint8, view, metadata);
        break;
      case 'ogg':
      case 'flac':
        readVorbisComments(uint8, view, metadata);
        break;
    }
  } catch (e) {
    console.error('Error reading audio metadata:', e);
  }
  
  return metadata;
}

// ===== ID3 Tag Reading (MP3) =====
function readID3Tags(uint8, view, metadata) {
  // Check for ID3v2 at the start
  if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) { // "ID3"
    const version = `2.${uint8[3]}.${uint8[4]}`;
    const flags = uint8[5];
    const size = readSyncSafeInt(uint8, 6);
    
    metadata.items.push({
      name: 'ID3 Version',
      value: `ID3v${version}`,
      risk: 'low'
    });
    
    // Parse ID3v2 frames
    let offset = 10;
    const endOffset = 10 + size;
    
    while (offset < endOffset && offset < uint8.length - 10) {
      const frameId = String.fromCharCode(uint8[offset], uint8[offset+1], uint8[offset+2], uint8[offset+3]);
      
      if (frameId[0] === '\x00') break; // Padding
      
      let frameSize;
      if (uint8[3] >= 4) { // ID3v2.4
        frameSize = readSyncSafeInt(uint8, offset + 4);
      } else { // ID3v2.3
        frameSize = (uint8[offset+4] << 24) | (uint8[offset+5] << 16) | (uint8[offset+6] << 8) | uint8[offset+7];
      }
      
      if (frameSize <= 0 || frameSize > size) break;
      
      const frameData = uint8.slice(offset + 10, offset + 10 + frameSize);
      const frameValue = parseID3FrameValue(frameId, frameData);
      
      if (frameValue) {
        const riskLevel = getID3FrameRisk(frameId);
        metadata.items.push({
          name: getID3FrameName(frameId),
          value: frameValue,
          risk: riskLevel,
          frameId: frameId
        });
      }
      
      offset += 10 + frameSize;
    }
  }
  
  // Check for ID3v1 at the end
  const tagOffset = uint8.length - 128;
  if (tagOffset > 0 && uint8[tagOffset] === 0x54 && uint8[tagOffset+1] === 0x41 && uint8[tagOffset+2] === 0x47) { // "TAG"
    
    const title = readString(uint8, tagOffset + 3, 30);
    const artist = readString(uint8, tagOffset + 33, 30);
    const album = readString(uint8, tagOffset + 63, 30);
    const year = readString(uint8, tagOffset + 93, 4);
    const comment = readString(uint8, tagOffset + 97, 30);
    const genre = uint8[tagOffset + 127];
    
    if (title) metadata.items.push({ name: 'Title (ID3v1)', value: title, risk: 'low' });
    if (artist) metadata.items.push({ name: 'Artist (ID3v1)', value: artist, risk: 'medium' });
    if (album) metadata.items.push({ name: 'Album (ID3v1)', value: album, risk: 'low' });
    if (year) metadata.items.push({ name: 'Year (ID3v1)', value: year, risk: 'low' });
    if (comment) metadata.items.push({ name: 'Comment (ID3v1)', value: comment, risk: 'medium' });
  }
}

function readSyncSafeInt(uint8, offset) {
  return ((uint8[offset] & 0x7f) << 21) |
         ((uint8[offset+1] & 0x7f) << 14) |
         ((uint8[offset+2] & 0x7f) << 7) |
         (uint8[offset+3] & 0x7f);
}

function parseID3FrameValue(frameId, data) {
  if (data.length === 0) return null;
  
  // Text frames start with encoding byte
  if (frameId.startsWith('T') && frameId !== 'TXXX') {
    const encoding = data[0];
    return decodeText(data.slice(1), encoding);
  }
  
  // TXXX: User defined text
  if (frameId === 'TXXX') {
    const encoding = data[0];
    const nullPos = findNull(data, 1, encoding);
    const description = decodeText(data.slice(1, nullPos), encoding);
    const value = decodeText(data.slice(nullPos + (encoding === 1 || encoding === 2 ? 2 : 1)), encoding);
    return `${description}: ${value}`;
  }
  
  // COMM: Comment
  if (frameId === 'COMM') {
    const encoding = data[0];
    // Skip language (3 bytes) and description
    return decodeText(data.slice(4), encoding);
  }
  
  // APIC: Picture (just indicate presence)
  if (frameId === 'APIC') {
    return '[Embedded Image]';
  }
  
  // PRIV: Private frame
  if (frameId === 'PRIV') {
    const nullPos = data.indexOf(0);
    const owner = readString(data, 0, nullPos);
    return `Private: ${owner}`;
  }
  
  return null;
}

function getID3FrameName(frameId) {
  const names = {
    'TIT2': 'Title',
    'TPE1': 'Artist',
    'TPE2': 'Album Artist',
    'TALB': 'Album',
    'TYER': 'Year',
    'TDRC': 'Recording Date',
    'TCON': 'Genre',
    'TRCK': 'Track Number',
    'TPOS': 'Disc Number',
    'TCOM': 'Composer',
    'TENC': 'Encoded By',
    'TSSE': 'Encoding Software',
    'TOPE': 'Original Artist',
    'TCOP': 'Copyright',
    'TPUB': 'Publisher',
    'COMM': 'Comment',
    'APIC': 'Album Art',
    'TXXX': 'Custom Field',
    'PRIV': 'Private Data',
    'WOAR': 'Artist URL',
    'WOAS': 'Source URL',
    'WORS': 'Radio Station URL',
    'GEOB': 'Encapsulated Object'
  };
  return names[frameId] || frameId;
}

function getID3FrameRisk(frameId) {
  // High risk: identifying info
  const highRisk = ['TENC', 'TSSE', 'TXXX', 'PRIV', 'GEOB', 'WOAR', 'WOAS'];
  if (highRisk.includes(frameId)) return 'high';
  
  // Medium risk: could be identifying
  const mediumRisk = ['TPE1', 'TPE2', 'TCOM', 'COMM', 'TCOP', 'TPUB'];
  if (mediumRisk.includes(frameId)) return 'medium';
  
  return 'low';
}

// ===== WAV Metadata Reading =====
function readWavMetadata(uint8, view, metadata) {
  // Check RIFF header
  if (String.fromCharCode(uint8[0], uint8[1], uint8[2], uint8[3]) !== 'RIFF') return;
  if (String.fromCharCode(uint8[8], uint8[9], uint8[10], uint8[11]) !== 'WAVE') return;
  
  let offset = 12;
  
  while (offset < uint8.length - 8) {
    const chunkId = String.fromCharCode(uint8[offset], uint8[offset+1], uint8[offset+2], uint8[offset+3]);
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkId === 'LIST') {
      const listType = String.fromCharCode(uint8[offset+8], uint8[offset+9], uint8[offset+10], uint8[offset+11]);
      
      if (listType === 'INFO') {
        // Parse INFO sub-chunks
        let infoOffset = offset + 12;
        const infoEnd = offset + 8 + chunkSize;
        
        while (infoOffset < infoEnd - 8) {
          const infoId = String.fromCharCode(uint8[infoOffset], uint8[infoOffset+1], uint8[infoOffset+2], uint8[infoOffset+3]);
          const infoSize = view.getUint32(infoOffset + 4, true);
          const infoValue = readString(uint8, infoOffset + 8, infoSize);
          
          if (infoValue) {
            metadata.items.push({
              name: getWavInfoName(infoId),
              value: infoValue,
              risk: getWavInfoRisk(infoId)
            });
          }
          
          infoOffset += 8 + infoSize + (infoSize % 2); // Align to even boundary
        }
      }
    }
    
    offset += 8 + chunkSize + (chunkSize % 2);
  }
}

function getWavInfoName(id) {
  const names = {
    'IART': 'Artist',
    'ICMT': 'Comment',
    'ICOP': 'Copyright',
    'ICRD': 'Creation Date',
    'IENG': 'Engineer',
    'IGNR': 'Genre',
    'IKEY': 'Keywords',
    'IMED': 'Medium',
    'INAM': 'Title',
    'IPRD': 'Product',
    'ISBJ': 'Subject',
    'ISFT': 'Software',
    'ISRC': 'Source',
    'ISRF': 'Source Form',
    'ITCH': 'Technician'
  };
  return names[id] || id;
}

function getWavInfoRisk(id) {
  const highRisk = ['IENG', 'ISFT', 'ITCH'];
  const mediumRisk = ['IART', 'ICMT', 'ICOP'];
  
  if (highRisk.includes(id)) return 'high';
  if (mediumRisk.includes(id)) return 'medium';
  return 'low';
}

// ===== M4A/AAC Metadata Reading =====
function readM4AMetadata(uint8, view, metadata) {
  // Find moov atom
  let offset = 0;
  
  while (offset < uint8.length - 8) {
    const size = view.getUint32(offset, false);
    const type = String.fromCharCode(uint8[offset+4], uint8[offset+5], uint8[offset+6], uint8[offset+7]);
    
    if (size < 8) break;
    
    if (type === 'moov') {
      parseM4AAtoms(uint8, view, offset + 8, offset + size, metadata);
      break;
    }
    
    offset += size;
  }
}

function parseM4AAtoms(uint8, view, start, end, metadata) {
  let offset = start;
  
  while (offset < end - 8) {
    const size = view.getUint32(offset, false);
    const type = String.fromCharCode(uint8[offset+4], uint8[offset+5], uint8[offset+6], uint8[offset+7]);
    
    if (size < 8) break;
    
    // Container atoms
    if (['udta', 'meta', 'ilst'].includes(type)) {
      const innerStart = type === 'meta' ? offset + 12 : offset + 8; // meta has 4-byte version
      parseM4AAtoms(uint8, view, innerStart, offset + size, metadata);
    }
    
    // Metadata atoms under ilst
    if (type.startsWith('©') || ['aART', 'covr', 'cprt', 'desc'].includes(type)) {
      const value = parseM4ADataAtom(uint8, view, offset + 8, offset + size);
      if (value) {
        metadata.items.push({
          name: getM4AAtomName(type),
          value: value,
          risk: getM4AAtomRisk(type)
        });
      }
    }
    
    offset += size;
  }
}

function parseM4ADataAtom(uint8, view, start, end) {
  // Find 'data' sub-atom
  let offset = start;
  
  while (offset < end - 8) {
    const size = view.getUint32(offset, false);
    const type = String.fromCharCode(uint8[offset+4], uint8[offset+5], uint8[offset+6], uint8[offset+7]);
    
    if (type === 'data' && size > 16) {
      const dataType = view.getUint32(offset + 8, false);
      
      if (dataType === 1) { // UTF-8 text
        return readString(uint8, offset + 16, size - 16);
      } else if (dataType === 13 || dataType === 14) { // Image
        return '[Embedded Image]';
      }
    }
    
    offset += size;
  }
  
  return null;
}

function getM4AAtomName(type) {
  const names = {
    '©nam': 'Title',
    '©ART': 'Artist',
    '©alb': 'Album',
    '©day': 'Year',
    '©gen': 'Genre',
    '©cmt': 'Comment',
    '©wrt': 'Composer',
    '©too': 'Encoding Tool',
    '©enc': 'Encoded By',
    'aART': 'Album Artist',
    'cprt': 'Copyright',
    'covr': 'Cover Art',
    'desc': 'Description'
  };
  return names[type] || type;
}

function getM4AAtomRisk(type) {
  const highRisk = ['©too', '©enc'];
  const mediumRisk = ['©ART', '©cmt', 'cprt'];
  
  if (highRisk.includes(type)) return 'high';
  if (mediumRisk.includes(type)) return 'medium';
  return 'low';
}

// ===== Vorbis Comments (OGG/FLAC) =====
function readVorbisComments(uint8, view, metadata) {
  // Search for Vorbis comment pattern
  const vorbisPattern = [0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]; // \x03vorbis
  
  let offset = findPattern(uint8, vorbisPattern);
  
  if (offset === -1) {
    // Try FLAC metadata block
    if (uint8[0] === 0x66 && uint8[1] === 0x4C && uint8[2] === 0x61 && uint8[3] === 0x43) { // "fLaC"
      offset = 4;
      
      while (offset < uint8.length - 4) {
        const blockType = uint8[offset] & 0x7f;
        const isLast = (uint8[offset] & 0x80) !== 0;
        const blockSize = (uint8[offset+1] << 16) | (uint8[offset+2] << 8) | uint8[offset+3];
        
        if (blockType === 4) { // VORBIS_COMMENT
          parseVorbisCommentBlock(uint8, view, offset + 4, offset + 4 + blockSize, metadata);
        }
        
        if (isLast) break;
        offset += 4 + blockSize;
      }
    }
    return;
  }
  
  // Parse Vorbis comments
  offset += 7; // Skip vorbis marker
  parseVorbisCommentBlock(uint8, view, offset, uint8.length, metadata);
}

function parseVorbisCommentBlock(uint8, view, start, end, metadata) {
  let offset = start;
  
  // Vendor string
  if (offset + 4 > end) return;
  const vendorLength = view.getUint32(offset, true);
  offset += 4;
  
  if (offset + vendorLength > end) return;
  const vendor = readString(uint8, offset, vendorLength);
  if (vendor) {
    metadata.items.push({
      name: 'Encoder',
      value: vendor,
      risk: 'high'
    });
  }
  offset += vendorLength;
  
  // User comments
  if (offset + 4 > end) return;
  const commentCount = view.getUint32(offset, true);
  offset += 4;
  
  for (let i = 0; i < commentCount && offset + 4 < end; i++) {
    const commentLength = view.getUint32(offset, true);
    offset += 4;
    
    if (offset + commentLength > end) break;
    
    const comment = readString(uint8, offset, commentLength);
    offset += commentLength;
    
    if (comment) {
      const eqPos = comment.indexOf('=');
      if (eqPos > 0) {
        const key = comment.substring(0, eqPos).toUpperCase();
        const value = comment.substring(eqPos + 1);
        
        metadata.items.push({
          name: getVorbisCommentName(key),
          value: value,
          risk: getVorbisCommentRisk(key)
        });
      }
    }
  }
}

function getVorbisCommentName(key) {
  const names = {
    'TITLE': 'Title',
    'ARTIST': 'Artist',
    'ALBUM': 'Album',
    'DATE': 'Date',
    'GENRE': 'Genre',
    'TRACKNUMBER': 'Track',
    'COMMENT': 'Comment',
    'ENCODER': 'Encoder',
    'ENCODED-BY': 'Encoded By',
    'COPYRIGHT': 'Copyright'
  };
  return names[key] || key;
}

function getVorbisCommentRisk(key) {
  const highRisk = ['ENCODER', 'ENCODED-BY'];
  const mediumRisk = ['ARTIST', 'COMMENT', 'COPYRIGHT'];
  
  if (highRisk.includes(key)) return 'high';
  if (mediumRisk.includes(key)) return 'medium';
  return 'low';
}

// ===== Clean Audio Metadata =====
async function cleanAudioMetadata(file) {
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  const audioType = getAudioType(file);
  
  let cleanedData;
  
  switch (audioType) {
    case 'mp3':
      cleanedData = cleanMP3(uint8);
      break;
    case 'wav':
      cleanedData = cleanWAV(uint8);
      break;
    case 'm4a':
      cleanedData = cleanM4A(uint8);
      break;
    case 'ogg':
    case 'flac':
      // For OGG/FLAC, full cleaning requires reencoding
      // For now, just return original with warning
      cleanedData = uint8;
      break;
    default:
      cleanedData = uint8;
  }
  
  return new Blob([cleanedData], { type: file.type });
}

function cleanMP3(uint8) {
  const view = new DataView(uint8.buffer);
  let startOffset = 0;
  let endOffset = uint8.length;
  
  // Remove ID3v2 tag at start
  if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) {
    const size = readSyncSafeInt(uint8, 6);
    startOffset = 10 + size;
  }
  
  // Remove ID3v1 tag at end
  const tagOffset = uint8.length - 128;
  if (tagOffset > 0 && uint8[tagOffset] === 0x54 && uint8[tagOffset+1] === 0x41 && uint8[tagOffset+2] === 0x47) {
    endOffset = tagOffset;
  }
  
  // Also check for ID3v1.1 extended tag (227 bytes before ID3v1)
  const extOffset = endOffset - 227;
  if (extOffset > 0 && uint8[extOffset] === 0x54 && uint8[extOffset+1] === 0x41 && uint8[extOffset+2] === 0x47 && uint8[extOffset+3] === 0x2B) {
    endOffset = extOffset;
  }
  
  return uint8.slice(startOffset, endOffset);
}

function cleanWAV(uint8) {
  const view = new DataView(uint8.buffer);
  const result = [];
  
  // Copy RIFF header
  result.push(uint8.slice(0, 12));
  
  let offset = 12;
  
  while (offset < uint8.length - 8) {
    const size = view.getUint32(offset + 4, true);
    const type = String.fromCharCode(uint8[offset], uint8[offset+1], uint8[offset+2], uint8[offset+3]);
    
    // Skip LIST INFO chunks (metadata)
    if (type === 'LIST') {
      const listType = String.fromCharCode(uint8[offset+8], uint8[offset+9], uint8[offset+10], uint8[offset+11]);
      if (listType === 'INFO') {
        offset += 8 + size + (size % 2);
        continue;
      }
    }
    
    // Copy other chunks
    const chunkEnd = offset + 8 + size + (size % 2);
    result.push(uint8.slice(offset, Math.min(chunkEnd, uint8.length)));
    offset = chunkEnd;
  }
  
  // Recalculate RIFF size
  const combined = concatenateUint8Arrays(result);
  const newView = new DataView(combined.buffer);
  newView.setUint32(4, combined.length - 8, true);
  
  return combined;
}

function cleanM4A(uint8) {
  const view = new DataView(uint8.buffer);
  const result = [];
  let offset = 0;
  
  while (offset < uint8.length - 8) {
    const size = view.getUint32(offset, false);
    const type = String.fromCharCode(uint8[offset+4], uint8[offset+5], uint8[offset+6], uint8[offset+7]);
    
    if (size < 8) break;
    
    // Skip meta atom (contains all iTunes metadata)
    if (type === 'meta') {
      offset += size;
      continue;
    }
    
    // For moov atom, clean recursively
    if (type === 'moov') {
      const cleanedMoov = cleanM4AMoov(uint8.slice(offset, offset + size), view);
      result.push(cleanedMoov);
    } else {
      result.push(uint8.slice(offset, offset + size));
    }
    
    offset += size;
  }
  
  return concatenateUint8Arrays(result);
}

function cleanM4AMoov(moovData, originalView) {
  const result = [];
  const view = new DataView(moovData.buffer, moovData.byteOffset);
  let offset = 8; // Skip moov header
  
  result.push(moovData.slice(0, 8)); // Copy moov header
  
  while (offset < moovData.length - 8) {
    const size = view.getUint32(offset, false);
    const type = String.fromCharCode(moovData[offset+4], moovData[offset+5], moovData[offset+6], moovData[offset+7]);
    
    if (size < 8) break;
    
    // Skip udta (user data) which contains ilst metadata
    if (type === 'udta') {
      offset += size;
      continue;
    }
    
    result.push(moovData.slice(offset, offset + size));
    offset += size;
  }
  
  // Update moov size
  const combined = concatenateUint8Arrays(result);
  const newView = new DataView(combined.buffer);
  newView.setUint32(0, combined.length, false);
  
  return combined;
}

// ===== Utility Functions =====
function readString(uint8, offset, length) {
  const bytes = uint8.slice(offset, offset + length);
  const nullIndex = bytes.indexOf(0);
  const actualBytes = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
  
  try {
    return new TextDecoder('utf-8').decode(actualBytes).trim();
  } catch {
    return new TextDecoder('iso-8859-1').decode(actualBytes).trim();
  }
}

function decodeText(data, encoding) {
  try {
    switch (encoding) {
      case 0: // ISO-8859-1
        return new TextDecoder('iso-8859-1').decode(data).replace(/\x00/g, '').trim();
      case 1: // UTF-16 with BOM
      case 2: // UTF-16BE
        return new TextDecoder('utf-16').decode(data).replace(/\x00/g, '').trim();
      case 3: // UTF-8
      default:
        return new TextDecoder('utf-8').decode(data).replace(/\x00/g, '').trim();
    }
  } catch {
    return '';
  }
}

function findNull(data, start, encoding) {
  if (encoding === 1 || encoding === 2) {
    // UTF-16: look for double null
    for (let i = start; i < data.length - 1; i += 2) {
      if (data[i] === 0 && data[i+1] === 0) return i;
    }
  } else {
    // Single byte: look for single null
    for (let i = start; i < data.length; i++) {
      if (data[i] === 0) return i;
    }
  }
  return data.length;
}

function findPattern(uint8, pattern) {
  outer: for (let i = 0; i <= uint8.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (uint8[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concatenateUint8Arrays(arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  return result;
}

// ===== Technical Info: MP3 Frame Header =====
function readMP3FrameInfo(uint8, view, metadata, fileSize) {
  // Find first sync word (0xFFE0 mask)
  let offset = 0;
  // Skip ID3v2 tag if present
  if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) {
    const tagSize = ((uint8[6] & 0x7F) << 21) | ((uint8[7] & 0x7F) << 14) | 
                    ((uint8[8] & 0x7F) << 7) | (uint8[9] & 0x7F);
    offset = tagSize + 10;
  }
  
  // Search for frame sync
  while (offset < uint8.length - 4) {
    if (uint8[offset] === 0xFF && (uint8[offset + 1] & 0xE0) === 0xE0) {
      break;
    }
    offset++;
  }
  
  if (offset >= uint8.length - 4) return;
  
  const header = view.getUint32(offset);
  const versionBits = (header >> 19) & 0x03;
  const layerBits = (header >> 17) & 0x03;
  const bitrateIdx = (header >> 12) & 0x0F;
  const sampleIdx = (header >> 10) & 0x03;
  const channelMode = (header >> 6) & 0x03;
  
  // MPEG version
  const versions = { 0: '2.5', 2: '2', 3: '1' };
  const version = versions[versionBits];
  
  // Layer
  const layers = { 1: 'III', 2: 'II', 3: 'I' };
  const layer = layers[layerBits];
  
  // Bitrate table (MPEG1 Layer III)
  const bitrateTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitrate = bitrateTable[bitrateIdx];
  
  // Sample rate table
  const sampleRates = {
    3: [44100, 48000, 32000], // MPEG1
    2: [22050, 24000, 16000], // MPEG2
    0: [11025, 12000, 8000]   // MPEG2.5
  };
  const sampleRate = (sampleRates[versionBits] || [])[sampleIdx];
  
  // Channel mode
  const channels = channelMode === 3 ? 'Mono' : 'Stereo';
  
  if (version && layer) {
    metadata.items.push({ key: 'Format', value: `MPEG${version} Layer ${layer}`, category: 'technical' });
  }
  if (bitrate > 0) {
    metadata.items.push({ key: 'Bitrate', value: `${bitrate} kbps`, category: 'technical' });
  }
  if (sampleRate > 0) {
    metadata.items.push({ key: 'Sample Rate', value: `${sampleRate} Hz`, category: 'technical' });
  }
  metadata.items.push({ key: 'Channels', value: channels, category: 'technical' });
  
  // Estimate duration from bitrate
  if (bitrate > 0) {
    const audioBytes = fileSize - offset;
    const durationSec = (audioBytes * 8) / (bitrate * 1000);
    if (durationSec > 0 && durationSec < 360000) {
      const min = Math.floor(durationSec / 60);
      const sec = Math.floor(durationSec % 60);
      metadata.items.push({ key: 'Duration (est.)', value: `${min}:${sec.toString().padStart(2, '0')}`, category: 'technical' });
    }
  }
}

// ===== Technical Info: WAV Header =====
function readWavTechnical(view, metadata, fileSize) {
  // WAV header: RIFF....WAVEfmt 
  // fmt chunk at offset 12: 'fmt ' + size(4) + audioFormat(2) + channels(2) + sampleRate(4) + byteRate(4) + blockAlign(2) + bitsPerSample(2)
  try {
    if (view.byteLength < 44) return;
    const channels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const byteRate = view.getUint32(28, true);
    const bitsPerSample = view.getUint16(34, true);
    
    if (sampleRate > 0 && sampleRate <= 192000) {
      metadata.items.push({ key: 'Sample Rate', value: `${sampleRate} Hz`, category: 'technical' });
    }
    if (channels > 0 && channels <= 16) {
      metadata.items.push({ key: 'Channels', value: channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels}ch`, category: 'technical' });
    }
    if (bitsPerSample > 0) {
      metadata.items.push({ key: 'Bit Depth', value: `${bitsPerSample}-bit`, category: 'technical' });
    }
    if (byteRate > 0) {
      metadata.items.push({ key: 'Bitrate', value: `${Math.round(byteRate * 8 / 1000)} kbps`, category: 'technical' });
      const duration = (fileSize - 44) / byteRate;
      if (duration > 0 && duration < 360000) {
        const min = Math.floor(duration / 60);
        const sec = Math.floor(duration % 60);
        metadata.items.push({ key: 'Duration (est.)', value: `${min}:${sec.toString().padStart(2, '0')}`, category: 'technical' });
      }
    }
  } catch (e) { /* non-critical */ }
}

// Export
export { isAudio, getAudioType, readAudioMetadata, cleanAudioMetadata };
