// =====================================================================
//  CONFIGURATION  —  edit the values below, then save.
//  Nothing here is secret: the Supabase "anon" key is meant to be public,
//  your data is protected by the security rules (RLS) in supabase/schema.sql.
// =====================================================================
window.APP_CONFIG = {
  // ---- Supabase (free backend) -------------------------------------
  // Supabase Dashboard → Project Settings → Data API / API Keys
  SUPABASE_URL:      "https://icntqusbnzblctwisdvv.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbnRxdXNibnpibGN0d2lzZHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTM3ODksImV4cCI6MjA5NjE4OTc4OX0.9pBuzDRavaWzQUHMxhqUls-1-O0IGngEFyYNCGAVp-I",

  // ---- Your store --------------------------------------------------
  STORE_NAME:     "Fresh Wholesale Distributor",
  STORE_TAGLINE:  "Premium quality rice · Best brands, best value",

  // WhatsApp number that RECEIVES the orders (your shop).
  // International format, digits only — no +, spaces or dashes.
  STORE_WHATSAPP: "13313049903",

  // ---- Money -------------------------------------------------------
  CURRENCY:   "$",       // symbol shown next to prices
  TAX_LABEL:  "Tax",     // label for tax line on the invoice
  TAX_RATE:   0          // tax percent applied to orders, e.g. 5 (use 0 for none)
};
