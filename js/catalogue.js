// =====================================================================
//  Catalogue PDF export (admin only).
//  Pulls every product — grouped by category, with images, price, MOQ
//  and live inventory — into a polished, shareable PDF catalogue.
//  Pure client-side (jsPDF); nothing leaves the browser.
// =====================================================================
(function () {
  // Page geometry (mm, A4 portrait).
  const PW = 210, PH = 297, M = 12, FOOT = 12;
  const COLS = 2, COL_GAP = 8;
  const COL_W = (PW - M * 2 - COL_GAP) / COLS;
  const IMG = 26, CARD_H = 30, ROW_GAP = 6;
  const BOTTOM = PH - FOOT;
  const GREEN = [22, 107, 58], INK = [28, 32, 36], GREY = [110, 116, 122], WARN = [180, 83, 9];

  // Load an image URL into a JPEG data-URL (+ natural size). Resolves null on
  // any failure (missing file, CORS taint) so one bad image never breaks export.
  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          resolve({ dataURL: c.toDataURL("image/jpeg", 0.82), w: img.naturalWidth, h: img.naturalHeight });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function money(cfg, n) { return (cfg.CURRENCY || "$") + Number(n || 0).toFixed(2); }

  function stockText(p, cfg) {
    if (p.stock == null) return "In stock";
    if (p.stock <= 0) return "Out of stock";
    const low = Number(cfg.LOW_STOCK_THRESHOLD || 5);
    return p.stock <= low ? ("Low · " + p.stock + " left") : (p.stock + " in stock");
  }

  function firstHeader(doc, cfg, count, catCount) {
    doc.setFillColor.apply(doc, GREEN);
    doc.rect(0, 0, PW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(cfg.STORE_NAME || "Wholesale Catalogue", M, 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(cfg.STORE_TAGLINE || "Wholesale Product Catalogue", M, 20);
    doc.setFontSize(8);
    const d = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    doc.text(count + " products · " + catCount + " categories · " + d, PW - M, 20, { align: "right" });
    return 32;
  }

  function runningHeader(doc, cfg) {
    doc.setTextColor.apply(doc, GREY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text((cfg.STORE_NAME || "Catalogue") + " — Wholesale Catalogue", M, 10);
    doc.setDrawColor(225, 228, 231); doc.setLineWidth(0.2);
    doc.line(M, 12, PW - M, 12);
    return 18;
  }

  function footers(doc, cfg) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setTextColor.apply(doc, GREY);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      const left = (cfg.STORE_NAME || "") + (cfg.STORE_WHATSAPP ? "  ·  WhatsApp " + cfg.STORE_WHATSAPP : "");
      doc.text(left, M, PH - 6);
      doc.text("Page " + i + " of " + n, PW - M, PH - 6, { align: "right" });
    }
  }

  // Contents / index box on the first page: every real category + item count,
  // plus the tracked inventory value. Categories come only from the data.
  function contents(doc, y, cats, map, products, cfg) {
    const invValue = products.reduce((s, p) => s + (p.stock != null ? Number(p.price || 0) * p.stock : 0), 0);
    const rows = Math.ceil(cats.length / 2);
    const h = 12 + rows * 5.5 + 6;
    doc.setDrawColor(225, 228, 231); doc.setFillColor(250, 251, 251);
    doc.roundedRect(M, y, PW - M * 2, h, 2, 2, "FD");
    doc.setTextColor.apply(doc, INK); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Contents", M + 4, y + 7);

    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const colW = (PW - M * 2 - 8) / 2;
    cats.forEach((c, i) => {
      const cx = M + 4 + (i % 2) * colW;
      const cy = y + 12 + Math.floor(i / 2) * 5.5;
      doc.setTextColor.apply(doc, INK);
      doc.text(String(c), cx, cy);
      doc.setTextColor.apply(doc, GREY);
      doc.text(map[c].length + " item" + (map[c].length === 1 ? "" : "s"), cx + colW - 8, cy, { align: "right" });
    });

    doc.setDrawColor(230, 232, 235); doc.line(M + 4, y + h - 5.5, PW - M - 4, y + h - 5.5);
    doc.setTextColor.apply(doc, GREEN); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text("Tracked inventory value: " + (cfg.CURRENCY || "$") + invValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      M + 4, y + h - 1.5);
    return y + h + 5;
  }

  function categoryBand(doc, y, cat, n) {
    doc.setFillColor.apply(doc, GREEN);
    doc.rect(M, y, PW - M * 2, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(String(cat).toUpperCase(), M + 3, y + 5.6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(n + " item" + (n === 1 ? "" : "s"), PW - M - 3, y + 5.6, { align: "right" });
    return y + 8 + 4;
  }

  function card(doc, x, y, p, img, cfg) {
    doc.setDrawColor(225, 228, 231); doc.setLineWidth(0.2);
    doc.roundedRect(x, y, COL_W, CARD_H, 2, 2, "S");

    const pad = 3, bx = x + pad, by = y + pad;
    doc.setFillColor(245, 248, 247);
    doc.roundedRect(bx, by, IMG, IMG, 1.5, 1.5, "F");
    if (img) {
      const r = Math.min(IMG / img.w, IMG / img.h);
      const dw = img.w * r, dh = img.h * r;
      doc.addImage(img.dataURL, "JPEG", bx + (IMG - dw) / 2, by + (IMG - dh) / 2, dw, dh);
    } else {
      doc.setTextColor.apply(doc, GREY); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text("No image", bx + IMG / 2, by + IMG / 2 + 1, { align: "center" });
    }

    const tx = x + pad + IMG + 3, tw = COL_W - pad * 2 - IMG - 3;
    let ty = y + pad + 3.2;

    doc.setTextColor.apply(doc, INK); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(p.name || "", tw).slice(0, 2);
    doc.text(nameLines, tx, ty); ty += 3.8 * nameLines.length + 0.6;

    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor.apply(doc, GREY);
    doc.text(doc.splitTextToSize(p.unit || "", tw).slice(0, 1), tx, ty); ty += 4.4;

    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor.apply(doc, GREEN);
    doc.text(money(cfg, p.price), tx, ty); ty += 4.6;

    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor.apply(doc, GREY);
    doc.text("MOQ " + (p.moq || 1) + "   ·   " + stockText(p, cfg), tx, ty);

    if (!p.active) {
      doc.setTextColor.apply(doc, WARN); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
      doc.text("HIDDEN", x + COL_W - pad, y + pad + 2.5, { align: "right" });
    }
  }

  async function exportCatalogue(products, cfg) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library failed to load. Check your connection and try again.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

    // Preload all images in parallel.
    const imgs = {};
    await Promise.all(products.filter((p) => p.image_url).map((p) =>
      loadImage(p.image_url).then((d) => { if (d) imgs[p.id] = d; })));

    // Group by category, preserving the incoming order.
    const cats = [], map = {};
    products.forEach((p) => {
      const c = p.category || "General";
      if (!map[c]) { map[c] = []; cats.push(c); }
      map[c].push(p);
    });

    let y = firstHeader(doc, cfg, products.length, cats.length);
    const newPage = () => { doc.addPage(); y = runningHeader(doc, cfg); };
    if (cats.length > 1) y = contents(doc, y, cats, map, products, cfg);

    cats.forEach((cat) => {
      if (y + 12 + CARD_H > BOTTOM) newPage();
      y = categoryBand(doc, y, cat, map[cat].length);

      let col = 0;
      map[cat].forEach((p) => {
        if (col === 0 && y + CARD_H > BOTTOM) newPage();
        const x = M + col * (COL_W + COL_GAP);
        card(doc, x, y, p, imgs[p.id], cfg);
        col++;
        if (col >= COLS) { col = 0; y += CARD_H + ROW_GAP; }
      });
      if (col !== 0) y += CARD_H + ROW_GAP; // close a half-filled row
      y += 2;
    });

    footers(doc, cfg);

    const safe = (cfg.STORE_NAME || "catalogue").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    doc.save(safe + "_catalogue_" + new Date().toISOString().slice(0, 10) + ".pdf");
  }

  window.Catalogue = { export: exportCatalogue };
})();
