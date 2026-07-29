/**
 * MetaSafe PDF Redaction (true removal, not a visual overlay)
 *
 * pdf.js can render pages but not edit PDF structure; pdf-lib can edit
 * structure but not render/rasterize pages. Editing a content stream in
 * place to surgically delete just the text/vectors under a box is the kind
 * of hand-rolled PDF parsing that is exactly how "fake redactions" happen in
 * the wild (a black rectangle drawn OVER text that's still fully extractable
 * underneath) — see checkForFakeRedactions() in processors/pdf.js, which
 * exists because this failure mode is common enough to detect for. We are
 * not going to reintroduce that bug by attempting the same surgery ourselves.
 *
 * Instead: any page that gets at least one redaction box is fully rendered
 * to a raster image at high resolution, the boxes are baked in as opaque
 * fills on that raster, and the ENTIRE page is replaced by that image in the
 * output PDF. There is no text or vector layer left on that page for
 * anything to extract — the whole page is a picture. Pages with no
 * redaction boxes are copied through untouched (still selectable/searchable
 * text). This is the same "rasterize after redacting" approach professional
 * redaction guidance recommends specifically because it's unconditionally
 * safe, at the cost of losing text-selectability on just the pages that
 * were actually redacted.
 */

import * as pdfjsLib from '/lib/pdfjs.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdfjs.worker.mjs';

const PREVIEW_MAX_W = 700;
const PREVIEW_MAX_H = 560;
const FLATTEN_SCALE = 3; // render redacted pages at 3x for a crisp, high-res flatten

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay redaction-modal-overlay pdf-redaction-modal-overlay';
  modalEl.style.display = 'none';
  modalEl.innerHTML = `
    <div class="modal-content redaction-modal-content">
      <div class="modal-header">
        <h3>✏️ PDF Redaksiyon — İsim/İmza/Metin Karart</h3>
        <button class="modal-close" data-action="pdfredact-cancel">✕</button>
      </div>
      <div class="modal-body redaction-body">
        <p class="redaction-hint">Gizlemek istediğin bölgenin üzerine sürükleyerek kutu çiz. <strong>Kutu çizilen sayfa, altındaki metin dahil tamamen resme dönüştürülür</strong> — o sayfada artık kopyalanabilir/aranabilir metin kalmaz (bu, redaksiyonun gerçekten güvenli olmasının tek yolu). Kutu çizilmeyen sayfalar olduğu gibi (metin aranabilir) kalır.</p>
        <div class="redaction-page-nav">
          <button class="btn btn-outline" data-action="pdfredact-prev">← Önceki Sayfa</button>
          <span class="pdf-redaction-page-label"></span>
          <button class="btn btn-outline" data-action="pdfredact-next">Sonraki Sayfa →</button>
        </div>
        <div class="redaction-canvas-wrap">
          <canvas class="redaction-canvas pdf-redaction-canvas"></canvas>
        </div>
        <div class="redaction-controls">
          <button class="btn btn-outline" data-action="pdfredact-undo">↩️ Bu Sayfada Son Kutuyu Geri Al</button>
          <button class="btn btn-outline" data-action="pdfredact-clear">🗑️ Bu Sayfayı Temizle</button>
          <span class="redaction-spacer"></span>
          <span class="pdf-redaction-status"></span>
          <button class="btn btn-secondary" data-action="pdfredact-cancel">İptal</button>
          <button class="btn btn-primary" data-action="pdfredact-apply">✅ Uygula</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  return modalEl;
}

/**
 * Open the PDF redaction editor.
 * @param {File|Blob} file
 * @returns {Promise<Blob|null>} redacted PDF blob, or null if cancelled
 */
export function openPdfRedactionEditor(file) {
  return new Promise(async (resolve) => {
    const modal = ensureModal();
    const canvas = modal.querySelector('.pdf-redaction-canvas');
    const ctx = canvas.getContext('2d');
    const pageLabel = modal.querySelector('.pdf-redaction-page-label');
    const statusEl = modal.querySelector('.pdf-redaction-status');

    const arrayBuffer = await file.arrayBuffer();
    // pdf.js needs its own copy of the bytes (it detaches/transfers the buffer).
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const numPages = pdfDoc.numPages;

    let currentPage = 1;
    // pageNum -> [{x,y,w,h}] in PDF POINT space (resolution-independent —
    // scale=1 viewport units), not preview pixels, so boxes stay accurate
    // when we re-render each redacted page at a different scale for output.
    const boxesByPage = new Map();
    let previewScale = 1;
    let drawing = null;
    let startPoint = null;
    let pageBitmapCache = null;

    function updateStatus() {
      pageLabel.textContent = `Sayfa ${currentPage} / ${numPages}`;
      const redactedPages = [...boxesByPage.keys()].filter((p) => (boxesByPage.get(p) || []).length > 0);
      statusEl.textContent = redactedPages.length > 0
        ? `${redactedPages.length} sayfa resme dönüştürülecek: ${redactedPages.sort((a, b) => a - b).join(', ')}`
        : 'Henüz redaksiyon kutusu çizilmedi';
    }

    async function renderCurrentPage() {
      const page = await pdfDoc.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = Math.min(PREVIEW_MAX_W / baseViewport.width, PREVIEW_MAX_H / baseViewport.height, 2);
      previewScale = fitScale;
      const viewport = page.getViewport({ scale: fitScale });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      // Render the page to an OFFSCREEN cache exactly once per page-switch.
      // Dragging then only does cheap, SYNCHRONOUS redraws from this cache —
      // calling pdf.js's async page.render() again on the same live canvas on
      // every mousemove tick both re-renders the whole page needlessly and
      // races: pdf.js throws "Cannot use the same canvas during multiple
      // render() operations" if a second render starts before the first
      // finishes, which fast mouse movement reliably triggered.
      const cacheCanvas = document.createElement('canvas');
      cacheCanvas.width = canvas.width;
      cacheCanvas.height = canvas.height;
      await page.render({ canvasContext: cacheCanvas.getContext('2d'), viewport }).promise;
      pageBitmapCache = cacheCanvas;

      updateStatus();
      drawOverlay();
    }

    // Synchronous-only: cached page bitmap + committed boxes + in-progress
    // drag rect. Safe to call from every mousemove tick.
    function drawOverlay() {
      if (!pageBitmapCache) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(pageBitmapCache, 0, 0);
      ctx.fillStyle = '#000000';
      for (const b of (boxesByPage.get(currentPage) || [])) {
        ctx.fillRect(b.x * previewScale, b.y * previewScale, b.w * previewScale, b.h * previewScale);
      }
      if (drawing) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
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
        x: Math.min(startPoint.x, p.x), y: Math.min(startPoint.y, p.y),
        w: Math.abs(p.x - startPoint.x), h: Math.abs(p.y - startPoint.y)
      };
      drawOverlay();
    }
    function onPointerUp() {
      if (drawing && drawing.w > 3 && drawing.h > 3) {
        const list = boxesByPage.get(currentPage) || [];
        // Convert preview px -> PDF points (resolution-independent).
        list.push({
          x: drawing.x / previewScale, y: drawing.y / previewScale,
          w: drawing.w / previewScale, h: drawing.h / previewScale
        });
        boxesByPage.set(currentPage, list);
      }
      drawing = null;
      startPoint = null;
      drawOverlay();
      updateStatus();
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
      resolve(result);
    }

    /** Render `pageNum` at FLATTEN_SCALE with its boxes baked in; returns a PNG blob + point-space page size. */
    async function flattenPage(pageNum) {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: FLATTEN_SCALE });
      const off = document.createElement('canvas');
      off.width = Math.round(viewport.width);
      off.height = Math.round(viewport.height);
      const offCtx = off.getContext('2d');
      await page.render({ canvasContext: offCtx, viewport }).promise;

      offCtx.fillStyle = '#000000';
      for (const b of (boxesByPage.get(pageNum) || [])) {
        offCtx.fillRect(b.x * FLATTEN_SCALE, b.y * FLATTEN_SCALE, b.w * FLATTEN_SCALE, b.h * FLATTEN_SCALE);
      }

      const blob = await new Promise((res) => off.toBlob(res, 'image/png'));
      return { blob, pointWidth: baseViewport.width, pointHeight: baseViewport.height };
    }

    async function applyRedactions() {
      const redactedPageNums = new Set(
        [...boxesByPage.entries()].filter(([, boxes]) => boxes.length > 0).map(([p]) => p)
      );

      const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer.slice(0));
      const outDoc = await PDFLib.PDFDocument.create();

      for (let i = 0; i < numPages; i++) {
        const pageNum = i + 1;
        if (redactedPageNums.has(pageNum)) {
          const { blob, pointWidth, pointHeight } = await flattenPage(pageNum);
          const pngBytes = new Uint8Array(await blob.arrayBuffer());
          const pngImage = await outDoc.embedPng(pngBytes);
          const newPage = outDoc.addPage([pointWidth, pointHeight]);
          newPage.drawImage(pngImage, { x: 0, y: 0, width: pointWidth, height: pointHeight });
        } else {
          const [copiedPage] = await outDoc.copyPages(srcDoc, [i]);
          outDoc.addPage(copiedPage);
        }
      }

      const outBytes = await outDoc.save();
      return new Blob([outBytes], { type: 'application/pdf' });
    }

    function onModalClick(e) {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'pdfredact-cancel') {
        close(null);
      } else if (action === 'pdfredact-undo') {
        const list = boxesByPage.get(currentPage) || [];
        list.pop();
        boxesByPage.set(currentPage, list);
        drawOverlay();
        updateStatus();
      } else if (action === 'pdfredact-clear') {
        boxesByPage.set(currentPage, []);
        drawOverlay();
        updateStatus();
      } else if (action === 'pdfredact-prev') {
        if (currentPage > 1) { currentPage--; renderCurrentPage(); }
      } else if (action === 'pdfredact-next') {
        if (currentPage < numPages) { currentPage++; renderCurrentPage(); }
      } else if (action === 'pdfredact-apply') {
        statusEl.textContent = 'İşleniyor…';
        applyRedactions().then((blob) => close(blob)).catch((err) => {
          console.error('PDF redaction apply failed:', err);
          statusEl.textContent = 'Hata: redaksiyon uygulanamadı';
        });
      }
    }

    await renderCurrentPage();
    modal.style.display = 'flex';
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);
    modal.addEventListener('click', onModalClick);
  });
}
