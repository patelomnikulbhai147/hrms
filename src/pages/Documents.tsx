import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, FileText,
  Award,
  Plus, Edit, Trash2, ZoomIn, ZoomOut, Sparkles, Sliders, Palette, Printer,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, Table2, User, Landmark, Tag, Info,
  Upload, Check, ShieldCheck, ChevronLeft, ChevronRight, Eye
} from 'lucide-react';
import {
  type Employee,
  type Document,
  type Role,
  type Company,
  isCompanyIdMatch
} from '../types';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { getUniqueEmployees, getUniqueRecords } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';
interface DocumentsProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  documents: Document[];
  onUpdateDocuments: (documents: Document[]) => void;
  employees: Employee[];
}

interface DocumentTemplate {
  id: string;
  templateName: string;
  category: 'Corporate Offer Letter' | 'Startup Offer Letter' | 'Internship Offer Letter' | 'Experience Letter' | 'Joining Letter' | 'Relieving Letter' | 'Payslip Template';
  subject: string;
  body: string;
  companyId: string;
  branding?: {
    companyName: string;
    primaryColor: string;
    logoText: string;
    signatureText: string;
    footerText: string;
    watermark: string;
  };
  createdAt: string;
}

// Map template categories to friendly human names for display
const FRIENDLY_CATEGORIES: Record<DocumentTemplate['category'], string> = {
  'Corporate Offer Letter': 'Corporate Offer',
  'Startup Offer Letter': 'Startup Offer',
  'Internship Offer Letter': 'Internship Offer',
  'Experience Letter': 'Experience Letter',
  'Joining Letter': 'Joining Letter',
  'Relieving Letter': 'Relieving Letter',
  'Payslip Template': 'Payslip Template'
};

const getInitialTemplates = (companyId: string, companyName: string): DocumentTemplate[] => {
  return [
    {
      id: 'offer-corp',
      templateName: 'Standard Corporate Layout',
      category: 'Corporate Offer Letter',
      subject: 'Employment Offer Letter',
      body: `<p>Dear <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span>,</p><p>We are delighted to extend an offer of employment to join our professional team as <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="designation" contenteditable="false">👤 Designation</span> inside the <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="department" contenteditable="false">👤 Department</span> division at <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>.</p><p>Key package details:</p><ul><li>Effective Joining Date: <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="joining_date" contenteditable="false">👤 Joining Date</span></li><li>Base Salary Payout: INR <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="salary" contenteditable="false">👤 Salary</span> per annum</li></ul><p>We are confident your skills and background will contribute significantly to our operations. Welcome aboard!</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#3b82f6',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'Authorized HR Operations Signatory',
        footerText: `${companyName} · Confidential Corporate Document`,
        watermark: 'OFFER'
      }
    },
    {
      id: 'offer-start',
      templateName: 'Vibrant Startup Design',
      category: 'Startup Offer Letter',
      subject: 'Welcome to the Team! Offer for {{designation}}',
      body: `<p>Hey <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span>,</p><p>We loved your energy, tech skills, and culture fit. We are thrilled to officially offer you the role of <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="designation" contenteditable="false">👤 Designation</span> within our hyper-growth <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="department" contenteditable="false">👤 Department</span> squad at <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>!</p><p>Details of your rocketship assignment:</p><ul><li>Launch Day: <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="joining_date" contenteditable="false">👤 Joining Date</span></li><li>Base Pay Package: INR <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="salary" contenteditable="false">👤 Salary</span> per annum</li></ul><p>Let's make history and build amazing experiences together!</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#10b981',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'The Founders Crew',
        footerText: `${companyName} Hub · Built for builders`,
        watermark: 'WELCOME'
      }
    },
    {
      id: 'offer-intern',
      templateName: 'Internship Onboarding',
      category: 'Internship Offer Letter',
      subject: 'Offer of Internship Training Program',
      body: `<p>Dear <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span>,</p><p>We are pleased to offer you an Internship assignment as a Software Trainee in the <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="department" contenteditable="false">👤 Department</span> division at <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>.</p><p>Internship terms:</p><ul><li>Start Date: <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="joining_date" contenteditable="false">👤 Joining Date</span></li><li>Monthly Training Stipend: INR <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="salary" contenteditable="false">👤 Salary</span></li></ul><p>We look forward to providing a highly rewarding learning environment to kickstart your career.</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#8b5cf6',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'Academic Relations Lead',
        footerText: `${companyName} Training & Placement Academy`,
        watermark: 'INTERNSHIP'
      }
    },
    {
      id: 'exp-cert',
      templateName: 'Standard Work Experience',
      category: 'Experience Letter',
      subject: 'To Whom It May Concern - Professional Experience Record',
      body: `<p>This certifies that <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span> was employed with <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span> as a <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="designation" contenteditable="false">👤 Designation</span> in the <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="department" contenteditable="false">👤 Department</span> division from <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="joining_date" contenteditable="false">👤 Joining Date</span> onwards.</p><p>During their tenure of service, we found them to be diligent, hard-working, and highly cooperative in team projects. We recommend them highly for future opportunities.</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#3b82f6',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'Head of Human Resources',
        footerText: `${companyName} Corporate Employment Records`,
        watermark: 'EXPERIENCE'
      }
    },
    {
      id: 'join-formal',
      templateName: 'Official Onboarding Confirmation',
      category: 'Joining Letter',
      subject: 'Confirmation of Joining & Reporting Instructions',
      body: `<p>Dear <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span>,</p><p>We formally welcome you to the corporate offices of <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>. We confirm that you have reported for duty in the role of <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="designation" contenteditable="false">👤 Designation</span> within the <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="department" contenteditable="false">👤 Department</span> team on <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="joining_date" contenteditable="false">👤 Joining Date</span>.</p><p>Please coordinate with Onboarding IT to setup your secure cloud network profiles. We look forward to achieving great things together.</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#3b82f6',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'VP of Talent Operations',
        footerText: `${companyName} Onboarding Suite`,
        watermark: 'JOINED'
      }
    },
    {
      id: 'relieve-combined',
      templateName: 'Service Relieving Order',
      category: 'Relieving Letter',
      subject: 'Relieving Order and Acceptance of Resignation',
      body: `<p>Dear <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span>,</p><p>This is in reference to your resignation from the services of <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>. We accept your resignation and confirm that you are officially relieved from your duties as <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="designation" contenteditable="false">👤 Designation</span> effective immediately.</p><p>We thank you for your contributions during your tenure, which began on <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="joining_date" contenteditable="false">👤 Joining Date</span>, and wish you success in your future career endeavors.</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#f59e0b',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'Vice President of HR',
        footerText: `${companyName} Employee Registry`,
        watermark: 'RELIEVED'
      }
    },
    {
      id: 'slip-std',
      templateName: 'Structured Corporate Payslip',
      category: 'Payslip Template',
      subject: 'Monthly Pay Statement',
      body: `<p>Monthly Statement for <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span> serving as <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="designation" contenteditable="false">👤 Designation</span> at <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>.</p><p>Gross compensation is structured on the active corporate payroll tables below. For inquiries, email <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_email" contenteditable="false">👤 Company Email</span>.</p>`,
      companyId,
      createdAt: new Date().toISOString().split('T')[0],
      branding: {
        companyName: companyName,
        primaryColor: '#3b82f6',
        logoText: companyName.slice(0, 2).toUpperCase(),
        signatureText: 'Payroll Specialist',
        footerText: `${companyName} Accounts & Auditing Department`,
        watermark: 'PAID'
      }
    }
  ];
};

export const Documents: React.FC<DocumentsProps> = ({
  role,
  activeCompanyId,
  companies,
  documents,
  onUpdateDocuments,
  employees
}) => {
  const [activeTab, setActiveTab] = useState<'compliance' | 'letters'>('compliance');

  // Scoped lists derived reactively (supports parent company branch rollups)
  const uniqueEmployees = getUniqueEmployees(employees);
  const companyEmployees = uniqueEmployees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId));
  const uniqueDocuments = getUniqueRecords(documents, [d => d.id]); // Documents have unique IDs but might be duplicated in state
  const list = uniqueDocuments.filter(d => {
    // Fallback: If employee exists in companyEmployees, it's a guaranteed match
    if (companyEmployees.some(e => e.id === d.employeeId || e.employeeId === d.employeeId)) return true;

    const emp = uniqueEmployees.find(e => e.id === d.employeeId || e.employeeId === d.employeeId);
    return isCompanyIdMatch(d.companyId, activeCompanyId, companies, emp?.branchLocation, emp?.branchId);
  });
  const currentCompany = companies.find(c => c.id === activeCompanyId) || { name: 'Company Name' } as any;

  // Failsafe fetch if list is 0 but we know this branch should have employees
  useEffect(() => {
    if (list.length === 0 && companyEmployees.length > 0 && activeCompanyId) {
      console.log('Failsafe fetching documents for:', activeCompanyId);
      const token = localStorage.getItem('hrms_token');
      if (!token) return;
      fetch(`/api/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-workspace-id': activeCompanyId,
          'Content-Type': 'application/json'
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          onUpdateDocuments([...documents.filter(d => d.companyId !== activeCompanyId), ...data]);
        }
      })
      .catch(err => console.error('Failsafe fetch failed:', err));
    }
  }, [list.length, companyEmployees.length, activeCompanyId]);

  // Compliance state
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [uploadForm, setUploadForm] = useState({
    name: '',
    type: 'Aadhaar' as Document['type'],
  });

  const { canEdit: canEditModule, canCreate: canCreateModule, canDelete: canDeleteModule } = usePermissions();
  const canEdit = canEditModule('documents');
  const canCreate = canCreateModule('documents');
  const canDelete = canDeleteModule('documents');

  // Local compliance override & filtering states
  const [selectedReviewEmp, setSelectedReviewEmp] = useState<Employee | null>(null);

  // Dossier list redesigned states
  const [dossierSearch, setDossierSearch] = useState('');
  const [dossierStatusFilter, setDossierStatusFilter] = useState<'' | 'Verified' | 'Pending Documents' | 'Missing Audit' | 'Under Review'>('');
  const [dossierPage, setDossierPage] = useState(1);
  const dossierItemsPerPage = 10;

  // Quick verify helper
  const handleQuickVerify = async (empId: string) => {
    const updatedPromises = documents.map(async d => {
      if (d.employeeId === empId && d.status === 'Pending') {
        const u = { ...d, status: 'Verified' as const }; return await api.documents.update(d.id, u).catch(()=>u);
      }
      return d;
    });
    const updated = await Promise.all(updatedPromises); onUpdateDocuments(updated);
    alert(`All pending documents for this employee have been audited as Verified.`);
  };

  // Compute dossier records reactively
  const dossiers = useMemo(() => {
    return companyEmployees.map(emp => {
      const empDocs = list.filter(d => d.employeeId === emp.id);
      const primaryCount = (emp.aadhaarUpload ? 1 : 0) + (emp.panUpload ? 1 : 0) + (emp.photoUpload ? 1 : 0);
      const totalDocs = primaryCount + empDocs.length;
      
      let status: 'Verified' | 'Pending Documents' | 'Missing Audit' | 'Under Review' = 'Missing Audit';
      
      const allVaultVerified = empDocs.length > 0 && empDocs.every(d => d.status === 'Verified');
      const anyVaultPending = empDocs.some(d => d.status === 'Pending');
      const anyVaultRejected = empDocs.some(d => d.status === 'Rejected');
      
      if (totalDocs === 0) {
        status = 'Missing Audit';
      } else if (anyVaultPending) {
        status = 'Under Review';
      } else if (primaryCount > 0 && empDocs.length === 0) {
        status = 'Pending Documents';
      } else if (allVaultVerified) {
        status = 'Verified';
      } else if (anyVaultRejected) {
        status = 'Pending Documents';
      } else {
        status = 'Pending Documents';
      }

      let lastUpdated = emp.joinDate || '—';
      if (empDocs.length > 0) {
        const sortedDocs = [...empDocs].sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
        lastUpdated = sortedDocs[0].uploadedOn;
      }
      
      return {
        emp,
        totalDocs,
        status,
        lastUpdated,
        empDocs
      };
    });
  }, [companyEmployees, list]);

  const filteredDossiers = useMemo(() => {
    return dossiers.filter(d => {
      const q = dossierSearch.toLowerCase();
      const matchSearch = !q ||
        d.emp.name.toLowerCase().includes(q) ||
        d.emp.employeeId.toLowerCase().includes(q) ||
        (d.emp.designation || '').toLowerCase().includes(q) ||
        (d.emp.department || '').toLowerCase().includes(q);
      
      const matchStatus = !dossierStatusFilter || d.status === dossierStatusFilter;
      
      return matchSearch && matchStatus;
    });
  }, [dossiers, dossierSearch, dossierStatusFilter]);

  const totalDossierPages = Math.ceil(filteredDossiers.length / dossierItemsPerPage) || 1;
  
  const paginatedDossiers = useMemo(() => {
    const start = (dossierPage - 1) * dossierItemsPerPage;
    return filteredDossiers.slice(start, start + dossierItemsPerPage);
  }, [filteredDossiers, dossierPage, dossierItemsPerPage]);

  // ─── Document Template Engine State ───
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [currentCategory, setCurrentCategory] = useState<DocumentTemplate['category']>('Corporate Offer Letter');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [zoomScale, setZoomScale] = useState<number>(0.85);

  // Variables for dynamic filling
  const [docVariables, setDocVariables] = useState({
    employee_name: 'Rajesh Kumar',
    designation: 'Senior Developer',
    department: 'Engineering',
    joining_date: '2026-06-01',
    salary: '9,50,000',
    bonus: '50,000',
    ctc: '10,000',
    company_name: currentCompany.name,
    company_email: currentCompany.email || 'hr@company.com',
    company_address: currentCompany.address || 'Corporate Headquarters'
  });

  // Modal edit/create template state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [modalForm, setModalForm] = useState({
    id: '',
    templateName: '',
    subject: '',
    body: '',
    companyName: '',
    primaryColor: '#3b82f6',
    logoText: '',
    signatureText: '',
    footerText: '',
    watermark: ''
  });

  // Rich Text Editor Ref for selection targeting
  const editorRef = useRef<HTMLDivElement>(null);

  // Load / Persist templates per company
  useEffect(() => {
    const storageKey = `hrms_templates_${activeCompanyId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTemplates(parsed);
      } catch (err) {
        const fallback = getInitialTemplates(activeCompanyId, currentCompany.name);
        setTemplates(fallback);
      }
    } else {
      const initial = getInitialTemplates(activeCompanyId, currentCompany.name);
      setTemplates(initial);
      
    }
  }, [activeCompanyId, currentCompany.name]);

  // Sync templates back to storage
  const saveTemplatesToStorage = (updated: DocumentTemplate[]) => {
    setTemplates(updated);
    const storageKey = `hrms_templates_${activeCompanyId}`;
    
  };

  // Filtered templates of the active tab category
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => t.category === currentCategory);
  }, [templates, currentCategory]);

  // Set default selected template when changing category
  useEffect(() => {
    if (filteredTemplates.length > 0) {
      const exists = filteredTemplates.find(t => t.id === selectedTemplateId);
      if (!exists) {
        setSelectedTemplateId(filteredTemplates[0].id);
      }
    } else {
      setSelectedTemplateId('');
    }
  }, [currentCategory, filteredTemplates]);

  // Find active template object
  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || filteredTemplates[0];
  }, [templates, selectedTemplateId, filteredTemplates]);

  // Auto-populate when employee selection swaps
  useEffect(() => {
    if (!selectedEmployeeId) return;
    const emp = companyEmployees.find(e => e.id === selectedEmployeeId);
    if (!emp) return;

    setDocVariables(prev => ({
      ...prev,
      employee_name: emp.name,
      designation: emp.designation,
      department: emp.department,
      joining_date: emp.joinDate,
      salary: emp.salary.toLocaleString('en-IN'),
      bonus: Math.round(emp.salary * 0.08).toLocaleString('en-IN'),
      ctc: emp.salary.toLocaleString('en-IN'),
      company_name: currentCompany.name,
      company_email: currentCompany.email || 'hr@company.com',
      company_address: currentCompany.address || 'Corporate Headquarters'
    }));
  }, [selectedEmployeeId, activeCompanyId]);

  // Dynamic variable replacer (stripping custom span tags to raw data text values)
  const getCompiledText = (text: string) => {
    if (!text) return '';
    let tempHtml = text;

    // Convert high-fidelity browser chips back to curly text tags
    if (typeof window !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(tempHtml, 'text/html');
      const spans = doc.querySelectorAll('span[data-token]');
      spans.forEach(span => {
        const token = span.getAttribute('data-token');
        if (token) {
          span.replaceWith(`{{${token}}}`);
        }
      });
      tempHtml = doc.body.innerHTML;
    }

    let result = tempHtml;
    const keys = Object.keys(docVariables) as Array<keyof typeof docVariables>;
    keys.forEach(k => {
      const regex = new RegExp(`{{${k}}}`, 'g');
      result = result.replace(regex, docVariables[k] || '');
    });
    return result;
  };

  // Compile subject
  const compiledSubject = useMemo(() => {
    if (!activeTemplate) return 'Document';
    return getCompiledText(activeTemplate.subject);
  }, [activeTemplate, docVariables]);

  // Compile body
  const compiledBody = useMemo(() => {
    if (!activeTemplate) return '';
    return getCompiledText(activeTemplate.body);
  }, [activeTemplate, docVariables]);

  // Compute live payslip values for dynamic previews
  const payslipVals = useMemo(() => {
    const rawSalary = parseFloat(docVariables.salary.replace(/,/g, '')) || 500000;
    const ctcMonthly = Math.round(rawSalary / 12);
    const basic = Math.round(ctcMonthly * (currentCompany.basicPercent / 100));
    const hra = Math.round(basic * 0.4);
    const special = Math.max(0, ctcMonthly - basic - hra);

    const pf = Math.round(basic * (currentCompany.pfRate / 100));
    const esic = Math.round(basic * (currentCompany.esicRate / 100));
    const profTax = currentCompany.profTaxRate;

    const netTakeHome = ctcMonthly - pf - esic - profTax;

    return {
      basic,
      hra,
      special,
      pf,
      esic,
      profTax,
      netTakeHome,
      ctc: ctcMonthly
    };
  }, [docVariables.salary, currentCompany]);

  // Compliance actions
  const filteredCompliance = list.filter(d => {
    const q = search.toLowerCase();
    return !q || d.name.toLowerCase().includes(q) || (d.employeeName?.toLowerCase().includes(q) ?? false);
  });

  const handleUploadDocument = async () => {
    const emp = companyEmployees.find(e => e.id === selectedEmpId);
    const newDoc: Document = {
      id: `doc${Date.now()}`,
      companyId: activeCompanyId,
      name: uploadForm.name || `${emp?.name || 'Employee'}_${uploadForm.type}.pdf`,
      type: uploadForm.type,
      employeeId: selectedEmpId,
      employeeName: emp?.name || 'System General',
      uploadedBy: role === 'HR' ? 'HR Manager' : 'Company Head',
      uploadedOn: new Date().toISOString().split('T')[0],
      size: '1.2 MB',
      status: 'Pending',
    };
    try { const saved = await api.documents.create(newDoc); onUpdateDocuments([saved, ...documents]); } catch(e) { alert('Failed to upload to DB'); }
    setUploadOpen(false);
    setUploadForm({ name: '', type: 'Aadhaar' });
    alert('Document registered in compliance vault.');
  };

  const handleToggleStatus = async (id: string, nextStatus: 'Verified' | 'Rejected') => {
    try { const t = documents.find(d => d.id === id); if(!t) return; const saved = await api.documents.update(id, { ...t, status: nextStatus }); onUpdateDocuments(documents.map(d => d.id === id ? saved : d)); } catch(e) { alert('Failed to update in DB'); }
    alert(`Document audited as ${nextStatus}`);
  };

  // High-fidelity print A4 PDF
  const handlePrint = () => {
    const element = document.getElementById('a4-sheet-preview');
    if (!element) return;
    
    element.setAttribute('style', 'width: 210mm; min-height: 297mm; transform: none !important; font-size: 13px; line-height: 1.6; padding: 25mm 20mm;');
    const printContent = element.outerHTML;

    document.body.innerHTML = `<div style="padding:0; margin:0; background:white;">${printContent}</div>`;
    window.print();
    window.location.reload();
  };

  // Open Edit Template Modal
  const openEditModal = (mode: 'create' | 'edit') => {
    setModalMode(mode);
    if (mode === 'edit' && activeTemplate) {
      setModalForm({
        id: activeTemplate.id,
        templateName: activeTemplate.templateName,
        subject: activeTemplate.subject,
        body: activeTemplate.body,
        companyName: activeTemplate.branding?.companyName || currentCompany.name,
        primaryColor: activeTemplate.branding?.primaryColor || currentCompany.primaryColor || '#3b82f6',
        logoText: activeTemplate.branding?.logoText || currentCompany.name.slice(0, 2).toUpperCase(),
        signatureText: activeTemplate.branding?.signatureText || 'Authorized Signatory',
        footerText: activeTemplate.branding?.footerText || `${currentCompany.name} · Confidential document`,
        watermark: activeTemplate.branding?.watermark || currentCategory.slice(0, 5).toUpperCase()
      });
    } else {
      setModalForm({
        id: `custom-${Date.now()}`,
        templateName: `Custom ${FRIENDLY_CATEGORIES[currentCategory]} Format`,
        subject: `Ref: Custom ${FRIENDLY_CATEGORIES[currentCategory]}`,
        body: `<p>Dear <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="employee_name" contenteditable="false">👤 Employee Name</span>,</p><p>We are excited to invite you to join our team at <span class="mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none" data-token="company_name" contenteditable="false">👤 Company Name</span>.</p><p>Sincerely,</p><p>HR Management</p>`,
        companyName: currentCompany.name,
        primaryColor: currentCompany.primaryColor || '#3b82f6',
        logoText: currentCompany.name.slice(0, 2).toUpperCase(),
        signatureText: 'Authorized HR Operations Signatory',
        footerText: `${currentCompany.name} · Confidential Document`,
        watermark: 'DRAFT'
      });
    }
    setIsEditModalOpen(true);
  };

  // Save template edits
  const handleSaveTemplate = (saveAsNew: boolean) => {
    if (!modalForm.templateName) {
      alert('Template Name is required.');
      return;
    }

    // Read edited body content directly from editor HTML
    const finalBodyHtml = editorRef.current ? editorRef.current.innerHTML : modalForm.body;

    const targetId = saveAsNew ? `custom-${Date.now()}` : modalForm.id;
    const updatedBranding = {
      companyName: modalForm.companyName,
      primaryColor: modalForm.primaryColor,
      logoText: modalForm.logoText,
      signatureText: modalForm.signatureText,
      footerText: modalForm.footerText,
      watermark: modalForm.watermark
    };

    let updatedList: DocumentTemplate[];
    if (saveAsNew || modalMode === 'create') {
      const newTemplate: DocumentTemplate = {
        id: targetId,
        templateName: saveAsNew ? `${modalForm.templateName} (Copy)` : modalForm.templateName,
        category: currentCategory,
        subject: modalForm.subject,
        body: finalBodyHtml,
        companyId: activeCompanyId,
        branding: updatedBranding,
        createdAt: new Date().toISOString().split('T')[0]
      };
      updatedList = [...templates, newTemplate];
      setSelectedTemplateId(newTemplate.id);
    } else {
      updatedList = templates.map(t => {
        if (t.id === modalForm.id) {
          return {
            ...t,
            templateName: modalForm.templateName,
            subject: modalForm.subject,
            body: finalBodyHtml,
            branding: updatedBranding
          };
        }
        return t;
      });
    }

    saveTemplatesToStorage(updatedList);
    setIsEditModalOpen(false);
    alert(saveAsNew ? 'New template version duplicated successfully.' : 'Template details updated.');
  };

  // Duplicate current template quick action
  const handleDuplicateTemplate = () => {
    if (!activeTemplate) return;
    const duplicated: DocumentTemplate = {
      ...activeTemplate,
      id: `copy-${Date.now()}`,
      templateName: `${activeTemplate.templateName} (Copy)`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    const updated = [...templates, duplicated];
    saveTemplatesToStorage(updated);
    setSelectedTemplateId(duplicated.id);
    alert(`Duplicated "${activeTemplate.templateName}" successfully.`);
  };

  // Delete Template
  const handleDeleteTemplate = () => {
    if (!activeTemplate) return;
    if (confirm(`Are you sure you want to permanently delete "${activeTemplate.templateName}"?`)) {
      const updated = templates.filter(t => t.id !== activeTemplate.id);
      saveTemplatesToStorage(updated);
      alert('Template removed.');
    }
  };

  // Rich formatting helper triggers
  const executeFormat = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    // Force state binding refresh by reading back HTML
    if (editorRef.current) {
      setModalForm(prev => ({ ...prev, body: editorRef.current!.innerHTML }));
    }
  };

  // Add Table format trigger
  const insertMockTable = () => {
    const tableHtml = `
      <table class="w-full border-collapse border border-slate-200 my-2 text-[10px]" style="font-family: sans-serif;">
        <thead>
          <tr class="bg-slate-50 font-bold">
            <th class="border border-slate-200 p-1.5 text-left">Compensation Item</th>
            <th class="border border-slate-200 p-1.5 text-right">Value (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="border border-slate-200 p-1.5">Basic Salary (Monthly)</td>
            <td class="border border-slate-200 p-1.5 text-right">₹30,000</td>
          </tr>
          <tr>
            <td class="border border-slate-200 p-1.5">House Rent Allowance (HRA)</td>
            <td class="border border-slate-200 p-1.5 text-right">₹12,000</td>
          </tr>
        </tbody>
      </table>
    `;
    executeFormat('insertHTML', tableHtml);
  };

  // Clickable Auto-chips insertion at current caret selection range
  const insertDataChipNode = (tokenKey: string, tokenLabel: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const span = document.createElement('span');
    span.className = 'mx-1 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 select-none cursor-default font-sans';
    span.setAttribute('data-token', tokenKey);
    span.setAttribute('contenteditable', 'false');
    span.innerHTML = `👤 ${tokenLabel}`;

    const space = document.createTextNode(' ');
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(space);
        range.insertNode(span);
        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.appendChild(span);
        editor.appendChild(space);
      }
    } else {
      editor.appendChild(span);
      editor.appendChild(space);
    }

    // Force update state
    setModalForm(prev => ({ ...prev, body: editor.innerHTML }));
  };

  // Derived colors
  const primaryColorHex = activeTemplate?.branding?.primaryColor || currentCompany.primaryColor || '#3b82f6';
  const logoText = activeTemplate?.branding?.logoText || currentCompany.name.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Enterprise Document Suite</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage employee verification vault and build dynamic styled HR correspondence without code</p>
        </div>
      </div>

      {/* Primary Switcher Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('compliance')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'compliance' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Award size={14} />
          Compliance Verification Vault
        </button>
        <button
          onClick={() => setActiveTab('letters')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'letters' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <FileText size={14} />
          Canva Letter Builder
        </button>
      </div>

      {/* ─── TAB 1: COMPLIANCE vault ─────────────────────────────────────────── */}
      {activeTab === 'compliance' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="w-72">
              <Input placeholder="Search employee documents..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
            </div>
            {canEdit && (
              <Button onClick={() => setUploadOpen(true)}>
                Upload Verification Doc
              </Button>
            )}
          </div>

          <div className="space-y-6">
            {/* Compliance Verification Vault Files Card */}
            <Card padding={false} className="border border-slate-150 rounded-2xl overflow-hidden shadow-xs bg-white">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-indigo-600" />
                  Compliance Verification Vault Files
                </h3>
                <span className="text-[10px] text-slate-400 font-bold">Main Registry Vault</span>
              </div>
              <Table>
                <Thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs">
                    <Th>Employee Name</Th>
                    <Th>Document Title / Type</Th>
                    <Th>Uploaded Date</Th>
                    <Th>Verification Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {filteredCompliance.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">No compliance files in company registry</td></tr>
                  ) : (
                    filteredCompliance.map(d => (
                      <Tr key={d.id}>
                        <Td>
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{d.employeeName || 'Corporate Archive'}</p>
                            <p className="text-[10px] text-gray-400">ID: {d.employeeId || 'N/A'}</p>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <FileText size={14} className="text-gray-400" />
                            <div>
                              <p className="text-xs font-medium text-gray-750">{d.name}</p>
                              <span className="text-[9px] text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-bold uppercase">{d.type}</span>
                            </div>
                          </div>
                        </Td>
                        <Td><span className="text-xs text-gray-600">{d.uploadedOn}</span></Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <Badge variant={d.status === 'Verified' ? 'green' : d.status === 'Pending' ? 'amber' : 'red'} dot>
                              {d.status}
                            </Badge>
                            {d.status === 'Verified' && <Award size={12} className="text-emerald-600" />}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            {d.status === 'Pending' && (role === 'Company Head' || role === 'HR' || role === 'Super Admin') && canEdit ? (
                              <>
                                <button
                                  onClick={() => handleToggleStatus(d.id, 'Verified')}
                                  className="text-[10px] px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded transition-colors"
                                >
                                  Verify
                                </button>
                                <button
                                  onClick={() => handleToggleStatus(d.id, 'Rejected')}
                                  className="text-[10px] px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-gray-400">Audited</span>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </Card>

            {/* REDESIGNED Employee Dossier History Logs */}
            <Card padding={false} className="border border-slate-150 rounded-2xl overflow-hidden shadow-xs bg-white">
              {/* Sticky header with Counters */}
              <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 p-4 z-10 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                    <Sliders size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">
                      Employee Dossier History Logs
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Audits, verification status and dossier completion for all roster members
                    </p>
                  </div>
                </div>

                {/* Counter statistics widgets */}
                <div className="flex items-center gap-2.5">
                  <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center min-w-[70px]">
                    <span className="text-[11px] font-extrabold text-slate-800">{companyEmployees.length}</span>
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Total</span>
                  </div>
                  <div className="px-3 py-1 bg-emerald-50 border border-emerald-150 rounded-xl flex flex-col items-center min-w-[70px]">
                    <span className="text-[11px] font-extrabold text-emerald-700">
                      {dossiers.filter(d => d.status === 'Verified').length}
                    </span>
                    <span className="text-[8px] text-emerald-600 font-bold uppercase tracking-wider">Verified</span>
                  </div>
                  <div className="px-3 py-1 bg-amber-50 border border-amber-150 rounded-xl flex flex-col items-center min-w-[70px]">
                    <span className="text-[11px] font-extrabold text-amber-700">
                      {dossiers.filter(d => d.status === 'Pending Documents' || d.status === 'Under Review').length}
                    </span>
                    <span className="text-[8px] text-amber-600 font-bold uppercase tracking-wider">Audits</span>
                  </div>
                  <div className="px-3 py-1 bg-rose-50 border border-rose-150 rounded-xl flex flex-col items-center min-w-[70px]">
                    <span className="text-[11px] font-extrabold text-rose-700">
                      {dossiers.filter(d => d.status === 'Missing Audit').length}
                    </span>
                    <span className="text-[8px] text-rose-600 font-bold uppercase tracking-wider">Missing</span>
                  </div>
                </div>
              </div>

              {/* Redesigned Search & Filters bar */}
              <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3.5">
                <div className="flex items-center gap-3.5 flex-1 min-w-[280px]">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search dossier by employee name, code, designation..."
                      value={dossierSearch}
                      onChange={e => {
                        setDossierSearch(e.target.value);
                        setDossierPage(1);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>

                  <select
                    value={dossierStatusFilter}
                    onChange={e => {
                      setDossierStatusFilter(e.target.value as any);
                      setDossierPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 min-w-[150px]"
                  >
                    <option value="">All Verification Status</option>
                    <option value="Verified">Verified</option>
                    <option value="Pending Documents">Pending Documents</option>
                    <option value="Missing Audit">Missing Audit</option>
                    <option value="Under Review">Under Review</option>
                  </select>
                </div>

                <div className="text-[11px] text-slate-400 font-bold">
                  Showing {filteredDossiers.length} records
                </div>
              </div>

              {/* Redesigned Dossiers Table */}
              <div className="overflow-x-auto">
                <Table>
                  <Thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs">
                      <Th className="pl-4">Employee Details</Th>
                      <Th>Department & Role</Th>
                      <Th>Document Progress</Th>
                      <Th>Verification Status</Th>
                      <Th>Last Updated</Th>
                      <Th className="text-center pr-4">Compliance Actions</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {paginatedDossiers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-xs text-gray-400 bg-white">
                          No matching dossiers found.
                        </td>
                      </tr>
                    ) : (
                      paginatedDossiers.map(({ emp, totalDocs, status, lastUpdated }) => {
                        return (
                          <Tr key={emp.id} className="hover:bg-slate-50/50 transition duration-150">
                            <Td className="pl-4">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-750 shadow-inner">
                                  {emp.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-xs font-extrabold text-slate-900">{emp.name}</p>
                                  <p className="text-[10px] text-indigo-600 font-bold tracking-tight mt-0.5">{emp.employeeId}</p>
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <div>
                                <p className="text-xs text-slate-800 font-medium">{emp.designation || 'Staff'}</p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{emp.department || 'Clinical'}</p>
                              </div>
                            </Td>
                            <Td>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                                  <span>{totalDocs} / 5 uploads</span>
                                  <span className="font-mono">{Math.round((totalDocs / 5) * 100)}%</span>
                                </div>
                                <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-150">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      status === 'Verified'
                                        ? 'bg-emerald-500'
                                        : status === 'Missing Audit'
                                        ? 'bg-rose-500'
                                        : 'bg-indigo-500'
                                    }`}
                                    style={{ width: `${Math.min(100, (totalDocs / 5) * 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <Badge
                                variant={
                                  status === 'Verified'
                                    ? 'green'
                                    : status === 'Pending Documents'
                                    ? 'amber'
                                    : status === 'Missing Audit'
                                    ? 'red'
                                    : 'indigo'
                                }
                                className="text-[9px] px-2 py-0.5 rounded-full border shadow-2xs font-extrabold flex items-center gap-1.5 w-fit"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  status === 'Verified'
                                    ? 'bg-emerald-500'
                                    : status === 'Pending Documents'
                                    ? 'bg-amber-500'
                                    : status === 'Missing Audit'
                                    ? 'bg-rose-500'
                                    : 'bg-indigo-505 bg-indigo-500'
                                }`}></span>
                                {status}
                              </Badge>
                            </Td>
                            <Td>
                              <span className="text-[11px] text-slate-500 font-medium">{lastUpdated}</span>
                            </Td>
                            <Td className="text-center pr-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setSelectedReviewEmp(emp)}
                                  className="p-1 text-slate-550 hover:text-slate-900 hover:bg-slate-100 rounded transition"
                                  title="View Uploaded Docs"
                                >
                                  <Eye size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedEmpId(emp.id);
                                    setUploadOpen(true);
                                  }}
                                  className="p-1 text-indigo-650 hover:text-indigo-900 hover:bg-indigo-50 rounded transition"
                                  title="Upload New Document"
                                >
                                  <Upload size={13} />
                                </button>
                                {status !== 'Verified' && (role === 'Company Head' || role === 'HR') ? (
                                  <button
                                    onClick={() => handleQuickVerify(emp.id)}
                                    className="p-1 text-emerald-650 hover:text-emerald-950 hover:bg-emerald-50 rounded transition"
                                    title="Quick Verify Dossier"
                                  >
                                    <Check size={13} />
                                  </button>
                                ) : (
                                  <div className="w-5"></div>
                                )}
                              </div>
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </Tbody>
                </Table>
              </div>

              {/* Redesigned Pagination Controls */}
              {totalDossierPages > 1 && (
                <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 font-medium">
                    Showing page <span className="font-extrabold text-slate-800">{dossierPage}</span> of <span className="font-extrabold text-slate-800">{totalDossierPages}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDossierPage(p => Math.max(1, p - 1))}
                      disabled={dossierPage === 1}
                      className="p-1.5 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-lg text-slate-600 transition"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-[11px] font-extrabold text-slate-700 min-w-[20px] text-center">
                      {dossierPage}
                    </span>
                    <button
                      onClick={() => setDossierPage(p => Math.min(totalDossierPages, p + 1))}
                      disabled={dossierPage === totalDossierPages}
                      className="p-1.5 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-lg text-slate-600 transition"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 2: VISUAL CANVA TEMPLATE GENERATOR ───────────────────────────── */}
      {activeTab === 'letters' && (
        <div className="space-y-4 animate-fade-in font-sans">
          
          {/* Categorized Template Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 overflow-auto">
            {([
              'Corporate Offer Letter', 'Startup Offer Letter', 'Internship Offer Letter',
              'Experience Letter', 'Joining Letter', 'Relieving Letter', 'Payslip Template'
            ] as const).map(cat => {
              const count = templates.filter(t => t.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setCurrentCategory(cat)}
                  className={`py-2 px-3 text-[11px] font-bold rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    currentCategory === cat
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200/50'
                  }`}
                >
                  <span>{FRIENDLY_CATEGORIES[cat]}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${currentCategory === cat ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* LEFT CONFIG COLUMN */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Gorgeous Visual Cards Grid instead of Dropdown */}
              <Card className="border border-slate-150 rounded-3xl p-4 shadow-sm bg-white">
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                    <Palette size={14} className="text-indigo-500" />
                    Select Document Style
                  </h3>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{FRIENDLY_CATEGORIES[currentCategory]}</span>
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400">
                    No custom templates in this category. Click "Create New" to start!
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-auto pr-1">
                    {filteredTemplates.map(t => {
                      const isActive = t.id === selectedTemplateId;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTemplateId(t.id)}
                          className={`border-2 rounded-2xl p-3 cursor-pointer transition-all flex flex-col justify-between hover:shadow bg-slate-50/50 relative hover:bg-white ${
                            isActive ? 'border-indigo-600 bg-white ring-1 ring-indigo-600/30' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Miniature Template Thumbnail */}
                          <div className="h-16 bg-white border border-slate-100 rounded-lg p-1.5 mb-2 flex flex-col justify-between overflow-hidden pointer-events-none select-none">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-0.5">
                              <span className="text-[6px] font-extrabold text-slate-700 leading-none">{t.branding?.logoText || 'TN'}</span>
                              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: t.branding?.primaryColor || '#3b82f6' }}></div>
                            </div>
                            <div className="space-y-0.5">
                              <div className="h-0.5 bg-slate-200 rounded w-full"></div>
                              <div className="h-0.5 bg-slate-200 rounded w-5/6"></div>
                              <div className="h-0.5 bg-slate-150 rounded w-2/3"></div>
                            </div>
                            <div className="h-0.5 bg-slate-100 rounded w-1/3"></div>
                          </div>

                          <h4 className="text-[10px] font-bold text-slate-800 truncate">{t.templateName}</h4>
                          
                          {isActive && (
                            <span className="absolute top-2 right-2 w-3.5 h-3.5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[8px] font-bold">
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Operations Actions Buttons under Card Grid */}
                {canEdit && (
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-slate-100">
                    <button
                      onClick={() => openEditModal('edit')}
                      className="py-1.5 px-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 rounded-xl text-[10px] font-extrabold text-slate-700 transition-all flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Edit size={11} className="text-amber-500" />
                      Edit Style
                    </button>
                    <button
                      onClick={handleDuplicateTemplate}
                      className="py-1.5 px-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 rounded-xl text-[10px] font-extrabold text-slate-700 transition-all flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Plus size={11} className="text-indigo-600" />
                      Duplicate
                    </button>
                    <button
                      onClick={handleDeleteTemplate}
                      disabled={templates.filter(t => t.category === currentCategory).length <= 1}
                      className="py-1.5 px-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-700 rounded-xl text-[10px] font-extrabold text-slate-750 transition-all flex items-center justify-center gap-1 shadow-xs disabled:opacity-40"
                    >
                      <Trash2 size={11} className="text-red-500" />
                      Delete
                    </button>
                  </div>
                )}
              </Card>

              {/* Roster Auto-fill and Variable Fine-tuning */}
              <Card className="border border-slate-150 rounded-3xl p-4 shadow-sm bg-white">
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                    <Sliders size={14} className="text-indigo-500" />
                    Auto Employee Details
                  </h3>
                  <span className="text-[10px] text-slate-400">Instantly binds values</span>
                </div>

                <div className="space-y-3.5">
                  <Select
                    label="Choose Roster Employee to Auto-Fill"
                    value={selectedEmployeeId}
                    onChange={e => setSelectedEmployeeId(e.target.value)}
                    options={[
                      { value: '', label: 'Select Employee...' },
                      ...companyEmployees.map(e => ({ value: e.id, label: `${e.name} (${e.designation})` }))
                    ]}
                  />

                  <div className="grid grid-cols-2 gap-3.5">
                    <Input
                      label="Employee Name"
                      value={docVariables.employee_name}
                      onChange={e => setDocVariables({ ...docVariables, employee_name: e.target.value })}
                    />
                    <Input
                      label="Designation"
                      value={docVariables.designation}
                      onChange={e => setDocVariables({ ...docVariables, designation: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <Input
                      label="Department"
                      value={docVariables.department}
                      onChange={e => setDocVariables({ ...docVariables, department: e.target.value })}
                    />
                    <Input
                      label="Joining Date"
                      type="date"
                      value={docVariables.joining_date}
                      onChange={e => setDocVariables({ ...docVariables, joining_date: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Base Pay (INR)"
                      value={docVariables.salary}
                      onChange={e => setDocVariables({ ...docVariables, salary: e.target.value })}
                    />
                    <Input
                      label="Bonus (INR)"
                      value={docVariables.bonus}
                      onChange={e => setDocVariables({ ...docVariables, bonus: e.target.value })}
                    />
                    <Input
                      label="CTC Package (INR)"
                      value={docVariables.ctc}
                      onChange={e => setDocVariables({ ...docVariables, ctc: e.target.value })}
                    />
                  </div>

                  {currentCategory === 'Payslip Template' && (
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-[10px] space-y-1 text-slate-700 shadow-xs">
                      <div className="flex justify-between font-bold text-indigo-900 border-b border-indigo-100 pb-1 mb-1">
                        <span>Statutory Rules (Active Company)</span>
                        <span>Deductions</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Basic CTC Percentage:</span>
                        <span className="font-semibold">{currentCompany.basicPercent}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Provident Fund (PF):</span>
                        <span className="font-semibold">{currentCompany.pfRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ESIC Contribution:</span>
                        <span className="font-semibold">{currentCompany.esicRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Professional Tax Deducted:</span>
                        <span className="font-semibold">₹{currentCompany.profTaxRate}</span>
                      </div>
                    </div>
                  )}

                  {/* Actions buttons bottom panel */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 flex gap-2">
                    {canEdit && (
                      <Button
                        variant="outline"
                        onClick={() => openEditModal('create')}
                        className="flex-1 text-xs font-bold"
                      >
                        Create Custom
                      </Button>
                    )}
                    <Button
                      onClick={handlePrint}
                      className="flex-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1 shadow"
                    >
                      <Printer size={13} />
                      Print PDF
                    </Button>
                  </div>
                </div>
              </Card>

            </div>

            {/* RIGHT PREVIEW COLUMN */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Zoom and Header Panel */}
              <div className="bg-slate-50 border border-slate-150 rounded-3xl p-3 flex items-center justify-between bg-white shadow-sm">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">A4 Live Document Canvas</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Google Docs style WYSIWYG client-side compiler</p>
                </div>

                {/* Scaling Buttons */}
                <div className="flex items-center gap-1 bg-slate-100/70 border border-slate-200 rounded-xl p-1 shadow-inner">
                  <button
                    onClick={() => setZoomScale(Math.max(0.5, zoomScale - 0.05))}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition-all shadow-xs"
                    title="Zoom Out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="text-[10px] font-bold font-mono px-2 text-slate-700 min-w-[36px] text-center">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    onClick={() => setZoomScale(Math.min(1.3, zoomScale + 0.05))}
                    className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition-all shadow-xs"
                    title="Zoom In"
                  >
                    <ZoomIn size={13} />
                  </button>
                </div>
              </div>

              {/* Scrollable sheet viewport wrapper */}
              <div className="overflow-auto border border-slate-200 rounded-3xl bg-slate-100/50 p-4 flex justify-center items-start min-h-[560px] max-h-[720px] shadow-inner relative">
                
                {/* Scaled parent box centering inside scrolling view */}
                <div style={{ width: `${210 * zoomScale}mm`, height: `${297 * zoomScale}mm`, overflow: 'hidden' }} className="flex justify-center items-start rounded-xl shadow-lg border border-slate-200 bg-white">
                  <div
                    id="a4-sheet-preview"
                    style={{
                      transform: `scale(${zoomScale})`,
                      transformOrigin: 'top left',
                      width: '210mm',
                      minHeight: '297mm',
                      fontSize: '12px',
                      lineHeight: '1.65',
                      padding: '24mm 18mm'
                    }}
                    className="bg-white text-slate-800 font-serif relative h-full flex flex-col justify-between"
                  >
                    
                    {/* Watermark overlay */}
                    {activeTemplate?.branding?.watermark && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                        <span className="text-[52px] font-sans font-extrabold text-slate-100 border-8 border-slate-100/65 px-5 py-1.5 rounded-2xl transform -rotate-45 uppercase tracking-widest opacity-20">
                          {activeTemplate.branding.watermark}
                        </span>
                      </div>
                    )}

                    <div>
                      {/* Top Header branding band */}
                      <div
                        className="flex items-center justify-between border-b-2 pb-4 mb-6"
                        style={{ borderColor: primaryColorHex }}
                      >
                        <div className="font-sans">
                          <h1
                            className="text-base font-extrabold uppercase tracking-wider"
                            style={{ color: primaryColorHex }}
                          >
                            {activeTemplate?.branding?.companyName || currentCompany.name}
                          </h1>
                          <p className="text-[9px] text-slate-500 mt-1">HQ Address: {docVariables.company_address}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">Corporate Email: {docVariables.company_email}</p>
                        </div>
                        <div
                          className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-extrabold text-sm flex-shrink-0 shadow-sm uppercase font-sans"
                          style={{ backgroundColor: primaryColorHex }}
                        >
                          {logoText}
                        </div>
                      </div>

                      {/* Subject & Date Row */}
                      <div className="flex justify-between items-baseline font-sans text-[10px] text-slate-500 mb-6">
                        <span className="font-bold">Subject: {compiledSubject}</span>
                        <span className="font-medium">Date: {new Date().toLocaleDateString('en-IN')}</span>
                      </div>

                      {/* Content block: letter head OR dynamic payslip table */}
                      {currentCategory === 'Payslip Template' ? (
                        <div className="space-y-4 font-sans">
                          
                          {/* Top mini notes block */}
                          <div className="text-xs text-slate-700 italic border-l-2 pl-3 py-1 mb-2" style={{ borderLeftColor: primaryColorHex }} dangerouslySetInnerHTML={{ __html: compiledBody }} />

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-4 border border-slate-200 p-3 rounded-xl bg-slate-50/50 text-[10px]">
                            <div className="space-y-1">
                              <p>Employee Name: <span className="font-bold text-slate-900">{docVariables.employee_name}</span></p>
                              <p>Designation: <span className="font-semibold text-slate-800">{docVariables.designation}</span></p>
                              <p>Department: <span className="font-semibold text-slate-800">{docVariables.department}</span></p>
                            </div>
                            <div className="space-y-1">
                              <p>Base Location: <span className="font-semibold text-slate-800">{currentCompany.address.split(',')[0]}</span></p>
                              <p>Joining Date: <span className="font-semibold text-slate-800">{docVariables.joining_date}</span></p>
                              <p>Billing Month: <span className="font-semibold text-slate-800">June 2026</span></p>
                            </div>
                          </div>

                          {/* Earnings & Deductions grid */}
                          <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded-xl overflow-hidden text-[10px]">
                            {/* Earnings */}
                            <div className="border-r border-slate-200">
                              <div
                                className="px-3 py-1.5 font-bold border-b border-slate-200"
                                style={{ backgroundColor: `${primaryColorHex}12`, color: primaryColorHex }}
                              >
                                Earnings (Monthly)
                              </div>
                              <div className="p-3 space-y-2">
                                <div className="flex justify-between">
                                  <span>Basic Salary ({currentCompany.basicPercent}%):</span>
                                  <span className="font-semibold text-slate-900">₹{payslipVals.basic.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>HRA Allowance (40%):</span>
                                  <span className="font-semibold text-slate-900">₹{payslipVals.hra.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Special Allowance:</span>
                                  <span className="font-semibold text-slate-900">₹{payslipVals.special.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1.5 font-bold text-slate-900">
                                  <span>Gross Earnings:</span>
                                  <span>₹{payslipVals.ctc.toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                            </div>

                            {/* Deductions */}
                            <div>
                              <div
                                className="px-3 py-1.5 font-bold border-b border-slate-200"
                                style={{ backgroundColor: `${primaryColorHex}12`, color: primaryColorHex }}
                              >
                                Deductions (Statutory)
                              </div>
                              <div className="p-3 space-y-2">
                                <div className="flex justify-between text-slate-700">
                                  <span>PF ({currentCompany.pfRate}% of Basic):</span>
                                  <span className="font-semibold text-red-650 text-red-600">-₹{payslipVals.pf.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between text-slate-700">
                                  <span>ESIC ({currentCompany.esicRate}% of Basic):</span>
                                  <span className="font-semibold text-red-650 text-red-600">-₹{payslipVals.esic.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between text-slate-700">
                                  <span>Professional Tax:</span>
                                  <span className="font-semibold text-red-650 text-red-600">-₹{payslipVals.profTax.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1.5 font-bold text-slate-900">
                                  <span>Total Deductions:</span>
                                  <span className="text-red-650 text-red-600">-₹{(payslipVals.pf + payslipVals.esic + payslipVals.profTax).toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Net Pay Box */}
                          <div
                            className="border rounded-2xl p-3 text-center"
                            style={{
                              backgroundColor: `${primaryColorHex}08`,
                              borderColor: `${primaryColorHex}40`
                            }}
                          >
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: primaryColorHex }}>
                              Net Credited Take Home Salary
                            </p>
                            <p className="text-base font-extrabold mt-0.5" style={{ color: primaryColorHex }}>
                              ₹{payslipVals.netTakeHome.toLocaleString('en-IN')}
                            </p>
                          </div>

                        </div>
                      ) : (
                        // Standard formatted letter body compiled HTML
                        <div className="whitespace-pre-wrap leading-relaxed text-xs text-slate-800 font-serif" dangerouslySetInnerHTML={{ __html: compiledBody }} />
                      )}
                    </div>

                    {/* Bottom Signature and Footer block */}
                    <div className="mt-12">
                      <div className="flex justify-between items-end border-t border-slate-100 pt-5 font-sans">
                        <div>
                          <p className="font-bold text-[11px]">For {activeTemplate?.branding?.companyName || currentCompany.name}</p>
                          <p className="text-[10px] text-slate-500 italic mt-6">{activeTemplate?.branding?.signatureText || 'Authorized HR Operations Signatory'}</p>
                          <p className="text-[8px] text-slate-400 mt-0.5">Corporate Operations Department</p>
                        </div>
                        <div className="text-right text-[8px] text-slate-400">
                          <p className="font-bold">CONFIDENTIAL AND PROPRIETARY</p>
                          <p className="mt-0.5">{activeTemplate?.branding?.companyName || currentCompany.name}</p>
                        </div>
                      </div>

                      {/* Small Footer Text */}
                      <div className="text-center text-[8px] text-slate-400 font-sans border-t border-slate-100 mt-6 pt-1.5">
                        {activeTemplate?.branding?.footerText || `${currentCompany.name} · Confidential Employee Dossier Operations`}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─── MODAL: COMPLIANCE UPLOAD ───────────────────────────────────────── */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Verification Document"
        size="sm"
        footer={
          canEdit && (
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadDocument} disabled={!selectedEmpId || !uploadForm.name}>
              Register Document
            </Button>
          </>
          )
        }
      >
        <div className="space-y-3">
          <Select
            label="Associate with Employee *"
            disabled={!canEdit}
            value={selectedEmpId}
            onChange={e => setSelectedEmpId(e.target.value)}
            options={[
              { value: '', label: 'Select Employee...' },
              ...companyEmployees.map(e => ({ value: e.id, label: e.name }))
            ]}
          />
          <Select
            label="Document Verification Type *"
            disabled={!canEdit}
            value={uploadForm.type}
            onChange={e => setUploadForm({ ...uploadForm, type: e.target.value as Document['type'] })}
            options={[
              { value: 'Aadhaar', label: 'Aadhaar Card' },
              { value: 'PAN', label: 'PAN Card' },
              { value: 'Resume', label: 'Resume / Curriculum Vitae' }
            ]}
          />
          <Input
            label="Document Filename *"
            disabled={!canEdit}
            placeholder="e.g. Rajesh_Aadhaar.pdf"
            value={uploadForm.name}
            onChange={e => setUploadForm({ ...uploadForm, name: e.target.value })}
          />
        </div>
      </Modal>

      {/* ─── MODAL: HIGH-FIDELITY CANVA HR DOCUMENT BUILDER ─────────────────── */}
      <Modal
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={modalMode === 'edit' ? `🎨 Canva HR Document Builder — Edit Layout` : `✨ Canva HR Document Builder — Create Format`}
        size="lg"
        footer={
          <div className="flex justify-between items-center w-full">
            <div>
              {modalMode === 'edit' && canEdit && (
                <Button
                  variant="outline"
                  onClick={() => handleSaveTemplate(true)}
                  className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 font-bold"
                >
                  Save as New Template
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="font-bold" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              {canEdit && (
                <Button onClick={() => handleSaveTemplate(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow">
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start font-sans">
          
          {/* Left panel: Compact Branding details */}
          <div className="lg:col-span-4 space-y-4 max-h-[580px] overflow-auto pr-1">
            <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl space-y-3.5">
              <h4 className="text-[11px] font-extrabold text-slate-800 border-b pb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <Sliders size={13} className="text-indigo-500" />
                Template Info
              </h4>
              
              <Input
                label="Template Display Name *"
                disabled={!canEdit}
                value={modalForm.templateName}
                onChange={e => setModalForm({ ...modalForm, templateName: e.target.value })}
                placeholder="e.g. Corporate Modern Offer"
              />
              
              <Input
                label="Document Subject Line *"
                disabled={!canEdit}
                value={modalForm.subject}
                onChange={e => setModalForm({ ...modalForm, subject: e.target.value })}
                placeholder="e.g. Appointment Agreement"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl space-y-3.5">
              <h4 className="text-[11px] font-extrabold text-slate-800 border-b pb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <Palette size={13} className="text-indigo-500" />
                Branding & Design
              </h4>

              <Input
                label="Branding Company Name"
                disabled={!canEdit}
                value={modalForm.companyName}
                onChange={e => setModalForm({ ...modalForm, companyName: e.target.value })}
              />

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500">Corporate Branding Color</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="color"
                    disabled={!canEdit}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer p-0 overflow-hidden flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    value={modalForm.primaryColor}
                    onChange={e => setModalForm({ ...modalForm, primaryColor: e.target.value })}
                  />
                  <input
                    type="text"
                    disabled={!canEdit}
                    className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1.5 font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                    value={modalForm.primaryColor}
                    onChange={e => setModalForm({ ...modalForm, primaryColor: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Logo Symbol Text"
                  disabled={!canEdit}
                  value={modalForm.logoText}
                  onChange={e => setModalForm({ ...modalForm, logoText: e.target.value })}
                  placeholder="e.g. TN"
                />
                <Input
                  label="Signature Signee"
                  disabled={!canEdit}
                  value={modalForm.signatureText}
                  onChange={e => setModalForm({ ...modalForm, signatureText: e.target.value })}
                  placeholder="e.g. MD, Talent Board"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Footer Licensing"
                  disabled={!canEdit}
                  value={modalForm.footerText}
                  onChange={e => setModalForm({ ...modalForm, footerText: e.target.value })}
                  placeholder="e.g. TechNova Corp"
                />
                <Input
                  label="Sheet Watermark"
                  disabled={!canEdit}
                  value={modalForm.watermark}
                  onChange={e => setModalForm({ ...modalForm, watermark: e.target.value })}
                  placeholder="e.g. STRICTLY PRIVATE"
                />
              </div>
            </div>
          </div>

          {/* Right panel: Styled Canva editor & clickable chips */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Clickable Auto Details Chips (Canva Google Docs feel) */}
            <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-3xl space-y-2">
              <h5 className="text-[10px] font-extrabold text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles size={12} className="text-indigo-600 animate-pulse" />
                Insert Employee Information (Auto Employee Details)
              </h5>
              <p className="text-[10px] text-indigo-700 leading-normal">
                Click any chip below to insert a smart placeholder at your current text editor cursor:
              </p>
              
              <div className="flex flex-wrap gap-2 pt-1.5">
                {[
                  { key: 'employee_name', label: 'Employee Name' },
                  { key: 'designation', label: 'Designation' },
                  { key: 'department', label: 'Department' },
                  { key: 'joining_date', label: 'Joining Date' },
                  { key: 'salary', label: 'Salary' },
                  { key: 'company_name', label: 'Company Name' },
                  { key: 'company_email', label: 'Company Email' }
                ].map(chip => (
                  <button
                    type="button"
                    key={chip.key}
                    disabled={!canEdit}
                    onClick={() => insertDataChipNode(chip.key, chip.label)}
                    className="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-bold bg-white hover:bg-indigo-600 border border-indigo-150 text-indigo-700 hover:text-white transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <User size={10} className="opacity-70" />
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Styled Visual Formatting Rich Toolbar */}
            <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-xs">
              
              {/* Toolbar */}
              <div className="flex items-center gap-1 p-2 bg-slate-50 border-b border-slate-200 flex-wrap">
                <button
                  type="button"
                  onClick={() => executeFormat('bold')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900 font-bold"
                  title="Bold"
                >
                  <Bold size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => executeFormat('italic')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
                  title="Italic"
                >
                  <Italic size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => executeFormat('underline')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
                  title="Underline"
                >
                  <Underline size={13} />
                </button>
                
                <span className="w-px h-4 bg-slate-200 mx-1"></span>

                <button
                  type="button"
                  onClick={() => executeFormat('justifyLeft')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                  title="Align Left"
                >
                  <AlignLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => executeFormat('justifyCenter')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                  title="Align Center"
                >
                  <AlignCenter size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => executeFormat('justifyRight')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                  title="Align Right"
                >
                  <AlignRight size={13} />
                </button>

                <span className="w-px h-4 bg-slate-200 mx-1"></span>

                <button
                  type="button"
                  onClick={() => executeFormat('insertUnorderedList')}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                  title="Bullet Points"
                >
                  <List size={13} />
                </button>

                <button
                  type="button"
                  onClick={insertMockTable}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-700 flex items-center gap-1 text-[9.5px] font-bold"
                  title="Insert Table Grid"
                >
                  <Table2 size={13} className="text-indigo-600" />
                  + Table
                </button>

                <span className="w-px h-4 bg-slate-200 mx-1"></span>

                {/* Simulated Font Size dropdown trigger */}
                <select
                  onChange={e => executeFormat('fontSize', e.target.value)}
                  className="text-[10px] border border-slate-200 rounded bg-white py-0.5 px-1.5 focus:outline-none"
                  defaultValue="3"
                >
                  <option value="1">Small Size</option>
                  <option value="3">Normal Size</option>
                  <option value="5">Large Title</option>
                  <option value="7">Huge Header</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    executeFormat('insertHTML', `<div class="p-4 border-2 border-dashed border-slate-350 bg-slate-50/50 rounded-xl my-2 text-center text-xs text-slate-400 font-bold uppercase select-none flex items-center justify-center gap-1 cursor-default"><Landmark size={14}/> [INSERT LOGO PLACEHOLDER]</div>`);
                  }}
                  className="p-1 px-2 hover:bg-slate-200 rounded text-slate-700 flex items-center gap-1 text-[9px] font-extrabold ml-auto border border-slate-200 shadow-xs"
                >
                  <Landmark size={11} className="text-emerald-600" />
                  + Logo Block
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    executeFormat('insertHTML', `<div class="p-4 border-2 border-dashed border-slate-350 bg-slate-50/50 rounded-xl my-2 text-center text-xs text-slate-400 font-bold uppercase select-none flex items-center justify-center gap-1 cursor-default"><Tag size={14}/> [INSERT SIGNATURE BOX]</div>`);
                  }}
                  className="p-1 px-2 hover:bg-slate-200 rounded text-slate-700 flex items-center gap-1 text-[9px] font-extrabold border border-slate-200 shadow-xs"
                >
                  <Tag size={11} className="text-purple-600" />
                  + Sign Box
                </button>
              </div>

              {/* contentEditable HR Letter Content Container */}
              <div
                ref={editorRef}
                contentEditable
                className="w-full h-[320px] overflow-auto p-4 focus:outline-none text-xs font-serif leading-relaxed"
                style={{ minHeight: '320px' }}
                dangerouslySetInnerHTML={{ __html: modalForm.body }}
                onBlur={() => {
                  if (editorRef.current) {
                    setModalForm(prev => ({ ...prev, body: editorRef.current!.innerHTML }));
                  }
                }}
              />

            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-400 italic">
              <Info size={11} className="text-indigo-500" />
              <span>Double-click or drag variables inside the editor. Changes sync with the live preview instantly.</span>
            </div>

          </div>

        </div>
      </Modal>

      {/* Premium Dossier Audit Details Modal */}
      <Modal open={!!selectedReviewEmp} onClose={() => setSelectedReviewEmp(null)} title="Employee Dossier Verification Details" size="md">
        {selectedReviewEmp && (() => {
          const empDocs = list.filter(d => d.employeeId === selectedReviewEmp.id);
          return (
            <div className="space-y-4 text-left font-sans">
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-805 text-indigo-700 font-bold flex items-center justify-center text-sm ring-2 ring-indigo-200">
                  {selectedReviewEmp.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">{selectedReviewEmp.name}</p>
                  <p className="text-[10px] text-gray-500 font-medium">{selectedReviewEmp.designation || 'Staff'} · {selectedReviewEmp.employeeId}</p>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Primary Profile Uploads</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-slate-150 p-2.5 rounded-xl bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-800">Aadhaar Card</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">Government ID</p>
                    </div>
                    <span className={`text-[8px] font-bold mt-2 px-1.5 py-0.5 rounded text-center ${selectedReviewEmp.aadhaarUpload ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 'bg-slate-100 text-slate-400'}`}>
                      {selectedReviewEmp.aadhaarUpload ? 'Uploaded' : 'Missing'}
                    </span>
                  </div>
                  <div className="border border-slate-150 p-2.5 rounded-xl bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-800">PAN Card</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">Tax Account ID</p>
                    </div>
                    <span className={`text-[8px] font-bold mt-2 px-1.5 py-0.5 rounded text-center ${selectedReviewEmp.panUpload ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 'bg-slate-100 text-slate-400'}`}>
                      {selectedReviewEmp.panUpload ? 'Uploaded' : 'Missing'}
                    </span>
                  </div>
                  <div className="border border-slate-150 p-2.5 rounded-xl bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-800">Passport Photo</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">Primary Picture</p>
                    </div>
                    <span className={`text-[8px] font-bold mt-2 px-1.5 py-0.5 rounded text-center ${selectedReviewEmp.photoUpload ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 'bg-slate-100 text-slate-400'}`}>
                      {selectedReviewEmp.photoUpload ? 'Uploaded' : 'Missing'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Compliance Vault Documents ({empDocs.length})</h4>
                {empDocs.length === 0 ? (
                  <p className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">No compliance audit files uploaded in the main vault.</p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-auto pr-1">
                    {empDocs.map(d => (
                      <div key={d.id} className="border border-slate-150 p-2.5 rounded-xl flex items-center justify-between hover:bg-slate-50 transition">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-slate-400" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-850 truncate max-w-[185px]">{d.name}</p>
                            <span className="text-[8px] text-indigo-650 bg-indigo-50 px-1 py-0.2 rounded font-bold uppercase">{d.type}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={d.status === 'Verified' ? 'green' : d.status === 'Pending' ? 'amber' : 'red'} className="text-[8px] px-1 py-0">
                            {d.status}
                          </Badge>
                          {d.status === 'Pending' && (
                            <button
                              onClick={() => {
                                handleToggleStatus(d.id, 'Verified');
                              }}
                              className="text-[9px] px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded"
                            >
                              Verify
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

    </div>
  );
};
