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
 */

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
  'x-proofpoint'
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
    
    // Count attachments
    const attachmentCount = (text.match(/Content-Disposition:\s*attachment/gi) || []).length;
    if (attachmentCount > 0) {
      metadata.items.push({
        name: 'Attachments',
        value: `${attachmentCount} file(s)`,
        risk: 'low'
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
    
    // Reconstruct email
    const cleanedHeaders = cleanedLines.join('\r\n');
    const cleanedEmail = cleanedHeaders + '\r\n\r\n' + bodySection;
    
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
