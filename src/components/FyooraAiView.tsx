import { useState } from 'react';
import { Languages, Send, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type { Product } from '../shared/types.ts';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  products?: Product[];
}

const QUICK_PROMPTS_EN = [
  'Suggest Malabar biriyani & cold drink under ₹300 in Vadakara',
  'Plan a birthday surprise under ₹1,500 (cake + decoration bundle)',
  'What fresh groceries are in stock at Vadakara Fresh Mart?',
  'Check my latest order status',
];

const QUICK_PROMPTS_ML = [
  'വടകരയിൽ ₹300-ൽ താഴെയുള്ള നല്ല ബിരിയാണി നിർദ്ദേശിക്കൂ',
  'ഒരു ബർത്ത്ഡേ പാർട്ടിക്ക് കേക്കും ഡെക്കറേഷൻ കിറ്റും തരൂ',
  'വടകര ഫ്രഷ് മാർട്ടിൽ ഇപ്പോൾ സ്റ്റോക്കുള്ള പച്ചക്കറികൾ ഏതൊക്കെയാണ്?',
];

export function FyooraAiView() {
  const { language, setLanguage, bootstrap, addToCart } = useApp();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        language === 'ml'
          ? 'നമസ്കാരം! ഞാൻ FYOORA AI അസിസ്റ്റന്റ്. വടകരയിലെ ഭക്ഷണം, പലചരക്ക്, കേക്കുകൾ, സമ്മാനങ്ങൾ എന്നിവയെക്കുറിച്ച് ചോദിക്കൂ — ലൈവ് സ്റ്റോക്കും വിലയും നോക്കി സഹായിക്കാം.'
          : 'Hello! I am FYOORA AI, connected live to Vadakara stores, inventory, coupons, and your orders. Ask me in English or Malayalam for meal ideas, grocery baskets, birthday bundles, or order help.',
    },
  ]);

  const vendors = bootstrap?.vendors || [];

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatTurn = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiRequest<{
        reply: string;
        recommendedProducts: Product[];
      }>('/api/ai/chat', {
        method: 'POST',
        json: { message: trimmed, language },
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.reply,
          products: res.recommendedProducts,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text:
            err instanceof Error
              ? err.message
              : 'FYOORA AI is temporarily unavailable. Check server Gemini configuration.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const prompts = language === 'ml' ? QUICK_PROMPTS_ML : QUICK_PROMPTS_EN;

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-neutral-200 overflow-hidden flex flex-col h-[calc(100vh-13rem)] min-h-[500px]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-[#252525] text-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#E60023] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-display font-bold text-base">FYOORA AI Concierge</h2>
            <p className="text-[11px] text-neutral-300">
              Live Vadakara inventory-grounded · English &amp; മലയാളം
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLanguage(language === 'en' ? 'ml' : 'en')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors"
        >
          <Languages className="w-3.5 h-3.5 text-[#E60023]" />
          <span>{language === 'en' ? 'English' : 'മലയാളം'}</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#F5F5F5]">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#E60023] text-white rounded-br-xs'
                  : 'bg-white border border-neutral-200 text-[#252525] rounded-bl-xs'
              }`}
            >
              {m.text}
            </div>

            {m.products && m.products.length > 0 && (
              <div className="mt-2.5 grid sm:grid-cols-2 gap-2.5 w-full max-w-xl">
                {m.products.map((p) => {
                  const vendor = vendors.find((v) => v.id === p.vendorId);
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-2xl border border-neutral-200 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-[#252525] truncate">{p.name}</div>
                          <div className="text-[11px] text-neutral-500 truncate">
                            {vendor?.name} · <span className="font-mono font-bold text-[#252525]">₹{p.price}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!p.inStock}
                        onClick={() =>
                          addToCart({
                            cartItemId: `${p.id}-${Date.now()}`,
                            productId: p.id,
                            vendorId: p.vendorId,
                            vendorName: vendor?.name || 'FYOORA Store',
                            serviceCategory: p.serviceCategory,
                            name: p.name,
                            imageUrl: p.imageUrl,
                            unitPrice: p.price,
                            quantity: 1,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-[#E60023] text-white text-xs font-bold shrink-0 disabled:bg-neutral-300"
                      >
                        {p.inStock ? 'Add' : 'Out'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-xs text-neutral-500 italic">Checking live Vadakara catalog &amp; stock...</div>
        )}
      </div>

      {/* Quick Prompts + Input */}
      <div className="p-3 sm:p-4 border-t border-neutral-200 bg-white space-y-2.5">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {prompts.map((pr) => (
            <button
              key={pr}
              type="button"
              onClick={() => sendMessage(pr)}
              className="px-3 py-1.5 rounded-xl bg-[#F5F5F5] hover:bg-neutral-200 text-[11px] font-semibold text-[#252525] whitespace-nowrap transition-colors"
            >
              {pr}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              language === 'ml'
                ? 'മലയാളത്തിലോ ഇംഗ്ലീഷിലോ ചോദിക്കൂ...'
                : 'Ask for biriyani, groceries, birthday surprise, or order help...'
            }
            className="flex-1 px-4 py-3 rounded-2xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E60023]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-2xl bg-[#E60023] hover:bg-[#B8001C] text-white font-bold flex items-center justify-center disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
