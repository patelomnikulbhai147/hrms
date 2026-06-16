import { Employee, AttendanceRecord, LeaveRequest, Company, PayrollRecord } from '../data/mockData';

/**
 * Enterprise Payroll Automation Engine
 * Fully automates salary calculations based on integrated Attendance and Leave modules.
 */

export const generateAutomatedPayroll = (
  company: Company,
  employees: Employee[],
  attendance: AttendanceRecord[],
  leaves: LeaveRequest[],
  month: string,
  year: number
): PayrollRecord[] => {
  const generatedRecords: PayrollRecord[] = [];
  
  // Base configuration
  const workingDaysInMonth = 30; // Typically 30 or dynamically fetched
  const pfRate = company.pfRate || 12;
  const esicRate = company.esicRate || 0.75;
  const ptRate = company.profTaxRate || 200;
  const basicPercent = company.basicPercent || 50;

  employees.forEach(emp => {
    // 1. Calculate Monthly CTC and Base Components
    const ctcMonthly = Math.round(emp.salary / 12);
    const basicSalaryBase = Math.round(ctcMonthly * (basicPercent / 100));
    const hraBase = Math.round(basicSalaryBase * 0.4);
    const specialAllowanceBase = Math.max(0, ctcMonthly - basicSalaryBase - hraBase);
    
    // Per Day Salary
    const perDaySalary = ctcMonthly / workingDaysInMonth;
    
    // 2. Attendance Fetching (Filtering for current month/year simulation)
    // We assume the records passed correspond to the current period.
    const empAttendance = attendance.filter(a => a.employeeId === emp.id || a.employeeId === emp.employeeId);
    
    const presentDays = empAttendance.filter(a => a.status === 'Present' || a.status === 'On Duty' || a.status === 'Work From Home').length;
    const absentDays = empAttendance.filter(a => a.status === 'Absent').length;
    const halfDays = empAttendance.filter(a => a.status === 'Half Day').length;
    
    // Half Day Rule: 2 Half Days = 1 Full Day Deduction
    const halfDayDeductions = halfDays * 0.5;
    const totalAbsentDays = absentDays + halfDayDeductions;
    
    // 3. Leave Integration
    const empLeaves = leaves.filter(l => (l.employeeId === emp.id || l.employeeId === emp.employeeId) && l.status === 'Approved');
    const unpaidLeaves = empLeaves.filter(l => l.leaveType === 'Unpaid' || (l.leaveType as string) === 'Loss of Pay').reduce((sum, l) => sum + l.days, 0);
    
    // Total LOP (Loss of Pay)
    const totalLOPDays = totalAbsentDays + unpaidLeaves;
    
    // 4. Attendance Deductions
    const attendanceDeduction = Math.round(totalLOPDays * perDaySalary);
    
    // 5. Overtime Calculation
    // Fetch approved OT from the actual Overtime module
    let otHours = 0;
    
    try {
      const rawOT = localStorage.getItem(`hrms_overtime_${company.id}`);
      if (rawOT) {
        const parsedOT = JSON.parse(rawOT);
        // Sum only APPROVED OT records for this employee
        const empOT = parsedOT.filter((o: any) => 
          (o.empId === emp.id || o.empName === emp.name) && 
          o.status === 'Approved'
        );
        otHours = empOT.reduce((acc: number, curr: any) => acc + (Number(curr.otHours) || 0), 0);
      }
    } catch (e) {}
    
    const hourlyRate = perDaySalary / 8; // Assuming 8 hour standard shift
    const otMultiplier = company.overtimeRate || 1.5;
    const overtimeEarnings = Math.round(hourlyRate * otHours * otMultiplier);

    // 6. Final Gross Earnings (Pro-rated)
    const actualBasic = Math.max(0, basicSalaryBase - (attendanceDeduction * (basicPercent / 100)));
    const actualAllowances = Math.max(0, (hraBase + specialAllowanceBase) - (attendanceDeduction * ((100-basicPercent) / 100)));
    const grossEarnings = actualBasic + actualAllowances + overtimeEarnings;

    // 7. Statutory Deductions
    const pfDeduction = Math.round(actualBasic * (pfRate / 100));
    const esicDeduction = Math.round(grossEarnings * (esicRate / 100));
    
    const totalDeductions = pfDeduction + esicDeduction + ptRate;
    
    // 8. Net Salary
    const netSalary = grossEarnings - totalDeductions;
    
    generatedRecords.push({
      id: `pay-${emp.id}-${month}-${year}-${Date.now()}`,
      companyId: emp.companyId,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      month,
      year,
      basicSalary: actualBasic,
      allowances: actualAllowances + overtimeEarnings, // Folding OT into allowances for the generic model
      bonus: 0,
      deductions: totalDeductions,
      tax: 0, // Handled separately or in PT
      overtimeAmount: overtimeEarnings,
      overtimeHours: otHours,
      netSalary,
      salary: grossEarnings,
      status: 'draft',
      payrollStatus: 'draft',
      paymentStatus: 'pending',
      payslipGenerated: false,
      notes: `Auto-generated. LOP Days: ${totalLOPDays}. OT Earnings: ₹${overtimeEarnings}`
    });
  });

  return generatedRecords;
};
