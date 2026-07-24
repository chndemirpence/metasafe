/**
 * MetaSafe SVG Metadata Processor
 * Client-side SVG metadata reading and cleaning
 * 
 * SVG files can contain:
 * - <metadata> element with RDF, Dublin Core, etc.
 * - XML comments with author notes
 * - Editor-specific namespaces (Inkscape, Illustrator, Sketch)
 * - <title> and <desc> elements
 * - Embedded fonts with author info
 * - Linked external resources
 */

// Editor-specific namespace prefixes to remove
const EDITOR_NAMESPACES = [
  'inkscape',
  'sodipodi',
  'illustrator',
  'adobe',
  'sketch',
  'figma',
  'corel',
  'serif',
  'xlink'  // Sometimes contains identifying info
];

// Attributes that may contain identifying info
const SENSITIVE_ATTRIBUTES = [
  'inkscape:version',
  'sodipodi:docname',
  'inkscape:export-filename',
  'inkscape:export-xdpi',
  'inkscape:export-ydpi',
  'adobe:docid',
  'xmp:CreatorTool',
  'dc:creator',
  'dc:rights',
  'dc:date',
  'dc:description',
  'cc:license',
  'data-name',
  'data-author'
];

/**
 * Check if a file is an SVG
 */
function isSVG(file) {
  const svgTypes = ['image/svg+xml', 'image/svg'];
  const ext = file.name.toLowerCase().split('.').pop();
  return svgTypes.includes(file.type) || ext === 'svg';
}

/**
 * Read SVG metadata
 */
async function readSVGMetadata(file) {
  const text = await file.text();
  const metadata = {
    format: 'SVG',
    items: []
  };
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    
    // Check for parser errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      metadata.items.push({
        name: 'Parse Error',
        value: 'Invalid SVG file',
        risk: 'low'
      });
      return metadata;
    }
    
    const svg = doc.documentElement;
    
    // 1. Check SVG root attributes
    checkSVGAttributes(svg, metadata);
    
    // 2. Check <metadata> element
    const metadataElements = doc.getElementsByTagName('metadata');
    for (const meta of metadataElements) {
      parseMetadataElement(meta, metadata);
    }
    
    // 3. Check <title> and <desc>
    const title = doc.querySelector('svg > title');
    if (title?.textContent?.trim()) {
      metadata.items.push({
        name: 'Title',
        value: title.textContent.trim(),
        risk: 'low'
      });
    }
    
    const desc = doc.querySelector('svg > desc');
    if (desc?.textContent?.trim()) {
      metadata.items.push({
        name: 'Description',
        value: desc.textContent.trim(),
        risk: 'medium'
      });
    }
    
    // 4. Check for XML comments
    const comments = findXMLComments(text);
    if (comments.length > 0) {
      metadata.items.push({
        name: 'XML Comments',
        value: `${comments.length} comment(s) found`,
        risk: 'medium',
        details: comments.slice(0, 3).join('\n')
      });
    }
    
    // 5. Check for editor-specific elements
    checkEditorElements(doc, metadata);
    
    // 6. Check for embedded images (may contain EXIF)
    const images = doc.querySelectorAll('image[href^="data:"], image[xlink\\:href^="data:"]');
    if (images.length > 0) {
      metadata.items.push({
        name: 'Embedded Images',
        value: `${images.length} image(s)`,
        risk: 'high',
        details: 'Embedded images may contain EXIF metadata'
      });
    }
    
    // 7. Check for scripts
    const scripts = doc.querySelectorAll('script');
    if (scripts.length > 0) {
      metadata.items.push({
        name: 'Embedded Scripts',
        value: `${scripts.length} script(s)`,
        risk: 'high',
        details: 'Scripts can track users or contain identifying code'
      });
    }
    
  } catch (e) {
    console.error('Error reading SVG:', e);
    metadata.items.push({
      name: 'Error',
      value: e.message,
      risk: 'low'
    });
  }
  
  return metadata;
}

/**
 * Check SVG root element attributes
 */
function checkSVGAttributes(svg, metadata) {
  // Check for editor version attributes
  for (const attr of svg.attributes) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    
    // Check for namespace declarations
    if (name.startsWith('xmlns:')) {
      const nsPrefix = name.split(':')[1];
      if (EDITOR_NAMESPACES.includes(nsPrefix)) {
        metadata.items.push({
          name: `Editor Namespace: ${nsPrefix}`,
          value: value,
          risk: 'medium'
        });
      }
    }
    
    // Check for sensitive attributes
    if (SENSITIVE_ATTRIBUTES.some(sa => name.includes(sa.toLowerCase()))) {
      metadata.items.push({
        name: attr.name,
        value: truncate(value, 100),
        risk: 'high'
      });
    }
    
    // Check for Inkscape specific
    if (name.startsWith('inkscape:') || name.startsWith('sodipodi:')) {
      metadata.items.push({
        name: `Inkscape: ${attr.name}`,
        value: truncate(value, 50),
        risk: 'medium'
      });
    }
  }
}

/**
 * Parse <metadata> element content
 */
function parseMetadataElement(meta, metadata) {
  const content = meta.innerHTML.trim();
  
  if (!content) return;
  
  // Look for RDF content
  const rdfMatch = content.match(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/i);
  if (rdfMatch) {
    metadata.items.push({
      name: 'RDF Metadata',
      value: 'RDF data block found',
      risk: 'high',
      details: truncate(rdfMatch[0], 200)
    });
  }
  
  // Look for Dublin Core
  const dcElements = ['dc:title', 'dc:creator', 'dc:rights', 'dc:date', 'dc:description', 'dc:publisher'];
  for (const dc of dcElements) {
    const regex = new RegExp(`<${dc}[^>]*>([^<]+)</${dc}>`, 'gi');
    const match = content.match(regex);
    if (match) {
      const value = match[0].replace(/<[^>]+>/g, '').trim();
      metadata.items.push({
        name: dc.replace('dc:', 'DC: '),
        value: truncate(value, 100),
        risk: dc === 'dc:creator' || dc === 'dc:rights' ? 'high' : 'medium'
      });
    }
  }
  
  // Look for Creative Commons info
  if (content.includes('creativecommons.org') || content.includes('cc:')) {
    metadata.items.push({
      name: 'License Info',
      value: 'Creative Commons license data',
      risk: 'low'
    });
  }
  
  // Generic metadata presence
  if (!metadata.items.some(i => i.name.includes('RDF') || i.name.includes('DC:'))) {
    metadata.items.push({
      name: 'Metadata Element',
      value: truncate(content, 100),
      risk: 'medium'
    });
  }
}

/**
 * Find XML comments in SVG
 */
function findXMLComments(text) {
  const commentRegex = /<!--([\s\S]*?)-->/g;
  const comments = [];
  let match;
  
  while ((match = commentRegex.exec(text)) !== null) {
    const content = match[1].trim();
    // Skip empty comments and XML declarations
    if (content && !content.startsWith('?xml') && content.length > 5) {
      comments.push(truncate(content, 100));
    }
  }
  
  return comments;
}

/**
 * Check for editor-specific elements
 */
function checkEditorElements(doc, metadata) {
  // Inkscape specific elements
  const inkscapeElements = doc.querySelectorAll('[inkscape\\:*], [sodipodi\\:*]');
  const inksapeNamedViews = doc.getElementsByTagNameNS('http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd', 'namedview');
  
  if (inkscapeElements.length > 0 || inksapeNamedViews.length > 0) {
    metadata.items.push({
      name: 'Inkscape Data',
      value: `${inkscapeElements.length + inksapeNamedViews.length} element(s)`,
      risk: 'medium',
      details: 'Inkscape editor data and view settings'
    });
  }
  
  // Adobe Illustrator
  const aiElements = doc.querySelectorAll('[*|*="http://ns.adobe.com/"]');
  if (aiElements.length > 0) {
    metadata.items.push({
      name: 'Adobe Illustrator Data',
      value: `${aiElements.length} element(s)`,
      risk: 'medium'
    });
  }
  
  // Sketch
  const sketchElements = doc.querySelectorAll('[sketch\\:*]');
  if (sketchElements.length > 0) {
    metadata.items.push({
      name: 'Sketch Data',
      value: `${sketchElements.length} element(s)`,
      risk: 'medium'
    });
  }
}

/**
 * Clean SVG metadata
 */
async function cleanSVGMetadata(file) {
  const text = await file.text();
  let cleaned = text;
  
  try {
    // 1. Remove XML comments (except XML declaration)
    cleaned = cleaned.replace(/<!--(?![\s]*\?xml)[\s\S]*?-->/g, '');
    
    // 2. Parse and clean DOM
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, 'image/svg+xml');
    const svg = doc.documentElement;
    
    // 3. Remove <metadata> elements
    const metadataElements = doc.querySelectorAll('metadata');
    metadataElements.forEach(el => el.remove());
    
    // 4. Remove editor namespace attributes from root
    const attrsToRemove = [];
    for (const attr of svg.attributes) {
      const name = attr.name.toLowerCase();
      
      // Remove editor namespace declarations
      if (name.startsWith('xmlns:')) {
        const nsPrefix = name.split(':')[1];
        if (EDITOR_NAMESPACES.includes(nsPrefix)) {
          attrsToRemove.push(attr.name);
        }
      }
      
      // Remove editor-specific attributes
      if (name.startsWith('inkscape:') || 
          name.startsWith('sodipodi:') ||
          name.startsWith('sketch:') ||
          name.startsWith('adobe:') ||
          SENSITIVE_ATTRIBUTES.some(sa => name === sa.toLowerCase())) {
        attrsToRemove.push(attr.name);
      }
    }
    
    attrsToRemove.forEach(attr => svg.removeAttribute(attr));
    
    // 5. Remove Inkscape/Sodipodi specific elements
    const sodipodiElements = doc.querySelectorAll('sodipodi\\:namedview, sodipodi\\:guide');
    sodipodiElements.forEach(el => el.remove());
    
    // 6. Remove all elements with editor namespaces
    const editorElements = doc.querySelectorAll('[inkscape\\:*], [sodipodi\\:*], [sketch\\:*]');
    editorElements.forEach(el => {
      // Remove the attributes but keep the element if it's a standard SVG element
      const attrsToRemove = [];
      for (const attr of el.attributes) {
        if (attr.name.includes(':') && 
            EDITOR_NAMESPACES.some(ns => attr.name.toLowerCase().startsWith(ns + ':'))) {
          attrsToRemove.push(attr.name);
        }
      }
      attrsToRemove.forEach(attr => el.removeAttribute(attr));
    });
    
    // 7. Remove scripts (security)
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(el => el.remove());
    
    // 8. Optionally keep or remove title/desc (we'll keep them but they're harmless)
    // Users often need these for accessibility
    
    // 9. Serialize back to string
    const serializer = new XMLSerializer();
    cleaned = serializer.serializeToString(doc);
    
    // 10. Clean up empty lines and extra whitespace
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '');
    cleaned = cleaned.replace(/>\s+</g, '>\n<');
    
    // 11. Add XML declaration if missing
    if (!cleaned.startsWith('<?xml')) {
      cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned;
    }
    
  } catch (e) {
    console.error('Error cleaning SVG:', e);
    // Return original if cleaning fails
    return new Blob([text], { type: 'image/svg+xml' });
  }
  
  return new Blob([cleaned], { type: 'image/svg+xml' });
}

/**
 * Utility: truncate string
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

export { isSVG, readSVGMetadata, cleanSVGMetadata };
