/**
 * MetaSafe GIF Metadata Processor
 * Client-side GIF metadata reading and cleaning
 * 
 * GIF89a format contains:
 * - Header: GIF signature (GIF87a or GIF89a)
 * - Logical Screen Descriptor
 * - Global Color Table (optional)
 * - Extension blocks:
 *   - Comment Extension (0x21 0xFE) - Can contain author info
 *   - Application Extension (0x21 0xFF) - NETSCAPE2.0, XMP, etc.
 *   - Graphics Control Extension (0x21 0xF9)
 *   - Plain Text Extension (0x21 0x01)
 * - Image Data
 * - Trailer (0x3B)
 */

// GIF block identifiers
const GIF_SIGNATURE_87 = 'GIF87a';
const GIF_SIGNATURE_89 = 'GIF89a';
const EXTENSION_INTRODUCER = 0x21;
const IMAGE_SEPARATOR = 0x2C;
const TRAILER = 0x3B;

// Extension labels
const GRAPHICS_CONTROL_LABEL = 0xF9;
const COMMENT_LABEL = 0xFE;
const PLAINTEXT_LABEL = 0x01;
const APPLICATION_LABEL = 0xFF;

// Known application identifiers
const SENSITIVE_APPS = [
  'XMP Data',
  'ICCRGBG1',  // ICC profile
  'ADOBE:IR',  // Adobe ImageReady
  'ImageMagick',
  'MGK8BIM0000' // Adobe metadata
];

/**
 * Check if a file is a GIF
 */
function isGIF(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  return file.type === 'image/gif' || ext === 'gif';
}

/**
 * Read GIF metadata
 */
async function readGIFMetadata(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  const metadata = {
    format: 'GIF',
    items: []
  };
  
  try {
    // Check signature
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature !== GIF_SIGNATURE_87 && signature !== GIF_SIGNATURE_89) {
      metadata.items.push({
        name: 'Error',
        value: 'Not a valid GIF file',
        risk: 'low'
      });
      return metadata;
    }
    
    metadata.items.push({
      name: 'Version',
      value: signature,
      risk: 'low'
    });
    
    // Logical Screen Descriptor (bytes 6-12)
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    const packed = bytes[10];
    const hasGlobalColorTable = (packed & 0x80) !== 0;
    const colorResolution = ((packed & 0x70) >> 4) + 1;
    const globalColorTableSize = hasGlobalColorTable ? Math.pow(2, (packed & 0x07) + 1) : 0;
    
    metadata.items.push({
      name: 'Dimensions',
      value: `${width} × ${height}`,
      risk: 'low'
    });
    
    metadata.items.push({
      name: 'Color Resolution',
      value: `${colorResolution} bits`,
      risk: 'low'
    });
    
    // Skip to data blocks (after header + LSD + global color table)
    let offset = 13;
    if (hasGlobalColorTable) {
      offset += globalColorTableSize * 3;
    }
    
    // Parse extension blocks
    let frameCount = 0;
    let comments = [];
    let applications = [];
    
    while (offset < bytes.length) {
      const blockType = bytes[offset];
      
      if (blockType === TRAILER) {
        break;
      }
      
      if (blockType === EXTENSION_INTRODUCER) {
        const label = bytes[offset + 1];
        offset += 2;
        
        if (label === COMMENT_LABEL) {
          // Comment Extension
          const comment = readSubBlocks(bytes, offset);
          if (comment.text.trim()) {
            comments.push(comment.text.trim());
          }
          offset = comment.nextOffset;
        } else if (label === APPLICATION_LABEL) {
          // Application Extension
          const blockSize = bytes[offset];
          if (blockSize >= 11) {
            const appId = String.fromCharCode(...bytes.slice(offset + 1, offset + 9)).trim();
            const authCode = String.fromCharCode(...bytes.slice(offset + 9, offset + 12));
            
            applications.push({
              id: appId,
              authCode: authCode
            });
          }
          offset++;
          // Skip application data sub-blocks
          const skipResult = skipSubBlocks(bytes, offset + blockSize);
          offset = skipResult;
        } else if (label === GRAPHICS_CONTROL_LABEL) {
          // Graphics Control Extension - skip it
          const blockSize = bytes[offset];
          offset += blockSize + 2; // +1 for size byte, +1 for terminator
        } else if (label === PLAINTEXT_LABEL) {
          // Plain Text Extension - might contain info
          const blockSize = bytes[offset];
          offset++;
          const textResult = readSubBlocks(bytes, offset + blockSize);
          if (textResult.text.trim()) {
            metadata.items.push({
              name: 'Plain Text',
              value: truncate(textResult.text.trim(), 50),
              risk: 'medium'
            });
          }
          offset = textResult.nextOffset;
        } else {
          // Unknown extension - skip
          const blockSize = bytes[offset];
          offset++;
          offset = skipSubBlocks(bytes, offset + blockSize);
        }
      } else if (blockType === IMAGE_SEPARATOR) {
        // Image Descriptor
        frameCount++;
        offset += 10; // Skip image descriptor
        
        // Check for local color table
        const localPacked = bytes[offset - 1];
        const hasLocalColorTable = (localPacked & 0x80) !== 0;
        if (hasLocalColorTable) {
          const localTableSize = Math.pow(2, (localPacked & 0x07) + 1);
          offset += localTableSize * 3;
        }
        
        // Skip LZW minimum code size
        offset++;
        
        // Skip image data sub-blocks
        offset = skipSubBlocks(bytes, offset);
      } else {
        // Unknown block - try to skip
        offset++;
      }
    }
    
    // Add frame count
    metadata.items.push({
      name: 'Frames',
      value: frameCount.toString(),
      risk: 'low'
    });
    
    // Add comments (sensitive!)
    if (comments.length > 0) {
      metadata.items.push({
        name: 'Comments',
        value: `${comments.length} comment(s)`,
        risk: 'high',
        details: comments.slice(0, 3).join('\n')
      });
    }
    
    // Add application extensions
    for (const app of applications) {
      const isSensitive = SENSITIVE_APPS.some(s => app.id.includes(s));
      
      if (app.id === 'NETSCAPE') {
        metadata.items.push({
          name: 'Animation Loop',
          value: 'NETSCAPE2.0 extension',
          risk: 'low'
        });
      } else {
        metadata.items.push({
          name: `App Extension: ${app.id}`,
          value: app.authCode || 'present',
          risk: isSensitive ? 'high' : 'medium'
        });
      }
    }
    
  } catch (e) {
    console.error('Error reading GIF:', e);
    metadata.items.push({
      name: 'Error',
      value: e.message,
      risk: 'low'
    });
  }
  
  return metadata;
}

/**
 * Read sub-blocks and return text content
 */
function readSubBlocks(bytes, offset) {
  let text = '';
  
  while (offset < bytes.length) {
    const blockSize = bytes[offset];
    offset++;
    
    if (blockSize === 0) {
      break;
    }
    
    for (let i = 0; i < blockSize && (offset + i) < bytes.length; i++) {
      text += String.fromCharCode(bytes[offset + i]);
    }
    offset += blockSize;
  }
  
  return { text, nextOffset: offset };
}

/**
 * Skip sub-blocks and return next offset
 */
function skipSubBlocks(bytes, offset) {
  while (offset < bytes.length) {
    const blockSize = bytes[offset];
    offset++;
    
    if (blockSize === 0) {
      break;
    }
    
    offset += blockSize;
  }
  
  return offset;
}

/**
 * Clean GIF metadata - remove comments and sensitive app extensions
 */
async function cleanGIFMetadata(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const cleanedParts = [];
  
  try {
    // Check signature
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature !== GIF_SIGNATURE_87 && signature !== GIF_SIGNATURE_89) {
      return new Blob([buffer], { type: 'image/gif' });
    }
    
    // Copy header and LSD
    cleanedParts.push(bytes.slice(0, 13));
    
    // Handle global color table
    const packed = bytes[10];
    const hasGlobalColorTable = (packed & 0x80) !== 0;
    let offset = 13;
    
    if (hasGlobalColorTable) {
      const globalColorTableSize = Math.pow(2, (packed & 0x07) + 1) * 3;
      cleanedParts.push(bytes.slice(13, 13 + globalColorTableSize));
      offset = 13 + globalColorTableSize;
    }
    
    // Process blocks
    while (offset < bytes.length) {
      const blockType = bytes[offset];
      
      if (blockType === TRAILER) {
        cleanedParts.push(new Uint8Array([TRAILER]));
        break;
      }
      
      if (blockType === EXTENSION_INTRODUCER) {
        const label = bytes[offset + 1];
        const extStart = offset;
        offset += 2;
        
        if (label === COMMENT_LABEL) {
          // Skip comment extension entirely
          const result = readSubBlocks(bytes, offset);
          offset = result.nextOffset;
          // Don't add to cleanedParts - removing comment
        } else if (label === APPLICATION_LABEL) {
          const blockSize = bytes[offset];
          let appId = '';
          if (blockSize >= 8) {
            appId = String.fromCharCode(...bytes.slice(offset + 1, offset + 9)).trim();
          }
          
          // Keep NETSCAPE2.0 (animation loop) - remove others with sensitive data
          const keepApp = appId === 'NETSCAPE';
          
          offset++;
          const dataStart = offset + blockSize;
          const nextOffset = skipSubBlocks(bytes, dataStart);
          
          if (keepApp) {
            cleanedParts.push(bytes.slice(extStart, nextOffset));
          }
          // Else: skip (remove XMP, Adobe, etc.)
          
          offset = nextOffset;
        } else if (label === GRAPHICS_CONTROL_LABEL) {
          // Keep graphics control extension
          const blockSize = bytes[offset];
          const extEnd = offset + blockSize + 2;
          cleanedParts.push(bytes.slice(extStart, extEnd));
          offset = extEnd;
        } else if (label === PLAINTEXT_LABEL) {
          // Remove plain text extension (might contain identifying info)
          const blockSize = bytes[offset];
          offset++;
          const result = readSubBlocks(bytes, offset + blockSize);
          offset = result.nextOffset;
          // Don't add - removing
        } else {
          // Unknown extension - keep it
          const blockSize = bytes[offset];
          offset++;
          const nextOffset = skipSubBlocks(bytes, offset + blockSize);
          cleanedParts.push(bytes.slice(extStart, nextOffset));
          offset = nextOffset;
        }
      } else if (blockType === IMAGE_SEPARATOR) {
        // Keep image data intact
        const imgStart = offset;
        offset += 10;
        
        // Local color table
        const localPacked = bytes[imgStart + 9];
        const hasLocalColorTable = (localPacked & 0x80) !== 0;
        if (hasLocalColorTable) {
          const localTableSize = Math.pow(2, (localPacked & 0x07) + 1) * 3;
          offset += localTableSize;
        }
        
        // LZW minimum code size
        offset++;
        
        // Image data sub-blocks
        const dataEnd = skipSubBlocks(bytes, offset);
        cleanedParts.push(bytes.slice(imgStart, dataEnd));
        offset = dataEnd;
      } else {
        // Unknown - skip byte
        offset++;
      }
    }
    
    // Combine all parts
    const totalLength = cleanedParts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of cleanedParts) {
      result.set(part, pos);
      pos += part.length;
    }
    
    return new Blob([result], { type: 'image/gif' });
    
  } catch (e) {
    console.error('Error cleaning GIF:', e);
    return new Blob([buffer], { type: 'image/gif' });
  }
}

/**
 * Truncate helper
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

export { isGIF, readGIFMetadata, cleanGIFMetadata };
