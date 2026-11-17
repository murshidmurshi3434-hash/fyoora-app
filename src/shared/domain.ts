import type {
  Coupon,
  DeliveryTier,
  GeoPoint,
  OrderStatus,
  PreBookingSlot,
  Product,
  ServiceAreaConfig,
  ServiceType,
  UserRole,
} from './types.ts';

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c * 100) / 100;
}

export function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;
    const intersect =
      yi > point.lng !== yj > point.lng &&
      point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInServiceArea(
  point: GeoPoint,
  serviceArea: ServiceAreaConfig
): { inside: boolean; distanceFromCenterKm: number; reason?: string } {
  const distanceFromCenterKm = haversineDistanceKm(serviceArea.center, point);
  if (!serviceArea.isActive) {
    return {
      inside: false,
      distanceFromCenterKm,
      reason: `${serviceArea.name} is currently paused by operations.`,
    };
  }
  if (serviceArea.polygon && serviceArea.polygon.length >= 3) {
    const inPoly = isPointInPolygon(point, serviceArea.polygon);
    return {
      inside: inPoly,
      distanceFromCenterKm,
      reason: inPoly ? undefined : `Location is outside the configured ${serviceArea.name} polygon boundary.`,
    };
  }
  const inside = distanceFromCenterKm <= serviceArea.radiusKm;
  return {
    inside,
    distanceFromCenterKm,
    reason: inside
      ? undefined
      : `Location is ${distanceFromCenterKm.toFixed(1)} km from ${serviceArea.name} center (active limit: ${serviceArea.radiusKm} km).`,
  };
}

export interface DeliveryQuoteInput {
  distanceKm: number;
  prepTimeMins: number;
  itemsSubtotal: number;
  tier: DeliveryTier;
  activeRidersCount: number;
  trafficMultiplier?: number;
  serviceArea: ServiceAreaConfig;
}

export interface DeliveryQuoteResult {
  feasible: boolean;
  reason?: string;
  tier: DeliveryTier;
  deliveryFee: number;
  platformFee: number;
  etaMinMins: number;
  etaMaxMins: number;
}

export function calculateDeliveryQuote(input: DeliveryQuoteInput): DeliveryQuoteResult {
  const {
    distanceKm,
    prepTimeMins,
    itemsSubtotal,
    tier,
    activeRidersCount,
    trafficMultiplier = 1.15,
    serviceArea,
  } = input;
  const cfg = serviceArea.deliveryPricing;

  if (distanceKm > serviceArea.radiusKm) {
    return {
      feasible: false,
      reason: `Delivery distance (${distanceKm.toFixed(1)} km) exceeds ${serviceArea.radiusKm} km service radius.`,
      tier,
      deliveryFee: 0,
      platformFee: cfg.platformFeeInr,
      etaMinMins: 0,
      etaMaxMins: 0,
    };
  }

  if (activeRidersCount <= 0) {
    return {
      feasible: false,
      reason: 'No riders are currently online in this zone.',
      tier,
      deliveryFee: 0,
      platformFee: cfg.platformFeeInr,
      etaMinMins: 0,
      etaMaxMins: 0,
    };
  }

  if (tier === 'EXPRESS' && distanceKm > cfg.expressMaxDistanceKm) {
    return {
      feasible: false,
      reason: `Express priority dispatch is only offered within ${cfg.expressMaxDistanceKm} km to guarantee realistic timing.`,
      tier,
      deliveryFee: 0,
      platformFee: cfg.platformFeeInr,
      etaMinMins: 0,
      etaMaxMins: 0,
    };
  }

  // Average Vadakara urban speed ~22 km/h => ~2.73 mins/km
  const baseTravelMins = Math.max(6, Math.round(distanceKm * 2.8 * trafficMultiplier));
  const normalFeeRaw = Math.round(cfg.baseFeeInr + distanceKm * cfg.perKmFeeInr);
  const qualifiesFree = itemsSubtotal >= cfg.freeDeliveryAboveInr;

  if (tier === 'EXPRESS') {
    const fee = Math.round(normalFeeRaw * cfg.expressMultiplier);
    const dispatchBuffer = 4;
    const minEta = Math.max(15, prepTimeMins + baseTravelMins + dispatchBuffer - 3);
    const maxEta = minEta + 8;
    return {
      feasible: true,
      tier,
      deliveryFee: fee,
      platformFee: cfg.platformFeeInr,
      etaMinMins: minEta,
      etaMaxMins: maxEta,
    };
  }

  if (tier === 'ECO') {
    const fee = qualifiesFree ? 0 : Math.max(15, normalFeeRaw - cfg.ecoDiscountInr);
    const batchingWindow = 18;
    const minEta = prepTimeMins + baseTravelMins + batchingWindow;
    const maxEta = minEta + 15;
    return {
      feasible: true,
      tier,
      deliveryFee: fee,
      platformFee: cfg.platformFeeInr,
      etaMinMins: minEta,
      etaMaxMins: maxEta,
    };
  }

  // NORMAL
  const normalFee = qualifiesFree ? 0 : normalFeeRaw;
  const minEta = prepTimeMins + baseTravelMins + 7;
  const maxEta = minEta + 10;
  return {
    feasible: true,
    tier: 'NORMAL',
    deliveryFee: normalFee,
    platformFee: cfg.platformFeeInr,
    etaMinMins: minEta,
    etaMaxMins: maxEta,
  };
}

export function calculatePickupDropQuote(params: {
  pickup: GeoPoint;
  drop: GeoPoint;
  size: 'small' | 'medium' | 'large';
  weightKg: number;
  serviceArea: ServiceAreaConfig;
}): {
  valid: boolean;
  reason?: string;
  distanceKm: number;
  deliveryFee: number;
  platformFee: number;
  totalFee: number;
  etaMinMins: number;
  etaMaxMins: number;
} {
  const { pickup, drop, size, weightKg, serviceArea } = params;
  const pickupCheck = isPointInServiceArea(pickup, serviceArea);
  if (!pickupCheck.inside) {
    return {
      valid: false,
      reason: `Pickup address is outside the ${serviceArea.name} service area. ${pickupCheck.reason ?? ''}`.trim(),
      distanceKm: 0,
      deliveryFee: 0,
      platformFee: 0,
      totalFee: 0,
      etaMinMins: 0,
      etaMaxMins: 0,
    };
  }
  const dropCheck = isPointInServiceArea(drop, serviceArea);
  if (!dropCheck.inside) {
    return {
      valid: false,
      reason: `Drop destination is outside the ${serviceArea.name} service area. ${dropCheck.reason ?? ''}`.trim(),
      distanceKm: 0,
      deliveryFee: 0,
      platformFee: 0,
      totalFee: 0,
      etaMinMins: 0,
      etaMaxMins: 0,
    };
  }
  if (weightKg <= 0 || weightKg > serviceArea.pickupDropPricing.maxWeightKg) {
    return {
      valid: false,
      reason: `Parcel weight must be between 0.1 kg and ${serviceArea.pickupDropPricing.maxWeightKg} kg.`,
      distanceKm: 0,
      deliveryFee: 0,
      platformFee: 0,
      totalFee: 0,
      etaMinMins: 0,
      etaMaxMins: 0,
    };
  }

  const distanceKm = Math.max(0.5, haversineDistanceKm(pickup, drop));
  const p = serviceArea.pickupDropPricing;
  const sizeAdd = p.sizeSurcharge[size] ?? 0;
  const weightAdd = weightKg > 3 ? Math.ceil(weightKg - 3) * 10 : 0;
  const deliveryFee = Math.round(p.baseFeeInr + distanceKm * p.perKmFeeInr + sizeAdd + weightAdd);
  const platformFee = serviceArea.deliveryPricing.platformFeeInr;
  const travelMins = Math.max(12, Math.round(distanceKm * 3.1 + 10));

  return {
    valid: true,
    distanceKm,
    deliveryFee,
    platformFee,
    totalFee: deliveryFee + platformFee,
    etaMinMins: travelMins,
    etaMaxMins: travelMins + 12,
  };
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  order_placed: ['payment_pending', 'payment_confirmed', 'vendor_accepted', 'cancelled'],
  payment_pending: ['payment_confirmed', 'cancelled', 'failed_delivery'],
  payment_confirmed: ['vendor_accepted', 'rider_assigned', 'cancelled', 'refund_pending'],
  vendor_accepted: ['preparation_started', 'rider_assigned', 'cancelled', 'refund_pending'],
  preparation_started: ['ready_for_pickup', 'cancelled', 'refund_pending'],
  ready_for_pickup: ['rider_assigned', 'picked_up', 'delivered', 'cancelled'],
  rider_assigned: ['rider_arrived_at_vendor', 'picked_up', 'cancelled', 'failed_delivery'],
  rider_arrived_at_vendor: ['picked_up', 'cancelled', 'failed_delivery'],
  picked_up: ['out_for_delivery', 'delivered', 'failed_delivery'],
  out_for_delivery: ['delivered', 'failed_delivery'],
  delivered: ['refund_pending'],
  cancelled: ['refund_pending', 'refunded'],
  refund_pending: ['refunded'],
  refunded: [],
  failed_delivery: ['refund_pending', 'rider_assigned'],
};

export function isValidOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
  actorRole: UserRole
): { valid: boolean; reason?: string } {
  if (from === to) {
    return { valid: false, reason: 'Order is already in this status.' };
  }
  const allowedNext = VALID_TRANSITIONS[from] || [];
  if (!allowedNext.includes(to)) {
    return { valid: false, reason: `Cannot transition order from ${from} to ${to}.` };
  }
  if (actorRole === 'customer') {
    const customerAllowed: OrderStatus[] = ['cancelled', 'refund_pending'];
    if (!customerAllowed.includes(to)) {
      return { valid: false, reason: 'Customers can only request cancellation or refund.' };
    }
    if (to === 'cancelled' && ['picked_up', 'out_for_delivery', 'delivered'].includes(from)) {
      return { valid: false, reason: 'Orders already picked up by a rider cannot be cancelled directly.' };
    }
  }
  return { valid: true };
}

export function validateCoupon(
  coupon: Coupon,
  subtotal: number,
  userOrderCount: number,
  serviceType: ServiceType,
  now = new Date()
): { valid: boolean; discountAmount: number; reason?: string } {
  if (!coupon.active) {
    return { valid: false, discountAmount: 0, reason: 'Coupon is no longer active.' };
  }
  if (new Date(coupon.expiresAt).getTime() < now.getTime()) {
    return { valid: false, discountAmount: 0, reason: 'Coupon has expired.' };
  }
  if (coupon.applicableServices !== 'all' && !coupon.applicableServices.includes(serviceType)) {
    return { valid: false, discountAmount: 0, reason: `Coupon ${coupon.code} is not valid for this service.` };
  }
  if (coupon.firstOrderOnly && userOrderCount > 0) {
    return { valid: false, discountAmount: 0, reason: `Coupon ${coupon.code} is valid on first orders only.` };
  }
  if (subtotal < coupon.minOrderInr) {
    return {
      valid: false,
      discountAmount: 0,
      reason: `Minimum order of ₹${coupon.minOrderInr} required for ${coupon.code}.`,
    };
  }

  let rawDiscount =
    coupon.discountType === 'flat'
      ? coupon.discountValue
      : Math.round((subtotal * coupon.discountValue) / 100);
  rawDiscount = Math.min(rawDiscount, coupon.maxDiscountInr, subtotal);
  return { valid: true, discountAmount: rawDiscount };
}

export function validateSlotCapacity(
  slot: PreBookingSlot,
  requestedBookings = 1
): { available: boolean; remaining: number; reason?: string } {
  if (!slot.isActive) {
    return { available: false, remaining: 0, reason: 'Selected time slot is closed.' };
  }
  const remaining = Math.max(0, slot.maxCapacity - slot.bookedCount);
  if (remaining < requestedBookings) {
    return {
      available: false,
      remaining,
      reason: `Slot "${slot.timeLabel}" is full (${slot.bookedCount}/${slot.maxCapacity} booked).`,
    };
  }
  return { available: true, remaining: remaining - requestedBookings };
}

export function validateInventoryPurchase(
  product: Pick<Product, 'name' | 'inStock' | 'stockQty' | 'soldOutManual'>,
  requestedQty: number
): { ok: boolean; reason?: string } {
  if (requestedQty <= 0) {
    return { ok: false, reason: 'Quantity must be at least 1.' };
  }
  if (product.soldOutManual || !product.inStock || product.stockQty <= 0) {
    return { ok: false, reason: `${product.name} is currently out of stock.` };
  }
  if (requestedQty > product.stockQty) {
    return {
      ok: false,
      reason: `Only ${product.stockQty} unit(s) of ${product.name} available right now.`,
    };
  }
  return { ok: true };
}

export function calculateSettlementSplit(params: {
  itemsSubtotal: number;
  deliveryFee: number;
  platformFee: number;
  riderTip: number;
  commissionRate: number;
}): {
  vendorGross: number;
  platformCommission: number;
  vendorNetPayout: number;
  riderDeliveryShare: number;
  riderTip: number;
  riderTotalPayout: number;
  platformNetRevenue: number;
} {
  const { itemsSubtotal, deliveryFee, platformFee, riderTip, commissionRate } = params;
  const platformCommission = Math.round(itemsSubtotal * commissionRate);
  const vendorNetPayout = Math.max(0, itemsSubtotal - platformCommission);
  const riderDeliveryShare = Math.round(deliveryFee * 0.8);
  const platformDeliveryMargin = Math.max(0, deliveryFee - riderDeliveryShare);
  const riderTotalPayout = riderDeliveryShare + riderTip;
  const platformNetRevenue = platformCommission + platformFee + platformDeliveryMargin;

  return {
    vendorGross: itemsSubtotal,
    platformCommission,
    vendorNetPayout,
    riderDeliveryShare,
    riderTip,
    riderTotalPayout,
    platformNetRevenue,
  };
}
