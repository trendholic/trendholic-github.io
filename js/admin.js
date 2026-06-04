// =====================================================================
//  Admin console: approve customers, manage products, view orders.
//  All write access is enforced server-side by RLS (is_admin()).
// =====================================================================
(function () {
  const S = window.Store;
  const cfg = S.cfg;
  const $ = (id) => document.getElementById(id);

  let me = null;

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

    S.sb.auth.onAuthStateChange((_e, session) => session ? gate() : show("auth"));
    const { data } = await S.sb.auth.getSession();
    data.session ? gate() : show("auth");
  }

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
    selectTab("customers");
  }

  function selectTab(tab) {
    document.querySelectorAll(".admin-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll("[data-panel]").forEach((p) =>
      p.hidden = p.getAttribute("data-panel") !== tab);
    if (tab === "customers") loadCustomers();
    if (tab === "products") loadProducts();
    if (tab === "orders") loadOrders();
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
      });
      row.querySelector(".disc").addEventListener("change", async (e) => {
        const disc = parseFloat(e.target.value) || 0;
        const { error } = await S.sb.from("profiles").update({ discount_pct: disc }).eq("id", c.id);
        if (error) alert(error.message);
      });
      wrap.appendChild(row);
    });
  }

  // ---------------- Products ----------------
  async function addProduct(e) {
    e.preventDefault();
    const payload = {
      name: $("pName").value.trim(),
      description: $("pDesc").value.trim() || null,
      category: $("pCategory").value.trim() || "General",
      unit: $("pUnit").value.trim() || "unit",
      price: parseFloat($("pPrice").value) || 0,
      moq: parseInt($("pMoq").value, 10) || 1,
      sort: parseInt($("pSort").value, 10) || 0
    };
    const { error } = await S.sb.from("products").insert(payload);
    if (error) { alert(error.message); return; }
    e.target.reset();
    loadProducts();
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
      row.innerHTML = `
        <div class="admin-row-main">
          <div class="admin-row-title">
            ${S.escapeHtml(p.name)}
            ${p.active ? "" : '<span class="pill warn">hidden</span>'}
          </div>
          <div class="muted small">${S.escapeHtml(p.category)} · ${S.escapeHtml(p.unit)} · MOQ ${p.moq}</div>
        </div>
        <div class="admin-row-actions">
          <label class="inline">${cfg.CURRENCY}
            <input type="number" min="0" step="0.01" value="${p.price}" class="price" style="width:100px" />
          </label>
          <button class="btn small ghost" data-act="toggle">${p.active ? "Hide" : "Show"}</button>
          <button class="btn small" data-act="del">Delete</button>
        </div>`;

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

  // ---------------- Orders ----------------
  async function loadOrders() {
    const { data, error } = await S.sb.from("orders")
      .select("*, profiles(shop_name, contact_name, phone)")
      .order("created_at", { ascending: false }).limit(100);
    const wrap = $("ordersList");
    if (error) { wrap.innerHTML = '<p class="msg error">' + S.escapeHtml(error.message) + "</p>"; return; }
    if (!data.length) { wrap.innerHTML = '<p class="muted">No orders yet.</p>'; return; }

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

      card.innerHTML = `
        <div class="order-head">
          <div>
            <strong>${S.invoiceNo(o.order_no, o.created_at)}</strong>
            <span class="pill status-${S.escapeHtml(o.status)}">${S.escapeHtml(o.status)}</span>
          </div>
          <div class="muted small">${S.fmtDate(o.created_at)}</div>
        </div>
        <div class="muted small">${S.escapeHtml(prof.shop_name || "")}${prof.phone ? " · " + S.escapeHtml(prof.phone) : ""}</div>
        <table class="invoice-table"><tbody>${itemsHtml}</tbody></table>
        <div class="order-foot">
          <strong>Total ${S.money(o.total)}</strong>
          <div class="order-actions">
            <select class="status">
              ${["new","confirmed","fulfilled","cancelled"].map((s) =>
                `<option value="${s}" ${s===o.status?"selected":""}>${s}</option>`).join("")}
            </select>
            <a class="btn small whatsapp" target="_blank">Reply on WhatsApp</a>
          </div>
        </div>`;

      card.querySelector(".status").addEventListener("change", async (e) => {
        const { error } = await S.sb.from("orders").update({ status: e.target.value }).eq("id", o.id);
        if (error) alert(error.message); else loadOrders();
      });
      const wa = card.querySelector("a.whatsapp");
      wa.href = S.whatsappLink(S.buildInvoiceText(o, prof), prof.phone || "");
      if (!prof.phone) { wa.classList.add("disabled"); wa.removeAttribute("href"); wa.title = "No customer phone on file"; }

      wrap.appendChild(card);
    });
  }
})();
