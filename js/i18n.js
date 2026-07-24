/**
 * MetaSafe i18n (Internationalization) Module
 * Handles language switching and text translations
 */

class I18n {
  constructor() {
    this.currentLang = 'tr';
    this.translations = {};
    this.supportedLangs = ['tr', 'en'];
    this.loaded = false;
  }

  /**
   * Initialize i18n - load translations and set language
   */
  async init() {
    // Load all translations
    await Promise.all(
      this.supportedLangs.map(lang => this.loadTranslation(lang))
    );
    
    // Detect preferred language
    const savedLang = localStorage.getItem('metasafe-lang');
    const browserLang = navigator.language.split('-')[0];
    
    if (savedLang && this.supportedLangs.includes(savedLang)) {
      this.currentLang = savedLang;
    } else if (this.supportedLangs.includes(browserLang)) {
      this.currentLang = browserLang;
    }
    
    this.loaded = true;
    this.updateUI();
    this.updateLangButtons();
    
    console.log(`[i18n] Initialized with language: ${this.currentLang}`);
  }

  /**
   * Load translation file
   */
  async loadTranslation(lang) {
    try {
      const response = await fetch(`/js/i18n/${lang}.json`);
      if (response.ok) {
        this.translations[lang] = await response.json();
        console.log(`[i18n] Loaded: ${lang}`);
      }
    } catch (err) {
      console.error(`[i18n] Failed to load ${lang}:`, err);
    }
  }

  /**
   * Get translation by key path (e.g., "app.title")
   */
  t(keyPath, params = {}) {
    const keys = keyPath.split('.');
    let value = this.translations[this.currentLang];
    
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        value = undefined;
        break;
      }
    }
    
    if (value === undefined) {
      console.warn(`[i18n] Missing translation: ${keyPath}`);
      return keyPath;
    }
    
    // Replace params like {count}
    if (typeof value === 'string') {
      for (const [param, replacement] of Object.entries(params)) {
        value = value.replace(`{${param}}`, replacement);
      }
    }
    
    return value;
  }

  /**
   * Switch language
   */
  setLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}`);
      return;
    }
    
    this.currentLang = lang;
    localStorage.setItem('metasafe-lang', lang);
    this.updateUI();
    this.updateLangButtons();
    
    // Dispatch event for other modules
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { lang } }));
    
    console.log(`[i18n] Language changed to: ${lang}`);
  }

  /**
   * Update all UI elements with data-i18n attribute
   */
  updateUI() {
    if (!this.loaded) return;
    
    // Update elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const text = this.t(key);
      
      if (el.tagName === 'INPUT' && el.type === 'placeholder') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });
    
    // Update elements with data-i18n-title (for tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      el.title = this.t(key);
    });
    
    // Update document title
    document.title = `MetaSafe - ${this.t('app.tagline')}`;
  }

  /**
   * Update language selector buttons
   */
  updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      const lang = btn.dataset.lang;
      btn.classList.toggle('active', lang === this.currentLang);
    });
  }
}

// Create global instance
const i18n = new I18n();

// Export for modules
export { i18n };
export default i18n;
