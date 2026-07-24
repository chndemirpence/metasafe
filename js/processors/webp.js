/**
 * WebP Metadata Processor
 * Cleans metadata by re-encoding through Canvas API
 */

/**
 * Read WebP metadata (limited browser support for reading)
 * @param {File} file - WebP file
 * @returns {Promise<Object>} Metadata info
 */
export async function readWebpMetadata(file) {
  // WebP metadata reading is complex and not well supported in browsers
  // We'll do a basic check and assume metadata might exist
  return Promise.resolve({
    items: [{
      key: 'WebPMetadata',
      label: 'WebP Metadata',
      value: 'WebP dosyası algılandı. Canvas ile yeniden kodlanacak.',
      risk: 'medium'
    }],
    raw: null,
    riskCounts: { high: 0, medium: 1, low: 0 },
    note: 'WebP metadata detaylı okunamıyor, temizleme yapılacak'
  });
}

/**
 * Clean WebP metadata by re-encoding through Canvas
 * @param {File} file - WebP file
 * @returns {Promise<Blob>} Clean WebP blob (or JPEG if WebP not supported)
 */
export async function cleanWebpMetadata(file) {
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
      
      // Try WebP first, fallback to JPEG
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // Fallback to JPEG if WebP not supported
          canvas.toBlob((jpegBlob) => {
            if (jpegBlob) {
              resolve(jpegBlob);
            } else {
              reject(new Error('Failed to create clean image'));
            }
          }, 'image/jpeg', 0.92);
        }
      }, 'image/webp', 0.92);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Check if file is WebP
 * @param {File} file
 * @returns {boolean}
 */
export function isWebp(file) {
  return file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
}
