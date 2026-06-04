// =====================================================================
//  CONFIGURATION  —  edit the values below, then save.
//  Nothing here is secret: the Supabase "anon" key is meant to be public,
//  your data is protected by the security rules (RLS) in supabase/schema.sql.
// =====================================================================
window.APP_CONFIG = {
  // ---- Supabase (free backend) -------------------------------------
  // Supabase Dashboard → Project Settings → Data API / API Keys
  SUPABASE_URL:      "https://YOUR-PROJECT-ref.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-PUBLIC-ANON-KEY",

  // ---- Your store --------------------------------------------------
  STORE_NAME:     "Trendholic Wholesale",
  STORE_TAGLINE:  "Wholesale grocery orders made easy",

  // WhatsApp number that RECEIVES the orders (your shop).
  // International format, digits only — no +, spaces or dashes.
  // Example for India: 919876543210
  STORE_WHATSAPP: "919876543210",

  // ---- Money -------------------------------------------------------
  CURRENCY:   "₹",       // symbol shown next to prices
  TAX_LABEL:  "GST",     // label for tax line on the invoice
  TAX_RATE:   0          // tax percent applied to orders, e.g. 5 (use 0 for none)
};
