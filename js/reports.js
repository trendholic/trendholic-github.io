// =====================================================================
//  Financial reports (admin only): client ledger statements + P/L.
//  Pure client-side PDF generation with jsPDF.
// =====================================================================
(function () {
  const PW = 210, PH = 297, M = 12, FOOT = 12, BOTTOM = PH - FOOT;
  const GREEN = [22, 107, 58], INK = [28, 32, 36], GREY = [110, 116, 122];
  const DANGER = [192, 57, 43], LINE = [225, 228, 231];

  function money(cfg, n) {
    const v = Number(n || 0);
    return (cfg.CURRENCY || "$") + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(d) {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function invNo(o) {
    const y = new Date(o.created_at || Date.now()).getFullYear();
    return "INV-" + y + "-" + String(o.order_no).padStart(4, "0");
  }

  function bandHeader(doc, cfg, title, sub) {
    doc.setFillColor.apply(doc, GREEN); doc.rect(0, 0, PW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    doc.text(cfg.STORE_NAME || "Store", M, 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(title, M, 20);
    if (sub) { doc.setFontSize(8); doc.text(sub, PW - M, 20, { align: "right" }); }
    return 32;
  }
  function footers(doc, cfg) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setTextColor.apply(doc, GREY); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      doc.text((cfg.STORE_NAME || "") + (cfg.STORE_WHATSAPP ? "  ·  WhatsApp " + cfg.STORE_WHATSAPP : ""), M, PH - 6);
      doc.text("Page " + i + " of " + n, PW - M, PH - 6, { align: "right" });
    }
  }

  // Generic table: cols = [{title, w, align}], rows = [[cell,...]].
  function table(doc, x, y, cols, rows, opts) {
    opts = opts || {};
    const rowH = opts.rowH || 7, headH = 8;
    const drawHead = () => {
      doc.setFillColor(238, 244, 240); doc.rect(x, y, cols.reduce((s, c) => s + c.w, 0), headH, "F");
      doc.setTextColor.apply(doc, GREEN); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      let cx = x;
      cols.forEach((c) => { doc.text(c.title, c.align === "right" ? cx + c.w - 2 : cx + 2, y + 5.4, { align: c.align || "left" }); cx += c.w; });
      y += headH;
    };
    drawHead();
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    rows.forEach((r) => {
      if (y + rowH > BOTTOM) { doc.addPage(); y = M + 4; drawHead(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); }
      let cx = x;
      cols.forEach((c, i) => {
        const cell = r[i] || {};
        doc.setTextColor.apply(doc, cell.color || INK);
        if (cell.bold) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
        const txt = doc.splitTextToSize(String(cell.text == null ? "" : cell.text), c.w - 4)[0] || "";
        doc.text(txt, c.align === "right" ? cx + c.w - 2 : cx + 2, y + 4.8, { align: c.align || "left" });
        cx += c.w;
      });
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.15);
      doc.line(x, y + rowH, x + cols.reduce((s, c) => s + c.w, 0), y + rowH);
      y += rowH;
    });
    return y;
  }

  // ---- Client ledger / account statement ----
  function ledgerPDF(client, orders, payments, cfg) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // Build chronological transactions (orders = debit, payments = credit).
    const tx = [];
    (orders || []).filter((o) => o.status !== "cancelled").forEach((o) =>
      tx.push({ date: o.created_at, desc: "Order " + invNo(o), debit: Number(o.total || 0), credit: 0 }));
    (payments || []).forEach((p) =>
      tx.push({ date: p.created_at, desc: "Payment" + (p.method ? " (" + p.method + ")" : "") + (p.note ? " — " + p.note : ""), debit: 0, credit: Number(p.amount || 0) }));
    tx.sort((a, b) => new Date(a.date) - new Date(b.date));

    let bal = 0, totD = 0, totC = 0;
    const rows = tx.map((t) => {
      bal += t.debit - t.credit; totD += t.debit; totC += t.credit;
      return [
        { text: fmtDate(t.date) },
        { text: t.desc },
        { text: t.debit ? money(cfg, t.debit) : "", align: "right" },
        { text: t.credit ? money(cfg, t.credit) : "", align: "right", color: GREEN },
        { text: money(cfg, bal), align: "right", bold: true, color: bal > 0 ? DANGER : INK },
      ];
    });

    let y = bandHeader(doc, cfg, "Account Statement", fmtDate(new Date()));

    // Client block
    doc.setTextColor.apply(doc, INK); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(client.shop_name || client.contact_name || "Client", M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor.apply(doc, GREY);
    let yy = y + 4.5;
    [client.contact_name, client.phone, client.company_address]
      .filter(Boolean).forEach((l) => { doc.text(String(l), M, yy); yy += 4; });

    // Outstanding balance callout (right)
    const outstanding = totD - totC;
    const boxW = 64, boxX = PW - M - boxW;
    doc.setFillColor(outstanding > 0 ? 253 : 234, outstanding > 0 ? 240 : 246, outstanding > 0 ? 240 : 239);
    doc.roundedRect(boxX, y - 4, boxW, 18, 2, 2, "F");
    doc.setTextColor.apply(doc, GREY); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("Outstanding balance", boxX + boxW / 2, y + 1, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.setTextColor.apply(doc, outstanding > 0 ? DANGER : GREEN);
    doc.text(money(cfg, outstanding), boxX + boxW / 2, y + 9, { align: "center" });

    y = Math.max(yy, y + 16) + 4;

    const cols = [
      { title: "Date", w: 28 }, { title: "Description", w: 82 },
      { title: "Charge", w: 26, align: "right" }, { title: "Paid", w: 26, align: "right" },
      { title: "Balance", w: 24, align: "right" },
    ];
    if (!rows.length) {
      doc.setTextColor.apply(doc, GREY); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text("No transactions yet.", M, y + 6);
    } else {
      y = table(doc, M, y, cols, rows);
      // totals row
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, INK);
      doc.text("Totals", M + 2, y + 5);
      doc.text(money(cfg, totD), M + 28 + 82 + 26 - 2, y + 5, { align: "right" });
      doc.text(money(cfg, totC), M + 28 + 82 + 26 + 26 - 2, y + 5, { align: "right" });
      doc.setTextColor.apply(doc, outstanding > 0 ? DANGER : GREEN);
      doc.text(money(cfg, outstanding), PW - M - 2, y + 5, { align: "right" });
    }

    footers(doc, cfg);
    const safe = (client.shop_name || client.contact_name || "client").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    doc.save(safe + "_statement_" + new Date().toISOString().slice(0, 10) + ".pdf");
  }

  // ---- Profit & Loss report ----
  function plPDF(stats, cfg) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let y = bandHeader(doc, cfg, "Profit & Loss", fmtDate(new Date()));

    const cards = [
      ["Net revenue", money(cfg, stats.revenue), GREEN],
      ["Cost of goods (COGS)", money(cfg, stats.cogs), INK],
      ["Gross profit", money(cfg, stats.profit), stats.profit >= 0 ? GREEN : DANGER],
      ["Margin", stats.margin.toFixed(1) + "%", INK],
    ];
    const cw = (PW - M * 2 - 9) / 4;
    cards.forEach((c, i) => {
      const x = M + i * (cw + 3);
      doc.setDrawColor.apply(doc, LINE); doc.setFillColor(250, 251, 251);
      doc.roundedRect(x, y, cw, 20, 2, 2, "FD");
      doc.setTextColor.apply(doc, GREY); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text(c[0], x + cw / 2, y + 6, { align: "center" });
      doc.setTextColor.apply(doc, c[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(String(c[1]), x + cw / 2, y + 14, { align: "center" });
    });
    y += 28;

    doc.setTextColor.apply(doc, INK); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Monthly breakdown", M, y); y += 4;
    const cols = [
      { title: "Month", w: 46 }, { title: "Orders", w: 28, align: "right" },
      { title: "Revenue", w: 38, align: "right" }, { title: "COGS", w: 38, align: "right" },
      { title: "Profit", w: 36, align: "right" },
    ];
    const rows = (stats.byMonth || []).map((m) => [
      { text: m.month }, { text: m.orders, align: "right" },
      { text: money(cfg, m.revenue), align: "right" },
      { text: money(cfg, m.cogs), align: "right" },
      { text: money(cfg, m.profit), align: "right", bold: true, color: m.profit >= 0 ? GREEN : DANGER },
    ]);
    if (rows.length) y = table(doc, M, y, cols, rows);

    footers(doc, cfg);
    doc.save("profit_loss_" + new Date().toISOString().slice(0, 10) + ".pdf");
  }

  window.Reports = { ledgerPDF, plPDF };
})();
