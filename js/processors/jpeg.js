/**
 * JPEG Metadata Processor
 * Handles reading and removing EXIF/IPTC/XMP metadata from JPEG files
 */

// Metadata risk levels for UI display
const METADATA_RISK = {
  high: [
    'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
    'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef',
    'GPSTimeStamp', 'GPSDateStamp', 'GPSMapDatum',
    'SerialNumber', 'BodySerialNumber', 'LensSerialNumber',
    'CameraOwnerName', 'OwnerName', 'Artist', 'Copyright',
    'ImageDescription', 'UserComment', 'XPAuthor', 'XPComment'
  ],
  medium: [
    'Make', 'Model', 'Software', 'HostComputer',
    'DateTimeOriginal', 'CreateDate', 'ModifyDate',
    'DateTimeDigitized', 'DateTime',
    'LensModel', 'LensMake', 'LensInfo',
    'ImageUniqueID', 'CameraSerialNumber'
  ],
  low: [
    'ExifVersion', 'FlashpixVersion', 'ColorSpace',
    'PixelXDimension', 'PixelYDimension',
    'FocalLength', 'FocalLengthIn35mmFilm',
    'FNumber', 'ExposureTime', 'ISOSpeedRatings',
    'ExposureProgram', 'MeteringMode', 'Flash',
    'WhiteBalance', 'DigitalZoomRatio'
  ]
};

// Human-readable labels for metadata fields
const METADATA_LABELS = {
  // GPS
  GPSLatitude: 'GPS Enlem',
  GPSLongitude: 'GPS Boylam',
  GPSAltitude: 'GPS Yükseklik',
  GPSLatitudeRef: 'Enlem Referansı',
  GPSLongitudeRef: 'Boylam Referansı',
  GPSTimeStamp: 'GPS Zaman',
  GPSDateStamp: 'GPS Tarih',
  
  // Device
  Make: 'Üretici',
  Model: 'Model',
  Software: 'Yazılım',
  HostComputer: 'Bilgisayar',
  SerialNumber: 'Seri No',
  BodySerialNumber: 'Gövde Seri No',
  LensSerialNumber: 'Lens Seri No',
  CameraOwnerName: 'Kamera Sahibi',
  OwnerName: 'Sahip Adı',
  
  // Personal
  Artist: 'Sanatçı',
  Copyright: 'Telif Hakkı',
  ImageDescription: 'Açıklama',
  UserComment: 'Kullanıcı Notu',
  XPAuthor: 'Yazar',
  XPComment: 'Yorum',
  
  // Time
  DateTimeOriginal: 'Çekim Tarihi',
  CreateDate: 'Oluşturma Tarihi',
  ModifyDate: 'Değiştirme Tarihi',
  DateTimeDigitized: 'Dijitalleştirme',
  DateTime: 'Tarih/Saat',
  
  // Lens
  LensModel: 'Lens Modeli',
  LensMake: 'Lens Üreticisi',
  LensInfo: 'Lens Bilgisi',
  
  // Technical
  FocalLength: 'Odak Uzaklığı',
  FNumber: 'Diyafram',
  ExposureTime: 'Enstantane',
  ISOSpeedRatings: 'ISO',
  ExifVersion: 'EXIF Sürümü',
  ColorSpace: 'Renk Alanı',
  PixelXDimension: 'Genişlik',
  PixelYDimension: 'Yükseklik'
};

/**
 * Get risk level for a metadata key
 */
function getMetadataRisk(key) {
  if (METADATA_RISK.high.includes(key)) return 'high';
  if (METADATA_RISK.medium.includes(key)) return 'medium';
  if (METADATA_RISK.low.includes(key)) return 'low';
  return 'low';
}

/**
 * Get human-readable label for a metadata key
 */
function getMetadataLabel(key) {
  return METADATA_LABELS[key] || key;
}

/**
 * Convert GPS coordinates from EXIF format to decimal degrees
 */
function convertGPSToDecimal(gpsData, ref) {
  if (!gpsData || !Array.isArray(gpsData) || gpsData.length < 3) return null;
  
  const degrees = gpsData[0][0] / gpsData[0][1];
  const minutes = gpsData[1][0] / gpsData[1][1];
  const seconds = gpsData[2][0] / gpsData[2][1];
  
  let decimal = degrees + (minutes / 60) + (seconds / 3600);
  
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }
  
  return decimal.toFixed(6);
}

/**
 * Format metadata value for display
 */
function formatMetadataValue(key, value) {
  // GPS coordinates
  if (key === 'GPSLatitude' && value) {
    return `${value}° (raw)`;
  }
  if (key === 'GPSLongitude' && value) {
    return `${value}° (raw)`;
  }
  
  // Dates
  if (key.includes('Date') || key.includes('Time')) {
    if (typeof value === 'string') return value;
    return String(value);
  }
  
  // Rational numbers
  if (Array.isArray(value) && value.length === 2) {
    const decimal = value[0] / value[1];
    if (key === 'ExposureTime') {
      return decimal < 1 ? `1/${Math.round(1/decimal)}s` : `${decimal}s`;
    }
    if (key === 'FNumber') {
      return `f/${decimal.toFixed(1)}`;
    }
    if (key === 'FocalLength') {
      return `${decimal.toFixed(0)}mm`;
    }
    return decimal.toFixed(2);
  }
  
  // Byte arrays (truncate)
  if (value instanceof Uint8Array || (Array.isArray(value) && value.length > 10)) {
    return '[binary data]';
  }
  
  return String(value);
}

/**
 * Read metadata from JPEG file
 * @param {File} file - JPEG file
 * @returns {Promise<Object>} Metadata object
 */
export async function readJpegMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const dataUrl = e.target.result;
        const exifObj = piexif.load(dataUrl);
        
        const metadata = {
          raw: exifObj,
          items: [],
          hasGPS: false,
          hasPersonal: false,
          hasDevice: false,
          riskCounts: { high: 0, medium: 0, low: 0 }
        };
        
        // Process each IFD (Image File Directory)
        const ifdNames = {
          '0th': piexif.ImageIFD,
          'Exif': piexif.ExifIFD,
          'GPS': piexif.GPSIFD,
          '1st': piexif.ImageIFD,
          'Interop': piexif.InteropIFD
        };
        
        for (const [ifdKey, ifdTagMap] of Object.entries(ifdNames)) {
          const ifd = exifObj[ifdKey];
          if (!ifd) continue;
          
          for (const [tagId, value] of Object.entries(ifd)) {
            if (value === undefined || value === null) continue;
            
            // Find tag name
            let tagName = null;
            for (const [name, id] of Object.entries(ifdTagMap)) {
              if (id === parseInt(tagId)) {
                tagName = name;
                break;
              }
            }
            
            if (!tagName) {
              tagName = `Unknown_${ifdKey}_${tagId}`;
            }
            
            const risk = getMetadataRisk(tagName);
            const formattedValue = formatMetadataValue(tagName, value);
            
            metadata.items.push({
              key: tagName,
              label: getMetadataLabel(tagName),
              value: formattedValue,
              rawValue: value,
              risk: risk,
              ifd: ifdKey
            });
            
            metadata.riskCounts[risk]++;
            
            // Track categories
            if (ifdKey === 'GPS') {
              metadata.hasGPS = true;
            }
            if (['Artist', 'Copyright', 'OwnerName', 'CameraOwnerName'].includes(tagName)) {
              metadata.hasPersonal = true;
            }
            if (['Make', 'Model', 'SerialNumber'].includes(tagName)) {
              metadata.hasDevice = true;
            }
          }
        }
        
        // Sort by risk (high first)
        metadata.items.sort((a, b) => {
          const riskOrder = { high: 0, medium: 1, low: 2 };
          return riskOrder[a.risk] - riskOrder[b.risk];
        });
        
        // Add GPS summary if present
        if (metadata.hasGPS && exifObj.GPS) {
          const lat = exifObj.GPS[piexif.GPSIFD.GPSLatitude];
          const latRef = exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef];
          const lon = exifObj.GPS[piexif.GPSIFD.GPSLongitude];
          const lonRef = exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef];
          
          if (lat && lon) {
            metadata.gpsDecimal = {
              latitude: convertGPSToDecimal(lat, latRef),
              longitude: convertGPSToDecimal(lon, lonRef)
            };
          }
        }
        
        // Check for embedded thumbnail (privacy risk: may contain uncropped original)
        if (exifObj['thumbnail'] || exifObj['1st']) {
          const thumbData = exifObj['thumbnail'];
          if (thumbData && thumbData.length > 0) {
            metadata.items.push({
              key: 'EmbeddedThumbnail',
              label: 'Gömülü Thumbnail',
              value: `${thumbData.length} byte — kırpılmamış orijinal görüntüyü içerebilir!`,
              risk: 'medium'
            });
            metadata.riskCounts.medium++;
            metadata.hasThumbnail = true;
          }
        }
        
        // Check for ICC profile (may contain device name/manufacturer)
        // piexif doesn't directly expose ICC, but we can check the binary data
        try {
          const binaryStr = atob(dataUrl.split(',')[1]);
          // ICC profile starts with marker 0xFFE2 in JPEG
          const iccMarkerIdx = binaryStr.indexOf('\xFF\xE2');
          if (iccMarkerIdx !== -1) {
            // Try to extract device description from ICC profile
            // ICC profiles contain device manufacturer/model in ASCII
            const iccStart = iccMarkerIdx + 4; // Skip marker + length
            const iccChunk = binaryStr.substring(iccStart, Math.min(iccStart + 200, binaryStr.length));
            // Look for readable device names in ICC data
            const readableMatch = iccChunk.match(/[A-Za-z][A-Za-z0-9 .,-]{3,30}/g);
            const deviceHint = readableMatch ? readableMatch.filter(s => 
              !['sRGB', 'RGB ', 'CMYK', 'Gray', 'acsp', 'desc', 'XYZ '].some(t => s.startsWith(t))
            ).slice(0, 2).join(', ') : '';
            
            metadata.items.push({
              key: 'ICCProfile',
              label: 'ICC Renk Profili',
              value: deviceHint ? `Cihaz bilgisi içerebilir: ${deviceHint}` : 'Mevcut (cihaz/kalibrasyon bilgisi içerebilir)',
              risk: 'medium'
            });
            metadata.riskCounts.medium++;
            metadata.hasICC = true;
          }
        } catch (iccErr) {
          // Non-critical, skip
        }
        
        // Printer tracking dots (MIC) warning
        // If image has printer/scanner-related software or high DPI (300+), it may be a scan
        const softwareItem = metadata.items.find(i => i.key === 'Software' || i.key === 'ProcessingSoftware');
        const xRes = exifObj['0th'] && exifObj['0th'][piexif.ImageIFD.XResolution];
        const resValue = Array.isArray(xRes) ? xRes[0] / (xRes[1] || 1) : xRes;
        
        const printerSoftware = ['Xerox', 'Canon', 'HP ', 'Epson', 'Brother', 'Ricoh', 'Konica', 
          'Lexmark', 'ScanSnap', 'WIA', 'TWAIN', 'Scanner', 'Copier'];
        const isPrinted = softwareItem && printerSoftware.some(p => 
          String(softwareItem.value).toLowerCase().includes(p.toLowerCase())
        );
        const isHighDPI = resValue && resValue >= 300;
        
        if (isPrinted || (isHighDPI && metadata.items.some(i => 
          String(i.value).toLowerCase().includes('scan') || 
          String(i.value).toLowerCase().includes('print')
        ))) {
          metadata.items.unshift({
            key: 'PrinterTrackingWarning',
            label: '⚠️ Yazıcı İzleme Noktaları',
            value: 'Bu dosya taranmış/yazdırılmış olabilir. Renkli yazıcılar görünmez sarı noktalar (MIC) bırakır — tarih, seri no, konum bilgisi içerir. Paranoid Mod ile temizlemeniz önerilir.',
            risk: 'high'
          });
          metadata.riskCounts.high++;
          metadata.hasPrinterDots = true;
        }
        
        resolve(metadata);
      } catch (err) {
        // Not a valid JPEG or no EXIF
        if (err.message && err.message.includes('not jpeg')) {
          resolve({ items: [], raw: null, riskCounts: { high: 0, medium: 0, low: 0 } });
        } else {
          reject(err);
        }
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Remove all metadata from JPEG file using piexif
 * @param {File} file - JPEG file
 * @returns {Promise<Blob>} Clean JPEG blob
 */
export async function cleanJpegMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const dataUrl = e.target.result;
        
        // Remove all EXIF data
        const cleanDataUrl = piexif.remove(dataUrl);
        
        // Additionally, re-render through canvas to remove any embedded thumbnail
        // and ensure complete metadata removal
        const img = new Image();
        
        img.onload = function() {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Convert back to blob with quality 0.92 (good balance)
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create clean image'));
            }
          }, 'image/jpeg', 0.92);
        };
        
        img.onerror = () => reject(new Error('Failed to load image for cleaning'));
        img.src = cleanDataUrl;
        
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Check if file is a JPEG
 * @param {File} file
 * @returns {boolean}
 */
export function isJpeg(file) {
  return file.type === 'image/jpeg' || 
         file.name.toLowerCase().endsWith('.jpg') || 
         file.name.toLowerCase().endsWith('.jpeg');
}

export { METADATA_RISK, METADATA_LABELS, getMetadataRisk, getMetadataLabel };
