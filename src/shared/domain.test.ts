import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDeliveryQuote,
  calculatePickupDropQuote,
  calculateSettlementSplit,
  haversineDistanceKm,
  isPointInServiceArea,
  isValidOrderTransition,
  validateCoupon,
  validateInventoryPurchase,
  validateSlotCapacity,
} from './domain';
import type { Coupon, PreBookingSlot, ServiceAreaConfig } from './types';

const VADAKARA_AREA: ServiceAreaConfig = {
  id: 'vadakara-main',
  name: 'Vadakara Launch Zone',
  city: 'Vadakara',
  district: 'Kozhikode',
  state: 'Kerala',
  center: { lat: 11.6085, lng: 75.5917 },
  radiusKm: 10,
  isActive: true,
  operatingHours: { open: '06:30', close: '23:00' },
  deliveryPricing: {
    baseFeeInr: 25,
    perKmFeeInr: 8,
    expressMultiplier: 1.6,
    ecoDiscountInr: 10,
    expressMaxDistanceKm: 7,
    platformFeeInr: 5,
    freeDeliveryAboveInr: 499,
  },
  pickupDropPricing: {
    baseFeeInr: 35,
    perKmFeeInr: 10,
    maxWeightKg: 15,
    sizeSurcharge: { small: 0, medium: 20, large: 45 },
  },
  minOrderValues: {
    food: 99,
    food_prebooking: 99,
    bakery: 149,
    grocery: 199,
    celebration: 149,
    flowers_gifts: 199,
  },
};

test('Vadakara 10km configurable geofence accepts inside points and rejects distant points', () => {
  const inside = isPointInServiceArea({ lat: 11.615, lng: 75.595 }, VADAKARA_AREA);
  assert.equal(inside.inside, true);
  assert.ok(inside.distanceFromCenterKm < 2);

  // Kozhikode city (~45km away) must be rejected
  const outside = isPointInServiceArea({ lat: 11.2588, lng: 75.7804 }, VADAKARA_AREA);
  assert.equal(outside.inside, false);
  assert.ok(outside.distanceFromCenterKm > 30);
});

test('Polygon service area overrides radius when configured', () => {
  const polyArea: ServiceAreaConfig = {
    ...VADAKARA_AREA,
    polygon: [
      { lat: 11.58, lng: 75.56 },
      { lat: 11.64, lng: 75.56 },
      { lat: 11.64, lng: 75.62 },
      { lat: 11.58, lng: 75.62 },
    ],
  };
  assert.equal(isPointInServiceArea({ lat: 11.6085, lng: 75.5917 }, polyArea).inside, true);
  assert.equal(isPointInServiceArea({ lat: 11.66, lng: 75.59 }, polyArea).inside, false);
});

test('Delivery quote respects rider availability, distance, and tier feasibility', () => {
  const normal = calculateDeliveryQuote({
    distanceKm: 3.5,
    prepTimeMins: 15,
    itemsSubtotal: 250,
    tier: 'NORMAL',
    activeRidersCount: 3,
    serviceArea: VADAKARA_AREA,
  });
  assert.equal(normal.feasible, true);
  assert.ok(normal.etaMinMins >= 25);
  assert.ok(normal.deliveryFee > 0);

  const expressTooFar = calculateDeliveryQuote({
    distanceKm: 8.5,
    prepTimeMins: 15,
    itemsSubtotal: 250,
    tier: 'EXPRESS',
    activeRidersCount: 3,
    serviceArea: VADAKARA_AREA,
  });
  assert.equal(expressTooFar.feasible, false);

  const noRiders = calculateDeliveryQuote({
    distanceKm: 2,
    prepTimeMins: 10,
    itemsSubtotal: 250,
    tier: 'NORMAL',
    activeRidersCount: 0,
    serviceArea: VADAKARA_AREA,
  });
  assert.equal(noRiders.feasible, false);
});

test('Pickup & Drop validates BOTH pickup and drop within service area and weight limit', () => {
  const valid = calculatePickupDropQuote({
    pickup: { lat: 11.6085, lng: 75.5917 },
    drop: { lat: 11.622, lng: 75.605 },
    size: 'medium',
    weightKg: 4,
    serviceArea: VADAKARA_AREA,
  });
  assert.equal(valid.valid, true);
  assert.ok(valid.totalFee > 50);

  const invalidDrop = calculatePickupDropQuote({
    pickup: { lat: 11.6085, lng: 75.5917 },
    drop: { lat: 11.2588, lng: 75.7804 },
    size: 'small',
    weightKg: 1,
    serviceArea: VADAKARA_AREA,
  });
  assert.equal(invalidDrop.valid, false);

  const overweight = calculatePickupDropQuote({
    pickup: { lat: 11.6085, lng: 75.5917 },
    drop: { lat: 11.615, lng: 75.595 },
    size: 'large',
    weightKg: 20,
    serviceArea: VADAKARA_AREA,
  });
  assert.equal(overweight.valid, false);
});

test('Order lifecycle enforces valid transitions and role boundaries', () => {
  assert.equal(isValidOrderTransition('payment_confirmed', 'vendor_accepted', 'restaurant_owner').valid, true);
  assert.equal(isValidOrderTransition('order_placed', 'delivered', 'customer').valid, false);
  assert.equal(isValidOrderTransition('picked_up', 'cancelled', 'customer').valid, false);
  assert.equal(isValidOrderTransition('delivered', 'cancelled', 'admin').valid, false);
});

test('Pre-booking slot validation prevents overbooking and grocery inventory blocks out-of-stock purchase', () => {
  const fullSlot: PreBookingSlot = {
    id: 'slot-1',
    vendorId: 'v-1',
    date: '2026-11-16',
    timeLabel: '12:30 PM - 01:00 PM',
    maxCapacity: 10,
    bookedCount: 10,
    isActive: true,
  };
  assert.equal(validateSlotCapacity(fullSlot, 1).available, false);

  assert.equal(
    validateInventoryPurchase({ name: 'Milma Curd', inStock: false, stockQty: 0, soldOutManual: false }, 1).ok,
    false
  );
  assert.equal(
    validateInventoryPurchase({ name: 'Matta Rice 5kg', inStock: true, stockQty: 4, soldOutManual: false }, 5).ok,
    false
  );
  assert.equal(
    validateInventoryPurchase({ name: 'Matta Rice 5kg', inStock: true, stockQty: 4, soldOutManual: false }, 2).ok,
    true
  );
});

test('Coupon & settlement split calculate accurate INR amounts with separate tip tracking', () => {
  const coupon: Coupon = {
    id: 'c1',
    code: 'VADAKARA50',
    title: '₹50 Off',
    description: 'Flat ₹50 off above ₹249',
    discountType: 'flat',
    discountValue: 50,
    maxDiscountInr: 50,
    minOrderInr: 249,
    applicableServices: 'all',
    active: true,
    expiresAt: '2028-12-31T23:59:59Z',
  };
  const res = validateCoupon(coupon, 300, 1, 'food', new Date('2026-11-15T12:00:00Z'));
  assert.equal(res.valid, true);
  assert.equal(res.discountAmount, 50);

  const split = calculateSettlementSplit({
    itemsSubtotal: 500,
    deliveryFee: 40,
    platformFee: 5,
    riderTip: 30,
    commissionRate: 0.15,
  });
  assert.equal(split.platformCommission, 75);
  assert.equal(split.vendorNetPayout, 425);
  assert.equal(split.riderTip, 30);
  assert.equal(split.riderDeliveryShare, 32);
  assert.equal(split.riderTotalPayout, 62);
  assert.equal(haversineDistanceKm({ lat: 11.6085, lng: 75.5917 }, { lat: 11.6085, lng: 75.5917 }), 0);
});
