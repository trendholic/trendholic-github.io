// =====================================================================
//  Customer storefront: login, approval gate, catalog, cart, checkout
// =====================================================================
(function () {
  const S = window.Store;
  const cfg = S.cfg;
  const $ = (id) => document.getElementById(id);

  // ---- app state ----
  let profile = null;
  let products = [];
  let cart = {};               // { productId: qty }

  // ---------------------------------------------------------------
  //  Boot
  // ---------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    $("brandName").textContent = cfg.STORE_NAME;
    $("brandTagline").textContent = cfg.STORE_TAGLINE || "";
    $("year").textContent = new Date().getFullYear();

    if (!S.configured || !S.sb) {
      showView("setup");
      return;
    }

    wireAuthForms();
    wireShopUI();

    // React to login / logout.
    S.sb.auth.onAuthStateChange((_event, session) => {
      if (session) onLoggedIn();
      else onLoggedOut();
    });

    const { data } = await S.sb.auth.getSession();
    if (data.session) onLoggedIn();
    else onLoggedOut();
  }

  // ---------------------------------------------------------------
  //  Views
  // ---------------------------------------------------------------
  function showView(name) {
    document.querySelectorAll("[data-view]").forEach((el) => {
      el.hidden = el.getAttribute("data-view") !== name;
    });
    const loggedIn = name === "shop" || name === "pending";
    $("topbarActions").hidden = !loggedIn;
  }

  // ---------------------------------------------------------------
  //  Auth
  // ---------------------------------------------------------------
  function wireAuthForms() {
    // tabs
    $("tabLogin").addEventListener("click", () => switchAuthTab("login"));
    $("tabSignup").addEventListener("click", () => switchAuthTab("signup"));

    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthMsg("");
      const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "Signing in…";
      const { error } = await S.sb.auth.signInWithPassword({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      });
      btn.disabled = false; btn.textContent = "Sign in";
      if (error) setAuthMsg(error.message, true);
    });

    $("signupForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthMsg("");
      const btn = $("signupBtn"); btn.disabled = true; btn.textContent = "Creating…";
      const { error } = await S.sb.auth.signUp({
        email: $("signupEmail").value.trim(),
        password: $("signupPassword").value,
        options: {
          data: {
            shop_name: $("signupShop").value.trim(),
            contact_name: $("signupName").value.trim(),
            phone: $("signupPhone").value.trim()
          }
        }
      });
      btn.disabled = false; btn.textContent = "Create account";
      if (error) { setAuthMsg(error.message, true); return; }
      setAuthMsg("Account created! If email confirmation is on, check your inbox. " +
                 "Your account must be approved by the store before you can see prices.", false);
      switchAuthTab("login");
    });

    $("logoutBtn").addEventListener("click", () => S.sb.auth.signOut());
    $("logoutBtn2").addEventListener("click", () => S.sb.auth.signOut());
  }

  function switchAuthTab(which) {
    const login = which === "login";
    $("tabLogin").classList.toggle("active", login);
    $("tabSignup").classList.toggle("active", !login);
    $("loginForm").hidden = !login;
    $("signupForm").hidden = login;
    setAuthMsg("");
  }

  function setAuthMsg(msg, isError) {
    const el = $("authMsg");
    el.textContent = msg;
    el.className = "msg" + (msg ? (isError ? " error" : " ok") : "");
  }

  async function onLoggedIn() {
    // fetch this user's profile
    const { data: { user } } = await S.sb.auth.getUser();
    const { data, error } = await S.sb
      .from("profiles").select("*").eq("id", user.id).single();

    if (error || !data) {
      // profile not created yet (rare timing) — show pending
      profile = { approved: false };
    } else {
      profile = data;
    }

    $("adminLink").hidden = !profile.is_admin;

    if (!profile.approved) {
      $("pendingEmail").textContent = user.email;
      showView("pending");
      return;
    }

    await loadProducts();
    renderShopHeader();
    showView("shop");
  }

  function onLoggedOut() {
    profile = null; products = []; cart = {};
    switchAuthTab("login");
    showView("auth");
  }

  // ---------------------------------------------------------------
  //  Catalog
  // ---------------------------------------------------------------
  async function loadProducts() {
    const { data, error } = await S.sb
      .from("products").select("*")
      .eq("active", true)
      .order("category", { ascending: true })
      .order("sort", { ascending: true })
      .order("name", { ascending: true });
    products = error ? [] : (data || []);
    renderCatalog();
    renderCart();
  }

  function renderShopHeader() {
    const name = profile.shop_name || profile.contact_name || "there";
    $("welcomeName").textContent = name;
    $("discountBadge").hidden = !(profile.discount_pct > 0);
    if (profile.discount_pct > 0)
      $("discountBadge").textContent = "Your price tier: " + profile.discount_pct + "% off";
  }

  function renderCatalog() {
    const q = ($("search").value || "").toLowerCase();
    const wrap = $("catalog");
    wrap.innerHTML = "";

    const filtered = products.filter((p) =>
      !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));

    if (filtered.length === 0) {
      wrap.innerHTML = '<p class="muted">No products found.</p>';
      return;
    }

    // group by category
    const groups = {};
    filtered.forEach((p) => { (groups[p.category] = groups[p.category] || []).push(p); });

    Object.keys(groups).forEach((cat) => {
      const h = document.createElement("h3");
      h.className = "cat-title";
      h.textContent = cat;
      wrap.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "grid";
      groups[cat].forEach((p) => grid.appendChild(productCard(p)));
      wrap.appendChild(grid);
    });
  }

  function productCard(p) {
    const qty = cart[p.id] || 0;
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="card-body">
        <div class="card-name">${S.escapeHtml(p.name)}</div>
        <div class="card-unit">${S.escapeHtml(p.unit)}</div>
        <div class="card-price">${S.money(p.price)} <span class="per">/ ${S.escapeHtml(p.unit)}</span></div>
        <div class="card-moq">Min order: ${p.moq}</div>
      </div>
      <div class="qty">
        <button type="button" class="qbtn" data-act="dec" aria-label="decrease">−</button>
        <input type="number" min="0" step="1" value="${qty}" class="qinput" inputmode="numeric" />
        <button type="button" class="qbtn" data-act="inc" aria-label="increase">+</button>
      </div>`;

    const input = el.querySelector(".qinput");
    el.querySelector('[data-act="inc"]').addEventListener("click", () => {
      const cur = parseInt(input.value || "0", 10) || 0;
      setQty(p, cur === 0 ? p.moq : cur + 1, input);
    });
    el.querySelector('[data-act="dec"]').addEventListener("click", () => {
      const cur = parseInt(input.value || "0", 10) || 0;
      let next = cur - 1;
      if (next > 0 && next < p.moq) next = 0; // below MOQ drops to zero
      setQty(p, Math.max(0, next), input);
    });
    input.addEventListener("change", () => {
      let v = parseInt(input.value || "0", 10) || 0;
      if (v > 0 && v < p.moq) v = p.moq;
      setQty(p, Math.max(0, v), input);
    });
    return el;
  }

  function setQty(p, qty, input) {
    if (qty > 0) cart[p.id] = qty; else delete cart[p.id];
    if (input) input.value = qty;
    renderCart();
  }

  // ---------------------------------------------------------------
  //  Cart
  // ---------------------------------------------------------------
  function cartLineItems() {
    return Object.keys(cart).map((id) => {
      const p = products.find((x) => x.id === id);
      return p ? { product_id: p.id, name: p.name, unit: p.unit, qty: cart[id], price: Number(p.price) } : null;
    }).filter(Boolean);
  }

  function totals() {
    const items = cartLineItems();
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const discPct = Number(profile?.discount_pct || 0);
    const discount = subtotal * discPct / 100;
    const taxRate = Number(cfg.TAX_RATE || 0);
    const tax = (subtotal - discount) * taxRate / 100;
    return { items, subtotal, discPct, discount, taxRate, tax, total: subtotal - discount + tax };
  }

  function renderCart() {
    const t = totals();
    const list = $("cartItems");
    list.innerHTML = "";

    if (t.items.length === 0) {
      list.innerHTML = '<p class="muted">Your order is empty. Add quantities from the catalog.</p>';
    } else {
      t.items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "cart-row";
        row.innerHTML = `
          <div class="cart-row-main">
            <div class="cart-row-name">${S.escapeHtml(it.name)}</div>
            <div class="cart-row-sub">${it.qty} × ${S.money(it.price)} <span class="muted">(${S.escapeHtml(it.unit)})</span></div>
          </div>
          <div class="cart-row-amt">${S.money(it.qty * it.price)}</div>
          <button class="link-danger" type="button" aria-label="remove">✕</button>`;
        row.querySelector("button").addEventListener("click", () => {
          delete cart[it.product_id];
          renderCatalog(); renderCart();
        });
        list.appendChild(row);
      });
    }

    $("sumSubtotal").textContent = S.money(t.subtotal);
    $("rowDiscount").hidden = !(t.discount > 0);
    $("sumDiscount").textContent = "-" + S.money(t.discount);
    $("discLabel").textContent = "Discount (" + t.discPct + "%)";
    $("rowTax").hidden = !(t.tax > 0);
    $("taxLabel").textContent = cfg.TAX_LABEL + " (" + t.taxRate + "%)";
    $("sumTax").textContent = S.money(t.tax);
    $("sumTotal").textContent = S.money(t.total);

    const count = t.items.length;
    $("cartCount").textContent = count;
    $("cartCount").hidden = count === 0;
    $("placeOrderBtn").disabled = count === 0;
  }

  // ---------------------------------------------------------------
  //  Checkout
  // ---------------------------------------------------------------
  function wireShopUI() {
    $("search").addEventListener("input", renderCatalog);

    $("cartToggle").addEventListener("click", () => {
      $("cartPanel").classList.toggle("open");
    });
    $("cartClose").addEventListener("click", () => {
      $("cartPanel").classList.remove("open");
    });

    $("placeOrderBtn").addEventListener("click", placeOrder);
    $("waSendBtn").addEventListener("click", sendCurrentInvoice);
    $("newOrderBtn").addEventListener("click", () => {
      cart = {}; lastOrder = null;
      $("invoiceModal").hidden = true;
      renderCatalog(); renderCart();
    });
    $("closeModalBtn").addEventListener("click", () => { $("invoiceModal").hidden = true; });
  }

  let lastOrder = null;

  async function placeOrder() {
    const t = totals();
    if (t.items.length === 0) return;

    const btn = $("placeOrderBtn");
    btn.disabled = true; btn.textContent = "Placing…";

    const note = $("orderNote").value.trim();
    const { data, error } = await S.sb.from("orders").insert({
      user_id: profile.id,
      items: t.items,
      tax_rate: Number(cfg.TAX_RATE || 0),
      note: note || null
      // subtotal/discount/tax/total are recomputed server-side for safety
    }).select().single();

    btn.disabled = false; btn.textContent = "Place order";

    if (error) {
      alert("Could not place order: " + error.message);
      return;
    }

    lastOrder = data;
    showInvoice(data);
  }

  function showInvoice(order) {
    $("invoiceNo").textContent = S.invoiceNo(order.order_no, order.created_at);
    $("invoiceDate").textContent = S.fmtDate(order.created_at);
    $("invoiceCustomer").textContent =
      (profile.shop_name || profile.contact_name || "") +
      (profile.phone ? " · " + profile.phone : "");

    const body = $("invoiceLines");
    body.innerHTML = "";
    order.items.forEach((it) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${S.escapeHtml(it.name)}<div class="muted small">${S.escapeHtml(it.unit)}</div></td>
        <td class="num">${it.qty}</td>
        <td class="num">${S.money(it.price)}</td>
        <td class="num">${S.money(it.qty * it.price)}</td>`;
      body.appendChild(tr);
    });

    $("invSubtotal").textContent = S.money(order.subtotal);
    $("invRowDiscount").hidden = !(order.discount_amount > 0);
    $("invDiscLabel").textContent = "Discount (" + order.discount_pct + "%)";
    $("invDiscount").textContent = "-" + S.money(order.discount_amount);
    $("invRowTax").hidden = !(order.tax_amount > 0);
    $("invTaxLabel").textContent = cfg.TAX_LABEL + " (" + order.tax_rate + "%)";
    $("invTax").textContent = S.money(order.tax_amount);
    $("invTotal").textContent = S.money(order.total);

    $("invoiceModal").hidden = false;
    $("cartPanel").classList.remove("open");

    // Auto-open WhatsApp pre-filled with the invoice (one tap to send).
    sendCurrentInvoice();
  }

  function sendCurrentInvoice() {
    if (!lastOrder) return;
    const text = S.buildInvoiceText(lastOrder, profile);
    window.open(S.whatsappLink(text, cfg.STORE_WHATSAPP), "_blank");
  }
})();
