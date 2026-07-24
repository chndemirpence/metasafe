/**
 * MetaSafe - Privacy-First Metadata Cleaner
 * Main Application Module v3.0
 */

import { readJpegMetadata, cleanJpegMetadata, isJpeg } from './processors/jpeg.js';
import { readPngMetadata, cleanPngMetadata, isPng } from './processors/png.js';
import { readWebpMetadata, cleanWebpMetadata, isWebp } from './processors/webp.js';
import { readPdfMetadata, cleanPdfMetadata, isPdf } from './processors/pdf.js';
import { readOfficeMetadata, cleanOfficeMetadata, isOffice, getOfficeType } from './processors/office.js';
import { readVideoMetadata, cleanVideoMetadata, isVideo } from './processors/video.js';
import { readAudioMetadata, cleanAudioMetadata, isAudio } from './processors/audio.js';
import { CleaningCertificate } from './utils/certificate.js';
import { QRCode } from './utils/qrcode.js';
import { cleanURL, analyzeURL } from './utils/url-cleaner.js';
import { detectScreenshot, getScreenshotRecommendations } from './utils/screenshot-detector.js';
import { isSVG, readSVGMetadata, cleanSVGMetadata } from './processors/svg.js';
import { isGIF, readGIFMetadata, cleanGIFMetadata } from './processors/gif.js';
import { isEML, readEMLMetadata, cleanEMLMetadata } from './processors/eml.js';
import { isHEIC, readHEICMetadata, cleanHEICMetadata } from './processors/heic.js';
import { isTIFF, readTIFFMetadata, cleanTIFFMetadata } from './processors/tiff.js';
import { showGPSOnMap, createGPSBadgeHTML, initGPSMapModal } from './utils/gps-map.js';
import { generateReportData, downloadTXTReport } from './utils/report-generator.js';
import { celebrateCleaning, celebrateSingleFile } from './utils/confetti.js';
import { getCleaningSelection, generateSelectiveCleaningHTML } from './utils/selective-cleaning.js';

// Initialize certificate generator
const certificateGen = new CleaningCertificate();

// ===== Worker Pool =====
const workerPool = {
  workers: [],
  queue: [],
  maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 4),
  idCounter: 0,
  pendingJobs: new Map(), // id -> { resolve, reject }
  
  init() {
    try {
      for (let i = 0; i < this.maxWorkers; i++) {
        const w = new Worker('/js/workers/metadata-worker.js');
        w.busy = false;
        w.onmessage = (e) => this._handleMessage(w, e.data);
        w.onerror = (e) => console.warn('Worker error:', e.message);
        this.workers.push(w);
      }
      console.log(`Worker pool: ${this.workers.length} workers ready`);
    } catch (err) {
      console.warn('Workers not supported, using main thread:', err.message);
    }
  },
  
  _handleMessage(worker, data) {
    const job = this.pendingJobs.get(data.id);
    if (job) {
      this.pendingJobs.delete(data.id);
      if (data.error) {
        job.reject(new Error(data.error));
      } else {
        job.resolve(data.result);
      }
    }
    worker.busy = false;
    this._processQueue();
  },
  
  _processQueue() {
    if (this.queue.length === 0) return;
    const worker = this.workers.find(w => !w.busy);
    if (!worker) return;
    
    const { message, transfer, id } = this.queue.shift();
    worker.busy = true;
    worker.postMessage(message, transfer || []);
  },
  
  /** 
   * Send a task to the worker pool. Returns a Promise.
   * For 'clean' action, fileBuffer ownership is transferred (zero-copy).
   */
  dispatch(action, fileBuffer, fileType, fileName) {
    const id = ++this.idCounter;
    const message = { id, action, fileBuffer, fileType, fileName };
    const transfer = action === 'clean' ? [fileBuffer] : [];
    
    return new Promise((resolve, reject) => {
      this.pendingJobs.set(id, { resolve, reject });
      
      const worker = this.workers.find(w => !w.busy);
      if (worker) {
        worker.busy = true;
        worker.postMessage(message, transfer);
      } else {
        this.queue.push({ message, transfer, id });
      }
    });
  },
  
  /** Check if worker pool is available */
  get available() {
    return this.workers.length > 0;
  }
};

// ===== State Management =====
const state = {
  files: new Map(), // fileId -> fileData
  results: new Map(), // fileId -> cleanedData
  language: 'tr',
  theme: 'dark',
  networkRequests: 0,
  options: {
    compress: false,
    quality: 85,
    paranoid: false,
    safeShare: false
  }
};

// ===== Translations =====
let translations = {};

// ===== Toast System =====
class Toast {
  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 4000) {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    // Use textContent for message to prevent XSS via malicious filenames/metadata
    toast.innerHTML = `
      <span class="toast-icon"></span>
      <span class="toast-message"></span>
      <button class="toast-close" aria-label="Kapat">×</button>
    `;
    toast.querySelector('.toast-icon').textContent = icons[type] || icons.info;
    toast.querySelector('.toast-message').textContent = message;
    
    toast.querySelector('.toast-close').addEventListener('click', () => this.dismiss(toast));
    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    
    if (duration > 0) setTimeout(() => this.dismiss(toast), duration);
    return toast;
  }

  dismiss(toast) {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }

  success(msg, dur) { return this.show(msg, 'success', dur); }
  error(msg, dur) { return this.show(msg, 'error', dur); }
  warning(msg, dur) { return this.show(msg, 'warning', dur); }
  info(msg, dur) { return this.show(msg, 'info', dur); }
}

const toast = new Toast();

// ===== i18n System =====
const RTL_LANGUAGES = ['fa', 'ar', 'he', 'ur'];

async function loadTranslations() {
  try {
    const [tr, en, fa, ar, ru, zh, ur] = await Promise.all([
      fetch('/js/i18n/tr.json').then(r => r.json()),
      fetch('/js/i18n/en.json').then(r => r.json()),
      fetch('/js/i18n/fa.json').then(r => r.json()),
      fetch('/js/i18n/ar.json').then(r => r.json()),
      fetch('/js/i18n/ru.json').then(r => r.json()),
      fetch('/js/i18n/zh.json').then(r => r.json()),
      fetch('/js/i18n/ur.json').then(r => r.json())
    ]);
    translations = { tr, en, fa, ar, ru, zh, ur };
    
    // Detect language
    const saved = localStorage.getItem('metasafe-lang');
    const browser = navigator.language.split('-')[0];
    state.language = saved || (translations[browser] ? browser : 'tr');
    
    updateLanguageUI();
  } catch (e) {
    console.error('Failed to load translations:', e);
  }
}

function t(key, params = {}) {
  const keys = key.split('.');
  let value = translations[state.language];
  for (const k of keys) {
    value = value?.[k];
  }
  if (!value) return key;
  
  for (const [p, v] of Object.entries(params)) {
    value = value.replace(`{${p}}`, v);
  }
  return value;
}

function setLanguage(lang) {
  if (!translations[lang]) return;
  state.language = lang;
  localStorage.setItem('metasafe-lang', lang);
  updateLanguageUI();
  
  // Show toast in the new language
  const toastMsg = t('toast.languageChanged');
  toast.success(toastMsg);
}

function updateLanguageUI() {
  // Update RTL direction
  const isRTL = RTL_LANGUAGES.includes(state.language);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = state.language;
  
  // Update all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  
  // Update buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === state.language);
  });
  
  // Update title
  document.title = `MetaSafe - ${t('app.tagline')}`;
}

// ===== Theme System =====
function initTheme() {
  const saved = localStorage.getItem('metasafe-theme') || 'dark';
  setTheme(saved);
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('metasafe-theme', theme);
  
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// ===== File Type Detection =====
function getFileType(file) {
  if (isJpeg(file)) return 'jpeg';
  if (isPng(file)) return 'png';
  if (isWebp(file)) return 'webp';
  if (isSVG(file)) return 'svg';
  if (isGIF(file)) return 'gif';
  if (isEML(file)) return 'eml';
  if (isHEIC(file)) return 'heic';
  if (isTIFF(file)) return 'tiff';
  if (isPdf(file)) return 'pdf';
  if (isOffice(file)) return getOfficeType(file);
  if (isVideo(file)) return 'video';
  if (isAudio(file)) return 'audio';
  return 'unknown';
}

function getFileIcon(type) {
  const icons = {
    jpeg: '🖼️', png: '🖼️', webp: '🖼️', svg: '🎨', gif: '🎞️', eml: '📧', heic: '📱', tiff: '🖼️',
    pdf: '📄', docx: '📝', xlsx: '📊', pptx: '📽️',
    video: '🎬',
    audio: '🎵',
    unknown: '📁'
  };
  return icons[type] || icons.unknown;
}

// ===== Risk Score Calculation =====
function calculateRiskScore(metadata) {
  if (!metadata?.items?.length) return { score: 0, level: 'low', label: 'Güvenli' };
  
  let score = 0;
  const weights = { high: 35, medium: 15, low: 5 };
  
  for (const item of metadata.items) {
    score += weights[item.risk] || 5;
  }
  
  // Cap at 100
  score = Math.min(score, 100);
  
  let level, label;
  if (score >= 70) { level = 'critical'; label = 'Kritik Risk'; }
  else if (score >= 50) { level = 'high'; label = 'Yüksek Risk'; }
  else if (score >= 25) { level = 'medium'; label = 'Orta Risk'; }
  else { level = 'low'; label = 'Düşük Risk'; }
  
  return { score, level, label };
}

// ===== Metadata Categorization =====
function categorizeMetadata(items) {
  const categories = {
    location: { icon: '📍', label: 'Konum Bilgisi', items: [] },
    device: { icon: '📱', label: 'Cihaz Bilgisi', items: [] },
    personal: { icon: '👤', label: 'Kişisel Bilgi', items: [] },
    temporal: { icon: '🕐', label: 'Zaman Bilgisi', items: [] },
    technical: { icon: '⚙️', label: 'Teknik Bilgi', items: [] }
  };
  
  const locationKeys = ['gps', 'latitude', 'longitude', 'altitude', 'location'];
  const deviceKeys = ['make', 'model', 'software', 'lens', 'serial', 'camera'];
  const personalKeys = ['author', 'creator', 'artist', 'copyright', 'owner', 'lastmodifiedby'];
  const temporalKeys = ['date', 'time', 'created', 'modified'];
  
  for (const item of items) {
    const keyLower = item.key.toLowerCase();
    
    if (locationKeys.some(k => keyLower.includes(k))) {
      categories.location.items.push(item);
    } else if (deviceKeys.some(k => keyLower.includes(k))) {
      categories.device.items.push(item);
    } else if (personalKeys.some(k => keyLower.includes(k))) {
      categories.personal.items.push(item);
    } else if (temporalKeys.some(k => keyLower.includes(k))) {
      categories.temporal.items.push(item);
    } else {
      categories.technical.items.push(item);
    }
  }
  
  return categories;
}

// ===== GPS Coordinate Parsing =====
function parseGPSCoordinates(metadata) {
  if (!metadata?.items) return null;
  
  let lat = null, lon = null;
  
  for (const item of metadata.items) {
    const key = item.key.toLowerCase();
    const value = item.value;
    
    if (key.includes('latitude') && !key.includes('ref')) {
      lat = parseFloat(value) || extractCoordinate(value);
    }
    if (key.includes('longitude') && !key.includes('ref')) {
      lon = parseFloat(value) || extractCoordinate(value);
    }
  }
  
  if (lat !== null && lon !== null) {
    return { lat, lon };
  }
  return null;
}

function extractCoordinate(value) {
  // Handle DMS format: "41° 0' 53.93"" or similar
  const match = String(value).match(/(\d+)[°]\s*(\d+)[\']\s*([\d.]+)/);
  if (match) {
    return parseFloat(match[1]) + parseFloat(match[2])/60 + parseFloat(match[3])/3600;
  }
  return null;
}

// ===== File Processing =====
async function processFile(file) {
  const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const fileType = getFileType(file);
  
  if (fileType === 'unknown') {
    toast.error(t('errors.unsupportedFile') + `: ${file.name}`);
    return null;
  }
  
  const fileData = {
    id: fileId,
    file,
    name: file.name,
    size: file.size,
    type: fileType,
    status: 'reading',
    metadata: null,
    riskScore: null,
    gpsCoords: null,
    thumbnail: null
  };
  
  state.files.set(fileId, fileData);
  renderFileCard(fileData);
  
  try {
    // Create thumbnail for images
    if (['jpeg', 'png', 'webp'].includes(fileType)) {
      fileData.thumbnail = await createThumbnail(file);
    }
    
    // Read metadata
    let metadata;
    switch (fileType) {
      case 'jpeg': metadata = await readJpegMetadata(file); break;
      case 'png': metadata = await readPngMetadata(file); break;
      case 'webp': metadata = await readWebpMetadata(file); break;
      case 'svg': metadata = await readSVGMetadata(file); break;
      case 'gif': metadata = await readGIFMetadata(file); break;
      case 'eml': metadata = await readEMLMetadata(file); break;
      case 'heic': metadata = await readHEICMetadata(file); break;
      case 'tiff': metadata = await readTIFFMetadata(file); break;
      case 'pdf': metadata = await readPdfMetadata(file); break;
      case 'docx':
      case 'xlsx':
      case 'pptx': metadata = await readOfficeMetadata(file); break;
      case 'video': metadata = await readVideoMetadata(file); break;
      case 'audio': metadata = await readAudioMetadata(file); break;
    }
    
    fileData.metadata = metadata;
    fileData.riskScore = calculateRiskScore(metadata);
    fileData.gpsCoords = parseGPSCoordinates(metadata);
    
    // Screenshot detection for images
    if (['jpeg', 'png', 'webp'].includes(fileType)) {
      const screenshotResult = detectScreenshot(file, metadata);
      fileData.isScreenshot = screenshotResult.isScreenshot;
      fileData.screenshotInfo = screenshotResult;
      
      if (screenshotResult.isScreenshot) {
        fileData.riskScore = Math.max(fileData.riskScore, 60); // Increase risk for screenshots
      }
    }
    
    fileData.status = 'ready';
    
    updateFileCard(fileData);
    
    if (fileData.gpsCoords) {
      toast.warning(`⚠️ ${file.name}: GPS konum verisi bulundu!`);
    }
    
    // Screenshot warning
    if (fileData.isScreenshot) {
      toast.warning(`📱 ${file.name}: Screenshot tespit edildi - cihaz bilgisi içerebilir!`);
    }
    
    return fileData;
  } catch (err) {
    console.error('Process error:', err);
    fileData.status = 'error';
    fileData.error = err.message;
    updateFileCard(fileData);
    toast.error(`${file.name}: ${t('errors.readFailed')}`);
    return null;
  }
}

async function createThumbnail(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ===== Clean File =====
async function cleanFile(fileId) {
  const fileData = state.files.get(fileId);
  if (!fileData) return;
  
  fileData.status = 'cleaning';
  updateFileCard(fileData);
  
  try {
    let cleanBlob;
    switch (fileData.type) {
      case 'jpeg': cleanBlob = await cleanJpegMetadata(fileData.file); break;
      case 'png': cleanBlob = await cleanPngMetadata(fileData.file); break;
      case 'webp': cleanBlob = await cleanWebpMetadata(fileData.file); break;
      case 'svg': cleanBlob = await cleanSVGMetadata(fileData.file); break;
      case 'gif': cleanBlob = await cleanGIFMetadata(fileData.file); break;
      case 'eml': cleanBlob = await cleanEMLMetadata(fileData.file); break;
      case 'heic': cleanBlob = await cleanHEICMetadata(fileData.file); break;
      case 'tiff': cleanBlob = await cleanTIFFMetadata(fileData.file); break;
      case 'pdf': cleanBlob = await cleanPdfMetadata(fileData.file); break;
      case 'docx':
      case 'xlsx':
      case 'pptx': cleanBlob = await cleanOfficeMetadata(fileData.file); break;
      case 'video': 
        const videoResult = await cleanVideoMetadata(fileData.file);
        cleanBlob = videoResult.file;
        break;
      case 'audio': cleanBlob = await cleanAudioMetadata(fileData.file); break;
    }
    
    // Apply Paranoid mode (canvas re-encode for guaranteed clean)
    if (state.options.paranoid && ['jpeg', 'png', 'webp'].includes(fileData.type)) {
      cleanBlob = await paranoidReEncode(cleanBlob, fileData.type, state.options.quality);
    }
    
    // Apply Compress mode (reduce file size)
    if (state.options.compress && ['jpeg', 'png', 'webp'].includes(fileData.type)) {
      cleanBlob = await compressImage(cleanBlob, fileData.type, state.options.quality);
    }
    
    // Apply Safe Share mode (randomize size to break fingerprinting)
    if (state.options.safeShare && ['jpeg', 'png', 'webp'].includes(fileData.type)) {
      cleanBlob = await safeShareProcess(cleanBlob, fileData.type);
    }
    
    // Verify cleaning
    const cleanFile = new File([cleanBlob], fileData.name, { type: fileData.file.type });
    let verifyMetadata;
    switch (fileData.type) {
      case 'jpeg': verifyMetadata = await readJpegMetadata(cleanFile); break;
      case 'png': verifyMetadata = await readPngMetadata(cleanFile); break;
      case 'webp': verifyMetadata = await readWebpMetadata(cleanFile); break;
      case 'pdf': verifyMetadata = await readPdfMetadata(cleanFile); break;
      case 'docx':
      case 'xlsx':
      case 'pptx': verifyMetadata = await readOfficeMetadata(cleanFile); break;
      case 'audio': verifyMetadata = await readAudioMetadata(cleanFile); break;
    }
    
    const verified = !verifyMetadata?.items?.length || 
                     verifyMetadata.items.filter(i => i.risk === 'high').length === 0;
    
    const result = {
      id: fileId,
      originalName: fileData.name,
      // Safe Share: anonymize filename (keep extension only)
      cleanedName: state.options.safeShare 
        ? `metasafe_${Date.now().toString(36)}.${fileData.name.split('.').pop()}`
        : fileData.name,
      originalSize: fileData.size,
      cleanedBlob: cleanBlob,
      cleanedSize: cleanBlob.size,
      verified,
      metadataRemoved: fileData.metadata?.items?.length || 0,
      metadataRemaining: verifyMetadata?.items?.length || 0,
      originalMetadata: fileData.metadata?.items || [],
      verifyMetadata: verifyMetadata?.items || [],
      certificate: null
    };
    
    // Generate cleaning certificate
    try {
      const cert = await certificateGen.generate(
        fileData.file,
        cleanBlob,
        fileData.metadata,
        fileData.metadata?.items || []
      );
      result.certificate = cert;
    } catch (certErr) {
      console.warn('Certificate generation failed:', certErr);
    }
    
    state.results.set(fileId, result);
    fileData.status = 'done';
    updateFileCard(fileData);
    renderResult(result);
    
    toast.success(`✓ ${fileData.name} temizlendi${verified ? ' ve doğrulandı' : ''}`);
    
    // Confetti for cleaned files
    if (verified) {
      celebrateSingleFile(document.getElementById(`file-${fileId}`));
    }
    
    return result;
  } catch (err) {
    console.error('Clean error:', err);
    fileData.status = 'error';
    fileData.error = err.message;
    updateFileCard(fileData);
    toast.error(`${fileData.name}: ${t('errors.cleanFailed')}`);
    return null;
  }
}

// ===== Clean All Files =====
async function cleanAllFiles() {
  const files = Array.from(state.files.values()).filter(f => f.status === 'ready');
  if (!files.length) {
    toast.info('Temizlenecek dosya yok');
    return;
  }
  
  // Disable button during processing
  const cleanBtn = document.getElementById('clean-all-btn');
  if (cleanBtn) {
    cleanBtn.disabled = true;
    cleanBtn.innerHTML = `<span>⏳ İşleniyor... (0/${files.length})</span>`;
  }
  
  showProgress(0, files.length);
  let totalSaved = 0;
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const originalSize = files[i].size;
    try {
      await cleanFile(files[i].id);
      const result = state.results.get(files[i].id);
      if (result) {
        totalSaved += originalSize - result.cleanedSize;
        successCount++;
      }
    } catch (err) {
      failCount++;
      console.warn(`Failed to clean ${files[i].name}:`, err);
    }
    showProgress(i + 1, files.length);
    if (cleanBtn) cleanBtn.innerHTML = `<span>⏳ İşleniyor... (${i + 1}/${files.length})</span>`;
  }
  
  hideProgress();
  
  // Re-enable button
  if (cleanBtn) {
    cleanBtn.disabled = false;
    cleanBtn.innerHTML = `<span data-i18n="actions.cleanAll">🧹 Tüm Dosyaları Temizle</span>`;
  }
  
  // Show batch summary
  const savedStr = formatFileSize(totalSaved);
  if (failCount === 0) {
    toast.success(`✨ ${successCount} dosya temizlendi! Toplam ${savedStr} tasarruf.`);
  } else {
    toast.info(`${successCount} başarılı, ${failCount} hata. ${savedStr} tasarruf.`);
  }
  
  // Show batch summary badge
  showBatchSummary(successCount, failCount, totalSaved);
  
  // Big celebration for batch cleaning
  if (successCount >= 2) {
    celebrateCleaning();
  }
}

// ===== Batch Summary Badge =====
function showBatchSummary(success, fail, savedBytes) {
  let badge = document.getElementById('batch-summary');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'batch-summary';
    badge.className = 'batch-summary glass-card';
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) resultsSection.prepend(badge);
  }
  
  badge.innerHTML = `
    <div class="batch-stats">
      <div class="batch-stat">
        <span class="batch-stat-value">${success}</span>
        <span class="batch-stat-label">Temizlendi</span>
      </div>
      ${fail > 0 ? `
      <div class="batch-stat batch-stat-fail">
        <span class="batch-stat-value">${fail}</span>
        <span class="batch-stat-label">Hata</span>
      </div>
      ` : ''}
      <div class="batch-stat">
        <span class="batch-stat-value">${formatFileSize(savedBytes)}</span>
        <span class="batch-stat-label">Tasarruf</span>
      </div>
      ${state.options.paranoid ? '<div class="batch-stat"><span class="batch-stat-value">🔒</span><span class="batch-stat-label">Paranoid</span></div>' : ''}
      ${state.options.safeShare ? '<div class="batch-stat"><span class="batch-stat-value">🛡️</span><span class="batch-stat-label">Güvenli</span></div>' : ''}
    </div>
  `;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ===== Progress Bar =====
function showProgress(current, total) {
  let container = document.getElementById('progress-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'progress-container';
    container.className = 'progress-container';
    container.innerHTML = `
      <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
      <div class="progress-text">
        <span class="progress-current">0 / ${total}</span>
        <span class="progress-percent">0%</span>
      </div>
    `;
    document.querySelector('.file-list-header')?.after(container);
  }
  
  const percent = Math.round((current / total) * 100);
  container.querySelector('.progress-fill').style.width = `${percent}%`;
  container.querySelector('.progress-current').textContent = `${current} / ${total}`;
  container.querySelector('.progress-percent').textContent = `${percent}%`;
}

function hideProgress() {
  document.getElementById('progress-container')?.remove();
}

// ===== Confetti Effect =====
function triggerConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  
  const colors = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'];
  
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(confetti);
  }
  
  setTimeout(() => container.remove(), 3500);
}

// ===== UI Rendering =====
function renderFileCard(fileData) {
  const container = document.getElementById('file-list');
  if (!container) return;
  
  // Show file list section
  document.getElementById('file-list-section')?.classList.remove('hidden');
  
  // Show processing options and action buttons
  const optionsPanel = document.getElementById('processing-options');
  const actionsPanel = document.getElementById('actions');
  if (optionsPanel) optionsPanel.style.display = '';
  if (actionsPanel) actionsPanel.style.display = '';
  
  const card = document.createElement('div');
  card.id = `file-${fileData.id}`;
  card.className = 'file-card';
  card.innerHTML = getFileCardHTML(fileData);
  
  container.appendChild(card);
  bindFileCardEvents(card, fileData.id);
}

function updateFileCard(fileData) {
  const card = document.getElementById(`file-${fileData.id}`);
  if (!card) return;
  
  card.innerHTML = getFileCardHTML(fileData);
  bindFileCardEvents(card, fileData.id);
}

function getFileCardHTML(fileData) {
  const { id, name, size, type, status, metadata, riskScore, gpsCoords, thumbnail, isScreenshot, screenshotInfo } = fileData;
  
  const statusLabels = {
    reading: '📖 Okunuyor...',
    ready: '✓ Hazır',
    cleaning: '🔄 Temizleniyor...',
    done: '✅ Temizlendi',
    error: '❌ Hata'
  };
  
  let metadataHTML = '';
  if (metadata?.items?.length) {
    const categories = categorizeMetadata(metadata.items);
    
    // Screenshot badge
    const screenshotBadge = isScreenshot ? `
      <div class="screenshot-badge">
        <span class="badge-icon">📱</span>
        <span class="badge-text">Screenshot Tespit Edildi</span>
        ${screenshotInfo?.platform ? `<span class="badge-platform">(${escapeHtml(screenshotInfo.platform)})</span>` : ''}
      </div>
    ` : '';
    
    metadataHTML = `
      <div class="file-metadata">
        ${screenshotBadge}
        <div class="risk-score-container">
          <span class="risk-score risk-score-${riskScore.level}">${riskScore.label}: %${riskScore.score}</span>
          <div class="risk-meter risk-meter-${riskScore.level}">
            <div class="risk-meter-fill" style="width: ${riskScore.score}%"></div>
          </div>
        </div>
        
        ${gpsCoords ? `
          <div class="gps-preview">
            <div class="gps-warning">📍 GPS Konum Verisi Bulundu!</div>
            <div class="gps-coords">Lat: ${gpsCoords.lat.toFixed(6)}, Lon: ${gpsCoords.lon.toFixed(6)}</div>
            <span class="gps-warning-badge" data-action="show-gps" data-lat="${gpsCoords.lat}" data-lon="${gpsCoords.lon}">
              🗺️ Haritada Göster
            </span>
          </div>
        ` : ''}
        
        <div class="metadata-categories">
          ${Object.entries(categories)
            .filter(([_, cat]) => cat.items.length > 0)
            .map(([key, cat]) => `
              <div class="metadata-category" data-category="${key}">
                <div class="metadata-category-header">
                  <span class="metadata-category-title">
                    <span class="metadata-category-icon">${cat.icon}</span>
                    ${cat.label}
                  </span>
                  <span class="metadata-category-count">${cat.items.length}</span>
                  <span class="metadata-category-chevron">▼</span>
                </div>
                <div class="metadata-category-items">
                  ${cat.items.map(item => `
                    <div class="metadata-item metadata-${item.risk}">
                      <span class="metadata-key">${escapeHtml(item.label || item.key)}</span>
                      <span class="metadata-value">${escapeHtml(item.value)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  } else if (status === 'ready') {
    metadataHTML = `
      <div class="file-metadata">
        <div class="no-metadata">✓ Metadata bulunamadı - Dosya güvenli</div>
      </div>
    `;
  }
  
  return `
    <div class="file-preview">
      ${thumbnail ? `<img src="${thumbnail}" alt="${escapeHtml(name)}">` : `<span class="file-icon">${getFileIcon(type)}</span>`}
    </div>
    <div class="file-info">
      <div class="file-name">${escapeHtml(name)}</div>
      <div class="file-details">
        <span class="file-size">${formatSize(size)}</span>
        <span class="file-type">${type.toUpperCase()}</span>
        <span class="file-status status-${status}">${statusLabels[status]}</span>
      </div>
    </div>
    <div class="file-actions">
      ${status === 'ready' ? `
        <button class="btn btn-primary btn-clean" data-id="${id}">🧹 Temizle</button>
      ` : ''}
      <button class="btn btn-secondary btn-remove" data-id="${id}">🗑️ Kaldır</button>
    </div>
    ${metadataHTML}
  `;
}

function bindFileCardEvents(card, fileId) {
  // Clean button
  card.querySelector('.btn-clean')?.addEventListener('click', () => cleanFile(fileId));
  
  // Remove button
  card.querySelector('.btn-remove')?.addEventListener('click', () => removeFile(fileId));
  
  // Category toggles
  card.querySelectorAll('.metadata-category-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('expanded');
    });
  });
  
  // Initialize map if GPS coords
  const fileData = state.files.get(fileId);
  if (fileData?.gpsCoords) {
    initMap(fileId, fileData.gpsCoords);
  }
}

function initMap(fileId, coords) {
  // Privacy: no online map. Show coordinates as text only so the photo's location is
  // never sent to a third-party tile server. (Was a Leaflet/OpenStreetMap leak.)
  const mapContainer = document.getElementById(`map-${fileId}`);
  if (!mapContainer || !coords) return;
  mapContainer.textContent = `📍 ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`;
}

function removeFile(fileId) {
  state.files.delete(fileId);
  state.results.delete(fileId);
  document.getElementById(`file-${fileId}`)?.remove();
  
  if (state.files.size === 0) {
    document.getElementById('file-list-section')?.classList.add('hidden');
  }
}

function renderResult(result) {
  const container = document.getElementById('results-list');
  if (!container) return;
  
  document.getElementById('results-section')?.classList.remove('hidden');
  
  const sizeSaved = result.originalSize - result.cleanedSize;
  const sizePercent = result.originalSize > 0 ? Math.round((sizeSaved / result.originalSize) * 100) : 0;
  
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="result-info">
      <div class="result-name">${escapeHtml(result.originalName)}</div>
      <div class="result-comparison">
        <span class="result-before">${formatSize(result.originalSize)}</span>
        <span class="result-arrow">→</span>
        <span class="result-after">${formatSize(result.cleanedSize)}</span>
        ${sizeSaved > 0 ? `<span class="result-saved">(-${sizePercent}%)</span>` : ''}
      </div>
      <div class="verification-badge ${result.verified ? '' : 'failed'}">
        ${result.verified 
          ? `✓ Doğrulandı: ${result.metadataRemoved} metadata silindi, ${result.metadataRemaining} kaldı` 
          : `⚠ ${result.metadataRemaining} metadata kalmış olabilir`}
      </div>
      ${result.certificate ? `
        <div class="certificate-info">
          <span class="cert-badge">🔐 SHA-256: ${result.certificate.cleaned.sha256.substring(0, 16)}...</span>
        </div>
      ` : ''}
    </div>
    <div class="result-actions">
      <button class="btn btn-primary" data-action="download" data-id="${result.id}">💾 İndir</button>
      <button class="btn btn-outline" data-action="verify-detail" data-id="${result.id}">📋 Doğrulama</button>
      ${result.certificate ? `
        <button class="btn btn-outline" data-action="cert" data-id="${result.id}">📜 Sertifika</button>
        <button class="btn btn-outline" data-action="qr" data-id="${result.id}">📱 QR</button>
      ` : ''}
    </div>
  `;

  container.appendChild(card);
}

// ===== Download =====
window.downloadFile = function(fileId) {
  const result = state.results.get(fileId);
  if (!result) return;
  
  const url = URL.createObjectURL(result.cleanedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clean_${result.originalName}`;
  a.click();
  URL.revokeObjectURL(url);
  
  toast.success(`${result.originalName} indirildi`);
};

window.downloadCertificate = function(fileId) {
  const result = state.results.get(fileId);
  if (!result || !result.certificate) return;
  
  // Generate both JSON and readable text versions
  const cert = result.certificate;
  const readableText = certificateGen.generateReadable(cert);
  
  // Download JSON certificate
  const jsonBlob = new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const jsonA = document.createElement('a');
  jsonA.href = jsonUrl;
  jsonA.download = `metasafe_certificate_${result.originalName}.json`;
  jsonA.click();
  URL.revokeObjectURL(jsonUrl);
  
  // Also download readable text version
  setTimeout(() => {
    const txtBlob = new Blob([readableText], { type: 'text/plain' });
    const txtUrl = URL.createObjectURL(txtBlob);
    const txtA = document.createElement('a');
    txtA.href = txtUrl;
    txtA.download = `metasafe_certificate_${result.originalName}.txt`;
    txtA.click();
    URL.revokeObjectURL(txtUrl);
  }, 100);
  
  toast.success('📜 Sertifika indirildi (JSON + TXT)');
};

// ===== Download All as ZIP =====
window.downloadAllAsZip = async function() {
  const results = Array.from(state.results.values());
  if (!results.length) {
    toast.info('İndirilecek dosya yok');
    return;
  }
  
  toast.info('📦 ZIP dosyası hazırlanıyor...');
  
  try {
    const zip = new JSZip();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    // Add cleaned files
    const filesFolder = zip.folder('cleaned_files');
    for (const result of results) {
      filesFolder.file(`clean_${result.originalName}`, result.cleanedBlob);
    }
    
    // Add certificates
    const certsFolder = zip.folder('certificates');
    for (const result of results) {
      if (result.certificate) {
        const certJson = JSON.stringify(result.certificate, null, 2);
        certsFolder.file(`certificate_${result.originalName}.json`, certJson);
        
        const certTxt = certificateGen.generateReadable(result.certificate);
        certsFolder.file(`certificate_${result.originalName}.txt`, certTxt);
      }
    }
    
    // Add summary report
    const summary = generateBatchSummary(results);
    zip.file('METASAFE_SUMMARY.txt', summary);
    
    // Generate ZIP
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, (metadata) => {
      // Progress callback
      if (metadata.percent) {
        console.log(`ZIP progress: ${metadata.percent.toFixed(0)}%`);
      }
    });
    
    // Download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metasafe_cleaned_${timestamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(`📦 ${results.length} dosya ZIP olarak indirildi!`);
  } catch (e) {
    console.error('ZIP generation failed:', e);
    toast.error('ZIP oluşturulamadı');
  }
};

function generateBatchSummary(results) {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                  METASAFE BATCH CLEANING REPORT                ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Tool: MetaSafe v3.0`,
    `Total Files Processed: ${results.length}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                         FILE SUMMARY                          ',
    '───────────────────────────────────────────────────────────────',
    ''
  ];
  
  let totalOriginalSize = 0;
  let totalCleanedSize = 0;
  let verifiedCount = 0;
  
  results.forEach((result, index) => {
    totalOriginalSize += result.originalSize;
    totalCleanedSize += result.cleanedSize;
    if (result.verified) verifiedCount++;
    
    lines.push(`${index + 1}. ${result.originalName}`);
    lines.push(`   Original: ${formatSize(result.originalSize)} → Cleaned: ${formatSize(result.cleanedSize)}`);
    lines.push(`   Status: ${result.verified ? '✓ Verified' : '⚠ Check manually'}`);
    if (result.certificate) {
      lines.push(`   SHA-256: ${result.certificate.cleaned.sha256}`);
    }
    lines.push('');
  });
  
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('                         STATISTICS                           ');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Total Original Size: ${formatSize(totalOriginalSize)}`);
  lines.push(`Total Cleaned Size:  ${formatSize(totalCleanedSize)}`);
  lines.push(`Space Saved:         ${formatSize(totalOriginalSize - totalCleanedSize)}`);
  lines.push(`Verified Files:      ${verifiedCount}/${results.length}`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

// ===== Utilities =====
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ===== Dropzone =====
function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const folderInput = document.getElementById('folder-input');
  const selectFilesBtn = document.getElementById('select-files-btn');
  const selectFolderBtn = document.getElementById('select-folder-btn');
  
  if (!dropzone || !fileInput) return;
  
  // Drag events
  ['dragenter', 'dragover'].forEach(e => {
    dropzone.addEventListener(e, (ev) => {
      ev.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  
  ['dragleave', 'drop'].forEach(e => {
    dropzone.addEventListener(e, (ev) => {
      ev.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  
  // Drop
  dropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files);
    files.forEach(processFile);
  });
  
  // Click on "Dosya Seç" button
  if (selectFilesBtn) {
    selectFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }
  
  // Click on "Klasör Seç" button
  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (folderInput) {
        folderInput.click();
      } else {
        toast.warning('Bu tarayıcı klasör seçimini desteklemiyor');
      }
    });
  }
  
  // Click on dropzone area (not buttons) → file select
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('.btn')) return; // Don't trigger on button clicks
    fileInput.click();
  });
  
  // File input change
  fileInput.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(processFile);
    fileInput.value = '';
  });
  
  // Folder input change
  if (folderInput) {
    folderInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      const supported = files.filter(f => getFileType(f) !== null);
      const skipped = files.length - supported.length;
      
      if (supported.length === 0) {
        toast.warning('Klasörde desteklenen dosya bulunamadı');
        return;
      }
      
      if (skipped > 0) {
        toast.info(`📂 ${supported.length} dosya bulundu (${skipped} desteklenmeyen atlandı)`);
      } else {
        toast.info(`📂 ${supported.length} dosya bulundu`);
      }
      
      supported.forEach(processFile);
      folderInput.value = '';
    });
  }
}

// ===== Keyboard Shortcuts =====
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+V - Paste from clipboard
    if (e.ctrlKey && e.key === 'v') {
      handleClipboardPaste();
    }
    
    // Escape - Clear all
    if (e.key === 'Escape') {
      state.files.clear();
      state.results.clear();
      document.getElementById('file-list').innerHTML = '';
      document.getElementById('results-list').innerHTML = '';
      document.getElementById('file-list-section')?.classList.add('hidden');
      document.getElementById('results-section')?.classList.add('hidden');
    }
  });
  
  // Also handle paste event for better compatibility
  document.addEventListener('paste', (e) => {
    handleClipboardPaste(e);
  });
}

async function handleClipboardPaste(pasteEvent) {
  try {
    let foundFiles = false;
    
    // Method 1: Use paste event's clipboardData (more compatible)
    if (pasteEvent?.clipboardData?.files?.length) {
      for (const file of pasteEvent.clipboardData.files) {
        processFile(file);
        foundFiles = true;
      }
    }
    
    // Method 2: Use Clipboard API (for images copied from context menu)
    if (!foundFiles && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const ext = type.split('/')[1].replace('jpeg', 'jpg');
            const file = new File([blob], `pasted_image_${Date.now()}.${ext}`, { type });
            processFile(file);
            foundFiles = true;
            toast.info(`📋 Panodan görsel yapıştırıldı`);
          }
        }
      }
    }
    
    if (!foundFiles) {
      // Silent fail - user might be pasting text somewhere else
    }
  } catch (err) {
    // Clipboard access denied or no supported content
    console.log('Clipboard paste failed:', err.message);
  }
}

// ===== Network Monitor =====
// ===== Clean & Compress / Paranoid Mode =====
/**
 * Paranoid re-encode: draws image to canvas and re-exports.
 * This guarantees 100% metadata removal including steganography.
 * Any hidden data in pixel LSBs is destroyed by JPEG/WebP lossy compression.
 * PNG remains lossless but all non-pixel data (chunks, metadata) are stripped.
 */
async function paranoidReEncode(blob, fileType, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const mime = mimeMap[fileType] || 'image/png';
      // For JPEG/WebP: use quality setting. For PNG: quality param is ignored (lossless).
      const q = fileType === 'png' ? undefined : (quality / 100);
      
      canvas.toBlob((newBlob) => {
        if (newBlob) resolve(newBlob);
        else reject(new Error('Paranoid re-encode failed'));
      }, mime, q);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for paranoid re-encode'));
    };
    img.src = url;
  });
}

/**
 * Compress image: re-encodes at specified quality for smaller file size.
 * For JPEG/WebP: lossy quality reduction.
 * For PNG: re-encodes through canvas (strips metadata, may reduce size slightly).
 */
async function compressImage(blob, fileType, quality) {
  // If paranoid mode already re-encoded, skip if same quality would produce same result
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const mime = mimeMap[fileType] || 'image/png';
      const q = fileType === 'png' ? undefined : (quality / 100);
      
      canvas.toBlob((newBlob) => {
        if (newBlob) {
          // Only use compressed version if it's actually smaller
          resolve(newBlob.size < blob.size ? newBlob : blob);
        } else {
          resolve(blob); // Fallback to original
        }
      }, mime, q);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob); // Fallback
    };
    img.src = url;
  });
}

/**
 * Safe Share processing: adds random padding bytes to break file size fingerprinting.
 * Attacker can't correlate "same file uploaded from different sources" by size matching.
 * Also slightly varies quality to defeat perceptual hashing.
 */
async function safeShareProcess(blob, fileType) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Add invisible noise to 1-2 random pixels (defeats perceptual hash)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const numPixels = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < numPixels; i++) {
        const px = Math.floor(Math.random() * imageData.data.length / 4) * 4;
        // Change one channel by ±1 (invisible to human eye)
        const channel = px + Math.floor(Math.random() * 3);
        imageData.data[channel] = Math.max(0, Math.min(255, imageData.data[channel] + (Math.random() > 0.5 ? 1 : -1)));
      }
      ctx.putImageData(imageData, 0, 0);
      
      // Random quality variation (±2%) defeats size fingerprinting
      const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const mime = mimeMap[fileType] || 'image/png';
      const baseQuality = (state.options.quality || 85) / 100;
      const randomizedQuality = fileType === 'png' ? undefined : 
        Math.max(0.6, Math.min(0.95, baseQuality + (Math.random() - 0.5) * 0.04));
      
      canvas.toBlob((newBlob) => {
        resolve(newBlob || blob);
      }, mime, randomizedQuality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

// ===== Processing Options =====
function initProcessingOptions() {
  const compressCheck = document.getElementById('opt-compress');
  const paranoidCheck = document.getElementById('opt-paranoid');
  const qualitySlider = document.getElementById('opt-quality');
  const qualityValue = document.getElementById('quality-value');
  const qualityWrap = document.getElementById('compress-quality-wrap');
  
  if (compressCheck) {
    compressCheck.addEventListener('change', () => {
      state.options.compress = compressCheck.checked;
      if (qualityWrap) qualityWrap.style.display = compressCheck.checked ? 'block' : 'none';
    });
  }
  
  if (paranoidCheck) {
    paranoidCheck.addEventListener('change', () => {
      state.options.paranoid = paranoidCheck.checked;
    });
  }
  
  if (qualitySlider) {
    qualitySlider.addEventListener('input', () => {
      state.options.quality = parseInt(qualitySlider.value);
      if (qualityValue) qualityValue.textContent = qualitySlider.value;
    });
  }
  
  // Safe Share mode — enables paranoid + compress automatically
  const safeShareCheck = document.getElementById('opt-safe-share');
  if (safeShareCheck) {
    safeShareCheck.addEventListener('change', () => {
      state.options.safeShare = safeShareCheck.checked;
      if (safeShareCheck.checked) {
        // Auto-enable paranoid mode
        state.options.paranoid = true;
        state.options.compress = true;
        if (paranoidCheck) paranoidCheck.checked = true;
        if (compressCheck) {
          compressCheck.checked = true;
          if (qualityWrap) qualityWrap.style.display = 'block';
        }
      }
    });
  }
}

function initNetworkMonitor() {
  // Intercept fetch to count requests (should always be 0 for file processing)
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    // Only count non-local requests
    const url = args[0]?.toString() || '';
    if (!url.startsWith('/') && !url.startsWith('http://localhost')) {
      state.networkRequests++;
      updateNetworkMonitor();
    }
    return originalFetch.apply(this, args);
  };
  
  updateNetworkMonitor();
}

function updateNetworkMonitor() {
  const monitor = document.getElementById('network-monitor');
  if (monitor) {
    monitor.querySelector('.network-count').textContent = state.networkRequests;
  }
}

// ===== Initialize =====
async function init() {
  await loadTranslations();
  initTheme();
  initDropzone();
  initKeyboardShortcuts();
  initNetworkMonitor();
  workerPool.init();
  
  // Processing options handlers
  initProcessingOptions();
  
  // Language buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });
  
  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  
  // Clean all button
  document.getElementById('clean-all-btn')?.addEventListener('click', cleanAllFiles);
  
  // Clear all button
  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    state.files.clear();
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('file-list-section')?.classList.add('hidden');
  });
  
  // Tab switching
  initTabs();
  
  
  // URL Cleaner
  initURLCleaner();

  // Download-all + copy-url (were inline onclick handlers; moved here so the CSP
  // can forbid inline scripts/handlers entirely — script-src 'self').
  document.getElementById('download-all-btn')?.addEventListener('click', () => window.downloadAllAsZip());
  document.getElementById('copy-url-btn')?.addEventListener('click', () => window.copyCleanedUrl());

  // Delegated handler for dynamically-rendered action buttons (result cards, GPS
  // badges). No inline onclick anywhere → no 'unsafe-inline' needed for scripts.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'download') window.downloadFile(el.dataset.id);
    else if (action === 'cert') window.downloadCertificate(el.dataset.id);
    else if (action === 'qr') showQRCode(el.dataset.id);
    else if (action === 'verify-detail') showVerificationDetail(el.dataset.id);
    else if (action === 'show-gps') showGPSOnMap(parseFloat(el.dataset.lat), parseFloat(el.dataset.lon));
    else if (action === 'select-all-cats') { window.selectAllCategories(); window.updateSelectiveUI(); }
    else if (action === 'deselect-all-cats') { window.deselectAllCategories(); window.updateSelectiveUI(); }
  });

  // Selective-cleaning checkboxes use 'change', not 'click' (delegated).
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action="toggle-cat"]');
    if (!el) return;
    window.toggleCategory(el.dataset.cat);
    window.updateSelectiveUI();
  });

  // Service Worker registration (moved out of an inline <script> in index.html).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('SW registered:', reg.scope))
      .catch((err) => console.error('SW failed:', err));
  }

  console.log('MetaSafe v3.0 initialized');
}

// ===== Tab Switching =====
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      // Update active tab
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${tabId}`)?.classList.add('active');
    });
  });
}

// ===== Verification Detail Modal =====
// ===== QR Code Modal =====
function showQRCode(fileId) {
  const result = state.results.get(fileId);
  if (!result || !result.certificate) return;
  
  // Create compact QR data: hash + timestamp for verification
  const cert = result.certificate;
  const qrData = `METASAFE|${cert.cleaned.sha256.substring(0, 16)}|${cert.timestamp.substring(0, 19)}|${cert.original.name}`;
  
  // Generate QR code
  const qrDataURL = QRCode.toDataURL(qrData, 240);
  
  // Remove existing modal
  document.getElementById('qr-modal')?.remove();
  
  const modal = document.createElement('div');
  modal.id = 'qr-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content qr-modal-content glass-card">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <h3>📱 QR Doğrulama Kodu</h3>
      <p class="qr-subtitle">Telefondan tarayarak dosyanın temizlendiğini doğrulayın</p>
      <div class="qr-container">
        <img src="${qrDataURL}" alt="QR Verification Code" class="qr-image">
      </div>
      <div class="qr-info">
        <div class="qr-field">
          <span class="qr-label">Dosya:</span>
          <span class="qr-value">${escapeHtml(cert.original.name)}</span>
        </div>
        <div class="qr-field">
          <span class="qr-label">Hash (kısa):</span>
          <span class="qr-value mono">${cert.cleaned.sha256.substring(0, 16)}…</span>
        </div>
        <div class="qr-field">
          <span class="qr-label">Tarih:</span>
          <span class="qr-value">${new Date(cert.timestamp).toLocaleString()}</span>
        </div>
      </div>
      <p class="qr-hint">💡 QR kod şunları içerir: temizlenmiş dosyanın SHA-256 hash'i, zaman damgası ve dosya adı.</p>
    </div>
  `;
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
}

function showVerificationDetail(fileId) {
  const result = state.results.get(fileId);
  if (!result) return;
  
  // Remove existing modal if any
  document.getElementById('verify-modal')?.remove();
  
  const riskColors = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' };
  const riskLabels = { high: '🔴 Kritik', medium: '🟡 Orta', low: '🟢 Düşük' };
  
  const beforeItems = result.originalMetadata.map(item => {
    const label = escapeHtml(item.key || item.label || 'Bilinmeyen');
    const value = escapeHtml(String(item.value || '').substring(0, 80));
    const risk = item.risk || 'low';
    return `<tr class="verify-row risk-${risk}">
      <td>${riskLabels[risk] || '🟢 Düşük'}</td>
      <td>${label}</td>
      <td class="verify-value">${value}</td>
      <td class="verify-status">🗑️ Silindi</td>
    </tr>`;
  }).join('');
  
  const afterItems = result.verifyMetadata.map(item => {
    const label = escapeHtml(item.key || item.label || 'Bilinmeyen');
    const value = escapeHtml(String(item.value || '').substring(0, 80));
    const risk = item.risk || 'low';
    return `<tr class="verify-row risk-${risk}">
      <td>${riskLabels[risk] || '🟢 Düşük'}</td>
      <td>${label}</td>
      <td class="verify-value">${value}</td>
      <td class="verify-status remaining">⚠️ Kaldı</td>
    </tr>`;
  }).join('');
  
  const modal = document.createElement('div');
  modal.id = 'verify-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content verify-modal-content">
      <div class="modal-header">
        <h3>📋 Doğrulama Raporu — ${escapeHtml(result.originalName)}</h3>
        <button class="modal-close" data-action="close-modal">✕</button>
      </div>
      <div class="verify-summary">
        <div class="verify-stat verify-stat-good">
          <span class="verify-stat-num">${result.metadataRemoved}</span>
          <span class="verify-stat-label">Metadata Silindi</span>
        </div>
        <div class="verify-stat ${result.metadataRemaining > 0 ? 'verify-stat-warn' : 'verify-stat-good'}">
          <span class="verify-stat-num">${result.metadataRemaining}</span>
          <span class="verify-stat-label">Kalan</span>
        </div>
        <div class="verify-stat">
          <span class="verify-stat-num">${result.verified ? '✓' : '⚠'}</span>
          <span class="verify-stat-label">${result.verified ? 'Güvenli' : 'Kontrol Et'}</span>
        </div>
        <div class="verify-stat">
          <span class="verify-stat-num">-${formatSize(result.originalSize - result.cleanedSize)}</span>
          <span class="verify-stat-label">Boyut Farkı</span>
        </div>
      </div>
      ${beforeItems ? `
        <h4>🗑️ Silinen Metadata (${result.metadataRemoved} adet)</h4>
        <div class="verify-table-wrap">
          <table class="verify-table">
            <thead><tr><th>Risk</th><th>Alan</th><th>Değer</th><th>Durum</th></tr></thead>
            <tbody>${beforeItems}</tbody>
          </table>
        </div>
      ` : '<p class="verify-empty">Orijinal dosyada metadata bulunamadı.</p>'}
      ${afterItems ? `
        <h4>⚠️ Kalan Metadata (${result.metadataRemaining} adet)</h4>
        <div class="verify-table-wrap">
          <table class="verify-table">
            <thead><tr><th>Risk</th><th>Alan</th><th>Değer</th><th>Durum</th></tr></thead>
            <tbody>${afterItems}</tbody>
          </table>
        </div>
      ` : ''}
      ${result.verified ? `
        <div class="verify-verdict verify-pass">
          ✅ Temizleme başarılı — Kritik veya yüksek riskli metadata kalmadı.
        </div>
      ` : `
        <div class="verify-verdict verify-warn">
          ⚠️ Bazı metadata tamamen silinemedi. Düşük riskli öğeler dosya bütünlüğü için gerekli olabilir.
        </div>
      `}
    </div>
  `;
  
  // Close on overlay click or button
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-action="close-modal"]')) {
      modal.remove();
    }
  });
  
  document.body.appendChild(modal);
}

// ===== Utility: HTML-escape untrusted text (filenames, messages) =====
// Escape for BOTH text and attribute contexts (quotes included), so a malicious
// filename or metadata value (e.g. an EXIF field containing markup) can never
// break out of an HTML string built for innerHTML.
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ===== URL Cleaner Functions =====
function initURLCleaner() {
  const cleanBtn = document.getElementById('clean-url-btn');
  const urlInput = document.getElementById('url-input');
  
  if (!cleanBtn || !urlInput) return;
  
  cleanBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      toast.error('Lütfen bir URL girin');
      return;
    }
    
    performURLClean(url);
  });
  
  // Also clean on Enter
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (url) performURLClean(url);
    }
  });
}

function performURLClean(url) {
  const result = cleanURL(url);
  
  if (!result.success) {
    toast.error(result.error || 'Geçersiz URL');
    return;
  }
  
  // Show result section
  const resultSection = document.getElementById('url-result');
  const trackersSection = document.getElementById('trackers-list');
  
  if (resultSection) {
    resultSection.style.display = 'block';
    document.getElementById('cleaned-url').value = result.cleaned;
    document.getElementById('removed-count').textContent = result.removedCount;
    document.getElementById('size-saved').textContent = result.sizeSaved;
  }
  
  // Show removed trackers
  if (trackersSection && result.removed.length > 0) {
    trackersSection.style.display = 'block';
    const itemsContainer = document.getElementById('tracker-items');
    itemsContainer.innerHTML = result.removed.map(tracker => `
      <span class="tracker-item">
        <span class="param-name">${escapeHtml(tracker.name)}</span>
        <span class="param-platform">(${escapeHtml(tracker.platform)})</span>
      </span>
    `).join('');
  } else if (trackersSection) {
    trackersSection.style.display = 'none';
  }
  
  if (result.removedCount > 0) {
    toast.success(`✅ ${result.removedCount} izleyici kaldırıldı`);
  } else {
    toast.info('Bu URL\'de izleyici bulunamadı');
  }
}

window.copyCleanedUrl = function() {
  const cleanedUrl = document.getElementById('cleaned-url');
  if (cleanedUrl) {
    navigator.clipboard.writeText(cleanedUrl.value);
    toast.success('📋 URL kopyalandı');
  }
};

// Start app
document.addEventListener('DOMContentLoaded', init);
