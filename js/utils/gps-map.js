/**
 * MetaSafe GPS Map Module
 * Shows GPS coordinates on an interactive Leaflet map
 */

let mapInstance = null;
let markerInstance = null;

/**
 * Initialize GPS map modal event listeners
 */
function initGPSMapModal() {
  const modal = document.getElementById('gps-map-modal');
  const closeBtn = document.getElementById('close-map-modal');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeGPSMap);
  }
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeGPSMap();
      }
    });
  }
  
  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
      closeGPSMap();
    }
  });
}

/**
 * Show GPS coordinates on map
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} filename - Optional filename to show in popup
 */
function showGPSOnMap(lat, lon, filename = '') {
  console.log('showGPSOnMap called:', lat, lon, filename);
  
  const modal = document.getElementById('gps-map-modal');
  const mapContainer = document.getElementById('gps-map');
  const coordsSpan = document.getElementById('map-coords');
  
  console.log('Elements found:', !!modal, !!mapContainer, !!coordsSpan);
  
  if (!modal || !mapContainer) {
    console.error('GPS map elements not found');
    return;
  }
  
  // Show modal
  modal.style.display = 'flex';
  console.log('Modal display set to flex');
  
  // Show the coordinates as TEXT ONLY. We deliberately do NOT plot the location on an
  // online map: fetching map tiles would send the photo's exact GPS to a third-party
  // tile server (and reveal it to the network/ISP) — exactly the leak this tool prevents.
  if (coordsSpan) {
    coordsSpan.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

/**
 * Close GPS map modal
 */
function closeGPSMap() {
  const modal = document.getElementById('gps-map-modal');
  
  if (modal) {
    modal.style.display = 'none';
  }
  
  // Clean up map
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerInstance = null;
  }
}

/**
 * Parse GPS coordinates from EXIF data
 * @param {Object} gpsData - GPS data object with lat/lon
 * @returns {Object|null} - {lat, lon} or null
 */
function parseGPSFromExif(gpsData) {
  if (!gpsData) return null;
  
  // Already parsed format
  if (typeof gpsData.lat === 'number' && typeof gpsData.lon === 'number') {
    return { lat: gpsData.lat, lon: gpsData.lon };
  }
  
  // EXIF format with degrees, minutes, seconds
  if (gpsData.GPSLatitude && gpsData.GPSLongitude) {
    const lat = convertDMSToDecimal(
      gpsData.GPSLatitude,
      gpsData.GPSLatitudeRef === 'S' ? -1 : 1
    );
    const lon = convertDMSToDecimal(
      gpsData.GPSLongitude,
      gpsData.GPSLongitudeRef === 'W' ? -1 : 1
    );
    
    if (lat !== null && lon !== null) {
      return { lat, lon };
    }
  }
  
  return null;
}

/**
 * Convert DMS (Degrees, Minutes, Seconds) to decimal
 */
function convertDMSToDecimal(dms, sign = 1) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  
  const degrees = dms[0][0] / dms[0][1];
  const minutes = dms[1][0] / dms[1][1];
  const seconds = dms[2][0] / dms[2][1];
  
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

/**
 * Create clickable GPS badge for file card
 * @param {number} lat 
 * @param {number} lon 
 * @param {string} filename 
 * @returns {string} HTML string
 */
function createGPSBadgeHTML(lat, lon, filename) {
  // Use data-* attributes (no inline onclick) so the strict CSP can forbid inline
  // handlers. A delegated listener in app.js reads data-lat/data-lon.
  return `<span class="gps-warning-badge" data-action="show-gps" data-lat="${lat}" data-lon="${lon}">
    📍 GPS Konumu Göster
  </span>`;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGPSMapModal);
} else {
  initGPSMapModal();
}

// Export for module use
export { showGPSOnMap, closeGPSMap, parseGPSFromExif, createGPSBadgeHTML, initGPSMapModal };

// Also make available globally for onclick handlers
window.showGPSOnMap = showGPSOnMap;
window.closeGPSMap = closeGPSMap;
