'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Devoluções — TypeScript
 * Espelha: consolidador_controle_logistico.py
 *
 * Arquivos esperados:
 *  1. Consolidado_Entregas_V2_Geral.xlsx  (obrigatório) — Controle Logístico
 *  2. Fat_Fechamento.xlsx                 (obrigatório) — Faturamento
 *  3. Motivos Sistema.xlsx                (opcional)    — Motivos não-culpa motorista
 *  4. Funcionario.xlsx                    (opcional)    — Cadastro para normalização
 *
 * Fluxo (espelha main()):
 *  1. Lê e filtra Controle Logístico por ano/mês
 *  2. Carrega cadastro de funcionários (mapas por empresa para norm. fuzzy)
 *  3. Normaliza nomes: exato incorreto → exato oficial → palavras → fuzzy (≥0.75)
 *  4. Explode viagens concatenadas "67712/67715" → dois registros
 *  5. Carrega Motivos Sistema (quais devoluções NÃO são culpa do motorista)
 *  6. Agrega faturamento por viagem excluindo motivos do sistema
 *  7. Merge colaborador × faturamento por VIAGEM_KEY (sem zeros à esquerda)
 *  8. Calcula percentuais de devolução
 *  9. Gera resumo por colaborador + detalhamento
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Tipos ──────────────────────────────────────────────────────────────────

interface ColaboradorViagem {
  colaborador: string;
  viagem: string;     // normalizada (sem zeros à esquerda)
  viagemOriginal: string;
}

interface FatAgregado {
  Faturamento: number;
  Faturamento_Dev: number;
  Quantidade_NFe: number;
  Quantidade_NFe_Dev: number;
}

interface DetalhamentoRow {
  colaborador: string;
  viagem: string;
  Faturamento: number;
  Faturamento_Dev: number;
  Quantidade_NFe: number;
  Quantidade_NFe_Dev: number;
  Percentual_Venda_Devolvida: number;
  Percentual_Qtd_Notas_Devolvidas: number;
}

interface ResumoColaborador {
  colaborador: string;
  Qtd_Viagens: number;
  Faturamento_Total: number;
  Faturamento_Devolvido: number;
  Total_NFes: number;
  Total_NFes_Devolvidas: number;
  Percentual_Venda_Devolvida: number;
  Percentual_Qtd_Notas_Devolvidas: number;
}

// ── Helpers gerais ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normaliza nome para comparação: maiúsculas, sem acentos, sem pontuação, sem números.
 * Espelha: normalizar_nome_chave()
 */
function normNome(nome: any): string {
  if (!nome || String(nome).trim() === '') return '';
  let s = String(nome).trim().toUpperCase();
  // Remove acentos
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Remove pontuação
  s = s.replace(/[^\w\s]/g, '');
  // Normaliza espaços
  s = s.replace(/\s+/g, ' ').trim();
  // Remove tokens que são apenas números
  s = s.split(' ').filter(t => !/^\d+$/.test(t)).join(' ');
  return s;
}

/**
 * Similaridade entre strings (SequenceMatcher simplificado — Jaro).
 * Espelha: similaridade() com SequenceMatcher.ratio()
 */
function similaridade(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const la = a.length, lb = b.length;
  const matchDist = Math.floor(Math.max(la, lb) / 2) - 1;
  if (matchDist < 0) return 0;

  const matchedA = new Array(la).fill(false);
  const matchedB = new Array(lb).fill(false);
  let matches = 0;

  for (let i = 0; i < la; i++) {
    const start = Math.max(0, i - matchDist);
    const end   = Math.min(i + matchDist + 1, lb);
    for (let j = start; j < end; j++) {
      if (!matchedB[j] && a[i] === b[j]) {
        matchedA[i] = true;
        matchedB[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (matchedA[i]) {
      while (!matchedB[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }
  }
  const jaro = (matches / la + matches / lb + (matches - transpositions / 2) / matches) / 3;
  return jaro;
}

/**
 * Verifica se todas as palavras de `procurado` estão em `cadastro`.
 * Espelha: match_palavras_completas()
 */
function matchPalavras(procurado: string, cadastro: string): boolean {
  const setProcurado  = new Set(procurado.split(' ').filter(Boolean));
  const setCadastro   = new Set(cadastro.split(' ').filter(Boolean));
  for (const p of setProcurado) {
    if (!setCadastro.has(p)) return false;
  }
  return true;
}

/**
 * Normaliza chave de viagem: remove não-numéricos e zeros à esquerda.
 * Espelha: norm_key()
 */
function normKey(val: any): string {
  if (!val) return '';
  const s = String(val).trim().replace(/\D/g, '').replace(/^0+/, '');
  return s || '0';
}

/**
 * Converte serial Excel ou string/Date para "DD/MM/YYYY".
 */
function toDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  if (val instanceof Date) {
    return `${String(val.getDate()).padStart(2,'0')}/${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s.split(' ')[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  return s;
}

/**
 * Extrai (ano, mes) de um valor de data (serial, Date, string).
 * Espelha: extrair_ano_mes_data()
 */
function extrairAnoMes(val: any): { ano: number; mes: number } | null {
  const s = toDateStr(val);
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length < 3) return null;
  const dia = parseInt(parts[0]), mes = parseInt(parts[1]), ano = parseInt(parts[2]);
  if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

/**
 * Explode viagens concatenadas: "67712/67715" → ["67712","67715"].
 * Espelha: explode_viagem()
 */
function explodeViagem(val: any): string[] {
  if (!val) return [];
  const txt = String(val).trim();
  if (!txt || txt.toLowerCase() === 'nan' || txt.toLowerCase() === 'none' || txt === '(vazio)') return [];
  const partes = txt.split(/[\/;,|\s]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of partes) {
    const n = p.replace(/\D/g, '');
    if (n && !seen.has(n)) { out.push(n); seen.add(n); }
  }
  return out;
}

/**
 * Encontra coluna por candidatos (busca normalizada).
 */
function findCol(candidates: string[], columns: string[]): string | null {
  const normMap = new Map(columns.map(c => [normNome(c), c]));
  for (const cand of candidates) {
    const nc = normNome(cand);
    if (normMap.has(nc)) return normMap.get(nc)!;
    for (const [key, orig] of normMap) {
      if (key.includes(nc) || nc.includes(key)) return orig;
    }
  }
  return null;
}

// ── Cadastro de funcionários ───────────────────────────────────────────────

interface MapaEmpresa {
  mapaIncorreto: Map<string, string>;  // nomeNorm → nomeOficial
  mapaOficial: Map<string, string>;
}

/**
 * Carrega Funcionario.xlsx e cria mapas por empresa.
 * Espelha: carregar_cadastro_funcionarios()
 */
function carregarCadastroFuncionarios(
  rows: Record<string, any>[]
): Map<string, MapaEmpresa> {
  const mapa = new Map<string, MapaEmpresa>();
  if (!rows || rows.length === 0) return mapa;

  const cols      = Object.keys(rows[0]);
  const colNome   = findCol(['Nome', 'Nome completo', 'Colaborador'], cols) || 'Nome';
  const colEmp    = findCol(['EMPRESA', 'Empresa', 'Filial'], cols)          || 'EMPRESA';
  const colInc    = findCol(['Nome_Incorreto', 'Nome Incorreto'], cols);

  for (const row of rows) {
    const empresa = String(row[colEmp] || '').trim();
    const nomeOfc = String(row[colNome] || '').trim();
    if (!empresa || !nomeOfc) continue;

    if (!mapa.has(empresa)) {
      mapa.set(empresa, { mapaIncorreto: new Map(), mapaOficial: new Map() });
    }
    const entry = mapa.get(empresa)!;

    const nomeOfcKey = normNome(nomeOfc);
    if (nomeOfcKey) entry.mapaOficial.set(nomeOfcKey, nomeOfc);

    if (colInc) {
      const nomeInc = String(row[colInc] || '').trim();
      if (nomeInc) {
        const nomeIncKey = normNome(nomeInc);
        if (nomeIncKey) entry.mapaIncorreto.set(nomeIncKey, nomeOfc);
      }
    }
  }
  return mapa;
}

/**
 * Encontra nome oficial seguindo hierarquia de 5 níveis.
 * Espelha: encontrar_nome_oficial()
 */
function encontrarNomeOficial(
  nomeOriginal: any,
  empresa: string,
  mapaPorEmpresa: Map<string, MapaEmpresa>,
  limiarFuzzy = 0.75
): string {
  if (!nomeOriginal || String(nomeOriginal).trim() === '' ||
      ['-', 'N/A', 'nan'].includes(String(nomeOriginal).trim())) {
    return String(nomeOriginal || '');
  }
  if (!empresa || !mapaPorEmpresa.has(empresa)) return String(nomeOriginal);

  const nomeChave = normNome(nomeOriginal);
  if (!nomeChave) return String(nomeOriginal);

  const { mapaIncorreto, mapaOficial } = mapaPorEmpresa.get(empresa)!;

  // 1. Match exato incorreto
  if (mapaIncorreto.has(nomeChave)) return mapaIncorreto.get(nomeChave)!;

  // 2. Match exato oficial
  if (mapaOficial.has(nomeChave)) return mapaOficial.get(nomeChave)!;

  // 3. Palavras completas — incorretos
  let melhorMatch = '';
  let melhorLen   = 0;
  for (const [chave, nomeOfc] of mapaIncorreto) {
    if (matchPalavras(nomeChave, chave)) {
      const len = chave.split(' ').length;
      if (len > melhorLen) { melhorLen = len; melhorMatch = nomeOfc; }
    }
  }
  if (melhorMatch) return melhorMatch;

  // 4. Palavras completas — oficiais
  melhorLen = 0; melhorMatch = '';
  for (const [chave, nomeOfc] of mapaOficial) {
    if (matchPalavras(nomeChave, chave)) {
      const len = chave.split(' ').length;
      if (len > melhorLen) { melhorLen = len; melhorMatch = nomeOfc; }
    }
  }
  if (melhorMatch) return melhorMatch;

  // 5. Fuzzy
  let melhorScore = 0;
  let melhorFuzzy = '';
  for (const [chave, nomeOfc] of mapaOficial) {
    const score = similaridade(nomeChave, chave);
    if (score > melhorScore) { melhorScore = score; melhorFuzzy = nomeOfc; }
  }
  if (melhorFuzzy && melhorScore >= limiarFuzzy) return melhorFuzzy;

  return String(nomeOriginal);
}

// ── Motivos Sistema ────────────────────────────────────────────────────────

/**
 * Carrega Motivos Sistema.xlsx e retorna set de motivos a desconsiderar.
 * Se não encontrar → '__TODOS__' (desconsiderar todas as devoluções).
 * Espelha: carregar_motivos_sistema()
 */
function carregarMotivosSistema(rows: Record<string, any>[]): Set<string> | '__TODOS__' {
  if (!rows || rows.length === 0) return '__TODOS__';

  const cols     = Object.keys(rows[0]);
  const colMotivo    = findCol(['MOTIVO_DEV', 'Motivo', 'MOTIVO'], cols);
  const colConsidera = findCol(['CONSIDERA', 'Considera'], cols);

  if (!colMotivo || !colConsidera) return '__TODOS__';

  const motivos = new Set<string>();
  for (const row of rows) {
    const considera = String(row[colConsidera] || '').trim().toUpperCase();
    if (considera === 'NÃO' || considera === 'NAO' || considera === 'N') {
      const motivo = String(row[colMotivo] || '').trim().toUpperCase();
      if (motivo && motivo !== 'NAN' && motivo !== 'NONE') motivos.add(motivo);
    }
  }

  // Se nenhum motivo específico → desconsiderar tudo
  return motivos.size > 0 ? motivos : '__TODOS__';
}

// ── Faturamento ────────────────────────────────────────────────────────────

/**
 * Agrega faturamento por viagem, excluindo devoluções de motivos do sistema.
 * Espelha: agregar_faturamento_por_viagem()
 */
function agregarFaturamentoPorViagem(
  rows: Record<string, any>[],
  motivosDesconsiderar: Set<string> | '__TODOS__'
): Map<string, FatAgregado> {
  const mapa = new Map<string, FatAgregado>();
  if (!rows || rows.length === 0) return mapa;

  const cols       = Object.keys(rows[0]);
  const colViagem  = findCol(['VIAGEM'], cols)                 || 'VIAGEM';
  const colFat     = findCol(['FATURAMENTO'], cols)            || 'FATURAMENTO';
  const colFatDev  = findCol(['FATURAMENTO_DEV', 'FAT_DEV'], cols) || 'FATURAMENTO_DEV';
  const colNota    = findCol(['NOTA', 'NFe', 'NF'], cols)      || 'NOTA';
  const colMotivo  = findCol(['MOTIVO_DEV', 'Motivo'], cols);

  for (const row of rows) {
    const viagemKey = normKey(row[colViagem]);
    if (!viagemKey) continue;

    const fat    = parseFloat(String(row[colFat]    || '0').replace(',', '.')) || 0;
    const fatDev = parseFloat(String(row[colFatDev] || '0').replace(',', '.')) || 0;
    const nota   = String(row[colNota] || '').trim();

    const isDevolucao = fatDev > 0;

    // Verifica se é motivo do sistema (não culpa do motorista)
    let isMotivoDeSistema = false;
    if (isDevolucao && colMotivo) {
      const motivo = String(row[colMotivo] || '').trim().toUpperCase();
      if (motivosDesconsiderar === '__TODOS__') {
        isMotivoDeSistema = true;
      } else {
        isMotivoDeSistema = motivosDesconsiderar.has(motivo);
      }
    } else if (isDevolucao && motivosDesconsiderar === '__TODOS__') {
      isMotivoDeSistema = true;
    }

    // Culpa do motorista = tem devolução E NÃO é motivo de sistema
    const isCulpaMotorista = isDevolucao && !isMotivoDeSistema;

    if (!mapa.has(viagemKey)) {
      mapa.set(viagemKey, { Faturamento: 0, Faturamento_Dev: 0, Quantidade_NFe: 0, Quantidade_NFe_Dev: 0 });
    }
    const agg = mapa.get(viagemKey)!;
    agg.Faturamento += fat;

    if (nota) {
      // Conta NFes únicas por viagem
      agg.Quantidade_NFe++;
      if (isCulpaMotorista) {
        agg.Faturamento_Dev += fatDev;
        agg.Quantidade_NFe_Dev++;
      }
    } else {
      if (isCulpaMotorista) agg.Faturamento_Dev += fatDev;
    }
  }

  return mapa;
}

// ── Pipeline principal ────────────────────────────────────────────────────────

/**
 * Classifica arquivo pelo nome.
 */
function tipoArquivoDevol(nome: string): 'controle' | 'faturamento' | 'motivos' | 'funcionarios' {
  const n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('consolidado_entregas') || n.includes('controle') || n.includes('rota')) return 'controle';
  if (n.includes('fat_fechamento') || n.includes('faturamento') || n.includes('fat')) return 'faturamento';
  if (n.includes('motivos') || n.includes('sistema')) return 'motivos';
  if (n.includes('funcionario') || n.includes('cadastro')) return 'funcionarios';
  return 'controle'; // fallback
}

export async function executeDevolucoesPipeline(formData: FormData) {
  try {
    const targetYear  = parseInt(formData.get('year')  as string);
    const targetMonth = parseInt(formData.get('month') as string);
    const files       = formData.getAll('files') as File[];

    if (!targetYear || !targetMonth || files.length === 0) {
      throw new Error('Parâmetros ou arquivos ausentes.');
    }

    // Classifica arquivos
    let controleFile:    File | null = null;
    let faturamentoFile: File | null = null;
    let motivosFile:     File | null = null;
    let funcionariosFile: File | null = null;

    for (const f of files) {
      const tipo = tipoArquivoDevol(f.name);
      if (tipo === 'controle'     && !controleFile)     controleFile     = f;
      else if (tipo === 'faturamento' && !faturamentoFile) faturamentoFile = f;
      else if (tipo === 'motivos'     && !motivosFile)     motivosFile     = f;
      else if (tipo === 'funcionarios' && !funcionariosFile) funcionariosFile = f;
    }

    if (!controleFile)    throw new Error('Arquivo Controle Logístico (Consolidado_Entregas) não encontrado.');
    if (!faturamentoFile) throw new Error('Arquivo Fat_Fechamento não encontrado.');

    // ── 1. Carrega Controle Logístico ─────────────────────────────────────
    const bufferControle = Buffer.from(await controleFile.arrayBuffer());
    const wbControle     = XLSX.read(bufferControle, { type: 'buffer', cellDates: false });

    // Busca aba "Consolidado" ou primeira disponível
    const abaControle = wbControle.SheetNames.find(s =>
      s.toLowerCase().includes('consolidado') || s.toLowerCase().includes('controle')
    ) || wbControle.SheetNames[0];

    const rowsControle = XLSX.utils.sheet_to_json(
      wbControle.Sheets[abaControle]
    ) as Record<string, any>[];

    if (rowsControle.length === 0) throw new Error('Controle Logístico vazio.');

    const colsC   = Object.keys(rowsControle[0]);
    const colData = findCol(['DATA DE ENTREGA', 'DATA_ENTREGA', 'Data'], colsC) || 'DATA DE ENTREGA';
    const colReg  = findCol(['REGIÃO', 'REGIAO', 'EMPRESA', 'FILIAL'], colsC)   || 'REGIÃO';
    const colVia  = findCol(['VIAGEM'], colsC)                                   || 'VIAGEM';
    const colMot  = findCol(['MOTORISTA'], colsC)                                || 'MOTORISTA';
    const colAju  = findCol(['AJUDANTE'], colsC)                                 || 'AJUDANTE';
    const colAju1 = findCol(['AJUDANTE_1', 'AJUDANTE.1', 'AJUDANTE2', 'AJUDANTE 2'], colsC);

    // Filtra por ano/mês
    const registros = rowsControle.filter(row => {
      const am = extrairAnoMes(row[colData]);
      return am?.ano === targetYear && am?.mes === targetMonth;
    });

    if (registros.length === 0) {
      throw new Error(`Nenhum registro encontrado para ${String(targetMonth).padStart(2,'0')}/${targetYear} no Controle Logístico.`);
    }

    // ── 2. Carrega cadastro de funcionários (opcional) ────────────────────
    let mapaPorEmpresa = new Map<string, MapaEmpresa>();
    if (funcionariosFile) {
      const bufF = Buffer.from(await funcionariosFile.arrayBuffer());
      const wbF  = XLSX.read(bufF, { type: 'buffer' });
      const abaF = wbF.SheetNames.find(s => s.toLowerCase().includes('func')) || wbF.SheetNames[0];
      const rowsF = XLSX.utils.sheet_to_json(wbF.Sheets[abaF]) as Record<string, any>[];
      mapaPorEmpresa = carregarCadastroFuncionarios(rowsF);
    }

    // ── 3. Normaliza nomes ────────────────────────────────────────────────
    // Espelha: loop sobre COLS_NOMES com encontrar_nome_oficial()
    const colsNomes = [colMot, colAju, ...(colAju1 ? [colAju1] : [])].filter(Boolean) as string[];
    const registrosNorm = registros.map(row => {
      const empresa = String(row[colReg] || '').trim();
      const novo = { ...row };
      for (const col of colsNomes) {
        if (row[col] != null) {
          novo[col] = encontrarNomeOficial(row[col], empresa, mapaPorEmpresa);
        }
      }
      return novo;
    });

    // ── 4. Explode viagens → colaborador × viagem ─────────────────────────
    // Espelha: loop que gera records com {colaborador, viagem}
    const colaboradorViagens: ColaboradorViagem[] = [];

    for (const row of registrosNorm) {
      const viagens = explodeViagem(row[colVia]);
      if (viagens.length === 0) continue;

      for (const col of colsNomes) {
        const nome = String(row[col] || '').trim();
        if (!nome || ['-', 'N/A', 'nan', 'none'].includes(nome.toLowerCase())) continue;

        for (const v of viagens) {
          colaboradorViagens.push({
            colaborador: nome,
            viagem: normKey(v),
            viagemOriginal: v,
          });
        }
      }
    }

    if (colaboradorViagens.length === 0) {
      throw new Error('Nenhum colaborador/viagem extraído do Controle Logístico.');
    }

    // Remove duplicatas (mesmo colaborador + mesma viagem)
    const seen = new Set<string>();
    const colaboradorViagensDeduplicated = colaboradorViagens.filter(cv => {
      const key = `${cv.colaborador}|${cv.viagem}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── 5. Carrega Motivos Sistema ────────────────────────────────────────
    let motivosDesconsiderar: Set<string> | '__TODOS__' = '__TODOS__';
    if (motivosFile) {
      const bufM = Buffer.from(await motivosFile.arrayBuffer());
      const wbM  = XLSX.read(bufM, { type: 'buffer' });
      const rowsM = XLSX.utils.sheet_to_json(wbM.Sheets[wbM.SheetNames[0]]) as Record<string, any>[];
      motivosDesconsiderar = carregarMotivosSistema(rowsM);
    }

    // ── 6. Agrega faturamento ─────────────────────────────────────────────
    const bufFat = Buffer.from(await faturamentoFile.arrayBuffer());
    const wbFat  = XLSX.read(bufFat, { type: 'buffer' });
    const abaFat = wbFat.SheetNames.find(s =>
      s.toLowerCase().includes('export') || s.toLowerCase().includes('fat')
    ) || wbFat.SheetNames[0];

    const rowsFat = XLSX.utils.sheet_to_json(wbFat.Sheets[abaFat]) as Record<string, any>[];
    const fatMap  = agregarFaturamentoPorViagem(rowsFat, motivosDesconsiderar);

    // ── 7. Merge colaborador × faturamento ───────────────────────────────
    const detalhamento: DetalhamentoRow[] = colaboradorViagensDeduplicated.map(cv => {
      const fat = fatMap.get(cv.viagem) ?? { Faturamento: 0, Faturamento_Dev: 0, Quantidade_NFe: 0, Quantidade_NFe_Dev: 0 };
      return {
        colaborador: cv.colaborador,
        viagem: cv.viagemOriginal,
        Faturamento:      round2(fat.Faturamento),
        Faturamento_Dev:  round2(fat.Faturamento_Dev),
        Quantidade_NFe:   fat.Quantidade_NFe,
        Quantidade_NFe_Dev: fat.Quantidade_NFe_Dev,
        Percentual_Venda_Devolvida:      fat.Faturamento > 0 ? round2(fat.Faturamento_Dev / fat.Faturamento * 100) : 0,
        Percentual_Qtd_Notas_Devolvidas: fat.Quantidade_NFe > 0 ? round2(fat.Quantidade_NFe_Dev / fat.Quantidade_NFe * 100) : 0,
      };
    });

    // ── 8. Resumo por colaborador ─────────────────────────────────────────
    const resumoMap = new Map<string, ResumoColaborador>();
    for (const d of detalhamento) {
      let r = resumoMap.get(d.colaborador);
      if (!r) {
        r = { colaborador: d.colaborador, Qtd_Viagens: 0, Faturamento_Total: 0, Faturamento_Devolvido: 0, Total_NFes: 0, Total_NFes_Devolvidas: 0, Percentual_Venda_Devolvida: 0, Percentual_Qtd_Notas_Devolvidas: 0 };
        resumoMap.set(d.colaborador, r);
      }
      r.Qtd_Viagens++;
      r.Faturamento_Total      += d.Faturamento;
      r.Faturamento_Devolvido  += d.Faturamento_Dev;
      r.Total_NFes             += d.Quantidade_NFe;
      r.Total_NFes_Devolvidas  += d.Quantidade_NFe_Dev;
    }

    const resumo: ResumoColaborador[] = Array.from(resumoMap.values()).map(r => ({
      ...r,
      Faturamento_Total:     round2(r.Faturamento_Total),
      Faturamento_Devolvido: round2(r.Faturamento_Devolvido),
      Percentual_Venda_Devolvida:      r.Faturamento_Total > 0 ? round2(r.Faturamento_Devolvido / r.Faturamento_Total * 100) : 0,
      Percentual_Qtd_Notas_Devolvidas: r.Total_NFes > 0 ? round2(r.Total_NFes_Devolvidas / r.Total_NFes * 100) : 0,
    })).sort((a, b) => b.Qtd_Viagens - a.Qtd_Viagens);

    // ── Resumo estatístico ────────────────────────────────────────────────
    const totalFat    = round2(resumo.reduce((s, r) => s + r.Faturamento_Total, 0));
    const totalDev    = round2(resumo.reduce((s, r) => s + r.Faturamento_Devolvido, 0));
    const percGlobal  = totalFat > 0 ? round2(totalDev / totalFat * 100) : 0;

    const saved = await firebaseStore.saveResult('devolucoes', {
      pipelineType : 'devolucoes',
      timestamp    : Date.now(),
      year         : targetYear,
      month        : targetMonth,
      data         : resumo,
      detalhamento,
      summary: [
        `${resumo.length} colaboradores`,
        `${colaboradorViagensDeduplicated.length} viagens`,
        `Devolução: ${percGlobal}% (R$ ${totalDev.toFixed(2)} / R$ ${totalFat.toFixed(2)})`,
      ].join(' — '),
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };

  } catch (error: any) {
    console.error('Erro no Devoluções Pipeline:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}