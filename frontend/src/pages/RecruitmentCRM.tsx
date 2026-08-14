import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Briefcase, Search, Plus, Users, FileText, Bot, MapPin, Building2,
  CheckCircle2, XCircle, Clock, Calendar, DollarSign, ArrowRight,
  ChevronRight, Sparkles, Filter, RefreshCw, Send, Check, AlertTriangle,
  Sliders, Star, Eye, Copy, ExternalLink, UserCheck, Award, MessageSquare,
  Shield, Layers, ChevronDown, Download, Play, MoreVertical, Mail, Phone,
  FileCheck, Trash2, UserPlus, FileSpreadsheet, Lock, CheckSquare, X, AlertCircle
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { toast } from 'react-hot-toast';

interface RecruitmentCRMProps {
  activeCompanyId: string | number;
}

const KANBAN_STAGES = [
  { id: 'NEW', label: 'New', dotColor: 'bg-blue-600', matchStatuses: ['NEW'] },
  { id: 'SCREENING', label: 'Screening', dotColor: 'bg-amber-500', matchStatuses: ['SCREENING', 'SHORTLISTED'] },
  { id: 'INTERVIEW', label: 'Interview', dotColor: 'bg-indigo-600', matchStatuses: ['INTERVIEW', 'SELECTED'] },
  { id: 'OFFER_SENT', label: 'Offer', dotColor: 'bg-pink-600', matchStatuses: ['OFFER_SENT', 'OFFER'] },
  { id: 'JOINED', label: 'Joined', dotColor: 'bg-emerald-600', matchStatuses: ['JOINED'] }
];

export const RecruitmentCRM: React.FC<RecruitmentCRMProps> = ({ activeCompanyId }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline'>('pipeline');
  const [loading, setLoading] = useState(true);

  // Stats & Master Data
  const [stats, setStats] = useState({
    openPositions: 0,
    draftRequirements: 0,
    closedPositions: 0,
    totalCandidates: 0,
    candidatesInScreening: 0,
    interviewsToday: 0,
    pendingOffers: 0,
    joined: 0
  });
  const [requirements, setRequirements] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // Requisitions Tab Filters
  const [reqSearchQuery, setReqSearchQuery] = useState('');
  const [reqSelectedDept, setReqSelectedDept] = useState('ALL');
  const [reqSelectedStatus, setReqSelectedStatus] = useState('ALL');

  // Pipeline Kanban Filters (Matching Screenshot)
  const [pipelineReqId, setPipelineReqId] = useState<number | 'ALL'>('ALL');
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'ANY' | '90' | '70' | '50' | '30'>('ANY');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'All' | 'Rejected'>('All');
  const [pipelineViewTab, setPipelineViewTab] = useState<'active' | 'rejected'>('active');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [moreFilters, setMoreFilters] = useState({
    department: 'ALL',
    experienceType: 'ALL',
    location: ''
  });

  // Pipeline Candidate Data & Pagination
  const [applications, setApplications] = useState<any[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalCandidatesCount, setTotalCandidatesCount] = useState(0);

  // Create / Edit Requisition Modal
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<any | null>(null);
  const [reqForm, setReqForm] = useState({
    jobTitle: '',
    department: 'Engineering',
    hiringManager: '',
    recruiter: '',
    numberOfOpenings: 1,
    employmentType: 'Full-Time',
    workMode: 'On-site',
    location: '',
    experience: '2-4 Years',
    salaryMin: '',
    salaryMax: '',
    qualification: '',
    requiredSkills: '',
    jobDescription: '',
    responsibilities: '',
    hiringReason: 'Expansion',
    priority: 'Medium',
    openingDate: '',
    expectedJoiningDate: '',
    applicationDeadline: '',
    status: 'OPEN'
  });

  // Candidate Detail Drawer / Modal
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [candidateDrawerTab, setCandidateDrawerTab] = useState<'overview' | 'ats' | 'screening' | 'interviews' | 'offers' | 'timeline'>('overview');

  // Sub-forms inside Candidate Detail
  const [screeningNotes, setScreeningNotes] = useState('');
  const [screeningDecision, setScreeningDecision] = useState('SHORTLIST');
  const [interviewForm, setInterviewForm] = useState({
    scheduleOption: 'FIXED',
    interviewType: 'Technical',
    scheduledDate: '',
    scheduledTime: '11:00',
    interviewer: '',
    interviewMode: 'Online',
    meetingLink: '',
    location: '',
    notes: '',
    duration: 30,
    // Candidate self-scheduling availability window (per invitation)
    availableFrom: '',
    availableTo: '',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    startTime: '10:00',
    endTime: '17:00',
    bufferMinutes: 0
  });
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [feedbackForm, setFeedbackForm] = useState({
    technicalSkills: 4,
    communication: 4,
    problemSolving: 4,
    cultureFit: 4,
    overallRating: 4,
    strengths: '',
    weaknesses: '',
    feedbackComments: '',
    feedbackDecision: 'SELECTED'
  });
  const [offerForm, setOfferForm] = useState({
    designation: '',
    department: '',
    salary: '',
    employmentType: 'Full-Time',
    location: '',
    joiningDate: '',
    offerExpiry: '',
    terms: 'Standard probation of 3 months applies. Health insurance and standard company benefits included.'
  });
  const [previewResumeUrl, setPreviewResumeUrl] = useState<string | null>(null);

  // Resumes are served through an authenticated, company-scoped endpoint, so
  // the iframe gets a blob URL fetched with the caller's token + workspace.
  const handlePreviewResume = async (resumePath: string) => {
    try {
      const token = localStorage.getItem('hrms_jwt_token');
      const workspaceId = localStorage.getItem('hrms_active_company_id');
      const res = await fetch(`/api/recruitment/resume/${encodeURIComponent(resumePath)}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {})
        }
      });
      if (!res.ok) throw new Error('Resume could not be loaded');
      const blob = await res.blob();
      setPreviewResumeUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load resume');
    }
  };
  const [schedulingBusy, setSchedulingBusy] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [activeFeedbackIntId, setActiveFeedbackIntId] = useState<number | null>(null);

  // Auto-refresh candidate when opening or switching tabs
  const handleOpenCandidateDrawer = async (app: any) => {
    setSelectedCandidate(app);
    setCandidateDrawerTab('overview');
    setShowScheduleForm(false);
    setScreeningNotes(app.screeningNotes || '');
    try {
      const res: any = await api.get(`/api/recruitment/applications/${app.id}`);
      const fullCand = res?.data || res;
      if (fullCand && fullCand.id) {
        setSelectedCandidate(fullCand);
      }
    } catch (_) { }
  };

  useEffect(() => {
    const candId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (candId && (candidateDrawerTab === 'interviews' || candidateDrawerTab === 'offers' || candidateDrawerTab === 'timeline')) {
      api.get(`/api/recruitment/applications/${candId}`).then((res: any) => {
        const fullCand = res?.data || res;
        if (fullCand && fullCand.id) {
          setSelectedCandidate(fullCand);
        }
      }).catch(() => { });
    }
  }, [candidateDrawerTab]);

  // Company Interview Settings Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    availableFrom: '',
    availableTo: '',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    startTime: '10:00',
    endTime: '17:00',
    duration: 30,
    timezone: 'Asia/Kolkata'
  });

  // Safe API Patch helper
  const apiPatch = async (url: string, body: any) => {
    const token = localStorage.getItem('hrms_jwt_token');
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Request failed');
    }
    return await res.json();
  };

  // Fetch initial master data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, reqsRes, deptsRes]: any = await Promise.all([
        api.get(`/api/recruitment/requirements/stats?companyId=${activeCompanyId}`).catch(() => null),
        api.get(`/api/recruitment/requirements?companyId=${activeCompanyId}`).catch(() => []),
        api.get(`/api/recruitment/departments?companyId=${activeCompanyId}`).catch(() => [])
      ]);

      const statsData = statsRes?.data ?? statsRes;
      const reqsData = reqsRes?.data ?? reqsRes;
      const deptsData = deptsRes?.data ?? deptsRes;

      if (statsData) {
        setStats({
          openPositions: statsData.openPositions ?? statsData.open ?? 0,
          draftRequirements: statsData.draftRequirements ?? statsData.draft ?? 0,
          closedPositions: statsData.closedPositions ?? statsData.closed ?? 0,
          totalCandidates: statsData.totalCandidates ?? 0,
          candidatesInScreening: statsData.candidatesInScreening ?? 0,
          interviewsToday: statsData.interviewsToday ?? 0,
          pendingOffers: statsData.pendingOffers ?? 0,
          joined: statsData.joined ?? 0
        });
      }

      if (Array.isArray(reqsData)) {
        setRequirements(reqsData);
        if (reqsData.length > 0 && pipelineReqId === 'ALL') {
          // If python requirement exists, default to it, otherwise 'ALL'
          const pythonReq = reqsData.find((r: any) => r.jobTitle?.toLowerCase().includes('python'));
          if (pythonReq) {
            setPipelineReqId(pythonReq.id);
          }
        }
      }

      if (Array.isArray(deptsData)) {
        setDepartments(deptsData);
      }
    } catch (err) {
      console.error('Failed to load recruitment data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch candidate pipeline with full filters and pagination
  const fetchPipeline = async () => {
    try {
      setPipelineLoading(true);
      const reqParam = pipelineReqId === 'ALL' ? 0 : pipelineReqId;
      const minScore = scoreFilter === 'ANY' ? 0 : parseInt(scoreFilter, 10);

      const params = new URLSearchParams({
        companyId: String(activeCompanyId),
        search: pipelineSearch,
        status: statusFilter,
        minScore: String(minScore),
        experience: moreFilters.experienceType,
        page: String(page),
        limit: String(pageSize)
      });

      const res: any = await api.get(`/api/recruitment/applications/requirement/${reqParam}?${params.toString()}`);
      const rawData = res?.data ?? res;

      if (rawData && rawData.data && Array.isArray(rawData.data)) {
        setApplications(rawData.data);
        setTotalCandidatesCount(rawData.totalCount || rawData.data.length);
      } else if (Array.isArray(rawData)) {
        setApplications(rawData);
        setTotalCandidatesCount(rawData.length);
      }
    } catch (err) {
      console.error('Failed to load candidate pipeline:', err);
    } finally {
      setPipelineLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeCompanyId]);

  useEffect(() => {
    fetchPipeline();
  }, [activeCompanyId, pipelineReqId, pipelineSearch, scoreFilter, statusFilter, moreFilters, page, pageSize]);

  // Handle Create / Edit Requisition
  const handleOpenReqModal = (req?: any) => {
    if (req) {
      setEditingReq(req);
      setReqForm({
        jobTitle: req.jobTitle || '',
        department: req.department || 'Engineering',
        hiringManager: req.hiringManager || '',
        recruiter: req.recruiter || '',
        numberOfOpenings: req.numberOfOpenings || 1,
        employmentType: req.employmentType || 'Full-Time',
        workMode: req.workMode || 'On-site',
        location: req.location || '',
        experience: req.experience || '2-4 Years',
        salaryMin: req.salaryMin ? String(req.salaryMin) : '',
        salaryMax: req.salaryMax ? String(req.salaryMax) : '',
        qualification: req.qualification || '',
        requiredSkills: req.requiredSkills || '',
        jobDescription: req.jobDescription || '',
        responsibilities: req.responsibilities || '',
        hiringReason: req.hiringReason || 'Expansion',
        priority: req.priority || 'Medium',
        openingDate: req.openingDate || '',
        expectedJoiningDate: req.expectedJoiningDate || '',
        applicationDeadline: req.applicationDeadline || '',
        status: req.status || 'OPEN'
      });
    } else {
      setEditingReq(null);
      setReqForm({
        jobTitle: '',
        department: departments[0] || 'Engineering',
        hiringManager: '',
        recruiter: '',
        numberOfOpenings: 1,
        employmentType: 'Full-Time',
        workMode: 'On-site',
        location: '',
        experience: '2-4 Years',
        salaryMin: '',
        salaryMax: '',
        qualification: '',
        requiredSkills: '',
        jobDescription: '',
        responsibilities: '',
        hiringReason: 'Expansion',
        priority: 'Medium',
        openingDate: new Date().toISOString().split('T')[0],
        expectedJoiningDate: '',
        applicationDeadline: '',
        status: 'OPEN'
      });
    }
    setReqModalOpen(true);
  };

  const handleSaveRequisition = async (forcedStatus?: 'DRAFT' | 'OPEN') => {
    try {
      if (!reqForm.jobTitle.trim()) {
        toast.error('Job Title is required');
        return;
      }

      const statusToSave = forcedStatus || reqForm.status;
      const payload = {
        ...reqForm,
        companyId: activeCompanyId,
        status: statusToSave
      };

      if (editingReq) {
        await api.put(`/api/recruitment/requirements/${editingReq.id}`, payload);
        toast.success('Requisition updated successfully');
      } else {
        await api.post('/api/recruitment/requirements', payload);
        toast.success(statusToSave === 'OPEN' ? 'Requisition published with public job post!' : 'Requisition saved as draft');
      }

      setReqModalOpen(false);
      fetchData();
      fetchPipeline();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save requisition');
    }
  };

  const handleStatusChange = async (reqId: number, newStatus: string) => {
    try {
      await apiPatch(`/api/recruitment/requirements/${reqId}/status`, { status: newStatus });
      toast.success(`Requisition status changed to ${newStatus}`);
      fetchData();
    } catch (err: any) {
      toast.error('Failed to change status');
    }
  };

  const handleDeleteRequirement = async (reqId: number) => {
    if (!window.confirm('Are you sure you want to delete this requisition?')) return;
    try {
      await api.delete(`/api/recruitment/requirements/${reqId}`);
      toast.success('Requisition deleted');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Cannot delete requisition with applicants');
    }
  };

  const handleOpenPublicJobLink = (jobCode: string) => {
    const url = `${window.location.origin}/?job=${jobCode}`;
    window.open(url, '_blank');
  };

  const handleCopyPublicJobLink = (jobCode: string) => {
    const url = `${window.location.origin}/?job=${jobCode}`;
    navigator.clipboard.writeText(url);
    toast.success('Public Job Link copied to clipboard!');
  };

  // Stage Transitions
  const handleTransitionCandidate = async (appId: number, targetStatus: string, reason?: string) => {
    try {
      await apiPatch(`/api/recruitment/applications/${appId}/status`, {
        status: targetStatus,
        reason: reason || `Moved to ${targetStatus}`
      });
      toast.success(`Candidate moved to ${targetStatus}`);

      // Refresh applications and update modal candidate if open
      fetchPipeline();
      fetchData();

      if (selectedCandidate && selectedCandidate.id === appId) {
        setSelectedCandidate((prev: any) => ({ ...prev, status: targetStatus }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update candidate stage');
    }
  };

  // Candidate Screening Submit
  const handleSaveScreening = async () => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) return;
    try {
      await api.post(`/api/recruitment/applications/${candidateId}/screening`, {
        notes: screeningNotes,
        decision: screeningDecision
      });
      toast.success('Screening evaluation saved');
      fetchPipeline();
      fetchData();
      const updated: any = await api.get(`/api/recruitment/applications/${candidateId}`);
      const candData = updated?.data || updated;
      if (candData && candData.id) {
        setSelectedCandidate(candData);
      }
    } catch (err) {
      toast.error('Failed to save screening evaluation');
    }
  };

  // Schedule Interview Submit
  const handleScheduleInterview = async () => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) {
      toast.error('No candidate selected');
      return;
    }
    setSchedulingBusy(true);
    try {
      if (interviewForm.scheduleOption === 'FIXED') {
        if (!interviewForm.scheduledDate || !interviewForm.scheduledTime) {
          toast.error('Please specify interview date and time');
          setSchedulingBusy(false);
          return;
        }
        await api.post(`/api/recruitment/applications/${candidateId}/interviews`, {
          ...interviewForm,
          sendEmail: true
        });
        toast.success('Fixed interview scheduled and confirmation email sent');
      } else {
        if (!interviewForm.availableFrom || !interviewForm.availableTo) {
          toast.error('Please set the Available From and Available Until dates');
          setSchedulingBusy(false);
          return;
        }
        if (interviewForm.availableTo < interviewForm.availableFrom) {
          toast.error('Available Until cannot be before Available From');
          setSchedulingBusy(false);
          return;
        }
        if (!interviewForm.workingDays.length) {
          toast.error('Select at least one available weekday');
          setSchedulingBusy(false);
          return;
        }
        const res: any = await api.post(`/api/recruitment/applications/${candidateId}/interview-invitation`, {
          scheduleOption: 'CANDIDATE',
          interviewer: interviewForm.interviewer || 'Talent Team',
          interviewType: interviewForm.interviewType,
          duration: interviewForm.duration || 30,
          availableFrom: interviewForm.availableFrom,
          availableTo: interviewForm.availableTo,
          workingDays: interviewForm.workingDays,
          startTime: interviewForm.startTime,
          endTime: interviewForm.endTime,
          bufferMinutes: interviewForm.bufferMinutes || 0,
          interviewMode: interviewForm.interviewMode,
          meetingLink: interviewForm.meetingLink || null,
          location: interviewForm.location || null,
          notes: interviewForm.notes || ''
        });
        const scheduleUrl = res?.data?.scheduleUrl;
        if (scheduleUrl) {
          try { navigator.clipboard.writeText(scheduleUrl); } catch (_) { }
          toast.success('Scheduling invitation sent! Link copied to clipboard.');
        } else {
          toast.success('Self-scheduling invitation link generated and sent to candidate');
        }
      }

      await fetchPipeline();
      await fetchData();
      const updated: any = await api.get(`/api/recruitment/applications/${candidateId}`);
      const candData = updated?.data || updated;
      if (candData && candData.id) {
        setSelectedCandidate(candData);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule interview');
    } finally {
      setSchedulingBusy(false);
    }
  };

  // Interview Feedback Submit
  const handleSaveInterviewFeedback = async (intId: number) => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) return;
    try {
      await api.put(`/api/recruitment/applications/${candidateId}/interviews/${intId}`, feedbackForm);
      toast.success('Interview feedback saved and stage updated');
      fetchPipeline();
      fetchData();
      const updated: any = await api.get(`/api/recruitment/applications/${candidateId}`);
      const candData = updated?.data || updated;
      if (candData && candData.id) {
        setSelectedCandidate(candData);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record interview feedback');
    }
  };

  // Mark Interview status (e.g. COMPLETED / CANCELLED)
  const handleMarkInterviewStatus = async (intId: number, status: string) => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) return;
    try {
      await apiPatch(`/api/recruitment/applications/${candidateId}/interviews/${intId}/status`, { status });
      toast.success(`Interview marked as ${status.toLowerCase()}`);
      fetchPipeline();
      fetchData();
      const updated: any = await api.get(`/api/recruitment/applications/${candidateId}`);
      const candData = updated?.data || updated;
      if (candData && candData.id) {
        setSelectedCandidate(candData);
      }
      if (status === 'COMPLETED') {
        setActiveFeedbackIntId(intId);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update interview status');
    }
  };

  // Reopen candidate self-scheduling (reschedule) — releases the booked slot
  // and re-issues a fresh secure link; history is preserved in the timeline.
  const handleReopenScheduling = async (intId: number) => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) return;
    try {
      const res: any = await api.post(`/api/recruitment/applications/${candidateId}/interviews/${intId}/reopen-scheduling`, {});
      const scheduleUrl = res?.data?.scheduleUrl;
      if (scheduleUrl) {
        try { navigator.clipboard.writeText(scheduleUrl); } catch (_) { }
      }
      toast.success('Scheduling reopened — a fresh invitation was emailed to the candidate');
      fetchPipeline();
      const updated: any = await api.get(`/api/recruitment/applications/${candidateId}`);
      const candData = updated?.data || updated;
      if (candData && candData.id) {
        setSelectedCandidate(candData);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reopen candidate scheduling');
    }
  };

  // Offer Letter Generation Submit
  const handleCreateOffer = async () => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) return;
    try {
      if (!offerForm.salary || !offerForm.joiningDate) {
        toast.error('Offered salary and joining date are required');
        return;
      }
      await api.post(`/api/recruitment/applications/${candidateId}/offers`, {
        ...offerForm,
        designation: offerForm.designation || selectedCandidate.requirement?.jobTitle,
        department: offerForm.department || selectedCandidate.requirement?.department
      });
      toast.success('Offer letter generated and emailed to candidate with response token!');
      fetchPipeline();
      fetchData();
      const updated: any = await api.get(`/api/recruitment/applications/${candidateId}`);
      const candData = updated?.data || updated;
      if (candData && candData.id) {
        setSelectedCandidate(candData);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create offer letter');
    }
  };

  // Retry ATS Analysis
  const handleRetryATS = async () => {
    const candidateId = selectedCandidate?.id || (selectedCandidate as any)?.data?.id;
    if (!candidateId) return;
    try {
      await api.post(`/api/recruitment/applications/${candidateId}/retry-ats`, {});
      toast.success('ATS analysis re-triggered in background. Refresh in a few seconds.');
      setTimeout(async () => {
        const res: any = await api.get(`/api/recruitment/applications/${candidateId}`);
        const candData = res?.data || res;
        if (candData && candData.id) {
          setSelectedCandidate(candData);
        }
        fetchPipeline();
      }, 3000);
    } catch (err) {
      toast.error('Failed to retry ATS analysis');
    }
  };

  // Filtered requirements for table
  const filteredRequirements = useMemo(() => {
    return requirements.filter(r => {
      const matchSearch = !reqSearchQuery ||
        r.jobTitle?.toLowerCase().includes(reqSearchQuery.toLowerCase()) ||
        r.requirementCode?.toLowerCase().includes(reqSearchQuery.toLowerCase()) ||
        r.department?.toLowerCase().includes(reqSearchQuery.toLowerCase());
      const matchDept = reqSelectedDept === 'ALL' || r.department === reqSelectedDept;
      const matchStatus = reqSelectedStatus === 'ALL' || r.status === reqSelectedStatus;
      return matchSearch && matchDept && matchStatus;
    });
  }, [requirements, reqSearchQuery, reqSelectedDept, reqSelectedStatus]);

  // Active requirement in dropdown
  const currentPipelineReq = useMemo(() => {
    if (pipelineReqId === 'ALL') return null;
    return requirements.find(r => r.id === pipelineReqId) || null;
  }, [requirements, pipelineReqId]);

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden pb-16 px-2 sm:px-4">
      {/* ── TOP HEADER (Recruitment Hub) ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Recruitment Hub
          </h1>
          {/* Active Navigation Tabs */}
          <div className="flex items-center gap-6 mt-3 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`pb-2.5 text-sm font-semibold transition relative ${activeTab === 'dashboard'
                  ? 'text-[#C77E52] border-b-2 border-[#C77E52]'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`pb-2.5 text-sm font-semibold transition relative ${activeTab === 'pipeline'
                  ? 'text-[#C77E52] border-b-2 border-[#C77E52]'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              ATS Pipeline
            </button>
          </div>
        </div>

        {/* Top Right Action Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleOpenReqModal()}
            className="px-4 py-2 bg-[#C77E52] hover:bg-[#B36F46] text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.5} /> Create Requirement
          </button>
        </div>
      </div>

      {/* ── TAB 1: DASHBOARD (8 Real Metric Cards & Requisitions Table) ────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 pt-2">
          {/* 8 Real Database KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'Open Positions', value: stats.openPositions, color: 'text-emerald-700', bg: 'bg-emerald-50/80 border-emerald-200' },
              { label: 'Draft Requirements', value: stats.draftRequirements, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
              { label: 'Total Candidates', value: stats.totalCandidates, color: 'text-blue-700', bg: 'bg-blue-50/80 border-blue-200' },
              { label: 'In Screening', value: stats.candidatesInScreening, color: 'text-amber-700', bg: 'bg-amber-50/80 border-amber-200' },
              { label: 'Interviews Today', value: stats.interviewsToday, color: 'text-indigo-700', bg: 'bg-indigo-50/80 border-indigo-200' },
              { label: 'Pending Offers', value: stats.pendingOffers, color: 'text-pink-700', bg: 'bg-pink-50/80 border-pink-200' },
              { label: 'Joined', value: stats.joined, color: 'text-green-700', bg: 'bg-green-50/80 border-green-200' },
              { label: 'Closed Positions', value: stats.closedPositions, color: 'text-rose-700', bg: 'bg-rose-50/80 border-rose-200' }
            ].map((stat, i) => (
              <div key={i} className={`p-3 rounded-xl border ${stat.bg} shadow-xs transition hover:shadow-sm`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-tight line-clamp-1">{stat.label}</p>
                <p className={`text-xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Requisitions Catalog Header & Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="Search requisitions, titles, codes..."
                  value={reqSearchQuery}
                  onChange={(e) => setReqSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#C77E52]/20 focus:border-[#C77E52] outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={reqSelectedDept}
                  onChange={(e) => setReqSelectedDept(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map((d, i) => <option key={i} value={d}>{d}</option>)}
                </select>

                <select
                  value={reqSelectedStatus}
                  onChange={(e) => setReqSelectedStatus(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="OPEN">Open</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Code & Position</th>
                    <th className="px-4 py-3">Department & Mode</th>
                    <th className="px-4 py-3">Openings & Hired</th>
                    <th className="px-4 py-3">Pipeline</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {filteredRequirements.map((req) => {
                    const publishedPost = req.jobPosts?.find((jp: any) => jp.status === 'PUBLISHED') || req.jobPosts?.[0];
                    return (
                      <tr key={req.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#C77E52] bg-orange-50 px-1.5 py-0.5 rounded text-[10.5px] border border-orange-100">
                              {req.requirementCode}
                            </span>
                            <span className="font-bold text-slate-900 text-xs">{req.jobTitle}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                            <MapPin size={11} /> {req.location || 'Headquarters'} • {req.experience || '2+ Yrs'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{req.department || 'General'}</p>
                          <p className="text-[11px] text-slate-400">{req.employmentType} • {req.workMode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{req.filledCount || 0} / {req.numberOfOpenings}</span>
                            <span className="text-[10px] text-slate-400">Filled</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setPipelineReqId(req.id);
                              setActiveTab('pipeline');
                            }}
                            className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-md font-bold text-[11px] flex items-center gap-1 transition"
                          >
                            <Users size={13} /> {req.applicantsCount || 0} Candidates
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${req.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : req.status === 'DRAFT' ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Copy Public Link + Open Public Link */}
                            {req.status === 'OPEN' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPublicJobLink(publishedPost?.jobCode || req.requirementCode)}
                                  className="p-1.5 hover:bg-orange-50 text-slate-500 hover:text-[#C77E52] rounded transition cursor-pointer"
                                  title={`Copy Public Job Link (${publishedPost?.jobCode || req.requirementCode})`}
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenPublicJobLink(publishedPost?.jobCode || req.requirementCode)}
                                  className="p-1.5 hover:bg-orange-50 text-slate-500 hover:text-[#C77E52] rounded transition cursor-pointer"
                                  title={`Open Public Careers Page (${publishedPost?.jobCode || req.requirementCode})`}
                                >
                                  <ExternalLink size={14} />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleOpenReqModal(req)}
                              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
                              title="Edit Requisition"
                            >
                              <Eye size={14} />
                            </button>
                            {req.status === 'DRAFT' ? (
                              <button
                                onClick={() => handleStatusChange(req.id, 'OPEN')}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10.5px] font-bold transition"
                              >
                                Publish
                              </button>
                            ) : req.status === 'OPEN' ? (
                              <button
                                onClick={() => handleStatusChange(req.id, 'CLOSED')}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10.5px] font-bold transition"
                              >
                                Close
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ATS PIPELINE (KANBAN BOARD MATCHING USER SCREENSHOT) ───── */}
      {activeTab === 'pipeline' && (
        <div className="space-y-4 pt-1">
          {/* Top Filter Bar (Job selector, Search, Score, Status, More Filters) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2.5">
            {/* 1. Job selector */}
            <div className="relative">
              <select
                value={pipelineReqId}
                onChange={(e) => setPipelineReqId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 bg-white outline-none cursor-pointer hover:border-slate-300"
              >
                <option value="ALL">All Requisitions ({requirements.length})</option>
                {requirements.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.jobTitle} — {r.numberOfOpenings} Openings
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Candidate Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={pipelineSearch}
                onChange={(e) => setPipelineSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-[#C77E52] focus:border-[#C77E52] outline-none"
              />
            </div>

            {/* 3. Score Filter */}
            <div className="relative">
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value as any)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none cursor-pointer"
              >
                <option value="ANY">Score (Any)</option>
                <option value="90">★ 90%+ Match</option>
                <option value="70">★ 70%+ Match</option>
                <option value="50">★ 50%+ Match</option>
                <option value="30">★ 30%+ Match</option>
              </select>
            </div>

            {/* 4. Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none cursor-pointer"
              >
                <option value="All">Status (All Stages)</option>
                <option value="Active">Status (Active Stages)</option>
                <option value="Rejected">Status (Declined / Rejected)</option>
              </select>
            </div>

            {/* 5. More Filters Toggle */}
            <div className="relative">
              <button
                onClick={() => setMoreFiltersOpen(!moreFiltersOpen)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 outline-none transition cursor-pointer"
              >
                <Filter size={13} /> More Filters <ChevronDown size={13} />
              </button>

              {/* More Filters Dropdown Panel */}
              {moreFiltersOpen && (
                <>
                  {/* Invisible backdrop to close on outside click */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMoreFiltersOpen(false)}
                  />

                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800">Advanced Filters</span>
                      <button
                        onClick={() => setMoreFilters({ department: 'ALL', experienceType: 'ALL', location: '' })}
                        className="text-[10px] text-[#C77E52] hover:underline font-bold"
                      >
                        Reset All
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Department</label>
                      <select
                        value={moreFilters.department}
                        onChange={(e) => setMoreFilters({ ...moreFilters, department: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white"
                      >
                        <option value="ALL">All Departments</option>
                        {departments.map((d, i) => <option key={i} value={d}>{d}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Experience Type</label>
                      <select
                        value={moreFilters.experienceType}
                        onChange={(e) => setMoreFilters({ ...moreFilters, experienceType: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white"
                      >
                        <option value="ALL">Any Experience</option>
                        <option value="Fresher">Fresher</option>
                        <option value="Experienced">Experienced</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">City / Location</label>
                      <input
                        type="text"
                        placeholder="e.g. Ahmedabad"
                        value={moreFilters.location}
                        onChange={(e) => setMoreFilters({ ...moreFilters, location: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>

                    <button
                      onClick={() => setMoreFiltersOpen(false)}
                      className="w-full py-1.5 bg-[#C77E52] hover:bg-[#B36F46] text-white text-xs font-bold rounded-lg mt-2 transition"
                    >
                      Apply Filters
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Public Job Careers Page Actions if active requisition selected */}
            {currentPipelineReq && (
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyPublicJobLink(currentPipelineReq.jobPosts?.[0]?.jobCode || currentPipelineReq.requirementCode)}
                  className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-600 hover:text-[#C77E52] border border-slate-200 hover:border-orange-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Copy Public Job Link to Clipboard"
                >
                  <Copy size={13} /> Copy Link
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenPublicJobLink(currentPipelineReq.jobPosts?.[0]?.jobCode || currentPipelineReq.requirementCode)}
                  className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#C77E52] border border-orange-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title={`Open Public Careers Job Page (${currentPipelineReq.jobPosts?.[0]?.jobCode || currentPipelineReq.requirementCode})`}
                >
                  <ExternalLink size={13} /> Public Job Link
                </button>
              </div>
            )}
          </div>

          {/* Sub-Tabs: Active Pipeline (5 Stages) vs Declined / Rejected */}
          {(() => {
            const activeCandidates = applications.filter(a => a.status !== 'REJECTED');
            const rejectedCandidates = applications.filter(a => a.status === 'REJECTED');
            const declinedCount = rejectedCandidates.filter(a => a.previousStatus === 'OFFER' || a.rejectionReason?.toLowerCase().includes('decline')).length;

            return (
              <div className="space-y-3 w-full min-w-0">
                {/* View Switcher & Notification Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPipelineViewTab('active')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                        pipelineViewTab === 'active'
                          ? 'bg-[#C77E52] text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>Active Pipeline</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-bold ${
                        pipelineViewTab === 'active' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {activeCandidates.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPipelineViewTab('rejected')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                        pipelineViewTab === 'rejected'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-700 border border-slate-200'
                      }`}
                    >
                      <span>Declined & Rejected</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-bold ${
                        pipelineViewTab === 'rejected'
                          ? 'bg-white/20 text-white'
                          : rejectedCandidates.length > 0
                          ? 'bg-rose-100 text-rose-700 font-bold'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {rejectedCandidates.length}
                      </span>
                    </button>
                  </div>

                  {pipelineViewTab === 'active' && declinedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPipelineViewTab('rejected')}
                      className="text-xs text-rose-700 hover:text-rose-800 font-bold flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-lg border border-rose-200 transition cursor-pointer"
                    >
                      <AlertCircle size={13} className="text-rose-600" />
                      <span>{declinedCount} Candidate{declinedCount > 1 ? 's' : ''} Declined Offer</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>

                {pipelineLoading ? (
                  <div className="py-20 text-center text-slate-500 flex flex-col items-center gap-2 bg-white rounded-xl border border-slate-200">
                    <RefreshCw className="animate-spin text-[#C77E52]" size={24} />
                    <p className="text-xs font-semibold">Loading candidate pipeline...</p>
                  </div>
                ) : pipelineViewTab === 'active' ? (
                  /* ── 5 EQUAL COLUMNS (NO HORIZONTAL SCROLL) ── */
                  <div className="grid grid-cols-5 gap-2.5 items-start w-full min-w-0 pb-6">
                    {KANBAN_STAGES.map((stage) => {
                      const stageApps = activeCandidates.filter(a => stage.matchStatuses.includes(a.status));

                      return (
                        <div
                          key={stage.id}
                          className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-2 flex flex-col gap-2 min-w-0 w-full"
                        >
                          {/* Stage Header: dot + Name + count pill */}
                          <div className="bg-white px-2 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between font-bold text-[11.5px] text-slate-800 shadow-2xs min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${stage.dotColor}`} />
                              <span className="truncate">{stage.label}</span>
                            </div>
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full text-[10.5px] font-bold shrink-0">
                              {stageApps.length}
                            </span>
                          </div>

                          {/* Candidate Cards List */}
                          <div className="space-y-2 max-h-[750px] overflow-y-auto pr-0.5 min-w-0">
                            {stageApps.map((app) => {
                              const score = app.atsMatchScore || 0;
                              const matchPillClass = score >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                : score >= 60 ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                                : 'text-slate-600 bg-slate-100 border-slate-200';

                              return (
                                <div
                                  key={app.id}
                                  onClick={() => handleOpenCandidateDrawer(app)}
                                  className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-[#C77E52]/60 transition cursor-pointer group min-w-0 w-full"
                                >
                                  {/* Card Top Row: Candidate Name uppercase + 3 dots */}
                                  <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                                    <h4 className="font-extrabold text-slate-900 text-[11px] uppercase truncate group-hover:text-[#C77E52] tracking-tight">
                                      {app.fullName}
                                    </h4>
                                    <span className="text-slate-400 hover:text-slate-600 p-0.5 shrink-0">
                                      <MoreVertical size={12} />
                                    </span>
                                  </div>

                                  {/* Second Row: APP ID + ATS Score pill */}
                                  <div className="flex items-center justify-between gap-1 mb-1.5 min-w-0">
                                    <span className="text-[9.5px] font-semibold text-slate-400 truncate">
                                      {app.applicationId}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border flex items-center gap-0.5 shrink-0 ${matchPillClass}`}>
                                      <Sparkles size={9} className="shrink-0" /> {score}%
                                    </span>
                                  </div>

                                  {/* Third Row: Role and Experience */}
                                  <p className="text-[10.5px] text-slate-600 truncate font-medium">
                                    {app.requirement?.jobTitle || 'Python Developer'}
                                  </p>
                                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                    {app.experienceType === 'Fresher' ? 'Fresher' : `${app.yearsExperience || '0'} Years Exp`}
                                  </p>

                                  {/* Mini action footer on card hover */}
                                  <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[9.5px] text-slate-400">
                                    <span className="truncate">{app.city || 'Remote'}</span>
                                    <span className="text-[#C77E52] font-bold group-hover:underline shrink-0">Profile →</span>
                                  </div>
                                </div>
                              );
                            })}

                            {stageApps.length === 0 && (
                              <div className="py-8 text-center text-slate-400 text-xs font-normal">
                                No candidates
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── DEDICATED DECLINED & REJECTED CANDIDATES VIEW ── */
                  <div className="space-y-3 pb-6 w-full min-w-0">
                    {rejectedCandidates.length === 0 ? (
                      <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 space-y-2">
                        <CheckCircle2 size={32} className="mx-auto text-slate-300" />
                        <p className="font-bold text-sm text-slate-600">No Declined or Rejected Candidates</p>
                        <p className="text-xs text-slate-400">All applicants for this selection are progressing through active stages.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
                        {rejectedCandidates.map((app) => {
                          const isOfferDeclined = app.previousStatus === 'OFFER' || app.rejectionReason?.toLowerCase().includes('decline');
                          const score = app.atsMatchScore || 0;

                          return (
                            <div
                              key={app.id}
                              className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs hover:shadow-md transition space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-extrabold text-slate-900 text-sm">{app.fullName}</h4>
                                  <p className="text-[11px] text-slate-400">{app.applicationId} • {app.requirement?.jobTitle || 'Role'}</p>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                                  {isOfferDeclined ? 'Offer Declined' : 'Rejected'}
                                </span>
                              </div>

                              <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-lg text-xs space-y-1">
                                <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Decline / Rejection Reason</p>
                                <p className="font-semibold text-rose-950 text-xs">
                                  {app.rejectionReason || 'Candidate declined the offer package via email response.'}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">ATS Score</p>
                                  <p className="font-bold text-slate-800">{score}% Match</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">Experience</p>
                                  <p className="font-bold text-slate-800">{app.experienceType === 'Fresher' ? 'Fresher' : `${app.yearsExperience || '0'} Years`}</p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCandidateDrawer(app)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                                >
                                  View Profile
                                </button>

                                {isOfferDeclined ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleOpenCandidateDrawer(app);
                                      setCandidateDrawerTab('offers');
                                    }}
                                    className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
                                  >
                                    Revise & Resend Offer
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleTransitionCandidate(app.id, 'SCREENING')}
                                    className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-bold transition cursor-pointer"
                                  >
                                    Re-Open Candidate
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── MODAL 1: CREATE / EDIT REQUIREMENT ────────────────────────────── */}
      {reqModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 relative my-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingReq ? `Edit Requisition: ${editingReq.requirementCode}` : 'Create Recruitment Requirement'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Configure role specifications, qualifications, skills, and publishing options.</p>
              </div>
              <button
                onClick={() => setReqModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Job Title *</label>
                  <input
                    type="text"
                    value={reqForm.jobTitle}
                    onChange={(e) => setReqForm({ ...reqForm, jobTitle: e.target.value })}
                    placeholder="e.g. Python Full Stack Developer"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#C77E52] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department *</label>
                  <input
                    type="text"
                    list="deptsList"
                    value={reqForm.department}
                    onChange={(e) => setReqForm({ ...reqForm, department: e.target.value })}
                    placeholder="Engineering, HR, Sales..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#C77E52] outline-none"
                  />
                  <datalist id="deptsList">
                    {departments.map((d, i) => <option key={i} value={d} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={reqForm.location}
                    onChange={(e) => setReqForm({ ...reqForm, location: e.target.value })}
                    placeholder="e.g. Gandhinagar, Gujarat"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#C77E52] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Openings *</label>
                  <input
                    type="number"
                    min="1"
                    value={reqForm.numberOfOpenings}
                    onChange={(e) => setReqForm({ ...reqForm, numberOfOpenings: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-[#C77E52] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Employment Type</label>
                  <select
                    value={reqForm.employmentType}
                    onChange={(e) => setReqForm({ ...reqForm, employmentType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-[#C77E52] outline-none"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Salary Range (Min ₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 900000"
                    value={reqForm.salaryMin}
                    onChange={(e) => setReqForm({ ...reqForm, salaryMin: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Salary Range (Max ₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1400000"
                    value={reqForm.salaryMax}
                    onChange={(e) => setReqForm({ ...reqForm, salaryMax: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Experience Required</label>
                  <input
                    type="text"
                    placeholder="e.g. 3 Years"
                    value={reqForm.experience}
                    onChange={(e) => setReqForm({ ...reqForm, experience: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Required Skills (Comma separated) *</label>
                <input
                  type="text"
                  placeholder="Python, Django, React, PostgreSQL, Docker, Git"
                  value={reqForm.requiredSkills}
                  onChange={(e) => setReqForm({ ...reqForm, requiredSkills: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Job Description</label>
                <textarea
                  rows={3}
                  placeholder="Overview of the position, scope of work, and project context..."
                  value={reqForm.jobDescription}
                  onChange={(e) => setReqForm({ ...reqForm, jobDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Key Responsibilities</label>
                <textarea
                  rows={2}
                  placeholder="Day-to-day responsibilities, deliverables, team collaboration..."
                  value={reqForm.responsibilities}
                  onChange={(e) => setReqForm({ ...reqForm, responsibilities: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hiring Manager</label>
                  <input
                    type="text"
                    placeholder="Lead Engineer"
                    value={reqForm.hiringManager}
                    onChange={(e) => setReqForm({ ...reqForm, hiringManager: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Recruiter</label>
                  <input
                    type="text"
                    placeholder="HR Lead"
                    value={reqForm.recruiter}
                    onChange={(e) => setReqForm({ ...reqForm, recruiter: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={reqForm.priority}
                    onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setReqModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveRequisition('DRAFT')}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveRequisition('OPEN')}
                  className="px-4 py-2 bg-[#C77E52] hover:bg-[#B36F46] text-white rounded-lg text-xs font-bold shadow-sm transition"
                >
                  {editingReq ? 'Update & Publish' : 'Publish Requisition'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RIGHT-SIDE SLIDE-OVER DRAWER: CANDIDATE PROFILE & ACTIONS ─────────────────── */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
            onClick={() => setSelectedCandidate(null)}
          />

          {/* Right-Side Slide Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 z-50">
            <div className="w-screen max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ease-out">
              {/* Drawer Header with High Contrast Styles */}
              <div className="p-5 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between shrink-0 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                      className="px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide"
                    >
                      {selectedCandidate.applicationId}
                    </span>
                    <span
                      style={{ color: '#ffffff', backgroundColor: '#C77E52' }}
                      className="px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase"
                    >
                      {selectedCandidate.status}
                    </span>
                  </div>
                  <h3
                    style={{ color: '#ffffff' }}
                    className="text-xl font-black text-white !text-white mt-2 uppercase tracking-wide"
                  >
                    {selectedCandidate.fullName}
                  </h3>
                  <p
                    style={{ color: '#cbd5e1' }}
                    className="text-xs text-slate-300 !text-slate-300 mt-0.5"
                  >
                    Applied for: <span style={{ color: '#ffffff' }} className="font-semibold text-white">{selectedCandidate.requirement?.jobTitle || 'General Position'}</span> • {selectedCandidate.city || 'Remote'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  style={{ color: '#ffffff' }}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold transition cursor-pointer shrink-0"
                  title="Close Drawer"
                >
                  <X size={18} className="text-white" />
                </button>
              </div>

              {/* Candidate Sub-Navigation Tabs (Phase-wise Dynamic) */}
              <div className="flex items-center border-b border-slate-200 px-6 bg-slate-50 gap-4 overflow-x-auto text-xs font-bold shrink-0">
                {(() => {
                  const status = selectedCandidate.status;
                  let tabs = [
                    { id: 'overview', label: 'Overview' },
                    { id: 'ats', label: 'AI ATS Breakdown' },
                    { id: 'timeline', label: 'Timeline' }
                  ];

                  if (status === 'SCREENING' || status === 'SHORTLISTED') {
                    tabs = [
                      { id: 'overview', label: 'Overview' },
                      { id: 'ats', label: 'AI ATS Breakdown' },
                      { id: 'screening', label: 'Screening Notes' },
                      { id: 'timeline', label: 'Timeline' }
                    ];
                  } else if (status === 'INTERVIEW' || status === 'SELECTED') {
                    tabs = [
                      { id: 'overview', label: 'Overview' },
                      { id: 'ats', label: 'AI ATS Breakdown' },
                      { id: 'interviews', label: 'Interviews & Feedback' },
                      { id: 'timeline', label: 'Timeline' }
                    ];
                  } else if (status === 'OFFER_SENT' || status === 'OFFER') {
                    tabs = [
                      { id: 'overview', label: 'Overview' },
                      { id: 'offers', label: 'Offer Letter' },
                      { id: 'interviews', label: 'Interview History' },
                      { id: 'timeline', label: 'Timeline' }
                    ];
                  } else if (status === 'JOINED') {
                    tabs = [
                      { id: 'overview', label: 'Overview & Onboarding' },
                      { id: 'offers', label: 'Offer Details' },
                      { id: 'timeline', label: 'Timeline' }
                    ];
                  }

                  return tabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCandidateDrawerTab(tab.id as any)}
                      className={`py-3.5 border-b-2 transition shrink-0 cursor-pointer ${candidateDrawerTab === tab.id
                          ? 'border-[#C77E52] text-[#C77E52]'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ));
                })()}
              </div>

              {/* Tab Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
                {/* TAB A: OVERVIEW */}
                {candidateDrawerTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase">Email</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedCandidate.email}</p>
                      </div>
                      <div>
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase">Mobile Phone</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedCandidate.mobile}</p>
                      </div>
                      <div>
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase">Experience</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">
                          {selectedCandidate.experienceType === 'Fresher' ? 'Fresher' : `${selectedCandidate.yearsExperience || '0'} Years (${selectedCandidate.currentCompany || 'N/A'})`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase">Education</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedCandidate.highestQualification || 'Not Specified'}</p>
                      </div>
                    </div>

                    {/* Resume Document Link (Inline Preview) */}
                    {selectedCandidate.resumePath && (
                      <div className="p-3 bg-orange-50/60 border border-orange-200/80 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="text-[#C77E52]" size={18} />
                          <div>
                            <p className="font-bold text-slate-800">Resume Document</p>
                            <p className="text-[10.5px] text-slate-500">{selectedCandidate.resumePath}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePreviewResume(selectedCandidate.resumePath)}
                          className="px-3 py-1.5 bg-[#C77E52] hover:bg-[#B36F46] text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                        >
                          <Eye size={13} /> View Resume
                        </button>
                      </div>
                    )}

                    {/* Skills tags */}
                    <div>
                      <p className="font-bold text-slate-800 mb-1.5">Candidate Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedCandidate.candidateSkills || '').split(',').map((skill: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[11px]">
                            {skill.trim()}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Pipeline Sequential Stage Action Bar */}
                    <div className="pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="font-bold text-slate-800">Next Action Step:</p>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Current Stage: <strong className="text-slate-700">{selectedCandidate.status}</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Step 1: NEW -> Move to Screening */}
                        {selectedCandidate.status === 'NEW' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'SCREENING')}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            >
                              <ArrowRight size={14} /> Move to Screening
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'REJECTED')}
                              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs ml-auto transition cursor-pointer"
                            >
                              Reject Candidate
                            </button>
                          </>
                        )}

                        {/* Step 2: SCREENING or SHORTLISTED -> Schedule Interview */}
                        {(selectedCandidate.status === 'SCREENING' || selectedCandidate.status === 'SHORTLISTED') && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCandidateDrawerTab('interviews')}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            >
                              <Calendar size={14} /> Schedule Interview
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'INTERVIEW')}
                              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition cursor-pointer"
                            >
                              Move to Interview
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'REJECTED')}
                              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs ml-auto transition cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Step 3: INTERVIEW -> Select Candidate */}
                        {selectedCandidate.status === 'INTERVIEW' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'SELECTED')}
                              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            >
                              <Check size={14} /> Select Candidate
                            </button>
                            <button
                              type="button"
                              onClick={() => setCandidateDrawerTab('interviews')}
                              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition cursor-pointer"
                            >
                              Submit Interview Feedback
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'REJECTED')}
                              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs ml-auto transition cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Step 4: SELECTED -> Create Offer */}
                        {selectedCandidate.status === 'SELECTED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCandidateDrawerTab('offers')}
                              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            >
                              <FileText size={14} /> Create & Send Offer Letter
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'REJECTED')}
                              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs ml-auto transition cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Step 5: OFFER_SENT / OFFER -> Mark as Joined */}
                        {(selectedCandidate.status === 'OFFER_SENT' || selectedCandidate.status === 'OFFER') && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'JOINED')}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            >
                              <CheckCircle2 size={14} /> Mark as Joined (Auto-Onboard)
                            </button>
                            <button
                              type="button"
                              onClick={() => setCandidateDrawerTab('offers')}
                              className="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl font-bold text-xs transition cursor-pointer"
                            >
                              View Offer Details
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionCandidate(selectedCandidate.id, 'REJECTED')}
                              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs ml-auto transition cursor-pointer"
                            >
                              Withdraw / Decline
                            </button>
                          </>
                        )}

                        {/* Step 6: JOINED -> Completed Status Banner */}
                        {selectedCandidate.status === 'JOINED' && (
                          <div className="w-full p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800">
                            <div className="flex items-center gap-2.5">
                              <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
                              <div>
                                <p className="font-bold text-xs text-emerald-950">Candidate Successfully Joined & Onboarded</p>
                                <p className="text-[11px] text-emerald-700 mt-0.5">Profile automatically created in the ZeniaHR Employee Management directory.</p>
                              </div>
                            </div>
                            <span className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg text-xs shrink-0 shadow-2xs">
                              Hired ✓
                            </span>
                          </div>
                        )}

                        {/* Step 7: REJECTED / DECLINED -> Clear Status Banner & Re-Open Options */}
                        {selectedCandidate.status === 'REJECTED' && (
                          <div className="w-full p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between flex-wrap gap-3 text-rose-900">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                <XCircle size={22} />
                              </div>
                              <div>
                                <p className="font-extrabold text-xs sm:text-sm text-rose-950">
                                  {selectedCandidate.previousStatus === 'OFFER' || selectedCandidate.rejectionReason?.toLowerCase().includes('decline')
                                    ? 'Offer Package Declined by Candidate'
                                    : 'Candidate Not Selected / Rejected'}
                                </p>
                                <p className="text-[11.5px] text-rose-700 mt-0.5 font-medium">
                                  Reason: <strong>{selectedCandidate.rejectionReason || 'Candidate declined the offer package via email response.'}</strong>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(selectedCandidate.previousStatus === 'OFFER' || selectedCandidate.rejectionReason?.toLowerCase().includes('decline')) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleTransitionCandidate(selectedCandidate.id, 'SELECTED');
                                    setCandidateDrawerTab('offers');
                                  }}
                                  className="px-3.5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs"
                                >
                                  Revise & Resend Offer
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleTransitionCandidate(selectedCandidate.id, 'SCREENING')}
                                className="px-3 py-2 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-bold rounded-lg text-xs transition cursor-pointer shadow-2xs"
                              >
                                Re-Open to Screening
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB B: ATS BREAKDOWN (explainable weighted scoring) */}
                {candidateDrawerTab === 'ats' && (() => {
                  const mb = selectedCandidate.matchBreakdown || {};
                  const isV2 = mb.engineVersion >= 2 && Array.isArray(mb.components);
                  const isFailed = selectedCandidate.analysisStatus === 'FAILED' || mb.failed;
                  const isProcessing = selectedCandidate.analysisStatus === 'PROCESSING' || selectedCandidate.analysisStatus === 'PENDING';
                  const barColors: Record<string, string> = {
                    skills: 'bg-emerald-500', experience: 'bg-indigo-500', role: 'bg-amber-500',
                    education: 'bg-teal-500', preferred: 'bg-violet-500', other: 'bg-sky-500'
                  };
                  // Legacy (pre-v2) analyses render from the stored int columns
                  const legacyRows = [
                    { key: 'skills', label: 'Skills Match', score: selectedCandidate.skillsScore || 0, max: 40 },
                    { key: 'experience', label: 'Relevant Experience', score: selectedCandidate.experienceScore || 0, max: 25 },
                    { key: 'role', label: 'Role & Project Relevance', score: selectedCandidate.projectsScore || 0, max: 15 },
                    { key: 'education', label: 'Education', score: selectedCandidate.educationScore || 0, max: 10 },
                    { key: 'other', label: 'Preferred & Other Requirements', score: selectedCandidate.jobDescriptionScore || 0, max: 10 }
                  ];
                  const rows = isV2 ? mb.components : legacyRows;
                  const matched = Array.isArray(selectedCandidate.matchedSkills) ? selectedCandidate.matchedSkills : [];
                  const missing = Array.isArray(selectedCandidate.missingSkills) ? selectedCandidate.missingSkills : [];
                  const exp = mb.experience || {};

                  return (
                    <div className="space-y-4">
                      {/* Overall ATS Score Box */}
                      <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Overall Match Rating</span>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className={`text-3xl font-black ${isFailed ? 'text-rose-400' : (selectedCandidate.atsMatchScore || 0) >= 75 ? 'text-emerald-400' : (selectedCandidate.atsMatchScore || 0) >= 50 ? 'text-amber-300' : 'text-rose-300'}`}>
                              {isProcessing ? '…' : `${selectedCandidate.atsMatchScore || 0}%`}
                            </span>
                            <span className="text-xs text-slate-300 font-semibold">
                              ({selectedCandidate.analysisStatus || 'COMPLETED'})
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleRetryATS}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <RefreshCw size={13} /> Retry ATS Analysis
                        </button>
                      </div>

                      {isProcessing && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
                          Resume analysis is running in the background. Refresh in a few seconds.
                        </div>
                      )}

                      {isFailed && (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                          <p className="font-bold mb-1">Resume could not be analyzed</p>
                          <p>{selectedCandidate.aiSummary || 'Text could not be extracted from the uploaded file.'}</p>
                        </div>
                      )}

                      {!isFailed && !isProcessing && (
                        <>
                          {/* Weighted Breakdown Progress Bars */}
                          <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="font-bold text-slate-800 mb-2">Weighted ATS Scoring:</p>
                            {rows.map((c: any) => (
                              <div key={c.key}>
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                                  <span>{c.label} {c.na ? '' : `(${c.max}%)`}</span>
                                  <span>{c.na ? 'N/A — not defined on job' : `${c.score} / ${c.max}`}</span>
                                </div>
                                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`${c.na ? 'bg-slate-300' : (barColors[c.key] || 'bg-slate-400')} h-2 rounded-full`}
                                    style={{ width: c.na ? '0%' : `${Math.min(100, (c.score / c.max) * 100)}%` }}
                                  />
                                </div>
                                {isV2 && c.detail && (
                                  <p className="text-[10px] text-slate-500 mt-0.5">{c.detail}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Experience: required vs identified */}
                          {isV2 && exp.requiredYears > 0 && (
                            <div className="p-3 bg-white border border-slate-200 rounded-xl grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Required Experience</p>
                                <p className="font-bold text-slate-800">{exp.requiredLabel || `${exp.requiredYears}+ years`}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resume Analysis</p>
                                <p className="font-bold text-slate-800">
                                  {exp.candidateYears === null || exp.candidateYears === undefined
                                    ? 'Not identified'
                                    : `~${exp.candidateYears} year(s) relevant experience`}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Matched vs Missing Skills Chips */}
                          <div className="space-y-2">
                            <p className="font-bold text-slate-800">Matched (candidate profile + resume):</p>
                            <div className="flex flex-wrap gap-1.5">
                              {matched.length === 0 && (
                                <span className="text-[11px] text-slate-400 font-semibold">No required skills were identified in the candidate profile or resume.</span>
                              )}
                              {matched.map((s: string, i: number) => {
                                const detail = isV2 ? (mb.skills?.required || []).find((r: any) => r.skill === s) : null;
                                const sourceTag = detail?.source === 'profile' ? 'profile'
                                  : detail?.source === 'profile+resume' ? 'profile + resume'
                                  : detail?.matchType === 'implied' ? `via ${detail.via}`
                                  : null;
                                return (
                                  <span
                                    key={i}
                                    title={detail?.source ? `Evidence: ${detail.source}${detail.matchType === 'implied' ? ` (via "${detail.via}")` : ''}` : undefined}
                                    className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold text-[11px]"
                                  >
                                    ✓ {s}{sourceTag ? <span className="font-semibold text-emerald-600/80"> ({sourceTag})</span> : ''}
                                  </span>
                                );
                              })}
                            </div>

                            {missing.length > 0 && (
                              <>
                                <p className="font-bold text-slate-800 mt-3">Missing / Not identified:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {missing.map((s: string, i: number) => (
                                    <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-bold text-[11px]">
                                      ✕ {s}
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}

                            {isV2 && (mb.skills?.preferred || []).length > 0 && (
                              <>
                                <p className="font-bold text-slate-800 mt-3">Preferred Skills:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(mb.skills.preferred || []).map((p: any, i: number) => (
                                    <span key={i} className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${p.matched ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                      {p.matched ? '✓' : '✕'} {p.skill}
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Warnings */}
                          {Array.isArray(selectedCandidate.warnings) && selectedCandidate.warnings.length > 0 && (
                            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                              {selectedCandidate.warnings.map((w: string, i: number) => (
                                <p key={i} className="text-[11px] text-amber-800 font-semibold">⚠ {w}</p>
                              ))}
                            </div>
                          )}

                          {/* Analysis Summary */}
                          {selectedCandidate.aiSummary && (
                            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                              <p className="font-bold text-indigo-900 mb-1 flex items-center gap-1.5">
                                <Bot size={14} /> Analysis Summary
                              </p>
                              <p className="text-slate-700 text-xs leading-relaxed">{selectedCandidate.aiSummary}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* TAB C: SCREENING */}
                {candidateDrawerTab === 'screening' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Screening Evaluation Notes</label>
                      <textarea
                        rows={4}
                        value={screeningNotes}
                        onChange={(e) => setScreeningNotes(e.target.value)}
                        placeholder="Candidate demonstrated strong communication and Python knowledge during initial screening..."
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-xs outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <select
                        value={screeningDecision}
                        onChange={(e) => setScreeningDecision(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-bold"
                      >
                        <option value="SHORTLIST">Shortlist for Interview</option>
                        <option value="SCREENING">Keep in Screening</option>
                        <option value="REJECT">Reject</option>
                      </select>

                      <button
                        onClick={handleSaveScreening}
                        className="px-4 py-2 bg-[#C77E52] text-white rounded-lg text-xs font-bold"
                      >
                        Save Evaluation
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB D: INTERVIEWS & FEEDBACK */}
                {candidateDrawerTab === 'interviews' && (
                  <div className="space-y-4">
                    {/* 1. Scheduled & Confirmed Interview Rounds List (Top Priority) */}
                    {Array.isArray(selectedCandidate.interviews) && selectedCandidate.interviews.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <Calendar size={16} className="text-[#C77E52]" />
                            <span>Interview Rounds Progression ({selectedCandidate.interviews.length})</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowScheduleForm(!showScheduleForm)}
                            className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-[#C77E52] border border-orange-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          >
                            {showScheduleForm ? <X size={12} /> : <Plus size={12} />}
                            {showScheduleForm ? 'Close Scheduler' : 'Schedule Another Round'}
                          </button>
                        </div>

                        <div className="space-y-3">
                          {selectedCandidate.interviews.map((int: any, idx: number) => {
                            const isConfirmed = int.status === 'SCHEDULED' && int.scheduledDate;
                            const isCompleted = int.status === 'COMPLETED' || int.overallRating;
                            const isPending = int.status === 'PENDING' || (!int.scheduledDate && !isCompleted);

                            return (
                              <div
                                key={int.id || idx}
                                className={`p-4 bg-white rounded-xl border transition-all space-y-3 ${isConfirmed
                                    ? 'border-emerald-300 shadow-sm ring-1 ring-emerald-500/10'
                                    : isCompleted
                                      ? 'border-blue-200 shadow-2xs'
                                      : 'border-slate-200 shadow-2xs'
                                  }`}
                              >
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-orange-100 text-[#C77E52] font-bold text-xs flex items-center justify-center">
                                      {selectedCandidate.interviews.length - idx}
                                    </span>
                                    <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                                      {int.interviewType || 'Technical Round'}
                                    </span>
                                  </div>

                                  {/* Flow Stage Badge */}
                                  <div>
                                    {isCompleted ? (
                                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                        <Check size={12} /> Interview Completed
                                      </span>
                                    ) : isConfirmed ? (
                                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Slot Confirmed
                                      </span>
                                    ) : (
                                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                        <Clock size={11} /> Awaiting Candidate Booking
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Interview Date & Time Range Details */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100/70 text-[#C77E52] flex items-center justify-center shrink-0">
                                      <Calendar size={15} />
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Interview Date</p>
                                      <p className="font-bold text-slate-800 text-xs sm:text-sm">
                                        {int.scheduledDate
                                          ? new Date(int.scheduledDate).toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                          })
                                          : 'Candidate has not selected date yet'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100/70 text-[#C77E52] flex items-center justify-center shrink-0">
                                      <Clock size={15} />
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Time & Duration</p>
                                      <p className="font-bold text-slate-800 text-xs sm:text-sm">
                                        {int.scheduledTime
                                          ? `${int.scheduledTime}${int.scheduledEndTime ? ` – ${int.scheduledEndTime}` : ''} IST (${int.duration || 30} mins)`
                                          : `Duration: ${int.duration || 30} mins slot`}
                                      </p>
                                      {int.schedulingSource === 'CANDIDATE' && int.scheduledTime && (
                                        <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                                          Selected by Candidate
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Availability window / mode & link details */}
                                {(int.availableFrom || int.interviewMode || int.meetingLink) && (
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-medium">
                                    {!int.scheduledDate && int.availableFrom && int.availableTo && (
                                      <span>Window: <strong className="text-slate-700">{int.availableFrom} → {int.availableTo}</strong> ({int.dayStartTime || '10:00'}–{int.dayEndTime || '17:00'})</span>
                                    )}
                                    {int.interviewMode && <span>Mode: <strong className="text-slate-700">{int.interviewMode}</strong></span>}
                                    {int.meetingLink && (
                                      <a href={int.meetingLink} target="_blank" rel="noreferrer" className="text-[#C77E52] font-bold hover:underline truncate max-w-[220px]">
                                        Meeting Link
                                      </a>
                                    )}
                                    {int.location && !int.meetingLink && <span>Location: <strong className="text-slate-700">{int.location}</strong></span>}
                                  </div>
                                )}

                                {/* Interviewer Info & Card Actions */}
                                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 text-xs">
                                  <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                    <Users size={13} className="text-slate-400" />
                                    <span>
                                      Interviewer: <strong>{int.interviewer || 'Hiring Team'}</strong>
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {int.token && isPending && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const url = `${window.location.origin}/?schedule=${int.token}`;
                                          navigator.clipboard.writeText(url);
                                          toast.success('Self-schedule link copied to clipboard!');
                                        }}
                                        className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#C77E52] rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer border border-orange-200"
                                      >
                                        <Copy size={12} /> Copy Invite Link
                                      </button>
                                    )}

                                    {isConfirmed && int.token && (
                                      <button
                                        type="button"
                                        onClick={() => handleReopenScheduling(int.id)}
                                        className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer border border-slate-200"
                                        title="Release this slot and let the candidate pick a new time"
                                      >
                                        <RefreshCw size={12} /> Reopen Scheduling
                                      </button>
                                    )}

                                    {isConfirmed && (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkInterviewStatus(int.id, 'COMPLETED')}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                      >
                                        <Check size={13} /> Complete Interview & Rate
                                      </button>
                                    )}

                                    {isCompleted && int.overallRating && (
                                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                                        Rating: {int.overallRating}/5 • {int.feedbackDecision || 'Completed'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Schedule New Interview Box (Only shown if no interviews exist OR user clicked "+ Schedule Another Round") */}
                    {(!selectedCandidate.interviews?.length || showScheduleForm) && (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-800 text-sm">Schedule Interview Round</p>
                          {Boolean(selectedCandidate.interviews?.length) && (
                            <button
                              type="button"
                              onClick={() => setShowScheduleForm(false)}
                              className="text-xs text-slate-400 hover:text-slate-600"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                            <input
                              type="radio"
                              name="schOpt"
                              checked={interviewForm.scheduleOption === 'FIXED'}
                              onChange={() => setInterviewForm({ ...interviewForm, scheduleOption: 'FIXED' })}
                            />
                            Fixed Date & Time
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                            <input
                              type="radio"
                              name="schOpt"
                              checked={interviewForm.scheduleOption === 'CANDIDATE'}
                              onChange={() => {
                                const today = new Date();
                                const plus2 = new Date(today.getTime() + 2 * 86400000);
                                const plus7 = new Date(today.getTime() + 7 * 86400000);
                                setInterviewForm({
                                  ...interviewForm,
                                  scheduleOption: 'CANDIDATE',
                                  availableFrom: interviewForm.availableFrom || plus2.toISOString().split('T')[0],
                                  availableTo: interviewForm.availableTo || plus7.toISOString().split('T')[0]
                                });
                              }}
                            />
                            Candidate Self-Scheduling Link
                          </label>
                        </div>

                        {interviewForm.scheduleOption === 'FIXED' ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Date</label>
                              <input
                                type="date"
                                value={interviewForm.scheduledDate}
                                onChange={(e) => setInterviewForm({ ...interviewForm, scheduledDate: e.target.value })}
                                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time</label>
                              <input
                                type="time"
                                value={interviewForm.scheduledTime}
                                onChange={(e) => setInterviewForm({ ...interviewForm, scheduledTime: e.target.value })}
                                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 bg-white p-3 rounded-lg border border-slate-200">
                            <p className="text-[11px] text-slate-500">
                              Define the window in which <strong>{selectedCandidate.email || (selectedCandidate as any).data?.email || 'the candidate'}</strong> can
                              pick their own slot. A secure scheduling link is emailed automatically.
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Available From Date *</label>
                                <input
                                  type="date"
                                  value={interviewForm.availableFrom}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, availableFrom: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Available Until Date *</label>
                                <input
                                  type="date"
                                  value={interviewForm.availableTo}
                                  min={interviewForm.availableFrom || undefined}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, availableTo: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Available Days</label>
                              <div className="flex flex-wrap gap-1.5">
                                {WEEKDAYS.map(day => {
                                  const checked = interviewForm.workingDays.includes(day);
                                  return (
                                    <button
                                      key={day}
                                      type="button"
                                      onClick={() => setInterviewForm({
                                        ...interviewForm,
                                        workingDays: checked
                                          ? interviewForm.workingDays.filter(d => d !== day)
                                          : [...interviewForm.workingDays, day]
                                      })}
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                                        checked
                                          ? 'bg-[#C77E52] text-white border-[#C77E52]'
                                          : 'bg-white text-slate-500 border-slate-200 hover:border-[#C77E52]'
                                      }`}
                                    >
                                      {day.slice(0, 3)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">From Time</label>
                                <input
                                  type="time"
                                  value={interviewForm.startTime}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, startTime: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Until Time</label>
                                <input
                                  type="time"
                                  value={interviewForm.endTime}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, endTime: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Slot Duration</label>
                                <select
                                  value={interviewForm.duration}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, duration: parseInt(e.target.value, 10) })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                >
                                  <option value={15}>15 minutes</option>
                                  <option value={30}>30 minutes</option>
                                  <option value={45}>45 minutes</option>
                                  <option value={60}>60 minutes</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Buffer (Optional)</label>
                                <select
                                  value={interviewForm.bufferMinutes}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, bufferMinutes: parseInt(e.target.value, 10) })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                >
                                  <option value={0}>No buffer</option>
                                  <option value={5}>5 minutes</option>
                                  <option value={10}>10 minutes</option>
                                  <option value={15}>15 minutes</option>
                                  <option value={30}>30 minutes</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Mode & meeting details — applies to both scheduling options */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Interview Mode</label>
                            <select
                              value={interviewForm.interviewMode}
                              onChange={(e) => setInterviewForm({ ...interviewForm, interviewMode: e.target.value })}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                            >
                              <option value="Online">Online</option>
                              <option value="Offline">Offline (In-Person)</option>
                              <option value="Phone">Phone</option>
                            </select>
                          </div>
                          <div>
                            {interviewForm.interviewMode === 'Offline' ? (
                              <>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Location / Address</label>
                                <input
                                  type="text"
                                  placeholder="Office address, floor, meeting room…"
                                  value={interviewForm.location}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, location: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                />
                              </>
                            ) : (
                              <>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  {interviewForm.interviewMode === 'Phone' ? 'Contact Number / Notes' : 'Meeting Link'}
                                </label>
                                <input
                                  type="text"
                                  placeholder={interviewForm.interviewMode === 'Phone' ? 'We will call the candidate' : 'https://meet.google.com/…'}
                                  value={interviewForm.meetingLink}
                                  onChange={(e) => setInterviewForm({ ...interviewForm, meetingLink: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                                />
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Interviewer Name</label>
                            <input
                              type="text"
                              placeholder="Lead Technical Architect"
                              value={interviewForm.interviewer}
                              onChange={(e) => setInterviewForm({ ...interviewForm, interviewer: e.target.value })}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Interview Round</label>
                            <select
                              value={interviewForm.interviewType}
                              onChange={(e) => setInterviewForm({ ...interviewForm, interviewType: e.target.value })}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                            >
                              <option value="Technical">Technical Round</option>
                              <option value="Coding & Architecture">Coding & Architecture</option>
                              <option value="HR & Culture">HR & Culture</option>
                              <option value="Managerial">Managerial</option>
                            </select>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={schedulingBusy}
                          onClick={handleScheduleInterview}
                          className={`px-4 py-2 bg-[#C77E52] hover:bg-[#B36F46] text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer ${schedulingBusy ? 'opacity-70 cursor-not-allowed' : ''
                            }`}
                        >
                          {schedulingBusy && <RefreshCw size={13} className="animate-spin" />}
                          <span>
                            {schedulingBusy
                              ? 'Generating Link...'
                              : interviewForm.scheduleOption === 'FIXED'
                                ? 'Confirm & Send Fixed Invite'
                                : 'Send Scheduling Invitation'}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Feedback Form for existing interviews */}
                    {Array.isArray(selectedCandidate.interviews) && selectedCandidate.interviews.length > 0 && (
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <p className="font-bold text-slate-800 text-sm">Submit Interview Feedback</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Technical (1-5)</label>
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={feedbackForm.technicalSkills}
                              onChange={(e) => setFeedbackForm({ ...feedbackForm, technicalSkills: parseInt(e.target.value, 10) || 5 })}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Communication (1-5)</label>
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={feedbackForm.communication}
                              onChange={(e) => setFeedbackForm({ ...feedbackForm, communication: parseInt(e.target.value, 10) || 5 })}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Culture Fit (1-5)</label>
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={feedbackForm.cultureFit}
                              onChange={(e) => setFeedbackForm({ ...feedbackForm, cultureFit: parseInt(e.target.value, 10) || 5 })}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Overall (1-5)</label>
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={feedbackForm.overallRating}
                              onChange={(e) => setFeedbackForm({ ...feedbackForm, overallRating: parseInt(e.target.value, 10) || 5 })}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs"
                            />
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          placeholder="Interviewer notes, strengths, and recommendations..."
                          value={feedbackForm.feedbackComments}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, feedbackComments: e.target.value })}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                        />

                        <div className="flex items-center gap-2">
                          <select
                            value={feedbackForm.feedbackDecision}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, feedbackDecision: e.target.value })}
                            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                          >
                            <option value="SELECTED">SELECT Candidate (Move to Selected)</option>
                            <option value="REJECTED">REJECT Candidate</option>
                            <option value="HOLD">HOLD / Next Round</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleSaveInterviewFeedback(activeFeedbackIntId || selectedCandidate.interviews[0].id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
                          >
                            Submit Decision & Scorecard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB E: OFFERS */}
                {candidateDrawerTab === 'offers' && (
                  <div className="space-y-4">
                    {/* Existing Dispatched Offers History */}
                    {Array.isArray(selectedCandidate.offers) && selectedCandidate.offers.length > 0 && (
                      <div className="space-y-3">
                        <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                          <FileText size={16} className="text-[#C77E52]" />
                          <span>Dispatched Offer History ({selectedCandidate.offers.length})</span>
                        </p>

                        <div className="space-y-3">
                          {selectedCandidate.offers.map((off: any, idx: number) => {
                            const isDeclined = off.status === 'DECLINED' || selectedCandidate.status === 'REJECTED';
                            const isAccepted = off.status === 'ACCEPTED' || selectedCandidate.status === 'JOINED';
                            const isPending = off.status === 'SENT' || off.status === 'CREATED';

                            return (
                              <div
                                key={off.id || idx}
                                className={`p-4 bg-white rounded-xl border transition space-y-3 ${isDeclined
                                    ? 'border-rose-300 bg-rose-50/20'
                                    : isAccepted
                                      ? 'border-emerald-300 bg-emerald-50/20'
                                      : 'border-slate-200'
                                  }`}
                              >
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div>
                                    <h4 className="font-bold text-slate-900 text-sm">{off.designation || 'Offer Package'}</h4>
                                    <p className="text-[11px] text-slate-500">{off.department || 'General'} • {off.employmentType || 'Full-Time'}</p>
                                  </div>

                                  <div>
                                    {isDeclined ? (
                                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                        <XCircle size={12} className="text-rose-600" /> Offer Declined by Candidate
                                      </span>
                                    ) : isAccepted ? (
                                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                        <CheckCircle2 size={12} className="text-emerald-600" /> Offer Accepted
                                      </span>
                                    ) : (
                                      <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                        <Clock size={12} className="text-amber-600" /> Sent • Awaiting Response
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Offer Details Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Offered Salary</p>
                                    <p className="font-extrabold text-slate-800 text-xs sm:text-sm">{off.salary || 'Not Specified'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Joining Date</p>
                                    <p className="font-extrabold text-slate-800 text-xs sm:text-sm">
                                      {off.joiningDate ? new Date(off.joiningDate).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                      }) : 'Immediate'}
                                    </p>
                                  </div>
                                </div>

                                {/* If Declined, show the Candidate's Reason */}
                                {isDeclined && (
                                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                                    <span className="font-bold">Candidate Feedback / Reason:</span> {selectedCandidate.rejectionReason || 'Candidate declined the offer package.'}
                                  </div>
                                )}

                                {/* Action Footer */}
                                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 text-xs">
                                  <span className="text-[11px] text-slate-400">
                                    Dispatched: {new Date(off.createdAt || Date.now()).toLocaleDateString()}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    {off.token && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const url = `${window.location.origin}/?offer=${off.token}`;
                                          navigator.clipboard.writeText(url);
                                          toast.success('Offer response link copied to clipboard!');
                                        }}
                                        className="px-2.5 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                      >
                                        <Copy size={12} /> Copy Offer Link
                                      </button>
                                    )}

                                    {isDeclined && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOfferForm({
                                            salary: off.salary || '',
                                            joiningDate: off.joiningDate || '',
                                            designation: off.designation || '',
                                            department: off.department || '',
                                            location: off.location || '',
                                            terms: off.terms || ''
                                          });
                                          toast.success('Previous offer details loaded into form below for revision.');
                                        }}
                                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
                                      >
                                        Load for Revision
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Generate / Revise Offer Form */}
                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="font-bold text-slate-800 text-sm">
                        {Array.isArray(selectedCandidate.offers) && selectedCandidate.offers.length > 0
                          ? 'Generate Revised Offer Letter Package'
                          : 'Generate Formal Job Offer Package'}
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Offered Salary (Annual ₹)</label>
                          <input
                            type="text"
                            placeholder="e.g. ₹12,00,000"
                            value={offerForm.salary}
                            onChange={(e) => setOfferForm({ ...offerForm, salary: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Expected Joining Date</label>
                          <input
                            type="date"
                            value={offerForm.joiningDate}
                            onChange={(e) => setOfferForm({ ...offerForm, joiningDate: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Designation</label>
                          <input
                            type="text"
                            placeholder={selectedCandidate.requirement?.jobTitle}
                            value={offerForm.designation}
                            onChange={(e) => setOfferForm({ ...offerForm, designation: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Location</label>
                          <input
                            type="text"
                            placeholder="Gandhinagar, Gujarat"
                            value={offerForm.location}
                            onChange={(e) => setOfferForm({ ...offerForm, location: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Terms & Conditions</label>
                        <textarea
                          rows={2}
                          value={offerForm.terms}
                          onChange={(e) => setOfferForm({ ...offerForm, terms: e.target.value })}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                        />
                      </div>

                      <button
                        onClick={handleCreateOffer}
                        className="px-4 py-2 bg-[#C77E52] hover:bg-[#B36F46] text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Send size={13} /> Dispatch Offer Letter Email
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB F: AUDIT TIMELINE */}
                {candidateDrawerTab === 'timeline' && (
                  <div className="space-y-2">
                    <p className="font-bold text-slate-800 text-sm mb-3">Audit Trail & Candidate History</p>
                    <div className="relative pl-6 space-y-4 border-l-2 border-slate-200">
                      {(selectedCandidate.timeline || []).map((t: any, i: number) => (
                        <div key={i} className="relative">
                          <span className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-[#C77E52] border-2 border-white shadow-xs" />
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                              <span>{t.action}</span>
                              <span className="text-slate-400 font-normal">{new Date(t.createdAt).toLocaleDateString()}</span>
                            </div>
                            {t.description && <p className="text-[11px] text-slate-600 mt-1">{t.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EMBEDDED RESUME PREVIEW MODAL ─────────────────── */}
      {previewResumeUrl && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#C77E52]" />
                <span style={{ color: '#ffffff' }} className="font-bold text-sm text-white !text-white">
                  Candidate Resume Document
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewResumeUrl}
                  download
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition"
                >
                  <Download size={13} /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewResumeUrl(null)}
                  style={{ color: '#ffffff' }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 p-2">
              <iframe
                src={previewResumeUrl}
                className="w-full h-full rounded-xl border border-slate-200 bg-white"
                title="Resume Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
