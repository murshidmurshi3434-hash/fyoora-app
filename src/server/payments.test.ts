import assert from 'node:assert/strict';
import test from 'node:test';
import { isRazorpayPaymentCaptured } from './payments.ts';

test('Razorpay payment is accepted only when captured for the exact order and INR amount', () => {
  const expected = { razorpayOrderId: 'order_123', amountInr: 275.5 };

  assert.equal(
    isRazorpayPaymentCaptured(
      { order_id: 'order_123', status: 'captured', currency: 'INR', amount: 27550 },
      expected
    ),
    true
  );
  assert.equal(
    isRazorpayPaymentCaptured(
      { order_id: 'order_123', status: 'authorized', currency: 'INR', amount: 27550 },
      expected
    ),
    false
  );
  assert.equal(
    isRazorpayPaymentCaptured(
      { order_id: 'order_123', status: 'captured', currency: 'INR', amount: 27549 },
      expected
    ),
    false
  );
  assert.equal(
    isRazorpayPaymentCaptured(
      { order_id: 'another_order', status: 'captured', currency: 'INR', amount: 27550 },
      expected
    ),
    false
  );
});
