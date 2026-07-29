/**
 * MetaSafe EML (Email) Metadata Processor
 * Client-side email header reading and cleaning
 *
 * EML files contain sensitive headers:
 * - Received: IP addresses, server names, timestamps
 * - X-Originating-IP: Sender's IP address
 * - X-Mailer: Email client used
 * - Message-ID: Can identify sender's domain
 * - User-Agent: Email client details
 * - X-MS-Exchange-*: Microsoft Exchange metadata
 * - Authentication-Results: SPF/DKIM/DMARC data
 *
 * They can ALSO carry attachments (a photo, a PDF, a Word doc) inside a MIME
 * multipart body. Stripping only the top-level headers leaves those
 * attachments' own EXIF/GPS/author metadata completely intact — someone
 * forwards a photo, we say "cleaned", and the photo's GPS is still right
 * there in the .eml. cleanEMLMetadata() below decodes and re-cleans each
 * recognized attachment with the same processor a standalone upload gets.
 */

import { cleanJpegMetadata } from './jpeg.js';
import { cleanPngMetadata } from './png.js';
import { cleanWebpMetadata } from './webp.js';
import { cleanGIFMetadata } from './gif.js';
import { cleanPdfMetadata } from './pdf.js';
import { cleanOfficeMetadata } from './office.js';

// Content-Type (lowercased, no params) -> cleaner. Covers the realistic bulk
// of email attachments; anything else (audio/video/zip/...) is left as-is —
// see the honest "not deep-cleaned" note pushed into metadata.items below.
const ATTACHMENT_CLEANERS = {
  'image/jpeg': { ext: 'jpg', clean: cleanJpegMetadata },
  'image/png': { ext: 'png', clean: cleanPngMetadata },
  'image/webp': { ext: 'webp', clean: cleanWebpMetadata },
  'image/gif': { ext: 'gif', clean: cleanGIFMetadata },
  'application/pdf': { ext: 'pdf', clean: cleanPdfMetadata },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', clean: cleanOfficeMetadata },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', clean: cleanOfficeMetadata },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', clean: cleanOfficeMetadata }
};

function base64ToBlob(base64, mime) {
  const bin = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToWrappedBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  // RFC 2045: base64 body lines should wrap at 76 chars.
  return b64.match(/.{1,76}/g).join('\r\n');
}

/** Extract `boundary="..."` (or unquoted) from a Content-Type header value. */
function extractBoundary(contentType) {
  const m = contentType.match(/boundary\s*=\s*"([^"]+)"|boundary\s*=\s*([^\s;]+)/i);
  return m ? (m[1] || m[2]) : null;
}

/** Parse one MIME part's own header block into a lowercase-keyed map. */
function parsePartHeaders(headerText) {
  const headers = {};
  const lines = headerText.split(/\r?\n/);
  let name = '', value = '';
  const flush = () => { if (name) headers[name.toLowerCase()] = value; };
  for (const line of lines) {
    if (/^\s/.test(line) && name) {
      value += ' ' + line.trim();
    } else if (line.includes(':')) {
      flush();
      const idx = line.indexOf(':');
      name = line.slice(0, idx).trim();
      value = line.slice(idx + 1).trim();
    }
  }
  flush();
  return headers;
}

/**
 * Recursively walk a MIME body, cleaning any attachment part whose
 * Content-Type we recognize. Returns { body, cleanedCount, skipped[] }.
 */
async function deepCleanMimeBody(body, contentTypeHeader) {
  const boundary = contentTypeHeader && extractBoundary(contentTypeHeader);
  let cleanedCount = 0;
  const skipped = [];

  if (!boundary) {
    return { body, cleanedCount, skipped };
  }

  const delim = '--' + boundary;
  const rawParts = body.split(delim);
  // rawParts[0] is preamble text before the first boundary; the last element
  // after the closing "--boundary--" is the epilogue. Real parts are the
  // ones in between that start with \r\n (i.e., not the closing marker).
  const outParts = [rawParts[0]];

  for (let i = 1; i < rawParts.length; i++) {
    let part = rawParts[i];
    if (part.startsWith('--')) {
      // Closing boundary ("--boundary--") — everything after is epilogue.
      outParts.push(part);
      continue;
    }
    // Each part starts with \r\n right after the boundary line.
    part = part.replace(/^\r?\n/, '');
    const sep = part.match(/\r?\n\r?\n/);
    if (!sep) { outParts.push('\r\n' + part); continue; }

    const partHeaderText = part.slice(0, sep.index);
    const partBody = part.slice(sep.index + sep[0].length);
    const partHeaders = parsePartHeaders(partHeaderText);
    const partContentType = (partHeaders['content-type'] || '').split(';')[0].trim().toLowerCase();
    const transferEncoding = (partHeaders['content-transfer-encoding'] || '').toLowerCase();

    // Nested multipart (e.g. multipart/alternative inside multipart/mixed).
    if (partContentType.startsWith('multipart/')) {
      const nested = await deepCleanMimeBody(partBody, partHeaders['content-type']);
      cleanedCount += nested.cleanedCount;
      skipped.push(...nested.skipped);
      outParts.push('\r\n' + partHeaderText + sep[0] + nested.body);
      continue;
    }

    const cleaner = ATTACHMENT_CLEANERS[partContentType];
    const looksLikeAttachment = /attachment|filename=/i.test(partHeaders['content-disposition'] || '') ||
                                 partContentType.startsWith('image/') ||
                                 partContentType === 'application/pdf';

    if (cleaner && transferEncoding === 'base64') {
      try {
        const blob = base64ToBlob(partBody, cleaner.ext === 'pdf' ? 'application/pdf' : partContentType);
        const file = new File([blob], `attachment.${cleaner.ext}`, { type: blob.type });
        const cleanedBlob = await cleaner.clean(file);
        const cleanedBase64 = await blobToWrappedBase64(cleanedBlob);
        outParts.push('\r\n' + partHeaderText + sep[0] + cleanedBase64 + '\r\n');
        cleanedCount++;
        continue;
      } catch (attErr) {
        console.warn('EML attachment clean failed:', attErr);
        // Fall through: keep the original part rather than losing the email.
      }
    } else if (looksLikeAttachment && !cleaner) {
      // Honest bookkeeping: we found something attachment-shaped we don't
      // deep-clean yet (audio/video/zip/unknown type) — never silently claim
      // it was handled.
      skipped.push(partContentType || 'unknown');
    }

    outParts.push('\r\n' + part);
  }

  return { body: outParts.join(delim), cleanedCount, skipped };
}

// Headers that reveal identity or location
const SENSITIVE_HEADERS = [
  'received',
  'x-originating-ip',
  'x-sender-ip',
  'x-mailer',
  'x-mimeole',
  'user-agent',
  'x-ms-exchange',
  'x-ms-tnef-correlator',
  'x-ms-has-attach',
  'x-ms-publictraffictype',
  'x-microsoft',
  'x-originatororg',
  'x-forefront',
  'authentication-results',
  'received-spf',
  'arc-seal',
  'arc-message-signature',
  'arc-authentication-results',
  'dkim-signature',
  'x-google-dkim-signature',
  'x-gm-message-state',
  'x-google-smtp-source',
  'x-received',
  'x-yahoo',
  'x-ymail',
  'x-spam',
  'x-virus',
  'x-antivirus',
  'x-priority',
  'x-msmail-priority',
  'x-msonline',
  'x-organization',
  'organization',
  'x-job',
  'x-pm',
  'x-proofpoint',
  // Message-ID commonly embeds the sending client's local hostname or LAN IP
  // (e.g. <uuid@DESKTOP-ABC123> or <uuid@192.168.1.5>) — a device fingerprint
  // in a header most people never think to check. Not in ESSENTIAL_HEADERS,
  // so this is safe to drop from a static, already-downloaded/archived .eml.
  'message-id'
];

// Headers to always keep (essential for email function)
const ESSENTIAL_HEADERS = [
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'date',
  'content-type',
  'content-transfer-encoding',
  'mime-version',
  'content-disposition'
];

/**
 * Check if file is an EML
 */
function isEML(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  return file.type === 'message/rfc822' || ext === 'eml' || ext === 'msg';
}

/**
 * Read EML metadata
 */
async function readEMLMetadata(file) {
  const text = await file.text();
  const metadata = {
    format: 'EML',
    items: []
  };
  
  try {
    // Split headers from body
    const headerEnd = text.indexOf('\r\n\r\n');
    const headerSection = headerEnd > 0 ? text.substring(0, headerEnd) : text.substring(0, 2000);
    
    // Parse headers (handle folded headers)
    const headers = parseHeaders(headerSection);
    
    // Extract key information
    for (const [name, value] of Object.entries(headers)) {
      const lowerName = name.toLowerCase();
      
      // Check if sensitive
      const isSensitive = SENSITIVE_HEADERS.some(sh => lowerName.includes(sh));
      const isEssential = ESSENTIAL_HEADERS.includes(lowerName);
      
      if (lowerName === 'from') {
        metadata.items.push({
          name: 'From',
          value: sanitizeHeaderValue(value),
          risk: 'low'
        });
      } else if (lowerName === 'to') {
        metadata.items.push({
          name: 'To',
          value: sanitizeHeaderValue(value),
          risk: 'low'
        });
      } else if (lowerName === 'subject') {
        metadata.items.push({
          name: 'Subject',
          value: sanitizeHeaderValue(value),
          risk: 'low'
        });
      } else if (lowerName === 'date') {
        metadata.items.push({
          name: 'Date',
          value: sanitizeHeaderValue(value),
          risk: 'low'
        });
      } else if (lowerName === 'received') {
        // Parse IP from Received header
        const ipMatch = value.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
        metadata.items.push({
          name: 'Received (Route)',
          value: ipMatch ? `IP: ${ipMatch[1]} - ${truncate(value, 60)}` : truncate(value, 80),
          risk: 'high'
        });
      } else if (lowerName === 'x-originating-ip') {
        metadata.items.push({
          name: 'Originating IP',
          value: value.replace(/[\[\]]/g, ''),
          risk: 'critical'
        });
      } else if (lowerName === 'x-mailer' || lowerName === 'user-agent') {
        metadata.items.push({
          name: 'Email Client',
          value: sanitizeHeaderValue(value),
          risk: 'medium'
        });
      } else if (lowerName === 'message-id') {
        metadata.items.push({
          name: 'Message-ID',
          value: sanitizeHeaderValue(value),
          risk: 'medium'
        });
      } else if (isSensitive && !isEssential) {
        metadata.items.push({
          name: name,
          value: truncate(sanitizeHeaderValue(value), 60),
          risk: 'high'
        });
      }
    }
    
    // Count attachments and how many we can actually deep-clean. 'medium' not
    // 'high': cleanEMLMetadata() re-encodes the recognized ones, and flagging
    // 'high' would keep verify() reporting "unverified" forever on any email
    // with a photo/PDF/Office attachment, even right after real cleaning.
    const contentTypeMatches = [...text.matchAll(/Content-Type:\s*([a-z0-9.+-]+\/[a-z0-9.+-]+)/gi)];
    const attachmentCount = (text.match(/Content-Disposition:\s*attachment/gi) || []).length;
    const cleanableCount = contentTypeMatches.filter(
      (m) => ATTACHMENT_CLEANERS[m[1].toLowerCase()]
    ).length;
    if (attachmentCount > 0) {
      metadata.items.push({
        name: 'Attachments',
        value: cleanableCount > 0
          ? `${attachmentCount} dosya (${cleanableCount} tanesi Temizle ile birlikte temizlenir)`
          : `${attachmentCount} file(s) — desteklenmeyen tür, ek dosya temizlenmez`,
        risk: cleanableCount > 0 ? 'medium' : 'high'
      });
    }
    
  } catch (e) {
    console.error('Error reading EML:', e);
    metadata.items.push({
      name: 'Error',
      value: e.message,
      risk: 'low'
    });
  }
  
  return metadata;
}

/**
 * Parse email headers (handles folded headers)
 */
function parseHeaders(headerText) {
  const headers = {};
  const lines = headerText.split(/\r?\n/);
  let currentHeader = '';
  let currentValue = '';
  
  for (const line of lines) {
    if (line.match(/^\s+/) && currentHeader) {
      // Folded header continuation
      currentValue += ' ' + line.trim();
    } else if (line.includes(':')) {
      // Save previous header
      if (currentHeader) {
        if (headers[currentHeader]) {
          // Multiple headers with same name (e.g., Received)
          headers[currentHeader] += '\n' + currentValue;
        } else {
          headers[currentHeader] = currentValue;
        }
      }
      
      // Parse new header
      const colonIndex = line.indexOf(':');
      currentHeader = line.substring(0, colonIndex).trim();
      currentValue = line.substring(colonIndex + 1).trim();
    }
  }
  
  // Save last header
  if (currentHeader) {
    if (headers[currentHeader]) {
      headers[currentHeader] += '\n' + currentValue;
    } else {
      headers[currentHeader] = currentValue;
    }
  }
  
  return headers;
}

/**
 * Clean EML - remove sensitive headers
 */
async function cleanEMLMetadata(file) {
  const text = await file.text();

  try {
    // Find header/body boundary
    const boundaryMatch = text.match(/\r?\n\r?\n/);
    if (!boundaryMatch) {
      return new Blob([text], { type: 'message/rfc822' });
    }

    const headerEnd = boundaryMatch.index;
    const boundary = boundaryMatch[0];
    const headerSection = text.substring(0, headerEnd);
    const bodySection = text.substring(headerEnd + boundary.length);

    // Need the ORIGINAL Content-Type (with its boundary=) to walk the MIME
    // body, even though Content-Type itself is essential and stays in the
    // cleaned headers below.
    const originalHeaders = parseHeaders(headerSection);
    const contentTypeHeader = originalHeaders['Content-Type'] ||
      Object.entries(originalHeaders).find(([k]) => k.toLowerCase() === 'content-type')?.[1];

    // Parse and filter headers
    const lines = headerSection.split(/\r?\n/);
    const cleanedLines = [];
    let skipUntilNextHeader = false;
    let currentHeaderName = '';

    for (const line of lines) {
      if (line.match(/^\s+/)) {
        // Folded header - include only if not skipping
        if (!skipUntilNextHeader) {
          cleanedLines.push(line);
        }
      } else if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        currentHeaderName = line.substring(0, colonIndex).trim().toLowerCase();

        // Check if this header should be removed
        const shouldRemove = SENSITIVE_HEADERS.some(sh => currentHeaderName.includes(sh));
        const isEssential = ESSENTIAL_HEADERS.includes(currentHeaderName);

        if (shouldRemove && !isEssential) {
          skipUntilNextHeader = true;
        } else {
          skipUntilNextHeader = false;
          cleanedLines.push(line);
        }
      } else {
        // Empty line or other
        if (!skipUntilNextHeader) {
          cleanedLines.push(line);
        }
      }
    }

    // Deep clean: re-encode any recognized attachment (photo/PDF/Office doc)
    // through the same cleaner a standalone upload would get. Header
    // scrubbing alone leaves an attached photo's own GPS/EXIF fully intact.
    const { body: cleanedBody } = await deepCleanMimeBody(bodySection, contentTypeHeader);

    // Reconstruct email
    const cleanedHeaders = cleanedLines.join('\r\n');
    const cleanedEmail = cleanedHeaders + '\r\n\r\n' + cleanedBody;

    return new Blob([cleanedEmail], { type: 'message/rfc822' });

  } catch (e) {
    console.error('Error cleaning EML:', e);
    return new Blob([text], { type: 'message/rfc822' });
  }
}

/**
 * Sanitize header value for display
 */
function sanitizeHeaderValue(value) {
  if (!value) return '';
  // Remove excessive whitespace and newlines
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate helper
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

export { isEML, readEMLMetadata, cleanEMLMetadata };
