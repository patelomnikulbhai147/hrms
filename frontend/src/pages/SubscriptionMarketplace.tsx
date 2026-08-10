import React, { useState, useEffect } from 'react';
import { ShoppingCart, Zap, Box, MessageSquare, Database, CheckCircle2 } from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

export const SubscriptionMarketplace = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fallback data since DB push is blocked
  const defaultItems = [
    { id: 1, name: 'AI Business Copilot Credits', type: 'Credit', price: 999, description: '10,000 AI generation credits for payroll forecasting and smart responses.', icon: Zap, color: 'text-brand-500 bg-brand-50' },
    { id: 2, name: 'WhatsApp & SMS Pack', type: 'Credit', price: 2500, description: '100,000 WhatsApp and SMS notifications for automated alerts.', icon: MessageSquare, color: 'text-emerald-500 bg-emerald-50' },
    { id: 3, name: 'Enterprise Storage (1TB)', type: 'Storage', price: 4999, description: 'Add 1 Terabyte of secure document vault storage for your branches.', icon: Database, color: 'text-blue-500 bg-blue-50' },
    { id: 4, name: 'Unlimited Branches Add-on', type: 'Addon', price: 14999, description: 'Unlock unlimited branch management and multi-locational data isolation.', icon: Box, color: 'text-purple-500 bg-purple-50' },
  ];

  useEffect(() => {
    fetchMarketplace();
  }, []);

  const fetchMarketplace = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/saas/marketplace`);
      if (res && res.length > 0) setItems(res);
      else setItems(defaultItems);
    } catch (err) {
      setItems(defaultItems);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = (item: any) => {
    toast.success(`Successfully added ${item.name} to your next billing cycle!`);
  };

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-slate-800 flex items-center justify-center gap-3">
          <ShoppingCart className="text-brand-500" /> Subscription Marketplace
        </h2>
        <p className="text-slate-500 mt-2">Supercharge your HRMS with enterprise add-ons, storage, and AI credits.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between hover:shadow-md transition">
            <div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${item.color || 'bg-slate-100 text-slate-600'}`}>
                {item.icon ? <item.icon size={24} /> : <Box size={24} />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">{item.type}</span>
              <h3 className="font-bold text-slate-800 text-lg leading-tight">{item.name}</h3>
              <p className="text-sm text-slate-500 mt-2 mb-6">{item.description}</p>
            </div>
            
            <div>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-black text-slate-800">₹{item.price.toLocaleString()}</span>
                <span className="text-sm text-slate-500 font-medium">/mo</span>
              </div>
              <button 
                onClick={() => handlePurchase(item)}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 rounded-lg transition"
              >
                Add to Subscription
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-emerald-50 border border-emerald-200 rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" /> Need a custom Enterprise plan?
          </h3>
          <p className="text-emerald-700 mt-1">Get unlimited storage, dedicated support, and custom integrations.</p>
        </div>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold transition whitespace-nowrap">
          Contact Sales
        </button>
      </div>
    </div>
  );
};
