import { useEffect, useMemo, useState } from 'react';
import { LifeBuoy, LogOut, RefreshCw, Search, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SupportTicket } from '../../shared/types.ts';

type TicketStatus = SupportTicket['status'];

export function SupportPortal() {
  const { user, logout, setActivePortal, notify } = useApp();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [replyText, setReplyText] = useState('');
  const [nextStatus, setNextStatus] = useState<TicketStatus | ''>('');
  const [saving, setSaving] = useState(false);

  const loadTickets = async () => {
    try {
      const result = await apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets');
      setTickets(result.tickets);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load support tickets.', 'error');
    }
  };

  useEffect(() => {
    void loadTickets();
  }, [user?.id]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (tickets || []).filter((ticket) => {
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const haystack = `${ticket.userName} ${ticket.subject} ${ticket.description} ${ticket.orderNumber || ''} ${ticket.category}`.toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [tickets, search, statusFilter]);

  useEffect(() => {
    if (filteredTickets.length && !filteredTickets.some((ticket) => ticket.id === selectedId)) {
      setSelectedId(filteredTickets[0].id);
    } else if (!filteredTickets.length && selectedId) {
      setSelectedId('');
    }
  }, [filteredTickets, selectedId]);

  const selectedTicket = (tickets || []).find((ticket) => ticket.id === selectedId) || null;

  const saveStatus = async () => {
    if (!selectedTicket || !nextStatus || nextStatus === selectedTicket.status) return;
    setSaving(true);
    try {
      await apiRequest(`/api/support/tickets/${selectedTicket.id}/status`, {
        method: 'PATCH',
        json: { status: nextStatus },
      });
      setNextStatus('');
      await loadTickets();
      notify('Ticket status updated.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update ticket status.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setSaving(true);
    try {
      await apiRequest(`/api/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        json: { text: replyText.trim() },
      });
      setReplyText('');
      await loadTickets();
      notify('Reply sent to the customer.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to send reply.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!tickets) {
    return <div className="p-8 text-center text-sm text-neutral-500">Loading support queue…</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E60023] text-white flex items-center justify-center">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-sm text-[#252525]">FYOORA Support Desk</h1>
              <p className="text-[11px] text-neutral-500">{user?.fullName || 'Support team'} · {tickets.length} tickets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadTickets()} className="px-3 py-2 rounded-xl border border-neutral-300 text-xs font-bold inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button type="button" onClick={() => setActivePortal('customer')} className="px-3 py-2 rounded-xl border border-neutral-300 text-xs font-bold">
              Customer View
            </button>
            <button type="button" onClick={logout} className="px-3 py-2 rounded-xl bg-[#252525] text-white text-xs font-bold inline-flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)] gap-5">
        <section className="bg-white rounded-3xl border border-neutral-200 p-4 sm:p-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" aria-label="Search support tickets" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-neutral-300 text-sm" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | TicketStatus)} aria-label="Filter tickets by status" className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 bg-white text-sm">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
            {filteredTickets.map((ticket) => (
              <button key={ticket.id} type="button" onClick={() => { setSelectedId(ticket.id); setNextStatus(''); }} className={`w-full text-left p-3.5 rounded-2xl border ${selectedId === ticket.id ? 'border-[#E60023] bg-[#E60023]/5' : 'border-neutral-200 hover:border-neutral-300'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm text-[#252525] line-clamp-1">{ticket.subject}</span>
                  <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-[9px] uppercase font-extrabold whitespace-nowrap">{ticket.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-xs text-neutral-600 mt-1">{ticket.userName}{ticket.orderNumber ? ` · ${ticket.orderNumber}` : ''}</div>
                <div className="text-[11px] text-neutral-500 mt-1">{ticket.category.replace(/_/g, ' ')} · {new Date(ticket.createdAt).toLocaleDateString()}</div>
              </button>
            ))}
            {filteredTickets.length === 0 && <p className="py-8 text-center text-xs text-neutral-500">No tickets match this filter.</p>}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-neutral-200 p-4 sm:p-6 min-h-[60vh] flex flex-col">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">Choose a ticket to review.</div>
          ) : (
            <>
              <div className="pb-4 border-b border-neutral-200 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-lg text-[#252525]">{selectedTicket.subject}</h2>
                  <p className="text-xs text-neutral-500 mt-1">{selectedTicket.userName} · {selectedTicket.category.replace(/_/g, ' ')}{selectedTicket.orderNumber ? ` · ${selectedTicket.orderNumber}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={nextStatus || selectedTicket.status} onChange={(event) => setNextStatus(event.target.value as TicketStatus)} aria-label="Ticket status" className="px-2.5 py-2 rounded-xl border border-neutral-300 bg-white text-xs">
                    <option value="open">Open</option>
                    <option value="in_review">In review</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button type="button" disabled={saving || !nextStatus || nextStatus === selectedTicket.status} onClick={() => void saveStatus()} className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold disabled:opacity-40">Save</button>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-2xl bg-neutral-50 border border-neutral-100 text-sm text-neutral-700">{selectedTicket.description}</div>
              <div className="flex-1 min-h-48 max-h-[45vh] overflow-y-auto py-4 space-y-2">
                {selectedTicket.messages.map((message, index) => (
                  <div key={`${message.createdAt}-${index}`} className={`max-w-[90%] p-3 rounded-2xl text-xs ${['support_staff', 'admin', 'super_admin'].includes(message.senderRole) ? 'ml-auto bg-[#252525] text-white' : 'bg-[#F5F5F5] text-[#252525]'}`}>
                    <div className="font-bold mb-1">{message.senderName}</div>
                    <div className="whitespace-pre-wrap">{message.text}</div>
                    <div className="text-[10px] opacity-60 mt-1">{new Date(message.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={sendReply} className="pt-4 border-t border-neutral-200 flex gap-2">
                <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows={2} maxLength={2000} placeholder="Write a helpful reply…" aria-label="Support reply" className="flex-1 resize-y min-h-11 px-3 py-2.5 rounded-xl border border-neutral-300 text-sm" />
                <button type="submit" disabled={saving || !replyText.trim()} className="self-end px-4 py-3 rounded-xl bg-[#E60023] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
                  <Send className="w-3.5 h-3.5" /> Reply
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
