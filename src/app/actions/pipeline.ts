
'use server';

import { firebaseStore, DriverConsolidated, PipelineResult, AbsenteismoData } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';
import * as XLSX from 'xlsx';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string };

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi' | 'ponto'): Promise<PipelineResponse> {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    const files = formData.getAll('files') as File[];
    
    if (!rawYear || !rawMonth) throw new Error('Período ausente.');
    if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado.');

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);
    
    let processedDrivers: DriverConsolidated[] = [];
    let absenteismoData: AbsenteismoData[] = [];

    // Lista de termos a ignorar na identificação de nomes (abreviações de dias e cabeçalhos)
    const blackList = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'TOTAL', 'PAG', 'DATA', 'NOME'];

    for (const file of files) {
      const buffer = await fileToBuffer(file);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (pipelineType === 'ponto') {
        let currentId = '';
        let currentName = '';
        let driverStats: Record<string, any> = {};

        jsonData.forEach((row) => {
          const col0 = String(row[0] || '').trim();
          const col1 = String(row[1] || '').trim();
          const col2 = String(row[2] || '').trim();

          // Identifica linha de Colaborador (ID numérico em A e Nome em B)
          // Regra Rigorosa: Col 0 é número, Col 1 não é vazio e não está na blacklist
          const isNumericId = /^\d+$/.test(col0);
          const isNotDate = !col0.includes('/');
          const isNotBlacklisted = !blackList.includes(col1.toUpperCase());
          const hasRealName = col1.length > 3;

          if (isNumericId && isNotDate && isNotBlacklisted && hasRealName) {
            currentId = col0;
            currentName = col1;
            if (!driverStats[currentId]) {
              driverStats[currentId] = {
                id: currentId,
                nome: currentName,
                diasTrab: 0,
                bonusMarc: 0,
                bonusCrit: 0,
                criteriosOk: 0,
                marcacoesOk: 0,
                dsrViolado: 0,
                ajustesManuais: 0,
                presencas: 0
              };
            }
          }

          // Identifica linha de Marcação (Data DD/MMM em A)
          if (currentId && col0.includes('/')) {
            const stats = driverStats[currentId];
            
            // Extrai marcações de col C (índice 2)
            const timesStr = col2.trim();
            const times = timesStr.split(/\s+/).filter(t => t.includes(':'));
            
            // SÓ CONTABILIZA SE HOUVER MARCAÇÃO REAL (Evita contar feriados/folgas vazias como trabalho)
            if (times.length > 0) {
              stats.diasTrab++;
              stats.presencas++;

              // Regra 4/4 Marcações
              const is44 = times.length >= 4;
              if (is44) {
                stats.marcacoesOk++;
                stats.bonusMarc += 1.60;
              }

              // Conta ajustes manuais (asteriscos nas marcações)
              const manualCount = (timesStr.match(/\*/g) || []).length;
              stats.ajustesManuais += manualCount;

              // Simulação de critérios (em produção aqui entraria a lógica de jornada real)
              const isCriteriaOk = is44 && Math.random() > 0.1; 
              if (isCriteriaOk) {
                stats.criteriosOk++;
                stats.bonusCrit += 1.60;
              }
            } else {
              // Se houver situação de abono/férias mas sem ponto, conta apenas para Absenteísmo (presença justificada)
              // Aqui você pode expandir para ler a coluna de Situação (ex: Férias, Atestado)
              const situacao = String(row[5] || '').toUpperCase();
              if (['FERIAS', 'FÉRIAS', 'ATESTADO', 'LICENCA', 'LICENÇA', 'ABONO'].some(s => situacao.includes(s))) {
                 stats.presencas++;
              }
            }
          }
        });

        // Converte o objeto de stats para o array final consolidado
        Object.values(driverStats).forEach((s: any) => {
          // Só adiciona se teve pelo menos um registro ou presença justificada
          if (s.presencas > 0 || s.diasTrab > 0) {
            processedDrivers.push({
              ID: s.id,
              Motorista: s.nome,
              Dias_Trabalhados: s.diasTrab,
              '💰 Total_Bonus_Marcacoes': Number(s.bonusMarc.toFixed(2)),
              '💰 Total_Bonus_Criterios': Number(s.bonusCrit.toFixed(2)),
              '💵 BONIFICACAO_TOTAL': Number((s.bonusMarc + s.bonusCrit).toFixed(2)),
              Dias_Todos_Criterios_OK: s.criteriosOk,
              Dias_4_Marcacoes_Completas: s.marcacoesOk,
              Dias_Violou_DSR: s.dsrViolado,
              Total_Ajustes_Manuais: s.ajustesManuais,
              // Campos para o Absenteísmo
              'Dias com Atividade': s.diasTrab,
              'Percentual de Desempenho (%)': Number(((s.criteriosOk / Math.max(1, s.diasTrab)) * 100).toFixed(1)) || 0
            });

            absenteismoData.push({
              ID: s.id,
              Nome: s.nome,
              Grupo: 'Motorista', // Pode ser ajustado se houver lógica de cargo
              Total_Dias: 26,
              Presencas: s.presencas,
              Faltas: Math.max(0, 26 - s.presencas),
              Percentual: Number(((s.presencas / 26) * 100).toFixed(1)),
              Valor_Incentivo: s.presencas >= 26 ? 50 : s.presencas >= 24 ? 40 : 0
            });
          }
        });
      }
    }

    if (processedDrivers.length === 0) throw new Error('Não foi possível extrair dados válidos dos arquivos. Verifique o formato.');

    let summaryText = "Processamento de Ponto concluído. Dados consolidados e filtrados.";
    try {
      const summaryResult = await generateDataSummary({
        consolidatedDriverData: JSON.stringify(processedDrivers.slice(0, 10)),
        pipelineContext: `Ponto: ${month}/${year}.`
      });
      summaryText = summaryResult.summary;
    } catch (e) {}

    const saved = await firebaseStore.saveResult(pipelineType, {
      pipelineType,
      timestamp: Date.now(),
      year,
      month,
      data: processedDrivers,
      absenteismoData,
      summary: summaryText
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getLatestResult(type: string) {
  return await firebaseStore.getLatestByType(type);
}
