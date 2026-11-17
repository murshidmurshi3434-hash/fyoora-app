# FYOORA Development Status (Phases 1–9)

## Phase Completion Summary
- **Phase 1 — Foundation & Auth**: Completed. First-launch intro video (`fyoora-intro-video-portrait_14ca92cd.mp4`), FYOORA lockup transition, `+91` OTP auth with 30s resend timer, rate limiting, privacy/terms acceptance, new-user profile completion, Firebase Google Sign-In, PWA installability (`vite-plugin-pwa` + manifest + icons), Logout & Account Deletion Request.
- **Phase 2 — Marketplace Categories**: Completed. Cleanly separated Food Delivery, Food Pre-Booking (capacity-validated slots), Bakery (Custom Cake Builder + photo upload), Separate Grocery Supermarket (*Vadakara Fresh Mart* — 10 aisles, stock protection, shopping lists), Safety-Verified Birthday & Celebrations, Flowers & Gifts (recipient card, packaging tier, photo upload), and Local Shopping.
- **Phase 3 — Ordering, Delivery & Payments**: Completed. Express / Normal / Eco delivery tiers with distance, rider availability & prep-time ETA math; Scheduled Delivery; separated Kitchen vs Rider Instructions; optional Rider Tips (`₹10`–`₹50` / custom / none); coupons (`VADAKARA50`, `CELEBRATE15`); Razorpay HMAC signature + webhook verification & COD; idempotency keys; verified reviews & support tickets.
- **Phase 4 — Vendor Portals**: Completed. Unified `VendorPortal` with role-scoped permissions for Restaurants, Bakeries, Grocery Stores, and Local Merchants.
- **Phase 5 — Rider App & Pickup/Drop Courier**: Completed. `RiderPortal` (online/offline, GPS sync, Pickup & Delivery OTPs, proof photo upload, 100% tip split) + public `PickupDropView` validating both pickup & drop inside configurable Vadakara active zone.
- **Phase 6 — Admin Dashboard**: Completed. `AdminPortal` with overview KPIs, vendor/rider management, order refunds, coupons, **Configurable Vadakara Service Area**, CSV Order Export, support desk, and audit logs.
- **Phase 7 — FYOORA AI (English & Malayalam)**: Completed. Server-side Gemini function calling querying live DB inventory, prices, vendors, coupons, and orders (`src/server/ai.ts`).
- **Phase 8 — Security, Validation & Tests**: Completed. Helmet headers, Express rate limiting, server-side stock decrement & price authority, RBAC route guards, `node:test` pure logic unit suite (`src/shared/domain.test.ts`), TypeScript lint, production Vite build, and headless browser UI checks.
- **Phase 9 — Mobile Readiness**: Completed. REST + Bearer token API contract (`docs/MOBILE_API_CONTRACT.md`) ready for Android & iOS native clients.

## Production Activation Checklist
1. Phone OTP is intentionally deferred. To activate Firebase Phone Auth later, enable Phone sign-in and configure authorized domains and reCAPTCHA in Firebase Console, then set `FIREBASE_PHONE_AUTH_ENABLED=true`.
2. For custom SMS, provide an endpoint that implements the JSON/Bearer contract in `.env.example`; direct MSG91/Fast2SMS integration needs a provider-specific adapter. No sandbox OTP is issued.
3. Supply `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`; the server checks captured payment status, order ID, currency, and amount with Razorpay.
4. Set a unique random production `SESSION_SECRET`, `GEMINI_API_KEY`, and an HTTP-referrer-restricted `VITE_GOOGLE_MAPS_API_KEY`.
5. Replace the local JSON database and in-memory OTP store with shared durable services before multi-instance or production order processing.
