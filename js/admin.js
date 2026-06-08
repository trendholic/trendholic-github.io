// =====================================================================
//  Admin console: approve customers, manage products, view orders.
//  All write access is enforced server-side by RLS (is_admin()).
// =====================================================================
(function () {
  const S = window.Store;
  const cfg = S.cfg;
  const $ = (id) => document.getElementById(id);

  let me = null;
  let categories = [];        // distinct categories that already exist in the store
  const NEW_CAT = "__new__";  // sentinel option value for "add new category"

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    $("brandName").textContent = cfg.STORE_NAME + " — Admin";

    if (!S.configured || !S.sb) { show("setup"); return; }

    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      msg("");
      const { error } = await S.sb.auth.signInWithPassword({
        email: $("email").value.trim(), password: $("password").value
      });
      if (error) msg(error.message, true);
    });
    $("logoutBtn").addEventListener("click", () => S.sb.auth.signOut());

    // tabs
    document.querySelectorAll(".admin-tab").forEach((b) =>
      b.addEventListener("click", () => selectTab(b.dataset.tab)));

    $("addProductForm").addEventListener("submit", addProduct);
    $("exportCatalogueBtn").addEventListener("click", exportCatalogue);

    // Smart category picker: reveal the "new category" field only when chosen,
    // so the admin reuses existing categories and avoids typo-duplicates.
    $("pCategory").addEventListener("change", () => {
      const isNew = $("pCategory").value === NEW_CAT;
      $("pCategoryNewWrap").hidden = !isNew;
      if (isNew) $("pCategoryNew").focus();
    });

    // finance / payments
    $("payCancel").addEventListener("click", closePaymentModal);
    $("paymentForm").addEventListener("submit", savePayment);
    setupFinanceRange();
    $("exportPlBtn").addEventListener("click", () => {
      if (financeData) window.Reports.plPDF(financeData.pl, cfg);
      else alert("Open the Finance tab first.");
    });

    setupIdleLogout();

    S.sb.auth.onAuthStateChange((_e, session) => session ? gate() : show("auth"));
    const { data } = await S.sb.auth.getSession();
    data.session ? gate() : show("auth");
  }

  // ---- security: auto sign-out after a period of inactivity ----
  function setupIdleLogout() {
    const IDLE_MS = (Number(cfg.ADMIN_IDLE_MINUTES) || 20) * 60 * 1000;
    let timer = null;
    const reset = () => {
      clearTimeout(timer);
      if (!me) return;                       // only count down while signed in
      timer = setTimeout(() => {
        if (me) { alert("Signed out after inactivity for security."); S.sb.auth.signOut(); }
      }, IDLE_MS);
    };
    ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) =>
      document.addEventListener(ev, reset, { passive: true }));
    window.addEventListener("focus", reset);
    resetIdle = reset;                        // expose so gate() can arm it on login
  }
  let resetIdle = () => {};

  function show(view) {
    document.querySelectorAll("[data-view]").forEach((el) =>
      el.hidden = el.getAttribute("data-view") !== view);
    $("topActions").hidden = view !== "app";
  }
  function msg(t, err) {
    const el = $("authMsg"); el.textContent = t;
    el.className = "msg" + (t ? (err ? " error" : " ok") : "");
  }

  async function gate() {
    const { data: { user } } = await S.sb.auth.getUser();
    const { data } = await S.sb.from("profiles").select("*").eq("id", user.id).single();
    if (!data || !data.is_admin) {
      show("denied");
      return;
    }
    me = data;
    show("app");
    resetIdle();                 // start the inactivity timer now that we're in
    await refreshCategories();   // load existing categories for the picker
    refreshBadges();             // pending-customers / unpaid-orders counts
    selectTab("customers");
  }

  // ---- categories: pulled live from existing products (never invented) ----
  async function refreshCategories() {
    const { data } = await S.sb.from("products").select("category");
    const set = new Set((data || []).map((r) => (r.category || "").trim()).filter(Boolean));
    categories = [...set].sort((a, b) => a.localeCompare(b));
    populateCategorySelect();
  }

  function populateCategorySelect() {
    const sel = $("pCategory");
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML =
      categories.map((c) => `<option value="${S.escapeHtml(c)}">${S.escapeHtml(c)}</option>`).join("") +
      `<option value="${NEW_CAT}">➕ Add new category…</option>`;
    if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
    $("pCategoryNewWrap").hidden = sel.value !== NEW_CAT;
  }

  // Build a <select> of all categories for inline re-categorising of a product,
  // always including the product's current value even if unusual.
  function categoryOptions(current) {
    const list = categories.includes(current) || !current ? categories : [current, ...categories];
    return list.map((c) => `<option value="${S.escapeHtml(c)}" ${c === current ? "selected" : ""}>${S.escapeHtml(c)}</option>`).join("");
  }

  // ---- tab badges (pending customers / unpaid orders) ----
  function setTabBadge(tab, n, cls) {
    const btn = document.querySelector('.admin-tab[data-tab="' + tab + '"]');
    if (!btn) return;
    let b = btn.querySelector(".tab-badge");
    if (!b) { b = document.createElement("span"); b.className = "tab-badge"; btn.appendChild(b); }
    if (!n) { b.hidden = true; return; }
    b.hidden = false; b.textContent = n; b.className = "tab-badge" + (cls ? " " + cls : "");
  }

  async function refreshBadges() {
    const pend = await S.sb.from("profiles").select("id", { count: "exact", head: true }).eq("approved", false);
    setTabBadge("customers", pend.count || 0, "warn");
    const unpaid = await S.sb.from("orders").select("id", { count: "exact", head: true }).neq("payment_status", "paid");
    setTabBadge("orders", unpaid.count || 0, "warn");
    const prods = await S.sb.from("products").select("id", { count: "exact", head: true });
    setTabBadge("products", prods.count || 0, "");
  }

  function selectTab(tab) {
    document.querySelectorAll(".admin-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll("[data-panel]").forEach((p) =>
      p.hidden = p.getAttribute("data-panel") !== tab);
    if (tab === "customers") loadCustomers();
    if (tab === "products") loadProducts();
    if (tab === "inventory") loadInventory();
    if (tab === "orders") loadOrders();
    if (tab === "finance") loadFinance();
  }

  // ---------------- Customers ----------------
  async function loadCustomers() {
    const { data, error } = await S.sb.from("profiles")
      .select("*").order("created_at", { ascending: false });
    const wrap = $("customersList");
    if (error) { wrap.innerHTML = '<p class="msg error">' + S.escapeHtml(error.message) + "</p>"; return; }
    if (!data.length) { wrap.innerHTML = '<p class="muted">No customers yet.</p>'; return; }

    wrap.innerHTML = "";
    data.forEach((c) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="admin-row-main">
          <div class="admin-row-title">
            ${S.escapeHtml(c.shop_name || "(no shop name)")}
            ${c.is_admin ? '<span class="pill">admin</span>' : ""}
            ${c.approved ? '<span class="pill ok">approved</span>' : '<span class="pill warn">pending</span>'}
          </div>
          <div class="muted small">
            ${S.escapeHtml(c.contact_name || "")}${c.phone ? " · " + S.escapeHtml(c.phone) : ""}
          </div>
        </div>
        <div class="admin-row-actions">
          <label class="inline">Discount %
            <input type="number" min="0" max="100" step="1" value="${c.discount_pct || 0}" class="disc" style="width:70px" />
          </label>
          <button class="btn small ${c.approved ? "ghost" : "primary"}" data-act="approve">
            ${c.approved ? "Revoke" : "Approve"}
          </button>
        </div>`;

      row.querySelector('[data-act="approve"]').addEventListener("click", async (e) => {
        e.target.disabled = true;
        const disc = parseFloat(row.querySelector(".disc").value) || 0;
        const { error } = await S.sb.from("profiles")
          .update({ approved: !c.approved, discount_pct: disc }).eq("id", c.id);
        if (error) alert(error.message);
        loadCustomers();
        refreshBadges();
      });
      row.querySelector(".disc").addEventListener("change", async (e) => {
        const disc = parseFloat(e.target.value) || 0;
        const { error } = await S.sb.from("profiles").update({ discount_pct: disc }).eq("id", c.id);
        if (error) alert(error.message);
      });
      wrap.appendChild(row);
    });
  }

  // ---------------- Catalogue PDF export ----------------
  async function exportCatalogue() {
    const btn = $("exportCatalogueBtn");
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Building PDF…";
    try {
      const { data, error } = await S.sb.from("products")
        .select("*").order("category").order("sort").order("name");
      if (error) throw error;
      if (!data || !data.length) { alert("No products to export yet."); return; }
      await window.Catalogue.export(data, cfg);
    } catch (err) {
      alert("Could not build the catalogue: " + (err.message || err));
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }

  // ---------------- Products ----------------
  async function addProduct(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      let image_url = null;
      const file = $("pImage").files[0];
      if (file) image_url = await S.uploadProductImage(file);

      const stockRaw = $("pStock").value.trim();
      let category = $("pCategory").value;
      if (category === NEW_CAT) category = $("pCategoryNew").value.trim();
      category = category.trim() || "General";

      const payload = {
        name: $("pName").value.trim(),
        description: $("pDesc").value.trim() || null,
        image_url,
        category,
        unit: $("pUnit").value.trim() || "unit",
        price: parseFloat($("pPrice").value) || 0,
        cost: parseFloat($("pCost").value) || 0,
        moq: parseInt($("pMoq").value, 10) || 1,
        stock: stockRaw === "" ? null : Math.max(0, parseInt(stockRaw, 10) || 0),
        sort: parseInt($("pSort").value, 10) || 0
      };
      const { error } = await S.sb.from("products").insert(payload);
      if (error) throw error;
      e.target.reset();
      $("pCategoryNewWrap").hidden = true;
      await refreshCategories();   // pick up a newly added category
      loadProducts();
    } catch (err) {
      alert(err.message || err);
    } finally {
      btn.disabled = false; btn.textContent = "Add product";
    }
  }

  async function loadProducts() {
    const { data, error } = await S.sb.from("products")
      .select("*").order("category").order("sort").order("name");
    const wrap = $("productsList");
    if (error) { wrap.innerHTML = '<p class="msg error">' + S.escapeHtml(error.message) + "</p>"; return; }
    if (!data.length) { wrap.innerHTML = '<p class="muted">No products yet.</p>'; return; }

    wrap.innerHTML = "";
    data.forEach((p) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      const thumb = p.image_url
        ? `<img src="${S.escapeHtml(p.image_url)}" alt="" />`
        : `<span class="card-thumb-ph">🌾</span>`;
      row.innerHTML = `
        <div class="admin-thumb" title="Change photo">
          ${thumb}
          <input type="file" accept="image/*" class="photo-input" />
          <span class="admin-thumb-edit">📷</span>
        </div>
        <div class="admin-row-main">
          <div class="admin-row-title">
            ${S.escapeHtml(p.name)}
            ${p.active ? "" : '<span class="pill warn">hidden</span>'}
            ${stockBadge(p)}
            ${marginBadge(p)}
          </div>
          <div class="muted small">${S.escapeHtml(p.unit)} · MOQ ${p.moq}</div>
        </div>
        <div class="admin-row-actions">
          <label class="inline">Category
            <select class="cat" style="width:auto">${categoryOptions(p.category)}</select>
          </label>
          <label class="inline">Cost ${cfg.CURRENCY}
            <input type="number" min="0" step="0.01" value="${p.cost || 0}" class="cost" style="width:80px" />
          </label>
          <label class="inline">Sell ${cfg.CURRENCY}
            <input type="number" min="0" step="0.01" value="${p.price}" class="price" style="width:80px" />
          </label>
          <button class="btn small ghost" data-act="toggle">${p.active ? "Hide" : "Show"}</button>
          <button class="btn small" data-act="del">Delete</button>
        </div>`;

      row.querySelector(".cat").addEventListener("change", async (e) => {
        const { error } = await S.sb.from("products").update({ category: e.target.value }).eq("id", p.id);
        if (error) alert(error.message); else loadProducts();
      });
      row.querySelector(".cost").addEventListener("change", async (e) => {
        const cost = parseFloat(e.target.value) || 0;
        const { error } = await S.sb.from("products").update({ cost }).eq("id", p.id);
        if (error) alert(error.message); else loadProducts();
      });

      row.querySelector(".photo-input").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const image_url = await S.uploadProductImage(file);
          const { error } = await S.sb.from("products").update({ image_url }).eq("id", p.id);
          if (error) throw error;
          loadProducts();
        } catch (err) { alert(err.message || err); }
      });

      row.querySelector(".price").addEventListener("change", async (e) => {
        const price = parseFloat(e.target.value) || 0;
        const { error } = await S.sb.from("products").update({ price }).eq("id", p.id);
        if (error) alert(error.message);
      });
      row.querySelector('[data-act="toggle"]').addEventListener("click", async () => {
        const { error } = await S.sb.from("products").update({ active: !p.active }).eq("id", p.id);
        if (error) alert(error.message); else loadProducts();
      });
      row.querySelector('[data-act="del"]').addEventListener("click", async () => {
        if (!confirm("Delete " + p.name + "?")) return;
        const { error } = await S.sb.from("products").delete().eq("id", p.id);
        if (error) alert(error.message); else loadProducts();
      });
      wrap.appendChild(row);
    });
  }

  // ---------------- Inventory ----------------
  function lowStock() { return Number(cfg.LOW_STOCK_THRESHOLD || 5); }

  function stockBadge(p) {
    if (p.stock == null) return '<span class="pill">untracked</span>';
    if (p.stock <= 0) return '<span class="pill warn">out of stock</span>';
    if (p.stock <= lowStock()) return '<span class="pill warn">low · ' + p.stock + ' left</span>';
    return '<span class="pill ok">' + p.stock + ' in stock</span>';
  }

  function marginBadge(p) {
    const price = Number(p.price || 0), cost = Number(p.cost || 0);
    if (!cost) return '<span class="pill">set cost</span>';
    const m = price > 0 ? (price - cost) / price * 100 : 0;
    return '<span class="pill ' + (m <= 0 ? "warn" : "ok") + '">' + m.toFixed(0) + "% margin</span>";
  }

  async function setStock(id, value) {
    const stock = value === "" ? null : Math.max(0, parseInt(value, 10) || 0);
    const { error } = await S.sb.from("products").update({ stock }).eq("id", id);
    if (error) alert(error.message);
    return !error;
  }

  async function loadInventory() {
    const { data, error } = await S.sb.from("products")
      .select("*").order("category").order("name");
    const wrap = $("inventoryList");
    const sum = $("invSummary");
    if (error) { wrap.innerHTML = '<p class="msg error">' + S.escapeHtml(error.message) + "</p>"; sum.innerHTML = ""; return; }
    if (!data.length) { wrap.innerHTML = '<p class="muted">No products yet. Add some on the Products tab.</p>'; sum.innerHTML = ""; return; }

    const tracked = data.filter((p) => p.stock != null);
    const out = tracked.filter((p) => p.stock <= 0).length;
    const low = tracked.filter((p) => p.stock > 0 && p.stock <= lowStock()).length;
    const units = tracked.reduce((s, p) => s + (p.stock || 0), 0);
    sum.innerHTML =
      '<div class="inv-stat"><span class="inv-num">' + data.length + '</span>Products</div>' +
      '<div class="inv-stat"><span class="inv-num">' + tracked.length + '</span>Tracked</div>' +
      '<div class="inv-stat ' + (low ? "warn" : "") + '"><span class="inv-num">' + low + '</span>Low stock</div>' +
      '<div class="inv-stat ' + (out ? "danger" : "") + '"><span class="inv-num">' + out + '</span>Out of stock</div>' +
      '<div class="inv-stat"><span class="inv-num">' + units + '</span>Units on hand</div>';

    wrap.innerHTML = "";
    data.forEach((p) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="admin-row-main">
          <div class="admin-row-title">${S.escapeHtml(p.name)} ${stockBadge(p)}</div>
          <div class="muted small">${S.escapeHtml(p.category)} · ${S.escapeHtml(p.unit)}</div>
        </div>
        <div class="admin-row-actions">
          <label class="inline">On hand
            <input type="number" min="0" step="1" value="${p.stock == null ? "" : p.stock}"
                   placeholder="untracked" class="stock" style="width:90px" />
          </label>
          <button class="btn small ghost" data-act="restock">Restock +10</button>
        </div>`;

      const input = row.querySelector(".stock");
      input.addEventListener("change", async () => {
        if (await setStock(p.id, input.value.trim())) loadInventory();
      });
      row.querySelector('[data-act="restock"]').addEventListener("click", async () => {
        const base = p.stock == null ? 0 : p.stock;
        if (await setStock(p.id, String(base + 10))) loadInventory();
      });
      wrap.appendChild(row);
    });
  }

  // ---------------- Orders ----------------
  async function loadOrders() {
    const wrap = $("ordersList");
    const [oRes, pRes] = await Promise.all([
      S.sb.from("orders").select("*, profiles(shop_name, contact_name, phone)")
        .order("created_at", { ascending: false }).limit(100),
      S.sb.from("payments").select("order_id, amount"),
    ]);
    if (oRes.error) { wrap.innerHTML = '<p class="msg error">' + S.escapeHtml(oRes.error.message) + "</p>"; return; }
    const data = oRes.data || [];
    if (!data.length) { wrap.innerHTML = '<p class="muted">No orders yet.</p>'; return; }

    // sum payments allocated to each invoice
    const paidByOrder = {};
    (pRes.data || []).forEach((p) => { if (p.order_id) paidByOrder[p.order_id] = (paidByOrder[p.order_id] || 0) + Number(p.amount || 0); });

    wrap.innerHTML = "";
    data.forEach((o) => {
      const prof = o.profiles || {};
      const card = document.createElement("div");
      card.className = "order-card";
      const itemsHtml = o.items.map((it) =>
        `<tr><td>${S.escapeHtml(it.name)} <span class="muted small">(${S.escapeHtml(it.unit)})</span></td>
             <td class="num">${it.qty}</td>
             <td class="num">${S.money(it.price)}</td>
             <td class="num">${S.money(it.qty * it.price)}</td></tr>`).join("");

      const total = Number(o.total || 0);
      const allocated = paidByOrder[o.id] || 0;
      // Fall back to the manual flag when no per-invoice payments are recorded.
      const paidAmt = allocated > 0 ? allocated : (o.payment_status === "paid" ? total : 0);
      const balance = Math.max(0, total - paidAmt);
      const payState = paidAmt >= total - 0.001 && total > 0 ? "paid" : paidAmt > 0 ? "partial" : "unpaid";
      const payPill = { paid: "ok", partial: "warn", unpaid: "warn" }[payState];
      const payLine = payState === "partial"
        ? "paid " + S.money(paidAmt) + " of " + S.money(total) + " · balance " + S.money(balance)
        : payState === "paid" ? "paid in full" + (o.paid_at ? " · " + S.fmtDate(o.paid_at) : "") : "unpaid";

      card.innerHTML = `
        <div class="order-head">
          <div>
            <strong>${S.invoiceNo(o.order_no, o.created_at)}</strong>
            <span class="pill status-${S.escapeHtml(o.status)}">${S.escapeHtml(o.status)}</span>
            <span class="pill ${payPill}">${payState}</span>
          </div>
          <div class="muted small">${S.fmtDate(o.created_at)}</div>
        </div>
        <div class="muted small">${S.escapeHtml(prof.shop_name || "")}${prof.phone ? " · " + S.escapeHtml(prof.phone) : ""} · ${payLine}</div>
        <table class="invoice-table"><tbody>${itemsHtml}</tbody></table>
        <div class="order-foot">
          <strong>Total ${S.money(total)}</strong>
          <div class="order-actions">
            <select class="status">
              ${["new","confirmed","fulfilled","cancelled"].map((s) =>
                `<option value="${s}" ${s===o.status?"selected":""}>${s}</option>`).join("")}
            </select>
            ${balance > 0 ? '<button class="btn small primary" data-act="pay">Record payment</button>' : '<span class="pill ok">✓ settled</span>'}
            <a class="btn small whatsapp" target="_blank">Reply on WhatsApp</a>
          </div>
        </div>`;

      card.querySelector(".status").addEventListener("change", async (e) => {
        const { error } = await S.sb.from("orders").update({ status: e.target.value }).eq("id", o.id);
        if (error) alert(error.message); else loadOrders();
      });
      const payBtn = card.querySelector('[data-act="pay"]');
      if (payBtn) payBtn.addEventListener("click", () => openPaymentModal(
        { id: o.user_id, shop_name: prof.shop_name, contact_name: prof.contact_name },
        { id: o.id, order_no: o.order_no, created_at: o.created_at, total, _paid: paidAmt },
        loadOrders));
      const wa = card.querySelector("a.whatsapp");
      wa.href = S.whatsappLink(S.buildInvoiceText(o, prof), prof.phone || "");
      if (!prof.phone) { wa.classList.add("disabled"); wa.removeAttribute("href"); wa.title = "No customer phone on file"; }

      wrap.appendChild(card);
    });
  }

  // ---------------- Finance: profit/loss + client ledgers ----------------
  let financeData = null;     // computed view for the current date range
  let financeRaw = null;      // all fetched orders/clients/payments
  const financeRange = { from: null, to: null };  // epoch ms bounds (null = open)
  let payClient = null, payOrder = null, payReload = null;

  function statCard(num, label, cls) {
    return '<div class="inv-stat ' + (cls || "") + '"><span class="inv-num">' +
      S.escapeHtml(String(num)) + "</span>" + label + "</div>";
  }

  async function loadFinance() {
    const wrapPL = $("plSummary");
    wrapPL.innerHTML = '<p class="muted">Loading…</p>'; $("plMonthly").innerHTML = ""; $("ledgerList").innerHTML = "";
    const [oRes, cRes, pRes] = await Promise.all([
      S.sb.from("orders").select("*").order("created_at", { ascending: true }),
      S.sb.from("profiles").select("*").order("shop_name"),
      S.sb.from("payments").select("*").order("created_at", { ascending: true }),
    ]);
    const err = oRes.error || cRes.error || pRes.error;
    if (err) { wrapPL.innerHTML = '<p class="msg error">' + S.escapeHtml(err.message) + "</p>"; return; }
    financeRaw = {
      orders: (oRes.data || []).filter((o) => o.status !== "cancelled"),
      clients: cRes.data || [],
      payments: pRes.data || [],
    };
    renderFinance();
  }

  function inRange(o) {
    const t = new Date(o.created_at).getTime();
    if (financeRange.from != null && t < financeRange.from) return false;
    if (financeRange.to != null && t > financeRange.to) return false;
    return true;
  }

  function rangeLabel() {
    if (financeRange.from == null && financeRange.to == null) return "All time";
    const d = (ms) => new Date(ms).toLocaleDateString();
    return (financeRange.from != null ? d(financeRange.from) : "start") + " – " +
           (financeRange.to != null ? d(financeRange.to) : "now");
  }

  function renderFinance() {
    if (!financeRaw) return;
    const live = financeRaw.orders.filter(inRange);
    const netOf = (o) => Number(o.subtotal || 0) - Number(o.discount_amount || 0);
    const revenue = live.reduce((s, o) => s + netOf(o), 0);
    const cogs = live.reduce((s, o) => s + Number(o.cost_total || 0), 0);
    const profit = live.reduce((s, o) => s + Number(o.profit || 0), 0);
    const margin = revenue > 0 ? profit / revenue * 100 : 0;

    const mMap = {};
    live.forEach((o) => {
      const d = new Date(o.created_at);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      const m = mMap[key] || (mMap[key] = { month: key, orders: 0, revenue: 0, cogs: 0, profit: 0 });
      m.orders++; m.revenue += netOf(o); m.cogs += Number(o.cost_total || 0); m.profit += Number(o.profit || 0);
    });
    const byMonth = Object.values(mMap).sort((a, b) => b.month.localeCompare(a.month));

    financeData = { orders: financeRaw.orders, clients: financeRaw.clients, payments: financeRaw.payments,
      pl: { revenue, cogs, profit, margin, orders: live.length, byMonth, rangeLabel: rangeLabel() } };

    $("plSummary").innerHTML =
      statCard(S.money(revenue), "Net revenue") +
      statCard(S.money(cogs), "Cost (COGS)") +
      statCard(S.money(profit), "Gross profit", profit < 0 ? "danger" : "") +
      statCard(margin.toFixed(1) + "%", "Margin") +
      statCard(live.length, "Orders");
    $("plRangeLabel").textContent = rangeLabel();
    renderMonthly(byMonth);
    renderLedgerList(financeData);
  }

  function fmtDateInput(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function clearPresetActive() {
    document.querySelectorAll(".pl-presets [data-range]").forEach((b) => b.classList.remove("active"));
  }
  function applyPreset(kind, btn) {
    clearPresetActive(); if (btn) btn.classList.add("active");
    const n = new Date(); let from = null, to = null;
    if (kind === "month") { from = new Date(n.getFullYear(), n.getMonth(), 1); to = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59); }
    else if (kind === "lastmonth") { from = new Date(n.getFullYear(), n.getMonth() - 1, 1); to = new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59); }
    else if (kind === "year") { from = new Date(n.getFullYear(), 0, 1); to = new Date(n.getFullYear(), 11, 31, 23, 59, 59); }
    financeRange.from = from ? from.getTime() : null;
    financeRange.to = to ? to.getTime() : null;
    $("plFrom").value = from ? fmtDateInput(from) : "";
    $("plTo").value = to ? fmtDateInput(to) : "";
    renderFinance();
  }
  function setupFinanceRange() {
    document.querySelectorAll(".pl-presets [data-range]").forEach((b) =>
      b.addEventListener("click", () => applyPreset(b.dataset.range, b)));
    $("plFrom").addEventListener("change", () => {
      financeRange.from = $("plFrom").value ? new Date($("plFrom").value + "T00:00:00").getTime() : null;
      clearPresetActive(); renderFinance();
    });
    $("plTo").addEventListener("change", () => {
      financeRange.to = $("plTo").value ? new Date($("plTo").value + "T23:59:59").getTime() : null;
      clearPresetActive(); renderFinance();
    });
  }

  function renderMonthly(rows) {
    const w = $("plMonthly");
    if (!rows.length) { w.innerHTML = '<p class="muted">No orders yet.</p>'; return; }
    w.innerHTML = "";
    rows.forEach((m) => {
      const el = document.createElement("div");
      el.className = "admin-row";
      el.innerHTML =
        '<div class="admin-row-main"><div class="admin-row-title">' + m.month + "</div>" +
        '<div class="muted small">' + m.orders + " order" + (m.orders === 1 ? "" : "s") +
        " · revenue " + S.money(m.revenue) + " · COGS " + S.money(m.cogs) + "</div></div>" +
        '<div class="admin-row-actions"><strong style="color:' +
        (m.profit < 0 ? "var(--danger)" : "var(--green-dark)") + '">' + S.money(m.profit) + " profit</strong></div>";
      w.appendChild(el);
    });
  }

  function renderLedgerList(fd) {
    const w = $("ledgerList");
    const clients = fd.clients.filter((c) => !c.is_admin);
    if (!clients.length) { w.innerHTML = '<p class="muted">No clients yet.</p>'; return; }

    const ordByUser = {}, payByUser = {};
    fd.orders.forEach((o) => { (ordByUser[o.user_id] = ordByUser[o.user_id] || []).push(o); });
    fd.payments.forEach((p) => { (payByUser[p.user_id] = payByUser[p.user_id] || []).push(p); });

    w.innerHTML = "";
    clients.forEach((c) => {
      const os = ordByUser[c.id] || [], ps = payByUser[c.id] || [];
      const debit = os.reduce((s, o) => s + Number(o.total || 0), 0);
      const credit = ps.reduce((s, p) => s + Number(p.amount || 0), 0);
      const bal = debit - credit;
      const el = document.createElement("div");
      el.className = "admin-row";
      el.innerHTML =
        '<div class="admin-row-main"><div class="admin-row-title">' +
        S.escapeHtml(c.shop_name || c.contact_name || "Client") +
        ' <span class="pill ' + (bal > 0 ? "warn" : "ok") + '">' +
        (bal > 0 ? "owes " : "") + S.money(bal) + "</span></div>" +
        '<div class="muted small">' + os.length + " order" + (os.length === 1 ? "" : "s") +
        " " + S.money(debit) + " · paid " + S.money(credit) + "</div></div>" +
        '<div class="admin-row-actions">' +
        '<button class="btn small primary" data-act="pay">Record payment</button>' +
        '<button class="btn small ghost" data-act="ledger">Ledger PDF</button></div>';
      el.querySelector('[data-act="pay"]').addEventListener("click", () => openPaymentModal(c, null, loadFinance));
      el.querySelector('[data-act="ledger"]').addEventListener("click", () => window.Reports.ledgerPDF(c, os, ps, cfg));
      w.appendChild(el);
    });
  }

  // c = client {id, shop_name, contact_name}. order = optional {id, order_no, created_at, total, _paid}.
  function openPaymentModal(c, order, reload) {
    payClient = c; payOrder = order || null; payReload = reload || loadFinance;
    const name = c.shop_name || c.contact_name || "Client";
    if (order) {
      const bal = Math.max(0, Number(order.total || 0) - Number(order._paid || 0));
      $("payModalTitle").textContent = "Payment for " + S.invoiceNo(order.order_no, order.created_at);
      $("payModalClient").textContent = name + " · balance " + S.money(bal);
      $("payAmount").value = bal ? bal.toFixed(2) : "";
    } else {
      $("payModalTitle").textContent = "Record payment";
      $("payModalClient").textContent = name;
      $("payAmount").value = "";
    }
    $("payNote").value = ""; $("payMethod").value = "cash";
    $("payMsg").textContent = ""; $("payMsg").className = "msg";
    $("paymentModal").hidden = false;
    $("payAmount").focus();
  }
  function closePaymentModal() { $("paymentModal").hidden = true; payClient = null; payOrder = null; payReload = null; }

  async function savePayment(e) {
    e.preventDefault();
    if (!payClient) return;
    const amount = parseFloat($("payAmount").value) || 0;
    const msg = $("payMsg");
    if (amount <= 0) { msg.textContent = "Enter a valid amount."; msg.className = "msg error"; return; }
    const btn = $("paySave"); btn.disabled = true; btn.textContent = "Saving…";

    const row = { user_id: payClient.id, amount, method: $("payMethod").value,
      note: $("payNote").value.trim() || null, created_by: me.id };
    if (payOrder) row.order_id = payOrder.id;
    const { error } = await S.sb.from("payments").insert(row);

    // When a payment is allocated to an invoice, update that order's status.
    if (!error && payOrder) {
      const newPaid = Number(payOrder._paid || 0) + amount;
      const status = newPaid >= Number(payOrder.total || 0) - 0.001 ? "paid" : "partial";
      await S.sb.from("orders").update({ payment_status: status }).eq("id", payOrder.id);
    }

    btn.disabled = false; btn.textContent = "Save payment";
    if (error) { msg.textContent = error.message; msg.className = "msg error"; return; }
    const reload = payReload;
    closePaymentModal();
    if (reload) reload();
    refreshBadges();
  }
})();
