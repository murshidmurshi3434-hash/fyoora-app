import crypto from 'node:crypto';
import { adminDb } from './firebaseAdmin.ts';
import type { Order, PaymentTransaction } from '../shared/types.ts';
import { verifyRazorpayWebhookSignature } from './payments.ts';
import type { DatabaseState, ProcessedWebhookEventRecord } from './seedData.ts';
import { withTransaction } from './store.ts';

export interface RazorpayWebhookInput {
  rawBody: string;
  signature: string;
  eventIdHeader?: string;
  webhookSecret?: string;
  syncFirestore?: boolean;
}

export interface RazorpayWebhookOutcome {
  httpStatus: number;
  body: {
    received: boolean;
    error?: string;
    code?: string;
    status?: string;
    event?: string;
    eventId?: string;
    orderId?: string;
    paymentId?: string;
    duplicate?: boolean;
    ignored?: boolean;
    reason?: string;
    handled?: boolean;
    firestoreSynced?: boolean;
  };
}

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  error_code?: string;
  error_description?: string;
  error_reason?: string;
  notes?: Record<string, string>;
}

interface RazorpayOrderEntity {
  id?: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  status?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

interface RazorpayRefundEntity {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: 'pending' | 'processed' | 'failed';
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event?: string;
  created_at?: number;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    order?: { entity?: RazorpayOrderEntity };
    refund?: { entity?: RazorpayRefundEntity };
  };
}

function deriveCanonicalEventId(
  eventIdHeader: string | undefined,
  eventName: string,
  rawBody: string,
  entityId?: string
): string {
  const headerVal = (eventIdHeader || '').trim();
  if (headerVal) return headerVal;
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 20);
  return `${eventName || 'unknown'}:${entityId || 'none'}:${bodyHash}`;
}

function findMatchingOrder(
  db: DatabaseState,
  rzpOrderId?: string,
  notes?: Record<string, string>
): Order | undefined {
  if (rzpOrderId) {
    const byGatewayId = db.orders.find((o) => o.razorpayOrderId === rzpOrderId);
    if (byGatewayId) return byGatewayId;
  }
  const noteOrderId = notes?.fyooraOrderId || notes?.orderId;
  if (noteOrderId) {
    const byNote = db.orders.find((o) => o.id === noteOrderId);
    if (byNote && (!byNote.razorpayOrderId || !rzpOrderId || byNote.razorpayOrderId === rzpOrderId)) {
      return byNote;
    }
  }
  return undefined;
}

export async function syncWebhookOutcomeToFirestore(params: {
  order?: Order;
  transaction?: PaymentTransaction;
  webhookEvent: ProcessedWebhookEventRecord;
}): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_FIRESTORE_SYNC === 'true') {
    return false;
  }
  try {
   const firestore = adminDb;
    const batch = firestore.batch();

    if (params.order) {
      batch.set(
        firestore.collection('orders').doc(params.order.id),
        {
          id: params.order.id,
          orderNumber: params.order.orderNumber,
          customerId: params.order.customerId,
          vendorId: params.order.vendorId || null,
          riderId: params.order.riderId || null,
          status: params.order.status,
          paymentStatus: params.order.paymentStatus,
          razorpayOrderId: params.order.razorpayOrderId || null,
          razorpayPaymentId: params.order.razorpayPaymentId || null,
          razorpayRefundId: params.order.razorpayRefundId || null,
          razorpayRefundStatus: params.order.razorpayRefundStatus || null,
          pricing: params.order.pricing,
          updatedAt: params.order.updatedAt,
          createdAt: params.order.createdAt,
        },
        { merge: true }
      );
    }

    if (params.transaction) {
      batch.set(
        firestore.collection('payment_transactions').doc(params.transaction.id),
        params.transaction,
        { merge: true }
      );
    }

    batch.set(
      firestore.collection('webhook_events').doc(params.webhookEvent.eventId),
      params.webhookEvent,
      { merge: true }
    );

    await batch.commit();
    return true;
  } catch (err) {
    // Expected in local sandbox when GCP Application Default Credentials are absent;
    // primary transactional state in store.ts remains authoritative.
    console.warn(
      'Firestore webhook sync skipped (credentials unavailable or offline):',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

export async function processRazorpayWebhook(
  input: RazorpayWebhookInput
): Promise<RazorpayWebhookOutcome> {
  const sigCheck = verifyRazorpayWebhookSignature(
    input.rawBody,
    input.signature,
    input.webhookSecret
  );

  if (!sigCheck.valid) {
    if (sigCheck.reason === 'missing_secret') {
      return {
        httpStatus: 503,
        body: {
          received: false,
          code: 'WEBHOOK_SECRET_PENDING_CONFIGURATION',
          status: 'PENDING CONFIGURATION',
          error: 'Razorpay webhook secret (RAZORPAY_WEBHOOK_SECRET) is pending configuration on the server.',
        },
      };
    }

    await withTransaction((db) => {
      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: 'razorpay_webhook',
        actorRole: 'admin',
        action: 'RAZORPAY_WEBHOOK_INVALID_SIGNATURE',
        targetType: 'payment_webhook',
        targetId: input.eventIdHeader || 'unsigned',
        details: `Rejected webhook due to ${sigCheck.reason || 'invalid_signature'}`,
        createdAt: new Date().toISOString(),
      });
    });

    return {
      httpStatus: 401,
      body: {
        received: false,
        error: 'Invalid webhook signature.',
      },
    };
  }

  let parsed: RazorpayWebhookPayload;
  try {
    parsed = JSON.parse(input.rawBody) as RazorpayWebhookPayload;
  } catch {
    return {
      httpStatus: 400,
      body: {
        received: false,
        error: 'Malformed webhook JSON payload.',
      },
    };
  }

  const eventName = String(parsed.event || '').trim();
  if (!eventName) {
    return {
      httpStatus: 400,
      body: {
        received: false,
        error: 'Missing Razorpay webhook event name.',
      },
    };
  }

  const paymentEntity = parsed.payload?.payment?.entity;
  const orderEntity = parsed.payload?.order?.entity;
  const refundEntity = parsed.payload?.refund?.entity;
  const entityId = refundEntity?.id || paymentEntity?.id || orderEntity?.id;
  const eventId = deriveCanonicalEventId(input.eventIdHeader, eventName, input.rawBody, entityId);

  let syncedOrder: Order | undefined;
  let syncedTx: PaymentTransaction | undefined;
  let webhookRecord: ProcessedWebhookEventRecord | undefined;

  const txResult = await withTransaction((db): RazorpayWebhookOutcome => {
    if (db.processedWebhookEvents[eventId]) {
      return {
        httpStatus: 200,
        body: {
          received: true,
          duplicate: true,
          event: eventName,
          eventId,
          orderId: db.processedWebhookEvents[eventId].orderId,
          paymentId: db.processedWebhookEvents[eventId].paymentId,
        },
      };
    }

    const now = new Date().toISOString();

    if (['refund.created', 'refund.processed', 'refund.failed'].includes(eventName)) {
      const refundStatus = eventName === 'refund.processed'
        ? 'processed'
        : eventName === 'refund.failed'
          ? 'failed'
          : refundEntity?.status || 'pending';
      const refundOrder = db.orders.find((order) =>
        (refundEntity?.id && order.razorpayRefundId === refundEntity.id) ||
        (refundEntity?.payment_id && order.razorpayPaymentId === refundEntity.payment_id) ||
        (refundEntity?.notes?.fyoora_order_id && order.id === refundEntity.notes.fyoora_order_id)
      );
      const rec: ProcessedWebhookEventRecord = {
        eventId,
        event: eventName,
        orderId: refundOrder?.id,
        paymentId: refundEntity?.payment_id,
        processedAt: now,
      };
      db.processedWebhookEvents[eventId] = rec;
      webhookRecord = rec;

      if (!refundOrder || !refundEntity?.id) {
        return {
          httpStatus: 200,
          body: { received: true, ignored: true, reason: 'refund_order_not_found', event: eventName, eventId },
        };
      }

      if (refundOrder.razorpayRefundStatus !== 'processed') {
        refundOrder.razorpayRefundId = refundEntity.id;
        refundOrder.razorpayRefundStatus = refundStatus;
        if (refundStatus === 'processed') {
          const fullAmount = Math.round(refundOrder.pricing.grandTotal * 100);
          if (Number(refundEntity.amount) >= fullAmount) {
            refundOrder.paymentStatus = 'refunded';
            refundOrder.status = 'refunded';
            refundOrder.refundRequestStartedAt = undefined;
            refundOrder.statusHistory.push({
              status: 'refunded',
              timestamp: now,
              actorRole: 'admin',
              note: `Razorpay refund ${refundEntity.id} processed`,
            });
            db.notifications.unshift({
              id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
              userId: refundOrder.customerId,
              title: `Refund processed for ${refundOrder.orderNumber}`,
              body: `Your refund of ₹${refundOrder.pricing.grandTotal} has been processed by Razorpay.`,
              category: 'payment',
              orderId: refundOrder.id,
              read: false,
              createdAt: now,
            });
          } else {
            // A partial refund cannot close this full-refund workflow.
            refundOrder.paymentStatus = 'refund_pending';
            refundOrder.refundRequestStartedAt = undefined;
          }
        } else if (refundStatus === 'failed') {
          refundOrder.paymentStatus = 'captured';
          refundOrder.refundRequestStartedAt = undefined;
          refundOrder.razorpayRefundId = undefined;
        } else {
          refundOrder.paymentStatus = 'refund_pending';
        }
        refundOrder.updatedAt = now;
        db.paymentTransactions
          .filter((tx) => tx.orderId === refundOrder.id && tx.gateway === 'razorpay')
          .forEach((tx) => {
            tx.status = refundOrder.paymentStatus;
            tx.updatedAt = now;
          });
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: 'razorpay_webhook',
          actorRole: 'admin',
          action: `RAZORPAY_REFUND_${refundStatus.toUpperCase()}`,
          targetType: 'order',
          targetId: refundOrder.id,
          details: `Razorpay refund ${refundEntity.id} for ${refundOrder.orderNumber} reported ${refundStatus}`,
          createdAt: now,
        });
      }
      syncedOrder = refundOrder;
      syncedTx = db.paymentTransactions.find((tx) => tx.orderId === refundOrder.id && tx.gateway === 'razorpay');
      return {
        httpStatus: 200,
        body: {
          received: true,
          handled: true,
          event: eventName,
          eventId,
          orderId: refundOrder.id,
          paymentId: refundEntity.payment_id,
        },
      };
    }

    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      const rzpOrderId =
        eventName === 'payment.captured'
          ? paymentEntity?.order_id || orderEntity?.id
          : orderEntity?.id || paymentEntity?.order_id;
      const rzpPaymentId = paymentEntity?.id;
      const notes = paymentEntity?.notes || orderEntity?.notes;

      const ord = findMatchingOrder(db, rzpOrderId, notes);
      if (!ord) {
        const rec: ProcessedWebhookEventRecord = {
          eventId,
          event: eventName,
          paymentId: rzpPaymentId,
          processedAt: now,
        };
        db.processedWebhookEvents[eventId] = rec;
        webhookRecord = rec;
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: 'razorpay_webhook',
          actorRole: 'admin',
          action: 'RAZORPAY_WEBHOOK_ORDER_NOT_FOUND',
          targetType: 'payment_webhook',
          targetId: rzpOrderId || eventId,
          details: `No FYOORA order matched gatewayOrderId=${rzpOrderId || 'none'} for ${eventName}`,
          createdAt: now,
        });
        return {
          httpStatus: 200,
          body: {
            received: true,
            ignored: true,
            reason: 'order_not_found',
            event: eventName,
            eventId,
          },
        };
      }

      if (eventName === 'order.paid' && orderEntity?.status && orderEntity.status !== 'paid') {
        return {
          httpStatus: 200,
          body: {
            received: true,
            ignored: true,
            reason: 'order_not_paid_yet',
            event: eventName,
            eventId,
            orderId: ord.id,
          },
        };
      }

      const expectedPaise = Math.round(ord.pricing.grandTotal * 100);
      const receivedPaise =
        eventName === 'payment.captured'
          ? Number(paymentEntity?.amount ?? 0)
          : Number(orderEntity?.amount_paid ?? paymentEntity?.amount ?? orderEntity?.amount ?? 0);
      const currency = String(
        paymentEntity?.currency || orderEntity?.currency || 'INR'
      ).toUpperCase();

      if (currency !== 'INR' || !Number.isFinite(receivedPaise) || receivedPaise < expectedPaise) {
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: 'razorpay_webhook',
          actorRole: 'admin',
          action: 'RAZORPAY_WEBHOOK_AMOUNT_MISMATCH',
          targetType: 'order',
          targetId: ord.id,
          details: `Expected >=${expectedPaise} paise INR, received ${receivedPaise} ${currency} (${eventName})`,
          createdAt: now,
        });
        return {
          httpStatus: 400,
          body: {
            received: false,
            error: 'Webhook payment amount or currency mismatch.',
            event: eventName,
            eventId,
            orderId: ord.id,
          },
        };
      }

      const rec: ProcessedWebhookEventRecord = {
        eventId,
        event: eventName,
        orderId: ord.id,
        paymentId: rzpPaymentId || ord.razorpayPaymentId,
        processedAt: now,
      };
      db.processedWebhookEvents[eventId] = rec;
      webhookRecord = rec;

      // Prevent duplicate capture transitions across distinct webhook events (e.g., payment.captured + order.paid)
      if (ord.paymentStatus === 'captured') {
        if (rzpPaymentId && !ord.razorpayPaymentId) {
          ord.razorpayPaymentId = rzpPaymentId;
          ord.updatedAt = now;
        }
        syncedOrder = ord;
        return {
          httpStatus: 200,
          body: {
            received: true,
            ignored: true,
            reason: 'already_captured',
            event: eventName,
            eventId,
            orderId: ord.id,
            paymentId: ord.razorpayPaymentId,
          },
        };
      }

      ord.paymentStatus = 'captured';
      if (rzpOrderId && !ord.razorpayOrderId) ord.razorpayOrderId = rzpOrderId;
      if (rzpPaymentId) ord.razorpayPaymentId = rzpPaymentId;

      if (ord.status === 'payment_pending' || ord.status === 'order_placed') {
        ord.status = 'payment_confirmed';
        ord.statusHistory.push({
          status: 'payment_confirmed',
          timestamp: now,
          actorRole: 'admin',
          note: `Payment verified via Razorpay webhook (${eventName})`,
        });
      }
      ord.subOrders.forEach((sub) => {
        if (sub.status === 'payment_pending' || sub.status === 'order_placed') {
          sub.status = 'payment_confirmed';
        }
      });
      ord.updatedAt = now;

      const tx: PaymentTransaction = {
        id: `pay-${crypto.randomBytes(4).toString('hex')}`,
        orderId: ord.id,
        userId: ord.customerId,
        method: ord.paymentMethod,
        amount: ord.pricing.grandTotal,
        currency: 'INR',
        status: 'captured',
        gateway: 'razorpay',
        gatewayOrderId: ord.razorpayOrderId || rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        webhookEventId: eventId,
        createdAt: now,
        updatedAt: now,
      };
      db.paymentTransactions.unshift(tx);

      db.notifications.unshift({
        id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
        userId: ord.customerId,
        title: `Payment confirmed for ${ord.orderNumber}`,
        body: `₹${ord.pricing.grandTotal} received via Razorpay. Your order is confirmed.`,
        category: 'payment',
        orderId: ord.id,
        read: false,
        createdAt: now,
      });

      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: 'razorpay_webhook',
        actorRole: 'admin',
        action:
          eventName === 'order.paid'
            ? 'RAZORPAY_WEBHOOK_ORDER_PAID'
            : 'RAZORPAY_WEBHOOK_PAYMENT_CAPTURED',
        targetType: 'order',
        targetId: ord.id,
        details: `Order ${ord.orderNumber} marked paid/captured (rzpPaymentId=${rzpPaymentId || 'none'})`,
        createdAt: now,
      });

      syncedOrder = ord;
      syncedTx = tx;

      return {
        httpStatus: 200,
        body: {
          received: true,
          handled: true,
          event: eventName,
          eventId,
          orderId: ord.id,
          paymentId: rzpPaymentId,
        },
      };
    }

    if (eventName === 'payment.failed') {
      const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;
      const rzpPaymentId = paymentEntity?.id;
      const notes = paymentEntity?.notes || orderEntity?.notes;
      const ord = findMatchingOrder(db, rzpOrderId, notes);

      const rec: ProcessedWebhookEventRecord = {
        eventId,
        event: eventName,
        orderId: ord?.id,
        paymentId: rzpPaymentId,
        processedAt: now,
      };
      db.processedWebhookEvents[eventId] = rec;
      webhookRecord = rec;

      if (!ord) {
        return {
          httpStatus: 200,
          body: {
            received: true,
            ignored: true,
            reason: 'order_not_found',
            event: eventName,
            eventId,
          },
        };
      }

      // Never downgrade an already captured or settled order if an earlier attempt fails asynchronously
      if (
        ord.paymentStatus === 'captured' ||
        ord.paymentStatus === 'refund_pending' ||
        ord.paymentStatus === 'refunded'
      ) {
        syncedOrder = ord;
        return {
          httpStatus: 200,
          body: {
            received: true,
            ignored: true,
            reason: 'already_captured',
            event: eventName,
            eventId,
            orderId: ord.id,
          },
        };
      }

      const failCode = paymentEntity?.error_code || 'PAYMENT_FAILED';
      const failReason =
        paymentEntity?.error_description ||
        paymentEntity?.error_reason ||
        'Payment failed at Razorpay gateway.';

      ord.paymentStatus = 'failed';
      if (rzpPaymentId) ord.razorpayPaymentId = rzpPaymentId;
      ord.updatedAt = now;
      ord.statusHistory.push({
        status: ord.status,
        timestamp: now,
        actorRole: 'admin',
        note: `Razorpay payment failed (${failCode}): ${failReason}`,
      });

      const tx: PaymentTransaction = {
        id: `pay-${crypto.randomBytes(4).toString('hex')}`,
        orderId: ord.id,
        userId: ord.customerId,
        method: ord.paymentMethod,
        amount: ord.pricing.grandTotal,
        currency: 'INR',
        status: 'failed',
        gateway: 'razorpay',
        gatewayOrderId: ord.razorpayOrderId || rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        webhookEventId: eventId,
        failureCode: failCode,
        failureReason: failReason,
        createdAt: now,
        updatedAt: now,
      };
      db.paymentTransactions.unshift(tx);

      db.notifications.unshift({
        id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
        userId: ord.customerId,
        title: `Payment failed for ${ord.orderNumber}`,
        body: `${failReason} Please retry payment or switch to Cash on Delivery.`,
        category: 'payment',
        orderId: ord.id,
        read: false,
        createdAt: now,
      });

      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: 'razorpay_webhook',
        actorRole: 'admin',
        action: 'RAZORPAY_WEBHOOK_PAYMENT_FAILED',
        targetType: 'order',
        targetId: ord.id,
        details: `Payment failed for ${ord.orderNumber}: ${failCode} - ${failReason}`,
        createdAt: now,
      });

      syncedOrder = ord;
      syncedTx = tx;

      return {
        httpStatus: 200,
        body: {
          received: true,
          handled: true,
          event: eventName,
          eventId,
          orderId: ord.id,
          paymentId: rzpPaymentId,
        },
      };
    }

    // Other valid signed events (e.g., payment.authorized, refund.processed) acknowledged & deduplicated
    const rec: ProcessedWebhookEventRecord = {
      eventId,
      event: eventName,
      paymentId: paymentEntity?.id,
      processedAt: now,
    };
    db.processedWebhookEvents[eventId] = rec;
    webhookRecord = rec;

    return {
      httpStatus: 200,
      body: {
        received: true,
        handled: false,
        event: eventName,
        eventId,
      },
    };
  });

  if (input.syncFirestore !== false && webhookRecord && txResult.httpStatus === 200) {
    const synced = await syncWebhookOutcomeToFirestore({
      order: syncedOrder,
      transaction: syncedTx,
      webhookEvent: webhookRecord,
    });
    txResult.body.firestoreSynced = synced;
  }

  return txResult;
}
