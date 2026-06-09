// =====================================================================
//  CONFIGURATION  —  edit the values below, then save.
//  Nothing here is secret: the Supabase "anon" key is meant to be public,
//  your data is protected by the security rules (RLS) in supabase/schema.sql.
// =====================================================================
window.APP_CONFIG = {
  // ---- Supabase (free backend) -------------------------------------
  // Supabase Dashboard → Project Settings → Data API / API Keys
  // Create your OWN Supabase project for Diamond Flame and paste its
  // URL + anon key here (do NOT reuse another store's project, or you'll
  // see that store's products). Until filled in, the site shows a setup screen.
  SUPABASE_URL:      "https://rwsfaotpdhznspueakze.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3c2Zhb3RwZGh6bnNwdWVha3plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTcyMTksImV4cCI6MjA5NjUzMzIxOX0.92igfOS3aEhWxItKrpem0NrYd9K3fYwJLkKe9wisuL4",

  // ---- Your store --------------------------------------------------
  STORE_NAME:     "Diamond Flame Home Appliances",
  STORE_TAGLINE:  "Wholesale home appliances · Trusted brands, best value",

  // WhatsApp number that RECEIVES the orders (your shop).
  // International format, digits only — no +, spaces or dashes.
  STORE_WHATSAPP: "13313049903",

  // ---- Money -------------------------------------------------------
  CURRENCY:   "Rs ",     // symbol shown next to prices (Pakistani Rupee)
  TAX_LABEL:  "GST",     // label for tax line on the invoice
  TAX_RATE:   0,         // tax percent applied to orders, e.g. 5 (use 0 for none)

  // ---- Admin security ----------------------------------------------
  // Auto sign-out from the admin portal after this many minutes of inactivity.
  ADMIN_IDLE_MINUTES: 20,

  // ---- Inventory ---------------------------------------------------
  // Products at or below this quantity show an "Only N left" badge.
  // Leave a product's stock blank in Admin to mark it as untracked / unlimited.
  LOW_STOCK_THRESHOLD: 5,

  // ---- Online payments (optional) ----------------------------------
  // Lets customers pay the invoice on a trusted, hosted checkout page.
  // Leave PAYMENT_LINK empty to hide the "Pay online" button entirely.
  //
  //  • PayPal.me  — PAYMENT_PROVIDER: "paypal", and PAYMENT_LINK your page,
  //                 e.g. "https://www.paypal.com/paypalme/YourStore".
  //                 The order total is appended automatically so the amount
  //                 is pre-filled for the customer (most frictionless).
  //  • Stripe / Square / any hosted link — PAYMENT_PROVIDER: "link", and
  //                 PAYMENT_LINK your checkout URL. You can put {amount} and
  //                 {invoice} placeholders in the URL and they’ll be filled in.
  PAYMENT_PROVIDER: "paypal",                              // "paypal" | "link" | "" (off)
  PAYMENT_LINK:     "https://www.paypal.com/paypalme/diamondflame",
  PAYMENT_CURRENCY: "PKR",                                 // ISO code for PayPal.me amounts
  PAYMENT_BRAND:    "PayPal"                               // shown in the "secured by …" line
};
