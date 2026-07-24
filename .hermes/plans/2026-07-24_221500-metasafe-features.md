# MetaSafe — Feature Enhancement Plan

> **Created:** 2026-07-24
> **Goal:** MetaSafe'i rakiplerden öne geçirecek 14 feature eklemek

---

## Mevcut Durum (Zaten var — atlanacak)

| # | Özellik | Durum |
|---|---------|-------|
| 1 | Clipboard Paste & Clean | ✅ `app.js:963-1021` — Ctrl+V ve paste event |
| 2 | Web Share Target | ✅ `manifest.json` — share_target tanımlı |
| 3 | File Handling API | ✅ `manifest.json` — file_handlers tanımlı |
| 4 | Launch Handler | ✅ `manifest.json` — launch_handler tanımlı |
| 5 | Post-clean doğrulama | ✅ `app.js:423-438` — metadata tekrar okunuyor |
| 6 | Dark/Light localStorage | ✅ `app.js:159-166` |
| 7 | Video/Audio metadata | ✅ Custom MP4/ID3 parser |

---

## Gerçekten Eksik Olan Features (Phase 1-4)

### Phase 1 — Hemen (bağımlılık yok)

#### 1.1 Batch Klasör Seçimi (`<input webkitdirectory>`)
**Dosyalar:** `index.html`, `js/app.js`
**Açıklama:** "Klasör Seç" butonu ekle, tüm klasörü tarayıp desteklenen dosyaları otomatik işle
**Implementasyon:**
- index.html'e gizli `<input type="file" webkitdirectory id="folder-input">` ekle
- Dropzone'a "📁 Klasör Seç" butonu ekle
- `initDropzone()`'a folder handler ekle
- Recursive alt-klasörleri de tara

#### 1.2 Post-Clean Doğrulama UI İyileştirmesi
**Dosyalar:** `js/app.js`, `css/style-futuristic.css`
**Açıklama:** Mevcut doğrulama satır 437'de `verified` boolean döndürüyor ama kullanıcıya detaylı gösterilmiyor
**Implementasyon:**
- Result card'a "📋 Doğrulama Raporu" butonu ekle
- Before/After metadata karşılaştırma modalı
- Kalan metadata item'ları varsa sarı uyarı göster
- "0 hassas metadata kaldı ✅" yerine detay gösteren expandable panel

#### 1.3 PDF Redaction Uyarısı
**Dosyalar:** `js/processors/pdf.js`
**Açıklama:** PDF'te siyah dikdörtgenle "gizlenmiş" metin aslında kopyalanabilir — büyük güvenlik riski
**Implementasyon:**
- pdf-lib ile tüm annotations'ı tara
- `/Subtype /Redact` veya siyah rect annotations bul
- Altta metin varsa (hidden text under annotations) uyarı ver
- "⚠️ Bu PDF'te redact edilmiş gibi görünen ama hala erişilebilir metin var!" risk: critical

#### 1.4 ICC Profil Temizleme + Uyarı
**Dosyalar:** `js/processors/jpeg.js`, `js/processors/png.js`
**Açıklama:** ICC profilinde cihaz adı, üretici, kalibrasyon tarihi gizli olabilir
**Implementasyon:**
- JPEG: piexif zaten ICC'yi siliyor mu kontrol et
- PNG: iCCP chunk'ını strip et (cleanPngMetadata'da)
- Metadata okuma aşamasında ICC profil varsa göster: "🎨 ICC Profil: [cihaz adı]"

#### 1.5 Thumbnail Metadata Uyarısı
**Dosyalar:** `js/processors/jpeg.js`
**Açıklama:** JPEG'lerin EXIF'inde gömülü thumbnail olabilir — bazen kırpılmamış orijinal
**Implementasyon:**
- piexif ile thumbnail varlığını kontrol et
- Varsa "⚠️ Gömülü thumbnail tespit edildi — orijinal kırpma öncesi görüntüyü içerebilir" uyarısı
- Canvas re-encode zaten thumbnail'i siliyor (doğrula)

---

### Phase 2 — WebWorker (Performans)

#### 2.1 Worker Pool + Comlink
**Dosyalar:** Yeni: `js/workers/metadata-worker.js`, Değişen: `js/app.js`
**Bağımlılık:** comlink (veya kendi mini RPC — 0 bağımlılık tercih)
**Açıklama:** Metadata okuma ve temizleme main thread'den worker'a taşınsın
**Implementasyon:**
- `js/workers/metadata-worker.js` oluştur — tüm read/clean fonksiyonlarını import eder
- `postMessage` ile dosya ArrayBuffer gönder, sonuç al
- `navigator.hardwareConcurrency` kadar worker (max 4)
- Main thread sadece UI, worker'lar ağır işi yapar
- Progress event'leri worker'dan main'e geri bildir

#### 2.2 OffscreenCanvas Guaranteed Strip
**Dosyalar:** `js/workers/metadata-worker.js`
**Açıklama:** Görsel dosyalarda canvas re-encode = %100 temiz garanti
**Implementasyon:**
- Worker'da: `createImageBitmap(blob)` → `OffscreenCanvas` → `convertToBlob()`
- Bu yaklaşımda metadata'dan bağımsız olarak garanti temiz output
- "Paranoid mode" toggle olarak sunulabilir

---

### Phase 3 — Clean & Compress + Gelişmiş Uyarılar

#### 3.1 "Clean & Compress" Modu
**Dosyalar:** `js/app.js`, `index.html`, `css/style-futuristic.css`
**Açıklama:** Metadata sil + dosya boyutunu optimize et
**Implementasyon:**
- UI'da toggle: "🗜️ Sıkıştır" checkbox
- JPEG: Canvas re-encode quality 0.85 (mevcut 0.92'den düşür)
- PNG: Canvas → WebP'ye çevir seçeneği
- Kullanıcıya quality slider (70-95%)
- Before/after boyut gösterimi zaten var — compress ile daha dramatik fark

#### 3.2 Printer Tracking Dots (MIC) Uyarısı
**Dosyalar:** `js/processors/jpeg.js`, `js/processors/png.js`
**Açıklama:** Renkli lazer yazıcılar gizli sarı nokta paterni bırakır (Machine Identification Code)
**Implementasyon:**
- Sadece uyarı/eğitim — client-side tespit çok zor
- Eğer dosya "scanned" göstergesi varsa (300dpi, A4 boyut, düz beyaz arka plan):
  "⚠️ Bu dosya taranmış belge olabilir. Renkli yazıcılar gizli tanımlama noktaları bırakabilir."
- Risk: medium
- Eğitim linki: EFF'nin MIC açıklaması

#### 3.3 Steganografi Uyarısı + Paranoid Modu
**Dosyalar:** `js/app.js`, `js/processors/jpeg.js`
**Açıklama:** Dosyada gizli veri gömülü olabilir — canvas re-encode ile garanti temizle
**Implementasyon:**
- "🔒 Paranoid Mod" toggle
- Aktifken: tüm görseller canvas üzerinden re-encode (OffscreenCanvas)
- Bu, steganografi dahil her şeyi temizler
- Uyarı: "Paranoid mod etkin — dosya pixel-seviyesinde yeniden oluşturuldu"
- Trade-off: kalite minimal düşer, dosya boyutu değişir

---

### Phase 4 — Gelişmiş UX

#### 4.1 Doğrulama Raporu QR Kodu
**Dosyalar:** Yeni: `js/utils/qr-generator.js` veya `lib/qrcode.min.js`
**Açıklama:** Sertifika SHA-256 hash'ini QR kod olarak göster
**Implementasyon:**
- Lightweight QR kütüphanesi (qrcode-generator — 4KB)
- Certificate card'a "📱 QR Doğrula" butonu
- QR içeriği: `metasafe:verify:<sha256_first_16_chars>`
- Mobilde tarayıp hash'i karşılaştırabilir

#### 4.2 Güvenli Paylaşım Modu (Activists)
**Dosyalar:** `js/app.js`, UI toggle
**Açıklama:** Max güvenlik — canvas re-encode + boyut/dimension'ları yuvarlama
**Implementasyon:**
- "🛡️ Güvenli Paylaşım" toggle (default: off)
- Etkinleşince:
  1. Canvas re-encode (steganografi temizle)
  2. Boyutları yuvarla (1200x800 → 1200x800, ama 1183x791 → 1184x792)
  3. Timestamp-free filename: `clean_[random6].jpg`
  4. JPEG quality'yi hafif randomize (0.88-0.92 arası)
  5. Dosya boyutunu padding ile yuvarlama (fingerprint kırma)

#### 4.3 Batch Seçimi + İlerleme Çubuğu İyileştirmesi
**Dosyalar:** `js/app.js`, `css/style-futuristic.css`
**Açıklama:** 10+ dosyada daha iyi UX
**Implementasyon:**
- Dosya sayısı badge
- "Tümünü Temizle" butonu daha belirgin
- ETA (tahmini süre) gösterimi
- İptal butonu
- Per-file mini progress

---

## Uygulama Sırası

```
Phase 1 (hemen — 0 bağımlılık):
  1.1 Batch Klasör Seçimi ..................... [5 dk]
  1.2 Post-Clean Doğrulama UI ................ [10 dk]
  1.3 PDF Redaction Uyarısı .................. [15 dk]
  1.4 ICC Profil Temizleme ................... [10 dk]
  1.5 Thumbnail Uyarısı ...................... [5 dk]

Phase 2 (WebWorker):
  2.1 Worker Pool ............................. [30 dk]
  2.2 OffscreenCanvas Strip .................. [15 dk]

Phase 3 (Gelişmiş):
  3.1 Clean & Compress ....................... [20 dk]
  3.2 Printer Dots Uyarısı ................... [10 dk]
  3.3 Paranoid Mod ........................... [15 dk]

Phase 4 (UX):
  4.1 QR Doğrulama ........................... [15 dk]
  4.2 Güvenli Paylaşım ....................... [20 dk]
  4.3 Batch UX ............................... [15 dk]
```

---

## Notlar

- **CSP uyumluluğu:** Tüm Phase 1-2 `script-src 'self'` ile çalışır
- **WASM eklenirse:** CSP'ye `'wasm-unsafe-eval'` gerekir (Phase 3'te değerlendır)
- **Sıfır upload prensibi korunacak** — hiçbir dosya sunucuya gitmeyecek
- **Her adımda test:** feature ekle → tarayıcıda dene → console error 0 → commit
