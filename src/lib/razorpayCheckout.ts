import { apiRequest } from './api.ts';
import type { Order, UserProfile } from '../shared/types.ts';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (resp: unknown) => void) => void;
    };
  }
}

let scriptPromise: Promise<boolean> | null = null;

function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(params: {
  order: Order;
  keyId: string;
  user: UserProfile;
}): Promise<{ verified: boolean; order?: Order; message?: string }> {
  const loaded = await loadRazorpayCheckoutScript();
  if (!loaded || !window.Razorpay) {
    return {
      verified: false,
      message: 'Could not load Razorpay Checkout script. You can retry payment from Orders.',
    };
  }

  if (!params.order.razorpayOrderId) {
    return { verified: false, message: 'Missing Razorpay order reference.' };
  }

  return new Promise((resolve) => {
    const RazorpayCtor = window.Razorpay!;
    const rzp = new RazorpayCtor({
      key: params.keyId,
      amount: Math.round(params.order.pricing.grandTotal * 100),
      currency: 'INR',
      name: 'FYOORA Vadakara',
      description: `Order ${params.order.orderNumber}`,
      order_id: params.order.razorpayOrderId,
      prefill: {
        name: params.user.fullName || 'FYOORA Customer',
        contact: params.user.contactPhone || params.user.phone,
        email: params.user.email || '',
      },
      theme: { color: '#E60023' },
      modal: {
        ondismiss: () =>
          resolve({
            verified: false,
            message: 'Payment window closed. You can complete payment anytime from Orders.',
          }),
      },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const verifiedRes = await apiRequest<{ verified: boolean; order: Order }>(
            '/api/payments/razorpay/verify',
            {
              method: 'POST',
              json: {
                orderId: params.order.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            }
          );
          resolve({ verified: verifiedRes.verified, order: verifiedRes.order });
        } catch (err) {
          resolve({
            verified: false,
            message: err instanceof Error ? err.message : 'Payment signature verification failed.',
          });
        }
      },
    });

    rzp.on('payment.failed', () => {
      resolve({
        verified: false,
        message: 'Razorpay payment failed. Please retry from Orders.',
      });
    });

    rzp.open();
  });
}
