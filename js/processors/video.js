/**
 * MetaSafe MP4/Video Metadata Processor
 * Client-side video metadata reading and cleaning
 * 
 * MP4 files use a box/atom structure. Metadata is typically in:
 * - moov/udta (user data)
 * - moov/meta (metadata)
 * - moov/mvhd (movie header - creation/modification time)
 * - GPS data in moov/udta/©xyz or moov/trak/mdia/minf/stbl
 */

// Check if file is MP4/MOV
export function isVideo(file) {
  const videoTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
    'video/3gpp',
    'video/3gpp2'
  ];
  
  if (videoTypes.includes(file.type)) return true;
  
  const ext = file.name.toLowerCase().split('.').pop();
  return ['mp4', 'mov', 'm4v', '3gp', '3g2'].includes(ext);
}

// Read MP4 box structure
async function readBoxes(buffer) {
  const view = new DataView(buffer);
  const boxes = [];
  let offset = 0;
  
  while (offset < buffer.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    
    if (size === 0) break; // End of file
    if (size < 8) break; // Invalid box
    
    let actualSize = size;
    let headerSize = 8;
    
    // Extended size (64-bit)
    if (size === 1 && offset + 16 <= buffer.byteLength) {
      const highBits = view.getUint32(offset + 8);
      const lowBits = view.getUint32(offset + 12);
      actualSize = highBits * 0x100000000 + lowBits;
      headerSize = 16;
    }
    
    boxes.push({
      type,
      offset,
      size: actualSize,
      headerSize,
      dataOffset: offset + headerSize,
      dataSize: actualSize - headerSize
    });
    
    offset += actualSize;
    
    // Safety limit
    if (boxes.length > 1000) break;
  }
  
  return boxes;
}

// Parse nested boxes (moov, trak, etc.)
async function parseNestedBoxes(buffer, parentBox) {
  const view = new DataView(buffer);
  const boxes = [];
  let offset = parentBox.dataOffset;
  const endOffset = parentBox.offset + parentBox.size;
  
  while (offset < endOffset - 8) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    
    if (size === 0 || size < 8) break;
    
    let actualSize = size;
    let headerSize = 8;
    
    if (size === 1 && offset + 16 <= buffer.byteLength) {
      const highBits = view.getUint32(offset + 8);
      const lowBits = view.getUint32(offset + 12);
      actualSize = highBits * 0x100000000 + lowBits;
      headerSize = 16;
    }
    
    boxes.push({
      type,
      offset,
      size: actualSize,
      headerSize,
      dataOffset: offset + headerSize,
      dataSize: actualSize - headerSize
    });
    
    offset += actualSize;
    if (boxes.length > 500) break;
  }
  
  return boxes;
}

// Extract metadata from mvhd box (movie header)
function parseMvhd(buffer, box) {
  const view = new DataView(buffer);
  const version = view.getUint8(box.dataOffset);
  
  let creationTime, modificationTime, timescale, duration;
  
  if (version === 0) {
    // 32-bit timestamps (seconds since 1904-01-01)
    creationTime = view.getUint32(box.dataOffset + 4);
    modificationTime = view.getUint32(box.dataOffset + 8);
    timescale = view.getUint32(box.dataOffset + 12);
    duration = view.getUint32(box.dataOffset + 16);
  } else {
    // 64-bit timestamps
    creationTime = view.getUint32(box.dataOffset + 8); // Low 32 bits
    modificationTime = view.getUint32(box.dataOffset + 20);
    timescale = view.getUint32(box.dataOffset + 24);
    duration = view.getUint32(box.dataOffset + 32);
  }
  
  // Convert from Mac epoch (1904) to Unix epoch (1970)
  const macToUnix = 2082844800;
  
  return {
    creationTime: creationTime > macToUnix ? new Date((creationTime - macToUnix) * 1000) : null,
    modificationTime: modificationTime > macToUnix ? new Date((modificationTime - macToUnix) * 1000) : null,
    duration: timescale > 0 ? duration / timescale : 0,
    timescale
  };
}

// Read text from udta box
function parseUdtaText(buffer, box) {
  const decoder = new TextDecoder('utf-8');
  const data = new Uint8Array(buffer, box.dataOffset, Math.min(box.dataSize, 1000));
  return decoder.decode(data).replace(/\0/g, '').trim();
}

// GPS parsing from ©xyz atom
function parseGpsXyz(buffer, box) {
  const decoder = new TextDecoder('utf-8');
  const data = new Uint8Array(buffer, box.dataOffset, box.dataSize);
  const text = decoder.decode(data).replace(/\0/g, '');
  
  // Format: +37.7749-122.4194+000.000/
  const match = text.match(/([+-]\d+\.\d+)([+-]\d+\.\d+)/);
  if (match) {
    return {
      latitude: parseFloat(match[1]),
      longitude: parseFloat(match[2])
    };
  }
  return null;
}

// Parse trak box to extract codec, resolution, sample rate
function parseTrakInfo(buffer, trakBox) {
  const items = [];
  const view = new DataView(buffer);
  
  try {
    const trakChildren = parseNestedBoxesSync(buffer, trakBox);
    const mdiaBox = trakChildren.find(b => b.type === 'mdia');
    if (!mdiaBox) return null;
    
    const mdiaChildren = parseNestedBoxesSync(buffer, mdiaBox);
    
    // hdlr tells us if this is video or audio track
    const hdlrBox = mdiaChildren.find(b => b.type === 'hdlr');
    let handlerType = '';
    if (hdlrBox && hdlrBox.dataSize >= 12) {
      handlerType = String.fromCharCode(
        view.getUint8(hdlrBox.dataOffset + 8),
        view.getUint8(hdlrBox.dataOffset + 9),
        view.getUint8(hdlrBox.dataOffset + 10),
        view.getUint8(hdlrBox.dataOffset + 11)
      );
    }
    
    const minfBox = mdiaChildren.find(b => b.type === 'minf');
    if (!minfBox) return items;
    
    const minfChildren = parseNestedBoxesSync(buffer, minfBox);
    const stblBox = minfChildren.find(b => b.type === 'stbl');
    if (!stblBox) return items;
    
    const stblChildren = parseNestedBoxesSync(buffer, stblBox);
    const stsdBox = stblChildren.find(b => b.type === 'stsd');
    if (!stsdBox || stsdBox.dataSize < 16) return items;
    
    // stsd: version(4) + entry_count(4) + entries
    const entryCount = view.getUint32(stsdBox.dataOffset + 4);
    if (entryCount === 0) return items;
    
    // First entry starts at offset 8
    const entryOffset = stsdBox.dataOffset + 8;
    if (entryOffset + 8 > buffer.byteLength) return items;
    
    const entrySize = view.getUint32(entryOffset);
    const codec = String.fromCharCode(
      view.getUint8(entryOffset + 4),
      view.getUint8(entryOffset + 5),
      view.getUint8(entryOffset + 6),
      view.getUint8(entryOffset + 7)
    ).trim();
    
    if (codec) {
      const codecNames = {
        'avc1': 'H.264/AVC', 'hvc1': 'H.265/HEVC', 'hev1': 'H.265/HEVC',
        'vp08': 'VP8', 'vp09': 'VP9', 'av01': 'AV1',
        'mp4a': 'AAC', '.mp3': 'MP3', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3',
        'Opus': 'Opus', 'fLaC': 'FLAC', 'alac': 'ALAC'
      };
      items.push({
        key: handlerType === 'vide' ? 'Video Codec' : handlerType === 'soun' ? 'Audio Codec' : 'Codec',
        value: codecNames[codec] || codec.toUpperCase(),
        category: 'technical'
      });
    }
    
    // Video track: resolution at fixed offset in visual sample entry
    if (handlerType === 'vide' && entryOffset + 32 <= buffer.byteLength) {
      // Visual sample entry: 6 reserved + 2 data_ref_idx + 16 pre-defined + 2 width + 2 height
      const width = view.getUint16(entryOffset + 8 + 24);
      const height = view.getUint16(entryOffset + 8 + 26);
      if (width > 0 && height > 0 && width < 16384 && height < 16384) {
        items.push({
          key: 'Resolution',
          value: `${width}×${height}`,
          category: 'technical'
        });
      }
    }
    
    // Audio track: sample rate at fixed offset
    if (handlerType === 'soun' && entryOffset + 36 <= buffer.byteLength) {
      // Audio sample entry: 6 reserved + 2 data_ref + 8 reserved + 2 channels + 2 sample_size + 4 reserved + 4 sample_rate(16.16)
      const channels = view.getUint16(entryOffset + 8 + 8);
      const sampleRate = view.getUint16(entryOffset + 8 + 24); // integer part of 16.16
      if (sampleRate > 0 && sampleRate <= 192000) {
        items.push({
          key: 'Sample Rate',
          value: `${sampleRate} Hz`,
          category: 'technical'
        });
      }
      if (channels > 0 && channels <= 16) {
        items.push({
          key: 'Channels',
          value: channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels}ch`,
          category: 'technical'
        });
      }
    }
  } catch (e) { /* non-critical parsing failure */ }
  
  return items.length > 0 ? items : null;
}

// Synchronous nested box parser (avoids async overhead in tight loops)
function parseNestedBoxesSync(buffer, parentBox) {
  const view = new DataView(buffer);
  const children = [];
  let offset = parentBox.dataOffset;
  const end = parentBox.dataOffset + parentBox.dataSize;
  
  while (offset + 8 <= end && offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset);
    if (size < 8) break;
    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7)
    );
    children.push({
      type,
      offset,
      size,
      dataOffset: offset + 8,
      dataSize: size - 8
    });
    offset += size;
  }
  return children;
}

// Metadata boxes to look for
const METADATA_BOX_TYPES = [
  'udta',  // User data
  'meta',  // Metadata
  '©nam',  // Name/Title
  '©ART',  // Artist
  '©alb',  // Album
  '©day',  // Year/Date
  '©cmt',  // Comment
  '©gen',  // Genre
  '©wrt',  // Writer
  '©too',  // Encoding tool
  '©xyz',  // GPS coordinates
  'auth',  // Author
  'titl',  // Title
  'dscp',  // Description
  'cprt',  // Copyright
  'loci',  // Location
  'GPS ',  // GPS data
  'free',  // Free space (can contain metadata)
  'skip',  // Skip (can contain metadata)
];

// Read video metadata
export async function readVideoMetadata(file) {
  const metadata = {
    format: file.type || 'video/mp4',
    fileName: file.name,
    fileSize: file.size,
    items: []
  };
  
  try {
    const buffer = await file.arrayBuffer();
    const boxes = await readBoxes(buffer);
    
    // Find moov box
    const moovBox = boxes.find(b => b.type === 'moov');
    if (!moovBox) {
      metadata.items.push({ key: 'Error', value: 'Invalid MP4: no moov box', category: 'technical' });
      return metadata;
    }
    
    // Parse moov children
    const moovChildren = await parseNestedBoxes(buffer, moovBox);
    
    // Parse mvhd (movie header)
    const mvhdBox = moovChildren.find(b => b.type === 'mvhd');
    let timescale = 0;
    if (mvhdBox) {
      const mvhd = parseMvhd(buffer, mvhdBox);
      timescale = mvhd.timescale || 0;
      if (mvhd.creationTime) {
        metadata.items.push({
          key: 'Creation Time',
          value: mvhd.creationTime.toISOString(),
          category: 'temporal',
          dangerous: true
        });
      }
      if (mvhd.modificationTime) {
        metadata.items.push({
          key: 'Modification Time',
          value: mvhd.modificationTime.toISOString(),
          category: 'temporal',
          dangerous: true
        });
      }
      if (mvhd.duration) {
        metadata.items.push({
          key: 'Duration',
          value: `${mvhd.duration.toFixed(2)}s`,
          category: 'technical'
        });
      }
    }
    
    // Parse trak boxes for codec, resolution, sample rate
    const trakBoxes = moovChildren.filter(b => b.type === 'trak');
    for (const trak of trakBoxes) {
      try {
        const trakInfo = parseTrakInfo(buffer, trak);
        if (trakInfo) {
          for (const item of trakInfo) {
            metadata.items.push(item);
          }
        }
      } catch (e) { /* non-critical */ }
    }
    
    // File size info
    metadata.items.push({
      key: 'File Size',
      value: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      category: 'technical'
    });
    
    // Estimate bitrate from size and duration
    const mvhd2 = mvhdBox ? parseMvhd(buffer, mvhdBox) : null;
    if (mvhd2 && mvhd2.duration > 0) {
      const bitrate = (file.size * 8) / mvhd2.duration;
      metadata.items.push({
        key: 'Bitrate (est.)',
        value: bitrate > 1000000 ? `${(bitrate / 1000000).toFixed(1)} Mbps` : `${(bitrate / 1000).toFixed(0)} kbps`,
        category: 'technical'
      });
    }
    
    // Parse udta (user data)
    const udtaBox = moovChildren.find(b => b.type === 'udta');
    if (udtaBox) {
      const udtaChildren = await parseNestedBoxes(buffer, udtaBox);
      
      for (const child of udtaChildren) {
        // GPS coordinates
        if (child.type === '©xyz' || child.type === 'xyz ') {
          const gps = parseGpsXyz(buffer, child);
          if (gps) {
            metadata.items.push({
              key: 'GPS Latitude',
              value: gps.latitude.toString(),
              category: 'location',
              dangerous: true
            });
            metadata.items.push({
              key: 'GPS Longitude',
              value: gps.longitude.toString(),
              category: 'location',
              dangerous: true
            });
          }
        }
        
        // Other metadata
        const metaTypes = {
          '©nam': 'Title',
          '©ART': 'Artist',
          '©alb': 'Album',
          '©day': 'Date',
          '©cmt': 'Comment',
          '©too': 'Encoder',
          '©wrt': 'Writer',
          'auth': 'Author',
          'titl': 'Title',
          'dscp': 'Description',
          'cprt': 'Copyright'
        };
        
        if (metaTypes[child.type]) {
          const text = parseUdtaText(buffer, child);
          if (text && text.length > 0) {
            metadata.items.push({
              key: metaTypes[child.type],
              value: text.substring(0, 200),
              category: child.type === '©day' ? 'temporal' : 'personal',
              dangerous: ['©too', 'auth', '©ART', '©wrt'].includes(child.type)
            });
          }
        }
      }
      
      // Check for meta box inside udta
      const metaBox = udtaChildren.find(b => b.type === 'meta');
      if (metaBox) {
        metadata.items.push({
          key: 'Metadata Container',
          value: 'Present',
          category: 'technical',
          dangerous: true
        });
      }
    }
    
    // Check for standalone meta box
    const metaBox = moovChildren.find(b => b.type === 'meta');
    if (metaBox) {
      metadata.items.push({
        key: 'Metadata Container',
        value: 'Present in moov',
        category: 'technical',
        dangerous: true
      });
    }
    
    // File structure info
    metadata.items.push({
      key: 'Container',
      value: 'MP4/QuickTime',
      category: 'technical'
    });
    
    metadata.items.push({
      key: 'Boxes Found',
      value: boxes.map(b => b.type).join(', '),
      category: 'technical'
    });
    
  } catch (e) {
    metadata.items.push({
      key: 'Parse Error',
      value: e.message,
      category: 'technical'
    });
  }
  
  return metadata;
}

// Clean video metadata by rewriting without metadata boxes
export async function cleanVideoMetadata(file) {
  const buffer = await file.arrayBuffer();
  const boxes = await readBoxes(buffer);
  
  // Find essential boxes
  const ftypBox = boxes.find(b => b.type === 'ftyp');
  const moovBox = boxes.find(b => b.type === 'moov');
  const mdatBox = boxes.find(b => b.type === 'mdat');
  
  if (!moovBox || !mdatBox) {
    throw new Error('Invalid MP4 structure');
  }
  
  // Parse moov to get children
  const moovChildren = await parseNestedBoxes(buffer, moovBox);
  
  // Filter out metadata boxes from moov, keep only essential ones
  const essentialTypes = ['mvhd', 'trak', 'iods'];
  const cleanMoovChildren = moovChildren.filter(b => essentialTypes.includes(b.type));
  
  // Get mvhd and zero out timestamps
  const mvhdBox = cleanMoovChildren.find(b => b.type === 'mvhd');
  
  // Calculate new moov size
  let newMoovDataSize = 0;
  for (const child of cleanMoovChildren) {
    newMoovDataSize += child.size;
  }
  const newMoovSize = 8 + newMoovDataSize; // 8 bytes for moov header
  
  // Build new file
  const parts = [];
  
  // ftyp box (unchanged)
  if (ftypBox) {
    parts.push(new Uint8Array(buffer, ftypBox.offset, ftypBox.size));
  }
  
  // Cleaned moov box
  const moovHeader = new Uint8Array(8);
  const moovView = new DataView(moovHeader.buffer);
  moovView.setUint32(0, newMoovSize);
  moovHeader[4] = 'm'.charCodeAt(0);
  moovHeader[5] = 'o'.charCodeAt(0);
  moovHeader[6] = 'o'.charCodeAt(0);
  moovHeader[7] = 'v'.charCodeAt(0);
  parts.push(moovHeader);
  
  // Add cleaned moov children
  for (const child of cleanMoovChildren) {
    const childData = new Uint8Array(buffer, child.offset, child.size);
    
    // Zero out timestamps in mvhd
    if (child.type === 'mvhd') {
      const cleaned = new Uint8Array(childData);
      const view = new DataView(cleaned.buffer, cleaned.byteOffset, cleaned.byteLength);
      const version = view.getUint8(8); // After box header
      
      if (version === 0) {
        // Zero 32-bit timestamps
        view.setUint32(12, 0); // creation_time
        view.setUint32(16, 0); // modification_time
      } else {
        // Zero 64-bit timestamps
        view.setUint32(12, 0);
        view.setUint32(16, 0);
        view.setUint32(20, 0);
        view.setUint32(24, 0);
      }
      parts.push(cleaned);
    } else {
      parts.push(childData);
    }
  }
  
  // mdat box (unchanged - this is the actual video/audio data)
  parts.push(new Uint8Array(buffer, mdatBox.offset, mdatBox.size));
  
  // Combine all parts
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  
  // Create new file
  const cleanedFile = new File(
    [result],
    file.name.replace(/(\.[^.]+)$/, '_clean$1'),
    { type: file.type || 'video/mp4' }
  );
  
  return {
    file: cleanedFile,
    removedItems: ['Creation Time', 'Modification Time', 'User Data', 'Metadata']
  };
}
