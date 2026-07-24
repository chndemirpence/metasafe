/**
 * MetaSafe Selective Cleaning Module
 * Allows users to choose which metadata categories to remove
 */

// Metadata categories with their EXIF tag mappings
const METADATA_CATEGORIES = {
  gps: {
    id: 'gps',
    label: 'GPS Konumu',
    labelEn: 'GPS Location',
    icon: '📍',
    risk: 'critical',
    description: 'Fotoğrafın çekildiği konum koordinatları',
    exifTags: [
      'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef',
      'GPSAltitude', 'GPSAltitudeRef', 'GPSTimeStamp', 'GPSDateStamp',
      'GPSSpeed', 'GPSSpeedRef', 'GPSTrack', 'GPSTrackRef',
      'GPSImgDirection', 'GPSImgDirectionRef', 'GPSDestLatitude',
      'GPSDestLongitude', 'GPSAreaInformation'
    ],
    piexifIFD: 'GPS'
  },
  device: {
    id: 'device',
    label: 'Cihaz Bilgisi',
    labelEn: 'Device Info',
    icon: '📱',
    risk: 'high',
    description: 'Telefon/kamera marka, model ve seri numarası',
    exifTags: [
      'Make', 'Model', 'Software', 'HostComputer',
      'BodySerialNumber', 'CameraSerialNumber', 'LensSerialNumber',
      'InternalSerialNumber', 'LensModel', 'LensMake'
    ],
    piexifIFD: '0th'
  },
  datetime: {
    id: 'datetime',
    label: 'Tarih/Saat',
    labelEn: 'Date/Time',
    icon: '🕐',
    risk: 'medium',
    description: 'Fotoğrafın çekildiği veya düzenlendiği tarih',
    exifTags: [
      'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
      'CreateDate', 'ModifyDate', 'SubSecTime', 'SubSecTimeOriginal',
      'SubSecTimeDigitized', 'OffsetTime', 'OffsetTimeOriginal'
    ],
    piexifIFD: 'Exif'
  },
  personal: {
    id: 'personal',
    label: 'Kişisel Veriler',
    labelEn: 'Personal Data',
    icon: '👤',
    risk: 'high',
    description: 'İsim, telif hakkı, yazar bilgisi',
    exifTags: [
      'Artist', 'Copyright', 'Author', 'Creator', 'Owner',
      'OwnerName', 'CameraOwnerName', 'ImageDescription',
      'UserComment', 'XPAuthor', 'XPComment', 'XPKeywords', 'XPSubject'
    ],
    piexifIFD: '0th'
  },
  technical: {
    id: 'technical',
    label: 'Teknik Veriler',
    labelEn: 'Technical Data',
    icon: '⚙️',
    risk: 'low',
    description: 'ISO, diyafram, enstantane gibi çekim ayarları',
    exifTags: [
      'ExposureTime', 'FNumber', 'ISOSpeedRatings', 'FocalLength',
      'WhiteBalance', 'Flash', 'MeteringMode', 'ExposureProgram',
      'ExposureCompensation', 'MaxApertureValue', 'ShutterSpeedValue'
    ],
    piexifIFD: 'Exif'
  }
};

// Default selection (all critical/high risk selected)
const DEFAULT_SELECTION = {
  gps: true,
  device: true,
  datetime: true,
  personal: true,
  technical: false  // Low risk, optional
};

// Current user selection
let currentSelection = { ...DEFAULT_SELECTION };

/**
 * Get current cleaning selection
 */
function getCleaningSelection() {
  return { ...currentSelection };
}

/**
 * Set cleaning selection
 */
function setCleaningSelection(selection) {
  currentSelection = { ...DEFAULT_SELECTION, ...selection };
  saveSelectionToStorage();
  return currentSelection;
}

/**
 * Toggle a specific category
 */
function toggleCategory(categoryId) {
  if (METADATA_CATEGORIES[categoryId]) {
    currentSelection[categoryId] = !currentSelection[categoryId];
    saveSelectionToStorage();
  }
  return currentSelection;
}

/**
 * Select all categories
 */
function selectAllCategories() {
  Object.keys(METADATA_CATEGORIES).forEach(key => {
    currentSelection[key] = true;
  });
  saveSelectionToStorage();
  return currentSelection;
}

/**
 * Deselect all categories
 */
function deselectAllCategories() {
  Object.keys(METADATA_CATEGORIES).forEach(key => {
    currentSelection[key] = false;
  });
  saveSelectionToStorage();
  return currentSelection;
}

/**
 * Reset to defaults
 */
function resetToDefaults() {
  currentSelection = { ...DEFAULT_SELECTION };
  saveSelectionToStorage();
  return currentSelection;
}

/**
 * Save selection to localStorage
 */
function saveSelectionToStorage() {
  try {
    localStorage.setItem('metasafe_cleaning_selection', JSON.stringify(currentSelection));
  } catch (e) {
    console.warn('Could not save selection to localStorage:', e);
  }
}

/**
 * Load selection from localStorage
 */
function loadSelectionFromStorage() {
  try {
    const saved = localStorage.getItem('metasafe_cleaning_selection');
    if (saved) {
      currentSelection = { ...DEFAULT_SELECTION, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Could not load selection from localStorage:', e);
  }
}

/**
 * Get EXIF tags to remove based on current selection
 */
function getTagsToRemove() {
  const tags = [];
  Object.entries(currentSelection).forEach(([categoryId, isSelected]) => {
    if (isSelected && METADATA_CATEGORIES[categoryId]) {
      tags.push(...METADATA_CATEGORIES[categoryId].exifTags);
    }
  });
  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Check if a specific tag should be removed
 */
function shouldRemoveTag(tagName) {
  for (const [categoryId, isSelected] of Object.entries(currentSelection)) {
    if (isSelected && METADATA_CATEGORIES[categoryId]) {
      if (METADATA_CATEGORIES[categoryId].exifTags.includes(tagName)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Generate HTML for selective cleaning UI
 */
function generateSelectiveCleaningHTML(lang = 'tr') {
  const categories = Object.values(METADATA_CATEGORIES);
  
  return `
    <div class="selective-cleaning">
      <div class="selective-header">
        <h4>${lang === 'tr' ? 'Temizlenecek Veriler' : 'Data to Clean'}</h4>
        <div class="selective-actions">
          <button type="button" class="btn-link" data-action="select-all-cats">
            ${lang === 'tr' ? 'Tümünü Seç' : 'Select All'}
          </button>
          <button type="button" class="btn-link" data-action="deselect-all-cats">
            ${lang === 'tr' ? 'Hiçbirini Seçme' : 'Select None'}
          </button>
        </div>
      </div>
      <div class="selective-categories">
        ${categories.map(cat => `
          <label class="selective-category risk-${cat.risk}" data-category="${cat.id}">
            <input type="checkbox"
                   id="clean-${cat.id}"
                   ${currentSelection[cat.id] ? 'checked' : ''}
                   data-action="toggle-cat" data-cat="${cat.id}">
            <span class="category-icon">${cat.icon}</span>
            <span class="category-info">
              <span class="category-label">${lang === 'tr' ? cat.label : cat.labelEn}</span>
              <span class="category-desc">${cat.description}</span>
            </span>
            <span class="category-risk risk-badge-${cat.risk}">
              ${cat.risk === 'critical' ? '🔴' : cat.risk === 'high' ? '🟠' : cat.risk === 'medium' ? '🟡' : '🟢'}
            </span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Update UI checkboxes to match current selection
 */
function updateSelectiveUI() {
  Object.entries(currentSelection).forEach(([categoryId, isSelected]) => {
    const checkbox = document.getElementById(`clean-${categoryId}`);
    if (checkbox) {
      checkbox.checked = isSelected;
    }
  });
}

// Initialize on load
loadSelectionFromStorage();

// Export functions
export {
  METADATA_CATEGORIES,
  getCleaningSelection,
  setCleaningSelection,
  toggleCategory,
  selectAllCategories,
  deselectAllCategories,
  resetToDefaults,
  getTagsToRemove,
  shouldRemoveTag,
  generateSelectiveCleaningHTML,
  updateSelectiveUI
};

// Global access for onclick handlers
window.toggleCategory = toggleCategory;
window.selectAllCategories = selectAllCategories;
window.deselectAllCategories = deselectAllCategories;
window.updateSelectiveUI = updateSelectiveUI;
