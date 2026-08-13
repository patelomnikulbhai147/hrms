import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Building2, Loader2, IndianRupee, Calendar, MapPin, Briefcase } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';

interface PublicOfferResponseViewProps {
  token: string;
  initialAction?: 'accept' | 'decline';
}

export const PublicOfferResponseView: React.FC<PublicOfferResponseViewProps> = ({ token, initialAction }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [decision, setDecision] = useState<'accept' | 'decline' | null>(initialAction || null);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    fetchOffer();
  }, [token]);

  const resolveApiUrl = (endpoint: string) => {
    const base = import.meta.env.VITE_API_BASE_URL;
    if (base && base.startsWith('http')) {
      const cleanBase = base.replace(/\/api\/?$/, '');
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${cleanBase}${cleanEndpoint}`;
    }
    return endpoint;
  };

  const fetchOffer = async () => {
    try {
      setLoading(true);
      const url = resolveApiUrl(`/api/recruitment/public/offer/${token}`);
      const res = await fetch(url);
      const rawText = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        throw new Error('Invalid or expired offer link.');
      }
      if (!res.ok) {
        throw new Error(json.error || 'Invalid or expired offer link.');
      }
      setData(json);

      if (json.status === 'ACCEPTED' || json.status === 'DECLINED') {
        setDecision(json.status === 'ACCEPTED' ? 'accept' : 'decline');
        setCompleted(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (actionType: 'accept' | 'decline') => {
    try {
      setSubmitting(true);
      const url = resolveApiUrl(`/api/recruitment/public/offer/${token}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, reason: declineReason })
      });

      const rawText = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        throw new Error('Failed to submit offer response.');
      }
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit offer response.');
      }

      setDecision(actionType);
      setCompleted(true);
      toast.success(actionType === 'accept' ? 'Offer accepted!' : 'Offer declined.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
          <p className="text-slate-600 font-medium">Loading offer letter details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-xl text-center">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Offer Unavailable</h2>
          <p className="text-slate-600 text-sm mb-6">{error}</p>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full bg-white rounded-2xl p-8 sm:p-10 border border-slate-200 shadow-2xl text-center">
          {decision === 'accept' ? (
            <>
              <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-4 animate-bounce" />
              <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Congratulations!</h1>
              <p className="text-slate-600 text-sm mb-6">
                <strong>{data.candidateName}</strong>, you have accepted the offer for the position of <strong>{data.jobTitle}</strong> at <strong>{data.companyName}</strong>.
              </p>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-xs font-semibold mb-6">
                Our HR onboarding team will contact you shortly with joining formalities and documentation requirements.
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-20 h-20 text-rose-500 mx-auto mb-4" />
              <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Offer Declined</h1>
              <p className="text-slate-600 text-sm mb-6">
                You have declined the offer for <strong>{data.jobTitle}</strong>. We appreciate your time and wish you the best in your career pursuits.
              </p>
            </>
          )}
          <p className="text-xs text-slate-400">You may close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 font-sans">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2 mb-2 text-emerald-100 text-xs font-semibold uppercase tracking-wider">
            <Building2 size={16} /> Official Employment Offer
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">{data.jobTitle}</h1>
          <p className="text-sm text-emerald-100 mt-1">Prepared for: <strong>{data.candidateName}</strong></p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <p className="text-sm text-slate-600 leading-relaxed">
            Dear <strong>{data.candidateName}</strong>,<br />
            We are pleased to extend this formal offer of employment on behalf of <strong>{data.companyName}</strong>. Please review your compensation and employment terms below.
          </p>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <IndianRupee className="text-emerald-600 shrink-0" size={20} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Offered CTC / Salary</p>
                <p className="font-bold text-slate-900 text-base">{data.salary || 'As Discussed'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="text-emerald-600 shrink-0" size={20} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Expected Joining Date</p>
                <p className="font-bold text-slate-900 text-base">{data.joiningDate || 'Immediate'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="text-emerald-600 shrink-0" size={20} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Work Location</p>
                <p className="font-bold text-slate-900 text-base">{data.location || 'Company Headquarters'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Briefcase className="text-emerald-600 shrink-0" size={20} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Employment Type</p>
                <p className="font-bold text-slate-900 text-base">{data.employmentType || 'Full-Time'}</p>
              </div>
            </div>
          </div>

          {decision === 'decline' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Reason for Declining (Optional)</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Accepted another offer, relocation issues, etc."
                rows={3}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
              />
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            {decision !== 'decline' ? (
              <>
                <button
                  type="button"
                  onClick={() => setDecision('decline')}
                  className="px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-sm rounded-xl transition"
                >
                  Decline Offer
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleAction('accept')}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 size={16} />}
                  Accept Offer Letter
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDecision(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold text-sm rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleAction('decline')}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle size={16} />}
                  Confirm Decline
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <Toaster position="top-right" />
    </div>
  );
};
