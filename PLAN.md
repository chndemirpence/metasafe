# MetaSafe - Uygulama Planı

## Proje Özeti
**MetaSafe** - Tamamen çevrimdışı, tarayıcı tabanlı metadata sıyırıcı PWA

## Teknik Gereksinimler

### Tarayıcı Desteği
- Chrome 80+ ✅
- Firefox 78+ ✅
- Safari 14+ ✅
- Edge 80+ ✅
- Chrome Android ✅
- Safari iOS ✅

### Web API'ları
- File API (FileReader, Blob)
- Canvas API (2D context)
- Web Workers
- Service Workers
- Drag and Drop API
- URL.createObjectURL / revokeObjectURL
- Origin Private File System (OPFS) - opsiyonel

---

## Aşama 1: Core - JPEG Metadata Temizleme

### 1.1 Proje Yapısı Oluştur
```
C:\otf\
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── processors/
│   │   └── jpeg.js
│   └── ui/
│       ├── dropzone.js
│       └── preview.js
└── lib/
    └── piexif.min.js
```

### 1.2 HTML Yapısı
- Minimal, semantic HTML5
- Drag/drop alanı
- Dosya önizleme
- Metadata görüntüleme (önce/sonra)
- İndir butonu

### 1.3 JPEG İşleme Modülü
**Kullanılacak:** piexifjs

**İşlem Akışı:**
1. FileReader ile dosya oku → DataURL
2. piexif.load() ile metadata al
3. Görüntüle (tehlikeli alanlar işaretle)
4. piexif.remove() ile temizle
5. Canvas ile yeniden kodla (thumbnail için)
6. Blob oluştur
7. İndir

**Kritik:** Thumbnail ayrıca temizlenmeli (Canvas re-render)

### 1.4 UI Bileşenleri

#### Dropzone
```javascript
// Drag over, drop eventları
// File input fallback
// Dosya tipi kontrolü
```

#### Preview
```javascript
// Orijinal görsel
// Metadata listesi (kırmızı=tehlikeli)
// Temizlenmiş görsel
// Metadata karşılaştırma
```

---

## Aşama 2: Genişletme

### 2.1 PNG Desteği
**Yöntem:** Canvas API ile yeniden kodlama
- PNG tEXt/iTXt chunks otomatik temizlenir
- toDataURL('image/png') ile yeni PNG

### 2.2 WebP Desteği
- Canvas toDataURL('image/webp')
- Metadata otomatik temizlenir

### 2.3 PDF Desteği
**Kullanılacak:** pdf-lib

**Temizlenecek Alanlar:**
- Title, Author, Subject, Keywords
- Creator, Producer
- CreationDate, ModDate
- XMP metadata

```javascript
import { PDFDocument } from 'pdf-lib';

const pdfDoc = await PDFDocument.load(arrayBuffer);
pdfDoc.setTitle('');
pdfDoc.setAuthor('');
pdfDoc.setSubject('');
pdfDoc.setKeywords([]);
pdfDoc.setProducer('');
pdfDoc.setCreator('');
pdfDoc.setCreationDate(new Date(0));
pdfDoc.setModificationDate(new Date(0));
// XMP temizleme
```

### 2.4 DOCX/Office Desteği
**Kullanılacak:** JSZip

**Yapı:** DOCX = ZIP dosyası
```
docx/
├── [Content_Types].xml
├── _rels/.rels
├── docProps/
│   ├── app.xml      ← Metadata burada
│   └── core.xml     ← Metadata burada
├── word/
│   └── document.xml
└── ...
```

**İşlem:**
1. JSZip ile aç
2. `docProps/core.xml` içini temizle:
   - dc:creator, dc:title, cp:lastModifiedBy
   - dcterms:created, dcterms:modified
3. `docProps/app.xml` içini temizle:
   - Application, AppVersion, Company
   - TotalTime, Pages, etc.
4. Yeni ZIP oluştur

### 2.5 Batch İşleme
- Çoklu dosya sürükle/bırak
- Progress bar
- Zip olarak toplu indirme

---

## Aşama 3: PWA

### 3.1 Manifest
```json
{
  "name": "MetaSafe - Metadata Cleaner",
  "short_name": "MetaSafe",
  "description": "Clean metadata from your files before sharing",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#16213e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 3.2 Service Worker
```javascript
const CACHE_NAME = 'metasafe-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/processors/jpeg.js',
  '/lib/piexif.min.js',
  // ...
];

// Install: cache assets
// Activate: cleanup old caches
// Fetch: cache-first strategy
```

### 3.3 Offline Banner
- Online/offline durumu göster
- "Çevrimdışı çalışıyor" mesajı

---

## Aşama 4: Polish

### 4.1 Çoklu Dil (i18n)
```javascript
const i18n = {
  tr: {
    title: 'MetaSafe',
    subtitle: 'Paylaşmadan Önce Temizle',
    dropzone: 'Dosyalarınızı buraya sürükleyin',
    clean: 'Temizle',
    download: 'İndir',
    metadata_found: 'Bulunan Metadata',
    gps_warning: '⚠️ GPS Konum Verisi Bulundu!',
    // ...
  },
  en: { ... },
  ar: { ... }
};
```

### 4.2 Görsel Tasarım
- Koyu tema (varsayılan)
- Açık tema seçeneği
- Accessibility (ARIA labels)
- Mobil responsive

### 4.3 Test Senaryoları

#### Fonksiyonel Testler
- [ ] JPEG EXIF temizleme
- [ ] JPEG thumbnail temizleme
- [ ] PNG metadata temizleme
- [ ] PDF metadata temizleme
- [ ] DOCX metadata temizleme
- [ ] Batch işleme
- [ ] Offline çalışma

#### Metadata Test Dosyaları
- GPS verili fotoğraf
- Cihaz bilgili fotoğraf
- Thumbnail'lı JPEG
- Yazar bilgili PDF
- Track changes'lı DOCX

---

## Dosya Detayları

### index.html
```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Tamamen çevrimdışı metadata temizleyici. Fotoğraflarınızdan GPS, cihaz bilgisi ve diğer gizli verileri silin.">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
  <title>MetaSafe - Paylaşmadan Önce Temizle</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <h1>🛡️ MetaSafe</h1>
    <p class="tagline">Paylaşmadan Önce Temizle</p>
  </header>
  
  <main>
    <section id="dropzone" class="dropzone">
      <div class="dropzone-content">
        <div class="icon">📁</div>
        <p>Dosyalarınızı buraya sürükleyin</p>
        <p class="subtext">veya</p>
        <label class="file-input-label">
          <input type="file" id="file-input" multiple accept="image/*,.pdf,.docx">
          Dosya Seç
        </label>
      </div>
    </section>
    
    <section id="preview" class="preview hidden">
      <!-- Dinamik içerik -->
    </section>
    
    <section id="results" class="results hidden">
      <!-- Sonuçlar -->
    </section>
  </main>
  
  <footer>
    <p class="privacy-notice">
      🔒 Hiçbir dosya sunucuya gönderilmez. Tüm işlem tarayıcınızda gerçekleşir.
    </p>
    <p class="credits">
      <a href="https://github.com/..." target="_blank">Açık Kaynak</a> | 
      OTF Internet Freedom Fund
    </p>
  </footer>
  
  <script src="/lib/piexif.min.js"></script>
  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

### Metadata Kategorileri ve Risk Seviyeleri

```javascript
const METADATA_RISK = {
  // YÜKSEK RİSK - Kırmızı
  high: [
    'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
    'GPSLatitudeRef', 'GPSLongitudeRef',
    'SerialNumber', 'BodySerialNumber', 'LensSerialNumber',
    'CameraOwnerName', 'OwnerName', 'Artist', 'Copyright',
    'ImageDescription', 'UserComment'
  ],
  
  // ORTA RİSK - Turuncu
  medium: [
    'Make', 'Model', 'Software',
    'DateTimeOriginal', 'CreateDate', 'ModifyDate',
    'HostComputer', 'LensModel'
  ],
  
  // DÜŞÜK RİSK - Sarı
  low: [
    'ExifVersion', 'ColorSpace', 'PixelXDimension', 'PixelYDimension',
    'FocalLength', 'FNumber', 'ExposureTime', 'ISOSpeedRatings'
  ]
};
```

---

## Zaman Çizelgesi

| Hafta | Görev | Tamamlanma |
|-------|-------|------------|
| 1 | Proje yapısı, HTML/CSS, Dropzone | [ ] |
| 2 | JPEG işleme, Preview UI | [ ] |
| 3 | PNG, PDF desteği | [ ] |
| 4 | DOCX, Batch işleme | [ ] |
| 5 | PWA, Service Worker | [ ] |
| 6 | i18n, Test, Polish | [ ] |

---

## Kontrol Listesi

### Faz 1 Başlamadan Önce
- [x] Araştırma tamamla
- [x] Plan yaz
- [ ] piexifjs kütüphanesini indir
- [ ] Test fotoğrafları hazırla (GPS'li, cihaz bilgili)
- [ ] Klasör yapısını oluştur

### Her Commit Öncesi
- [ ] Kod çalışıyor mu?
- [ ] Console hata var mı?
- [ ] Network tab'da harici istek var mı?
- [ ] Metadata gerçekten temizleniyor mu?

### Yayın Öncesi
- [ ] Tüm formatlar test edildi
- [ ] Mobil test edildi
- [ ] Offline test edildi
- [ ] CSP header doğru
- [ ] Lighthouse skoru 90+
