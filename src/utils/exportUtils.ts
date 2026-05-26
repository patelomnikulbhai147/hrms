import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportOptions {
  fileName: string;
  sheetName?: string;
  columns: ExportColumn[];
  data: any[];
}

/**
 * Enterprise Export Utility
 * Transforms an array of objects into a properly formatted Excel file.
 */
export const exportToExcel = ({ fileName, sheetName = 'Sheet1', columns, data }: ExportOptions) => {
  // Map data to match column headers
  const formattedData = data.map(item => {
    const row: Record<string, any> = {};
    columns.forEach(col => {
      // Handle nested keys if needed (e.g., 'company.name')
      const keys = col.key.split('.');
      let val = item;
      for (const k of keys) {
        if (val) val = val[k];
      }
      row[col.header] = val ?? '';
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);

  // Set column widths
  worksheet['!cols'] = columns.map(col => ({
    wch: col.width || 15 // Default width
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Auto-generate timestamp for filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  XLSX.writeFile(workbook, `${fileName}_${timestamp}.xlsx`);
};
