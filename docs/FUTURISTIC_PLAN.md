# MetaSafe v3.0 - Futuristik UI + Şifreli Mesajlaşma Planı

## BÖLÜM 1: Futuristik UI Tasarımı

### Renk Paleti (Cyberpunk/Neon)
- Ana renk: Electric Blue (#00f0ff)
- Vurgu: Neon Pink (#ff0080)
- Uyarı: Neon Orange (#ff6600)
- Başarı: Matrix Green (#00ff41)
- Arka plan: Deep Space (#0a0a1a)
- Kart: Dark Glass (rgba(20, 20, 40, 0.8))

### Efektler
- Glow/Neon efektleri (box-shadow, text-shadow)
- Glassmorphism (backdrop-filter: blur)
- Animated gradients
- Scan line animasyonları
- Particle background
- Glitch text efekti
- Pulsing borders

### Tipografi
- Ana font: 'Orbitron' veya 'Rajdhani' (futuristik)
- Mono: 'Fira Code' veya 'JetBrains Mono' (kod için)

---

## BÖLÜM 2: Şifreli Mesajlaşma Sistemi

### Teknik Yaklaşım
Web Crypto API kullanarak:
1. **Key Exchange**: ECDH (Elliptic Curve Diffie-Hellman) - P-256
2. **Encryption**: AES-GCM 256-bit (authenticated encryption)
3. **Key Derivation**: PBKDF2 veya HKDF
4. **Hashing**: SHA-256

### Akış
1. Kullanıcı A bir "oda" oluşturur → Benzersiz Oda ID
2. Kullanıcı B oda ID'siyle katılır
3. Her iki taraf ECDH public key paylaşır
4. Shared secret oluşturulur
5. Mesajlar AES-GCM ile şifrelenir/çözülür
6. Hiçbir sunucu yok - WebRTC veya URL hash üzerinden

### Özellikler
- Oda oluştur / katıl
- End-to-end şifreleme
- Mesaj silme (her iki tarafta)
- Dosya paylaşımı (şifreli)
- QR kod ile oda paylaşımı
- Otomatik mesaj silme (burn after read)

### Güvenlik
- Perfect Forward Secrecy (her oturum yeni key)
- Şifreleme client-side (tarayıcıda)
- Sunucu sadece relay (içerik görmez)
- Keys localStorage'da değil, memory'de

---

## UYGULAMA ADIMLARI

### Adım 1: Futuristik CSS
- [ ] style-futuristic.css oluştur
- [ ] Neon renk paleti
- [ ] Glow efektleri
- [ ] Glassmorphism kartlar
- [ ] Animasyonlar
- [ ] Google Fonts (Orbitron)

### Adım 2: HTML Güncellemesi
- [ ] Yeni tasarım elementleri
- [ ] Mesajlaşma bölümü
- [ ] Particle background

### Adım 3: Crypto Modülü
- [ ] js/crypto/e2e.js
- [ ] Key generation
- [ ] Encrypt/decrypt
- [ ] Key exchange

### Adım 4: Mesajlaşma UI
- [ ] Chat interface
- [ ] Oda oluştur/katıl
- [ ] Mesaj gönder/al
- [ ] QR kod

### Adım 5: Test
- [ ] Şifreleme çalışıyor mu?
- [ ] İki taraflı iletişim
- [ ] UI responsive
