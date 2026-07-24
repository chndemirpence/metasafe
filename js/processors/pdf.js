/**
 * PDF Metadata Processor
 * Handles reading and removing metadata from PDF files using pdf-lib
 */

// PDF metadata fields and their risk levels
const PDF_METADATA_RISK = {
  high: ['Author', 'Creator', 'Producer'],
  medium: ['Title', 'Subject', 'Keywords', 'CreationDate', 'ModDate'],
  low: ['Trapped', 'PDFFormatVersion']
};

const PDF_METADATA_LABELS = {
  Author: 'Yazar',
  Title: 'Başlık',
  Subject: 'Konu',
  Keywords: 'Anahtar Kelimeler',
  Creator: 'Oluşturan Uygulama',
  Producer: 'PDF Üretici',
  CreationDate: 'Oluşturma Tarihi',
  ModDate: 'Değiştirme Tarihi',
  Trapped: 'Trapped',
  PDFFormatVersion: 'PDF Sürümü'
};

/**
 * Get risk level for PDF metadata field
 */
function getPdfMetadataRisk(key) {
  if (PDF_METADATA_RISK.high.includes(key)) return 'high';
  if (PDF_METADATA_RISK.medium.includes(key)) return 'medium';
  return 'low';
}

/**
 * Format date from PDF format
 */
function formatPdfDate(date) {
  if (!date) return null;
  if (date instanceof Date) {
    return date.toLocaleString('tr-TR');
  }
  return String(date);
}

/**
 * Read metadata from PDF file
 * @param {File} file - PDF file
 * @returns {Promise<Object>} Metadata object
 */
export async function readPdfMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        
        // Check if PDFLib is available
        if (typeof PDFLib === 'undefined') {
          throw new Error('PDF-lib kütüphanesi yüklenmedi');
        }
        
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, {
          updateMetadata: false
        });
        
        const metadata = {
          raw: null,
          items: [],
          riskCounts: { high: 0, medium: 0, low: 0 }
        };
        
        // Get standard metadata
        const metadataFields = [
          { key: 'Title', getter: () => pdfDoc.getTitle() },
          { key: 'Author', getter: () => pdfDoc.getAuthor() },
          { key: 'Subject', getter: () => pdfDoc.getSubject() },
          { key: 'Keywords', getter: () => pdfDoc.getKeywords() },
          { key: 'Creator', getter: () => pdfDoc.getCreator() },
          { key: 'Producer', getter: () => pdfDoc.getProducer() },
          { key: 'CreationDate', getter: () => pdfDoc.getCreationDate() },
          { key: 'ModDate', getter: () => pdfDoc.getModificationDate() }
        ];
        
        for (const field of metadataFields) {
          try {
            let value = field.getter();
            
            if (value !== undefined && value !== null && value !== '') {
              // Format dates
              if (field.key.includes('Date') && value instanceof Date) {
                value = formatPdfDate(value);
              }
              
              // Format keywords array
              if (Array.isArray(value)) {
                value = value.join(', ');
              }
              
              const risk = getPdfMetadataRisk(field.key);
              
              metadata.items.push({
                key: field.key,
                label: PDF_METADATA_LABELS[field.key] || field.key,
                value: String(value),
                risk: risk
              });
              
              metadata.riskCounts[risk]++;
            }
          } catch (e) {
            // Field not available, skip
          }
        }
        
        // Add page count info
        metadata.pageCount = pdfDoc.getPageCount();
        
        // Check for potential fake redactions (black rectangles hiding text)
        try {
          const redactionWarnings = checkForFakeRedactions(pdfDoc);
          if (redactionWarnings.length > 0) {
            metadata.items.push({
              key: 'FakeRedaction',
              label: 'Sahte Redaksiyon Uyarısı',
              value: `${redactionWarnings.length} sayfa(da) gizli metin olabilir — siyah dikdörtgenler altındaki metin kopyalanabilir!`,
              risk: 'high'
            });
            metadata.riskCounts.high++;
            metadata.redactionWarning = true;
            metadata.redactionDetails = redactionWarnings;
          }
        } catch (redErr) {
          // Non-critical, don't fail the whole read
          console.warn('Redaction check skipped:', redErr.message);
        }
        
        // Sort by risk
        metadata.items.sort((a, b) => {
          const riskOrder = { high: 0, medium: 1, low: 2 };
          return riskOrder[a.risk] - riskOrder[b.risk];
        });
        
        resolve(metadata);
        
      } catch (err) {
        console.error('PDF metadata read error:', err);
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Remove all metadata from PDF file
 * @param {File} file - PDF file
 * @returns {Promise<Blob>} Clean PDF blob
 */
export async function cleanPdfMetadata(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        
        if (typeof PDFLib === 'undefined') {
          throw new Error('PDF-lib kütüphanesi yüklenmedi');
        }
        
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        
        // Clear all metadata
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setCreator('');
        pdfDoc.setProducer('');
        
        // Set dates to epoch (or remove them)
        // Note: pdf-lib doesn't have a direct way to remove dates,
        // so we set them to a neutral value
        pdfDoc.setCreationDate(new Date(0));
        pdfDoc.setModificationDate(new Date(0));
        
        // Save WITHOUT letting pdf-lib re-stamp its own Producer + a fresh ModificationDate
        // (updateMetadata:true is the default and would leak "pdf-lib ..." + processing time).
        const cleanedPdfBytes = await pdfDoc.save({ updateMetadata: false });
        const blob = new Blob([cleanedPdfBytes], { type: 'application/pdf' });
        
        resolve(blob);
        
      } catch (err) {
        console.error('PDF clean error:', err);
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Check if file is a PDF
 * @param {File} file
 * @returns {boolean}
 */
export function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Check for fake redactions in PDF
 * Fake redactions = black/colored rectangles drawn OVER text (text still extractable)
 * Real redactions use /Redact annotation subtype which actually removes text
 * @param {PDFDocument} pdfDoc
 * @returns {Array} warnings per page
 */
function checkForFakeRedactions(pdfDoc) {
  const warnings = [];
  const pages = pdfDoc.getPages();
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const annotations = page.node.Annots();
    
    if (!annotations) continue;
    
    const annots = annotations.asArray ? annotations.asArray() : [];
    let hasSquareAnnot = false;
    let hasRedactAnnot = false;
    
    for (const annot of annots) {
      try {
        const subtypeRef = annot.get ? annot.get(PDFLib.PDFName.of('Subtype')) : null;
        const subtype = subtypeRef?.toString?.() || '';
        
        // Real redaction annotation (/Redact subtype)
        if (subtype.includes('Redact')) {
          hasRedactAnnot = true;
        }
        
        // Square/StrikeOut annotations with black fill = potential fake redaction
        if (subtype.includes('Square') || subtype.includes('Highlight') || subtype.includes('StrikeOut')) {
          hasSquareAnnot = true;
        }
      } catch (e) {
        // Skip unreadable annotations
      }
    }
    
    // Also check content stream for black-filled rectangles (re pattern)
    // This catches the most common fake redaction: drawing a black rect over text
    try {
      const contentStream = page.node.Contents();
      if (contentStream) {
        const raw = contentStream.toString?.() || '';
        // Look for patterns like "0 0 0 rg ... re f" (black fill + rectangle + fill)
        // or "0 0 0 RG ... re f" (stroke color black + rect)
        const hasBlackRects = /0\s+0\s+0\s+r[gG]/.test(raw) && /re\s+[fFbB]/.test(raw);
        if (hasBlackRects && !hasRedactAnnot) {
          // Only warn if no proper /Redact annotations exist
          hasSquareAnnot = true;
        }
      }
    } catch (e) {
      // Content stream not easily accessible in pdf-lib, skip
    }
    
    if (hasSquareAnnot && !hasRedactAnnot) {
      warnings.push({
        page: i + 1,
        type: 'fake_redaction',
        message: `Sayfa ${i + 1}: Siyah dikdörtgen/üstü çizili alan tespit edildi — alttaki metin hala erişilebilir olabilir`
      });
    }
  }
  
  return warnings;
}

export { PDF_METADATA_RISK, PDF_METADATA_LABELS, getPdfMetadataRisk };
