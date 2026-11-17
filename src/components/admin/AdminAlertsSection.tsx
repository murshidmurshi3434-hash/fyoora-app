import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, Ticket } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import type { FeatureSuggestion, SupportTicket } from '../../shared/types.ts';
import { formatShortDateTime, type AdminOverviewPayload, type AdminSectionKey } from './adminTypes.ts';

interface AdminAlertsSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  onNavigate: (section: AdminSectionKey) => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminAlertsSection({
  data,
  onRefresh,
  onNavigate,
  notify,
}: AdminAlertsSectionProps) {
  const [subTab, setSubTab] = useState<'alerts' | 'tickets' | 'ideas'>('alerts');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'info'>('all');
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});

  const visibleAlerts = data.alerts.filter((a) =>
    priorityFilter === 'all' ? true : a.priority === priorityFilter
  );

  return (
    <div className="space-y-5">
      {/* Sub-Tabs */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'alerts', label: `Operational Alerts (${data.alerts.filter((a) => !a.acknowledged).length} active)`, icon: AlertTriangle },
            { id: 'tickets', label: `Support Tickets (${data.supportTickets.length})`, icon: Ticket },
            { id: 'ideas', label: `Customer Ideas (${data.featureSuggestions.filter((s) => s.status === 'new').length} new)`, icon: Lightbulb },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id as typeof subTab)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                  subTab === t.id
                    ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {subTab === 'alerts' && data.alerts.some((a) => !a.acknowledged) && (
          <button
            type="button"
            onClick={async () => {
              await apiRequest('/api/admin/alerts/acknowledge-all', {
                method: 'POST',
                json: { alertIds: data.alerts.map((a) => a.id) },
              });
              await onRefresh();
              notify('All active alerts acknowledged', 'success');
            }}
            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-[#252525] dark:text-neutral-200 hover:border-[#E60023]"
          >
            Acknowledge All
          </button>
        )}
      </div>

      {/* 1. OPERATIONAL ALERTS */}
      {subTab === 'alerts' && (
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'critical', 'high', 'medium', 'info'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${
                  priorityFilter === p
                    ? 'bg-[#E60023] text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {visibleAlerts.length === 0 ? (
            <div className="py-10 text-center text-xs text-neutral-500">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              No alerts matching this priority filter.
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              {visibleAlerts.map((alt) => (
                <div
                  key={alt.id}
                  className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                    alt.acknowledged
                      ? 'border-neutral-200 dark:border-neutral-800 opacity-65'
                      : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded ${
                          alt.priority === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : alt.priority === 'high'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {alt.priority}
                      </span>
                      <span className="font-bold text-[#252525] dark:text-neutral-100">{alt.title}</span>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400">{alt.description}</p>
                    {alt.acknowledged && alt.acknowledgedBy && (
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                        Acknowledged by {alt.acknowledgedBy} · {formatShortDateTime(alt.acknowledgedAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(alt.targetSection as AdminSectionKey)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 font-semibold"
                    >
                      Open Section
                    </button>
                    {!alt.acknowledged && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/alerts/${alt.id}/acknowledge`, { method: 'POST', json: {} });
                          await onRefresh();
                          notify('Alert acknowledged', 'success');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#252525] dark:bg-white text-white dark:text-[#252525] font-semibold"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. SUPPORT TICKETS */}
      {subTab === 'tickets' && (
        <div className="space-y-3">
          {data.supportTickets.length === 0 ? (
            <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8 text-center text-xs text-neutral-500">
              No support tickets reported yet.
            </div>
          ) : (
            data.supportTickets.map((t: SupportTicket) => (
              <div
                key={t.id}
                className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-[#252525] dark:text-neutral-100">{t.subject}</div>
                    <div className="text-neutral-500">
                      {t.userName} {t.orderNumber ? `· ${t.orderNumber}` : ''} · {t.category.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <select
                    aria-label={`Status for ticket ${t.subject}`}
                    value={t.status}
                    onChange={async (e) => {
                      await apiRequest(`/api/support/tickets/${t.id}/status`, {
                        method: 'PATCH',
                        json: { status: e.target.value },
                      });
                      await onRefresh();
                      notify('Support ticket status updated', 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-semibold uppercase"
                  >
                    <option value="open">Open</option>
                    <option value="in_review">In Review</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 space-y-1">
                  {t.messages.map((m, idx) => (
                    <div key={idx}>
                      <span className="font-semibold text-[#252525] dark:text-neutral-200">{m.senderName}:</span>{' '}
                      <span className="text-neutral-600 dark:text-neutral-300">{m.text}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyMap[t.id] || ''}
                    onChange={(e) => setReplyMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="Reply to customer / mark resolved..."
                    className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const text = replyMap[t.id]?.trim();
                      if (!text) return;
                      await apiRequest(`/api/support/tickets/${t.id}/reply`, {
                        method: 'POST',
                        json: { text, status: 'resolved' },
                      });
                      setReplyMap((prev) => ({ ...prev, [t.id]: '' }));
                      await onRefresh();
                      notify('Support reply sent & ticket resolved', 'success');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#252525] dark:bg-white text-white dark:text-[#252525] font-semibold"
                  >
                    Send &amp; Resolve
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. CUSTOMER FEATURE SUGGESTIONS */}
      {subTab === 'ideas' && (
        <div className="space-y-3">
          {data.featureSuggestions.length === 0 ? (
            <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8 text-center text-xs text-neutral-500">
              No customer suggestions yet.
            </div>
          ) : (
            data.featureSuggestions.map((suggestion: FeatureSuggestion) => (
              <div
                key={suggestion.id}
                className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#252525] dark:text-neutral-100">{suggestion.title}</h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {suggestion.userName} · {suggestion.area.replace(/_/g, ' ')} · {formatShortDateTime(suggestion.createdAt)}
                    </p>
                  </div>
                  <select
                    aria-label={`Status for ${suggestion.title}`}
                    value={suggestion.status}
                    onChange={async (event) => {
                      await apiRequest(`/api/admin/suggestions/${suggestion.id}/status`, {
                        method: 'PATCH',
                        json: { status: event.target.value },
                      });
                      await onRefresh();
                      notify('Suggestion status updated and customer notified.', 'success');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-semibold"
                  >
                    <option value="new">New</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
                <p className="text-neutral-700 dark:text-neutral-300">{suggestion.details}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
