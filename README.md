# 🛡️ MetaSafe

**Paylaşmadan Önce Temizle** | **Clean Before You Share**

Privacy-first, offline metadata cleaner for activists, journalists, and at-risk users.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-brightgreen.svg)](#installation)
[![Zero Upload](https://img.shields.io/badge/Upload-Zero-success.svg)](#privacy)

---

## 🎯 What is MetaSafe?

MetaSafe is a **100% client-side** tool that removes sensitive metadata from your photos and documents before sharing. All processing happens in your browser — **no files are ever uploaded to any server**.

### Why Does This Matter?

Every photo you take and document you create contains hidden metadata that can reveal:

| 📍 **Location** | 📱 **Device** | 👤 **Identity** | 🕐 **Time** |
|----------------|---------------|-----------------|-------------|
| GPS coordinates | Phone model | Your name | Creation date |
| Altitude | Camera serial | Username | Timezone |
| Direction | Software used | Email | Edit history |

This data can be used to track your movements, identify your devices, and compromise your safety.

---

## ✨ Features

### Core Features
- 🖼️ **Image Support**: JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC/HEIF (iPhone photos, decoded via bundled libheif WASM) with full EXIF/GPS/XMP removal
- 📄 **Document Support**: PDF, DOCX, XLSX, PPTX metadata cleaning — including **embedded photos inside the document** (see Deep Clean below)
- 📧 **Email Support**: .eml files — strips identifying headers (IP, mailer, routing) and deep-cleans image/PDF/Office attachments
- 🎵 **Audio Support**: MP3, WAV, M4A, FLAC (OGG intentionally not yet supported — see below)
- 🎬 **Video Support**: MP4/MOV — strips GPS, timestamps, and author metadata
- 🔒 **Zero Upload**: All processing happens locally in your browser, enforced by a strict Content-Security-Policy (not just a promise — see Privacy & Security)
- 📴 **Offline Ready**: Works without internet after first load (PWA)
- 🌐 **7 languages**: Turkish, English, Farsi, Arabic, Russian, Chinese, Urdu

### Deep Clean (recursive, not just top-level)
Most metadata cleaners only strip the file you hand them. If that file is a *container* — a Word document with a pasted screenshot, an SVG with an embedded photo, an email with a photo attached — the embedded media's own GPS/EXIF survives untouched. MetaSafe recurses into embedded media and re-cleans it with the same processor a standalone upload would get:
- **Office (DOCX/XLSX/PPTX):** every image under `*/media/*` is re-encoded
- **SVG:** every `<image href="data:...">` is re-encoded
- **EML:** every recognized image/PDF/Office attachment is re-cleaned in place

### Batch Correlation Risk (cross-file, not per-file)
Even when every file in a batch is individually clean, sharing several together can still deanonymize you: photos whose GPS points cluster within 2km reveal a "base of operations" (home/office), matching camera Make+Model+Serial across photos links them to one device, and a shared Author/Creator name links documents to one identity. MetaSafe checks the whole batch for these patterns and warns before you share — no single-file tool does this.

### Advanced Features
- 📊 **Risk Score**: Visual percentage-based danger assessment
- 📍 **GPS Map Preview**: See exactly where your photo was taken
- 📁 **Categorized Metadata**: Location, Device, Personal, Temporal, Technical
- ✅ **Verification**: Confirms metadata was successfully removed
- 🎨 **Theme Support**: Dark and Light modes
- 🎊 **Confetti Celebration**: When dangerous GPS data is removed!

### Privacy Features
- 🔐 No server uploads — ever
- 🌐 No analytics or tracking
- 💾 No data storage
- 🔄 No external API calls for file processing

---

## 🚀 Quick Start

### Local Development
```bash
# Clone the repository
git clone https://github.com/chndemirpence/metasafe.git
cd metasafe

# Start a local server (any static file server works — no build step)
python -m http.server 8080
# or
npx serve .

# Open in browser
open http://localhost:8080
```

### Install as PWA
1. Open MetaSafe in Chrome/Edge/Safari
2. Click the install icon in the address bar
3. Use offline anytime!

---

## 🔧 Supported Formats

| Format | Extension | Metadata Removed |
|--------|-----------|------------------|
| JPEG | .jpg, .jpeg | EXIF, IPTC, XMP, GPS, Device info |
| PNG | .png | tEXt, iTXt, zTXt chunks, ICC profile |
| WebP | .webp | EXIF, XMP |
| GIF | .gif | Comment extensions, sensitive Application extensions |
| SVG | .svg | `<metadata>`/RDF/Dublin Core, editor namespaces (Inkscape/Illustrator/Sketch), embedded raster images |
| TIFF | .tiff, .tif | Make/Model/Software/Artist, GPS IFD, EXIF IFD, MakerNote |
| HEIC/HEIF | .heic, .heif | Full EXIF/GPS (decoded via bundled libheif WASM, works on any browser — not just Safari) |
| PDF | .pdf | Author, Creator, Dates, Custom properties |
| Word / Excel / PowerPoint | .docx, .xlsx, .pptx | Author, Company, Revision history, **embedded photos** |
| Email | .eml | Received/routing IPs, mailer, Message-ID, **image/PDF/Office attachments** |
| Audio | .mp3, .wav, .m4a, .flac | ID3/RIFF-INFO/iTunes tags, Vorbis comments |
| Video | .mp4, .mov | GPS, creation/modification time, author/encoder |

**Not yet supported:** OGG Vorbis (the container's page/CRC framing makes an in-place metadata strip unsafe without a full rewrite — MetaSafe refuses to fake success and shows an explicit error instead) and RAW formats (CR2/NEF/ARW).

---

## 🏗️ Technical Architecture

```
MetaSafe/
├── index.html              # Main HTML, strict CSP
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline cache)
├── LICENSE                  # MIT
├── css/
│   └── style-futuristic.css
├── js/
│   ├── app.js               # Main application logic
│   ├── i18n.js               # Internationalization
│   ├── i18n/                 # tr, en, fa, ar, ru, zh, ur
│   ├── processors/           # One file per format (see Supported Formats)
│   │   ├── jpeg.js, png.js, webp.js, gif.js, svg.js, tiff.js, heic.js
│   │   ├── pdf.js, office.js, eml.js
│   │   └── audio.js, video.js
│   ├── workers/
│   │   └── metadata-worker.js   # Worker pool (JPEG/PNG/WebP/PDF/Office off the main thread)
│   ├── utils/
│   │   ├── certificate.js       # SHA-256 cleaning certificate
│   │   ├── qrcode.js            # Certificate QR code (no external library)
│   │   ├── gps-map.js           # Text-only coordinates — no map-tile fetch, on purpose
│   │   ├── screenshot-detector.js
│   │   ├── selective-cleaning.js
│   │   ├── url-cleaner.js       # Strips tracking params from shared links
│   │   ├── report-generator.js
│   │   ├── confetti.js
│   │   └── batch-correlation.js # Cross-file GPS/device/author correlation risk
│   └── ui/
│       └── toast.js
└── lib/                          # Vendored, no CDN/network dependency
    ├── piexif.js                 # EXIF reading/writing for JPEG
    ├── pdf-lib.min.js             # PDF manipulation
    ├── jszip.min.js               # ZIP/Office file handling
    └── libheif-bundle.mjs         # HEIC/HEIF decode (WASM, no eval — see CSP below)
```

### Dependencies
- **[piexif.js](https://github.com/hMatoba/piexifjs)** — EXIF reading/writing for JPEG
- **[pdf-lib](https://pdf-lib.js.org/)** — PDF manipulation
- **[JSZip](https://stuk.github.io/jszip/)** — ZIP/Office file handling
- **[libheif](https://github.com/strukturag/libheif)** (via `libheif-js`, WASM) — HEIC/HEIF decode on browsers without native support

All four are vendored under `lib/` — nothing is fetched from a CDN at runtime.

---

## 🌍 Internationalization

7 supported languages: Turkish (Türkçe), English, Farsi (فارسی), Arabic (العربية), Russian (Русский), Chinese (中文), Urdu (اردو).

### Adding a New Language

1. Create `js/i18n/[lang].json` based on `en.json`
2. Add the language button to `index.html`
3. Update `loadTranslations()` in `app.js`

---

## 🔐 Privacy & Security

### Our Commitment
MetaSafe is designed with privacy as the #1 priority — and these aren't just promises, they're enforced by a strict `Content-Security-Policy` (`default-src 'self'; connect-src 'self'`) that makes it technically impossible for the page to make an external network request:

1. **No Server**: Files never leave your device
2. **No Tracking**: No analytics, cookies, or fingerprinting
3. **No Storage**: Nothing is stored after you close the tab
4. **Open Source**: Full transparency — audit the code yourself
5. **No CDN**: Every dependency is vendored under `lib/` — nothing is fetched at runtime, so there's no third party to compromise later

### How It Works
1. You drop a file into the browser
2. JavaScript reads the file locally using FileReader API
3. Metadata is parsed and displayed
4. Clean file is generated in memory
5. You download the clean version
6. Original file is never modified

### Network Monitor
The app displays a live "0 network requests" counter to prove no data leaves your browser.

---

## 🤝 Contributing

We welcome contributions! MetaSafe is zero-dependency vanilla JS with no build step — clone it and open `index.html` behind any static file server.

```bash
git clone https://github.com/chndemirpence/metasafe.git
cd metasafe
python -m http.server 8080
```

### Areas for Contribution
- 🌐 New language translations
- 📄 Additional file format support
- 🎨 UI/UX improvements
- 📱 Mobile optimization
- 🧪 Test coverage
- 📖 Documentation

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [piexif.js](https://github.com/hMatoba/piexifjs) - EXIF library
- [pdf-lib](https://pdf-lib.js.org/) - PDF library
- [JSZip](https://stuk.github.io/jszip/) - ZIP/Office file handling
- [libheif](https://github.com/strukturag/libheif) - HEIC/HEIF decoding

---

## 📬 Contact

- **Issues**: [GitHub Issues](https://github.com/chndemirpence/metasafe/issues)

---

<p align="center">
  <strong>🛡️ Protect your privacy. Clean before you share.</strong>
</p>
