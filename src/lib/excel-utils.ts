                    
import * as XLSX from 'xlsx';

/**
 * Utilitário para exportar dados para Excel.
 */
export function downloadExcel(data: any[], fileName: string, sheetName: string = 'Resultado') {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Gera o arquivo e inicia o download
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function downloadMultipleSheets(sheets: { data: any[], name: string }[], fileName: string) {
  const workbook = XLSX.utils.book_new();
  
  sheets.forEach(sheet => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}
