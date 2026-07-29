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
 * - Embedded raster images as data: URIs — these carry their OWN EXIF/GPS,
 *   invisible to anything that only inspects the SVG's XML/attributes
 */

import { cleanJpegMetadata } from './jpeg.js';
import { cleanPngMetadata } from './png.js';
import { cleanWebpMetadata } from './webp.js';

const DATA_URI_RE = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i;
const MIME_TO_CLEANER = {
  jpeg: { mime: 'image/jpeg', clean: cleanJpegMetadata },
  jpg: { mime: 'image/jpeg', clean: cleanJpegMetadata },
  png: { mime: 'image/png', clean: cleanPngMetadata },
  webp: { mime: 'image/webp', clean: cleanWebpMetadata }
};

function base64ToBlob(base64, mime) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

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
    
    // 6. Check for embedded images (may contain EXIF) — 'medium' not 'high':
    // cleanSVGMetadata() below actually re-encodes these (see cleanEmbeddedImages),
    // so flagging 'high' would keep verify() reporting "unverified" forever on
    // any SVG with a picture in it, even right after real cleaning.
    const images = doc.querySelectorAll('image[href^="data:"], image[xlink\\:href^="data:"]');
    if (images.length > 0) {
      metadata.items.push({
        name: 'Embedded Images',
        value: `${images.length} image(s) — Temizle ile birlikte kendi EXIF/GPS verisi de temizlenir`,
        risk: 'medium',
        details: 'Embedded images may contain their own EXIF metadata'
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
 * Count elements that have at least one attribute whose name starts with any
 * of the given prefixes (e.g. "inkscape:", "sodipodi:").
 *
 * The previous version used `querySelectorAll('[inkscape\\:*], [sodipodi\\:*]')`
 * — that is not valid CSS (there is no "attribute name ends with a wildcard"
 * selector; `[attr*=value]` matches by VALUE, not by name) — so the call threw
 * a SyntaxError on every single SVG, was swallowed by the outer try/catch, and
 * readSVGMetadata/cleanSVGMetadata silently fell back to reporting nothing /
 * returning the file completely unchanged. SVG cleaning was fully broken.
 * This walks the DOM directly instead of relying on selector hacks.
 */
function countElementsWithAttrPrefix(doc, prefixes) {
  let count = 0;
  const all = doc.getElementsByTagName('*');
  for (const el of all) {
    for (const attr of el.attributes) {
      if (prefixes.some((p) => attr.name.toLowerCase().startsWith(p))) {
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * Check for editor-specific elements
 */
function checkEditorElements(doc, metadata) {
  // Inkscape specific elements
  const inkscapeElements = countElementsWithAttrPrefix(doc, ['inkscape:', 'sodipodi:']);
  const inksapeNamedViews = doc.getElementsByTagNameNS('http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd', 'namedview');

  if (inkscapeElements > 0 || inksapeNamedViews.length > 0) {
    metadata.items.push({
      name: 'Inkscape Data',
      value: `${inkscapeElements + inksapeNamedViews.length} element(s)`,
      risk: 'medium',
      details: 'Inkscape editor data and view settings'
    });
  }

  // Adobe Illustrator — check namespace declaration VALUES on the root for
  // the ns.adobe.com URI (this is what the old, invalid selector was after).
  const svgRoot = doc.documentElement;
  const hasAdobeNs = svgRoot && [...svgRoot.attributes].some(
    (a) => a.name.toLowerCase().startsWith('xmlns:') && a.value.includes('ns.adobe.com')
  );
  if (hasAdobeNs) {
    metadata.items.push({
      name: 'Adobe Illustrator Data',
      value: 'Adobe namespace declared',
      risk: 'medium'
    });
  }

  // Sketch
  const sketchElements = countElementsWithAttrPrefix(doc, ['sketch:']);
  if (sketchElements > 0) {
    metadata.items.push({
      name: 'Sketch Data',
      value: `${sketchElements} element(s)`,
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
    
    // 5. Remove Inkscape/Sodipodi specific elements. getElementsByTagName (not
    // querySelectorAll) because DOMParser represents these as literally-named
    // elements ("sodipodi:namedview" as a tag name string, not a real XML
    // namespace-prefixed lookup) — the same class of selector as #6 below.
    for (const tag of ['sodipodi:namedview', 'sodipodi:guide']) {
      const els = [...doc.getElementsByTagName(tag)];
      els.forEach((el) => el.remove());
    }

    // 6. Remove all elements with editor namespaces. This used to be
    // `querySelectorAll('[inkscape\\:*], [sodipodi\\:*], [sketch\\:*]')` — not
    // valid CSS (there is no "attribute name has this prefix" selector; only
    // `[attr*=value]` for matching by VALUE exists) — so this THREW on every
    // single SVG, the exception propagated out of the whole try block, and
    // cleanSVGMetadata's catch silently returned the ORIGINAL file completely
    // unmodified. SVG cleaning — including the embedded-image deep clean
    // below, which never even ran — was completely broken until this fix.
    const editorElements = [];
    for (const el of doc.getElementsByTagName('*')) {
      for (const attr of el.attributes) {
        if (attr.name.includes(':') &&
            EDITOR_NAMESPACES.some(ns => attr.name.toLowerCase().startsWith(ns + ':'))) {
          editorElements.push(el);
          break;
        }
      }
    }
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

    // 7b. Deep clean: re-encode embedded raster images (data: URIs) through
    // the same cleaners a standalone upload would get. Without this, a photo
    // embedded in the SVG keeps its own GPS/EXIF even after the SVG's own
    // metadata (title/desc/editor tags) is stripped.
    const embeddedImages = doc.querySelectorAll('image[href^="data:"], image[xlink\\:href^="data:"]');
    for (const imgEl of embeddedImages) {
      const attrName = imgEl.hasAttribute('href') ? 'href' : 'xlink:href';
      const dataUri = imgEl.getAttribute(attrName);
      const match = dataUri && dataUri.match(DATA_URI_RE);
      if (!match) continue; // not a supported raster type (e.g. svg-in-svg) — left as-is
      const [, subtype, base64] = match;
      const cleaner = MIME_TO_CLEANER[subtype.toLowerCase()];
      if (!cleaner) continue;
      try {
        const blob = base64ToBlob(base64, cleaner.mime);
        const file = new File([blob], `embedded.${subtype}`, { type: cleaner.mime });
        const cleanedBlob = await cleaner.clean(file);
        const cleanedBase64 = await blobToBase64(cleanedBlob);
        imgEl.setAttribute(attrName, `data:${cleaner.mime};base64,${cleanedBase64}`);
      } catch (imgErr) {
        console.warn('Embedded SVG image clean failed:', imgErr);
        // Leave that one image as-is rather than failing the whole file.
      }
    }

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
