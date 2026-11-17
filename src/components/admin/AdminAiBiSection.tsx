import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import type { GlobalDateState } from './adminTypes.ts';
import { formatShortDateTime } from './adminTypes.ts';

interface AdminAiBiSectionProps {
  dateState: GlobalDateState;
  geminiConfigured?: boolean;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type BiMode = 'qa' | 'executive_summary' | 'anomaly_scan' | 'demand_forecast' | 'vendor_insights' | 'recommendations';

interface BiExchange {
  id: string;
  question: string;
  mode: BiMode;
  answer: string;
  model: string;
  generatedAt: string;
}

const PRESET_PROMPTS: Array<{ mode: BiMode; label: string; question: string }> = [
  {
    mode: 'executive_summary',
    label: 'Executive Summary',
    question: 'Summarize FYOORA financial, order, vendor, and rider performance for the selected date window.',
  },
  {
    mode: 'anomaly_scan',
    label: 'Anomaly Detection',
    question: 'Detect revenue drops, unfulfilled order bottlenecks, low inventory risks, or rider shortages.',
  },
  {
    mode: 'demand_forecast',
    label: 'Demand Forecast',
    question: 'Assess demand patterns across services and state honestly whether enough history exists for forecasting.',
  },
  {
    mode: 'vendor_insights',
    label: 'Vendor Insights',
    question: 'Evaluate vendor GMV share, store availability, rating alerts, and commission efficiency.',
  },
  {
    mode: 'recommendations',
    label: 'Growth Recommendations',
    question: 'Recommend concrete operational improvements grounded strictly in current marketplace numbers.',
  },
];

export function AdminAiBiSection({ dateState, geminiConfigured, notify }: AdminAiBiSectionProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [exchanges, setExchanges] = useState<BiExchange[]>([]);

  const runAnalysis = async (q: string, mode: BiMode) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest<{
        answer: string;
        mode: BiMode;
        model: string;
        generatedAt: string;
      }>('/api/admin/ai-bi', {
        method: 'POST',
        json: {
          question: q.trim(),
          mode,
          preset: dateState.preset,
          startDate: dateState.startDate,
          endDate: dateState.endDate,
        },
      });
      setExchanges((prev) => [
        {
          id: `bi-${Date.now()}`,
          question: q.trim(),
          mode: res.mode,
          answer: res.answer,
          model: res.model,
          generatedAt: res.generatedAt,
        },
        ...prev,
      ]);
      if (mode === 'qa') setQuestion('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to run AI BI analysis', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E60023]" />
              FYOORA Enterprise AI Business Intelligence
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Server-side Gemini analysis grounded strictly in your real marketplace snapshot ({dateState.preset}). Separates observed historical facts from forecasts.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
              geminiConfigured
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300'
            }`}
          >
            {geminiConfigured ? 'Gemini Ready' : 'Requires GEMINI_API_KEY'}
          </span>
        </div>

        {/* One-Click Analysis Modes */}
        <div className="flex flex-wrap gap-2">
          {PRESET_PROMPTS.map((p) => (
            <button
              key={p.mode}
              type="button"
              disabled={loading || !geminiConfigured}
              onClick={() => void runAnalysis(p.question, p.mode)}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold text-[#252525] dark:text-neutral-200 hover:border-[#E60023] disabled:opacity-45"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Natural-Language Q&A Prompt */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAnalysis(question, 'qa');
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a BI question (e.g., Which Vadakara category drives the highest net margin?)"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
          />
          <button
            type="submit"
            disabled={loading || !geminiConfigured || !question.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </form>
      </div>

      {/* Results History */}
      {exchanges.length === 0 ? (
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center space-y-2">
          <Sparkles className="w-6 h-6 text-[#E60023] mx-auto" />
          <div className="text-xs font-semibold text-[#252525] dark:text-neutral-200">
            Select an analysis mode or ask a question above
          </div>
          <p className="text-[11px] text-neutral-500 max-w-md mx-auto">
            All numbers cited by AI BI are verified against your live Firestore/store ledger snapshot for the active date range.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {exchanges.map((ex) => (
            <div
              key={ex.id}
              className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100 dark:border-neutral-800">
                <div className="text-xs font-bold text-[#252525] dark:text-neutral-100">{ex.question}</div>
                <span className="font-mono text-[10px] text-neutral-400">
                  {ex.model} · {formatShortDateTime(ex.generatedAt)}
                </span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">
                {ex.answer}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
