import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai';
import { isPointInServiceArea } from '../shared/domain.ts';
import type { LanguageCode, Product, ServiceType, UserProfile, Vendor } from '../shared/types.ts';
import { getDb } from './store.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const searchLiveCatalogTool: FunctionDeclaration = {
  name: 'search_live_catalog',
  description:
    'Search live products and menu items currently available in the FYOORA database with real prices, stock quantities, and store opening status.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Search keywords (e.g. chocolate cake, biriyani, roses, milk, rice)' },
      serviceCategory: {
        type: Type.STRING,
        description: 'Optional filter: food, bakery, grocery, celebration, flowers_gifts',
      },
      maxPriceInr: { type: Type.NUMBER, description: 'Optional maximum price budget in INR' },
    },
    required: ['query'],
  },
};

const listVendorsTool: FunctionDeclaration = {
  name: 'list_vendors',
  description: 'List approved local restaurants, bakeries, grocery stores, florists, and shops in Vadakara with live open/closed status and prep times.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      serviceCategory: {
        type: Type.STRING,
        description: 'Optional category: food, bakery, grocery, celebration, flowers_gifts',
      },
    },
  },
};

const getCelebrationBundleSuggestionsTool: FunctionDeclaration = {
  name: 'get_celebration_bundle_suggestions',
  description:
    'Find real complementary cross-sell items across Bakery, Flowers & Gifts, and Birthday & Celebration categories for birthdays, anniversaries, or surprises.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      occasion: { type: Type.STRING, description: 'Occasion like birthday, anniversary, party, gift' },
      budgetInr: { type: Type.NUMBER, description: 'Optional overall budget in INR' },
    },
    required: ['occasion'],
  },
};

const getMyRecentOrdersTool: FunctionDeclaration = {
  name: 'get_my_recent_orders',
  description: 'Retrieve ONLY the currently logged-in customer’s own recent orders and live statuses.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      limit: { type: Type.NUMBER, description: 'Number of recent orders to return (default 5)' },
    },
  },
};

const checkDeliveryAvailabilityTool: FunctionDeclaration = {
  name: 'check_delivery_availability',
  description: 'Check whether coordinates fall inside the active Vadakara service area and return current delivery fees and radius.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      lat: { type: Type.NUMBER },
      lng: { type: Type.NUMBER },
    },
    required: ['lat', 'lng'],
  },
};

export interface AiChatResult {
  reply: string;
  language: LanguageCode;
  referencedProducts: Array<Product & { vendorName: string; vendorIsOpen: boolean }>;
  referencedVendors: Vendor[];
  usedLiveTools: string[];
}

function executeTool(
  name: string,
  args: Record<string, unknown>,
  user: UserProfile | undefined,
  collectedProducts: Map<string, Product & { vendorName: string; vendorIsOpen: boolean }>,
  collectedVendors: Map<string, Vendor>
): unknown {
  const db = getDb();

  if (name === 'search_live_catalog') {
    const q = String(args.query || '').toLowerCase().trim();
    const cat = args.serviceCategory ? String(args.serviceCategory) : undefined;
    const maxPrice = typeof args.maxPriceInr === 'number' ? args.maxPriceInr : undefined;
    const tokens = q.split(/\s+/).filter(Boolean);

    const matches = db.products
      .filter((p) => {
        if (cat && p.serviceCategory !== cat) return false;
        if (maxPrice !== undefined && p.price > maxPrice) return false;
        if (!tokens.length) return true;
        const hay = `${p.name} ${p.nameMl || ''} ${p.category} ${p.description} ${(p.tags || []).join(' ')}`.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      })
      .slice(0, 8)
      .map((p) => {
        const vendor = db.vendors.find((v) => v.id === p.vendorId);
        const enriched = {
          ...p,
          vendorName: vendor?.name || 'Local Partner',
          vendorIsOpen: Boolean(vendor?.isOpen && vendor?.approved),
        };
        collectedProducts.set(p.id, enriched);
        return {
          id: p.id,
          name: p.name,
          nameMl: p.nameMl,
          priceInr: p.price,
          unit: p.unit,
          serviceCategory: p.serviceCategory,
          category: p.category,
          inStock: p.inStock && !p.soldOutManual && p.stockQty > 0,
          stockQty: p.stockQty,
          vendorId: p.vendorId,
          vendorName: enriched.vendorName,
          vendorIsOpen: enriched.vendorIsOpen,
        };
      });

    return { count: matches.length, products: matches };
  }

  if (name === 'list_vendors') {
    const cat = args.serviceCategory ? String(args.serviceCategory) : undefined;
    const list = db.vendors
      .filter((v) => v.approved && !v.suspended && (!cat || v.serviceCategory === cat))
      .map((v) => {
        collectedVendors.set(v.id, v);
        return {
          id: v.id,
          name: v.name,
          serviceCategory: v.serviceCategory,
          areaName: v.areaName,
          isOpen: v.isOpen,
          openingHours: v.openingHours,
          avgPrepTimeMins: v.avgPrepTimeMins,
          rating: v.rating,
          supportsPreBooking: v.supportsPreBooking,
        };
      });
    return { count: list.length, vendors: list };
  }

  if (name === 'get_celebration_bundle_suggestions') {
    const budget = typeof args.budgetInr === 'number' ? args.budgetInr : undefined;
    const targetCats: ServiceType[] = ['bakery', 'flowers_gifts', 'celebration'];
    const picks = db.products
      .filter((p) => targetCats.includes(p.serviceCategory) && p.inStock && !p.soldOutManual && p.stockQty > 0)
      .filter((p) => (budget ? p.price <= budget : true))
      .slice(0, 6)
      .map((p) => {
        const vendor = db.vendors.find((v) => v.id === p.vendorId);
        const enriched = {
          ...p,
          vendorName: vendor?.name || 'Local Partner',
          vendorIsOpen: Boolean(vendor?.isOpen && vendor?.approved),
        };
        collectedProducts.set(p.id, enriched);
        return {
          id: p.id,
          name: p.name,
          priceInr: p.price,
          serviceCategory: p.serviceCategory,
          vendorName: enriched.vendorName,
          vendorIsOpen: enriched.vendorIsOpen,
        };
      });
    return { occasion: args.occasion, suggestions: picks };
  }

  if (name === 'get_my_recent_orders') {
    if (!user) {
      return { authenticated: false, message: 'User is not signed in; cannot access personal orders.' };
    }
    const limit = typeof args.limit === 'number' ? Math.min(10, args.limit) : 5;
    const userOrders = db.orders
      .filter((o) => o.customerId === user.id)
      .slice(-limit)
      .reverse()
      .map((o) => ({
        orderNumber: o.orderNumber,
        serviceType: o.serviceType,
        vendorName: o.vendorName || 'Pickup & Drop',
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotalInr: o.pricing.grandTotal,
        createdAt: o.createdAt,
      }));
    return { authenticated: true, orders: userOrders };
  }

  if (name === 'check_delivery_availability') {
  const area = db.serviceAreas.find((item) => item.isActive);

  if (!area) {
    return { error: 'No active service area is currently available.' };
  }

  const lat = Number(args.lat) || area.center.lat;
    const lng = Number(args.lng) || area.center.lng;
    const check = isPointInServiceArea({ lat, lng }, area);
    return {
      serviceAreaName: area.name,
      insideServiceArea: check.inside,
      distanceFromCenterKm: check.distanceFromCenterKm,
      activeRadiusKm: area.radiusKm,
      baseDeliveryFeeInr: area.deliveryPricing.baseFeeInr,
      operatingHours: area.operatingHours,
    };
  }

  return { error: `Unknown tool: ${name}` };
}

export async function runFyooraAiChat(params: {
  message: string;
  language: LanguageCode;
  user?: UserProfile;
}): Promise<AiChatResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }

  const systemInstruction = `You are FYOORA AI, the helpful bilingual (Malayalam and English) assistant for FYOORA ("Everything. One place."), a local super-app in Vadakara, Kozhikode, Kerala.
CRITICAL GROUNDING RULES:
1. You MUST call the provided live database tools (search_live_catalog, list_vendors, get_celebration_bundle_suggestions, get_my_recent_orders, check_delivery_availability) before stating any product price, stock availability, vendor opening status, or order status.
2. NEVER invent prices, product availability, restaurant opening status, or delivery times. If an item is out of stock (inStock: false), clearly inform the customer.
3. NEVER claim an order is placed or payment succeeded; guide the user to add the suggested items to their cart and complete checkout.
4. For celebrations, birthdays, or anniversaries, thoughtfully cross-sell relevant live items (e.g., cake + bouquet + balloons + gift hamper) without being pushy.
5. Respond in ${params.language === 'ml' ? 'Malayalam (മലയാളം) with clear English product names/prices where helpful' : 'clear, friendly English (and include Malayalam greetings/terms naturally when relevant)'}.
6. Keep responses concise, structured, and actionable with real ₹ INR prices.`;

  const tools = [
    {
      functionDeclarations: [
        searchLiveCatalogTool,
        listVendorsTool,
        getCelebrationBundleSuggestionsTool,
        getMyRecentOrdersTool,
        checkDeliveryAvailabilityTool,
      ],
    },
  ];

  const collectedProducts = new Map<string, Product & { vendorName: string; vendorIsOpen: boolean }>();
  const collectedVendors = new Map<string, Vendor>();
  const usedLiveTools: string[] = [];

  const contents: Content[] = [{ role: 'user', parts: [{ text: params.message }] }];

  for (let round = 0; round < 4; round++) {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        tools,
      },
    });

    const candidateContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0 && candidateContent) {
      contents.push(candidateContent);
      const responseParts = functionCalls.map((fc) => {
        usedLiveTools.push(fc.name || 'unknown');
        const toolResult = executeTool(
          fc.name || '',
          (fc.args as Record<string, unknown>) || {},
          params.user,
          collectedProducts,
          collectedVendors
        );
        return {
          functionResponse: {
            id: fc.id,
            name: fc.name || '',
            response: { result: toolResult },
          },
        };
      });
      contents.push({ role: 'user', parts: responseParts });
      continue;
    }

    return {
      reply: response.text || 'I could not formulate a response right now. Please try again.',
      language: params.language,
      referencedProducts: Array.from(collectedProducts.values()),
      referencedVendors: Array.from(collectedVendors.values()),
      usedLiveTools,
    };
  }

  return {
    reply: 'Here are the live Vadakara listings I found for you.',
    language: params.language,
    referencedProducts: Array.from(collectedProducts.values()),
    referencedVendors: Array.from(collectedVendors.values()),
    usedLiveTools,
  };
}

export interface AdminBiRequest {
  question: string;
  mode: 'qa' | 'executive_summary' | 'anomaly_scan' | 'demand_forecast' | 'vendor_insights' | 'recommendations';
  metricsContext: Record<string, unknown>;
}

export interface AdminBiResponse {
  answer: string;
  mode: AdminBiRequest['mode'];
  model: string;
  generatedAt: string;
}

export async function runAdminBiAnalysis(req: AdminBiRequest): Promise<AdminBiResponse> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }

  const systemInstruction = `You are FYOORA Enterprise Business Intelligence AI for Super Admin operations in Vadakara, Kerala.
STRICT FACTUAL & ANALYTICAL RULES:
1. Ground EVERY number, order count, ₹ INR currency amount, vendor name, rider name, and percentage ONLY in the provided JSON platform_snapshot.
2. NEVER fabricate statistics, synthetic orders, growth rates, or vendor numbers that do not appear in platform_snapshot.
3. Explicitly separate sections using clean plain headings:
   - OBSERVED HISTORICAL FACTS (cite exact ₹/counts from platform_snapshot)
   - ANOMALIES & RISKS (real bottlenecks, low stock, offline vendors, pending refunds/settlements, or "No anomalies detected in current window")
   - FORECAST & RECOMMENDATIONS (mark clearly as forward-looking projections/recommendations; if fewer than 5 historical orders or insufficient multi-day history exists, state "Not enough historical data for statistical forecasting yet" and give concrete operational next steps).
4. Keep currency in ₹ INR and respond in crisp executive prose with bullet points.`;

  const prompt = `Mode: ${req.mode}
Admin Question: ${req.question}

platform_snapshot (authorized aggregated & live data):
${JSON.stringify(req.metricsContext)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
    },
  });

  return {
    answer: response.text || 'Unable to generate executive analysis right now.',
    mode: req.mode,
    model: 'gemini-4-hydrogen',
    generatedAt: new Date().toISOString(),
  };
}
