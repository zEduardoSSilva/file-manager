
"use server"

import { pipeline } from "@/lib/pipeline"
import { حفظة, WorkBook, WorkSheet } from "@/lib/exceljs"
import { format } from "date-fns"

async function desmergeSheetParaDados(worksheet: WorkSheet): Promise<any[][]> {
    const data: any[][] = [];
    worksheet.eachRow((row, rowNumber) => {
        const rowData: any[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            let value = cell.value;
            if (cell.isMerged) {
                const master = worksheet.getCell(cell.master.address);
                value = master.value;
            }
            rowData[colNumber - 1] = value;
        });
        data.push(rowData);
    });
    return data;
}

async function processarExcel(workbook: WorkBook, sheetName: string, filial: string, dataEntrega: string): Promise<any[]> {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) return [];

    const data = await desmergeSheetParaDados(worksheet);
    const tables: any[] = [];
    let headerRowIndex = -1;

    for (let i = 0; i < data.length; i++) {
        const row = data[i].map(c => String(c || '').toUpperCase());
        if (row.includes('DATA') && row.includes('MOTORISTA') && row.includes('PESO')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    const headers = data[headerRowIndex];
    const tableData = data.slice(headerRowIndex + 1);

    tableData.forEach(row => {
        const rowData: any = {};
        headers.forEach((h, i) => {
            if(h) rowData[h] = row[i];
        });

        if (rowData['DATA'] && !String(rowData['DATA']).toUpperCase().includes('TOTAL')) {
            rowData['DATA DE ENTREGA'] = dataEntrega;
            rowData['REGIÃO'] = filial;
            tables.push(rowData);
        }
    });

    return tables;
}


export const executeConsolidacaoEntregasPipeline = pipeline('consolidacao-entregas', async (formData: FormData) => {
    const date = new Date(formData.get('date') as string);
    const dataFormatada = format(date, 'dd.MM.yyyy');

    const files = {
        cambe: formData.get('cambe') as File,
        cascavel: formData.get('cascavel') as File,
        curitiba: formData.get('curitiba') as File,
        "campo-grande": formData.get('campo-grande') as File,
        dourados: formData.get('dourados') as File,
    };

    const outputWorkbook = new WorkBook();
    const allData: any[] = [];

    for (const [id, file] of Object.entries(files)) {
        const buffer = await file.arrayBuffer();
        const workbook = new WorkBook();
        await workbook.xlsx.load(buffer);

        const sheet = workbook.getWorksheet(dataFormatada);
        if (sheet) {
            const processedData = await processarExcel(workbook, dataFormatada, id, dataFormatada);
            const worksheet = outputWorkbook.addWorksheet(id);
            if(processedData.length > 0) {
              worksheet.columns = Object.keys(processedData[0]).map(key => ({ header: key, key }));
              worksheet.addRows(processedData);
              allData.push(...processedData.map(d => ({ FILIAL: id, ...d })));
            }
        } else {
          const worksheet = outputWorkbook.addWorksheet(id);
          worksheet.columns = [{ header: 'Status', key: 'status' }];
          worksheet.addRow({ status: `Aba '${dataFormatada}' não encontrada.` });
        }
    }

    if (allData.length > 0) {
        const acumuladoSheet = outputWorkbook.addWorksheet('Acumulado');
        const filteredData = allData.filter(d => d.CATEGORIA_ORIGEM?.toUpperCase() !== 'CHÃO');
        acumuladoSheet.columns = Object.keys(filteredData[0]).map(key => ({ header: key, key }));
        acumuladoSheet.addRows(filteredData);
    }

    const outputFileName = `Consolidado_Entregas_${format(date, 'ddMMyy')}.xlsx`;

    return {
        summary: outputFileName,
        data: outputWorkbook,
    };
});

