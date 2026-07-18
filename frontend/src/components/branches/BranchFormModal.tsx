import React, { useEffect, useState } from 'react';
import { type Company } from '@/data/mockData';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { type UserAccount } from '@/pages/Login';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { ui } from '@/components/ui/feedback';

// The single Create/Edit Branch form. Previously inlined in Companies.tsx; it
// lives here so every entry point (Companies list, Company Dashboard) opens the
// same form and the same save path — including the Branch Admin auto-provision.

const emptyForm = {
  name: '',
  branchCode: '',
  location: '',
  email: '',
  phone: '',
  adminName: '',
  employeeCapacity: 200,
  status: 'Active' as string,
  pfRate: 12,
  esicRate: 3.25,
  basicPercent: 50,
  profTaxRate: 200,
  overtimeRate: 1.5,
  enableBroadcasts: true,
  enableSystemAlerts: true,
};

const formFromBranch = (branch: Company) => ({
  name: branch.name || branch.branchName || '',
  branchCode: branch.branchCode || '',
  location: branch.address || '',
  email: branch.email || branch.adminEmail || '',
  phone: branch.phone || '',
  adminName: branch.adminName || '',
  employeeCapacity: branch.employeeCapacity || 200,
  status: branch.status || 'Active',
  pfRate: branch.pfRate || 12,
  esicRate: branch.esicRate || 3.25,
  basicPercent: branch.basicPercent || 50,
  profTaxRate: branch.profTaxRate || 200,
  overtimeRate: branch.overtimeRate || 1.5,
  enableBroadcasts: true,
  enableSystemAlerts: true,
});

interface BranchFormModalProps {
  open: boolean;
  onClose: () => void;
  /** null/undefined => create mode. */
  editingBranch?: Company | null;
  /** Parent company the new branch belongs under. */
  parentCompanyId: string;
  companies: Company[];
  onUpdateCompanies: (companies: Company[]) => void;
  /** Optional: callers that hold the local user list keep it in sync. The
   *  Branch Admin account is created server-side either way. */
  userAccounts?: UserAccount[];
  onUpdateAccounts?: (accounts: UserAccount[]) => void;
  onRefresh?: () => void;
  /** First breadcrumb label — the screen the modal was opened from. */
  breadcrumbRoot?: string;
  /** View mode: every field disabled, no save. Used by the branch table's
   *  "View" row action, which must work for view-only roles (e.g. HR). */
  readOnly?: boolean;
}

export const BranchFormModal: React.FC<BranchFormModalProps> = ({
  open,
  onClose,
  editingBranch = null,
  parentCompanyId,
  companies,
  onUpdateCompanies,
  userAccounts,
  onUpdateAccounts,
  onRefresh,
  breadcrumbRoot = 'Companies',
  readOnly = false,
}) => {
  const [branchForm, setBranchForm] = useState(emptyForm);

  // Seed the form each time the modal opens so a create never inherits the
  // values of a previous edit (and vice versa).
  useEffect(() => {
    if (!open) return;
    setBranchForm(editingBranch ? formFromBranch(editingBranch) : emptyForm);
  }, [open, editingBranch]);

  const handleSaveBranch = async () => {
    if (readOnly) return;
    if (!branchForm.name || !branchForm.branchCode || !branchForm.email || !branchForm.adminName) {
      await ui.alert({ message: 'Please fill in all strictly required fields (Branch Name, Branch Code, Branch Email, and Branch Admin).', variant: 'warning' });
      return;
    }

    if (editingBranch) {
      // Edit mode
      const updatedCompanies = companies.map(c => {
        if (c.id === editingBranch.id) {
          return {
            ...c,
            name: branchForm.name,
            branchName: branchForm.name.replace(/^GCRI\s+/, ''),
            branchCode: branchForm.branchCode,
            location: branchForm.location,
            address: branchForm.location,
            email: branchForm.email,
            adminEmail: branchForm.email,
            phone: branchForm.phone,
            adminName: branchForm.adminName,
            employeeCapacity: Number(branchForm.employeeCapacity) || 200,
            status: branchForm.status as any,
            pfRate: Number(branchForm.pfRate) || 12,
            esicRate: Number(branchForm.esicRate) || 3.25,
            basicPercent: Number(branchForm.basicPercent) || 50,
            profTaxRate: Number(branchForm.profTaxRate) || 200,
            overtimeRate: Number(branchForm.overtimeRate) || 1.5,
          };
        }
        return c;
      });
      api.branches.update(editingBranch.id, {
        branchName: branchForm.name.replace(/^GCRI\s+/, ''),
        branchCode: branchForm.branchCode,
        location: branchForm.location,
        email: branchForm.email,
        adminEmail: branchForm.email,
        phone: branchForm.phone,
        adminName: branchForm.adminName,
        employeeCapacity: Number(branchForm.employeeCapacity) || 200,
        status: branchForm.status,
        pfRate: Number(branchForm.pfRate) || 12,
        esicRate: Number(branchForm.esicRate) || 3.25,
        basicPercent: Number(branchForm.basicPercent) || 50,
        profTaxRate: Number(branchForm.profTaxRate) || 200,
        overtimeRate: Number(branchForm.overtimeRate) || 1.5,
      }).then(() => {
        onUpdateCompanies(updatedCompanies);
        onRefresh?.();
        onClose();
        ui.toast.success('Branch updated successfully.');
      }).catch(err => {
        console.error(err);
        ui.toast.error(getApiErrorMessage(err, 'Could not update the branch.'));
      });
      return;
    }

    // Create mode
    const newId = `c-br-${Date.now()}`;
    const newBranchObj: Company = {
      id: newId,
      parentCompanyId: parentCompanyId || 'c-gcri',
      name: branchForm.name,
      branchName: branchForm.name.replace(/^GCRI\s+/, ''),
      branchCode: branchForm.branchCode,
      domain: `${branchForm.name.toLowerCase().replace(/\s+/g, '')}.gcri.in`,
      adminName: branchForm.adminName,
      adminEmail: branchForm.email,
      phone: branchForm.phone,
      industry: 'Healthcare & Research',
      status: branchForm.status as any,
      employeeCount: 0,
      joinDate: new Date().toISOString().split('T')[0],
      plan: 'Enterprise',
      logo: 'GC',
      pfRate: Number(branchForm.pfRate) || 12,
      esicRate: Number(branchForm.esicRate) || 3.25,
      basicPercent: Number(branchForm.basicPercent) || 50,
      profTaxRate: Number(branchForm.profTaxRate) || 200,
      overtimeRate: Number(branchForm.overtimeRate) || 1.5,
      address: branchForm.location,
      email: branchForm.email,
      primaryColor: '#6366f1',
      headerText: `${branchForm.name.toUpperCase()} REGIONAL CENTER`,
      footerText: `${branchForm.name} · Subsidiary of Gujarat Cancer Research Institute`,
      signatureText: `${branchForm.adminName}, Branch Director`,
      themeStyle: 'Modern',
      paymentStatus: 'Trial Active',
      renewalDate: '2027-12-31',
      subscriptionPrice: 0,
      billingCycle: 'Monthly',
      accountStatus: 'Active'
    };

    // Auto provision Branch Admin user account!
    const newAdminUser: UserAccount = {
      id: `u-ba-${Date.now()}`,
      name: branchForm.adminName,
      email: branchForm.email,
      username: branchForm.email.split('@')[0],
      passwordStr: 'welcome123',
      role: 'Company Head',
      companyId: newId,
      status: 'Active',
      avatar: branchForm.adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    };

    // Create the branch FIRST (authoritative). If the branch create fails we
    // must NOT create the admin user — that would orphan a user with no
    // branch. Only on branch success do we provision the admin account and
    // close the modal. (Branch creation is unlimited — permission-gated only;
    // there is no slot/quota check.)
    let createdBranch: any;
    try {
      // `newBranchObj` is COMPANY-shaped (it doubles as the local UI row), so
      // the parent lives on `parentCompanyId`. The Branch API stores it as
      // `companyId` — send it explicitly rather than relying on the server's
      // alias, and as a NUMBER (Branch.companyId is Int, so a string id would
      // be rejected by Prisma).
      createdBranch = await api.branches.create({ ...newBranchObj, companyId: Number(parentCompanyId) });
    } catch (err: any) {
      console.error('Branch create error:', err);
      ui.toast.error(getApiErrorMessage(err, 'Could not create the branch.'));
      return;   // keep modal open so the user can adjust / upgrade
    }
    let adminMsg = '';
    try {
      await api.users.create({ ...newAdminUser, companyId: createdBranch?.id ?? newAdminUser.companyId, password: newAdminUser.passwordStr });
      if (onUpdateAccounts && userAccounts) onUpdateAccounts([...userAccounts, newAdminUser]);
      adminMsg = `\n\nGenerated Branch Admin Account:\nLogin ID: ${newAdminUser.username}\nPassword: ${newAdminUser.passwordStr}`;
    } catch (uErr) {
      console.warn('Branch created, but admin account was not created:', uErr);
      adminMsg = '\n\nNote: the branch admin account could not be auto-created (it may already exist).';
    }
    onUpdateCompanies([...companies, newBranchObj]);
    onRefresh?.();
    onClose();
    await ui.alert({ title: 'Branch Created', variant: 'success', message: `Branch created successfully.${adminMsg}` });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        readOnly ? `Branch Details: ${editingBranch?.branchName || editingBranch?.name}`
          : editingBranch ? `Edit Regional Branch: ${editingBranch.branchName || editingBranch.name}`
          : "Create Subsidiary Regional Branch"
      }
      variant="page"
      breadcrumbs={[
        { label: breadcrumbRoot, onClick: onClose },
        { label: readOnly ? 'Branch Details' : editingBranch ? 'Edit Branch' : 'New Branch' },
      ]}
      subtitle={readOnly
        ? "Branch details, administrator, payroll parameters and notifications."
        : "Configure branch details, administrator, payroll parameters and notifications."}
      size="lg"
      footer={
        readOnly ? (
          <Button variant="outline" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSaveBranch}>
              {editingBranch ? "Save Branch Settings" : "Deploy Branch Portal"}
            </Button>
          </>
        )
      }
    >
      {/* fieldset[disabled] natively disables every control inside, so View mode
          can't be bypassed field-by-field and needs no per-input wiring. */}
      <fieldset disabled={readOnly} className="contents">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-xs text-gray-500">
          {editingBranch
            ? "Modify this subsidiary's regional limits, operational capacity, statutory parameters, and local leadership accounts."
            : "Registering a new sub-center branches under Gujarat Cancer Research Institute. Generates specialized Branch Admin logins on completion."}
        </p>

        {/* General Center Specifications */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">1. Regional Center Specifications</h4>
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input
              label="Branch Name (e.g. GCRI Siddhpur) *"
              placeholder="e.g. GCRI Siddhpur"
              value={branchForm.name}
              onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
            />
            <Input
              label="Branch Code (e.g. SIDD) *"
              placeholder="e.g. SIDD"
              value={branchForm.branchCode}
              onChange={e => setBranchForm({ ...branchForm, branchCode: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input
              label="Branch Location / Address *"
              placeholder="e.g. Siddhpur Highway, Patan"
              value={branchForm.location}
              onChange={e => setBranchForm({ ...branchForm, location: e.target.value })}
            />
            <Select
              label="Operational Status *"
              value={branchForm.status}
              disabled={readOnly || ['offboarded', 'archived'].includes(String(branchForm.status || '').toLowerCase())}
              onChange={e => setBranchForm({ ...branchForm, status: e.target.value })}
              options={[
                { value: 'Active', label: 'Active (Permit Portal Access)' },
                { value: 'Inactive', label: 'Suspended (Revoke Branch Portal Access)' },
                ...(!['active', 'inactive'].includes(String(branchForm.status || '').toLowerCase()) ? [
                  { value: branchForm.status, label: branchForm.status, disabled: true }
                ] : [])
              ]}
            />
          </div>
        </div>

        {/* Branch Authority Credentials */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">2. Local Leadership (Branch Admin)</h4>
          <div className="grid grid-cols-3 gap-3 text-left">
            <div className="col-span-1">
              <Input
                label="Branch Admin Full Name *"
                placeholder="e.g. Dr. Harshit Patel"
                value={branchForm.adminName}
                onChange={e => setBranchForm({ ...branchForm, adminName: e.target.value })}
              />
            </div>
            <div className="col-span-1">
              <Input
                label="Branch Contact Email *"
                placeholder="e.g. siddhpur@gcri.in"
                type="email"
                value={branchForm.email}
                onChange={e => setBranchForm({ ...branchForm, email: e.target.value })}
              />
            </div>
            <div className="col-span-1">
              <Input
                label="Branch Contact Phone *"
                placeholder="e.g. +91 9988776655"
                value={branchForm.phone}
                onChange={e => setBranchForm({ ...branchForm, phone: e.target.value })}
              />
            </div>
          </div>
          {!editingBranch && (
            <p className="text-[10px] text-gray-400 italic mt-0.5">
              * Note: Login ID will be derived from email username (e.g. `siddhpur`). Default access password is <strong>welcome123</strong>.
            </p>
          )}
        </div>

        {/* Capacity and Statutory Parameters */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">3. Capacity & Statutory Payroll Configurations</h4>
          <div className="grid grid-cols-3 gap-3 text-left">
            <Input
              label="Max Employee Capacity Limit *"
              type="number"
              disabled={true}
              value={branchForm.employeeCapacity}
              className="bg-gray-50 text-gray-500 font-bold cursor-not-allowed"
              title="Capacity upgrades must be executed through the Billing tab."
            />
            <Input
              label="PF Contribution Rate (%)"
              type="number"
              step="0.01"
              placeholder="e.g. 12"
              value={branchForm.pfRate}
              onChange={e => setBranchForm({ ...branchForm, pfRate: Number(e.target.value) || 12 })}
            />
            <Input
              label="ESIC Contribution Rate (%)"
              type="number"
              step="0.01"
              placeholder="e.g. 3.25"
              value={branchForm.esicRate}
              onChange={e => setBranchForm({ ...branchForm, esicRate: Number(e.target.value) || 3.25 })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 text-left">
            <Input
              label="Basic Salary % of CTC (%)"
              type="number"
              placeholder="e.g. 50"
              value={branchForm.basicPercent}
              onChange={e => setBranchForm({ ...branchForm, basicPercent: Number(e.target.value) || 50 })}
            />
            <Input
              label="Overtime Rate Multiplier"
              type="number"
              step="0.1"
              placeholder="e.g. 1.5"
              value={branchForm.overtimeRate}
              onChange={e => setBranchForm({ ...branchForm, overtimeRate: Number(e.target.value) || 1.5 })}
            />
            <Input
              label="Professional Tax Rate (INR)"
              type="number"
              placeholder="e.g. 200"
              value={branchForm.profTaxRate}
              onChange={e => setBranchForm({ ...branchForm, profTaxRate: Number(e.target.value) || 200 })}
            />
          </div>
        </div>

        {/* Local Notification Privileges */}
        <div className="space-y-3 pt-2 text-left">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-1">4. Subsidiary Notification & Scopes</h4>
          <div className="flex flex-col gap-2 pt-1 text-xs">
            <label className="flex items-center gap-2 font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={branchForm.enableBroadcasts}
                onChange={e => setBranchForm({ ...branchForm, enableBroadcasts: e.target.checked })}
                className="rounded text-brand-700 focus:ring-brand-500 w-3.5 h-3.5"
              />
              Permit local Broadcast Dispatch to all devices in this branch
            </label>
            <label className="flex items-center gap-2 font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={branchForm.enableSystemAlerts}
                onChange={e => setBranchForm({ ...branchForm, enableSystemAlerts: e.target.checked })}
                className="rounded text-brand-700 focus:ring-brand-500 w-3.5 h-3.5"
              />
              Receive automatic critical biometric and compliance alerts
            </label>
          </div>
        </div>
      </div>
      </fieldset>
    </Modal>
  );
};
