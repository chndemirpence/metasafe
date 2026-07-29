/**
 * Office Document (DOCX/XLSX/PPTX) Metadata Processor
 * Handles reading and removing metadata from Office Open XML files using JSZip
 */

import { cleanJpegMetadata } from './jpeg.js';
import { cleanPngMetadata } from './png.js';
import { cleanWebpMetadata } from './webp.js';
import { cleanGIFMetadata } from './gif.js';

// Raster formats we can re-encode losslessly-enough via canvas/piexif. A DOCX/
// XLSX/PPTX is a ZIP, and any photo pasted into the document sits untouched
// under word/media|xl/media|ppt/media — cleaning only docProps/*.xml (as this
// file used to) leaves that photo's own EXIF/GPS fully intact inside the
// "cleaned" file. This maps embedded-media extensions to the same cleaners
// used for standalone uploads, so a pasted photo gets the same treatment.
const MEDIA_EXT_TO_CLEANER = {
  jpg: { mime: 'image/jpeg', clean: cleanJpegMetadata },
  jpeg: { mime: 'image/jpeg', clean: cleanJpegMetadata },
  png: { mime: 'image/png', clean: cleanPngMetadata },
  webp: { mime: 'image/webp', clean: cleanWebpMetadata },
  gif: { mime: 'image/gif', clean: cleanGIFMetadata }
};

const MEDIA_PATH_RE = /\/media\/[^/]+\.([a-z0-9]+)$/i;

// Office metadata fields and their risk levels
const OFFICE_METADATA_RISK = {
  high: ['creator', 'lastModifiedBy', 'dc:creator', 'cp:lastModifiedBy'],
  medium: ['created', 'modified', 'dcterms:created', 'dcterms:modified', 'title', 'dc:title', 'subject', 'dc:subject'],
  low: ['revision', 'cp:revision', 'Application', 'AppVersion', 'Company', 'TotalTime']
};

const OFFICE_METADATA_LABELS = {
  'creator': 'Oluşturan',
  'dc:creator': 'Oluşturan',
  'lastModifiedBy': 'Son Değiştiren',
  'cp:lastModifiedBy': 'Son Değiştiren',
  'created': 'Oluşturma Tarihi',
  'dcterms:created': 'Oluşturma Tarihi',
  'modified': 'Değiştirme Tarihi',
  'dcterms:modified': 'Değiştirme Tarihi',
  'title': 'Başlık',
  'dc:title': 'Başlık',
  'subject': 'Konu',
  'dc:subject': 'Konu',
  'revision': 'Revizyon',
  'cp:revision': 'Revizyon',
  'Application': 'Uygulama',
  'AppVersion': 'Uygulama Sürümü',
  'Company': 'Şirket',
  'TotalTime': 'Toplam Düzenleme Süresi',
  'description': 'Açıklama',
  'dc:description': 'Açıklama',
  'keywords': 'Anahtar Kelimeler',
  'cp:keywords': 'Anahtar Kelimeler'
};

/**
 * Get risk level for Office metadata field
 */
function getOfficeMetadataRisk(key) {
  const normalizedKey = key.toLowerCase();
  for (const [risk, fields] of Object.entries(OFFICE_METADATA_RISK)) {
    if (fields.some(f => f.toLowerCase() === normalizedKey || normalizedKey.includes(f.toLowerCase()))) {
      return risk;
    }
  }
  return 'low';
}

/**
 * Parse XML and extract metadata
 */
function parseXmlMetadata(xmlString, filename) {
  const items = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  
  // Get all elements with text content
  const elements = doc.querySelectorAll('*');
  
  for (const el of elements) {
    const tagName = el.tagName;
    const textContent = el.textContent?.trim();
    
    // Skip container elements and empty values
    if (!textContent || el.children.length > 0) continue;
    
    // Skip certain technical tags
    if (['xml', 'Relationships', 'Relationship', 'Types', 'Override', 'Default'].includes(tagName)) continue;
    
    const risk = getOfficeMetadataRisk(tagName);
    const label = OFFICE_METADATA_LABELS[tagName] || tagName;
    
    items.push({
      key: tagName,
      label: label,
      value: textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent,
      risk: risk,
      source: filename
    });
  }
  
  return items;
}

/**
 * Create clean core.xml (docProps/core.xml)
 */
function createCleanCoreXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</cp:coreProperties>`;
}

/**
 * Create clean app.xml (docProps/app.xml)
 */
function createCleanAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
</Properties>`;
}

/**
 * Read metadata from Office document
 * @param {File} file - DOCX/XLSX/PPTX file
 * @returns {Promise<Object>} Metadata object
 */
export async function readOfficeMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        
        if (typeof JSZip === 'undefined') {
          throw new Error('JSZip kütüphanesi yüklenmedi');
        }
        
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        const metadata = {
          raw: null,
          items: [],
          riskCounts: { high: 0, medium: 0, low: 0 }
        };
        
        // Read core.xml (main metadata)
        const coreXml = zip.file('docProps/core.xml');
        if (coreXml) {
          const coreContent = await coreXml.async('string');
          const coreItems = parseXmlMetadata(coreContent, 'core.xml');
          metadata.items.push(...coreItems);
        }
        
        // Read app.xml (application metadata)
        const appXml = zip.file('docProps/app.xml');
        if (appXml) {
          const appContent = await appXml.async('string');
          const appItems = parseXmlMetadata(appContent, 'app.xml');
          metadata.items.push(...appItems);
        }
        
        // Read custom.xml if exists
        const customXml = zip.file('docProps/custom.xml');
        if (customXml) {
          const customContent = await customXml.async('string');
          const customItems = parseXmlMetadata(customContent, 'custom.xml');
          metadata.items.push(...customItems);
        }

        // Detect embedded media (pasted photos etc.) — their OWN metadata
        // (GPS/EXIF) survives unless we clean them too, not just docProps/*.xml.
        const mediaFiles = Object.keys(zip.files).filter((path) => MEDIA_PATH_RE.test(path));
        const cleanableMedia = mediaFiles.filter((path) => {
          const ext = path.match(MEDIA_PATH_RE)[1].toLowerCase();
          return !!MEDIA_EXT_TO_CLEANER[ext];
        });
        if (mediaFiles.length > 0) {
          // Informational, not 'high': once cleaned, these images HAVE been
          // re-encoded (see cleanOfficeMetadata) so their own GPS/EXIF is gone.
          // Marking this 'high' would keep verify() reporting "unverified"
          // forever on any document with a picture, even after real cleaning.
          metadata.items.push({
            key: 'EmbeddedMedia',
            label: 'Gömülü Medya',
            value: `${mediaFiles.length} gömülü resim (${cleanableMedia.length} tanesi Temizle ile birlikte temizlenir) — kendi EXIF/GPS verisi taşıyabilir`,
            risk: 'medium'
          });
          metadata.riskCounts.medium++;
        }

        // Count risks
        for (const item of metadata.items) {
          metadata.riskCounts[item.risk]++;
        }
        
        // Sort by risk
        metadata.items.sort((a, b) => {
          const riskOrder = { high: 0, medium: 1, low: 2 };
          return riskOrder[a.risk] - riskOrder[b.risk];
        });
        
        resolve(metadata);
        
      } catch (err) {
        console.error('Office metadata read error:', err);
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Remove all metadata from Office document
 * @param {File} file - DOCX/XLSX/PPTX file
 * @returns {Promise<Blob>} Clean document blob
 */
export async function cleanOfficeMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        
        if (typeof JSZip === 'undefined') {
          throw new Error('JSZip kütüphanesi yüklenmedi');
        }
        
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // Replace core.xml with clean version
        if (zip.file('docProps/core.xml')) {
          zip.file('docProps/core.xml', createCleanCoreXml());
        }
        
        // Replace app.xml with clean version
        if (zip.file('docProps/app.xml')) {
          zip.file('docProps/app.xml', createCleanAppXml());
        }
        
        // Remove custom.xml if exists
        if (zip.file('docProps/custom.xml')) {
          zip.remove('docProps/custom.xml');
        }

        // Deep clean: re-encode every embedded photo through the same
        // cleaner a standalone upload of that format would get, so a photo
        // pasted into the document doesn't keep its own GPS/EXIF data.
        const mediaFiles = Object.keys(zip.files).filter((path) => MEDIA_PATH_RE.test(path));
        for (const path of mediaFiles) {
          const ext = path.match(MEDIA_PATH_RE)[1].toLowerCase();
          const cleaner = MEDIA_EXT_TO_CLEANER[ext];
          if (!cleaner) continue; // unsupported embedded type (e.g. .emf/.wmf/.bin) — left as-is
          try {
            const bytes = await zip.file(path).async('uint8array');
            const mediaFile = new File([bytes], path.split('/').pop(), { type: cleaner.mime });
            const cleanedBlob = await cleaner.clean(mediaFile);
            const cleanedBytes = new Uint8Array(await cleanedBlob.arrayBuffer());
            zip.file(path, cleanedBytes);
          } catch (mediaErr) {
            console.warn(`Embedded media clean failed for ${path}:`, mediaErr);
            // Leave that one file as-is rather than failing the whole document.
          }
        }

        // Generate cleaned file
        const cleanedBytes = await zip.generateAsync({
          type: 'blob',
          mimeType: file.type || 'application/octet-stream',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });
        
        resolve(cleanedBytes);
        
      } catch (err) {
        console.error('Office clean error:', err);
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Check if file is an Office document
 * @param {File} file
 * @returns {boolean}
 */
export function isOffice(file) {
  const officeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  
  const officeExtensions = ['.docx', '.xlsx', '.pptx'];
  const fileName = file.name.toLowerCase();
  
  return officeTypes.includes(file.type) || 
         officeExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * Get Office document type
 * @param {File} file
 * @returns {string}
 */
export function getOfficeType(file) {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.docx')) return 'docx';
  if (fileName.endsWith('.xlsx')) return 'xlsx';
  if (fileName.endsWith('.pptx')) return 'pptx';
  return 'office';
}

export { OFFICE_METADATA_RISK, OFFICE_METADATA_LABELS, getOfficeMetadataRisk };
