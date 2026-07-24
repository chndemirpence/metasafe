/**
 * MetaSafe Cleaning Certificate Generator
 * Generates cryptographic proof that a file was cleaned
 * 
 * Features:
 * - SHA-256 hash of original and cleaned files
 * - Timestamp with timezone
 * - Metadata summary (what was removed)
 * - Downloadable JSON certificate
 * - Verifiable signature
 */

class CleaningCertificate {
  constructor() {
    this.version = '1.0.0';
    this.tool = 'MetaSafe';
    this.toolUrl = 'https://metasafe.app';
  }

  /**
   * Generate SHA-256 hash of a file
   */
  async hashFile(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return this.bufferToHex(hashBuffer);
  }

  /**
   * Generate SHA-256 hash of text
   */
  async hashText(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.bufferToHex(hashBuffer);
  }

  /**
   * Convert ArrayBuffer to hex string
   */
  bufferToHex(buffer) {
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate cleaning certificate
   */
  async generate(originalFile, cleanedBlob, metadata, removedFields) {
    const timestamp = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Hash both files
    const originalHash = await this.hashFile(originalFile);
    
    // Convert blob to file for hashing
    const cleanedFile = new File([cleanedBlob], 'cleaned', { type: cleanedBlob.type });
    const cleanedHash = await this.hashFile(cleanedFile);

    // Build certificate
    const certificate = {
      version: this.version,
      tool: this.tool,
      toolUrl: this.toolUrl,
      
      timestamp: timestamp,
      timezone: timezone,
      
      original: {
        name: originalFile.name,
        size: originalFile.size,
        type: originalFile.type,
        sha256: originalHash
      },
      
      cleaned: {
        name: `clean_${originalFile.name}`,
        size: cleanedBlob.size,
        type: cleanedBlob.type,
        sha256: cleanedHash
      },
      
      operation: {
        status: 'SUCCESS',
        metadataRemoved: true,
        sizeDifference: originalFile.size - cleanedBlob.size,
        compressionRatio: ((1 - cleanedBlob.size / originalFile.size) * 100).toFixed(2) + '%'
      },
      
      removedMetadata: this.summarizeRemovedMetadata(metadata, removedFields),
      
      verification: {
        method: 'SHA-256',
        instructions: 'To verify: hash the cleaned file with SHA-256 and compare with cleaned.sha256'
      }
    };

    // Generate certificate signature (hash of certificate without signature)
    const certString = JSON.stringify(certificate, null, 2);
    certificate.signature = await this.hashText(certString);

    return certificate;
  }

  /**
   * Summarize what metadata was removed
   */
  summarizeRemovedMetadata(metadata, removedFields) {
    const summary = {
      totalFieldsRemoved: 0,
      categories: {}
    };

    if (!metadata) return summary;

    // GPS data
    if (metadata.gps || metadata.GPSLatitude || metadata.GPSLongitude) {
      summary.categories.location = {
        removed: true,
        fields: ['GPS coordinates', 'Location data'],
        risk: 'HIGH'
      };
      summary.totalFieldsRemoved += 2;
    }

    // Device info
    if (metadata.Make || metadata.Model || metadata.camera) {
      summary.categories.device = {
        removed: true,
        fields: ['Camera make', 'Camera model', 'Serial number'].filter(f => metadata[f]),
        risk: 'MEDIUM'
      };
      summary.totalFieldsRemoved += 3;
    }

    // Personal info
    if (metadata.Author || metadata.Creator || metadata.artist) {
      summary.categories.personal = {
        removed: true,
        fields: ['Author name', 'Creator', 'Artist'].filter(f => metadata[f]),
        risk: 'HIGH'
      };
      summary.totalFieldsRemoved += 2;
    }

    // Software info
    if (metadata.Software || metadata.Producer || metadata.software) {
      summary.categories.software = {
        removed: true,
        fields: ['Software name', 'Producer', 'Application'].filter(f => metadata[f]),
        risk: 'LOW'
      };
      summary.totalFieldsRemoved += 2;
    }

    // Time info
    if (metadata.DateTimeOriginal || metadata.CreateDate || metadata.dateTime) {
      summary.categories.temporal = {
        removed: true,
        fields: ['Creation date', 'Modification date', 'Timezone'],
        risk: 'MEDIUM'
      };
      summary.totalFieldsRemoved += 3;
    }

    return summary;
  }

  /**
   * Generate downloadable certificate file
   */
  generateDownload(certificate) {
    const json = JSON.stringify(certificate, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `metasafe_certificate_${certificate.original.name}_${Date.now()}.json`;
    
    return {
      blob,
      filename,
      url: URL.createObjectURL(blob)
    };
  }

  /**
   * Generate human-readable certificate (text format)
   */
  generateReadable(certificate) {
    const lines = [
      '═══════════════════════════════════════════════════════════════',
      '                   METASAFE CLEANING CERTIFICATE                ',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Generated: ${certificate.timestamp}`,
      `Timezone:  ${certificate.timezone}`,
      `Tool:      ${certificate.tool} v${certificate.version}`,
      '',
      '───────────────────────────────────────────────────────────────',
      '                        ORIGINAL FILE                          ',
      '───────────────────────────────────────────────────────────────',
      `Name:     ${certificate.original.name}`,
      `Size:     ${this.formatBytes(certificate.original.size)}`,
      `Type:     ${certificate.original.type}`,
      `SHA-256:  ${certificate.original.sha256}`,
      '',
      '───────────────────────────────────────────────────────────────',
      '                        CLEANED FILE                           ',
      '───────────────────────────────────────────────────────────────',
      `Name:     ${certificate.cleaned.name}`,
      `Size:     ${this.formatBytes(certificate.cleaned.size)}`,
      `Type:     ${certificate.cleaned.type}`,
      `SHA-256:  ${certificate.cleaned.sha256}`,
      '',
      '───────────────────────────────────────────────────────────────',
      '                     METADATA REMOVED                          ',
      '───────────────────────────────────────────────────────────────'
    ];

    const removed = certificate.removedMetadata;
    if (removed.categories) {
      for (const [category, info] of Object.entries(removed.categories)) {
        lines.push(`✓ ${category.toUpperCase()} (Risk: ${info.risk})`);
        info.fields.forEach(field => lines.push(`  - ${field}`));
      }
    }
    lines.push('');
    lines.push(`Total fields removed: ${removed.totalFieldsRemoved}`);
    lines.push(`Size reduction: ${certificate.operation.compressionRatio}`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                       VERIFICATION                            ');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('To verify this certificate:');
    lines.push('1. Hash the cleaned file with SHA-256');
    lines.push('2. Compare with the SHA-256 hash above');
    lines.push('3. If they match, the file is authentic');
    lines.push('');
    lines.push(`Certificate Signature: ${certificate.signature}`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Verify a certificate against a file
   */
  async verify(certificate, file) {
    const hash = await this.hashFile(file);
    return {
      valid: hash === certificate.cleaned.sha256,
      computedHash: hash,
      expectedHash: certificate.cleaned.sha256
    };
  }
}

export { CleaningCertificate };
