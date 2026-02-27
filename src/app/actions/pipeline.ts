
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

// Helper para normalizar datas para o formato DD/MM/YYYY
const normalizeDateStr = (dateStr: string, defaultYear: number): string => {
  const clean = dateStr.trim();
  if (!clean.includes('/')) return clean;
  
  const parts = clean.split('/');
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parts[2] ? parts[2] : String(defaultYear);
  
  if (year.length === 2) year = `20${year}`;
  
  return `${day}/${month}/${year}`;
};

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi' | 'ponto'): Promise<PipelineResponse> {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    const files = formData.getAll('files') as File[];
    
    if (!rawYear || !rawMonth) throw new Error('Período ausente.');
    if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado.');

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);
    
    // Mapa para consolidar dados: ID -> Data Normalizada -> Melhor Registro
    const rawDataMap: Record<string, { 
      id: string, 
      nome: string, 
      days: Record<string, any> 
    }> = {};

    const blackList = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'TOTAL', 'PAG', 'DATA', 'NOME', 'STATUS', 'SITUAÇÃO', 'HORA', 'DSR'];
    const situacoesPresenca = ['FERIAS', 'FÉRIAS', 'ATESTADO', 'LICENCA', 'LICENÇA', 'ABONO', 'CRÉDITO', 'BH', 'DEBITO', 'DÉBITO', 'PRESENÇA'];

    for (const file of files) {
      const buffer = await fileToBuffer(file);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];

      let currentId = '';
      let currentName = '';

      jsonData.forEach((row) => {
        const col0 = String(row[0] || '').trim();
        const col1 = String(row[1] || '').trim();
        const col2 = String(row[2] || '').trim();

        // Identificação de Colaborador (ID em A, Nome em B)
        // Critérios baseados no script Python: numérico, sem barra, nome longo
        const isNumericId = /^\d+$/.test(col0);
        const isNotDate = !col0.includes('/');
        const hasRealName = col1.length > 5 && !blackList.includes(col1.toUpperCase().substring(0, 3));
        const isNotInternalCode = isNumericId && parseInt(col0) > 30; // IDs de funcionários costumam ser maiores que códigos de dia ou internos

        if (isNumericId && isNotDate && hasRealName && isNotInternalCode) {
          currentId = col0;
          currentName = col1;
          if (!rawDataMap[currentId]) {
            rawDataMap[currentId] = { id: currentId, nome: currentName, days: {} };
          }
        }

        // Identificação de Linha de Data (Data em A, formato DD/MM ou DD/MM/YYYY)
        const dateMatch = col0.match(/^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/);
        if (currentId && dateMatch) {
          const rowMonth = parseInt(dateMatch[2]);
          
          if (rowMonth === month) {
            const normalizedDate = normalizeDateStr(col0, year);
            const timesStr = col2.trim();
            const times = timesStr.split(/\s+/).filter(t => t.includes(':'));
            const manualCount = (timesStr.match(/\*/g) || []).length;
            
            // Score para deduplicação (prioriza linhas com mais batidas)
            const score = times.length;
            
            // Busca situação nas colunas D, E, F...
            let situacao = '';
            for (let i = 3; i < row.length; i++) {
              const val = String(row[i] || '').trim();
              if (val && !/^\d+$/.test(val) && !val.includes(':') && val.length > 2) {
                situacao = val.toUpperCase();
                break;
              }
            }

            const existingDay = rawDataMap[currentId].days[normalizedDate];
            // Se não existe ou se o novo registro tem mais informação (score), atualiza
            if (!existingDay || score >= (existingDay.score || 0)) {
              rawDataMap[currentId].days[normalizedDate] = {
                data: normalizedDate,
                diaSemana: col1,
                marcacoes: times,
                numMarcacoes: times.length,
                ajustes: manualCount,
                situacao: situacao,
                score: score,
                isAjudante: currentName.toUpperCase().includes('AJUDANTE') || false
              };
            }
          }
        }
      });
    }

    // Processamento Final (Consolidação)
    const processedDrivers: DriverConsolidated[] = [];
    const absenteismoData: AbsenteismoData[] = [];
    const detalhePonto: any[] = [];

    Object.values(rawDataMap).forEach(colab => {
      let stats = {
        diasRegistrados: 0,
        marcacoesOk: 0,
        criteriosOk: 0,
        bonusMarc: 0,
        bonusCrit: 0,
        ajustesManuais: 0,
        presencas: 0,
        diasComAtividade: 0
      };

      const isAjudante = colab.nome.toUpperCase().includes('AJUDANTE');
      const valMarc = isAjudante ? 2.40 : 1.60;
      const valCrit = isAjudante ? 2.40 : 1.60;

      // Ordena as datas para o processamento e visualização correta
      const sortedDates = Object.keys(colab.days).sort((a, b) => {
        const [d1, m1, y1] = a.split('/').map(Number);
        const [d2, m2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
      });

      sortedDates.forEach(dateKey => {
        const day = colab.days[dateKey];
        stats.diasRegistrados++;
        
        const is44 = day.numMarcacoes >= 4;
        const isPresencaJustificada = situacoesPresenca.some(s => day.situacao.includes(s));
        const hasPhysicalActivity = day.numMarcacoes > 0;

        if (hasPhysicalActivity) {
          stats.diasComAtividade++;
          stats.presencas++;
          stats.ajustesManuais += day.ajustes;
          
          if (is44) {
            stats.marcacoesOk++;
            stats.bonusMarc += valMarc;
          }

          // 5 Critérios (Simulação baseada no script Python: 4 batidas + zero ajustes)
          if (is44 && day.ajustes === 0) {
            stats.criteriosOk++;
            stats.bonusCrit += valCrit;
          }
        } else if (isPresencaJustificada) {
          stats.presencas++;
        }

        detalhePonto.push({
          ID: colab.id,
          Nome: colab.nome,
          Data: day.data,
          Dia_Semana: day.diaSemana,
          Batidas: day.marcacoes.join(' '),
          Situacao: day.situacao,
          Ajustes: day.ajustes,
          '4_Marcacoes_OK': is44 ? 'SIM' : 'NÃO',
          'Critérios_OK': (is44 && day.ajustes === 0) ? 'SIM' : 'NÃO'
        });
      });

      if (stats.diasRegistrados > 0) {
        processedDrivers.push({
          ID: colab.id,
          Motorista: colab.nome,
          Dias_Trabalhados: stats.diasRegistrados,
          '💰 Total_Bonus_Marcacoes': Number(stats.bonusMarc.toFixed(2)),
          '💰 Total_Bonus_Criterios': Number(stats.bonusCrit.toFixed(2)),
          '💵 BONIFICACAO_TOTAL': Number((stats.bonusMarc + stats.bonusCrit).toFixed(2)),
          Dias_Todos_Criterios_OK: stats.criteriosOk,
          Dias_4_Marcacoes_Completas: stats.marcacoesOk,
          Dias_Violou_DSR: 0,
          Total_Ajustes_Manuais: stats.ajustesManuais,
          'Dias com Atividade': stats.diasComAtividade,
          'Percentual de Desempenho (%)': Number(((stats.criteriosOk / Math.max(1, stats.diasRegistrados)) * 100).toFixed(1))
        });

        absenteismoData.push({
          ID: colab.id,
          Nome: colab.nome,
          Grupo: isAjudante ? 'Ajudante' : 'Motorista',
          Total_Dias: stats.diasRegistrados,
          Presencas: stats.presencas,
          Faltas: Math.max(0, stats.diasRegistrados - stats.presencas),
          Percentual: Number(((stats.presencas / Math.max(1, stats.diasRegistrados)) * 100).toFixed(1)),
          Valor_Incentivo: stats.presencas >= 26 ? 50 : stats.presencas >= 24 ? 40 : 0
        });
      }
    });

    if (processedDrivers.length === 0) throw new Error('Nenhum dado encontrado para o mês selecionado. Verifique se o ID do colaborador e as datas estão corretos no arquivo.');

    // Salva no banco simulado
    const saved = await firebaseStore.saveResult(pipelineType, {
      pipelineType,
      timestamp: Date.now(),
      year,
      month,
      data: processedDrivers,
      absenteismoData,
      detalhePonto,
      summary: `Processamento de Ponto concluído. Foram identificados ${processedDrivers.length} colaboradores.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    console.error('Erro no Pipeline:', error);
    return { success: false, error: error.message };
  }
}

export async function getLatestResult(type: string) {
  return await firebaseStore.getLatestByType(type);
}
