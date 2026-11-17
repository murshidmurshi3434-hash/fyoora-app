# FYOORA — Everything. One place.

Production-oriented, mobile-first local super-app marketplace launching in **Vadakara, Kozhikode, Kerala, India**.

## Core Portals & Architecture
- **Customer Super-App**: Intro launch video + `+91` OTP auth, profile completion, Home, Explore (separated Food Delivery, Food Pre-Booking, Bakery + Custom Cake Designer, 10-Aisle Grocery Supermarket, Safety-Verified Celebrations, Flowers & Gifts, Local Shopping, and Pickup & Drop Courier), Orders & Live Tracking, Bilingual FYOORA AI (English & Malayalam), and Profile/Support.
- **Vendor Partner Portal**: Shared and role-specific views for `restaurant_owner`, `bakery_owner`, `grocery_owner`, and `merchant` (open/close status, prep time, inventory stock/sold-out toggles, custom cake/gift instructions, pre-booking slots & capacity, settlements).
- **Rider App**: Mobile-first duty toggle, KYC status, GPS location sync, job acceptance, Pickup OTP & Delivery OTP verification, proof photo upload, and separate 100% tip + earnings ledger.
- **Super Admin Console**: Vadakara KPIs, Vendor & Rider approvals, Order refunds, Coupon manager, **Configurable Vadakara Service Area** (center, radius, pricing, operating hours), CSV order report export, support ticket resolution, and audit logs.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, `@vis.gl/react-google-maps`, `vite-plugin-pwa`, `lucide-react`
- **Backend**: Express + TypeScript (`server.ts`), Helmet, Express Rate Limit, Cookie Parser, HMAC-SHA256 Session Cookies & Bearer Tokens
- **Persistence**: Transactional JSON Store (`data/fyoora-db.json`) + Firebase Auth & Firestore configuration (`firebase-applet-config.json`, `firestore.rules`)
- **AI**: Server-side `@google/genai` (`gemini-4-hydrogen`) with live DB function calling in English and Malayalam
- **Payments**: Razorpay India server-side order & HMAC signature/webhook verification + Cash on Delivery

## Environment Variables (`.env`)
Copy `.env.example` and configure as needed:
- `GEMINI_API_KEY`: Enables live FYOORA AI recommendations
- `VITE_GOOGLE_MAPS_API_KEY`: Enables interactive Google Maps JS API
- `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET` & `RAZORPAY_WEBHOOK_SECRET`: Enables live Razorpay UPI/Card verification (without keys, Razorpay stays explicitly in unconfigured sandbox notice while COD works end-to-end)
- `FIREBASE_PHONE_AUTH_ENABLED`: Enables the prepared Firebase phone flow after Phone sign-in, authorized domains, and reCAPTCHA are configured in Firebase Console; it is intentionally off by default
- `SMS_PROVIDER_URL` & `SMS_API_KEY`: Optional custom endpoint using the documented JSON/Bearer contract; direct MSG91/Fast2SMS APIs need a provider adapter
- `SESSION_SECRET`: Required in production; use a unique random value of at least 32 bytes

The app currently uses a local JSON database and in-memory SMS OTP challenges. Keep it on one server with persistent disk for local demos; use a managed database and shared OTP store before scaling or relying on it for production orders.

## Local Commands
- `npm run dev` — Start Express + Vite dev server on `http://localhost:3000`
- `npm test` — Run the domain, auth, Razorpay, and webhook tests
- `npm run lint` — TypeScript strict check (`tsc --noEmit`)
- `npm run build` — Production Vite + PWA bundle build
- `npm start` — Run production Express server and serve the built `dist` folder

Use Node.js 22.18 or newer. `npm run dev` starts development mode; `npm start` always starts production mode.
