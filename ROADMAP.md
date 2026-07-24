# MetaSafe v2.0 - Zenginleştirme Planı

## Mevcut Eksikler
- [ ] Dil değiştirme çalışmıyor (i18n.js yok)
- [ ] PWA ikonları eksik

## Yeni Özellikler

### 🔴 Öncelik 1 - Temel (Şimdi)
1. **i18n.js** - Çalışan dil değiştirme sistemi
2. **Doğrulama Sistemi** - Temizleme sonrası metadata kontrolü
3. **Toast Notifications** - Kullanıcı geri bildirimi

### 🟡 Öncelik 2 - UX İyileştirmeleri
4. **Tema Toggle** - Light/Dark mod
5. **Drag & Drop Animasyonları** - Görsel feedback
6. **Progress Bar** - Batch işleme durumu
7. **Klavye Kısayolları** - Ctrl+V yapıştır, Delete kaldır

### 🟢 Öncelik 3 - Gelişmiş Özellikler
8. **Metadata Kategorileri** - GPS, Cihaz, Kişisel, Tarih grupları
9. **Risk Skoru** - Yüzde olarak tehlike seviyesi
10. **Seçici Temizleme** - "Sadece GPS sil" gibi seçenekler
11. **GPS Harita Önizleme** - Koordinatları haritada göster (Leaflet)
12. **Önce/Sonra Karşılaştırma** - Yan yana görsel

### 🔵 Öncelik 4 - Ekstra
13. **Temizleme Raporu** - PDF/TXT olarak indir
14. **Eğitim Tooltips** - "Bu neden tehlikeli?" açıklamaları
15. **Confetti Efekti** - Başarılı temizleme kutlaması
16. **Network Monitör** - "0 request yapıldı" göstergesi

---

## Uygulama Sırası

### Adım 1: i18n.js (Dil Değiştirme)
- Dil dosyalarını yükle
- DOM elementlerini güncelle
- localStorage'da tercih sakla
- Tarayıcı diline göre otomatik seç

### Adım 2: Toast Notifications
- Başarı, hata, bilgi mesajları
- Auto-dismiss (3 saniye)
- Animasyonlu giriş/çıkış

### Adım 3: Doğrulama Sistemi
- Temizleme sonrası tekrar oku
- "✓ Doğrulandı: 0 metadata" göster
- Başarısızsa uyar

### Adım 4: Tema Toggle
- CSS değişkenleri light/dark
- Toggle button header'da
- localStorage'da sakla

### Adım 5: Risk Skoru
- Her dosya için risk hesapla
- Yüzde ve renk göster
- Kategori bazlı ağırlıklar

### Adım 6: Metadata Kategorileri
- Collapsible gruplar
- GPS, Cihaz, Kişisel, Teknik
- Kategori bazlı silme

### Adım 7: GPS Harita
- Leaflet.js (lightweight)
- OpenStreetMap tiles
- Marker ile konum

### Adım 8: Seçici Temizleme
- Checkbox'lar ile seçim
- "Tümünü seç/kaldır"
- Kategori bazlı seçim

### Adım 9: Progress & Animations
- Batch progress bar
- Drag hover efekti
- Temizleme animasyonu

### Adım 10: Final Polish
- Confetti
- Keyboard shortcuts
- Network monitor
- PWA ikonları
