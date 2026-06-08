// =====================================================================
//  Shared helpers: Supabase client, money formatting, invoice + WhatsApp
// =====================================================================
(function () {
  const cfg = window.APP_CONFIG || {};

  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR-PROJECT") &&
    !cfg.SUPABASE_ANON_KEY.includes("YOUR-PUBLIC");

  let sb = null;
  if (configured && window.supabase) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  // Format a number as currency, with thousands separators.
  function money(n) {
    const v = Number(n || 0);
    return cfg.CURRENCY + v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function invoiceNo(orderNo, dateStr) {
    const year = (dateStr ? new Date(dateStr) : new Date()).getFullYear();
    return "INV-" + year + "-" + String(orderNo).padStart(4, "0");
  }

  function fmtDate(d) {
    return new Date(d).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  // Build the plain-text invoice that gets sent to WhatsApp.
  function buildInvoiceText(order, profile) {
    const lines = [];
    lines.push("*" + cfg.STORE_NAME + " — New Order*");
    lines.push("Invoice: " + invoiceNo(order.order_no, order.created_at));
    lines.push("Date: " + fmtDate(order.created_at));
    if (profile) {
      lines.push("Customer: " + (profile.shop_name || profile.contact_name || ""));
      if (profile.contact_name && profile.shop_name) lines.push("Contact: " + profile.contact_name);
      if (profile.phone) lines.push("Phone: " + profile.phone);
    }
    lines.push("");
    lines.push("*Items*");
    order.items.forEach((it, i) => {
      lines.push(
        (i + 1) + ". " + it.name + " (" + it.unit + ")  " +
        it.qty + " × " + money(it.price) + " = " + money(it.qty * it.price)
      );
    });
    lines.push("");
    lines.push("Subtotal: " + money(order.subtotal));
    if (order.discount_amount > 0) {
      lines.push("Discount (" + order.discount_pct + "%): -" + money(order.discount_amount));
    }
    if (order.tax_amount > 0) {
      lines.push(cfg.TAX_LABEL + " (" + order.tax_rate + "%): " + money(order.tax_amount));
    }
    lines.push("*TOTAL: " + money(order.total) + "*");
    if (order.note) {
      lines.push("");
      lines.push("Note: " + order.note);
    }
    return lines.join("\n");
  }

  function whatsappLink(text, toNumber) {
    const num = (toNumber || cfg.STORE_WHATSAPP || "").replace(/[^0-9]/g, "");
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(text);
  }

  // Build a hosted checkout URL for an order's total, or null if payments
  // are not configured. Keeps card handling entirely on the provider's
  // trusted page — nothing sensitive ever touches this site.
  function paymentLink(order) {
    const link = (cfg.PAYMENT_LINK || "").trim();
    if (!link || !order) return null;
    const amount = Number(order.total || 0).toFixed(2);
    const provider = (cfg.PAYMENT_PROVIDER || "").toLowerCase();

    if (provider === "paypal") {
      // PayPal.me accepts /AMOUNTCURRENCY to pre-fill the amount, e.g. /48.00USD
      const base = link.replace(/\/+$/, "");
      return base + "/" + amount + (cfg.PAYMENT_CURRENCY || "USD");
    }

    // Generic hosted link (Stripe Payment Link, Square, etc.). Fill in any
    // {amount} / {invoice} placeholders; otherwise return the link as-is.
    const inv = invoiceNo(order.order_no, order.created_at);
    if (link.includes("{amount}") || link.includes("{invoice}")) {
      return link.replace(/\{amount\}/g, encodeURIComponent(amount))
                 .replace(/\{invoice\}/g, encodeURIComponent(inv));
    }
    return link;
  }

  // Upload a product photo to Supabase Storage and return its public URL.
  async function uploadProductImage(file) {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await sb.storage.from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = sb.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  }

  // Upload a reseller application document (resale cert / state ID) to the
  // PRIVATE "reseller-docs" bucket and return its storage path. Called during
  // signup, before any session exists, using the anon key.
  async function uploadResellerDoc(file, baseName) {
    if (!file) return null;
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = (baseName || "doc") + "_" + Date.now() + "_" +
      Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await sb.storage.from("reseller-docs")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw error;
    return path;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  window.Store = {
    cfg, sb, configured,
    money, invoiceNo, fmtDate,
    buildInvoiceText, whatsappLink, paymentLink, escapeHtml, uploadProductImage, uploadResellerDoc
  };
})();
