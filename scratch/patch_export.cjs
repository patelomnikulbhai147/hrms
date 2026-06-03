const fs = require('fs');

let content = fs.readFileSync('src/utils/exportUtils.ts', 'utf-8');

const importRegex = /import \* as XLSX from 'xlsx';/;
const newImport = `import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';`;
content = content.replace(importRegex, newImport);

const formatRegex = /format\?: 'excel' \| 'csv';/;
const newFormat = `format?: 'excel' | 'csv' | 'pdf';`;
content = content.replace(formatRegex, newFormat);

const exportRegex = /if \(format === 'csv'\) \{[\s\S]*?\} else \{[\s\S]*?XLSX\.writeFile\(workbook, \`\$\{fileName\}_\$\{timestamp\}\.xlsx\`\);\n  \}/;

const newExport = `if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", \`\${fileName}_\${timestamp}.csv\`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else if (format === 'pdf') {
    const doc = new jsPDF('landscape');
    
    sheets.forEach((sheet, idx) => {
      if (idx > 0) doc.addPage();
      
      doc.setFontSize(16);
      doc.text(sheet.sheetName || fileName, 14, 15);
      
      const head = [sheet.columns.map(col => col.header)];
      const body = sheet.data.map(item => {
        return sheet.columns.map(col => {
          const keys = col.key.split('.');
          let val = item;
          for (const k of keys) {
            if (val !== undefined && val !== null) val = val[k];
          }
          return val ?? '-';
        });
      });

      (doc as any).autoTable({
        startY: 25,
        head: head,
        body: body,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] }
      });
    });

    doc.save(\`\${fileName}_\${timestamp}.pdf\`);
  } else {
    XLSX.writeFile(workbook, \`\${fileName}_\${timestamp}.xlsx\`);
  }`;

content = content.replace(exportRegex, newExport);

fs.writeFileSync('src/utils/exportUtils.ts', content);
console.log('exportUtils.ts patched for PDF support!');
