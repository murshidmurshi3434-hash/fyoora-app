import { useEffect, useState } from 'react';
import {
  Award,
  Briefcase,
  Heart,
  HelpCircle,
  LogOut,
  MapPin,
  MessageSquare,
  Shield,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type {
  FeatureSuggestion,
  LanguageCode,
  PartnerApplication,
  RiderProfile,
  SavedAddress,
  SupportTicket,
  SuggestionArea,
  UserProfile,
  UserRole,
} from '../shared/types.ts';

export function ProfileAndSupportView() {
  const {
    user,
    health,
    bootstrap,
    language,
    setLanguage,
    setAuthSession,
    setSelectedAddress,
    setActivePortal,
    exitGuestBrowse,
    switchDevRole,
    logout,
    notify,
    setActiveCategory,
    setActiveVendorId,
    setActiveTab,
  } = useApp();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<FeatureSuggestion[]>([]);
  const [suggestionArea, setSuggestionArea] = useState<SuggestionArea>('other');
  const [suggestionTitle, setSuggestionTitle] = useState('');
  const [suggestionDetails, setSuggestionDetails] = useState('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Partner / Rider Onboarding Application
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [appType, setAppType] = useState<'vendor' | 'rider'>('vendor');
  const [bizName, setBizName] = useState('');
  const [bizCategory, setBizCategory] = useState<'food' | 'bakery' | 'grocery' | 'celebration' | 'flowers_gifts'>('food');
  const [bizAddress, setBizAddress] = useState('');
  const [vehicleType, setVehicleType] = useState<RiderProfile['vehicleType']>('Two-Wheeler');
  const [vehicleNo, setVehicleNo] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [aadhaarLast4, setAadhaarLast4] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);

  const loadTickets = async () => {
    if (!user) return;
    try {
      const [tRes, aRes, sRes] = await Promise.all([
        apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets'),
        apiRequest<{ applications: PartnerApplication[] }>('/api/applications/mine'),
        apiRequest<{ suggestions: FeatureSuggestion[] }>('/api/feedback/suggestions/mine'),
      ]);
      setTickets(tRes.tickets);
      setApplications(aRes.applications);
      setSuggestions(sRes.suggestions);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadTickets();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="p-8 rounded-3xl border border-neutral-200 bg-white text-center space-y-3 max-w-lg mx-auto">
        <div className="text-base font-display font-bold text-[#252525]">
          Sign in to access your FYOORA Profile
        </div>
        <p className="text-xs text-neutral-500">
          Manage your Vadakara delivery addresses, favourites, loyalty points, and support tickets once signed in.
        </p>
        <button
          type="button"
          onClick={exitGuestBrowse}
          className="px-5 py-2.5 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white text-xs font-bold transition-colors"
        >
          Sign In / Verify Account
        </button>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/users/profile', {
        method: 'PUT',
        json: { fullName: fullName.trim(), email: email.trim(), preferredLanguage: language },
      });
      void import('../lib/googleAuth.ts').then(({ syncCurrentFirebaseUserProfile }) =>
        syncCurrentFirebaseUserProfile(res.user)
      );
      setAuthSession(res.user);
      notify('Profile updated', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReplyTicket = async (ticketId: string) => {
    const text = (replyText[ticketId] || '').trim();
    if (!text) return;
    try {
      await apiRequest(`/api/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        json: { text },
      });
      setReplyText((prev) => ({ ...prev, [ticketId]: '' }));
      await loadTickets();
      notify('Reply sent to FYOORA Support', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to reply', 'error');
    }
  };

  const handleDeleteRequest = async () => {
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/delete-request', {
        method: 'POST',
        json: { reason: 'Customer requested account deletion via Profile settings' },
      });
      setAuthSession(res.user);
      setDeleteConfirm(false);
      notify('Account deletion request recorded and logged for compliance.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Request failed', 'error');
    }
  };

  const handleSetDefaultAddress = async (addr: SavedAddress) => {
    try {
      const res = await apiRequest<{ addresses: SavedAddress[] }>(`/api/users/addresses/${addr.id}/default`, {
        method: 'PATCH',
      });
      setAuthSession({ ...user, addresses: res.addresses });
      setSelectedAddress(addr);
      notify(`${addr.label} set as primary Vadakara address`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update default address', 'error');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    try {
      const res = await apiRequest<{ addresses: SavedAddress[] }>(`/api/users/addresses/${addressId}`, {
        method: 'DELETE',
      });
      setAuthSession({ ...user, addresses: res.addresses });
      if (res.addresses[0]) setSelectedAddress(res.addresses[0]);
      notify('Address removed', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to delete address', 'error');
    }
  };

  const handlePartnerApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingApp(true);
    try {
      await apiRequest('/api/applications', {
        method: 'POST',
        json:
          appType === 'vendor'
            ? {
                type: 'vendor',
                applicantName: user.fullName || 'FYOORA Partner',
                businessName: bizName.trim(),
                serviceCategory: bizCategory,
                address: bizAddress.trim(),
              }
            : {
                type: 'rider',
                applicantName: user.fullName || 'FYOORA Rider',
                vehicleType,
                vehicleNumber: vehicleNo.trim(),
                licenseNumber: licenseNo.trim(),
                aadhaarLast4: aadhaarLast4.trim(),
              },
      });
      setBizName('');
      setBizAddress('');
      setVehicleNo('');
      setLicenseNo('');
      setAadhaarLast4('');
      await loadTickets();
      notify('Application submitted to FYOORA Vadakara Ops for verification!', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not submit application', 'error');
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingSuggestion(true);
    try {
      await apiRequest('/api/feedback/suggestions', {
        method: 'POST',
        json: {
          area: suggestionArea,
          title: suggestionTitle.trim(),
          details: suggestionDetails.trim(),
        },
      });
      setSuggestionTitle('');
      setSuggestionDetails('');
      await loadTickets();
      notify('Thanks — your idea has been sent to FYOORA.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to send your idea.', 'error');
    } finally {
      setSubmittingSuggestion(false);
    }
  };

  const favVendors = (bootstrap?.vendors || []).filter((v) => user.favourites.includes(v.id));

  return (
    <div className="grid lg:grid-cols-12 gap-6 pb-8">
      <div className="lg:col-span-6 space-y-5">
        {/* Account & Loyalty Card */}
        <div className="rounded-3xl bg-[#252525] text-white p-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-neutral-300">{user.contactPhone || user.phone || 'No contact number added'}</div>
            {user.contactPhone && !user.contactPhoneVerified && (
              <div className="text-[11px] text-amber-300 mt-1">Contact number not verified by SMS</div>
            )}
            <h2 className="font-display text-xl font-extrabold mt-0.5">{user.fullName || 'FYOORA User'}</h2>
            <div className="text-xs text-neutral-300 mt-2 flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-[#E60023]" />
                <strong className="tabular-nums">{user.loyaltyPoints}</strong> pts
              </span>
              <span>· Referral: <strong className="font-mono">{user.referralCode}</strong></span>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>

        {/* Profile Edit */}
        <form onSubmit={handleSaveProfile} className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base text-[#252525]">Personal Details &amp; Language</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['en', 'ml'] as LanguageCode[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`py-2 rounded-xl border text-xs font-bold ${
                  language === lang
                    ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                    : 'border-neutral-200'
                }`}
              >
                {lang === 'en' ? 'English Interface' : 'മലയാളം (Malayalam)'}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        {/* Saved Addresses & Favourites */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-base text-[#252525]">Saved Vadakara Addresses</h3>
          {user.addresses.length === 0 ? (
            <p className="text-xs text-neutral-500">Use the header location selector to add a Vadakara address.</p>
          ) : (
            user.addresses.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-[#F5F5F5] text-xs flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <MapPin className="w-4 h-4 text-[#E60023] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-[#252525] flex items-center gap-1.5">
                      <span>{a.label}</span>
                      {a.isDefault && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-neutral-600">{a.line1} · {a.pincode}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!a.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultAddress(a)}
                      className="px-2 py-1 rounded-lg bg-white border border-neutral-200 font-semibold hover:border-[#E60023]"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(a.id)}
                    aria-label={`Delete ${a.label}`}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {favVendors.length > 0 && (
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#E60023]" />
              <h3 className="font-display font-bold text-base text-[#252525]">Favourite Stores</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {favVendors.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(v.serviceCategory);
                    setActiveVendorId(v.id);
                    setActiveTab('explore');
                  }}
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#E60023] text-left text-xs"
                >
                  <div className="font-bold text-[#252525]">{v.name}</div>
                  <div className="text-neutral-500">{v.areaName}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Support, Portals & Privacy */}
      <div className="lg:col-span-6 space-y-5">
        {/* Customer Ideas & Change Requests */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="font-display font-bold text-base text-[#252525]">What should we add or improve?</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Suggest an item, store, service, or change anywhere in FYOORA. Include a product or store name when helpful.
            </p>
          </div>
          <form onSubmit={handleSuggestionSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="suggestion-area" className="text-xs font-semibold text-neutral-600 block mb-1">Area</label>
                <select id="suggestion-area" value={suggestionArea} onChange={(event) => setSuggestionArea(event.target.value as SuggestionArea)} className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 bg-white text-sm">
                  <option value="food">Food &amp; restaurants</option>
                  <option value="bakery">Bakery &amp; cakes</option>
                  <option value="grocery">Grocery</option>
                  <option value="flowers_gifts">Flowers &amp; gifts</option>
                  <option value="celebration">Celebrations</option>
                  <option value="delivery">Delivery &amp; pickup</option>
                  <option value="payments">Payments &amp; checkout</option>
                  <option value="profile">Profile &amp; account</option>
                  <option value="other">Another area</option>
                </select>
              </div>
              <div>
                <label htmlFor="suggestion-title" className="text-xs font-semibold text-neutral-600 block mb-1">Short title</label>
                <input id="suggestion-title" required minLength={3} maxLength={120} value={suggestionTitle} onChange={(event) => setSuggestionTitle(event.target.value)} placeholder="e.g. Add fresh juice options" className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-sm" />
              </div>
            </div>
            <div>
              <label htmlFor="suggestion-details" className="text-xs font-semibold text-neutral-600 block mb-1">What would you like us to add or change?</label>
              <textarea id="suggestion-details" required minLength={10} maxLength={2000} rows={3} value={suggestionDetails} onChange={(event) => setSuggestionDetails(event.target.value)} placeholder="Tell us what you need and where you’d like it in the app…" className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-sm resize-y" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-neutral-500">You can send up to 5 ideas per day.</span>
              <button type="submit" disabled={submittingSuggestion} className="px-4 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold disabled:opacity-50">
                {submittingSuggestion ? 'Sending…' : 'Send Idea'}
              </button>
            </div>
          </form>
          {suggestions.length > 0 && (
            <div className="pt-3 border-t border-neutral-200 space-y-2">
              <h4 className="text-xs font-bold text-[#252525]">Your recent suggestions</h4>
              {suggestions.slice(0, 4).map((suggestion) => (
                <div key={suggestion.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#F5F5F5] text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#252525]">{suggestion.title}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{suggestion.area.replace(/_/g, ' ')} · {new Date(suggestion.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-white border border-neutral-200 font-bold capitalize text-neutral-700">{suggestion.status.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Support Tickets */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#E60023]" />
            <h3 className="font-display font-bold text-base text-[#252525]">Support Tickets ({tickets.length})</h3>
          </div>
          {tickets.length === 0 ? (
            <p className="text-xs text-neutral-500">
              Need help with an order? Open a support ticket directly from the Orders tab.
            </p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.id} className="p-3.5 rounded-2xl bg-[#F5F5F5] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#252525]">{t.subject}</span>
                    <span className="font-semibold text-[#E60023] uppercase">{t.status}</span>
                  </div>
                  <div className="space-y-1.5">
                    {t.messages.map((m, idx) => (
                      <div key={idx} className="bg-white p-2 rounded-xl border border-neutral-200">
                        <div className="font-semibold text-[11px] text-neutral-500">{m.senderName}</div>
                        <div className="text-neutral-800 mt-0.5">{m.text}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText[t.id] || ''}
                      onChange={(e) => setReplyText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      placeholder="Reply to support..."
                      className="flex-1 px-3 py-1.5 rounded-xl border border-neutral-300 bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleReplyTicket(t.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#252525] text-white text-xs font-bold"
                    >
                      Send
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FAQ */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-2.5 text-xs">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#E60023]" />
            <h3 className="font-display font-bold text-base text-[#252525]">Vadakara FAQ</h3>
          </div>
          <p><strong>What is FYOORA&apos;s delivery radius?</strong> Currently 10 km around Vadakara Town (configurable by operations).</p>
          <p><strong>Are Food and Grocery orders separate?</strong> Yes, restaurant orders and Vadakara Fresh Mart grocery orders use dedicated catalogs and replacement rules.</p>
          <p><strong>How do Pickup &amp; Drop OTPs work?</strong> Senders share the 4-digit Pickup OTP on collection; recipients share the Delivery OTP on handover.</p>
        </div>

        {/* Assigned Role Portal Access (Always available for authenticated Admin / Vendor / Rider accounts) */}
        {user.role !== 'customer' && (
          <div className="rounded-3xl border border-[#E60023]/30 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#252525] flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#E60023]" />
                <span>Your Assigned Operations Portal</span>
              </div>
              <span className="text-[11px] font-mono uppercase text-[#E60023] font-bold">
                {user.role.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(user.role === 'admin' || user.role === 'super_admin') && (
                <>
                  <button
                    type="button"
                    onClick={() => setActivePortal('admin')}
                    className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-bold"
                  >
                    Open Super Admin Console
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePortal('vendor')}
                    className="px-3.5 py-2 rounded-xl border border-neutral-300 text-xs font-bold"
                  >
                    Inspect Vendor Portal
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePortal('rider')}
                    className="px-3.5 py-2 rounded-xl border border-neutral-300 text-xs font-bold"
                  >
                    Inspect Rider Portal
                  </button>
                </>
              )}
              {['restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'].includes(user.role) && (
                <button
                  type="button"
                  onClick={() => setActivePortal('vendor')}
                  className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-bold"
                >
                  Open My Store Partner Dashboard
                </button>
              )}
              {user.role === 'rider' && (
                <button
                  type="button"
                  onClick={() => setActivePortal('rider')}
                  className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-bold"
                >
                  Open FYOORA Rider App
                </button>
              )}
            </div>
          </div>
        )}

        {/* Partner / Rider Onboarding Application */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#E60023]" />
            <h3 className="font-display font-bold text-base text-[#252525]">
              Partner or Ride with FYOORA Vadakara
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAppType('vendor')}
              className={`py-2 rounded-xl border text-xs font-bold ${
                appType === 'vendor' ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]' : 'border-neutral-200'
              }`}
            >
              Register Store / Kitchen
            </button>
            <button
              type="button"
              onClick={() => setAppType('rider')}
              className={`py-2 rounded-xl border text-xs font-bold ${
                appType === 'rider' ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]' : 'border-neutral-200'
              }`}
            >
              Join Delivery Fleet
            </button>
          </div>

          <form onSubmit={handlePartnerApplicationSubmit} className="space-y-2.5 text-xs">
            {appType === 'vendor' ? (
              <>
                <input
                  type="text"
                  required
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="Business / Store Name (e.g. Vadakara Bake House)"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={bizCategory}
                    onChange={(e) => setBizCategory(e.target.value as typeof bizCategory)}
                    className="px-3 py-2 rounded-xl border border-neutral-300 bg-white"
                  >
                    <option value="food">Restaurant / Food</option>
                    <option value="bakery">Bakery &amp; Cakes</option>
                    <option value="grocery">Grocery Supermarket</option>
                    <option value="celebration">Celebration Store</option>
                    <option value="flowers_gifts">Flowers &amp; Gifts</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={bizAddress}
                    onChange={(e) => setBizAddress(e.target.value)}
                    placeholder="Vadakara Street / Area"
                    className="px-3 py-2 rounded-xl border border-neutral-300"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as RiderProfile['vehicleType'])}
                    className="px-3 py-2 rounded-xl border border-neutral-300 bg-white"
                  >
                    <option value="Two-Wheeler">Two-Wheeler</option>
                    <option value="EV Scooter">EV Scooter</option>
                    <option value="Bicycle">Bicycle</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                    placeholder="Vehicle Reg (e.g. KL-18-AB-1234)"
                    className="px-3 py-2 rounded-xl border border-neutral-300 font-mono uppercase"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={licenseNo}
                    onChange={(e) => setLicenseNo(e.target.value.toUpperCase())}
                    placeholder="Driving License No."
                    className="px-3 py-2 rounded-xl border border-neutral-300 font-mono uppercase"
                  />
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={aadhaarLast4}
                    onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, ''))}
                    placeholder="Aadhaar Last 4 Digits"
                    className="px-3 py-2 rounded-xl border border-neutral-300 font-mono"
                  />
                </div>
              </>
            )}
            <button
              type="submit"
              disabled={submittingApp}
              className="px-4 py-2 rounded-xl bg-[#252525] text-white font-bold disabled:opacity-60"
            >
              {submittingApp ? 'Submitting...' : 'Submit Onboarding Application'}
            </button>
          </form>

          {applications.length > 0 && (
            <div className="pt-2 border-t border-neutral-200 space-y-1.5 text-xs">
              <div className="font-semibold text-neutral-500">Your Applications</div>
              {applications.map((a) => (
                <div key={a.id} className="p-2.5 rounded-xl bg-[#F5F5F5] flex items-center justify-between">
                  <span>
                    <strong className="uppercase">{a.type}</strong> · {a.businessName || a.vehicleNumber}
                  </span>
                  <span className="font-bold uppercase text-[#E60023]">{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Role Portal Switcher (only when explicitly enabled in non-production) */}
        {health?.auth?.devRoleSwitcherEnabled && (
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#252525]">
              <UserCheck className="w-4 h-4 text-[#E60023]" />
              <span>Switch to Partner / Rider / Admin Portal (Sandbox)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(
                [
                  ['restaurant_owner', 'Restaurant'],
                  ['bakery_owner', 'Bakery'],
                  ['grocery_owner', 'Grocery'],
                  ['merchant', 'Local Merchant'],
                  ['rider', 'Rider App'],
                  ['super_admin', 'Super Admin'],
                ] as [UserRole, string][]
              ).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => switchDevRole(role)}
                  className="py-2 px-3 rounded-xl border border-neutral-200 hover:border-[#E60023] text-xs font-bold text-[#252525]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Privacy & Account Deletion */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#252525]">
            <Shield className="w-4 h-4 text-[#E60023]" />
            <span>Privacy, Terms &amp; Account Deletion</span>
          </div>
          <p className="text-neutral-500">
            Account Status: <strong className="uppercase text-[#252525]">{user.accountStatus.replace(/_/g, ' ')}</strong>
          </p>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Location pins and route previews integrate Google Maps features and are subject to the{' '}
            <a
              href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[#252525] font-medium"
            >
              Google Maps End User Terms
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[#252525] font-medium"
            >
              Google Privacy Policy
            </a>
            . Browser location permissions remain optional and revocable anytime.
          </p>
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 text-red-600 font-bold hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" /> Request Account Deletion
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-2">
              <div className="font-semibold text-red-800">
                Confirm submitting an account deletion request for {user.contactPhone || user.phone}?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-neutral-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRequest}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold"
                >
                  Confirm Deletion Request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
