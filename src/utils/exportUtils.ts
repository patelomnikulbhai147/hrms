import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportSheet {
  sheetName: string;
  columns: ExportColumn[];
  data: any[];
}

export interface ExportOptions {
  fileName: string;
  sheets: ExportSheet[];
  format?: 'excel' | 'csv';
}

/**
 * Enterprise Export Utility
 * Transforms an array of objects into properly formatted Excel or CSV files.
 */
export const exportToExcel = ({ fileName, sheets, format = 'excel' }: ExportOptions) => {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(sheet => {
    // Map data to match column headers
    const formattedData = sheet.data.map(item => {
      const row: Record<string, any> = {};
      sheet.columns.forEach(col => {
        const keys = col.key.split('.');
        let val = item;
        for (const k of keys) {
          if (val !== undefined && val !== null) val = val[k];
        }
        row[col.header] = val ?? '';
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    // Set column widths
    worksheet['!cols'] = sheet.columns.map(col => ({
      wch: col.width || 15
    }));

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName || 'Data');
  });

  // Auto-generate timestamp for filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  if (format === 'csv') {
    // Write the first sheet as CSV
    const csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${fileName}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    XLSX.writeFile(workbook, `${fileName}_${timestamp}.xlsx`);
  }
};
