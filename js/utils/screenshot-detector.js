/**
 * MetaSafe Screenshot Detector
 * Detects if an image is likely a screenshot and provides specific warnings
 * 
 * Detection methods:
 * - Filename patterns (Screenshot, IMG_, Screen Shot, Ekran görüntüsü)
 * - Typical screen resolutions (iPhone, Android, Desktop)
 * - EXIF software tags indicating screen capture
 * - PNG tEXt chunks with screenshot markers
 */

// Common screenshot filename patterns (multilingual)
const SCREENSHOT_PATTERNS = [
  /screenshot/i,
  /screen\s*shot/i,
  /screen\s*capture/i,
  /ekran\s*görüntüsü/i,      // Turkish
  /ekran\s*goruntusu/i,
  /captura\s*de\s*pantalla/i, // Spanish
  /capture\s*d'écran/i,       // French
  /bildschirmfoto/i,          // German
  /снимок\s*экрана/i,         // Russian
  /截图/,                      // Chinese
  /截屏/,                      // Chinese
  /スクリーンショット/,         // Japanese
  /لقطة\s*شاشة/,              // Arabic
  /IMG_\d{4}/i,               // iOS pattern
  /Screenshot_\d{4}/i,        // Android pattern
  /Screen\s*Recording/i
];

// Common phone/tablet screen resolutions [width, height]
const PHONE_RESOLUTIONS = [
  // iPhone resolutions
  [1170, 2532], [1284, 2778], [1179, 2556], [1290, 2796], // iPhone 12-15 Pro
  [1125, 2436], [828, 1792], [1242, 2688], // iPhone X, XR, XS Max
  [750, 1334], [1080, 1920], [1242, 2208], // iPhone 6/7/8 Plus
  [640, 1136], [640, 960], // iPhone 5, 4
  
  // iPad resolutions
  [2048, 2732], [1668, 2388], [1640, 2360], [1620, 2160],
  
  // Android common resolutions
  [1080, 1920], [1440, 2560], [1080, 2340], [1080, 2400],
  [1440, 3040], [1440, 3200], [1080, 2280], [720, 1280],
  [720, 1520], [720, 1600], [1080, 2160], [1440, 2880],
  
  // Desktop common resolutions (also screenshots)
  [1920, 1080], [2560, 1440], [3840, 2160], [1366, 768],
  [1536, 864], [1280, 720], [1600, 900], [1280, 800],
  [2880, 1800], [2560, 1600], // MacBook Retina
];

// Software tags that indicate screenshot
const SCREENSHOT_SOFTWARE = [
  /screenshot/i,
  /screen\s*capture/i,
  /snipping\s*tool/i,
  /snip\s*&\s*sketch/i,
  /greenshot/i,
  /lightshot/i,
  /sharex/i,
  /flameshot/i,
  /spectacle/i,
  /gyazo/i,
  /monosnap/i,
  /skitch/i,
  /grab/i,
  /preview/i  // macOS
];

/**
 * Detect if a file is likely a screenshot
 * @param {File} file - The image file
 * @param {Object} metadata - Parsed metadata from the file
 * @returns {Object} Detection result
 */
function detectScreenshot(file, metadata) {
  const result = {
    isScreenshot: false,
    confidence: 0,
    reasons: [],
    warnings: [],
    platform: null
  };
  
  // Check filename
  const filename = file.name.toLowerCase();
  for (const pattern of SCREENSHOT_PATTERNS) {
    if (pattern.test(filename)) {
      result.confidence += 40;
      result.reasons.push('filename_pattern');
      break;
    }
  }
  
  // Check resolution. Metadata items expose their field name as `key`/`label`
  // (not `name`), so read across all three and guard against undefined to avoid
  // a crash on any file that carries metadata items.
  if (metadata?.items) {
    const fieldOf = (i) => String(i.name ?? i.key ?? i.label ?? '').toLowerCase();
    const widthItem = metadata.items.find(i =>
      fieldOf(i).includes('width') ||
      fieldOf(i).includes('genişlik') ||
      i.key === 'ImageWidth' || i.name === 'ImageWidth'
    );
    const heightItem = metadata.items.find(i =>
      fieldOf(i).includes('height') ||
      fieldOf(i).includes('yükseklik') ||
      i.key === 'ImageHeight' || i.name === 'ImageHeight'
    );
    
    if (widthItem && heightItem) {
      const width = parseInt(widthItem.value);
      const height = parseInt(heightItem.value);
      
      if (isPhoneResolution(width, height)) {
        result.confidence += 30;
        result.reasons.push('phone_resolution');
        result.platform = detectPlatform(width, height);
      }
    }
    
    // Check software tag
    // NOTE: metadata items use `key` (or `label`) not `name` in most processors.
    // Use the same fieldOf() helper to avoid crash on undefined.
    const softwareItem = metadata.items.find(i => 
      fieldOf(i) === 'software' ||
      fieldOf(i).includes('yazılım')
    );
    
    if (softwareItem) {
      for (const pattern of SCREENSHOT_SOFTWARE) {
        if (pattern.test(softwareItem.value)) {
          result.confidence += 30;
          result.reasons.push('software_tag');
          break;
        }
      }
    }
    
    // Check for device info (indicates phone screenshot)
    const makeItem = metadata.items.find(i => 
      fieldOf(i) === 'make' ||
      fieldOf(i).includes('üretici')
    );
    const modelItem = metadata.items.find(i => 
      fieldOf(i) === 'model'
    );
    
    if (makeItem || modelItem) {
      const make = (makeItem?.value || '').toLowerCase();
      const model = (modelItem?.value || '').toLowerCase();
      
      // Phone manufacturers
      const phoneManufacturers = ['apple', 'samsung', 'huawei', 'xiaomi', 'oppo', 'vivo', 'oneplus', 'google', 'pixel', 'motorola', 'lg', 'sony', 'nokia', 'realme'];
      
      if (phoneManufacturers.some(m => make.includes(m) || model.includes(m))) {
        result.confidence += 20;
        result.reasons.push('phone_manufacturer');
        
        // Add specific warnings
        if (make || model) {
          result.warnings.push({
            type: 'device',
            message: `Cihaz bilgisi tespit edildi: ${make} ${model}`.trim(),
            risk: 'medium'
          });
        }
      }
    }
    
    // Check for date/time (always present in screenshots)
    const dateItem = metadata.items.find(i => 
      fieldOf(i).includes('date') ||
      fieldOf(i).includes('tarih') ||
      fieldOf(i).includes('time') ||
      fieldOf(i).includes('zaman')
    );
    
    if (dateItem) {
      result.warnings.push({
        type: 'datetime',
        message: `Screenshot tarihi tespit edildi: ${dateItem.value}`,
        risk: 'low'
      });
    }
  }
  
  // Determine if it's a screenshot
  result.isScreenshot = result.confidence >= 40;
  
  // Add general warning if screenshot detected
  if (result.isScreenshot) {
    result.warnings.unshift({
      type: 'screenshot',
      message: 'Bu dosya bir screenshot/ekran görüntüsü olarak tespit edildi. Cihaz ve zaman bilgisi içerebilir.',
      risk: 'high'
    });
  }
  
  return result;
}

/**
 * Check if dimensions match common phone/tablet resolutions
 */
function isPhoneResolution(width, height) {
  // Also check rotated (landscape)
  return PHONE_RESOLUTIONS.some(([w, h]) => 
    (width === w && height === h) ||
    (width === h && height === w) ||
    // Allow small variations (±10 pixels for different phone models)
    (Math.abs(width - w) <= 10 && Math.abs(height - h) <= 10) ||
    (Math.abs(width - h) <= 10 && Math.abs(height - w) <= 10)
  );
}

/**
 * Try to detect the platform based on resolution
 */
function detectPlatform(width, height) {
  // iPhone specific resolutions
  const iPhoneRes = [
    [1170, 2532], [1284, 2778], [1179, 2556], [1290, 2796],
    [1125, 2436], [828, 1792], [1242, 2688],
    [750, 1334], [1242, 2208], [640, 1136], [640, 960]
  ];
  
  for (const [w, h] of iPhoneRes) {
    if ((width === w && height === h) || (width === h && height === w)) {
      return 'iPhone';
    }
  }
  
  // iPad resolutions
  const iPadRes = [[2048, 2732], [1668, 2388], [1640, 2360], [1620, 2160]];
  for (const [w, h] of iPadRes) {
    if ((width === w && height === h) || (width === h && height === w)) {
      return 'iPad';
    }
  }
  
  // Desktop
  const desktopRes = [[1920, 1080], [2560, 1440], [3840, 2160], [1366, 768], [2880, 1800]];
  for (const [w, h] of desktopRes) {
    if ((width === w && height === h) || (width === h && height === w)) {
      return 'Desktop';
    }
  }
  
  return 'Android'; // Default to Android for other mobile resolutions
}

/**
 * Get screenshot-specific cleaning recommendations
 */
function getScreenshotRecommendations(detectionResult) {
  const recommendations = [];
  
  if (detectionResult.isScreenshot) {
    recommendations.push({
      icon: '📱',
      title: 'Cihaz Bilgisi',
      desc: 'Telefon/bilgisayar marka ve modeli kaldırılacak'
    });
    
    recommendations.push({
      icon: '🕐',
      title: 'Zaman Damgası',
      desc: 'Screenshot alınma tarihi ve saati kaldırılacak'
    });
    
    recommendations.push({
      icon: '🖥️',
      title: 'Ekran Bilgisi',
      desc: 'Ekran çözünürlüğü ve yazılım bilgisi kaldırılacak'
    });
    
    if (detectionResult.platform === 'iPhone' || detectionResult.platform === 'iPad') {
      recommendations.push({
        icon: '🍎',
        title: 'Apple Metadata',
        desc: 'iOS/iPadOS özgü metadata kaldırılacak'
      });
    }
  }
  
  return recommendations;
}

export { 
  detectScreenshot, 
  isPhoneResolution, 
  detectPlatform,
  getScreenshotRecommendations,
  SCREENSHOT_PATTERNS,
  PHONE_RESOLUTIONS
};
