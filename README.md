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
- 🖼️ **Image Support**: JPEG, PNG, WebP with full EXIF/XMP removal
- 📄 **Document Support**: PDF, DOCX, XLSX, PPTX metadata cleaning
- 🔒 **Zero Upload**: All processing happens locally in your browser
- 📴 **Offline Ready**: Works without internet after first load (PWA)
- 🌐 **Multi-language**: Turkish and English (more coming)

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

### Online (Hosted)
Visit: **[metasafe.app](https://metasafe.app)** *(coming soon)*

### Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/metasafe.git
cd metasafe

# Start a local server
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

## 📸 Screenshots

### Dark Mode
![MetaSafe Dark Mode](docs/screenshot-dark.png)

### Light Mode  
![MetaSafe Light Mode](docs/screenshot-light.png)

### GPS Detection
![GPS Warning](docs/screenshot-gps.png)

---

## 🔧 Supported Formats

| Format | Extension | Metadata Removed |
|--------|-----------|------------------|
| JPEG | .jpg, .jpeg | EXIF, IPTC, XMP, GPS, Device info |
| PNG | .png | tEXt, iTXt, zTXt chunks |
| WebP | .webp | EXIF, XMP |
| PDF | .pdf | Author, Creator, Dates, Custom |
| Word | .docx | Author, Company, Revision history |
| Excel | .xlsx | Author, Company, Comments |
| PowerPoint | .pptx | Author, Company, Notes |

---

## 🏗️ Technical Architecture

```
MetaSafe/
├── index.html          # Main HTML
├── manifest.json       # PWA manifest
├── sw.js              # Service Worker
├── css/
│   └── style.css      # Dark/Light themes, responsive
├── js/
│   ├── app.js         # Main application logic
│   ├── i18n.js        # Internationalization
│   ├── i18n/
│   │   ├── tr.json    # Turkish
│   │   └── en.json    # English
│   ├── processors/
│   │   ├── jpeg.js    # JPEG/EXIF processing
│   │   ├── png.js     # PNG processing
│   │   ├── webp.js    # WebP processing
│   │   ├── pdf.js     # PDF processing
│   │   └── office.js  # DOCX/XLSX/PPTX processing
│   └── ui/
│       └── toast.js   # Notifications
└── lib/
    ├── piexif.js      # EXIF manipulation
    ├── pdf-lib.min.js # PDF manipulation
    └── jszip.min.js   # Office file manipulation
```

### Dependencies
- **[piexif.js](https://github.com/hMatoba/piexifjs)** - EXIF reading/writing for JPEG
- **[pdf-lib](https://pdf-lib.js.org/)** - PDF manipulation
- **[JSZip](https://stuk.github.io/jszip/)** - ZIP/Office file handling
- **[Leaflet](https://leafletjs.com/)** - GPS map visualization

---

## 🌍 Internationalization

Currently supported languages:
- 🇹🇷 Turkish (Türkçe)
- 🇬🇧 English

### Adding a New Language

1. Create `js/i18n/[lang].json` based on `en.json`
2. Add the language button to `index.html`
3. Update `loadTranslations()` in `app.js`

---

## 🔐 Privacy & Security

### Our Commitment
MetaSafe is designed with privacy as the #1 priority:

1. **No Server**: Files never leave your device
2. **No Tracking**: No analytics, cookies, or fingerprinting
3. **No Storage**: Nothing is stored after you close the tab
4. **Open Source**: Full transparency — audit the code yourself

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

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
# Clone
git clone https://github.com/yourusername/metasafe.git

# Install dev dependencies (optional, for linting)
npm install

# Run tests
npm test

# Start dev server
npm start
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

- [Open Technology Fund](https://opentech.fund) - For supporting internet freedom
- [piexif.js](https://github.com/hMatoba/piexifjs) - EXIF library
- [pdf-lib](https://pdf-lib.js.org/) - PDF library
- [Leaflet](https://leafletjs.com/) - Map library

---

## 📬 Contact

- **Issues**: [GitHub Issues](https://github.com/yourusername/metasafe/issues)
- **Email**: security@metasafe.app

---

<p align="center">
  <strong>🛡️ Protect your privacy. Clean before you share.</strong>
</p>
