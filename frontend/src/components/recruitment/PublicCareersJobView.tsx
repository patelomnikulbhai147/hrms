import React, { useState, useEffect } from 'react';
import {
  Briefcase, MapPin, IndianRupee, Clock, GraduationCap, CheckCircle2,
  AlertCircle, Upload, ArrowRight, ArrowLeft, Check, FileText, Loader2, Building2
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';

interface PublicCareersJobViewProps {
  jobCode: string;
}

export const PublicCareersJobView: React.FC<PublicCareersJobViewProps> = ({ jobCode }) => {
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Multi-step Application state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mobile: '',
    city: '',
    state: '',
    address: '',
    highestQualification: '',
    college: '',
    passingYear: '',
    course: '',
    experienceType: 'Experienced',
    yearsExperience: '2',
    currentCompany: '',
    currentDesignation: '',
    candidateSkills: ''
  });

  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    fetchJob();
  }, [jobCode]);

  const resolveApiUrl = (endpoint: string) => {
    const base = import.meta.env.VITE_API_BASE_URL;
    if (base && base.startsWith('http')) {
      const cleanBase = base.replace(/\/api\/?$/, '');
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${cleanBase}${cleanEndpoint}`;
    }
    return endpoint;
  };

  const fetchJob = async () => {
    try {
      setLoading(true);
      const url = resolveApiUrl(`/api/recruitment/public/job-posts/${jobCode}`);
      const res = await fetch(url);
      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error('Position not found or inactive');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Job not found');
      }
      setJob(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load position details.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedExts = ['.pdf', '.doc', '.docx'];
      const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowedExts.includes(fileExt)) {
        toast.error('Invalid document format. Please upload PDF, DOC, or DOCX.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Resume size exceeds maximum limit (10MB).');
        return;
      }
      setResumeFile(file);
      if (errors.resume) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.resume;
          return next;
        });
      }
    }
  };

  const validateStep = (s: number) => {
    const errs: Record<string, string> = {};

    if (s === 1) {
      if (!formData.fullName.trim()) {
        errs.fullName = 'Full Name is required';
      }
      if (!formData.email.trim()) {
        errs.email = 'Email Address is required';
      } else if (!formData.email.includes('@')) {
        errs.email = 'Please enter a valid email address (e.g. name@example.com)';
      }
      if (!formData.mobile.trim()) {
        errs.mobile = 'Mobile Number is required';
      }
    }

    if (s === 2) {
      if (!formData.highestQualification.trim()) {
        errs.highestQualification = 'Highest Qualification is required';
      }
    }

    if (s === 3) {
      if (formData.experienceType === 'Experienced' && !String(formData.yearsExperience || '').trim()) {
        errs.yearsExperience = 'Years of experience is required';
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstMsg = Object.values(errs)[0];
      toast.error(firstMsg);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmitApplication = async () => {
    if (!resumeFile) {
      toast.error('Please upload your resume document.');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      data.append('jobCode', jobCode);
      data.append('fullName', formData.fullName);
      data.append('email', formData.email);
      data.append('mobile', formData.mobile);
      data.append('city', formData.city);
      data.append('state', formData.state);
      data.append('address', formData.address);
      data.append('highestQualification', formData.highestQualification);
      data.append('college', formData.college);
      data.append('passingYear', formData.passingYear);
      data.append('course', formData.course);
      data.append('experienceType', formData.experienceType);
      data.append('yearsExperience', formData.yearsExperience);
      data.append('currentCompany', formData.currentCompany);
      data.append('currentDesignation', formData.currentDesignation);
      data.append('candidateSkills', formData.candidateSkills);
      data.append('resume', resumeFile);

      const url = resolveApiUrl('/api/recruitment/public/apply');
      const res = await fetch(url, {
        method: 'POST',
        body: data
      });

      const rawText = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        throw new Error('Server returned an invalid response.');
      }
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit application.');
      }

      setSuccess(json.applicationId || 'APP-SUCCESS');
      toast.success('Application submitted successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Error submitting application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
          <p className="text-slate-600 font-medium">Loading position details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-xl text-center">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Position Unavailable</h2>
          <p className="text-slate-600 text-sm mb-6">{error || 'This job opening does not exist or has expired.'}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 transition"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  const skillsList = (job.requiredSkills || '').split(',').map((s: string) => s.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold flex items-center justify-center shadow-md">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {job.company?.name || 'ZeniaHR Enterprise'}
              </h1>
              <p className="text-xs text-slate-500 font-medium">Careers & Talent Portal</p>
            </div>
          </div>
          <button
            onClick={() => { setApplyModalOpen(true); setStep(1); setSuccess(null); }}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shadow-md transition transform hover:-translate-y-0.5"
          >
            Apply for this Role
          </button>
        </div>
      </header>

      {/* Main Job Hero & Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <span className="px-3.5 py-1 bg-brand-50 text-brand-700 text-xs font-bold rounded-full border border-brand-200 uppercase tracking-wider">
              {job.jobCode}
            </span>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
              ● Active Opening
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            {job.jobTitle}
          </h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-100 my-6">
            <div className="flex items-center gap-2.5">
              <Building2 className="text-slate-400" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-medium">Department</p>
                <p className="text-sm font-bold text-slate-800">{job.department || 'General'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="text-slate-400" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-medium">Location</p>
                <p className="text-sm font-bold text-slate-800">{job.location || 'Remote'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="text-slate-400" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-medium">Employment Type</p>
                <p className="text-sm font-bold text-slate-800">{job.employmentType || 'Full-Time'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <IndianRupee className="text-slate-400" size={18} />
              <div>
                <p className="text-xs text-slate-400 font-medium">Salary Range</p>
                <p className="text-sm font-bold text-slate-800">
                  {job.salaryMin && job.salaryMax ? `₹${job.salaryMin.toLocaleString()} - ₹${job.salaryMax.toLocaleString()}` : 'Best in Industry'}
                </p>
              </div>
            </div>
          </div>

          {skillsList.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Required Core Skills</h3>
              <div className="flex flex-wrap gap-2">
                {skillsList.map((skill: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="prose prose-slate max-w-none mb-8">
            <h3 className="text-lg font-bold text-slate-900 mb-3">Job Description & Responsibilities</h3>
            <div className="whitespace-pre-line text-slate-600 leading-relaxed text-sm">
              {job.jobDescription || 'We are seeking a talented and driven professional to join our growing team. Apply now with your latest resume to be considered for this position.'}
            </div>
          </div>

          <div className="bg-gradient-to-r from-brand-50 to-indigo-50 border border-brand-100 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-slate-900 text-base">Ready to build your career with us?</h4>
              <p className="text-xs text-slate-600 mt-0.5">Submit your resume and our AI-powered ATS will process your application within minutes.</p>
            </div>
            <button
              onClick={() => { setApplyModalOpen(true); setStep(1); setSuccess(null); }}
              className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shadow-lg transition transform hover:-translate-y-0.5 shrink-0"
            >
              Apply Now →
            </button>
          </div>
        </div>
      </main>

      {/* Multi-Step Application Modal */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative my-8">
            {!success ? (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Apply for {job.jobTitle}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Step {step} of 4</p>
                  </div>
                  <button
                    onClick={() => setApplyModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-8">
                  <div
                    className="bg-brand-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(step / 4) * 100}%` }}
                  />
                </div>

                {/* Step 1: Personal Info */}
                {step === 1 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-slate-800">1. Personal Information</h3>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="e.g. John Doe"
                        className={`w-full px-3.5 py-2 border rounded-xl text-sm outline-none transition ${
                          errors.fullName
                            ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-400/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                        }`}
                      />
                      {errors.fullName && (
                        <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                          <AlertCircle size={12} /> {errors.fullName}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          placeholder="john.doe@example.com"
                          className={`w-full px-3.5 py-2 border rounded-xl text-sm outline-none transition ${
                            errors.email
                              ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-400/20'
                              : 'border-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                          }`}
                        />
                        {errors.email && (
                          <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                            <AlertCircle size={12} /> {errors.email}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number *</label>
                        <input
                          type="tel"
                          name="mobile"
                          value={formData.mobile}
                          onChange={handleInputChange}
                          placeholder="+91 9876543210"
                          className={`w-full px-3.5 py-2 border rounded-xl text-sm outline-none transition ${
                            errors.mobile
                              ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-400/20'
                              : 'border-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                          }`}
                        />
                        {errors.mobile && (
                          <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                            <AlertCircle size={12} /> {errors.mobile}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city}
                          onChange={handleInputChange}
                          placeholder="Ahmedabad"
                          className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                        <input
                          type="text"
                          name="state"
                          value={formData.state}
                          onChange={handleInputChange}
                          placeholder="Gujarat"
                          className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Education */}
                {step === 2 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-slate-800">2. Education & Qualification</h3>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Highest Qualification *</label>
                      <input
                        type="text"
                        name="highestQualification"
                        value={formData.highestQualification}
                        onChange={handleInputChange}
                        placeholder="e.g. B.Tech Computer Science, MCA, MBA"
                        className={`w-full px-3.5 py-2 border rounded-xl text-sm outline-none transition ${
                          errors.highestQualification
                            ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-400/20'
                            : 'border-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                        }`}
                      />
                      {errors.highestQualification && (
                        <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                          <AlertCircle size={12} /> {errors.highestQualification}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">College / University</label>
                        <input
                          type="text"
                          name="college"
                          value={formData.college}
                          onChange={handleInputChange}
                          placeholder="Gujarat Technological University"
                          className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Passing Year</label>
                        <input
                          type="number"
                          name="passingYear"
                          value={formData.passingYear}
                          onChange={handleInputChange}
                          placeholder="2024"
                          className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Experience & Skills */}
                {step === 3 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-slate-800">3. Work Experience & Skills</h3>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Experience Type</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="experienceType"
                            value="Experienced"
                            checked={formData.experienceType === 'Experienced'}
                            onChange={handleInputChange}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          Experienced
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="experienceType"
                            value="Fresher"
                            checked={formData.experienceType === 'Fresher'}
                            onChange={handleInputChange}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          Fresher / Entry Level
                        </label>
                      </div>
                    </div>

                    {formData.experienceType === 'Experienced' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Years of Exp *</label>
                          <input
                            type="text"
                            name="yearsExperience"
                            value={formData.yearsExperience}
                            onChange={handleInputChange}
                            placeholder="3.5"
                            className={`w-full px-3.5 py-2 border rounded-xl text-sm outline-none transition ${
                              errors.yearsExperience
                                ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-400/20'
                                : 'border-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                            }`}
                          />
                          {errors.yearsExperience && (
                            <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                              <AlertCircle size={12} /> {errors.yearsExperience}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Current Company</label>
                          <input
                            type="text"
                            name="currentCompany"
                            value={formData.currentCompany}
                            onChange={handleInputChange}
                            placeholder="Acme Tech"
                            className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Designation</label>
                          <input
                            type="text"
                            name="currentDesignation"
                            value={formData.currentDesignation}
                            onChange={handleInputChange}
                            placeholder="Software Engineer"
                            className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Key Skills (comma separated)</label>
                      <input
                        type="text"
                        name="candidateSkills"
                        value={formData.candidateSkills}
                        onChange={handleInputChange}
                        placeholder="React, Node.js, TypeScript, PostgreSQL"
                        className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Step 4: Resume Upload */}
                {step === 4 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-slate-800">4. Upload Resume Document</h3>
                    <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition flex flex-col items-center justify-center ${errors.resume ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 hover:border-brand-500 bg-slate-50/50'}`}>
                      <Upload className={`w-10 h-10 mb-2 ${errors.resume ? 'text-rose-500' : 'text-brand-600'}`} />
                      <p className="text-sm font-semibold text-slate-800">
                        {resumeFile ? resumeFile.name : 'Click to select or drag resume here'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Supported formats: PDF, DOC, DOCX (Max 10MB)</p>
                      <label className="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm cursor-pointer">
                        Choose File
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                      {errors.resume && (
                        <p className="text-[11px] font-medium text-rose-600 mt-2 flex items-center gap-1">
                          <AlertCircle size={12} /> {errors.resume}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Buttons footer */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-8">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={() => setStep(step - 1)}
                      className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold text-sm rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft size={16} /> Back
                    </button>
                  ) : <div />}

                  {step < 4 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStep(step)) setStep(step + 1);
                      }}
                      className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer"
                    >
                      Next Step <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleSubmitApplication}
                      className="px-8 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md flex items-center gap-2 transition cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="animate-spin" size={16} /> Submitting...
                        </>
                      ) : (
                        <>
                          <Check size={16} /> Submit Application
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Success Screen */
              <div className="text-center py-6">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Application Received!</h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                  Thank you, <strong>{formData.fullName}</strong>. Your application has been registered with ID <span className="font-bold text-brand-600">{success}</span>. Our recruitment team and AI scoring engine are now reviewing your profile.
                </p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left max-w-sm mx-auto mb-6 text-xs space-y-1.5">
                  <p><span className="font-semibold text-slate-500">Position:</span> <strong>{job.jobTitle}</strong></p>
                  <p><span className="font-semibold text-slate-500">Email:</span> {formData.email}</p>
                  <p><span className="font-semibold text-slate-500">Mobile:</span> {formData.mobile}</p>
                </div>
                <button
                  onClick={() => setApplyModalOpen(false)}
                  className="px-6 py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
