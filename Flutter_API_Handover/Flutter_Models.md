# Flutter Models: Attendance & Leave

## 1. Attendance Model (Phase 3)

```dart
class AttendanceToday {
  final int id;
  final String date;
  final String shift;
  final String checkIn;
  final String checkOut;
  final double workingHours;
  final bool lateStatus;
  final bool earlyExitStatus;
  final String status;

  AttendanceToday({
    required this.id,
    required this.date,
    required this.shift,
    required this.checkIn,
    required this.checkOut,
    required this.workingHours,
    required this.lateStatus,
    required this.earlyExitStatus,
    required this.status,
  });

  factory AttendanceToday.fromJson(Map<String, dynamic> json) {
    return AttendanceToday(
      id: json['id'],
      date: json['date'],
      shift: json['shift'],
      checkIn: json['checkIn'] ?? '',
      checkOut: json['checkOut'] ?? '',
      workingHours: (json['workingHours'] ?? 0).toDouble(),
      lateStatus: json['lateStatus'] ?? false,
      earlyExitStatus: json['earlyExitStatus'] ?? false,
      status: json['status'] ?? 'Present',
    );
  }
}
```

## 2. Monthly Attendance Summary

```dart
class MonthlyAttendanceSummary {
  final double present;
  final double absent;
  final double leave;
  final double holiday;
  final double weekend;
  final double halfDay;
  final double totalWorkingHours;

  MonthlyAttendanceSummary({
    required this.present,
    required this.absent,
    required this.leave,
    required this.holiday,
    required this.weekend,
    required this.halfDay,
    required this.totalWorkingHours,
  });

  factory MonthlyAttendanceSummary.fromJson(Map<String, dynamic> json) {
    return MonthlyAttendanceSummary(
      present: (json['present'] ?? 0).toDouble(),
      absent: (json['absent'] ?? 0).toDouble(),
      leave: (json['leave'] ?? 0).toDouble(),
      holiday: (json['holiday'] ?? 0).toDouble(),
      weekend: (json['weekend'] ?? 0).toDouble(),
      halfDay: (json['halfDay'] ?? 0).toDouble(),
      totalWorkingHours: (json['totalWorkingHours'] ?? 0).toDouble(),
    );
  }
}
```

## 3. Leave Request Model

```dart
class LeaveRequest {
  final int id;
  final int companyId;
  final int employeeId;
  final String employeeName;
  final String leaveType;
  final String fromDate;
  final String toDate;
  final double days;
  final String reason;
  final String status;
  final String appliedOn;

  LeaveRequest({
    required this.id,
    required this.companyId,
    required this.employeeId,
    required this.employeeName,
    required this.leaveType,
    required this.fromDate,
    required this.toDate,
    required this.days,
    required this.reason,
    required this.status,
    required this.appliedOn,
  });

  factory LeaveRequest.fromJson(Map<String, dynamic> json) {
    return LeaveRequest(
      id: json['id'],
      companyId: json['companyId'],
      employeeId: json['employeeId'],
      employeeName: json['employeeName'],
      leaveType: json['leaveType'],
      fromDate: json['fromDate'],
      toDate: json['toDate'],
      days: (json['days'] ?? 0).toDouble(),
      reason: json['reason'],
      status: json['status'],
      appliedOn: json['appliedOn'],
    );
  }
}
```

## 4. Leave Balance Model

```dart
class LeaveBalance {
  final double cl;
  final double pl;
  final double sl;
  final int year;

  LeaveBalance({
    required this.cl,
    required this.pl,
    required this.sl,
    required this.year,
  });

  factory LeaveBalance.fromJson(Map<String, dynamic> json) {
    return LeaveBalance(
      cl: (json['cl'] ?? 0).toDouble(),
      pl: (json['pl'] ?? 0).toDouble(),
      sl: (json['sl'] ?? 0).toDouble(),
      year: json['year'] ?? DateTime.now().year,
    );
  }
}
```

## 5. Document Model

```dart
class EmployeeDocument {
  final int id;
  final String name;
  final String type;
  final String uploadedOn;
  final String size;
  final String mimeType;
  final String? category;
  final String? expiryDate;
  final String? documentNumber;
  final String? fileData; // Only populated on GET /:id

  EmployeeDocument({
    required this.id,
    required this.name,
    required this.type,
    required this.uploadedOn,
    required this.size,
    required this.mimeType,
    this.category,
    this.expiryDate,
    this.documentNumber,
    this.fileData,
  });

  factory EmployeeDocument.fromJson(Map<String, dynamic> json) {
    return EmployeeDocument(
      id: json['id'],
      name: json['name'],
      type: json['type'],
      uploadedOn: json['uploadedOn'] ?? '',
      size: json['size'] ?? 'Unknown',
      mimeType: json['mimeType'] ?? 'application/octet-stream',
      category: json['category'],
      expiryDate: json['expiryDate'],
      documentNumber: json['documentNumber'],
      fileData: json['fileData'],
    );
  }
}
```

## 6. Payroll Model

```dart
class EmployeePayroll {
  final int id;
  final String month;
  final int year;
  final double grossSalary;
  final double netSalary;
  final double totalDeductions;
  final double totalAllowances;
  final String payrollStatus;
  final String paymentStatus;
  
  // Detailed fields (only present on GET /:id or /:id/payslip)
  final double? basicSalary;
  final double? overtime;
  final double? bonus;
  final double? tax;
  final double? loanDeduction;
  final Map<String, dynamic>? breakdown; // pf, esi, pt
  final Map<String, dynamic>? attendance; // payableDays, workingDays, etc.
  final String? companyName; // payslip endpoint only
  final String? employeeName; // payslip endpoint only
  final String? department; // payslip endpoint only

  EmployeePayroll({
    required this.id,
    required this.month,
    required this.year,
    required this.grossSalary,
    required this.netSalary,
    required this.totalDeductions,
    required this.totalAllowances,
    required this.payrollStatus,
    required this.paymentStatus,
    this.basicSalary,
    this.overtime,
    this.bonus,
    this.tax,
    this.loanDeduction,
    this.breakdown,
    this.attendance,
    this.companyName,
    this.employeeName,
    this.department,
  });

  factory EmployeePayroll.fromJson(Map<String, dynamic> json) {
    return EmployeePayroll(
      id: json['id'],
      month: json['month'],
      year: json['year'],
      grossSalary: (json['grossSalary'] ?? 0).toDouble(),
      netSalary: (json['netSalary'] ?? 0).toDouble(),
      totalDeductions: (json['totalDeductions'] ?? json['deductions'] ?? 0).toDouble(),
      totalAllowances: (json['totalAllowances'] ?? json['allowances'] ?? 0).toDouble(),
      payrollStatus: json['payrollStatus'] ?? json['status']?['payroll'] ?? 'unknown',
      paymentStatus: json['paymentStatus'] ?? json['status']?['payment'] ?? 'unknown',
      basicSalary: json['basicSalary'] != null ? (json['basicSalary']).toDouble() : null,
      overtime: json['overtime'] != null ? (json['overtime']).toDouble() : null,
      bonus: json['bonus'] != null ? (json['bonus']).toDouble() : null,
      tax: json['tax'] != null ? (json['tax']).toDouble() : null,
      loanDeduction: json['loanDeduction'] != null ? (json['loanDeduction']).toDouble() : null,
      breakdown: json['breakdown'],
      attendance: json['attendance'],
      companyName: json['companyName'],
      employeeName: json['employeeName'],
      department: json['department'],
    );
  }
}
```
