import {
  processAndSave,
  PipelineArgs,
  ProcessorOutput,
  PipelineResponse,
} from './actions-utils';

// ─── Constantes financeiras ───────────────────────────────────────────────────
const BONIFICACAO_DIARIA_TOTAL = 16.00;
const PERCENTUAL_CONDUCAO = 0.30; // R$ 4,80/dia

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePlate(s: any): string | null {
  if (s == null || s === '') return null;
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  // Tenta DD/MM/YYYY primeiro, depois ISO
  const str = String(value).trim();
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return str.slice(0, 10);
  return null;
}

function parseTime(value: any): number {
  // Converte HH:MM:SS → segundos
  if (!value || value === '-') return 0;
  const parts = String(value).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function extractNameCpf(text: any): { nome: string; cpf: string } {
  if (!text || String(text).trim() === '') return { nome: '', cpf: '' };
  const str = String(text).trim();
  const cpfMatch = str.match(/(\d{11})/);
  if (cpfMatch) {
    const cpf = cpfMatch[1];
    const nome = str.replace(/[-\s]*\d{11}[-\s]*/g, '').replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').trim();
    return { nome, cpf };
  }
  return { nome: str, cpf: '' };
}

// ─── Etapa 1: Atualizar motoristas no Boletim do Veículo ─────────────────────

function atualizarMotoristasBoletimVeiculo(
  boletim: any[],
  controle: any[]
): { boletimAtualizado: any[]; mapaMotoristas: Map<string, string> } {

  // Monta mapa (PLACA|DATA) → MOTORISTA a partir do controle
  const mapaMotoristas = new Map<string, string>();

  for (const row of controle) {
    const placa =
      normalizePlate(row['PLACA']) ?? normalizePlate(row['PLACA SISTEMA']);
    const data = parseDate(row['DATA DE ENTREGA']);
    const motorista = row['MOTORISTA'];

    if (placa && data && motorista) {
      mapaMotoristas.set(`${placa}|${data}`, String(motorista));
    }
  }

  // Atualiza boletim
  let atualizados = 0;
  const boletimAtualizado = boletim.map(row => {
    const placa = normalizePlate(row['PLACA']);
    const data = parseDate(row['DIA']);
    if (!placa || !data) return row;

    const chave = `${placa}|${data}`;
    const novoMotorista = mapaMotoristas.get(chave);
    if (novoMotorista && novoMotorista !== row['MOTORISTAS']) {
      atualizados++;
      return { ...row, MOTORISTAS: novoMotorista };
    }
    return row;
  });

  console.log(`[vFleet] Etapa 1: ${atualizados} motoristas atualizados de ${boletim.length} registros`);
  return { boletimAtualizado, mapaMotoristas };
}

// ─── Etapa 2: Converter Boletim do Veículo → Boletim do Motorista ─────────────

function converterVeiculoParaMotorista(boletimVeiculo: any[]): any[] {
  return boletimVeiculo.map(row => {
    const { nome, cpf } = extractNameCpf(row['MOTORISTAS']);
    return { ...row, MOTORISTA_NOME: nome, CPF: cpf, MOTORISTA: nome };
  });
}

// ─── Etapa 3: Consolidar alertas ─────────────────────────────────────────────

function consolidarAlertas(alertas: any[][]): any[] {
  const todos = alertas.flat();
  // Remove duplicatas baseado em todos os campos exceto origem
  const seen = new Set<string>();
  return todos.filter(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Etapa 3.1: Corrigir "Sem Identificação" nos alertas ─────────────────────

function corrigirMotoristasAlertas(
  alertas: any[],
  mapaMotoristas: Map<string, string>
): any[] {
  let corrigidos = 0;

  const resultado = alertas.map(row => {
    const semId =
      !row['MOTORISTA'] ||
      String(row['MOTORISTA']).trim() === '' ||
      String(row['MOTORISTA']).trim() === '-' ||
      /sem identificação/i.test(String(row['MOTORISTA']));

    if (!semId) return row;

    const placa = normalizePlate(row['PLACA']);
    const data = parseDate(row['DATA']);
    if (!placa || !data) return row;

    const novoMotorista = mapaMotoristas.get(`${placa}|${data}`);
    if (novoMotorista) {
      corrigidos++;
      return { ...row, MOTORISTA: novoMotorista };
    }
    return row;
  });

  console.log(`[vFleet] Etapa 3.1: ${corrigidos} alertas corrigidos`);
  return resultado;
}

// ─── Etapa 4: Análise de condução ────────────────────────────────────────────

function analisarConducao(
  boletimMotorista: any[],
  alertas: any[]
): { detalhe: any[]; consolidado: any[] } {

  const valorConducao = BONIFICACAO_DIARIA_TOTAL * PERCENTUAL_CONDUCAO; // R$ 4,80

  // Filtra apenas registros com atividade real
  const ativos = boletimMotorista.filter(row => {
    const ignicao = parseTime(row['TEMPO IGNIÇÃO LIGADA']);
    const distancia = parseFloat(String(row['DISTÂNCIA PERCORRIDA'] ?? '0').replace(',', '.')) || 0;
    return ignicao > 0 || distancia > 0;
  });

  // Mapa de excessos de velocidade por motorista+dia
  const excesso = new Map<string, boolean>();
  for (const alerta of alertas) {
    if (String(alerta['TIPO'] ?? '').toUpperCase() !== 'EXCESSO_VELOCIDADE') continue;
    const motorista = alerta['MOTORISTA'];
    const data = parseDate(alerta['DATA']);
    if (motorista && data && !/sem identificação/i.test(motorista)) {
      excesso.set(`${motorista}|${data}`, true);
    }
  }

  // Agrupa por Motorista + Dia
  const grupos = new Map<string, any[]>();
  for (const row of ativos) {
    const motorista = String(row['MOTORISTA'] ?? '').trim();
    const dia = parseDate(row['DIA']) ?? String(row['DIA']);
    if (!motorista) continue;
    const chave = `${motorista}|${dia}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(row);
  }

  const detalhe: any[] = [];

  for (const [chave, rows] of grupos) {
    const [motorista, dia] = chave.split('|');
    const total = rows.length;

    const curvaOk    = rows.filter(r => (parseFloat(r['CURVA BRUSCA']) || 0) === 0).length;
    const bangulaOk  = rows.filter(r => parseTime(r['BANGUELA']) === 0).length;
    const ociosOk    = rows.filter(r => parseTime(r['PARADO LIGADO']) === 0).length;
    const semExcesso = !excesso.get(chave);

    const pctCurva   = (curvaOk   / total * 100);
    const pctBanguela = (bangulaOk / total * 100);
    const pctOciosidade = (ociosOk / total * 100);

    const cumpriuCurva    = pctCurva   === 100;
    const cumpriuBanguela = pctBanguela === 100;
    const cumpriuOciosidade = pctOciosidade === 100;
    const cumpriuVelocidade = semExcesso;

    const criteriosCumpridos =
      (cumpriuCurva ? 1 : 0) +
      (cumpriuBanguela ? 1 : 0) +
      (cumpriuOciosidade ? 1 : 0) +
      (cumpriuVelocidade ? 1 : 0);

    const diaBonificado = criteriosCumpridos === 4;
    const bonificacao = diaBonificado ? valorConducao : 0;

    detalhe.push({
      'Motorista': motorista,
      'Dia': dia,
      'Total de Registros': total,
      '% Sem Curva': +pctCurva.toFixed(2),
      '✓ Curva 100%': cumpriuCurva,
      '% Sem Banguela': +pctBanguela.toFixed(2),
      '✓ Banguela 100%': cumpriuBanguela,
      '% Sem Ociosidade': +pctOciosidade.toFixed(2),
      '✓ Ociosidade 100%': cumpriuOciosidade,
      '✓ Sem Excesso Velocidade': cumpriuVelocidade,
      'Critérios Cumpridos (de 4)': criteriosCumpridos,
      'Critérios Falhados': 4 - criteriosCumpridos,
      'Dia Bonificado': diaBonificado,
      'Bonificação Condução (R$)': bonificacao,
    });
  }

  // Consolidado por motorista
  const porMotorista = new Map<string, any>();
  for (const row of detalhe) {
    const m = row['Motorista'];
    if (!porMotorista.has(m)) {
      porMotorista.set(m, {
        Motorista: m,
        'Dias com Atividade': 0,
        'Dias Bonificados (4/4)': 0,
        'Total Bonificação (R$)': 0,
        'Falhas Curva Brusca': 0,
        'Falhas Banguela': 0,
        'Falhas Ociosidade': 0,
        'Falhas Exc. Velocidade': 0,
      });
    }
    const agg = porMotorista.get(m)!;
    agg['Dias com Atividade']++;
    if (row['Dia Bonificado']) agg['Dias Bonificados (4/4)']++;
    agg['Total Bonificação (R$)'] += row['Bonificação Condução (R$)'];
    if (!row['✓ Curva 100%'])             agg['Falhas Curva Brusca']++;
    if (!row['✓ Banguela 100%'])          agg['Falhas Banguela']++;
    if (!row['✓ Ociosidade 100%'])        agg['Falhas Ociosidade']++;
    if (!row['✓ Sem Excesso Velocidade']) agg['Falhas Exc. Velocidade']++;
  }

  const consolidado = Array.from(porMotorista.values()).map(m => ({
    ...m,
    'Total Bonificação (R$)': +m['Total Bonificação (R$)'].toFixed(2),
    'Percentual de Desempenho (%)': m['Dias com Atividade'] > 0
      ? +(m['Dias Bonificados (4/4)'] / m['Dias com Atividade'] * 100).toFixed(2)
      : 0,
  })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

  console.log(`[vFleet] Etapa 4: ${detalhe.length} dias analisados, ${consolidado.length} motoristas`);
  return { detalhe, consolidado };
}

// ─── Processor principal (substitui o placeholder) ────────────────────────────

async function vFleetProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  // Lê todos os arquivos enviados (Boletim_do_Veiculo, Controle, Alertas)
  const sheetsData = await args.files.readAll('files');

  // Separa arquivos pelo nome original (passado via FormData)
  const fileNames: string[] = (args.formData?.getAll('fileNames') as string[]) ?? [];

  // Estratégia: arquivos cujo nome contém "Controle" → controle
  //             arquivos cujo nome contém "Alerta"   → alertas
  //             demais                                → boletim do veículo
  const boletimSheets: any[][] = [];
  const controleSheets: any[][] = [];
  const alertasSheets: any[][] = [];

  sheetsData.forEach((sheet, idx) => {
    const nome = (fileNames[idx] ?? '').toLowerCase();
    if (nome.includes('alerta')) {
      alertasSheets.push(sheet);
    } else if (nome.includes('controle') || nome.includes('consolidado_entregas')) {
      controleSheets.push(sheet);
    } else {
      boletimSheets.push(sheet);
    }
  });

  const boletim  = boletimSheets.flat();
  const controle = controleSheets.flat();
  const alertasRaw = alertasSheets;

  if (boletim.length === 0) {
    throw new Error('Nenhum Boletim do Veículo encontrado. Anexe ao menos um arquivo.');
  }

  // ── Etapa 1 ──────────────────────────────────────────────────────────────
  const { boletimAtualizado, mapaMotoristas } =
    controle.length > 0
      ? atualizarMotoristasBoletimVeiculo(boletim, controle)
      : { boletimAtualizado: boletim, mapaMotoristas: new Map() };

  // ── Etapa 2 ──────────────────────────────────────────────────────────────
  const boletimMotorista = converterVeiculoParaMotorista(boletimAtualizado);

  // ── Etapa 3 + 3.1 ────────────────────────────────────────────────────────
  let alertas: any[] = [];
  if (alertasRaw.length > 0) {
    alertas = consolidarAlertas(alertasRaw);
    alertas = corrigirMotoristasAlertas(alertas, mapaMotoristas);
  }

  // ── Etapa 4 ──────────────────────────────────────────────────────────────
  const { detalhe, consolidado } = analisarConducao(boletimMotorista, alertas);

  const totalMotoristas = consolidado.length;
  const totalBonificado = consolidado.reduce(
    (acc, m) => acc + m['Total Bonificação (R$)'], 0
  );

  return {
    // data principal = consolidado por motorista (aba 05)
    data: consolidado,
    summary: `vFleet ${args.month}/${args.year}: ${totalMotoristas} motoristas · R$ ${totalBonificado.toFixed(2)} em bonificações`,
    // sheets extras para o Excel de múltiplas abas
    extraSheets: [
      { name: '01_Boletim_Veiculo_Atual',  data: boletimAtualizado },
      { name: '02_Boletim_Motorista',       data: boletimMotorista },
      { name: '03_Alertas_Consolidado',     data: alertas },
      { name: '04_Detalhe_Diario',          data: detalhe },
      { name: '05_Consolidado_Motorista',   data: consolidado },
    ],
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeVFleetPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave('vfleet', formData, vFleetProcessor);
}