# Diamond Flame Home Appliances — Wholesale Ordering Website

A private wholesale ordering site for a home-appliances distributor. Approved
resellers log in, see **their** wholesale prices on refrigerators, washing
machines, ACs, kitchen appliances and more, order in bulk, and the invoice
opens in **WhatsApp** ready to send to your shop with one tap.

- 🔒 **Prices are private** — only logged-in, *approved* customers can see them.
  Random visitors (and anyone reading the page source) see nothing, because
  prices live in a database protected by row-level security, not in the website
  files.
- 🧾 **Auto invoice → WhatsApp** — placing an order generates an invoice and
  opens WhatsApp pre-filled with all the order details, addressed to your store.
- 👤 **Each reseller has their own login** and optional per-customer discount tier.
- 🛠️ **Admin console** to approve customers, manage products/prices/stock, view
  orders, track inventory, and see profit & loss.

The site itself is static (hosted free on GitHub Pages). The secure part —
accounts and prices — is handled by **Supabase**, a free backend.

> This site is a complete, self-contained copy of the wholesale platform,
> re-themed for **Diamond Flame Home Appliances**. Point it at its **own**
> Supabase project so its catalogue stays separate from any other store.

---

## What you need
1. A free [Supabase](https://supabase.com) account.
2. This repo published on GitHub Pages.
3. Your shop's WhatsApp number.
4. (Optional) The `diamond-flame.com` domain, to serve the site at your own URL.

---

## Setup (about 10 minutes)

### 1. Create the Supabase backend
1. Go to <https://supabase.com> → **New project**. Pick a name and a strong
   database password. Wait ~2 minutes for it to finish.
2. In the left menu open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this folder, copy **everything**, paste it
   into the editor, and click **Run**. This creates the tables, security rules,
   and the sample appliance catalogue.

### 2. Get your keys
1. In Supabase open **Project Settings → API** (or **Data API / API Keys**).
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/config.js` and paste them in:
   ```js
   SUPABASE_URL:      "https://abcd1234.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",   // the anon/public key (safe to publish)
   ```
4. In the same file confirm your store details:
   ```js
   STORE_NAME:     "Diamond Flame Home Appliances",
   STORE_WHATSAPP: "13313049903",  // digits only, with country code, no + or spaces
   CURRENCY:       "Rs ",          // Pakistani Rupee
   TAX_LABEL:      "GST",
   TAX_RATE:       0                // e.g. 17 for 17% GST, or 0 for none
   ```

> The anon key is **meant** to be public. Your data is safe because the SQL
> security rules (RLS) only let *approved* logged-in customers read prices.

### 3. Publish on GitHub Pages + custom domain
Commit and push these files, then in the repo: **Settings → Pages → Build from
branch** → select this branch and `/ (root)`. The site is served at the repo
root, with the custom domain set via the `CNAME` file:

**https://www.diamond-flame.com**

DNS (at your domain registrar): add a **CNAME** record for `www` pointing to
`<your-github-user>.github.io.` (and an apex redirect / A records for the bare
`diamond-flame.com` if you want it to work without `www`). See the project
notes from your assistant for the exact records.

### 4. Make yourself the admin
1. Open your live site, click **Request access**, and sign up with **your** email.
2. Back in Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set is_admin = true, approved = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Reload the site — you'll now see an **Admin** button (or open `admin.html`).

> **Tip:** By default Supabase asks new users to confirm their email. To let
> customers log in immediately, go to **Authentication → Providers → Email** and
> turn **off** "Confirm email".

---

## How you'll use it day to day

**You (store owner) — `admin.html`:**
- **Customers** tab: approve new sign-ups, set each customer's discount %.
- **Products** tab: add appliances, change prices inline, **upload a product
  photo**, hide/show or delete items, and export a PDF catalogue.
- **Inventory** tab: track on-hand stock (auto-decrements as orders are placed).
- **Orders** tab: see every order, change its status, reply on WhatsApp.
- **Finance** tab: live profit & loss and per-client ledgers.

**Your customers — `index.html`:**
1. Request access (one time) → you approve them.
2. Log in → browse the catalogue with their prices → add bulk quantities.
3. **Place order** → invoice pops up and WhatsApp opens, pre-filled and
   addressed to your shop. The order is also saved in Admin → Orders.

---

## File overview
| File | Purpose |
|------|---------|
| `index.html` | Customer storefront (login, catalogue, cart, invoice) |
| `admin.html` | Store owner console |
| `js/config.js` | **Your settings** — Supabase keys, store name, WhatsApp number |
| `js/store.js` | Shared helpers (client, money, invoice, WhatsApp link) |
| `js/app.js` | Storefront logic |
| `js/admin.js` | Admin logic |
| `js/catalogue.js` | PDF catalogue export |
| `js/reports.js` | PDF profit & loss export |
| `css/styles.css` | Styling |
| `supabase/schema.sql` | Database tables, security rules, sample appliances |
