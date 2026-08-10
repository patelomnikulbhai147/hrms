import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus, Clock } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const FacilityBooking = ({ activeCompanyId }: { activeCompanyId: number }) => {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeCompanyId) fetchFacilities();
  }, [activeCompanyId]);

  const fetchFacilities = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/facilities?companyId=${activeCompanyId}`);
      setFacilities(data);
    } catch (err) {
      toast.error('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFacility = async () => {
    const name = prompt('Enter Facility Name (e.g. Conference Room A):');
    const type = prompt('Enter Facility Type (e.g. MeetingRoom, Vehicle):');
    if (!name || !type) return;
    
    try {
      await api.post('/api/facilities', { companyId: activeCompanyId, name, type, capacity: 10 });
      toast.success('Facility added');
      fetchFacilities();
    } catch (err) {
      toast.error('Failed to add facility');
    }
  };

  const handleBook = async (facilityId: number) => {
    const purpose = prompt('Enter purpose of booking:');
    if (!purpose) return;
    // For demo purposes, creating a 1-hour booking from now.
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    
    try {
      await api.post(`/api/facilities/${facilityId}/book`, {
        employeeId: 1, // Mock employee ID for now
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose
      });
      toast.success('Facility booked successfully');
      fetchFacilities();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to book facility');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays className="text-brand-500" /> Facility Booking
          </h2>
          <p className="text-sm text-slate-500">Book meeting rooms, vehicles, and shared equipment.</p>
        </div>
        <button 
          onClick={handleCreateFacility}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
        >
          <Plus size={18} /> Add Facility
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-8 text-center text-slate-500">Loading facilities...</div>
        ) : facilities.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            No facilities found. Add a meeting room or vehicle.
          </div>
        ) : (
          facilities.map(facility => (
            <div key={facility.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">{facility.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{facility.type} • Capacity: {facility.capacity || 'N/A'}</p>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${facility.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                  {facility.status}
                </span>
              </div>
              <div className="flex-1 p-4 bg-slate-50/50">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Today's Bookings</h4>
                <div className="space-y-2">
                  {facility.bookings?.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No bookings today.</p>
                  ) : (
                    facility.bookings?.map((b: any) => (
                      <div key={b.id} className="flex items-start gap-3 text-sm">
                        <Clock size={16} className="text-brand-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-slate-700 font-medium">{new Date(b.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(b.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                          <p className="text-xs text-slate-500 truncate">{b.purpose}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-4 border-t border-slate-100">
                <button 
                  onClick={() => handleBook(facility.id)}
                  className="w-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 py-2 rounded-lg text-sm font-medium transition"
                >
                  Book Now
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
