/**
 * PNG Metadata Processor
 * Cleans metadata by re-encoding through Canvas API
 */

/**
 * Read PNG file and extract any text chunks (metadata)
 * Note: Canvas API doesn't expose PNG text chunks directly,
 * so we do a basic header check and rely on Canvas re-encoding to strip metadata
 * @param {File} file - PNG file
 * @returns {Promise<Object>} Metadata info
 */
export async function readPngMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const buffer = e.target.result;
        const view = new DataView(buffer);
        
        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        const isPng = view.getUint32(0) === 0x89504E47 && view.getUint32(4) === 0x0D0A1A0A;
        
        if (!isPng) {
          resolve({ items: [], raw: null, riskCounts: { high: 0, medium: 0, low: 0 } });
          return;
        }
        
        // Parse PNG chunks to find text metadata
        const metadata = {
          raw: null,
          items: [],
          riskCounts: { high: 0, medium: 0, low: 0 }
        };
        
        let offset = 8; // Skip signature
        
        while (offset < buffer.byteLength) {
          const length = view.getUint32(offset);
          const typeCode = view.getUint32(offset + 4);
          
          // Convert type code to string
          const type = String.fromCharCode(
            (typeCode >> 24) & 0xFF,
            (typeCode >> 16) & 0xFF,
            (typeCode >> 8) & 0xFF,
            typeCode & 0xFF
          );
          
          // Text chunks: tEXt, zTXt, iTXt
          if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
            // Read chunk data
            const chunkData = new Uint8Array(buffer, offset + 8, length);
            
            // Find null separator
            let nullIndex = 0;
            while (nullIndex < chunkData.length && chunkData[nullIndex] !== 0) {
              nullIndex++;
            }
            
            const keyword = new TextDecoder('latin1').decode(chunkData.slice(0, nullIndex));
            let value = '[binary/compressed]';
            
            if (type === 'tEXt' && nullIndex < chunkData.length) {
              value = new TextDecoder('latin1').decode(chunkData.slice(nullIndex + 1));
            }
            
            // Determine risk
            let risk = 'low';
            const highRiskKeywords = ['GPS', 'Location', 'Author', 'Creator', 'Comment'];
            const mediumRiskKeywords = ['Software', 'Date', 'Time', 'Description'];
            
            if (highRiskKeywords.some(k => keyword.toLowerCase().includes(k.toLowerCase()))) {
              risk = 'high';
            } else if (mediumRiskKeywords.some(k => keyword.toLowerCase().includes(k.toLowerCase()))) {
              risk = 'medium';
            }
            
            metadata.items.push({
              key: keyword,
              label: keyword,
              value: value.length > 100 ? value.substring(0, 100) + '...' : value,
              risk: risk,
              chunkType: type
            });
            
            metadata.riskCounts[risk]++;
          }
          
          // iCCP chunk = ICC Color Profile (may contain device info)
          if (type === 'iCCP') {
            metadata.items.push({
              key: 'ICCProfile',
              label: 'ICC Renk Profili',
              value: `${length} byte — cihaz/kalibrasyon bilgisi içerebilir`,
              risk: 'medium',
              chunkType: 'iCCP'
            });
            metadata.riskCounts.medium++;
            metadata.hasICC = true;
          }
          
          // Move to next chunk (length + type + data + CRC)
          offset += 4 + 4 + length + 4;
          
          // IEND chunk = end of file
          if (type === 'IEND') break;
        }
        
        resolve(metadata);
        
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Clean PNG metadata by re-encoding through Canvas
 * This strips all text chunks and creates a clean PNG
 * @param {File} file - PNG file
 * @returns {Promise<Blob>} Clean PNG blob
 */
export async function cleanPngMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create clean PNG'));
        }
      }, 'image/png');
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Check if file is a PNG
 * @param {File} file
 * @returns {boolean}
 */
export function isPng(file) {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
}
