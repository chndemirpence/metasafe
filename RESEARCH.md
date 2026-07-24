# MetaSafe - OTF Başvurusu için Araştırma Raporu

## 1. OTF (Open Technology Fund) Hakkında

### Misyon
> "Baskıcı sansür ve gözetimle karşı karşıya olan insanlara özgür ve açık internete güvenli erişim sağlayan teknik çözümleri destekliyoruz."

### Fonlar
1. **Internet Freedom Fund** - Ana fon (bizim için uygun)
   - Yenilikçi internet özgürlüğü projeleri
   - Teknoloji geliştirme, araştırma, dijital güvenlik
   - Performansa dayalı sözleşmeler
   - İki aşamalı başvuru: Concept Note → Proposal

2. **Rapid Response Fund** - Acil dijital güvenlik desteği
3. **Surge and Sustain Fund** - Büyük ölçekli VPN/anti-sansür araçları
4. **FOSS Sustainability Fund** - Açık kaynak sürdürülebilirliği

### OTF Etki Alanı
- 2+ milyar kişi OTF destekli teknolojileri kullanıyor
- 40+ ülkede acil dijital müdahale
- 200+ ülkede sansür izleme
- 100+ güvenlik denetimi, 2000+ güvenlik yaması

### Değerlendirme Kriterleri
- İlk kez başvuranlar öncelikli
- Az temsil edilen gruplar öncelikli
- Yetersiz fonlanan alanlar öncelikli
- Dijital otoriter baskı altındaki kullanıcılara yönelik

---

## 2. Metadata Tehlikeleri - Risk Analizi

### Fotoğraflarda Gizli Bilgiler (EXIF/IPTC/XMP)

#### GPS Konum Verileri
- `GPSLatitude`, `GPSLongitude` - Tam koordinatlar
- `GPSAltitude` - Yükseklik
- `GPSTimeStamp`, `GPSDateStamp` - Çekim zamanı
- **Tehlike:** Aktivist/gazetecinin tam konumu ifşa

#### Cihaz Tanımlama
- `Make`, `Model` - Telefon/kamera markası ve modeli
- `Software` - Kullanılan uygulama/işletim sistemi
- `SerialNumber` - Cihaz seri numarası (benzersiz!)
- `LensModel`, `LensSerialNumber` - Lens bilgisi
- **Tehlike:** Cihaz sahibini tanımlama

#### Zaman Bilgileri
- `DateTimeOriginal` - Çekim tarihi/saati
- `CreateDate` - Oluşturulma tarihi
- `ModifyDate` - Değiştirme tarihi
- **Tehlike:** Aktivite takibi

#### Thumbnail (Küçük Resim)
- EXIF içinde gömülü küçük resim
- Orijinal fotoğrafın kırpılmamış halini içerebilir!
- **Tehlike:** Kırpılan yüzler/konumlar hala görülebilir

#### Diğer Hassas Veriler
- `Artist`, `Copyright` - Fotoğrafçı adı
- `ImageDescription` - Açıklama
- `UserComment` - Kullanıcı notu
- `OwnerName` - Cihaz sahibi

### PDF'lerde Gizli Bilgiler
- `Author` - Yazar adı
- `Creator` - Oluşturan uygulama
- `Producer` - PDF oluşturucu
- `CreationDate`, `ModDate` - Tarihler
- `Title`, `Subject`, `Keywords` - İçerik bilgisi
- **XMP metadata** - Adobe formatında ek bilgiler
- **Tehlike:** Belge kaynağını ifşa

### DOCX/Office Belgelerinde
- Yazar, şirket, son değiştiren
- Düzenleme süresi, revizyon sayısı
- Yazıcı adı, şablon yolu
- Gizli metin, yorumlar, track changes
- **Tehlike:** Kurumsal kaynak ifşası

### Ses/Video Dosyalarında
- Kayıt cihazı, yazılım
- GPS (bazı cihazlarda)
- Tarih/saat bilgileri
- **Tehlike:** Kayıt konumu/zamanı

---

## 3. Mevcut Araçların Analizi

### Masaüstü Araçlar

#### ExifTool (Perl)
- En kapsamlı metadata aracı
- 400+ dosya formatı desteği
- Okuma/yazma/silme
- CLI tabanlı, teknik kullanıcılar için
- **Dezavantaj:** Kurulum gerekli, teknik bilgi gerekli

#### mat2 (Python) - Tails/Tor projesinin aracı
- Metadata temizleme odaklı
- Python kütüphanesi + CLI
- Dolphin file manager entegrasyonu
- **Dezavantaj:** Kurulum gerekli, Linux odaklı, ARCHIVED!

### Web/PWA Tabanlı Araçlar

#### Mevcut web araçları
- Çoğu sunucuya dosya yüklüyor → Gizlilik riski!
- Limitli format desteği
- Mobil uyumluluk zayıf

#### JS Kütüphaneleri (Tam istemci tarafı işlem için)
- **piexifjs** - JPEG EXIF okuma/yazma/silme
- **exif-js** - EXIF okuma (sadece)
- **pdf-lib** - PDF manipülasyonu (metadata dahil)
- **JSZip** - ZIP/DOCX işleme
- Canvas API - Görüntü yeniden kodlama

---

## 4. Proje Tanımı: MetaSafe

### Temel Konsept
**"Paylaşmadan Önce Temizle"** - Tamamen çevrimdışı, tarayıcı tabanlı metadata sıyırıcı

### Teknik Mimari

```
┌─────────────────────────────────────────────────────────┐
│                    MetaSafe PWA                          │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   UI Layer   │  │  Processing  │  │   Storage    │  │
│  │              │  │    Engine    │  │   (OPFS)     │  │
│  │  - Drag/Drop │  │              │  │              │  │
│  │  - Preview   │  │  - EXIF      │  │  - Temp      │  │
│  │  - Progress  │  │  - PDF       │  │  - Cache     │  │
│  │  - Download  │  │  - DOCX      │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│                 Service Worker                           │
│           (Offline capability, caching)                  │
├─────────────────────────────────────────────────────────┤
│                    Web APIs                              │
│  File API | Canvas API | Blob API | OPFS | WebWorkers   │
└─────────────────────────────────────────────────────────┘
        ↑                    ↑
        │                    │
    [Dosyalar]          [İndirilir]
        │                    │
    Kullanıcı ←──────────── Kullanıcı
    
    HİÇBİR VERİ SUNUCUYA GİTMEZ!
```

### Desteklenen Formatlar

#### Fotoğraflar (Öncelik 1)
- **JPEG** - En yaygın, EXIF taşıyan
- **PNG** - tEXt/iTXt chunks
- **WebP** - EXIF desteği var

#### Belgeler (Öncelik 2)
- **PDF** - Yaygın belge formatı
- **DOCX/XLSX/PPTX** - Office formatları (ZIP tabanlı)

#### Medya (Öncelik 3)
- **MP4/MOV** - Video metadata
- **MP3/M4A** - Ses metadata

### Güvenlik Özellikleri

#### 1. Sıfır Sunucu İletişimi
- Tüm işlem tarayıcıda
- Network tab'da kontrol edilebilir
- CSP ile harici bağlantı engeli

#### 2. Görsel Doğrulama
- İşlem öncesi/sonrası metadata karşılaştırma
- "Temiz" damgası

#### 3. Thumbnail Temizleme
- EXIF içindeki gömülü thumbnail silme
- Canvas ile yeniden render

#### 4. Agresif Temizleme Modu
- Sadece piksel verisi kalır
- Tüm metadata kategorileri silinir

#### 5. Seçici Temizleme (Opsiyonel)
- GPS sil, tarih kalsın gibi seçenekler
- İleri kullanıcılar için

### Kullanıcı Deneyimi

#### Akış
1. Dosya sürükle/bırak veya seç
2. Anında metadata önizleme (tehlikeli alanlar kırmızı)
3. Temizle butonu
4. Sonuç önizleme
5. Temiz dosyayı indir

#### Dil Desteği
- Türkçe (öncelik)
- İngilizce
- Arapça
- Farsça
- Rusça
- Çince

### PWA Özellikleri
- Offline çalışma (Service Worker)
- Ana ekrana eklenebilir
- Mobilde native uygulama hissi
- Otomatik güncelleme

---

## 5. OTF Uyumu Analizi

### Neden Tam OTF Profili?

| Kriter | MetaSafe Uyumu |
|--------|----------------|
| Risk altındaki kullanıcılar | ✅ Aktivist/gazeteci koruma |
| Dijital güvenlik | ✅ Konum/kimlik sızıntısı önleme |
| Gözetim karşıtı | ✅ Metadata takibi engelleme |
| Teknik çözüm | ✅ Yazılım ürünü |
| Açık kaynak | ✅ MIT/GPL lisansı |
| Sansür dayanıklı | ✅ Offline çalışma |
| Küresel erişim | ✅ Web tabanlı, kurulum yok |

### Türkiye Perspektifi
- Gerçek sansür/gözetim ortamı
- Gazeteci tutuklamaları
- Sosyal medya izleme
- VPN engelleri
- **Otantik kullanıcı perspektifi sağlar**

### Benzer OTF Projeleri
- OONI (sansür ölçümü)
- Tor Project (anonim tarama)
- Signal (güvenli mesajlaşma)
- MetaSafe bu ekosistemin tamamlayıcısı

---

## 6. Teknik Uygulama Planı

### Kullanılacak Teknolojiler

#### Core
- **Vanilla JS/TypeScript** - Framework bağımlılığı yok
- **Web Workers** - Ağır işlemler için
- **Service Worker** - Offline/PWA

#### Metadata İşleme
- **piexifjs** (4KB gzip) - JPEG EXIF
- **pdf-lib** (300KB) - PDF
- **JSZip** (100KB) - DOCX/Office
- **Canvas API** - Görüntü yeniden kodlama

#### UI
- **Vanilla CSS** - Minimal, hızlı
- **Drag/Drop API** - Dosya seçimi
- **File System Access API** - Modern tarayıcılarda

### Dosya Yapısı

```
metasafe/
├── index.html
├── manifest.json
├── sw.js                 # Service Worker
├── css/
│   └── style.css
├── js/
│   ├── app.js            # Ana uygulama
│   ├── processors/
│   │   ├── image.js      # JPEG/PNG işleme
│   │   ├── pdf.js        # PDF işleme
│   │   └── office.js     # DOCX işleme
│   ├── workers/
│   │   └── process.worker.js
│   ├── ui/
│   │   ├── dropzone.js
│   │   ├── preview.js
│   │   └── download.js
│   └── i18n/
│       ├── tr.json
│       ├── en.json
│       └── ar.json
├── lib/
│   ├── piexif.min.js
│   ├── pdf-lib.min.js
│   └── jszip.min.js
└── assets/
    ├── icons/
    └── logo.svg
```

### Geliştirme Fazları

#### Faz 1: Core (2 hafta)
- JPEG EXIF temizleme
- Temel UI
- Drag/drop
- Download

#### Faz 2: Genişletme (2 hafta)
- PNG desteği
- PDF desteği
- Batch işleme

#### Faz 3: PWA (1 hafta)
- Service Worker
- Offline
- Manifest

#### Faz 4: Polish (1 hafta)
- Çoklu dil
- Görsel iyileştirme
- Test/hata düzeltme

---

## 7. Risk Değerlendirmesi

### Teknik Riskler
| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| Tarayıcı uyumsuzluğu | Orta | Orta | Polyfill, graceful degradation |
| Büyük dosya performansı | Orta | Düşük | Web Workers, streaming |
| Eksik metadata tipi | Düşük | Orta | Kapsamlı test, community feedback |

### Güvenlik Riskleri
| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| JS dependency güvenliği | Düşük | Yüksek | Minimal dependency, denetim |
| XSS/injection | Çok Düşük | Yüksek | CSP, input validation |
| Eksik temizleme | Düşük | Yüksek | Çoklu test vektörü, doğrulama UI |

### Proje Riskleri
- **Fonlanmama:** Proje yine de açık kaynak olarak devam edebilir
- **Bakım:** OTF dışı sürdürülebilirlik planı gerekli

---

## 8. Sonuç

MetaSafe, OTF'nin misyonuyla mükemmel uyumlu:
- Dijital güvenlik aracı
- Risk altındaki kullanıcılara yönelik
- Teknik çözüm odaklı
- Açık kaynak
- Sansür dayanıklı (offline)
- Minimal tehlike (yanlış giderse kimseyi tehlikeye atmaz)

Türkiye'den başvuru otantik perspektif sağlar.
