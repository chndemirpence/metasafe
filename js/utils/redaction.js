/**
 * MetaSafe Manual Redaction Tool
 *
 * Metadata cleaning alone isn't enough: a photo can reveal a face, a license
 * plate, a name badge, or a signature in its VISIBLE content, which no EXIF
 * strip touches. This lets the user draw boxes over regions of an image and
 * bakes them in as solid, opaque fills directly on the pixels — not a
 * decorative overlay that a viewer could remove, and not blur/pixelation
 * (both have known reversal attacks against text and low-frequency content).
 * Solid fill is the only redaction method with no known way back to the
 * original pixels, which is why it's the only mode offered here.
 *
 * Drawing happens on a scaled-down preview canvas for screen fit, but the
 * fill is applied to a full-resolution offscreen canvas so the redaction is
 * pixel-exact regardless of preview zoom.
 */

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay redaction-modal-overlay';
  modalEl.style.display = 'none';
  modalEl.innerHTML = `
    <div class="modal-content redaction-modal-content">
      <div class="modal-header">
        <h3>✏️ Redaksiyon — Yüz/Plaka/İsim Karart</h3>
        <button class="modal-close" data-action="redact-cancel">✕</button>
      </div>
      <div class="modal-body redaction-body">
        <p class="redaction-hint">Gizlemek istediğin bölgelerin üzerine sürükleyerek kutu çiz. Kutular kalıcı olarak siyahla doldurulur — geri alınamaz bir şekilde silinir, üzeri kapatılmış görüntü değildir.</p>
        <div class="redaction-canvas-wrap">
          <canvas class="redaction-canvas"></canvas>
        </div>
        <div class="redaction-controls">
          <button class="btn btn-outline" data-action="redact-undo">↩️ Son Kutuyu Geri Al</button>
          <button class="btn btn-outline" data-action="redact-clear">🗑️ Tümünü Temizle</button>
          <span class="redaction-spacer"></span>
          <button class="btn btn-secondary" data-action="redact-cancel">İptal</button>
          <button class="btn btn-primary" data-action="redact-apply">✅ Uygula</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  return modalEl;
}

/**
 * Open the redaction editor for an image file.
 * @param {File|Blob} file
 * @returns {Promise<Blob|null>} redacted image blob, or null if cancelled
 */
export function openRedactionEditor(file) {
  return new Promise((resolve) => {
    const modal = ensureModal();
    const canvas = modal.querySelector('.redaction-canvas');
    const ctx = canvas.getContext('2d');

    const url = URL.createObjectURL(file);
    const img = new Image();

    // Full-resolution source canvas — the redaction is always baked in here,
    // never on the (possibly downscaled) preview canvas.
    const sourceCanvas = document.createElement('canvas');
    const sourceCtx = sourceCanvas.getContext('2d');

    let scale = 1; // preview px -> source px
    let boxes = []; // { x, y, w, h } in SOURCE coordinates
    let drawing = null; // in-progress box, in PREVIEW coordinates

    function redrawPreview() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      for (const b of boxes) {
        ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      }
      if (drawing) {
        ctx.fillRect(drawing.x, drawing.y, drawing.w, drawing.h);
      }
    }

    function previewPoint(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height
      };
    }

    let startPoint = null;
    function onPointerDown(e) {
      e.preventDefault();
      startPoint = previewPoint(e);
      drawing = { x: startPoint.x, y: startPoint.y, w: 0, h: 0 };
    }
    function onPointerMove(e) {
      if (!drawing || !startPoint) return;
      e.preventDefault();
      const p = previewPoint(e);
      drawing = {
        x: Math.min(startPoint.x, p.x),
        y: Math.min(startPoint.y, p.y),
        w: Math.abs(p.x - startPoint.x),
        h: Math.abs(p.y - startPoint.y)
      };
      redrawPreview();
    }
    function onPointerUp() {
      if (drawing && drawing.w > 3 && drawing.h > 3) {
        // Convert to source (full-res) coordinates before storing.
        boxes.push({
          x: drawing.x / scale,
          y: drawing.y / scale,
          w: drawing.w / scale,
          h: drawing.h / scale
        });
      }
      drawing = null;
      startPoint = null;
      redrawPreview();
    }

    function cleanupListeners() {
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('touchstart', onPointerDown);
      canvas.removeEventListener('touchmove', onPointerMove);
      canvas.removeEventListener('touchend', onPointerUp);
      modal.removeEventListener('click', onModalClick);
    }

    function close(result) {
      cleanupListeners();
      modal.style.display = 'none';
      URL.revokeObjectURL(url);
      resolve(result);
    }

    function onModalClick(e) {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'redact-cancel') {
        close(null);
      } else if (action === 'redact-undo') {
        boxes.pop();
        redrawPreview();
      } else if (action === 'redact-clear') {
        boxes = [];
        redrawPreview();
      } else if (action === 'redact-apply') {
        // Bake every box into the FULL-RESOLUTION source canvas as an
        // opaque fill, then export. This is the only place the actual
        // pixel data is destroyed — the preview canvas is display-only.
        sourceCtx.fillStyle = '#000000';
        for (const b of boxes) {
          sourceCtx.fillRect(b.x, b.y, b.w, b.h);
        }
        const outType = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
        sourceCanvas.toBlob((blob) => close(blob), outType, 0.95);
      }
    }

    img.onload = () => {
      sourceCanvas.width = img.naturalWidth;
      sourceCanvas.height = img.naturalHeight;
      sourceCtx.drawImage(img, 0, 0);

      // Fit preview canvas to a reasonable on-screen size while preserving
      // aspect ratio; redaction precision is unaffected since we always
      // apply fills in source coordinates (see onPointerUp/redact-apply).
      const maxW = Math.min(900, window.innerWidth - 80);
      const maxH = Math.min(600, window.innerHeight - 260);
      const fitScale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      scale = fitScale;
      canvas.width = Math.round(img.naturalWidth * fitScale);
      canvas.height = Math.round(img.naturalHeight * fitScale);

      boxes = [];
      redrawPreview();

      modal.style.display = 'flex';
      canvas.addEventListener('mousedown', onPointerDown);
      canvas.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      canvas.addEventListener('touchstart', onPointerDown, { passive: false });
      canvas.addEventListener('touchmove', onPointerMove, { passive: false });
      canvas.addEventListener('touchend', onPointerUp);
      modal.addEventListener('click', onModalClick);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
