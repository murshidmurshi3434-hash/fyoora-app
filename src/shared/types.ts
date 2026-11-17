export type UserRole =
  | 'customer'
  | 'restaurant_owner'
  | 'bakery_owner'
  | 'grocery_owner'
  | 'merchant'
  | 'rider'
  | 'support_staff'
  | 'admin'
  | 'super_admin';

export type LanguageCode = 'en' | 'ml';

export type ServiceType =
  | 'food'
  | 'food_prebooking'
  | 'bakery'
  | 'grocery'
  | 'celebration'
  | 'flowers_gifts'
  | 'pickup_drop';

export type DeliveryTier = 'EXPRESS' | 'NORMAL' | 'ECO';

export type OrderStatus =
  | 'order_placed'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'vendor_accepted'
  | 'preparation_started'
  | 'ready_for_pickup'
  | 'rider_assigned'
  | 'rider_arrived_at_vendor'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'failed_delivery';

export type PaymentMethod = 'razorpay_upi' | 'razorpay_card' | 'cod';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refund_pending' | 'refunded';

export type SuggestionArea =
  | 'food'
  | 'bakery'
  | 'grocery'
  | 'flowers_gifts'
  | 'celebration'
  | 'delivery'
  | 'payments'
  | 'profile'
  | 'other';

export interface FeatureSuggestion {
  id: string;
  userId: string;
  userName: string;
  area: SuggestionArea;
  title: string;
  details: string;
  status: 'new' | 'reviewing' | 'planned' | 'in_progress' | 'completed' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  line1: string;
  landmark?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}

export interface UserProfile {
  id: string;
  phone: string;
  contactPhone?: string;
  contactPhoneVerified?: boolean;
  fullName: string;
  email?: string;
  profileImage?: string;
  preferredLanguage: LanguageCode;
  role: UserRole;
  vendorId?: string;
  riderId?: string;
  addresses: SavedAddress[];
  favourites: string[]; // vendor or product IDs
  privacyAcceptedAt?: string;
  profileCompleted: boolean;
  accountStatus: 'active' | 'suspended' | 'deletion_requested';
  deletionRequestedAt?: string;
  loyaltyPoints: number;
  referralCode: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  firebaseUid?: string;
  authProvider?: 'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed';
  linkedProviders?: Array<'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed'>;
  createdAt: string;
}

export interface RestrictedZone {
  id: string;
  name: string;
  center: GeoPoint;
  radiusKm: number;
  reason?: string;
  active: boolean;
}

export interface DeliveryZoneConfig {
  id: string;
  name: string;
  center: GeoPoint;
  radiusKm: number;
  surchargeInr: number;
  minOrderInr?: number;
  active: boolean;
}

export interface ServiceAreaConfig {
  id: string;
  name: string;
  city: string;
  district: string;
  state: string;
  center: GeoPoint;
  radiusKm: number;
  polygon?: GeoPoint[];
  isActive: boolean;
  operatingHours: { open: string; close: string };
  deliveryTiersEnabled?: Record<DeliveryTier, boolean>;
  deliveryZones?: DeliveryZoneConfig[];
  restrictedZones?: RestrictedZone[];
  deliveryPricing: {
    baseFeeInr: number;
    perKmFeeInr: number;
    expressMultiplier: number;
    ecoDiscountInr: number;
    expressMaxDistanceKm: number;
    platformFeeInr: number;
    freeDeliveryAboveInr: number;
  };
  pickupDropPricing: {
    baseFeeInr: number;
    perKmFeeInr: number;
    maxWeightKg: number;
    sizeSurcharge: Record<'small' | 'medium' | 'large', number>;
  };
  minOrderValues: Record<Exclude<ServiceType, 'pickup_drop'>, number>;
}

export interface Vendor {
  id: string;
  ownerUserId: string;
  name: string;
  serviceCategory: Exclude<ServiceType, 'pickup_drop' | 'food_prebooking'>;
  supportsPreBooking: boolean;
  cuisinesOrTags: string[];
  logoUrl: string;
  coverUrl: string;
  address: string;
  areaName: string;
  location: GeoPoint;
  openingHours: string;
  isOpen: boolean;
  approved: boolean;
  suspended?: boolean;
  avgPrepTimeMins: number;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3;
  commissionRate: number; // 0.12 = 12%
  coverageRadiusKm: number;
  featured?: boolean;
  sponsored?: boolean;
  verificationStatus?: 'verified' | 'pending' | 'rejected';
  verificationNotes?: string;
  isSampleSeed?: boolean;
}

export interface ProductVariation {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  vendorId: string;
  serviceCategory: Exclude<ServiceType, 'pickup_drop' | 'food_prebooking'>;
  category: string;
  name: string;
  nameMl?: string;
  description: string;
  imageUrl: string;
  price: number;
  mrp?: number;
  unit?: string;
  isVeg?: boolean;
  inStock: boolean;
  stockQty: number;
  soldOutManual?: boolean;
  variations?: ProductVariation[];
  addons?: ProductAddon[];
  tags?: string[];
  allowCustomCake?: boolean;
  allowGiftCustomisation?: boolean;
  safetyVerified?: boolean;
  trending?: boolean;
  isSampleSeed?: boolean;
}

export interface PreBookingSlot {
  id: string;
  vendorId: string;
  date: string; // YYYY-MM-DD
  timeLabel: string; // e.g., "12:30 PM - 01:00 PM"
  maxCapacity: number;
  bookedCount: number;
  isActive: boolean;
}

export interface CustomCakeSpec {
  size: '0.5 kg' | '1 kg' | '1.5 kg' | '2 kg';
  flavour: string;
  eggOption: 'Eggless' | 'With Egg';
  messageOnCake: string;
  referenceImageDataUrl?: string;
}

export interface GiftCustomisationSpec {
  recipientName: string;
  recipientPhone: string;
  giftMessage: string;
  packagingTier: 'Standard Ribbon' | 'Premium Keepsake Box (+₹60)';
  referenceImageDataUrl?: string;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  vendorId: string;
  vendorName: string;
  serviceCategory: Exclude<ServiceType, 'pickup_drop' | 'food_prebooking'>;
  name: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  selectedVariation?: ProductVariation;
  selectedAddons?: ProductAddon[];
  kitchenInstructions?: string[];
  kitchenCustomNote?: string;
  customCake?: CustomCakeSpec;
  giftCustomisation?: GiftCustomisationSpec;
}

export interface SubOrder {
  subOrderId: string;
  vendorId: string;
  vendorName: string;
  status: OrderStatus;
  items: CartItem[];
  subtotal: number;
  commissionAmount: number;
  vendorNetPayout: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceType: ServiceType;
  vendorId?: string;
  vendorName?: string;
  subOrders: SubOrder[];
  items: CartItem[];
  deliveryAddress: SavedAddress;
  deliveryTier: DeliveryTier;
  deliveryMode: 'instant' | 'scheduled' | 'prebooking_pickup';
  scheduledDate?: string;
  scheduledSlot?: string;
  preBookingSlotId?: string;
  riderInstructions: string[];
  riderCustomNote?: string;
  unavailableReplacementPolicy?: 'call_me' | 'best_replacement' | 'refund_item';
  pricing: {
    itemsSubtotal: number;
    discount: number;
    couponCode?: string;
    deliveryFee: number;
    platformFee: number;
    riderTip: number;
    grandTotal: number;
  };
  etaMinutes: { min: number; max: number };
  distanceKm: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  razorpayRefundStatus?: 'pending' | 'processed' | 'failed';
  refundRequestStartedAt?: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; timestamp: string; note?: string; actorRole: UserRole }[];
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  pickupOtp: string;
  deliveryOtp: string;
  deliveryProofPhotoUrl?: string;
  pickupProofPhotoUrl?: string;
  pickupDropDetails?: {
    pickupAddress: SavedAddress;
    dropAddress: SavedAddress;
    recipientName: string;
    recipientPhone: string;
    parcelDescription: string;
    parcelSize: 'small' | 'medium' | 'large';
    weightKg: number;
    pickupInstructions: string;
    prohibitedPolicyAccepted: boolean;
  };
  reviewed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RiderProfile {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  vehicleType: 'Two-Wheeler' | 'EV Scooter' | 'Bicycle';
  vehicleNumber: string;
  licenseNumber: string;
  aadhaarLast4: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  suspended?: boolean;
  isOnline: boolean;
  currentLocation: GeoPoint;
  lastLocationUpdatedAt: string;
  completedDeliveries: number;
  rejectedDeliveries?: number;
  rating: number;
  earningsTotal: number;
  tipsTotal: number;
  pendingSettlement: number;
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: 'flat' | 'percent';
  discountValue: number;
  maxDiscountInr: number;
  minOrderInr: number;
  firstOrderOnly?: boolean;
  applicableServices: ServiceType[] | 'all';
  active: boolean;
  expiresAt: string;
}

export interface PromotionalBanner {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetService: ServiceType;
  imageUrl: string;
  active: boolean;
}

export interface ReviewRecord {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  vendorId?: string;
  productId?: string;
  riderId?: string;
  rating: number;
  deliveryRating: number;
  comment: string;
  status: 'published' | 'flagged' | 'hidden';
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  orderId?: string;
  orderNumber?: string;
  category:
    | 'missing_item'
    | 'damaged_product'
    | 'late_delivery'
    | 'cancellation'
    | 'refund_request'
    | 'pickup_drop_issue'
    | 'other';
  subject: string;
  description: string;
  status: 'open' | 'in_review' | 'resolved' | 'closed';
  messages: { senderRole: UserRole; senderName: string; text: string; createdAt: string }[];
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: 'order' | 'payment' | 'promo' | 'system' | 'otp';
  read: boolean;
  orderId?: string;
  createdAt: string;
}

export interface SettlementRecord {
  id: string;
  recipientType: 'vendor' | 'rider';
  recipientId: string;
  recipientName: string;
  grossAmount: number;
  commissionOrFee: number;
  tipsIncluded: number;
  netPayout: number;
  status: 'pending' | 'settled' | 'failed';
  transferReference?: string;
  settledAt?: string;
  failureReason?: string;
  periodLabel: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  userId: string;
  method: PaymentMethod;
  amount: number;
  currency: 'INR';
  status: PaymentStatus;
  gateway: 'razorpay' | 'cod';
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  webhookEventId?: string;
  failureCode?: string;
  failureReason?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PartnerApplication {
  id: string;
  userId: string;
  applicantName: string;
  phone: string;
  email?: string;
  type: 'vendor' | 'rider';
  businessName?: string;
  serviceCategory?: Exclude<ServiceType, 'pickup_drop' | 'food_prebooking'>;
  areaName?: string;
  address?: string;
  vehicleType?: RiderProfile['vehicleType'];
  vehicleNumber?: string;
  licenseNumber?: string;
  aadhaarLast4?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
}

export type AdminServiceKey =
  | 'food'
  | 'food_prebooking'
  | 'bakery'
  | 'grocery'
  | 'celebration'
  | 'flowers_gifts'
  | 'local_shopping'
  | 'pickup_drop';

export interface PlatformServiceConfig {
  serviceKey: AdminServiceKey;
  label: string;
  enabled: boolean;
  commissionRate: number;
  minOrderInr: number;
  notes?: string;
  updatedAt: string;
}

export interface OperatingExpenseRecord {
  id: string;
  category: 'delivery_ops' | 'marketing' | 'infrastructure' | 'support' | 'other';
  description: string;
  amountInr: number;
  incurredOn: string;
  createdBy: string;
  createdAt: string;
}

export interface MarketingCampaign {
  id: string;
  title: string;
  type: 'seasonal' | 'featured_vendor' | 'push_notification' | 'sponsored' | 'referral';
  description: string;
  targetService: ServiceType | 'all';
  vendorId?: string;
  discountCode?: string;
  budgetInr?: number;
  active: boolean;
  startDate: string;
  endDate: string;
  sentCount?: number;
  createdAt: string;
}

export interface ReferralSettings {
  enabled: boolean;
  referrerRewardPoints: number;
  refereeWelcomePoints: number;
  minOrderForRewardInr: number;
  updatedAt: string;
}

export interface AlertAcknowledgement {
  alertId: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  note?: string;
}

export type AdminSectionKey =
  | 'overview'
  | 'analytics'
  | 'live_ops'
  | 'finance'
  | 'customers'
  | 'vendors'
  | 'riders'
  | 'services'
  | 'service_area'
  | 'marketing'
  | 'ai_bi'
  | 'alerts'
  | 'security'
  | 'reports';

export interface AdminStaffMember {
  id: string;
  fullName: string;
  email: string;
  role: 'super_admin' | 'admin' | 'support_staff';
  permissions: AdminSectionKey[];
  status: 'active' | 'suspended';
  lastLoginAt?: string;
  updatedAt: string;
}

export interface AdminDailyAggregate {
  date: string; // YYYY-MM-DD
  ordersCount: number;
  completedCount: number;
  cancelledCount: number;
  gmvInr: number;
  netRevenueInr: number;
  commissionsInr: number;
  deliveryRevenueInr: number;
  tipsInr: number;
  refundsInr: number;
  updatedAt: string;
}
