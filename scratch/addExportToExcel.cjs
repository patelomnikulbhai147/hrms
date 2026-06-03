const fs = require('fs');
let c = fs.readFileSync('src/utils/exportUtils.ts', 'utf8');

c += `

export interface ExcelExportOptions {
  fileName: string;
  sheets: {
    sheetName: string;
    columns: { header: string; key: string; width?: number }[];
    data: any[];
  }[];
}

export const exportToExcel = (options: ExcelExportOptions) => {
  const workbook = XLSX.utils.book_new();

  options.sheets.forEach(sheet => {
    const rows = sheet.data.map(item => {
      const rowData: any = {};
      sheet.columns.forEach(col => {
        rowData[col.header] = item[col.key];
      });
      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    if (sheet.columns.some(c => c.width)) {
      worksheet['!cols'] = sheet.columns.map(c => ({ wch: c.width || 15 }));
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName);
  });

  XLSX.writeFile(workbook, \`\${options.fileName}.xlsx\`);
};
`;

fs.writeFileSync('src/utils/exportUtils.ts', c);
