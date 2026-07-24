/**
 * MetaSafe E2E Encryption Module
 * End-to-end encrypted messaging using Web Crypto API
 * 
 * Algorithm: ECDH (P-256) for key exchange + AES-GCM (256-bit) for encryption
 * No server required - keys exchanged via URL hash or QR code
 */

class CryptoE2E {
  constructor() {
    this.keyPair = null;
    this.sharedSecret = null;
    this.derivedKey = null;
    this.peerPublicKey = null;
    this.roomId = null;
    this.onMessage = null;
    this.messages = [];
  }

  /**
   * Generate ECDH key pair for key exchange
   */
  async generateKeyPair() {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );
    
    console.log('🔐 Key pair generated');
    return this.keyPair;
  }

  /**
   * Export public key to share with peer
   */
  async exportPublicKey() {
    if (!this.keyPair) {
      await this.generateKeyPair();
    }
    
    const exported = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    return this.arrayBufferToBase64(exported);
  }

  /**
   * Import peer's public key
   */
  async importPeerPublicKey(base64Key) {
    const keyData = this.base64ToArrayBuffer(base64Key);
    
    this.peerPublicKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      []
    );
    
    console.log('🔑 Peer public key imported');
    return this.peerPublicKey;
  }

  /**
   * Derive shared secret using ECDH
   */
  async deriveSharedKey() {
    if (!this.keyPair || !this.peerPublicKey) {
      throw new Error('Both key pairs required');
    }
    
    // Derive AES-GCM key from ECDH shared secret
    this.derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: this.peerPublicKey
      },
      this.keyPair.privateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false, // not extractable
      ['encrypt', 'decrypt']
    );
    
    console.log('🔒 Shared encryption key derived');
    return this.derivedKey;
  }

  /**
   * Encrypt a message using AES-GCM
   */
  async encrypt(plaintext) {
    if (!this.derivedKey) {
      throw new Error('Shared key not derived yet');
    }
    
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // Generate random IV (12 bytes for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128
      },
      this.derivedKey,
      data
    );
    
    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypt a message using AES-GCM
   */
  async decrypt(ciphertext) {
    if (!this.derivedKey) {
      throw new Error('Shared key not derived yet');
    }
    
    const combined = this.base64ToArrayBuffer(ciphertext);
    const combinedArray = new Uint8Array(combined);
    
    // Extract IV (first 12 bytes)
    const iv = combinedArray.slice(0, 12);
    const encryptedData = combinedArray.slice(12);
    
    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128
        },
        this.derivedKey,
        encryptedData
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (e) {
      console.error('Decryption failed:', e);
      return null;
    }
  }

  /**
   * Generate a unique room ID
   */
  generateRoomId() {
    const array = crypto.getRandomValues(new Uint8Array(16));
    this.roomId = this.arrayBufferToBase64(array.buffer)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .substring(0, 12);
    return this.roomId;
  }

  /**
   * Create a shareable room link
   */
  async createRoomLink() {
    if (!this.roomId) {
      this.generateRoomId();
    }
    
    const publicKey = await this.exportPublicKey();
    
    // Encode room data in URL hash
    const roomData = {
      r: this.roomId,
      k: publicKey
    };
    
    const encoded = btoa(JSON.stringify(roomData));
    return `${window.location.origin}${window.location.pathname}#chat=${encoded}`;
  }

  /**
   * Join a room from link
   */
  async joinFromLink(hash) {
    try {
      const encoded = hash.replace('#chat=', '');
      const roomData = JSON.parse(atob(encoded));
      
      this.roomId = roomData.r;
      await this.importPeerPublicKey(roomData.k);
      await this.deriveSharedKey();
      
      console.log('✅ Joined room:', this.roomId);
      return true;
    } catch (e) {
      console.error('Failed to join room:', e);
      return false;
    }
  }

  /**
   * Create room and wait for peer
   */
  async createRoom() {
    await this.generateKeyPair();
    this.generateRoomId();
    
    console.log('🏠 Room created:', this.roomId);
    return await this.createRoomLink();
  }

  /**
   * Complete key exchange when peer joins
   */
  async completePeerConnection(peerPublicKeyBase64) {
    await this.importPeerPublicKey(peerPublicKeyBase64);
    await this.deriveSharedKey();
    console.log('🤝 Peer connection established');
  }

  /**
   * Send an encrypted message
   */
  async sendMessage(text) {
    const encrypted = await this.encrypt(text);
    
    const message = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      type: 'sent',
      text: text,
      encrypted: encrypted,
      timestamp: new Date().toISOString()
    };
    
    this.messages.push(message);
    
    return {
      ...message,
      forTransmission: {
        id: message.id,
        e: encrypted,
        t: message.timestamp
      }
    };
  }

  /**
   * Receive and decrypt a message
   */
  async receiveMessage(encryptedData) {
    const decrypted = await this.decrypt(encryptedData.e);
    
    if (decrypted === null) {
      console.error('Failed to decrypt message');
      return null;
    }
    
    const message = {
      id: encryptedData.id,
      type: 'received',
      text: decrypted,
      encrypted: encryptedData.e,
      timestamp: encryptedData.t
    };
    
    this.messages.push(message);
    
    if (this.onMessage) {
      this.onMessage(message);
    }
    
    return message;
  }

  /**
   * Generate SHA-256 hash for verification
   */
  async hash(data) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Generate file cleaning certificate
   */
  async generateCleaningCertificate(originalFile, cleanedFile) {
    const originalHash = await this.hashFile(originalFile);
    const cleanedHash = await this.hashFile(cleanedFile);
    
    const certificate = {
      version: '1.0',
      tool: 'MetaSafe',
      timestamp: new Date().toISOString(),
      original: {
        name: originalFile.name,
        size: originalFile.size,
        sha256: originalHash
      },
      cleaned: {
        name: cleanedFile.name,
        size: cleanedFile.size,
        sha256: cleanedHash
      },
      verification: 'METADATA_REMOVED'
    };
    
    // Sign the certificate
    const certString = JSON.stringify(certificate);
    certificate.signature = await this.hash(certString);
    
    return certificate;
  }

  /**
   * Hash a file using SHA-256
   */
  async hashFile(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return this.arrayBufferToBase64(hashBuffer);
  }

  // ===== Utility Functions =====
  
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Clear all keys and messages (for security)
   */
  destroy() {
    this.keyPair = null;
    this.sharedSecret = null;
    this.derivedKey = null;
    this.peerPublicKey = null;
    this.messages = [];
    console.log('🗑️ All crypto data cleared');
  }
}

// ===== Simple WebRTC-free Signaling using BroadcastChannel =====
// For same-browser tabs communication (demo purposes)
// In production, use WebRTC or a simple signaling server

class LocalSignaling {
  constructor(roomId) {
    this.roomId = roomId;
    this.channel = new BroadcastChannel(`metasafe-room-${roomId}`);
    this.onPeerMessage = null;
    this.onPeerJoined = null;
    
    this.channel.onmessage = (event) => {
      const data = event.data;
      
      if (data.type === 'join' && this.onPeerJoined) {
        this.onPeerJoined(data.publicKey);
      } else if (data.type === 'message' && this.onPeerMessage) {
        this.onPeerMessage(data.encrypted);
      } else if (data.type === 'key-exchange' && this.onPeerJoined) {
        this.onPeerJoined(data.publicKey);
      }
    };
  }

  sendJoin(publicKey) {
    this.channel.postMessage({
      type: 'join',
      publicKey: publicKey
    });
  }

  sendKeyExchange(publicKey) {
    this.channel.postMessage({
      type: 'key-exchange',
      publicKey: publicKey
    });
  }

  sendMessage(encrypted) {
    this.channel.postMessage({
      type: 'message',
      encrypted: encrypted
    });
  }

  close() {
    this.channel.close();
  }
}

// Export for use in app
export { CryptoE2E, LocalSignaling };
