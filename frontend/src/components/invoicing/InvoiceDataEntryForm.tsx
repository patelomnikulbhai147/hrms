import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Copy, Search, ChevronDown, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { type ServiceInvoiceDoc, type ServiceItem, blankServiceItem, computeInvoice } from './serviceInvoice';

// ── PRODUCT AUTOCOMPLETE COMPONENT ──────────────────────────────────────────
interface ProductAutocompleteProps {
  products: any[];
  selectedProductId?: any;
  selectedProductName?: string;
  onSelectProduct: (product: any) => void;
  onAddNewProduct: () => void;
  canEdit: boolean;
}

const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  products = [],
  selectedProductId,
  selectedProductName,
  onSelectProduct,
  onAddNewProduct,
  canEdit,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced API search when user types
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setSearchResults(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.invoicing.listProducts({ q: query.trim(), active: 'true' });
        setSearchResults(Array.isArray(res) ? res : []);
      } catch (err) {
        console.error('[ProductAutocomplete] Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Combined product list (API search results or initial products list)
  const sourceList = searchResults !== null ? searchResults : products;
  const filteredList = sourceList.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.hsnSac && String(p.hsnSac).toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % (filteredList.length + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + filteredList.length + 1) % (filteredList.length + 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex < filteredList.length && filteredList[highlightIndex]) {
        onSelectProduct(filteredList[highlightIndex]);
        setIsOpen(false);
        setQuery('');
      } else if (highlightIndex === filteredList.length) {
        onAddNewProduct();
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          disabled={!canEdit}
          value={isOpen ? query : (selectedProductName || query)}
          onFocus={() => {
            if (canEdit) setIsOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search Product / Service Master..."
          className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg pl-8 pr-8 py-2 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all placeholder:font-normal placeholder:text-slate-400 shadow-xs"
        />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <button
          type="button"
          tabIndex={-1}
          disabled={!canEdit}
          onClick={() => {
            if (canEdit) setIsOpen(!isOpen);
          }}
          className="absolute right-2 text-slate-400 hover:text-slate-600 p-1"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-72 flex flex-col">
          {loading ? (
            <div className="p-3 text-xs text-slate-500 font-medium text-center flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
              Searching Product Master...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center font-medium">No products found</div>
          ) : (
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {filteredList.map((p, idx) => {
                const isSelected = selectedProductId && String(p.id) === String(selectedProductId);
                const isHighlighted = idx === highlightIndex;
                return (
                  <div
                    key={p.id || idx}
                    onClick={() => {
                      onSelectProduct(p);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`p-2.5 text-xs cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                      isHighlighted ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold flex items-center gap-1.5 text-slate-800">
                        <span className="truncate">{p.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        {p.hsnSac && <span>HSN/SAC: <strong className="font-mono">{p.hsnSac}</strong></span>}
                        {p.unit && <span>Unit: {p.unit}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-brand-700">
                        ₹{Number(p.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      {p.taxRate != null && (
                        <div className="text-[10px] text-slate-400 font-medium">{p.taxRate}% GST</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onAddNewProduct();
              }}
              className={`w-full p-2.5 text-left text-xs font-bold text-brand-600 hover:text-brand-700 bg-slate-50 hover:bg-brand-50 border-t border-slate-200 flex items-center gap-1.5 transition-colors ${
                highlightIndex === filteredList.length ? 'bg-brand-100 text-brand-800' : ''
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> + Add New Product to Master
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── MAIN INVOICE DATA ENTRY FORM ─────────────────────────────────────────────
interface Props {
  doc: ServiceInvoiceDoc;
  onChange: (p: Partial<ServiceInvoiceDoc>) => void;
  intraState: boolean;
  canEdit: boolean;
  products?: any[];
  onSelectProduct?: (index: number, product: any) => void;
  onAddNewProduct?: (index: number) => void;
}

export const InvoiceDataEntryForm: React.FC<Props> = ({
  doc,
  onChange,
  intraState,
  canEdit,
  products = [],
  onSelectProduct,
  onAddNewProduct,
}) => {
  const updateDoc = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    onChange({ [e.target.name]: e.target.value });
  };

  const updateItem = (index: number, field: keyof ServiceItem, value: any) => {
    const newItems = [...doc.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ items: newItems });
  };

  const addItem = () => {
    onChange({ items: [...doc.items, blankServiceItem()] });
  };

  const removeItem = (index: number) => {
    if (doc.items.length <= 1) return;
    onChange({ items: doc.items.filter((_, i) => i !== index) });
  };

  const cloneItem = (index: number) => {
    const newItems = [...doc.items];
    newItems.splice(index + 1, 0, {
      ...newItems[index],
      id: `it-${Math.round(performance.now() * 1000)}`,
    });
    onChange({ items: newItems });
  };

  const { lines, subtotal, discountTotal, taxableAmount, cgst, sgst, igst, grandTotal, roundOff } = computeInvoice(doc.items, intraState);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* 1. Invoice Details */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">1</span>
          Invoice Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Number</label>
            <input type="text" name="invoiceNumber" value={doc.invoiceNumber || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. INV-001" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Date</label>
            <input type="date" name="invoiceDate" value={doc.invoiceDate || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date</label>
            <input type="date" name="dueDate" value={doc.dueDate || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Reference No.</label>
            <input type="text" name="referenceNo" value={doc.referenceNo || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. REF-2026" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">PO Number</label>
            <input type="text" name="poNumber" value={doc.poNumber || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. PO-9981" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Billing Period</label>
            <input type="text" name="billingPeriod" value={doc.billingPeriod || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. Aug 2026" />
          </div>
        </div>
      </div>

      {/* 2. Customer Details */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">2</span>
          Customer Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Company Name</label>
            <input type="text" name="billToName" value={doc.billToName || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="Customer / Company Name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Person</label>
            <input type="text" name="billToContact" value={doc.billToContact || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="Contact Person Name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input type="email" name="billToEmail" value={doc.billToEmail || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="billing@company.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
            <input type="text" name="billToPhone" value={doc.billToPhone || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="+91 98765 43210" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Billing Address</label>
            <textarea name="billToAddress" value={doc.billToAddress || ''} onChange={updateDoc} readOnly={!canEdit} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none" placeholder="Street Address, Area" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">City</label>
            <input type="text" name="billToCity" value={doc.billToCity || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="City" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">State (Place of Supply)</label>
            <input type="text" name="billToState" value={doc.billToState || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. Maharashtra" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">GSTIN</label>
            <input type="text" name="billToGstin" value={doc.billToGstin || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none font-mono uppercase" placeholder="27AAAAA0000A1Z5" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">PAN</label>
            <input type="text" name="billToPan" value={doc.billToPan || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none font-mono uppercase" placeholder="AAAAA0000A" />
          </div>
        </div>
      </div>

      {/* 3. Items / Services */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">3</span>
            Items / Services
          </h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {doc.items.length} {doc.items.length === 1 ? 'Item' : 'Items'}
          </span>
        </div>

        {/* Item Cards Stack */}
        <div className="space-y-4">
          {doc.items.map((item, index) => {
            const calculatedLine = lines[index] || {};
            const lineGross = calculatedLine.gross || (Number(item.quantity) || 0) * (Number(item.rate) || 0);
            const lineDiscount = calculatedLine.discountAmt || 0;
            const lineTaxable = calculatedLine.taxableValue || (lineGross - lineDiscount);
            const lineTax = calculatedLine.taxAmount || 0;
            const lineTotal = calculatedLine.amount || (lineTaxable + lineTax);

            return (
              <div
                key={item.id || index}
                className="group relative bg-slate-50/70 hover:bg-slate-50 border border-slate-200 hover:border-brand-300 rounded-xl p-4 transition-all shadow-xs space-y-4"
              >
                {/* Item Card Row 1: Header + Product Master Autocomplete + Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
                    <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 font-extrabold text-xs flex items-center justify-center border border-brand-200 shrink-0">
                      #{index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <ProductAutocomplete
                        products={products}
                        selectedProductId={item.productId}
                        selectedProductName={item.name}
                        onSelectProduct={(p) => {
                          if (onSelectProduct) onSelectProduct(index, p);
                        }}
                        onAddNewProduct={() => onAddNewProduct?.(index)}
                        canEdit={canEdit}
                      />
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => cloneItem(index)}
                        title="Duplicate Item"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 hover:text-brand-600 rounded-lg shadow-xs transition-colors"
                      >
                        <Copy size={13} />
                        <span>Duplicate</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={doc.items.length <= 1}
                        title="Remove Item"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 rounded-lg shadow-xs transition-colors"
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Item Card Row 2: Description Inputs */}
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Product / Service Description <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.name || ''}
                      onChange={(e) => updateItem(index, 'name', e.target.value)}
                      readOnly={!canEdit}
                      className="w-full text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-3.5 py-2 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none shadow-xs"
                      placeholder="Enter product or service title..."
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      readOnly={!canEdit}
                      className="w-full text-xs text-slate-600 border border-slate-200 rounded-lg px-3.5 py-2 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      placeholder="Additional description or scope details (optional)"
                    />
                  </div>
                </div>

                {/* Item Card Row 3: Pricing & Tax Parameters Responsive Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">HSN/SAC</label>
                    <input
                      type="text"
                      value={item.hsnSac || ''}
                      onChange={(e) => updateItem(index, 'hsnSac', e.target.value)}
                      readOnly={!canEdit}
                      className="w-full text-xs font-mono font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand-500 outline-none"
                      placeholder="e.g. 9983"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                      readOnly={!canEdit}
                      className="w-full text-xs font-bold border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand-500 outline-none"
                      placeholder="1"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Unit</label>
                    <select
                      value={item.unit || 'Nos'}
                      onChange={(e) => updateItem(index, 'unit', e.target.value)}
                      disabled={!canEdit}
                      className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-brand-500 outline-none cursor-pointer"
                    >
                      <option value="Nos">Nos</option>
                      <option value="Kg">Kg</option>
                      <option value="Hrs">Hrs</option>
                      <option value="Days">Days</option>
                      <option value="Months">Months</option>
                      <option value="Box">Box</option>
                      <option value="Piece">Piece</option>
                      <option value="Meter">Meter</option>
                      <option value="Set">Set</option>
                      <option value="Job">Job</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Rate (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.rate === 0 ? '' : item.rate}
                      onChange={(e) => updateItem(index, 'rate', Number(e.target.value))}
                      readOnly={!canEdit}
                      className="w-full text-xs font-bold border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Discount %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={item.discountPct === 0 ? '' : item.discountPct}
                      onChange={(e) => updateItem(index, 'discountPct', Number(e.target.value))}
                      readOnly={!canEdit}
                      className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand-500 outline-none"
                      placeholder="0%"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">GST Rate</label>
                    <select
                      value={item.taxRate == null ? 18 : item.taxRate}
                      onChange={(e) => updateItem(index, 'taxRate', Number(e.target.value))}
                      disabled={!canEdit}
                      className="w-full text-xs font-bold border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-brand-500 outline-none cursor-pointer"
                    >
                      <option value="0">0% (Nil)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>

                {/* Item Card Row 4: Line Summary Footer */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200/80 text-xs text-slate-600 bg-slate-100/60 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                  <div className="flex flex-wrap items-center gap-4 text-slate-600">
                    <div>Gross: <span className="font-semibold text-slate-900">₹{lineGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                    {lineDiscount > 0 && (
                      <div className="text-amber-700">Disc: <span className="font-semibold">-₹{lineDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                    )}
                    <div>Taxable: <span className="font-semibold text-slate-900">₹{lineTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                    <div>Tax: <span className="font-semibold text-slate-900">₹{lineTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                  <div className="text-right ml-auto">
                    <span className="text-slate-500 font-extrabold uppercase text-[10px] mr-2">Line Total:</span>
                    <span className="font-extrabold text-brand-700 text-sm">₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Plus size={15} />}
              onClick={addItem}
              className="text-brand-600 border-brand-200 bg-brand-50 hover:bg-brand-100 font-semibold w-full sm:w-auto px-4 py-2"
            >
              + Add Item
            </Button>
          </div>
        )}
      </div>

      {/* 4. Tax & Discount Summary */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">4</span>
          Invoice Summary
        </h3>

        <div className="flex flex-col gap-2.5 max-w-sm ml-auto text-xs">
          <div className="flex justify-between text-slate-600 font-medium">
            <span>Subtotal (Gross)</span>
            <span className="font-semibold text-slate-800">₹ {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>

          {discountTotal > 0 && (
            <div className="flex justify-between text-amber-700 font-medium">
              <span>Total Item Discount</span>
              <span>- ₹ {discountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-700 font-semibold border-t border-slate-100 pt-2">
            <span>Taxable Amount</span>
            <span>₹ {taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>

          {intraState ? (
            <>
              {cgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>CGST</span>
                  <span className="font-medium text-slate-800">₹ {cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {sgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>SGST</span>
                  <span className="font-medium text-slate-800">₹ {sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {igst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>IGST</span>
                  <span className="font-medium text-slate-800">₹ {igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </>
          )}

          {roundOff !== 0 && (
            <div className="flex justify-between text-slate-500 italic">
              <span>Round Off</span>
              <span>₹ {roundOff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="flex justify-between items-center bg-brand-50/70 border border-brand-200 rounded-xl p-3.5 mt-2">
            <span className="font-bold text-slate-800 text-sm">Grand Total</span>
            <span className="font-black text-brand-700 text-base">₹ {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* 5. Payment Details */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">5</span>
          Payment Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Terms</label>
            <input type="text" name="paymentTerms" value={doc.paymentTerms || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. Net 30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">UPI ID</label>
            <input type="text" name="upiId" value={doc.upiId || ''} onChange={updateDoc} readOnly={!canEdit} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" placeholder="merchant@upi" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Bank Details</label>
            <textarea name="bankDetails" value={doc.bankDetails || ''} onChange={updateDoc} readOnly={!canEdit} rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none" placeholder="Bank Name, Account Number, IFSC..." />
          </div>
        </div>
      </div>

      {/* 6. Notes & Terms */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">6</span>
          Notes &amp; Terms
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes to Customer</label>
            <textarea name="notes" value={doc.notes || ''} onChange={updateDoc} readOnly={!canEdit} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none" placeholder="Thank you for your business!" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Terms &amp; Conditions</label>
            <textarea name="termsConditions" value={doc.termsConditions || ''} onChange={updateDoc} readOnly={!canEdit} rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none" placeholder="Payment terms and conditions..." />
          </div>
        </div>
      </div>
    </div>
  );
};
