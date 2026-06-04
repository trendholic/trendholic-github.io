# Trendholic Wholesale — Order-Taking Website

A private wholesale ordering site for grocery shops. Customers log in, see **their**
wholesale prices, order in bulk, and the invoice opens in **WhatsApp** ready to send
to your shop with one tap.

- 🔒 **Prices are private** — only logged-in, *approved* customers can see them. Random
  visitors (and anyone reading the page source) see nothing, because prices live in a
  database protected by row-level security, not in the website files.
- 🧾 **Auto invoice → WhatsApp** — placing an order generates an invoice and opens
  WhatsApp pre-filled with all the order details, addressed to your store number.
- 👤 **Each customer has their own login** and optional per-customer discount tier.
- 🛠️ **Admin page** to approve customers, manage products/prices, and view orders.

The site itself is static (hosted free on GitHub Pages). The secure part — accounts and
prices — is handled by **Supabase**, a free backend.

---

## What you need
1. A free [Supabase](https://supabase.com) account.
2. This repo published on GitHub Pages (your `trendholic.github.io`).
3. Your shop's WhatsApp number.

---

## Setup (about 10 minutes)

### 1. Create the Supabase backend
1. Go to <https://supabase.com> → **New project**. Pick a name and a strong database
   password. Wait ~2 minutes for it to finish.
2. In the left menu open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this repo, copy **everything**, paste it into the
   editor, and click **Run**. This creates the tables, security rules, and 12 sample
   products.

### 2. Get your keys
1. In Supabase open **Project Settings → API** (or **Data API / API Keys**).
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/config.js` in this repo and paste them in:
   ```js
   SUPABASE_URL:      "https://abcd1234.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",   // the anon/public key (safe to publish)
   ```
4. In the same file set your store details:
   ```js
   STORE_NAME:     "Trendholic Wholesale",
   STORE_WHATSAPP: "919876543210",  // digits only, with country code, no + or spaces
   CURRENCY:       "₹",
   TAX_LABEL:      "GST",
   TAX_RATE:       0                // e.g. 5 for 5% GST, or 0 for none
   ```

> The anon key is **meant** to be public. Your data is safe because the SQL security
> rules (RLS) only let *approved* logged-in customers read prices.

### 3. Publish on GitHub Pages
Commit and push these files to your `trendholic/trendholic-github.io` repo's default
branch. In the repo: **Settings → Pages → Build from branch** → select your branch and
`/ (root)`. Your site will be live at `https://trendholic.github.io`.

### 4. Make yourself the admin
1. Open your live site, click **Request access**, and sign up with **your** email.
2. Back in Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set is_admin = true, approved = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Reload the site — you'll now see an **Admin** button (or open `admin.html`).

> **Tip:** By default Supabase asks new users to confirm their email. To let customers
> log in immediately without that step, go to **Authentication → Providers → Email** and
> turn **off** "Confirm email".

---

## How you'll use it day to day

**You (store owner) — `admin.html`:**
- **Customers** tab: approve new sign-ups, set each customer's discount %.
- **Products** tab: add products, change prices inline, **upload a product photo**
  (tap the little image box on any row to add/replace it), hide/show or delete items.
- **Orders** tab: see every order, change its status (new → confirmed → fulfilled),
  and reply to the customer on WhatsApp.

**Your customers — `index.html`:**
1. Request access (one time) → you approve them.
2. Log in → browse the catalog with their prices → add bulk quantities.
3. **Place order** → invoice pops up and WhatsApp opens, pre-filled and addressed to
   your shop. They tap send. The order is also saved in your Admin → Orders.

---

## FAQ

**Can someone see prices without logging in?**
No. Prices are never in the website files — they come from the database, which only
returns them to authenticated, approved customers (enforced by row-level security).

**Why does it open WhatsApp instead of sending automatically?**
A free static website cannot send WhatsApp messages silently — that needs the paid
WhatsApp Business API. The click-to-send link is the standard reliable approach: the
message is fully written, the customer just taps send. (Fully automatic sending can be
added later via a service like Twilio.)

**How do I change the sample products?**
Use the Admin → Products tab, or edit them in Supabase → Table editor → `products`.

---

## File overview
| File | Purpose |
|------|---------|
| `index.html` | Customer storefront (login, catalog, cart, invoice) |
| `admin.html` | Store owner console |
| `js/config.js` | **Your settings** — Supabase keys, store name, WhatsApp number |
| `js/store.js` | Shared helpers (client, money, invoice, WhatsApp link) |
| `js/app.js` | Storefront logic |
| `js/admin.js` | Admin logic |
| `css/styles.css` | Styling |
| `supabase/schema.sql` | Database tables, security rules, sample data |
