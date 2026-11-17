# FYOORA Mobile API Contract (Android & iOS)

The FYOORA Express backend (`server.ts`) is platform-agnostic so future React Native / Flutter / Kotlin / Swift mobile apps consume the exact same endpoints, business rules, and RBAC sessions without rewriting backend logic.

## 1. Authentication & Session Headers
Mobile clients authenticate via Bearer token returned by OTP or Firebase auth endpoints:
- `POST /api/auth/firebase` `{ idToken, privacyAccepted: true }` -> Verifies Firebase Auth ID tokens (both Google Sign-In and Firebase Phone Auth once enabled) and returns `{ user, token, isNewUser }`.
- `POST /api/auth/otp/send` `{ phone: "+919847112233" }` -> Returns `503 PHONE_AUTH_PENDING_CONFIGURATION` while Phone Auth is unconfigured, or `{ ok, deliveryMode, expiresInSec }` when a DLT SMS gateway is configured.
- `POST /api/auth/otp/verify` `{ phone, otp, privacyAccepted: true }` -> Returns `503 PHONE_AUTH_PENDING_CONFIGURATION` while unconfigured, or `{ user, token, isNewUser }` when verified.
- Include `Authorization: Bearer <token>` on all subsequent requests.
- `GET /api/auth/me` -> `{ user }`
- `PUT /api/users/profile` -> Update name, email, preferredLanguage (`en` | `ml`), saved address.
- `POST /api/auth/delete-request` -> Compliance account deletion request.

## 2. Discovery, Geofencing & Quotes
- `GET /api/marketplace/bootstrap` -> Returns active `serviceArea`, `vendors`, `products`, `preBookingSlots`, `coupons`, `banners`, `reviews`, `onlineRidersCount`, `notifications`.
- `POST /api/service-area/check` `{ lat, lng }` -> Validates coordinates against configurable Vadakara polygon/radius.
- `POST /api/delivery/quote` `{ vendorId, lat, lng, itemsSubtotal }` -> Returns feasible quotes for `EXPRESS`, `NORMAL`, `ECO`.
- `POST /api/pickup-drop/quote` `{ pickup: {lat,lng}, drop: {lat,lng}, size, weightKg }` -> Validates both points inside zone + computes courier fare.
- `POST /api/coupons/validate` `{ code, subtotal, serviceType }` -> Returns `discountAmount`.

## 3. Orders, Payments & Reviews
- `POST /api/orders` (Requires `Idempotency-Key` header) -> Creates marketplace order, pre-booking parcel pickup, or Pickup & Drop courier order; returns `order` including `razorpayOrderId` (when non-COD), `pickupOtp`, `deliveryOtp`.
- `POST /api/payments/razorpay/verify` -> Server-side HMAC-SHA256 verification of Razorpay checkout response.
- `POST /api/webhooks/razorpay` (alias `/api/payments/webhook`) -> Signed Razorpay server webhook verifying `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET` and deduplicating `x-razorpay-event-id` for `payment.captured`, `order.paid`, and `payment.failed`.
- `GET /api/orders/mine` -> Customer order history.
- `POST /api/orders/:id/transition` -> RBAC-enforced status updates with OTP & proof photo verification.
- `POST /api/orders/:id/review` -> Verified delivered order rating & comment.

## 4. Partner, Rider, Admin & AI Endpoints
- Vendor: `GET /api/vendor/dashboard`, `PATCH /api/vendor/store/:vendorId`, `POST /api/vendor/products`, `PATCH /api/vendor/products/:productId`, `POST /api/vendor/prebooking-slots`.
- Rider: `GET /api/rider/dashboard`, `POST /api/rider/status` (`isOnline`, `lat`, `lng`), `POST /api/rider/jobs/:orderId/accept`.
- Admin: `GET /api/admin/overview`, `PUT /api/admin/service-area`, `PATCH /api/admin/vendors/:vendorId`, `PATCH /api/admin/riders/:riderId`, `POST /api/admin/coupons`, `GET /api/admin/reports/orders.csv`.
- Support & AI: `GET/POST /api/support/tickets`, `POST /api/support/tickets/:id/reply`, `POST /api/ai/chat` `{ message, language }`.

## 5. Push Notification Payload Architecture (FCM / APNs)
When connecting Firebase Cloud Messaging for native Android/iOS, subscribe device tokens per `user.id` and emit matching payloads whenever `db.notifications.unshift(...)` runs in `server.ts`:
```json
{
  "notification": {
    "title": "Order FYR-2026-1024 Ready",
    "body": "Rider Vishnu Raj has picked up your order from Malabar Spice Kitchen."
  },
  "data": {
    "orderId": "ord-...",
    "category": "order",
    "deepLink": "fyoora://orders/ord-..."
  }
}
```
