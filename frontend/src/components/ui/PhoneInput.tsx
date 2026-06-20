import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import { countries, favoriteCountryCodes } from '@/data/countries';
import { Search, ChevronDown } from 'lucide-react';

interface PhoneInputProps {
  label?: string;
  countryCode: string;
  mobileNumber: string;
  error?: string;
  success?: boolean;
  onChangeCountry: (code: string) => void;
  onChangeNumber: (num: string) => void;
  disabled?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  countryCode,
  mobileNumber,
  error,
  success,
  onChangeCountry,
  onChangeNumber,
  disabled
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto detect timezone country
  const autoDetectCountry = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.includes('Kolkata') || tz.includes('India')) return '+91';
      if (tz.includes('London')) return '+44';
      if (tz.includes('Sydney') || tz.includes('Melbourne')) return '+61';
      if (tz.includes('Paris')) return '+33';
      if (tz.includes('Berlin')) return '+49';
      if (tz.includes('Singapore')) return '+65';
      if (tz.includes('Dubai')) return '+971';
      if (tz.includes('America')) return '+1';
    } catch (e) {}
    return '+91';
  };

  useEffect(() => {
    if (!countryCode) {
      onChangeCountry(autoDetectCountry());
    }
  }, [countryCode]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const activeDial = countryCode.split(' ')[0].trim();
  const activeCountry = countries.find(c => c.dialCode === activeDial) || countries[0];

  // Filter countries
  const filtered = countries.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.dialCode.includes(searchQuery) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get favorites
  const favorites = countries.filter(c => favoriteCountryCodes.includes(c.code));
  const filteredFavorites = favorites.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.dialCode.includes(searchQuery) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Consolidated items for keyboard navigation
  const listItems = [...filteredFavorites, ...filtered];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      setHighlightedIndex(prev => (prev + 1) % listItems.length);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedIndex(prev => (prev - 1 + listItems.length) % listItems.length);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (listItems[highlightedIndex]) {
        onChangeCountry(listItems[highlightedIndex].dialCode);
        setIsOpen(false);
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      e.preventDefault();
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^\d]/g, '');
    const limit = activeCountry?.maxLength || 15;
    if (clean.length <= limit) {
      onChangeNumber(clean);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full text-left font-sans" ref={containerRef}>
      {label && <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>}
      <div className={cn(
        "flex items-center rounded-xl border border-gray-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-visible relative transition-all duration-200",
        error && "border-red-400 focus-within:ring-red-500 focus-within:border-red-500",
        success && !error && "border-emerald-500 focus-within:ring-emerald-500 focus-within:border-emerald-500",
        disabled && "bg-gray-50 text-gray-500 cursor-not-allowed"
      )}>
        {/* Custom searchable trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setIsOpen(prev => !prev); setSearchQuery(''); setHighlightedIndex(0); }}
          onKeyDown={handleKeyDown}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-700 bg-transparent hover:bg-gray-50 rounded-l-xl select-none outline-none border-none cursor-pointer h-full transition-colors flex-shrink-0"
        >
          <span className="text-base leading-none select-none">{activeCountry?.flag}</span>
          <span className="font-semibold text-gray-800 leading-none">{activeCountry?.dialCode}</span>
          <ChevronDown size={14} className="text-gray-400 leading-none animate-in fade-in" />
        </button>

        {/* Separator */}
        <span className="text-gray-200 select-none">|</span>

        {/* Number entry */}
        <input
          type="text"
          value={mobileNumber}
          onChange={handleNumberChange}
          disabled={disabled}
          placeholder={activeCountry?.placeholder || '98765 43210'}
          maxLength={activeCountry?.maxLength || 15}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none border-none focus:ring-0 focus:outline-none"
        />

        {/* Floating Dropdown Card */}
        {isOpen && (
          <div className="absolute left-0 top-[102%] w-72 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-xl z-[999] flex flex-col overflow-hidden max-h-[340px] animate-in fade-in duration-200">
            {/* Search Input Bar */}
            <div className="flex items-center gap-2 p-2 border-b border-gray-100 bg-gray-50/50">
              <Search size={14} className="text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setHighlightedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search country name or code..."
                className="w-full bg-transparent text-xs text-gray-900 border-none outline-none focus:ring-0"
              />
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto py-1 divide-y divide-gray-50">
              {/* Pinned favorites header */}
              {filteredFavorites.length > 0 && searchQuery === '' && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/30">Favorites</div>
                  {filteredFavorites.map((c, i) => {
                    const isSelected = activeCountry.code === c.code;
                    const isHighlighted = highlightedIndex === i;
                    return (
                      <button
                        key={`fav-${c.code}`}
                        type="button"
                        onClick={() => { onChangeCountry(c.dialCode); setIsOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left border-none outline-none bg-transparent cursor-pointer",
                          isHighlighted && "bg-gray-100",
                          isSelected && "bg-blue-50 text-blue-800 font-semibold"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-sm select-none">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <span className="text-gray-400 font-mono text-[11px]">{c.dialCode}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* All countries */}
              <div>
                {searchQuery === '' && <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/30">All Countries</div>}
                {filtered.length === 0 && filteredFavorites.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-gray-400">No countries found</div>
                ) : (
                  filtered.map((c, i) => {
                    const absoluteIndex = filteredFavorites.length + i;
                    const isSelected = activeCountry.code === c.code;
                    const isHighlighted = highlightedIndex === absoluteIndex;
                    return (
                      <button
                        key={`all-${c.code}`}
                        type="button"
                        onClick={() => { onChangeCountry(c.dialCode); setIsOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left border-none outline-none bg-transparent cursor-pointer",
                          isHighlighted && "bg-gray-100",
                          isSelected && "bg-blue-50 text-blue-800 font-semibold"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-sm select-none">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <span className="text-gray-400 font-mono text-[11px]">{c.dialCode}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-[10px] text-red-655 text-red-600 font-medium pl-0.5 mt-0.5">{error}</p>}
    </div>
  );
};
