import React, { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle2, AlertCircle, Building2, Loader2, MapPin, Video, Phone, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PublicInterviewScheduleViewProps {
  token: string;
}

interface Slot {
  start: string;
  end: string;
  available: boolean;
}

interface DateEntry {
  date: string;
  weekday: string;
  availableCount: number;
}

/**
 * Candidate self-scheduling page. Dates and slots are computed SERVER-side
 * from the invitation's availability window — this view only renders what the
 * backend offers and never fabricates slot times locally.
 */
export const PublicInterviewScheduleView: React.FC<PublicInterviewScheduleViewProps> = ({ token }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    fetchScheduleData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fetchScheduleData = async (keepSelection = false) => {
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

      if (!keepSelection) {
        setSelectedTime('');
        const firstDate = (json.dates || []).find((d: DateEntry) => d.availableCount > 0);
        setSelectedDate(firstDate ? firstDate.date : '');
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
        const err: any = new Error(json.error || 'Failed to schedule interview.');
        err.status = res.status;
        throw err;
      }

      setBooking(json);
      toast.success('Interview scheduled successfully!');
    } catch (err: any) {
      toast.error(err.message);
      // Slot raced away (409) or window changed — refresh availability
      setSelectedTime('');
      fetchScheduleData(true);
    } finally {
      setSubmitting(false);
    }
  };

  const format12 = (hhmm: string) => {
    const [h, m] = (hhmm || '0:0').split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hours12 = h % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  };

  const formatDateLong = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const formatDateShort = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    return { day: d.getDate(), month: d.toLocaleDateString('en-US', { month: 'short' }) };
  };

  const ModeIcon = data?.interviewMode === 'Offline' ? MapPin : data?.interviewMode === 'Phone' ? Phone : Video;

  if (loading && !data) {
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

  if (booking) {
    return (
      <div className="min-h-screen bg-emerald-50/50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full bg-white rounded-2xl p-8 sm:p-10 border border-emerald-200 shadow-xl text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Interview Confirmed!</h2>
          <p className="text-slate-600 text-sm mb-6">
            Your interview for <strong>{data.jobTitle}</strong> at <strong>{data.companyName}</strong> has been confirmed.
            A confirmation email with the details has been sent to you.
          </p>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-left space-y-3 text-sm mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="text-[#C77E52] shrink-0" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Date</p>
                <p className="font-bold text-slate-800">{formatDateLong(booking.scheduledDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="text-[#C77E52] shrink-0" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-semibold">Time</p>
                <p className="font-bold text-slate-800">
                  {format12(booking.scheduledTime)} – {format12(booking.scheduledEndTime)} ({data.timezone || 'IST'})
                </p>
              </div>
            </div>
            {data.interviewMode && (
              <div className="flex items-center gap-3">
                <ModeIcon className="text-[#C77E52] shrink-0" size={18} />
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Mode</p>
                  <p className="font-bold text-slate-800">{data.interviewMode}</p>
                </div>
              </div>
            )}
            {data.interviewer && (
              <div className="flex items-center gap-3">
                <User className="text-[#C77E52] shrink-0" size={18} />
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Interviewer</p>
                  <p className="font-bold text-slate-800">{data.interviewer}</p>
                </div>
              </div>
            )}
            {booking.meetingLink && (
              <div className="flex items-center gap-3">
                <Video className="text-[#C77E52] shrink-0" size={18} />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-semibold">Meeting Link</p>
                  <a href={booking.meetingLink} target="_blank" rel="noreferrer" className="font-bold text-[#C77E52] break-all text-xs">{booking.meetingLink}</a>
                </div>
              </div>
            )}
            {booking.location && !booking.meetingLink && (
              <div className="flex items-center gap-3">
                <MapPin className="text-[#C77E52] shrink-0" size={18} />
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Location</p>
                  <p className="font-bold text-slate-800">{booking.location}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">Please join 5 minutes early. You may close this tab now.</p>
        </div>
      </div>
    );
  }

  const dates: DateEntry[] = data?.dates || [];
  const slotsForDate: Slot[] = (data?.slots && data.slots[selectedDate]) || [];
  const window = data?.window || {};

  return (
    <div className="min-h-screen bg-slate-100/70 py-12 px-4 sm:px-6 font-sans">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2 mb-2 text-orange-200 text-xs font-semibold uppercase tracking-wider">
            <Building2 size={16} className="text-[#C77E52]" /> Schedule Your Interview
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white !text-white">{data.jobTitle}</h1>
          <p className="text-sm text-slate-300 mt-1">
            {data.companyName} · Candidate: <strong className="text-white">{data.candidateName}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-300">
            {window.availableFrom && window.availableTo && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-[#C77E52]" />
                {window.availableFrom} → {window.availableTo}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-[#C77E52]" />
              {data.duration} min slots · {format12(window.startTime || '10:00')} – {format12(window.endTime || '17:00')}
            </span>
            {data.interviewMode && (
              <span className="flex items-center gap-1.5">
                <ModeIcon size={13} className="text-[#C77E52]" /> {data.interviewMode}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">1. Select Interview Date</label>
            {dates.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
                No dates are currently available in this scheduling window. Please contact the hiring team.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dates.map((d) => {
                  const { day, month } = formatDateShort(d.date);
                  const isSelected = selectedDate === d.date;
                  const exhausted = d.availableCount === 0;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={exhausted}
                      onClick={() => { setSelectedDate(d.date); setSelectedTime(''); }}
                      className={`min-w-[76px] px-3 py-2.5 rounded-xl border-2 text-center transition shrink-0 cursor-pointer ${
                        exhausted
                          ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                          : isSelected
                          ? 'bg-orange-50/80 border-[#C77E52] shadow-md ring-2 ring-[#C77E52]/20'
                          : 'bg-white border-slate-200 hover:border-[#C77E52]'
                      }`}
                    >
                      <p className={`text-[10px] font-bold uppercase ${isSelected ? 'text-[#C77E52]' : 'text-slate-400'}`}>{d.weekday.slice(0, 3)}</p>
                      <p className="text-lg font-extrabold text-slate-900 leading-tight">{day}</p>
                      <p className="text-[10px] font-semibold text-slate-500">{month}</p>
                      <p className={`text-[9px] font-bold mt-0.5 ${exhausted ? 'text-slate-300' : 'text-emerald-600'}`}>
                        {exhausted ? 'Full' : `${d.availableCount} slots`}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedDate && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-bold text-slate-800">
                  2. Choose Time Slot — {formatDateLong(selectedDate)}
                </label>
                <span className="text-xs text-[#C77E52] font-bold bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                  {data.duration} mins
                </span>
              </div>

              {slotsForDate.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  No time slots remain on this date. Please pick another date.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {slotsForDate.map((slot) => {
                    const isSelected = selectedTime === slot.start;
                    return (
                      <button
                        key={slot.start}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.start)}
                        className={`p-3 rounded-xl text-center border-2 transition-all cursor-pointer ${
                          !slot.available
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            : isSelected
                            ? 'bg-orange-50/80 border-[#C77E52] shadow-md ring-2 ring-[#C77E52]/20 text-slate-900'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-[#C77E52] hover:bg-orange-50/30'
                        }`}
                      >
                        <p className="font-extrabold text-xs sm:text-sm">{format12(slot.start)}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {slot.available ? `till ${format12(slot.end)}` : 'Booked'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {selectedTime
                ? <>Selected: <strong>{formatDateLong(selectedDate)}, {format12(selectedTime)}</strong></>
                : <>Duration: <strong>{data.duration} mins</strong> ({data.timezone || 'IST'})</>}
            </span>
            <button
              onClick={handleConfirmSchedule}
              disabled={submitting || !selectedDate || !selectedTime}
              className="px-6 py-2.5 bg-[#C77E52] hover:bg-[#B36F46] text-white font-bold text-sm rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirm Interview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
