/**
 * MetaSafe QR Code Generator
 * Minimal QR code generator using Canvas API — zero dependencies, CSP-safe.
 * Generates QR codes from certificate data for mobile verification.
 * 
 * Uses a simplified encoding: numeric/alphanumeric mode with error correction.
 * For our use case (short hash strings + URLs), this is sufficient.
 */

// QR Code generator - simplified implementation for short text
// Supports up to ~100 chars (sufficient for hash + timestamp verification)
class QRCode {
  // Generate a QR code as a data URL (PNG)
  static toDataURL(text, size = 200) {
    const modules = QRCode.generate(text);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const moduleCount = modules.length;
    const cellSize = size / moduleCount;
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Draw modules
    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (modules[row][col]) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
    
    return canvas.toDataURL('image/png');
  }
  
  // Generate QR matrix (2D boolean array)
  static generate(text) {
    // For simplicity, use byte mode encoding
    const data = QRCode._encodeData(text);
    const version = QRCode._getVersion(data.length);
    const size = version * 4 + 17;
    
    // Create matrix
    const matrix = Array.from({ length: size }, () => Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    
    // Place finder patterns
    QRCode._placeFinderPattern(matrix, reserved, 0, 0);
    QRCode._placeFinderPattern(matrix, reserved, size - 7, 0);
    QRCode._placeFinderPattern(matrix, reserved, 0, size - 7);
    
    // Place timing patterns
    QRCode._placeTimingPatterns(matrix, reserved, size);
    
    // Place alignment patterns (version >= 2)
    if (version >= 2) {
      QRCode._placeAlignmentPatterns(matrix, reserved, version, size);
    }
    
    // Reserve format info area
    QRCode._reserveFormatArea(reserved, size);
    
    // Place data
    const ecData = QRCode._addErrorCorrection(data, version);
    QRCode._placeData(matrix, reserved, ecData, size);
    
    // Apply mask (pattern 0 for simplicity)
    QRCode._applyMask(matrix, reserved, size, 0);
    
    // Place format info
    QRCode._placeFormatInfo(matrix, size, 0);
    
    // Replace nulls with false
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (matrix[i][j] === null) matrix[i][j] = false;
      }
    }
    
    return matrix;
  }
  
  static _encodeData(text) {
    const bytes = new TextEncoder().encode(text);
    // Mode indicator (byte mode) + character count + data
    const bits = [];
    
    // Mode: 0100 (byte mode)
    bits.push(0, 1, 0, 0);
    
    // Character count (8 bits for version 1-9)
    const len = bytes.length;
    for (let i = 7; i >= 0; i--) {
      bits.push((len >> i) & 1);
    }
    
    // Data bytes
    for (const byte of bytes) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }
    
    // Terminator
    bits.push(0, 0, 0, 0);
    
    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);
    
    // Convert to bytes
    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | (bits[i + j] || 0);
      }
      result.push(byte);
    }
    
    return result;
  }
  
  static _getVersion(dataLength) {
    // Simple version selection based on data capacity (EC level L)
    const capacities = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
    for (let v = 1; v <= 10; v++) {
      if (dataLength <= capacities[v]) return v;
    }
    return 10; // Max we support
  }
  
  static _placeFinderPattern(matrix, reserved, row, col) {
    const pattern = [
      [1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1],
      [1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1],
      [1,0,0,0,0,0,1],
      [1,1,1,1,1,1,1]
    ];
    
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr < 0 || mc < 0 || mr >= matrix.length || mc >= matrix.length) continue;
        
        if (r >= 0 && r < 7 && c >= 0 && c < 7) {
          matrix[mr][mc] = pattern[r][c] === 1;
        } else {
          matrix[mr][mc] = false; // Separator
        }
        reserved[mr][mc] = true;
      }
    }
  }
  
  static _placeTimingPatterns(matrix, reserved, size) {
    for (let i = 8; i < size - 8; i++) {
      const val = i % 2 === 0;
      if (!reserved[6][i]) {
        matrix[6][i] = val;
        reserved[6][i] = true;
      }
      if (!reserved[i][6]) {
        matrix[i][6] = val;
        reserved[i][6] = true;
      }
    }
  }
  
  static _placeAlignmentPatterns(matrix, reserved, version, size) {
    const positions = QRCode._getAlignmentPositions(version);
    for (const row of positions) {
      for (const col of positions) {
        if (reserved[row][col]) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const mr = row + r;
            const mc = col + c;
            if (mr < 0 || mc < 0 || mr >= size || mc >= size) continue;
            const isEdge = Math.abs(r) === 2 || Math.abs(c) === 2;
            const isCenter = r === 0 && c === 0;
            matrix[mr][mc] = isEdge || isCenter;
            reserved[mr][mc] = true;
          }
        }
      }
    }
  }
  
  static _getAlignmentPositions(version) {
    if (version === 1) return [];
    const positions = [6];
    const last = version * 4 + 10;
    const step = version === 2 ? 0 : Math.ceil((last - 6) / (Math.floor(version / 7) + 1));
    if (step > 0) {
      for (let pos = last; pos > 6; pos -= step) {
        positions.unshift(pos);
      }
    } else {
      positions.push(last);
    }
    return positions;
  }
  
  static _reserveFormatArea(reserved, size) {
    // Around top-left finder
    for (let i = 0; i < 9; i++) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
    // Around top-right finder
    for (let i = 0; i < 8; i++) {
      reserved[8][size - 1 - i] = true;
    }
    // Around bottom-left finder
    for (let i = 0; i < 7; i++) {
      reserved[size - 1 - i][8] = true;
    }
    // Dark module
    reserved[size - 8][8] = true;
  }
  
  static _addErrorCorrection(data, version) {
    // Simplified: pad data to required length then add basic EC bytes
    const totalBytes = QRCode._getTotalBytes(version);
    const ecBytes = QRCode._getECBytes(version);
    const dataBytes = totalBytes - ecBytes;
    
    // Pad data
    const padded = [...data];
    const pads = [0xEC, 0x11];
    let padIdx = 0;
    while (padded.length < dataBytes) {
      padded.push(pads[padIdx % 2]);
      padIdx++;
    }
    
    // Generate EC bytes using simplified polynomial division
    const ec = QRCode._calculateEC(padded, ecBytes);
    
    return [...padded, ...ec];
  }
  
  static _getTotalBytes(version) {
    // Total codewords for each version (EC level L)
    const totals = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
    return totals[version] || 26;
  }
  
  static _getECBytes(version) {
    // EC codewords for each version (EC level L)
    const ec = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
    return ec[version] || 7;
  }
  
  static _calculateEC(data, ecCount) {
    // Reed-Solomon error correction using GF(256)
    const gfExp = new Array(512);
    const gfLog = new Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if (x >= 256) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
    
    // Generator polynomial
    let gen = [1];
    for (let i = 0; i < ecCount; i++) {
      const newGen = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) {
        newGen[j] ^= gen[j];
        newGen[j + 1] ^= QRCode._gfMul(gen[j], gfExp[i], gfExp, gfLog);
      }
      gen = newGen;
    }
    
    // Division
    const result = new Array(ecCount).fill(0);
    const msg = [...data, ...result];
    
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= QRCode._gfMul(coef, gen[j], gfExp, gfLog);
        }
      }
    }
    
    return msg.slice(data.length);
  }
  
  static _gfMul(a, b, gfExp, gfLog) {
    if (a === 0 || b === 0) return 0;
    return gfExp[(gfLog[a] + gfLog[b]) % 255];
  }
  
  static _placeData(matrix, reserved, data, size) {
    // Convert bytes to bits
    const bits = [];
    for (const byte of data) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }
    
    let bitIdx = 0;
    let upward = true;
    
    for (let col = size - 1; col >= 0; col -= 2) {
      if (col === 6) col--; // Skip timing pattern column
      if (col < 0) break;
      
      const rows = upward 
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);
      
      for (const row of rows) {
        for (let c = 0; c <= 1; c++) {
          const curCol = col - c;
          if (curCol < 0) continue;
          if (reserved[row][curCol]) continue;
          
          matrix[row][curCol] = bitIdx < bits.length ? bits[bitIdx] === 1 : false;
          bitIdx++;
        }
      }
      upward = !upward;
    }
  }
  
  static _applyMask(matrix, reserved, size, maskPattern) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (reserved[row][col]) continue;
        let mask = false;
        switch (maskPattern) {
          case 0: mask = (row + col) % 2 === 0; break;
          case 1: mask = row % 2 === 0; break;
          case 2: mask = col % 3 === 0; break;
          case 3: mask = (row + col) % 3 === 0; break;
        }
        if (mask) matrix[row][col] = !matrix[row][col];
      }
    }
  }
  
  static _placeFormatInfo(matrix, size, maskPattern) {
    // Format info for EC level L + mask pattern 0
    // Pre-computed format strings for L level, masks 0-3
    const formatBits = [
      0b111011111000100, // L, mask 0
      0b111001011110011, // L, mask 1
      0b111110110101010, // L, mask 2
      0b111100010011101  // L, mask 3
    ];
    
    const format = formatBits[maskPattern] || formatBits[0];
    
    // Place around top-left
    const positions1 = [
      [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
      [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
    ];
    
    for (let i = 0; i < 15; i++) {
      const bit = (format >> (14 - i)) & 1;
      const [r, c] = positions1[i];
      matrix[r][c] = bit === 1;
    }
    
    // Place around other finders
    const positions2 = [
      [size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
      [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]
    ];
    
    for (let i = 0; i < 15; i++) {
      const bit = (format >> (14 - i)) & 1;
      const [r, c] = positions2[i];
      if (r < size && c < size) matrix[r][c] = bit === 1;
    }
    
    // Dark module
    matrix[size - 8][8] = true;
  }
}

export { QRCode };
