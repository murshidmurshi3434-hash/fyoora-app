import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { getDb, withTransaction } from './store.ts';
import { processRazorpayWebhook } from './razorpayWebhook.ts';
import type { Order } from '../shared/types.ts';

const TEST_SECRET = 'fyoora_test_webhook_secret_987654321';

function signWebhookPayload(rawBody: string, secret = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function makePendingRazorpayOrder(overrides: Partial<Order> = {}): Order {
  const now = new Date().toISOString();
  const id = overrides.id || `ord-test-${crypto.randomBytes(4).toString('hex')}`;
  const rzpOrderId = overrides.razorpayOrderId || `order_rzp_${crypto.randomBytes(4).toString('hex')}`;
  return {
    id,
    orderNumber: overrides.orderNumber || `FYR-TEST-${crypto.randomInt(1000, 9999)}`,
    customerId: 'usr-cust-1',
    customerName: 'Fathima Nizar',
    customerPhone: '+919847112233',
    serviceType: 'food',
    vendorId: 'vnd-food-1',
    vendorName: 'Malabar Spice Kitchen',
    subOrders: [
      {
        subOrderId: `sub-${id}-1`,
        vendorId: 'vnd-food-1',
        vendorName: 'Malabar Spice Kitchen',
        status: 'payment_pending',
        items: [],
        subtotal: 400,
        commissionAmount: 64,
        vendorNetPayout: 336,
      },
    ],
    items: [],
    deliveryAddress: {
      id: 'addr-cust-1',
      label: 'Home',
      line1: 'Edodi Arcade, Vadakara',
      city: 'Vadakara',
      district: 'Kozhikode',
      state: 'Kerala',
      pincode: '673101',
      lat: 11.6061,
      lng: 75.5882,
    },
    deliveryTier: 'NORMAL',
    deliveryMode: 'instant',
    riderInstructions: [],
    pricing: {
      itemsSubtotal: 400,
      discount: 0,
      deliveryFee: 25,
      platformFee: 5,
      riderTip: 0,
      grandTotal: 430,
    },
    etaMinutes: { min: 25, max: 35 },
    distanceKm: 1.4,
    paymentMethod: 'razorpay_upi',
    paymentStatus: 'pending',
    razorpayOrderId: rzpOrderId,
    status: 'payment_pending',
    statusHistory: [{ status: 'payment_pending', timestamp: now, actorRole: 'customer' }],
    pickupOtp: '1234',
    deliveryOtp: '5678',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedTestOrder(order: Order): Promise<void> {
  await withTransaction((db) => {
    db.orders.unshift(order);
  });
}

async function cleanupTestOrder(orderId: string, eventIds: string[]): Promise<void> {
  await withTransaction((db) => {
    db.orders = db.orders.filter((o) => o.id !== orderId);
    db.paymentTransactions = db.paymentTransactions.filter((t) => t.orderId !== orderId);
    db.notifications = db.notifications.filter((n) => n.orderId !== orderId);
    db.auditLogs = db.auditLogs.filter((a) => a.targetId !== orderId && !eventIds.includes(a.targetId));
    for (const evtId of eventIds) {
      delete db.processedWebhookEvents[evtId];
    }
  });
}

test('rejects webhook with 503 when RAZORPAY_WEBHOOK_SECRET is not configured', async () => {
  const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    const rawBody = JSON.stringify({ event: 'payment.captured', payload: {} });
    const res = await processRazorpayWebhook({
      rawBody,
      signature: signWebhookPayload(rawBody, TEST_SECRET),
      syncFirestore: false,
    });
    assert.equal(res.httpStatus, 503);
    assert.equal(res.body.received, false);
    assert.match(res.body.error || '', /RAZORPAY_WEBHOOK_SECRET/i);
  } finally {
    if (prevSecret !== undefined) process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret;
  }
});

test('rejects missing or invalid x-razorpay-signature with 401 and does not modify order', async () => {
  const order = makePendingRazorpayOrder();
  const eventId = `evt_invalid_${crypto.randomBytes(4).toString('hex')}`;
  await seedTestOrder(order);

  try {
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_bad_sig_001',
            order_id: order.razorpayOrderId,
            amount: 43000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const badRes = await processRazorpayWebhook({
      rawBody,
      signature: '0000deadbeef111122223333444455556666777788889999aaaabbbbccccdddd',
      eventIdHeader: eventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(badRes.httpStatus, 401);
    assert.equal(badRes.body.received, false);

    const missingRes = await processRazorpayWebhook({
      rawBody,
      signature: '',
      eventIdHeader: eventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(missingRes.httpStatus, 401);

    const stored = getDb().orders.find((o) => o.id === order.id);
    assert.equal(stored?.paymentStatus, 'pending');
    assert.equal(stored?.status, 'payment_pending');
  } finally {
    await cleanupTestOrder(order.id, [eventId]);
  }
});

test('processes payment.captured securely and prevents duplicate event replay', async () => {
  const order = makePendingRazorpayOrder();
  const eventId = `evt_cap_${crypto.randomBytes(4).toString('hex')}`;
  const paymentId = `pay_rzp_${crypto.randomBytes(4).toString('hex')}`;
  await seedTestOrder(order);

  try {
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: order.razorpayOrderId,
            amount: 43000,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
          },
        },
      },
    });
    const signature = signWebhookPayload(rawBody);

    const first = await processRazorpayWebhook({
      rawBody,
      signature,
      eventIdHeader: eventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });

    assert.equal(first.httpStatus, 200);
    assert.equal(first.body.received, true);
    assert.equal(first.body.handled, true);
    assert.equal(first.body.orderId, order.id);

    const db = getDb();
    const updatedOrder = db.orders.find((o) => o.id === order.id);
    assert.equal(updatedOrder?.paymentStatus, 'captured');
    assert.equal(updatedOrder?.status, 'payment_confirmed');
    assert.equal(updatedOrder?.razorpayPaymentId, paymentId);
    assert.equal(updatedOrder?.subOrders[0].status, 'payment_confirmed');

    const txsAfterFirst = db.paymentTransactions.filter((t) => t.orderId === order.id);
    assert.equal(txsAfterFirst.length, 1);
    assert.equal(txsAfterFirst[0].status, 'captured');
    assert.equal(txsAfterFirst[0].gatewayPaymentId, paymentId);

    // Replay the exact same event ID: must return duplicate: true without re-mutating
    const replay = await processRazorpayWebhook({
      rawBody,
      signature,
      eventIdHeader: eventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(replay.httpStatus, 200);
    assert.equal(replay.body.duplicate, true);
    assert.equal(
      getDb().paymentTransactions.filter((t) => t.orderId === order.id).length,
      1
    );
    assert.equal(updatedOrder?.statusHistory.length, 2);
  } finally {
    await cleanupTestOrder(order.id, [eventId]);
  }
});

test('handles order.paid and ignores redundant follow-up capture without duplicating transactions', async () => {
  const order = makePendingRazorpayOrder();
  const orderPaidEventId = `evt_ordpaid_${crypto.randomBytes(4).toString('hex')}`;
  const secondCapEventId = `evt_cap2_${crypto.randomBytes(4).toString('hex')}`;
  const paymentId = `pay_rzp_${crypto.randomBytes(4).toString('hex')}`;
  await seedTestOrder(order);

  try {
    const orderPaidBody = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: order.razorpayOrderId,
            amount: 43000,
            amount_paid: 43000,
            currency: 'INR',
            status: 'paid',
          },
        },
        payment: {
          entity: {
            id: paymentId,
            order_id: order.razorpayOrderId,
            amount: 43000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const res1 = await processRazorpayWebhook({
      rawBody: orderPaidBody,
      signature: signWebhookPayload(orderPaidBody),
      eventIdHeader: orderPaidEventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(res1.httpStatus, 200);
    assert.equal(res1.body.handled, true);
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.status, 'payment_confirmed');

    // Follow-up payment.captured with a DIFFERENT event ID should be safely ignored as already_captured
    const capBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: order.razorpayOrderId,
            amount: 43000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });
    const res2 = await processRazorpayWebhook({
      rawBody: capBody,
      signature: signWebhookPayload(capBody),
      eventIdHeader: secondCapEventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(res2.httpStatus, 200);
    assert.equal(res2.body.ignored, true);
    assert.equal(res2.body.reason, 'already_captured');
    assert.equal(getDb().paymentTransactions.filter((t) => t.orderId === order.id).length, 1);
  } finally {
    await cleanupTestOrder(order.id, [orderPaidEventId, secondCapEventId]);
  }
});

test('rejects tampered underpaid amount in webhook payload', async () => {
  const order = makePendingRazorpayOrder();
  const eventId = `evt_amt_${crypto.randomBytes(4).toString('hex')}`;
  await seedTestOrder(order);

  try {
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_underpaid_1',
            order_id: order.razorpayOrderId,
            amount: 100, // ₹1 instead of ₹430 (43000 paise)
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const res = await processRazorpayWebhook({
      rawBody,
      signature: signWebhookPayload(rawBody),
      eventIdHeader: eventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });

    assert.equal(res.httpStatus, 400);
    assert.equal(res.body.received, false);
    const stored = getDb().orders.find((o) => o.id === order.id);
    assert.equal(stored?.paymentStatus, 'pending');
    assert.equal(stored?.status, 'payment_pending');
  } finally {
    await cleanupTestOrder(order.id, [eventId]);
  }
});

test('handles payment.failed without downgrading an already captured order', async () => {
  const order = makePendingRazorpayOrder();
  const failEventId = `evt_fail_${crypto.randomBytes(4).toString('hex')}`;
  const lateFailEventId = `evt_latefail_${crypto.randomBytes(4).toString('hex')}`;
  const capEventId = `evt_cap_${crypto.randomBytes(4).toString('hex')}`;
  await seedTestOrder(order);

  try {
    const failBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_fail_01',
            order_id: order.razorpayOrderId,
            amount: 43000,
            currency: 'INR',
            status: 'failed',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'UPI collect request expired',
          },
        },
      },
    });

    const failRes = await processRazorpayWebhook({
      rawBody: failBody,
      signature: signWebhookPayload(failBody),
      eventIdHeader: failEventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(failRes.httpStatus, 200);
    assert.equal(failRes.body.handled, true);
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.paymentStatus, 'failed');
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.status, 'payment_pending');

    // Subsequent retry succeeds via payment.captured
    const capBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_retry_ok',
            order_id: order.razorpayOrderId,
            amount: 43000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });
    const capRes = await processRazorpayWebhook({
      rawBody: capBody,
      signature: signWebhookPayload(capBody),
      eventIdHeader: capEventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(capRes.httpStatus, 200);
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.paymentStatus, 'captured');
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.status, 'payment_confirmed');

    // Late delayed failure from first attempt must NOT downgrade captured payment
    const lateFailRes = await processRazorpayWebhook({
      rawBody: failBody,
      signature: signWebhookPayload(failBody),
      eventIdHeader: lateFailEventId,
      webhookSecret: TEST_SECRET,
      syncFirestore: false,
    });
    assert.equal(lateFailRes.httpStatus, 200);
    assert.equal(lateFailRes.body.ignored, true);
    assert.equal(lateFailRes.body.reason, 'already_captured');
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.paymentStatus, 'captured');
  } finally {
    await cleanupTestOrder(order.id, [failEventId, lateFailEventId, capEventId]);
  }
});

test('HTTP POST /api/webhooks/razorpay verifies raw Express body signature end-to-end', async () => {
  const order = makePendingRazorpayOrder();
  const eventId = `evt_http_${crypto.randomBytes(4).toString('hex')}`;
  await seedTestOrder(order);

  const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;

  const app = express();
  app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const evtId = req.headers['x-razorpay-event-id']
      ? String(req.headers['x-razorpay-event-id'])
      : undefined;
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : '';
    const outcome = await processRazorpayWebhook({
      rawBody,
      signature,
      eventIdHeader: evtId,
      syncFirestore: false,
    });
    return res.status(outcome.httpStatus).json(outcome.body);
  });
  app.use(express.json());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const url = `http://127.0.0.1:${addr.port}/api/webhooks/razorpay`;

    // Pretty-printed JSON with intentional whitespace to verify exact raw byte HMAC check
    const rawBody = JSON.stringify(
      {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_http_ok',
              order_id: order.razorpayOrderId,
              amount: 43000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      },
      null,
      2
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signWebhookPayload(rawBody),
        'x-razorpay-event-id': eventId,
      },
      body: rawBody,
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as { received: boolean; handled: boolean; orderId: string };
    assert.equal(json.received, true);
    assert.equal(json.handled, true);
    assert.equal(json.orderId, order.id);
    assert.equal(getDb().orders.find((o) => o.id === order.id)?.status, 'payment_confirmed');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prevSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret;
    await cleanupTestOrder(order.id, [eventId]);
  }
});
