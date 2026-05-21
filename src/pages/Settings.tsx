import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import { Building2, Palette, BadgeCent, CheckCircle2 } from 'lucide-react';
import { type Company, type Role } from '../data/mockData';
import {
  validatePhone,
  validateEmail,
  validateCompanyName,
  validatePercentage
} from '../utils/validation';

interface SettingsProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  onUpdateCompanies: (companies: Company[]) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  role,
  activeCompanyId,
  companies,
  onUpdateCompanies
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'payroll' | 'branding'>('profile');
  
  // Find current company context
  const currentCompany = companies.find(c => c.id === activeCompanyId) || companies[0];

  // Split phone format "+91 9876543210" securely
  const getPhoneParts = () => {
    const parts = (currentCompany.phone || '+91 ').split(' ');
    return {
      code: parts[0] || '+91',
      num: parts[1] || '',
    };
  };

  const initialPhone = getPhoneParts();

  // Forms state synced with companies props
  const [profileForm, setProfileForm] = useState({
    name: currentCompany.name,
    email: currentCompany.email || '',
    address: currentCompany.address || '',
    industry: currentCompany.industry,
  });

  const [phoneCode, setPhoneCode] = useState(initialPhone.code);
  const [phoneNum, setPhoneNum] = useState(initialPhone.num);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [payrollForm, setPayrollForm] = useState({
    pfRate: currentCompany.pfRate.toString(),
    esicRate: currentCompany.esicRate.toString(),
    basicPercent: currentCompany.basicPercent.toString(),
    overtimeRate: currentCompany.overtimeRate.toString(),
    profTaxRate: currentCompany.profTaxRate.toString(),
  });

  const [brandingForm, setBrandingForm] = useState({
    logoText: currentCompany.logo,
    primaryColor: currentCompany.primaryColor || '#3b82f6',
    headerText: currentCompany.headerText || '',
    footerText: currentCompany.footerText || '',
    signatureText: currentCompany.signatureText || '',
    themeStyle: currentCompany.themeStyle || 'Modern',
  });

  // Re-sync states when activeCompanyId or company list updates
  useEffect(() => {
    const parts = (currentCompany.phone || '+91 ').split(' ');
    setProfileForm({
      name: currentCompany.name,
      email: currentCompany.email || '',
      address: currentCompany.address || '',
      industry: currentCompany.industry,
    });
    setPhoneCode(parts[0] || '+91');
    setPhoneNum(parts[1] || '');
    setErrors({});

    setPayrollForm({
      pfRate: currentCompany.pfRate.toString(),
      esicRate: currentCompany.esicRate.toString(),
      basicPercent: currentCompany.basicPercent.toString(),
      overtimeRate: currentCompany.overtimeRate.toString(),
      profTaxRate: currentCompany.profTaxRate.toString(),
    });
    setBrandingForm({
      logoText: currentCompany.logo,
      primaryColor: currentCompany.primaryColor || '#3b82f6',
      headerText: currentCompany.headerText || '',
      footerText: currentCompany.footerText || '',
      signatureText: currentCompany.signatureText || '',
      themeStyle: currentCompany.themeStyle || 'Modern',
    });
  }, [activeCompanyId, currentCompany]);

  const handleSaveAll = () => {
    if (role !== 'Super Admin' && role !== 'Company Head') {
      alert('Error: HR operators are not authorized to edit settings.');
      return;
    }

    const nameErr = validateCompanyName(profileForm.name).error;
    const emailErr = validateEmail(profileForm.email).error;
    const phoneErr = validatePhone(phoneNum).error;
    const pfErr = validatePercentage(payrollForm.pfRate, 'PF Rate').error;
    const esicErr = validatePercentage(payrollForm.esicRate, 'ESIC Rate').error;
    const basicErr = validatePercentage(payrollForm.basicPercent, 'Basic Salary Percentage').error;

    if (nameErr || emailErr || phoneErr || pfErr || esicErr || basicErr || !profileForm.address) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }

    const updatedCompanies = companies.map(c => {
      if (c.id === currentCompany.id) {
        return {
          ...c,
          name: profileForm.name,
          phone: `${phoneCode} ${phoneNum}`,
          email: profileForm.email,
          address: profileForm.address,
          industry: profileForm.industry,

          // Payroll settings
          pfRate: parseFloat(payrollForm.pfRate) || 12,
          esicRate: parseFloat(payrollForm.esicRate) || 3.25,
          basicPercent: parseFloat(payrollForm.basicPercent) || 50,
          overtimeRate: parseFloat(payrollForm.overtimeRate) || 1.5,
          profTaxRate: parseFloat(payrollForm.profTaxRate) || 200,

          // Branding settings
          logo: brandingForm.logoText,
          primaryColor: brandingForm.primaryColor,
          headerText: brandingForm.headerText,
          footerText: brandingForm.footerText,
          signatureText: brandingForm.signatureText,
          themeStyle: brandingForm.themeStyle as any,
        };
      }
      return c;
    });

    onUpdateCompanies(updatedCompanies);
    alert('Company statutory profiles, templates, and branding configurations updated successfully! Changes immediately active.');
  };

  const handleColorPreset = (hex: string) => {
    setBrandingForm({ ...brandingForm, primaryColor: hex });
  };

  const isSuperOrHead = role === 'Super Admin' || role === 'Company Head';

  const isSaveDisabled =
    !profileForm.name ||
    !profileForm.email ||
    !phoneNum ||
    !profileForm.address ||
    !payrollForm.pfRate ||
    !payrollForm.esicRate ||
    !payrollForm.basicPercent ||
    Object.values(errors).some(err => !!err);

  return (
    <div className="space-y-4 font-sans">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Branding, Policy & Settings Hub</h2>
        <p className="text-xs text-gray-500 mt-0.5">Customize corporate profile details, statutory tax percentages, color templates, and signature policies</p>
      </div>

      {/* Sub Tabs menu */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'profile' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Building2 size={13} />
          Company Profile Settings
        </button>
        <button
          onClick={() => setActiveSubTab('payroll')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <BadgeCent size={13} />
          Statutory Payroll Rules
        </button>
        <button
          onClick={() => setActiveSubTab('branding')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeSubTab === 'branding' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Palette size={13} />
          Branding & Template Cust
        </button>
      </div>

      {/* Layout panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Dynamic Editor Panel */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* TAB 1: Profile */}
          {activeSubTab === 'profile' && (
            <Card>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-1.5 border-b border-gray-100">
                Corporate Address & Details
              </h3>
              <div className="space-y-3">
                <Input
                  label="Registered Corporate Name *"
                  disabled={!isSuperOrHead}
                  value={profileForm.name}
                  onChange={e => {
                    const clean = e.target.value.replace(/[^a-zA-Z0-9\s&.]/g, '');
                    setProfileForm({ ...profileForm, name: clean });
                    setErrors(prev => ({ ...prev, name: validateCompanyName(clean).error }));
                  }}
                  error={errors.name}
                  success={profileForm.name !== '' && !errors.name}
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <Input
                    label="Official Support Email *"
                    disabled={!isSuperOrHead}
                    value={profileForm.email}
                    onChange={e => {
                      const val = e.target.value;
                      setProfileForm({ ...profileForm, email: val });
                      setErrors(prev => ({ ...prev, email: validateEmail(val).error }));
                    }}
                    error={errors.email}
                    success={profileForm.email !== '' && !errors.email}
                  />

                  <PhoneInput
                    label="Office Mobile Number *"
                    disabled={!isSuperOrHead}
                    countryCode={phoneCode}
                    mobileNumber={phoneNum}
                    onChangeCountry={code => {
                      setPhoneCode(code);
                      const err = validatePhone(phoneNum, code).error;
                      setErrors(prevErrors => ({ ...prevErrors, phoneNum: err }));
                    }}
                    onChangeNumber={num => {
                      setPhoneNum(num);
                      const err = validatePhone(num, phoneCode).error;
                      setErrors(prevErrors => ({ ...prevErrors, phoneNum: err }));
                    }}
                    error={errors.phoneNum}
                    success={phoneNum !== '' && !errors.phoneNum}
                  />
                </div>

                <Textarea
                  label="Corporate HQ Full Address *"
                  disabled={!isSuperOrHead}
                  placeholder="Street, City, State, ZIP..."
                  value={profileForm.address}
                  onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                />
                <Select
                  label="Industry Sector"
                  disabled={!isSuperOrHead}
                  value={profileForm.industry}
                  onChange={e => setProfileForm({ ...profileForm, industry: e.target.value })}
                  options={[
                    { value: 'Technology', label: 'Technology / Software' },
                    { value: 'Finance', label: 'Finance & Banking' },
                    { value: 'Healthcare', label: 'Healthcare' },
                    { value: 'Construction', label: 'Construction' },
                    { value: 'Automotive', label: 'Automotive' }
                  ]}
                />
              </div>
            </Card>
          )}

          {/* TAB 2: Payroll Settings */}
          {activeSubTab === 'payroll' && (
            <Card>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-1.5 border-b border-gray-100">
                Statutory Payroll Allocations
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-left">
                  <Input
                    label="Provident Fund (PF) Contribution (%) *"
                    disabled={!isSuperOrHead}
                    value={payrollForm.pfRate}
                    onChange={e => {
                      const clean = e.target.value.replace(/[^\d.]/g, '');
                      setPayrollForm({ ...payrollForm, pfRate: clean });
                      setErrors(prev => ({ ...prev, pfRate: validatePercentage(clean, 'PF Rate').error }));
                    }}
                    error={errors.pfRate}
                    success={payrollForm.pfRate !== '' && !errors.pfRate}
                  />
                  <Input
                    label="ESIC Taxation Rate (%) *"
                    disabled={!isSuperOrHead}
                    value={payrollForm.esicRate}
                    onChange={e => {
                      const clean = e.target.value.replace(/[^\d.]/g, '');
                      setPayrollForm({ ...payrollForm, esicRate: clean });
                      setErrors(prev => ({ ...prev, esicRate: validatePercentage(clean, 'ESIC Rate').error }));
                    }}
                    error={errors.esicRate}
                    success={payrollForm.esicRate !== '' && !errors.esicRate}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  <Input
                    label="Basic Salary CTC Percentage (%) *"
                    disabled={!isSuperOrHead}
                    value={payrollForm.basicPercent}
                    onChange={e => {
                      const clean = e.target.value.replace(/[^\d.]/g, '');
                      setPayrollForm({ ...payrollForm, basicPercent: clean });
                      setErrors(prev => ({ ...prev, basicPercent: validatePercentage(clean, 'Basic Salary Percentage').error }));
                    }}
                    error={errors.basicPercent}
                    success={payrollForm.basicPercent !== '' && !errors.basicPercent}
                  />
                  <Input
                    label="Professional Tax Rate (INR) *"
                    disabled={!isSuperOrHead}
                    type="number"
                    value={payrollForm.profTaxRate}
                    onChange={e => setPayrollForm({ ...payrollForm, profTaxRate: e.target.value })}
                  />
                </div>

                <Input
                  label="Overtime Hourly Multiplier (e.g. 1.5x) *"
                  disabled={!isSuperOrHead}
                  type="number"
                  step="0.1"
                  value={payrollForm.overtimeRate}
                  onChange={e => setPayrollForm({ ...payrollForm, overtimeRate: e.target.value })}
                />
              </div>
            </Card>
          )}

          {/* TAB 3: Branding & Templates */}
          {activeSubTab === 'branding' && (
            <Card>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-1.5 border-b border-gray-100">
                Company Branding & Template Customization
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Company Logo Identifier *"
                    disabled={!isSuperOrHead}
                    placeholder="e.g. TN (Max 3 letters)"
                    value={brandingForm.logoText}
                    onChange={e => setBrandingForm({ ...brandingForm, logoText: e.target.value.toUpperCase().slice(0, 3) })}
                  />
                  <Select
                    label="Document Theme Layout"
                    disabled={!isSuperOrHead}
                    value={brandingForm.themeStyle}
                    onChange={e => setBrandingForm({ ...brandingForm, themeStyle: e.target.value as any })}
                    options={[
                      { value: 'Modern', label: 'Modern (Minimal Border)' },
                      { value: 'Classic', label: 'Classic (Formal Columns)' },
                      { value: 'Elegant', label: 'Elegant (Double Header Bar)' },
                      { value: 'Minimalist', label: 'Minimalist (Clean Page)' }
                    ]}
                  />
                </div>

                {/* Brand color presets */}
                {isSuperOrHead && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Branding Primary Color Preset *</label>
                    <div className="flex flex-wrap gap-2.5 items-center">
                      <button onClick={() => handleColorPreset('#3b82f6')} type="button" className="w-6 h-6 bg-blue-500 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Vibrant Blue" />
                      <button onClick={() => handleColorPreset('#0f766e')} type="button" className="w-6 h-6 bg-teal-700 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Financial Teal" />
                      <button onClick={() => handleColorPreset('#65a30d')} type="button" className="w-6 h-6 bg-lime-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Medicare Green" />
                      <button onClick={() => handleColorPreset('#ea580c')} type="button" className="w-6 h-6 bg-orange-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Construct Orange" />
                      <button onClick={() => handleColorPreset('#e11d48')} type="button" className="w-6 h-6 bg-rose-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Automotive Rose" />
                      <button onClick={() => handleColorPreset('#4f46e5')} type="button" className="w-6 h-6 bg-indigo-600 rounded border border-white shadow-sm hover:scale-105 transition-transform" title="Deep Indigo" />
                      
                      <div className="ml-2 flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">Or Hex:</span>
                        <input
                          type="text"
                          value={brandingForm.primaryColor}
                          onChange={e => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                          className="w-20 px-1 py-0.5 border text-xs font-mono rounded"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <Input
                  label="Document Header Corporate Text *"
                  disabled={!isSuperOrHead}
                  placeholder="e.g. TECHNOVA SOLUTIONS PRIVATE LIMITED"
                  value={brandingForm.headerText}
                  onChange={e => setBrandingForm({ ...brandingForm, headerText: e.target.value })}
                />

                <Textarea
                  label="Document Footer Corporate Text *"
                  disabled={!isSuperOrHead}
                  placeholder="TechNova Towers, Delhi · Confidential Document · www.technova.in"
                  value={brandingForm.footerText}
                  onChange={e => setBrandingForm({ ...brandingForm, footerText: e.target.value })}
                />

                <Input
                  label="Legal Signature Line Text *"
                  disabled={!isSuperOrHead}
                  placeholder="e.g. Vikram Singh, Operations Director"
                  value={brandingForm.signatureText}
                  onChange={e => setBrandingForm({ ...brandingForm, signatureText: e.target.value })}
                />
              </div>
            </Card>
          )}

          {/* Action Trigger */}
          {isSuperOrHead && (
            <div className="pt-2">
              <Button onClick={handleSaveAll} disabled={isSaveDisabled} className="w-full">
                Apply Company Statutory & Branding Settings
              </Button>
            </div>
          )}

        </div>

        {/* Live dynamic preview widget */}
        <Card>
          <div className="flex items-center gap-1 mb-3 pb-1.5 border-b border-gray-100">
            <Palette size={14} className="text-gray-400" />
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Live Document Brand Preview</h4>
          </div>

          <div className="border rounded p-3.5 space-y-4 bg-white shadow-inner font-sans text-xs">
            
            {/* Headerpreview */}
            <div className="border-b pb-2 flex items-center justify-between" style={{ borderBottomColor: brandingForm.primaryColor, borderBottomWidth: '2px' }}>
              <div>
                <p className="font-extrabold text-[10px] leading-tight" style={{ color: brandingForm.primaryColor }}>
                  {brandingForm.headerText || profileForm.name}
                </p>
                <p className="text-[8px] text-gray-400 mt-0.5">{profileForm.address || 'Company Address'}</p>
                <p className="text-[8px] text-gray-400 mt-0.5">Phone: {phoneCode} {phoneNum} · Email: {profileForm.email}</p>
              </div>
              <div className="w-7 h-7 rounded text-white flex items-center justify-center font-bold text-[10px]" style={{ backgroundColor: brandingForm.primaryColor }}>
                {brandingForm.logoText}
              </div>
            </div>

            {/* Letter sample content */}
            <div className="space-y-2 py-1 text-gray-700">
              <p className="font-bold text-[9px] uppercase tracking-wider text-slate-800">SUBJECT: LETTER OF ENGAGEMENT</p>
              <p className="text-[9px] leading-relaxed">
                We are pleased to appoint you under the branding guidelines of <strong>{profileForm.name}</strong>. Your base corporate taxes have been aligned with statutory <strong>PF: {payrollForm.pfRate}%</strong> and <strong>ESIC: {payrollForm.esicRate}%</strong> formulas.
              </p>
            </div>

            {/* Sign off and footer */}
            <div className="pt-2 border-t border-gray-55 flex items-end justify-between text-[8px]">
              <div>
                <p className="font-bold text-gray-800">For {profileForm.name}</p>
                <p className="text-gray-400 mt-2">Authorized Signatory</p>
                <p className="text-gray-500 font-medium italic mt-0.5">{brandingForm.signatureText || 'Signatory Designation'}</p>
              </div>
              <div className="text-[7px] text-gray-300 font-mono text-right max-w-40 leading-normal">
                {brandingForm.footerText || 'Company Footer Lines'}
              </div>
            </div>

          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-blue-805 text-[10px] leading-relaxed flex items-start gap-1.5">
            <CheckCircle2 size={13} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p>
              Branding guidelines are fully dynamic. Saving will immediately restyle all Offer Letters, relievings, and employee Payslips!
            </p>
          </div>
        </Card>

      </div>
    </div>
  );
};
