import React, { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle2, AlertCircle, Building2, Loader2, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PublicInterviewScheduleViewProps {
  token: string;
}

export const PublicInterviewScheduleView: React.FC<PublicInterviewScheduleViewProps> = ({ token }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchScheduleData();
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

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      const url = resolveApiUrl(`/api/recruitment/public/interview-schedule/${token}`);
      const res = await fetch(url);
      const rawText = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        throw new Error('Interview link is invalid or expired');
      }
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load scheduling link.');
      }
      setData(json);

      // Default date
      if (json.settings?.availableFrom) {
        setSelectedDate(json.settings.availableFrom);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!selectedDate || !selectedTime) {
      toast.error('Please select both an interview date and time slot.');
      return;
    }

    try {
      setSubmitting(true);
      const url = resolveApiUrl(`/api/recruitment/public/interview-schedule/${token}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: selectedTime })
      });

      const rawText = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        throw new Error('Failed to schedule interview.');
      }
      if (!res.ok) {
        throw new Error(json.error || 'Failed to schedule interview.');
      }

      setSuccess(true);
      toast.success('Interview scheduled successfully!');
    } catch (err: any) {
      toast.error(err.message);
      if (err.message.includes('booked')) {
        fetchScheduleData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatSlotRange = (start24: string, durationMinutes: number) => {
    const [h, m] = start24.split(':').map(Number);
    const startTotal = h * 60 + (m || 0);
    const endTotal = startTotal + durationMinutes;

    const format12 = (totalMinutes: number) => {
      const hours24 = Math.floor(totalMinutes / 60) % 24;
      const mins = totalMinutes % 60;
      const period = hours24 >= 12 ? 'PM' : 'AM';
      const hours12 = hours24 % 12 || 12;
      return `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`;
    };

    return {
      startTime12: format12(startTotal),
      endTime12: format12(endTotal),
      rangeLabel: `${format12(startTotal)} – ${format12(endTotal)}`
    };
  };

  // Generate 4 to 5 well-spaced time slots with full timing duration
  const generateSlots = () => {
    const duration = data?.duration || data?.settings?.duration || 45;
    // 5 curated, realistic interview slots across business hours
    const defaultStartTimes = ['10:00', '11:30', '14:00', '15:30', '17:00'];

    return defaultStartTimes.map(startTime => {
      const { rangeLabel, startTime12, endTime12 } = formatSlotRange(startTime, duration);
      return {
        value: startTime,
        startTime12,
        endTime12,
        rangeLabel,
        duration
      };
    });
  };

  const isSlotBooked = (date: string, time: string) => {
    return (data?.bookedSlots || []).some((b: any) => b.date === date && b.time === time);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-[#C77E52] animate-spin" />
          <p className="text-slate-600 font-medium">Loading interview scheduling slots...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-xl text-center">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Scheduling Unavailable</h2>
          <p className="text-slate-600 text-sm mb-6">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-emerald-50/50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full bg-white rounded-2xl p-8 sm:p-10 border border-emerald-200 shadow-xl text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Interview Confirmed!</h2>
          <p className="text-slate-600 text-sm mb-6">
            Your interview for <strong>{data.jobTitle}</strong> has been confirmed. A calendar reminder has been sent to your email.
          </p>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-left space-y-3 text-sm mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="text-[#C77E52] shrink-0" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Date</p>
                <p className="font-bold text-slate-800">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="text-[#C77E52] shrink-0" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Time & Duration</p>
                <p className="font-bold text-slate-800">
                  {formatSlotRange(selectedTime, data.duration || 45).rangeLabel} IST ({data.duration || 45} mins)
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">You may close this tab now.</p>
        </div>
      </div>
    );
  }

  const slots = generateSlots();

  return (
    <div className="min-h-screen bg-slate-100/70 py-12 px-4 sm:px-6 font-sans">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2 mb-2 text-orange-200 text-xs font-semibold uppercase tracking-wider">
            <Building2 size={16} className="text-[#C77E52]" /> Interview Self-Scheduling
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white !text-white">{data.jobTitle}</h1>
          <p className="text-sm text-slate-300 mt-1">Candidate: <strong className="text-white">{data.candidateName}</strong></p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">1. Select Interview Date</label>
            <input
              type="date"
              value={selectedDate}
              min={data.settings?.availableFrom || new Date().toISOString().split('T')[0]}
              max={data.settings?.availableTo || undefined}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#C77E52]/20 focus:border-[#C77E52] outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-bold text-slate-800">2. Choose Time Slot (IST)</label>
              <span className="text-xs text-[#C77E52] font-bold bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                Duration: {data?.duration || 45} mins per slot
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {slots.map((slot) => {
                const booked = isSlotBooked(selectedDate, slot.value);
                const isSelected = selectedTime === slot.value;
                return (
                  <button
                    key={slot.value}
                    type="button"
                    disabled={booked}
                    onClick={() => setSelectedTime(slot.value)}
                    className={`p-3.5 rounded-xl text-left border-2 transition-all flex items-center justify-between cursor-pointer ${
                      booked
                        ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                        : isSelected
                        ? 'bg-orange-50/80 border-[#C77E52] shadow-md ring-2 ring-[#C77E52]/20 text-slate-900'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-[#C77E52] hover:bg-orange-50/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-[#C77E52] text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Clock size={16} />
                      </div>
                      <div>
                        <p className="font-extrabold text-xs sm:text-sm text-slate-900">{slot.rangeLabel}</p>
                        <p className="text-[10.5px] text-slate-500 mt-0.5">
                          {slot.duration} Mins Window {booked ? '• (Booked)' : ''}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 size={18} className="text-[#C77E52] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Total Duration: <strong>{data.duration || 45} mins</strong>
            </span>
            <button
              onClick={handleConfirmSchedule}
              disabled={submitting || !selectedDate || !selectedTime}
              className="px-6 py-2.5 bg-[#C77E52] hover:bg-[#B36F46] text-white font-bold text-sm rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirm Interview Slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
