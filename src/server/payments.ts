import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import {
  validatePaymentVerification,
  validateWebhookSignature,
} from 'razorpay/dist/utils/razorpay-utils.js';

export interface RazorpayConfigStatus {
  configured: boolean;
  webhookConfigured: boolean;
  statusLabel: 'Configured' | 'PENDING CONFIGURATION';
  webhookStatusLabel: 'Configured' | 'PENDING CONFIGURATION';
  webhookPath: string;
  mode: 'live_or_test_keys' | 'sandbox_unconfigured';
  keyIdPreview?: string;
}

export function getRazorpayConfigStatus(): RazorpayConfigStatus {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const configured = Boolean(keyId && keySecret);
  const webhookConfigured = Boolean(webhookSecret);
  return {
    configured,
    webhookConfigured,
    statusLabel: configured ? 'Configured' : 'PENDING CONFIGURATION',
    webhookStatusLabel: webhookConfigured ? 'Configured' : 'PENDING CONFIGURATION',
    webhookPath: '/api/webhooks/razorpay',
    mode: configured ? 'live_or_test_keys' : 'sandbox_unconfigured',
    ...(configured && keyId ? { keyIdPreview: `${keyId.slice(0, 8)}...` } : {}),
  };
}

export async function createGatewayPaymentOrder(params: {
  amountInr: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{
  gatewayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  configured: boolean;
  keyId?: string;
}> {
  const amountPaise = Math.round(params.amountInr * 100);
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (keyId && keySecret) {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes,
    });
    return {
      gatewayOrderId: order.id,
      amountPaise,
      currency: 'INR',
      configured: true,
      keyId,
    };
  }

  // Unconfigured gateway: return explicit sandbox order reference (NOT marked paid until verified or COD)
  return {
    gatewayOrderId: `rzp_sandbox_${crypto.randomBytes(6).toString('hex')}`,
    amountPaise,
    currency: 'INR',
    configured: false,
  };
}

export function verifyRazorpayPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keySecret || !params.razorpayOrderId || !params.razorpayPaymentId || !params.razorpaySignature) {
    return false;
  }
  try {
    return validatePaymentVerification(
      {
        order_id: params.razorpayOrderId,
        payment_id: params.razorpayPaymentId,
      },
      params.razorpaySignature,
      keySecret
    );
  } catch {
    return false;
  }
}

export function isRazorpayPaymentCaptured(
  payment: { order_id?: string | null; status?: string; currency?: string; amount?: string | number },
  expected: { razorpayOrderId: string; amountInr: number }
): boolean {
  const amountPaise = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount);
  return (
    payment.order_id === expected.razorpayOrderId &&
    payment.status === 'captured' &&
    payment.currency === 'INR' &&
    Number.isSafeInteger(amountPaise) &&
    amountPaise === Math.round(expected.amountInr * 100)
  );
}

export async function verifyRazorpayPaymentCaptured(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountInr: number;
}): Promise<boolean> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret || !params.razorpayPaymentId) return false;

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const payment = await razorpay.payments.fetch(params.razorpayPaymentId);
    return isRazorpayPaymentCaptured(payment, params);
  } catch {
    return false;
  }
}

export async function requestRazorpayRefund(params: {
  paymentId: string;
  orderId: string;
}): Promise<{
  refundId: string;
  status: 'pending' | 'processed' | 'failed';
}> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment.');
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const receipt = `fy-${crypto.createHash('sha256').update(params.orderId).digest('hex').slice(0, 24)}`;
  const refund = await razorpay.payments.refund(params.paymentId, {
    receipt,
    notes: { fyoora_order_id: params.orderId },
  });

  return { refundId: refund.id, status: refund.status };
}

export async function fetchRazorpayRefundForOrder(params: {
  paymentId: string;
  orderId: string;
}): Promise<{
  refundId: string;
  status: 'pending' | 'processed' | 'failed';
  amount: number;
} | null> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment.');
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const receipt = `fy-${crypto.createHash('sha256').update(params.orderId).digest('hex').slice(0, 24)}`;
  const refunds = await razorpay.payments.fetchMultipleRefund(params.paymentId, { count: 100 });
  const refund = refunds.items.find((item) =>
    item.receipt === receipt || item.notes?.fyoora_order_id === params.orderId
  );
  return refund ? { refundId: refund.id, status: refund.status, amount: refund.amount || 0 } : null;
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secretOverride?: string
): { valid: boolean; reason?: 'missing_secret' | 'missing_signature' | 'invalid_signature' } {
  const webhookSecret = (secretOverride ?? process.env.RAZORPAY_WEBHOOK_SECRET)?.trim();
  if (!webhookSecret) {
    return { valid: false, reason: 'missing_secret' };
  }
  if (!signatureHeader || !rawBody) {
    return { valid: false, reason: 'missing_signature' };
  }
  try {
    const valid = validateWebhookSignature(rawBody, signatureHeader.trim(), webhookSecret);
    return valid ? { valid: true } : { valid: false, reason: 'invalid_signature' };
  } catch {
    return { valid: false, reason: 'invalid_signature' };
  }
}
