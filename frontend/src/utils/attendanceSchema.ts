// ─────────────────────────────────────────────────────────────────────────────
// Attendance Sheet — SINGLE SOURCE OF TRUTH for the shared Excel structure.
//
// Both the Attendance EXPORT and the Import TEMPLATE are generated from this one
// list, so the two files are always structurally identical (same columns, same
// order). A user can export attendance, edit it in Excel, and re-import the same
// file with zero column changes. Changing a column here updates the export AND
// the template AND the importer's auto-mapping together — never maintain two
// different attendance Excel formats again.
//
// `aliases` are normalised header spellings the importer auto-detects (see the
// nk() normaliser in AttendanceSheetImport — it lowercases and strips spaces,
// underscores, hyphens and dots), so "Attendance Status", "attendance_status"
// and "Status" all map to the same field with no manual mapping.
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceSheetColumn {
  key: string;        // internal row key used to build export rows
  header: string;     // exact Excel header text (export + template)
  aliases: string[];  // normalised header aliases the importer accepts
  sample: string;     // demo value for the Import Template
}

export const ATTENDANCE_SHEET_COLUMNS: AttendanceSheetColumn[] = [
  { key: 'employeeCode',  header: 'Employee Code',     aliases: ['employeecode', 'empcode', 'employeeid', 'empid', 'staffid', 'code'],                       sample: 'EMP-001' },
  { key: 'biometricId',   header: 'Biometric ID',      aliases: ['biometricid', 'bioid', 'deviceid', 'acno', 'enrollid', 'enrollno', 'userid', 'machineno'], sample: '1001' },
  { key: 'employeeName',  header: 'Employee Name',     aliases: ['employeename', 'name', 'empname', 'fullname', 'staffname'],                                sample: 'John Doe' },
  { key: 'company',       header: 'Company',           aliases: ['company', 'companyname', 'organisation', 'organization'],                                  sample: 'Acme Corp' },
  { key: 'branch',        header: 'Branch',            aliases: ['branch', 'branchname', 'location', 'unit'],                                                sample: 'Head Office' },
  { key: 'department',    header: 'Department',        aliases: ['department', 'dept'],                                                                      sample: 'Operations' },
  { key: 'designation',   header: 'Designation',       aliases: ['designation', 'title', 'jobtitle', 'position'],                                            sample: 'Executive' },
  { key: 'date',          header: 'Date',              aliases: ['date', 'attendancedate', 'datetime', 'attdate', 'logdate', 'punchdate'],                   sample: '2026-07-01' },
  { key: 'shift',         header: 'Shift',             aliases: ['shift', 'shiftname', 'shiftcode'],                                                         sample: 'General (09:00-18:00)' },
  { key: 'clockIn',       header: 'Clock In',          aliases: ['clockin', 'intime', 'checkin', 'punchin', 'in', 'firstpunch', 'timein', 'entry'],          sample: '09:00' },
  { key: 'clockOut',      header: 'Clock Out',         aliases: ['clockout', 'outtime', 'checkout', 'punchout', 'out', 'lastpunch', 'timeout', 'exit'],      sample: '18:00' },
  { key: 'workingHours',  header: 'Working Hours',     aliases: ['workinghours', 'workhours', 'hoursworked', 'totalhours', 'workedhours'],                   sample: '9.00' },
  { key: 'breakHours',    header: 'Break Hours',       aliases: ['breakhours', 'break', 'breaktime'],                                                        sample: '1.00' },
  { key: 'overtimeHours', header: 'Overtime Hours',    aliases: ['overtimehours', 'othours', 'othrs', 'overtime', 'ot'],                                     sample: '0.00' },
  { key: 'status',        header: 'Attendance Status', aliases: ['attendancestatus', 'status', 'presentabsent', 'attendance'],                               sample: 'Present' },
  { key: 'leaveType',     header: 'Leave Type',        aliases: ['leavetype', 'leave', 'leavecategory'],                                                     sample: '' },
  { key: 'remarks',       header: 'Remarks',           aliases: ['remarks', 'remark', 'note', 'notes', 'comment', 'comments'],                               sample: '' },
];

/** Ordered header row for both the export and the template. */
export const attendanceSheetHeaders = (): string[] => ATTENDANCE_SHEET_COLUMNS.map((c) => c.header);

/** `{ header, key }[]` for the export writer (downloadAttendanceReport). */
export const attendanceSheetExportColumns = (): { header: string; key: string }[] =>
  ATTENDANCE_SHEET_COLUMNS.map((c) => ({ header: c.header, key: c.key }));

/** Demo rows so the Import Template shows the expected shape (Present + a Leave). */
export const attendanceSampleRows = (): Record<string, string>[] => {
  const base = Object.fromEntries(ATTENDANCE_SHEET_COLUMNS.map((c) => [c.key, c.sample])) as Record<string, string>;
  const leaveRow: Record<string, string> = {
    ...base, employeeCode: 'EMP-002', biometricId: '1002', employeeName: 'Jane Smith',
    date: '2026-07-01', shift: '', clockIn: '', clockOut: '', workingHours: '0.00',
    breakHours: '0.00', overtimeHours: '0.00', status: 'Leave', leaveType: 'Casual Leave', remarks: 'Pre-approved',
  };
  return [base, leaveRow];
};
