import { useState } from 'react';
import { Lock, Plus, Search, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { buildCsvContent } from '../../shared/adminAnalytics.ts';
import type { AdminSectionKey, UserRole } from '../../shared/types.ts';
import {
  ADMIN_NAV_ITEMS,
  formatShortDateTime,
  type AdminOverviewPayload,
} from './adminTypes.ts';

interface AdminSecuritySectionProps {
  data: AdminOverviewPayload;
  currentUserRole: UserRole;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminSecuritySection({
  data,
  currentUserRole,
  onRefresh,
  notify,
}: AdminSecuritySectionProps) {
  const [logSearch, setLogSearch] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'admin' | 'support_staff' | 'super_admin'>('admin');
  const [staffPerms, setStaffPerms] = useState<AdminSectionKey[]>(['overview', 'live_ops', 'customers', 'alerts']);

  const isSuperAdmin = currentUserRole === 'super_admin';

  const filteredLogs = data.auditLogs.filter((l) => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return true;
    return `${l.action} ${l.actorRole} ${l.actorId} ${l.targetType} ${l.details}`.toLowerCase().includes(q);
  });

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffEmail.trim()) return;
    try {
      await apiRequest('/api/admin/staff', {
        method: 'POST',
        json: {
          fullName: staffName.trim(),
          email: staffEmail.trim(),
          role: staffRole,
          permissions: staffPerms,
        },
      });
      setStaffName('');
      setStaffEmail('');
      await onRefresh();
      notify('Admin staff role and permissions saved', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save staff permissions', 'error');
    }
  };

  const handleExportAuditCsv = () => {
    const csv = buildCsvContent(
      ['ID', 'Timestamp', 'Actor', 'Role', 'Action', 'TargetType', 'TargetId', 'Details'],
      filteredLogs.map((l) => [l.id, l.createdAt, l.actorId, l.actorRole, l.action, l.targetType, l.targetId, l.details])
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fyoora-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Admin & Staff Permissions Matrix */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#E60023]" />
              Role-Based Access Control (RBAC) &amp; Staff Matrix
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Granular section permissions for Super Admin, Operations Admin, and Support Staff.
            </p>
          </div>
          {!isSuperAdmin && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[11px] font-semibold">
              <Lock className="w-3 h-3" /> Super Admin Only Edit
            </span>
          )}
        </div>

        {isSuperAdmin && (
          <form onSubmit={handleAddStaff} className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3 text-xs">
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Staff full name"
                className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
              <input
                type="email"
                required
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="Verified Google email"
                className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as typeof staffRole)}
                className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold"
              >
                <option value="admin">Operations Admin</option>
                <option value="support_staff">Support Staff</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {ADMIN_NAV_ITEMS.map((nav) => {
                const checked = staffPerms.includes(nav.key);
                return (
                  <label
                    key={nav.key}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-[11px] font-medium ${
                      checked
                        ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023]'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setStaffPerms((prev) =>
                          prev.includes(nav.key) ? prev.filter((k) => k !== nav.key) : [...prev, nav.key]
                        )
                      }
                      className="accent-[#E60023]"
                    />
                    {nav.shortLabel}
                  </label>
                );
              })}
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#252525] dark:bg-white text-white dark:text-[#252525] font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Grant / Update Staff Access
            </button>
          </form>
        )}

        <div className="space-y-2.5 text-xs">
          {data.adminStaff.map((member) => (
            <div
              key={member.id}
              className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="font-semibold text-[#252525] dark:text-neutral-100">
                  {member.fullName}{' '}
                  <span className="font-mono text-[11px] text-neutral-500">({member.email})</span>
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  Role: <strong className="uppercase">{member.role.replace('_', ' ')}</strong> · Access:{' '}
                  {member.permissions.length} sections ({member.permissions.slice(0, 5).join(', ')}
                  {member.permissions.length > 5 ? '…' : ''})
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    member.status === 'active'
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                  }`}
                >
                  {member.status}
                </span>
                {isSuperAdmin && member.email.toLowerCase() !== 'mtechmini@gmail.com' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/admin/staff/${member.id}`, {
                        method: 'PATCH',
                        json: { status: member.status === 'active' ? 'suspended' : 'active' },
                      });
                      await onRefresh();
                    }}
                    className="px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 font-semibold"
                  >
                    {member.status === 'active' ? 'Suspend' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Logs Explorer */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Security, PII Access &amp; Operations Audit Trail ({filteredLogs.length})
            </h3>
            <p className="text-[11px] text-neutral-500">
              Immutable ledger of financial actions, PII inspections, staff changes, and system configurations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filter audit events..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={handleExportAuditCsv}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-[460px] overflow-y-auto">
          {filteredLogs.slice(0, 60).map((log) => (
            <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono font-bold text-[#E60023] mr-2">{log.action}</span>
                <span className="text-[#252525] dark:text-neutral-200">{log.details}</span>
              </div>
              <div className="text-[11px] font-mono text-neutral-500 shrink-0 tabular-nums">
                {log.actorRole} · {formatShortDateTime(log.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
