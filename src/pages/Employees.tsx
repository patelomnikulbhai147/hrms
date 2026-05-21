import React, { useState } from 'react';
import { Plus, Search, Eye, Edit2, Trash2, Mail, Phone, MapPin, Briefcase, KeyRound, Lock, Trash } from 'lucide-react';
import { departments, designations, type Employee, type EmployeeStatus, type Role } from '../data/mockData';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import {
  validatePhone,
  validateName,
  validateEmail,
  validateSalary,
  validateEmployeeId
} from '../utils/validation';
import { type UserAccount } from './Login';

interface EmployeesProps {
  role: Role;
  activeCompanyId: string;
  userAccounts: UserAccount[];
  onUpdateAccounts: (accounts: UserAccount[]) => void;
  employees: Employee[];
  onUpdateEmployees: (employees: Employee[]) => void;
}

const statusOptions: EmployeeStatus[] = ['Active', 'Inactive', 'On Leave', 'Terminated'];

export const Employees: React.FC<EmployeesProps> = ({
  role,
  activeCompanyId,
  userAccounts,
  onUpdateAccounts,
  employees,
  onUpdateEmployees
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewEmp, setViewEmp] = useState<Employee | null>(null);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  // Validation errors state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hrErrors, setHrErrors] = useState<Record<string, string>>({});

  // HR Manage State
  const [hrManagerOpen, setHrManagerOpen] = useState(false);
  const [newHrForm, setNewHrForm] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
  });

  const [form, setForm] = useState({
    name: '',
    email: '',
    countryCode: '+91',
    mobileNumber: '',
    department: 'Engineering',
    designation: 'Software Developer',
    role: 'Staff' as Role | 'Staff',
    status: 'Active' as EmployeeStatus,
    location: '',
    salary: '',
    joinDate: '',
    manager: '',
    employeeId: '',
  });

  const [editCountryCode, setEditCountryCode] = useState('+91');
  const [editMobileNumber, setEditMobileNumber] = useState('');

  const parsePhone = (phoneStr: string) => {
    const cleanStr = (phoneStr || '').trim();
    if (cleanStr.startsWith('+91')) {
      return { countryCode: '+91', mobileNumber: cleanStr.replace('+91', '').trim().replace(/\s+/g, '') };
    } else if (cleanStr.startsWith('+1')) {
      return { countryCode: '+1', mobileNumber: cleanStr.replace('+1', '').trim().replace(/\s+/g, '') };
    } else if (cleanStr.startsWith('+44')) {
      return { countryCode: '+44', mobileNumber: cleanStr.replace('+44', '').trim().replace(/\s+/g, '') };
    }
    return { countryCode: '+91', mobileNumber: cleanStr.replace(/\s+/g, '') };
  };

  const companyEmployees = employees.filter(e => e.companyId === activeCompanyId);

  const filtered = companyEmployees.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q) || e.department.toLowerCase().includes(q);
    const matchDept = !deptFilter || e.department === deptFilter;
    const matchStatus = !statusFilter || e.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const handleAdd = () => {
    // Validate all fields
    const nameErr = validateName(form.name).error;
    const emailErr = validateEmail(form.email).error;
    const phoneErr = validatePhone(form.mobileNumber).error;
    const empIdErr = validateEmployeeId(form.employeeId, companyEmployees).error;
    const salaryErr = validateSalary(form.salary).error;
    const managerErr = form.manager ? validateName(form.manager).error : '';

    if (nameErr || emailErr || phoneErr || empIdErr || salaryErr || managerErr) {
      alert('Error: Please resolve validation errors before registering.');
      return;
    }

    const newEmp: Employee = {
      id: `e${Date.now()}`,
      employeeId: form.employeeId.trim(),
      companyId: activeCompanyId, // Strict tenancy stamp
      name: form.name,
      email: form.email,
      phone: `${form.countryCode} ${form.mobileNumber}`,
      department: form.department,
      designation: form.designation,
      role: form.role as any,
      status: form.status,
      joinDate: form.joinDate || new Date().toISOString().split('T')[0],
      salary: parseInt(form.salary) || 0,
      manager: form.manager || 'N/A',
      location: form.location || 'Remote',
      avatar: form.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
    };
    onUpdateEmployees([newEmp, ...employees]);
    setAddOpen(false);
    setForm({
      name: '',
      email: '',
      countryCode: '+91',
      mobileNumber: '',
      department: 'Engineering',
      designation: 'Software Developer',
      role: 'Staff',
      status: 'Active',
      location: '',
      salary: '',
      joinDate: '',
      manager: '',
      employeeId: '',
    });
    setErrors({});
  };

  const handleEdit = () => {
    if (!editEmp) return;

    const nameErr = validateName(editEmp.name).error;
    const emailErr = validateEmail(editEmp.email).error;
    const phoneErr = validatePhone(editMobileNumber).error;
    const empIdErr = validateEmployeeId(editEmp.employeeId, companyEmployees, editEmp.id).error;
    const salaryErr = validateSalary(editEmp.salary).error;
    const managerErr = editEmp.manager ? validateName(editEmp.manager).error : '';

    if (nameErr || emailErr || phoneErr || empIdErr || salaryErr || managerErr) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }

    const updatedEmp: Employee = {
      ...editEmp,
      phone: `${editCountryCode} ${editMobileNumber}`,
      salary: parseInt(String(editEmp.salary)) || 0,
    };

    onUpdateEmployees(employees.map(e => e.id === editEmp.id ? updatedEmp : e));
    setEditEmp(null);
    setErrors({});
  };

  const handleStartAdd = () => {
    setForm({
      name: '',
      email: '',
      countryCode: '+91',
      mobileNumber: '',
      department: 'Engineering',
      designation: 'Software Developer',
      role: 'Staff',
      status: 'Active',
      location: '',
      salary: '',
      joinDate: '',
      manager: '',
      employeeId: `EMP${String(companyEmployees.length + 1).padStart(3, '0')}`,
    });
    setErrors({});
    setAddOpen(true);
  };

  const handleStartEdit = (emp: Employee) => {
    const parsed = parsePhone(emp.phone);
    setEditCountryCode(parsed.countryCode);
    setEditMobileNumber(parsed.mobileNumber);
    setEditEmp(emp);
    setErrors({});
  };

  const handleDelete = () => {
    if (!deleteEmp) return;
    onUpdateEmployees(employees.filter(e => e.id !== deleteEmp.id));
    setDeleteEmp(null);
  };

  // Scoped HR logins in this company
  const scopedHRLogins = userAccounts.filter(
    u => u.companyId === activeCompanyId && u.role === 'HR'
  );

  const handleCreateHRLogins = () => {
    const nameErr = validateName(newHrForm.name).error;
    const emailErr = validateEmail(newHrForm.email).error;

    if (nameErr || emailErr) {
      alert('Error: Please resolve validation errors before saving.');
      return;
    }

    const exists = userAccounts.some(u => u.username.toLowerCase() === newHrForm.username.toLowerCase());
    if (exists) {
      alert('Error: This Login ID is already in use.');
      return;
    }

    const newHR: UserAccount = {
      id: `u${Date.now()}`,
      name: newHrForm.name,
      email: newHrForm.email,
      username: newHrForm.username.trim(),
      passwordStr: newHrForm.password || 'hrwelcome123',
      role: 'HR',
      companyId: activeCompanyId,
      status: 'Active',
      avatar: newHrForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    };

    onUpdateAccounts([...userAccounts, newHR]);
    setNewHrForm({ name: '', email: '', username: '', password: '' });
    setHrErrors({});
    alert(`Successfully generated HR credentials:\nID: ${newHR.username}\nPassword: ${newHR.passwordStr}`);
  };

  const handleToggleHRStatus = (hrId: string) => {
    const updated = userAccounts.map(u => {
      if (u.id === hrId) {
        const nextStatus = u.status === 'Active' ? 'Disabled' : 'Active';
        return { ...u, status: nextStatus as 'Active' | 'Disabled' };
      }
      return u;
    });
    onUpdateAccounts(updated);
    alert('HR account active status toggled.');
  };

  const handleResetHRPassword = (hrId: string) => {
    const newPass = prompt('Enter new access password for HR:');
    if (!newPass) return;
    const updated = userAccounts.map(u => {
      if (u.id === hrId) {
        return { ...u, passwordStr: newPass };
      }
      return u;
    });
    onUpdateAccounts(updated);
    alert('HR Password reset successfully.');
  };

  const handleRevokeHRAccess = (hrId: string) => {
    if (!confirm('Are you sure you want to delete this HR operational credential?')) return;
    const updated = userAccounts.filter(u => u.id !== hrId);
    onUpdateAccounts(updated);
    alert('HR credential revoked.');
  };

  const canEdit = role === 'Company Head' || role === 'HR';
  const canAdd = role === 'Company Head' || role === 'HR';
  const canDelete = role === 'Company Head' || role === 'HR';
  const isCompanyHead = role === 'Company Head';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Employee Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} of {companyEmployees.length} company employees</p>
        </div>
        <div className="flex items-center gap-2">
          {isCompanyHead && (
            <button
              onClick={() => setHrManagerOpen(true)}
              className="px-3 py-1.5 border border-gray-250 bg-white hover:bg-gray-50 rounded text-xs font-semibold text-gray-700 flex items-center gap-1.5"
            >
              <KeyRound size={13} className="text-blue-600" />
              <span>Manage HR Logins</span>
            </button>
          )}
          {canAdd && (
            <Button icon={<Plus size={14} />} onClick={handleStartAdd}>Add Employee</Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <Input placeholder="Search by name, ID or department..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
          </div>
          <div className="w-40">
            <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              options={[{ value: '', label: 'All Departments' }, ...departments.map(d => ({ value: d, label: d }))]}
            />
          </div>
          <div className="w-40">
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              options={[{ value: '', label: 'All Statuses' }, ...statusOptions.map(s => ({ value: s, label: s }))]}
            />
          </div>
        </div>
      </Card>

      {/* Table list */}
      <Card padding={false}>
        <Table>
          <Thead>
            <tr>
              <Th>Employee ID</Th>
              <Th>Employee Name</Th>
              <Th>Dept / Designation</Th>
              <Th>Role / Level</Th>
              <Th>Status</Th>
              <Th>Salary (CTC)</Th>
              <Th>Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm text-gray-400">
                  No employee profiles registered for this company
                </td>
              </tr>
            ) : (
              filtered.map(e => (
                <Tr key={e.id} className="hover:bg-gray-50/50">
                  <Td><span className="text-xs font-bold text-gray-700">{e.employeeId}</span></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs font-sans">
                        {e.avatar}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{e.name}</p>
                        <p className="text-[10px] text-gray-400">{e.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div>
                      <p className="text-xs text-gray-700 font-medium">{e.designation}</p>
                      <p className="text-[10px] text-gray-400">{e.department}</p>
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={e.role === 'Company Head' ? 'danger' : e.role === 'HR' ? 'blue' : 'gray'}>
                      {e.role}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={statusBadge(e.status)} dot>{e.status}</Badge>
                  </Td>
                  <Td><span className="text-xs font-bold text-gray-900">₹{e.salary.toLocaleString()}/yr</span></Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewEmp(e)} className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-950" title="View Profile">
                        <Eye size={13} />
                      </button>
                      {canEdit && (
                        <button onClick={() => handleStartEdit(e)} className="p-1 hover:bg-gray-100 rounded text-blue-600 hover:text-blue-700" title="Edit Profile">
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleteEmp(e)} className="p-1 hover:bg-gray-100 rounded text-red-650 text-red-600 hover:text-red-700" title="Delete Profile">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Card>

      {/* HR Accounts Management Modal */}
      <Modal
        open={hrManagerOpen}
        onClose={() => setHrManagerOpen(false)}
        title="Manage HR Operations Accounts"
        size="lg"
      >
        <div className="space-y-6">
          <p className="text-xs text-gray-500">
            Provision and audit the login credentials for HR personnel inside your company tenant.
          </p>

          {/* List of Scoped HR accounts */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Scoped HR Logins</h4>
            <Card padding={false}>
              <Table>
                <Thead>
                  <tr>
                    <Th>HR Officer Name</Th>
                    <Th>Login ID</Th>
                    <Th>Email</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {scopedHRLogins.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-sm text-gray-450">No HR logins provisioned yet.</td></tr>
                  ) : (
                    scopedHRLogins.map(u => (
                      <Tr key={u.id}>
                        <Td><span className="text-xs font-semibold text-gray-900">{u.name}</span></Td>
                        <Td><span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-1 py-0.5 rounded">{u.username}</span></Td>
                        <Td><span className="text-xs text-gray-600">{u.email}</span></Td>
                        <Td><Badge variant={u.status === 'Active' ? 'success' : 'danger'}>{u.status}</Badge></Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResetHRPassword(u.id)}
                              className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-black"
                              title="Reset HR Password"
                            >
                              <Lock size={12} />
                            </button>
                            <button
                              onClick={() => handleToggleHRStatus(u.id)}
                              className={`text-[10px] px-2 py-0.5 rounded font-bold text-white transition-colors ${
                                u.status === 'Active' ? 'bg-red-650 bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {u.status === 'Active' ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleRevokeHRAccess(u.id)}
                              className="p-1 hover:bg-red-50 rounded text-red-650 text-red-600"
                              title="Delete HR Access"
                            >
                              <Trash size={12} />
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </Card>
          </div>

          {/* Provision Form */}
          <div className="border-t border-gray-150 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Generate HR Operator Credential</h4>
            
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input
                label="HR Name *"
                placeholder="Full Name e.g. Priya Sharma"
                value={newHrForm.name}
                onChange={e => {
                  const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setNewHrForm({ ...newHrForm, name: clean });
                  setHrErrors(prev => ({ ...prev, name: validateName(clean).error }));
                }}
                error={hrErrors.name}
                success={newHrForm.name !== '' && !hrErrors.name}
              />
              <Input
                label="HR Email Address *"
                placeholder="e.g. priya@technova.in"
                type="email"
                value={newHrForm.email}
                onChange={e => {
                  const val = e.target.value;
                  setNewHrForm({ ...newHrForm, email: val });
                  setHrErrors(prev => ({ ...prev, email: validateEmail(val).error }));
                }}
                error={hrErrors.email}
                success={newHrForm.email !== '' && !hrErrors.email}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-end text-left">
              <Input
                label="Assigned Username / Login ID *"
                placeholder="e.g. priya"
                value={newHrForm.username}
                onChange={e => setNewHrForm({ ...newHrForm, username: e.target.value })}
              />
              <Input
                label="Initial Password *"
                placeholder="Default: hrwelcome123"
                type="password"
                value={newHrForm.password}
                onChange={e => setNewHrForm({ ...newHrForm, password: e.target.value })}
              />
            </div>

            <div className="pt-2 text-left">
              <Button 
                onClick={handleCreateHRLogins} 
                disabled={
                  !newHrForm.name || 
                  !newHrForm.email || 
                  !newHrForm.username ||
                  !!hrErrors.name ||
                  !!hrErrors.email
                }
              >
                Create HR Login Credentials
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Add Employee Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Register Company Employee" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAdd} 
              disabled={
                !form.name || 
                !form.email || 
                !form.mobileNumber || 
                !form.employeeId || 
                !form.salary ||
                Object.values(errors).some(err => !!err)
              }
            >
              Register Profile
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input 
              label="Full Name *" 
              placeholder="e.g. Ramesh Kumar" 
              value={form.name} 
              onChange={e => {
                const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                setForm({ ...form, name: clean });
                setErrors(prev => ({ ...prev, name: validateName(clean).error }));
              }} 
              error={errors.name}
              success={form.name !== '' && !errors.name}
            />
            <Input 
              label="Email Address *" 
              type="email" 
              placeholder="e.g. ramesh@company.com" 
              value={form.email} 
              onChange={e => {
                const val = e.target.value;
                setForm({ ...form, email: val });
                setErrors(prev => ({ ...prev, email: validateEmail(val).error }));
              }} 
              error={errors.email}
              success={form.email !== '' && !errors.email}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input
              label="Employee ID *"
              placeholder="e.g. EMP101"
              value={form.employeeId}
              onChange={e => {
                const clean = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
                setForm({ ...form, employeeId: clean });
                setErrors(prev => ({ ...prev, employeeId: validateEmployeeId(clean, companyEmployees).error }));
              }}
              error={errors.employeeId}
              success={form.employeeId !== '' && !errors.employeeId}
            />
            <Input 
              label="Location" 
              placeholder="e.g. Bangalore" 
              value={form.location} 
              onChange={e => setForm({ ...form, location: e.target.value })} 
            />
          </div>

          <div className="text-left">
            <PhoneInput
              label="Phone Contact *"
              countryCode={form.countryCode}
              mobileNumber={form.mobileNumber}
              onChangeCountry={code => {
                setForm(prev => {
                  const next = { ...prev, countryCode: code };
                  const err = validatePhone(next.mobileNumber, code).error;
                  setErrors(prevErrors => ({ ...prevErrors, mobileNumber: err }));
                  return next;
                });
              }}
              onChangeNumber={num => {
                setForm(prev => {
                  const next = { ...prev, mobileNumber: num };
                  const err = validatePhone(num, next.countryCode).error;
                  setErrors(prevErrors => ({ ...prevErrors, mobileNumber: err }));
                  return next;
                });
              }}
              error={errors.mobileNumber}
              success={form.mobileNumber !== '' && !errors.mobileNumber}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <Select label="Department *" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              options={departments.map(d => ({ value: d, label: d }))}
            />
            <Select label="Designation *" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })}
              options={designations.map(d => ({ value: d, label: d }))}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-left">
            <Select label="Status *" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as EmployeeStatus })}
              options={statusOptions.map(s => ({ value: s, label: s }))}
            />
            <Select label="Role *" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}
              options={[{ value: 'Staff', label: 'Staff Personnel' }, { value: 'HR', label: 'HR Operator' }]}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input 
              label="Joining CTC (INR / year) *" 
              value={form.salary} 
              onChange={e => {
                const clean = e.target.value.replace(/[^\d.]/g, '');
                setForm({ ...form, salary: clean });
                setErrors(prev => ({ ...prev, salary: validateSalary(clean).error }));
              }} 
              error={errors.salary}
              success={form.salary !== '' && !errors.salary}
            />
            <Input label="Scheduled Join Date" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} />
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input 
              label="Manager / Supervisor Name" 
              placeholder="e.g. Anand Kumar" 
              value={form.manager} 
              onChange={e => {
                const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                setForm({ ...form, manager: clean });
                setErrors(prev => ({ ...prev, manager: validateName(clean).error }));
              }} 
              error={errors.manager}
              success={form.manager !== '' && !errors.manager}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEmp} onClose={() => setEditEmp(null)} title="Modify Employee Profile" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditEmp(null)}>Cancel</Button>
            <Button 
              onClick={handleEdit} 
              disabled={
                !editEmp ||
                !editEmp.name ||
                !editEmp.email ||
                !editMobileNumber ||
                !editEmp.employeeId ||
                !editEmp.salary ||
                Object.values(errors).some(err => !!err)
              }
            >
              Save Changes
            </Button>
          </>
        }
      >
        {editEmp && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input 
                label="Full Name *" 
                value={editEmp.name} 
                onChange={e => {
                  const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setEditEmp({ ...editEmp, name: clean });
                  setErrors(prev => ({ ...prev, name: validateName(clean).error }));
                }} 
                error={errors.name}
                success={editEmp.name !== '' && !errors.name}
              />
              <Input 
                label="Email Address *" 
                value={editEmp.email} 
                onChange={e => {
                  const val = e.target.value;
                  setEditEmp({ ...editEmp, email: val });
                  setErrors(prev => ({ ...prev, email: validateEmail(val).error }));
                }} 
                error={errors.email}
                success={editEmp.email !== '' && !errors.email}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input 
                label="Employee ID *" 
                value={editEmp.employeeId} 
                onChange={e => {
                  const clean = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
                  setEditEmp({ ...editEmp, employeeId: clean });
                  setErrors(prev => ({ ...prev, employeeId: validateEmployeeId(clean, companyEmployees, editEmp.id).error }));
                }} 
                error={errors.employeeId}
                success={editEmp.employeeId !== '' && !errors.employeeId}
              />
              <Input label="Location" value={editEmp.location} onChange={e => setEditEmp({ ...editEmp, location: e.target.value })} />
            </div>

            <div className="text-left">
              <PhoneInput
                label="Phone Contact *"
                countryCode={editCountryCode}
                mobileNumber={editMobileNumber}
                onChangeCountry={code => {
                  setEditCountryCode(code);
                  const err = validatePhone(editMobileNumber, code).error;
                  setErrors(prevErrors => ({ ...prevErrors, mobileNumber: err }));
                }}
                onChangeNumber={num => {
                  setEditMobileNumber(num);
                  const err = validatePhone(num, editCountryCode).error;
                  setErrors(prevErrors => ({ ...prevErrors, mobileNumber: err }));
                }}
                error={errors.mobileNumber}
                success={editMobileNumber !== '' && !errors.mobileNumber}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              <Select label="Department *" value={editEmp.department} onChange={e => setEditEmp({ ...editEmp, department: e.target.value })}
                options={departments.map(d => ({ value: d, label: d }))}
              />
              <Select label="Designation *" value={editEmp.designation} onChange={e => setEditEmp({ ...editEmp, designation: e.target.value })}
                options={designations.map(d => ({ value: d, label: d }))}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-left">
              <Select label="Status *" value={editEmp.status} onChange={e => setEditEmp({ ...editEmp, status: e.target.value as EmployeeStatus })}
                options={statusOptions.map(s => ({ value: s, label: s }))}
              />
              <Select label="Role *" value={editEmp.role} onChange={e => setEditEmp({ ...editEmp, role: e.target.value as any })}
                options={[{ value: 'Staff', label: 'Staff Personnel' }, { value: 'HR', label: 'HR Operator' }]}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input 
                label="Joining CTC (INR / year) *" 
                value={editEmp.salary.toString()} 
                onChange={e => {
                  const clean = e.target.value.replace(/[^\d.]/g, '');
                  setEditEmp({ ...editEmp, salary: parseInt(clean) || 0 });
                  setErrors(prev => ({ ...prev, salary: validateSalary(clean).error }));
                }} 
                error={errors.salary}
                success={editEmp.salary !== 0 && !errors.salary}
              />
              <Input 
                label="Manager / Supervisor Name" 
                value={editEmp.manager} 
                onChange={e => {
                  const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setEditEmp({ ...editEmp, manager: clean });
                  setErrors(prev => ({ ...prev, manager: validateName(clean).error }));
                }} 
                error={errors.manager}
                success={editEmp.manager !== '' && !errors.manager}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteEmp} onClose={() => setDeleteEmp(null)} title="Terminate Employee Profile" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteEmp(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>De-activate Employee</Button>
          </>
        }
      >
        {deleteEmp && (
          <p className="text-xs text-gray-600">
            Are you sure you want to suspend the profile for <strong>{deleteEmp.name}</strong> ({deleteEmp.employeeId})? This will suspend active attendance and payroll compilation pipelines.
          </p>
        )}
      </Modal>

      {/* View Detail Modal */}
      <Modal open={!!viewEmp} onClose={() => setViewEmp(null)} title="Employee Dossier File" size="md">
        {viewEmp && (
          <div className="space-y-4">
            <div className="flex items-center gap-3.5 pb-3.5 border-b border-gray-100">
              <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base font-sans">
                {viewEmp.avatar}
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">{viewEmp.name}</h4>
                <p className="text-xs text-gray-400">{viewEmp.designation} · {viewEmp.department}</p>
              </div>
              <div className="ml-auto text-right">
                <Badge variant={statusBadge(viewEmp.status)} dot>{viewEmp.status}</Badge>
                <p className="text-[10px] text-gray-400 mt-1">{viewEmp.employeeId}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
              <div className="flex items-start gap-2">
                <Mail size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-[10px] text-gray-400">Email Address</p><p className="font-semibold text-gray-800 mt-0.5">{viewEmp.email}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-[10px] text-gray-400">Contact Number</p><p className="font-semibold text-gray-800 mt-0.5">{viewEmp.phone || 'N/A'}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Briefcase size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-[10px] text-gray-400">Compensation CTC</p><p className="font-bold text-gray-900 mt-0.5">₹{viewEmp.salary.toLocaleString()} / year</p></div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-[10px] text-gray-400">Base Location</p><p className="font-semibold text-gray-800 mt-0.5">{viewEmp.location}</p></div>
              </div>
              <div><p className="text-[10px] text-gray-400">Supervisor / Reporter</p><p className="font-semibold mt-0.5">{viewEmp.manager}</p></div>
              <div><p className="text-[10px] text-gray-400">Joining Date</p><p className="font-semibold mt-0.5">{viewEmp.joinDate}</p></div>
              <div><p className="text-[10px] text-gray-400">SaaS Privileges Level</p><Badge variant="blue" className="mt-0.5">{viewEmp.role}</Badge></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
