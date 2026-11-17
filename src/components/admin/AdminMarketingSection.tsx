import { useState } from 'react';
import { Bell, Megaphone, Plus, Tag } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { formatInr, formatShortDateTime, type AdminOverviewPayload } from './adminTypes.ts';

interface AdminMarketingSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminMarketingSection({ data, onRefresh, notify }: AdminMarketingSectionProps) {
  // Coupon form
  const [cpCode, setCpCode] = useState('');
  const [cpTitle, setCpTitle] = useState('');
  const [cpType, setCpType] = useState<'flat' | 'percent'>('flat');
  const [cpValue, setCpValue] = useState('40');
  const [cpMinOrder, setCpMinOrder] = useState('199');
  const [cpFirstOrder, setCpFirstOrder] = useState(false);

  // Campaign / Push notification form
  const [cmpTitle, setCmpTitle] = useState('');
  const [cmpType, setCmpType] = useState<'seasonal' | 'featured_vendor' | 'push_notification' | 'sponsored'>('seasonal');
  const [cmpDesc, setCmpDesc] = useState('');

  // Referral settings
  const [refEnabled, setRefEnabled] = useState(data.referralSettings.enabled);
  const [refReferrerPts, setRefReferrerPts] = useState(String(data.referralSettings.referrerRewardPoints));
  const [refWelcomePts, setRefWelcomePts] = useState(String(data.referralSettings.refereeWelcomePoints));
  const [refMinOrder, setRefMinOrder] = useState(String(data.referralSettings.minOrderForRewardInr));

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpCode.trim()) return;
    await apiRequest('/api/admin/coupons', {
      method: 'POST',
      json: {
        code: cpCode.trim(),
        title: cpTitle.trim() || 'Vadakara Special Offer',
        discountType: cpType,
        discountValue: Number(cpValue) || 40,
        maxDiscountInr: Number(cpValue) || 100,
        minOrderInr: Number(cpMinOrder) || 199,
        firstOrderOnly: cpFirstOrder,
      },
    });
    setCpCode('');
    setCpTitle('');
    await onRefresh();
    notify('Coupon published to marketplace', 'success');
  };

  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmpTitle.trim()) return;
    const res = await apiRequest<{ campaign: { sentCount?: number } }>('/api/admin/campaigns', {
      method: 'POST',
      json: {
        title: cmpTitle.trim(),
        type: cmpType,
        description: cmpDesc.trim() || 'FYOORA Vadakara local promotion',
      },
    });
    setCmpTitle('');
    setCmpDesc('');
    await onRefresh();
    notify(
      cmpType === 'push_notification'
        ? `Push notification campaign queued for ${res.campaign.sentCount || 0} active customers`
        : 'Marketing campaign launched',
      'success'
    );
  };

  return (
    <div className="space-y-6">
      {/* Coupons Creator + Redemption Analytics */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#E60023]" />
          <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
            Discount Coupons &amp; Redemption Analytics
          </h2>
        </div>

        <form onSubmit={handleCreateCoupon} className="grid sm:grid-cols-6 gap-3 items-end text-xs">
          <div>
            <label className="font-semibold block mb-1">Code</label>
            <input
              type="text"
              required
              value={cpCode}
              onChange={(e) => setCpCode(e.target.value.toUpperCase())}
              placeholder="MONSOON40"
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono uppercase"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="font-semibold block mb-1">Offer Title</label>
            <input
              type="text"
              value={cpTitle}
              onChange={(e) => setCpTitle(e.target.value)}
              placeholder="Flat ₹40 Off"
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Type / Value</label>
            <div className="flex gap-1">
              <select
                value={cpType}
                onChange={(e) => setCpType(e.target.value as 'flat' | 'percent')}
                className="px-2 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              >
                <option value="flat">₹</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number"
                value={cpValue}
                onChange={(e) => setCpValue(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="font-semibold block mb-1">Min Order (₹)</label>
            <input
              type="number"
              value={cpMinOrder}
              onChange={(e) => setCpMinOrder(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={cpFirstOrder}
                onChange={(e) => setCpFirstOrder(e.target.checked)}
                className="accent-[#E60023]"
              />
              First order only
            </label>
            <button type="submit" className="w-full py-2 rounded-xl bg-[#E60023] text-white font-semibold">
              + Publish Coupon
            </button>
          </div>
        </form>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {data.analytics.coupons.map(({ coupon: c, redemptions, totalDiscountGiven, attributedGmv }) => (
            <div
              key={c.id}
              className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-bold text-[#E60023]">{c.code}</div>
                  <div className="font-semibold text-sm text-[#252525] dark:text-neutral-100">{c.title}</div>
                  <div className="text-[11px] text-neutral-500">{c.description}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest(`/api/admin/coupons/${c.id}`, {
                      method: 'PATCH',
                      json: { active: !c.active },
                    });
                    await onRefresh();
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                    c.active ? 'bg-emerald-700 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  {c.active ? 'Active' : 'Paused'}
                </button>
              </div>

              <div className="pt-2 border-t border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between font-mono text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
                <span>Uses: {redemptions}</span>
                <span>Disc: {formatInr(totalDiscountGiven)}</span>
                <span>GMV: {formatInr(attributedGmv)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaigns & Push Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#E60023]" />
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Campaigns &amp; Customer Push Broadcasts
            </h3>
          </div>

          <form onSubmit={handleLaunchCampaign} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                value={cmpTitle}
                onChange={(e) => setCmpTitle(e.target.value)}
                placeholder="Campaign headline / Push title"
                className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <select
                value={cmpType}
                onChange={(e) => setCmpType(e.target.value as typeof cmpType)}
                className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              >
                <option value="seasonal">Seasonal Offer</option>
                <option value="featured_vendor">Featured Vendor Spotlight</option>
                <option value="sponsored">Sponsored Listing</option>
                <option value="push_notification">Push Notification Broadcast</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={cmpDesc}
                onChange={(e) => setCmpDesc(e.target.value)}
                placeholder="Message body or offer details..."
                className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#252525] dark:bg-white text-white dark:text-[#252525] font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                {cmpType === 'push_notification' ? <Bell className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                Launch
              </button>
            </div>
          </form>

          {data.marketingCampaigns.length === 0 ? (
            <p className="text-neutral-500 py-3">No active campaigns created yet.</p>
          ) : (
            <div className="space-y-2">
              {data.marketingCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold text-[#252525] dark:text-neutral-100">
                      {c.title}{' '}
                      <span className="text-[10px] uppercase text-[#E60023] font-bold">· {c.type.replace('_', ' ')}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {c.description}
                      {c.sentCount ? ` · Sent to ${c.sentCount} customers` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/admin/campaigns/${c.id}`, {
                        method: 'PATCH',
                        json: { active: !c.active },
                      });
                      await onRefresh();
                    }}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${
                      c.active ? 'bg-emerald-700 text-white' : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  >
                    {c.active ? 'Active' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Referral Settings + Hero Banners */}
        <div className="space-y-5 text-xs">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Referral Program Rules
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="font-semibold block mb-1">Referrer Pts</label>
                <input
                  type="number"
                  value={refReferrerPts}
                  onChange={(e) => setRefReferrerPts(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Welcome Pts</label>
                <input
                  type="number"
                  value={refWelcomePts}
                  onChange={(e) => setRefWelcomePts(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Min Order ₹</label>
                <input
                  type="number"
                  value={refMinOrder}
                  onChange={(e) => setRefMinOrder(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={refEnabled}
                  onChange={(e) => setRefEnabled(e.target.checked)}
                  className="accent-[#E60023]"
                />
                Referral Rewards Enabled
              </label>
              <button
                type="button"
                onClick={async () => {
                  await apiRequest('/api/admin/referrals', {
                    method: 'PUT',
                    json: {
                      enabled: refEnabled,
                      referrerRewardPoints: Number(refReferrerPts) || 0,
                      refereeWelcomePoints: Number(refWelcomePts) || 0,
                      minOrderForRewardInr: Number(refMinOrder) || 0,
                    },
                  });
                  await onRefresh();
                  notify('Referral settings updated', 'success');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-[#E60023] text-white font-semibold"
              >
                Save Referrals
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Marketplace Hero Banners ({data.banners.length})
            </h3>
            <div className="space-y-2">
              {data.banners.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-[#252525] dark:text-neutral-100">{b.title}</div>
                    <div className="text-[11px] text-neutral-500">{b.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/admin/banners/${b.id}`, {
                        method: 'PATCH',
                        json: { active: !b.active },
                      });
                      await onRefresh();
                    }}
                    className={`px-3 py-1 rounded-lg font-semibold shrink-0 ${
                      b.active
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600'
                    }`}
                  >
                    {b.active ? 'Active' : 'Hidden'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Reviews Moderation */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
        <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
          Customer Reviews Moderation ({data.reviews.length})
        </h3>
        {data.reviews.length === 0 ? (
          <p className="text-xs text-neutral-500">No customer reviews submitted yet.</p>
        ) : (
          <div className="space-y-2 text-xs">
            {data.reviews.map((rev) => (
              <div
                key={rev.id}
                className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-[#252525] dark:text-neutral-100">
                    {rev.customerName} · {rev.rating}/5 ★ ·{' '}
                    <span className="font-normal text-neutral-500">{formatShortDateTime(rev.createdAt)}</span>
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-300 mt-0.5">{rev.comment}</div>
                </div>
                <select
                  aria-label={`Moderation status for ${rev.customerName} review`}
                  value={rev.status}
                  onChange={async (e) => {
                    await apiRequest(`/api/admin/reviews/${rev.id}`, {
                      method: 'PATCH',
                      json: { status: e.target.value },
                    });
                    await onRefresh();
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-semibold"
                >
                  <option value="published">Published</option>
                  <option value="flagged">Flagged</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
