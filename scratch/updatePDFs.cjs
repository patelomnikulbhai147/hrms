const fs = require('fs');

let pay = fs.readFileSync('src/pages/Payroll.tsx', 'utf8');
if (!pay.includes('downloadPayrollPDF')) {
  pay = pay.replace(/import \{ Badge \} from '\.\.\/components\/ui\/Badge';/, "import { Badge } from '../components/ui/Badge';\nimport { downloadPayrollPDF } from '../utils/exportUtils';");
  pay = pay.replace(/const handleDownloadPDF = \(record: PayrollRecord\) => \{[\s\S]*?\};/, "const handleDownloadPDF = (record: PayrollRecord) => {\n    downloadPayrollPDF(record, currentCompany);\n  };");
  fs.writeFileSync('src/pages/Payroll.tsx', pay);
}

let rep = fs.readFileSync('src/pages/Reports.tsx', 'utf8');
if (!rep.includes('downloadAttendancePDF')) {
  rep = rep.replace(/import \{ Badge, statusBadge \} from '\.\.\/components\/ui\/Badge';/, "import { Badge, statusBadge } from '../components/ui/Badge';\nimport { downloadAttendancePDF, downloadAttendanceExcel } from '../utils/exportUtils';");
  
  // Replace the buttons
  rep = rep.replace(/<Button variant="outline" icon=\{<Download size=\{13\} \/>\}>Download PDF<\/Button>/, "<Button onClick={() => downloadAttendancePDF(companyAttendance, monthFilter, '2026', currentCompany.name)} variant=\"outline\" icon={<Download size={13} />}>Download PDF</Button>");
  
  rep = rep.replace(/<Button variant="outline" icon=\{<Download size=\{13\} \/>\}>Download Excel<\/Button>/, "<Button onClick={() => downloadAttendanceExcel(companyAttendance, monthFilter, '2026')} variant=\"outline\" icon={<Download size={13} />}>Download Excel</Button>");

  fs.writeFileSync('src/pages/Reports.tsx', rep);
}

console.log('PDF logic integrated.');
