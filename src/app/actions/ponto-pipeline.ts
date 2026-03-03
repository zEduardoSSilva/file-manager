'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Ponto — TypeScript (espelha o Python ponto_pipeline.py)
 *
 * Lógica implementada:
 *  1. Lê múltiplos CSVs "Ponto_Original_*-*.csv" (formato multi-linha)
 *  2. Deduplica priorizando o registro mais completo (maior score de marcações)
 *  3. Filtra pelo mês/ano configurado
 *  4. Analisa conformidade de MOTORISTAS e AJUDANTES:
 *     - Marcações (4/4) → R$ valor_marcacoes  [GARANTIDO]
 *     - 5 critérios OK  → R$ valor_criterios  [TUDO OU NADA]
 *       1. Jornada       ≤ carga padrão + 2h
 *       2. Hora Extra    ≤ 2h
 *       3. Almoço        ≥ 1h
 *       4. Intrajornada  nenhum período > 6h consecutivas
 *       5. Interjornada  ≥ 11h descanso entre jornadas
 *  5. DSR: marca violação com 7+ dias consecutivos
 *  6. Absenteísmo (Motoristas + Ajudantes unificados):
 *     - Presença física | justificada | abono manual
 *     - Exclui domingos (se !includeSundays) e feriados (excludedDates)
 *     - Incentivo: 100% → R$50 | ≥90% → R$40 | ≥75% → R$25
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações (espelham o Python) ─────────────────────────────────────────

const MOT_BONIFICACAO_DIARIA_TOTAL = 16.00;
const MOT_PERCENTUAL_PONTO         = 0.20;
const MOT_VALOR_PONTO              = round2(MOT_BONIFICACAO_DIARIA_TOTAL * MOT_PERCENTUAL_PONTO); // 3.20
const MOT_VALOR_MARCACOES          = round2(MOT_VALOR_PONTO / 2); // 1.60
const MOT_VALOR_CRITERIOS          = round2(MOT_VALOR_PONTO / 2); // 1.60

const AJU_BONIFICACAO_DIARIA_TOTAL = 12.00;
const AJU_PERCENTUAL_PONTO         = 0.40;
const AJU_VALOR_PONTO              = round2(AJU_BONIFICACAO_DIARIA_TOTAL * AJU_PERCENTUAL_PONTO); // 4.80
const AJU_VALOR_MARCACOES          = round2(AJU_VALOR_PONTO / 2); // 2.40
const AJU_VALOR_CRITERIOS          = round2(AJU_VALOR_PONTO / 2); // 2.40

const CARGA_HORARIA_PADRAO_MIN = 440;  // 07:20
const INTERJORNADA_MIN_MIN     = 11 * 60; // 660 minutos (11h)
const LIMITE_JORNADA_MIN       = 560;  // 09:20 (440 + 120)
const LIMITE_HE_MIN            = 120;  // 2h
const ALMOCO_MINIMO_MIN        = 60;   // 1h
const INTRAJORNADA_MAX_MIN     = 360;  // 6h

// Absenteísmo
const ABS_VALOR_100 = 50.0;
const ABS_VALOR_90  = 40.0;
const ABS_VALOR_75  = 25.0;

const SITUACOES_PRESENCA = [
  'atestado', 'auxilio doenca', 'auxílio doença',
  'ferias', 'férias', 'licenca maternidade', 'licença maternidade',
  'licenca paternidade', 'licença paternidade',
  'falta abonada', 'abonada',
];

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface RegistroPonto {
  id: string;
  nome: string;
  data: string;           // "DD/MM/YYYY"
  diaSemana: string;
  entrada: string;
  saidaAlmoco: string;
  retornoAlmoco: string;
  saida: string;
  tempoTotalEmpresa: string;
  entradaPrevista: string;
  saidaAlmocoPrevista: string;
  retornoAlmocoPrevisto: string;
  saidaPrevista: string;
  escala: string;
  turma: string;
  codSituacao: string;
  descSituacao: string;
  tempo: string;
  score: number;          // usado para deduplicação
}

interface DiaConformidade {
  id: string;
  colaborador: string;
  cargo: 'Motorista' | 'Ajudante';
  dia: string;
  diaSemana: string;
  entrada: string;
  saidaAlmoco: string;
  retornoAlmoco: string;
  saida: string;
  temAjusteManual: boolean;
  numAjustes: number;
  tempoTrabalhado: string;
  tempoAlmoco: string;
  marcacoesCompletas: number;
  marcacoesFaltantes: number;
  cumpriuMarcacoes: boolean;
  bonusMarcacoes: number;
  limiteJornada: string;
  excessoJornada: string;
  cumpriuJornada: boolean;
  heRealizada: string;
  excessoHE: string;
  cumpriuHE: boolean;
  almocoRealizado: string;
  deficitAlmoco: string;
  cumpriuAlmoco: boolean;
  periodoManha: string;
  periodoTarde: string;
  excessoManha: string;
  excessoTarde: string;
  cumpriuIntrajornada: boolean;
  interjornadaDescanso: string;
  deficitInterjornada: string;
  cumpriuInterjornada: boolean;
  todos5CriteriosOK: boolean;
  bonusCriterios: number;
  bonificacaoTotalDia: number;
  diasConsecutivos: number;
  violouDSR: boolean;
}

interface ConsolidadoItem {
  ID: string;
  Colaborador: string;
  Cargo: string;
  'Dias Trabalhados': number;
  '💰 Total Bonus Marcações': number;
  '💰 Total Bonus Critérios': number;
  '💵 BONIFICAÇÃO TOTAL': number;
  'Dias Todos Critérios OK': number;
  'Dias 4 Marcações Completas': number;
  'Dias Violou DSR': number;
  'Total Ajustes Manuais': number;
}

interface AbsenteismoItem {
  ID: string;
  Nome: string;
  Grupo: string;
  Total_Dias: number;
  'Presenças Físicas': number;
  'Atestados/Férias': number;
  'Total Presenças': number;
  Faltas: number;
  'Percentual (%)': number;
  Valor_Incentivo: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Converte "HH:MM" (com ou sem asterisco) para minutos. Retorna null se inválido.
 * Espelha: horario_para_minutos()
 */
function toMin(horario: string | null | undefined): number | null {
  if (!horario || horario.trim() === '') return null;
  const clean = horario.replace('*', '').trim();
  const parts = clean.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Converte minutos para "HH:MM". Retorna '' se null.
 * Espelha: minutos_para_horario()
 */
function fromMin(min: number | null): string {
  if (min === null || min === undefined) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calcula tempo trabalhado e tempo de almoço em minutos.
 * Espelha: calcular_tempo_trabalhado()
 */
function calcTempoTrabalhado(
  entrada: string, saidaAlmoco: string, retornoAlmoco: string, saida: string
): { trabalhado: number | null; almoco: number | null } {
  const e  = toMin(entrada);
  const sa = toMin(saidaAlmoco);
  const ra = toMin(retornoAlmoco);
  const s  = toMin(saida);

  if (e === null || s === null) return { trabalhado: null, almoco: null };

  let total = s - e;
  if (total < 0) total += 24 * 60;

  let almoco = 0;
  if (sa !== null && ra !== null) {
    almoco = ra - sa;
    if (almoco < 0) almoco += 24 * 60;
  }

  return { trabalhado: total - almoco, almoco };
}

/**
 * Regra de incentivo de absenteísmo por faixa de presença.
 * Espelha: _aplicar_regra_incentivo()
 */
function incentivoPorFaixa(percentual: number): number {
  if (percentual >= 100) return ABS_VALOR_100;
  if (percentual >= 90)  return ABS_VALOR_90;
  if (percentual >= 75)  return ABS_VALOR_75;
  return 0;
}

// ── ETAPA 1 — Parsing de CSV multi-linha ─────────────────────────────────────

/**
 * Processa um CSV de ponto no formato multi-linha do sistema.
 * Espelha: processar_relatorio_csv() + carregar_e_processar_csvs()
 *
 * Formato esperado (colunas separadas por ';'):
 *  • Linha de colaborador : col[0]=ID numérico, col[1]=Nome
 *  • Linha de escala      : col[0]='', col[1..n]=escala/turma/horário previsto
 *  • Linha de marcações   : col[0]=DD/MM/YYYY, col[1]=dia semana, col[2]=marcações
 */
function parsearCSV(conteudo: string, mesAlvo: number, anoAlvo: number): RegistroPonto[] {
  const linhas = conteudo.split(/\r?\n/);
  const registros: RegistroPonto[] = [];

  let idAtual = '';
  let nomeAtual = '';
  let escalAtual = '';
  let turmaAtual = '';
  let horarioPrevAtual = '';

  for (const linha of linhas) {
    const cols = linha.split(';').map(c => c.trim());
    const col0 = cols[0] || '';
    const col1 = cols[1] || '';
    const col2 = cols[2] || '';

    // Ignora cabeçalhos/rodapés
    const col0Upper = col0.toUpperCase();
    if (
      col0Upper.includes('PONTO_ORIGINAL') ||
      col0Upper.includes('APURAÇÃO') ||
      col0Upper.includes('TRANSMENDES') ||
      col0Upper.includes('PAG:') ||
      col0Upper.includes('PERÍODO') ||
      col1.includes('Total Colaborador') ||
      col1.includes('Total Geral') ||
      (col0 === '' && col1 === '')
    ) continue;

    // Linha de identificação do colaborador: col0 é número sem '/'
    if (/^\d{2,}$/.test(col0) && col1 !== '' && !col0.includes('/')) {
      idAtual             = col0;
      nomeAtual           = col1;
      escalAtual          = '';
      turmaAtual          = '';
      horarioPrevAtual    = '';
      continue;
    }

    // Linha de escala/turma/horário previsto: col0 vazio, idAtual definido
    if (idAtual && col0 === '' && cols.length > 6) {
      for (const val of cols) {
        const v = val.trim();
        if (/^\d{4}$/.test(v) && !escalAtual) escalAtual = v;
        if (/^\d$/.test(v) && !turmaAtual) turmaAtual = v;
        if (v.includes(':') && !horarioPrevAtual) horarioPrevAtual = v;
      }
      continue;
    }

    // Linha de data + marcações: col0 contém '/' (DD/MM ou DD/MM/YYYY)
    if (col0.includes('/') && col0.length >= 5 && col0.length <= 10) {
      // Normaliza data para DD/MM/YYYY
      let data = col0;
      if ((col0.match(/\//g) || []).length === 1) {
        data = `${col0}/${anoAlvo}`;
      }

      // Extrai mês/ano da data para filtro
      const partes = data.split('/');
      const mesDt  = parseInt(partes[1]);
      const anoDt  = parseInt(partes[2]);
      if (mesDt !== mesAlvo || anoDt !== anoAlvo) continue;

      // Extrai marcações (tokens com ':')
      const marcacoes = (col2 || '').split(/\s+/).filter(t => t.includes(':'));
      const entrada        = marcacoes[0] || '';
      const saidaAlmoco    = marcacoes[1] || '';
      const retornoAlmoco  = marcacoes[2] || '';
      const saida          = marcacoes[3] || '';

      // Tempo total empresa (entre primeira e última marcação)
      let tempoTotalEmpresa = '';
      if (marcacoes.length >= 2) {
        const ini = toMin(marcacoes[0]);
        const fim = toMin(marcacoes[marcacoes.length - 1]);
        if (ini !== null && fim !== null) {
          let diff = fim - ini;
          if (diff < 0) diff += 24 * 60;
          tempoTotalEmpresa = fromMin(diff);
        }
      }

      // Situação (após as colunas de marcação)
      let codSit = '', descSit = '', tempoSit = '';
      for (let i = 3; i < cols.length; i++) {
        const v = cols[i].trim();
        if (/^\d{3}$/.test(v) && !codSit) { codSit = v; continue; }
        if (v && !/^\d/.test(v) && !descSit && !v.includes(':')) { descSit = v; continue; }
        if (v.includes(':') && !tempoSit) { tempoSit = v; }
      }

      // Extrai horário previsto das marcações acumuladas
      const prevMarcacoes = (horarioPrevAtual || '').split(/\s+/).filter(t => t.includes(':'));
      const entradaPrev        = prevMarcacoes[0] || '';
      const saidaAlmocoPrev    = prevMarcacoes[1] || '';
      const retornoAlmocoPrev  = prevMarcacoes[2] || '';
      const saidaPrev          = prevMarcacoes[3] || '';

      // Score = número de marcações preenchidas (para deduplicação)
      const score = [entrada, saidaAlmoco, retornoAlmoco, saida].filter(m => m !== '').length;

      registros.push({
        id: idAtual, nome: nomeAtual, data, diaSemana: col1,
        entrada, saidaAlmoco, retornoAlmoco, saida, tempoTotalEmpresa,
        entradaPrevista: entradaPrev, saidaAlmocoPrevista: saidaAlmocoPrev,
        retornoAlmocoPrevisto: retornoAlmocoPrev, saidaPrevista: saidaPrev,
        escala: escalAtual, turma: turmaAtual,
        codSituacao: codSit, descSituacao: descSit, tempo: tempoSit,
        score,
      });
    }
  }

  return registros;
}

/**
 * Carrega múltiplos CSVs, concatena, deduplica e filtra por mês.
 * Espelha: carregar_e_processar_csvs()
 */
async function carregarCSVs(
  files: File[], mesAlvo: number, anoAlvo: number
): Promise<RegistroPonto[]> {
  const todos: RegistroPonto[] = [];

  for (const file of files) {
    const texto = await file.text();
    const parsed = parsearCSV(texto, mesAlvo, anoAlvo);
    todos.push(...parsed);
  }

  // Deduplicação: por ID + Data, mantém o de maior score (mais marcações)
  // Espelha: sort por _score desc, drop_duplicates keep='first'
  const mapaDedup = new Map<string, RegistroPonto>();
  for (const reg of todos) {
    const chave = `${reg.id}|${reg.data}`;
    const existente = mapaDedup.get(chave);
    if (!existente || reg.score > existente.score) {
      mapaDedup.set(chave, reg);
    }
  }

  return Array.from(mapaDedup.values()).sort((a, b) => {
    if (a.id !== b.id) return a.id.localeCompare(b.id);
    return a.data.localeCompare(b.data);
  });
}

// ── ETAPA 2/3 — Análise de conformidade ──────────────────────────────────────

/**
 * Analisa conformidade completa de um grupo de registros.
 * Espelha: analisar_conformidade() + calcular_dsr()
 */
function analisarConformidade(
  registros: RegistroPonto[],
  cargo: 'Motorista' | 'Ajudante',
  valorMarcacoes: number,
  valorCriterios: number
): DiaConformidade[] {
  if (registros.length === 0) return [];

  // Agrupa por colaborador para calcular interjornada e DSR
  const porColab = new Map<string, RegistroPonto[]>();
  for (const reg of registros) {
    const lista = porColab.get(reg.id) || [];
    lista.push(reg);
    porColab.set(reg.id, lista);
  }

  const resultado: DiaConformidade[] = [];

  for (const [, dias] of porColab) {
    // Ordena por data para calcular interjornada e DSR corretamente
    dias.sort((a, b) => {
      const [da, ma, ya] = a.data.split('/').map(Number);
      const [db, mb, yb] = b.data.split('/').map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    });

    let ultimaSaidaMin: number | null = null;
    let ultimaDataOrdinal = 0;
    let diasConsecutivos = 0;
    let ultimaDataConsec: Date | null = null;

    for (const reg of dias) {
      const [d, m, y] = reg.data.split('/').map(Number);
      const dataAtual = new Date(y, m - 1, d);

      // ── Marcações ────────────────────────────────────────────────────────
      const marc = [reg.entrada, reg.saidaAlmoco, reg.retornoAlmoco, reg.saida];
      const numAjustes     = marc.filter(x => x.includes('*')).length;
      const marcOK         = marc.filter(x => x !== '').length;
      const cumpriuMarcacoes = marcOK === 4;
      const bonusMarcacoes   = cumpriuMarcacoes ? valorMarcacoes : 0;

      // ── Tempos ───────────────────────────────────────────────────────────
      const { trabalhado, almoco } = calcTempoTrabalhado(
        reg.entrada, reg.saidaAlmoco, reg.retornoAlmoco, reg.saida
      );

      // ── Critério 1: Jornada ─── ≤ carga + 2h ─────────────────────────
      const excessoJornada = trabalhado !== null ? Math.max(0, trabalhado - LIMITE_JORNADA_MIN) : null;
      const cumpriuJornada = trabalhado !== null ? trabalhado <= LIMITE_JORNADA_MIN : false;

      // ── Critério 2: HE ─── ≤ 2h ──────────────────────────────────────
      const he        = trabalhado !== null ? Math.max(0, trabalhado - CARGA_HORARIA_PADRAO_MIN) : 0;
      const excessoHE = Math.max(0, he - LIMITE_HE_MIN);
      const cumpriuHE = he <= LIMITE_HE_MIN;

      // ── Critério 3: Almoço ─── ≥ 1h ──────────────────────────────────
      const cumpriuAlmoco = almoco !== null ? almoco >= ALMOCO_MINIMO_MIN : false;
      const deficitAlmoco = almoco !== null ? Math.max(0, ALMOCO_MINIMO_MIN - almoco) : ALMOCO_MINIMO_MIN;

      // ── Critério 4: Intrajornada ─── nenhum período > 6h ────────────
      // Espelha: analisar_intrajornada()
      const e  = toMin(reg.entrada);
      const sa = toMin(reg.saidaAlmoco);
      const ra = toMin(reg.retornoAlmoco);
      const s  = toMin(reg.saida);

      let periodoManha = 0, periodoTarde = 0, excessoManha = 0, excessoTarde = 0;
      if (e !== null && sa !== null) {
        periodoManha = sa - e;
        if (periodoManha < 0) periodoManha += 24 * 60;
        excessoManha = Math.max(0, periodoManha - INTRAJORNADA_MAX_MIN);
      }
      if (ra !== null && s !== null) {
        periodoTarde = s - ra;
        if (periodoTarde < 0) periodoTarde += 24 * 60;
        excessoTarde = Math.max(0, periodoTarde - INTRAJORNADA_MAX_MIN);
      }
      const cumpriuIntrajornada = excessoManha === 0 && excessoTarde === 0;

      // ── Critério 5: Interjornada ─── ≥ 11h descanso ─────────────────
      // Espelha: cálculo via ordinal de data + minutos de saída/entrada
      const entradaMin = toMin(reg.entrada);
      const saidaMin   = toMin(reg.saida);
      const dataOrdinal = Math.floor(dataAtual.getTime() / 86400000);

      let descansoMin: number | null = null;
      let deficitInter = 0;
      let cumpriuInterjornada = true;

      if (ultimaSaidaMin !== null && entradaMin !== null && ultimaDataOrdinal > 0) {
        const totalPrev  = ultimaDataOrdinal  * 1440 + ultimaSaidaMin;
        const totalAtual = dataOrdinal        * 1440 + entradaMin;
        if (totalAtual >= totalPrev) {
          descansoMin        = totalAtual - totalPrev;
          cumpriuInterjornada = descansoMin >= INTERJORNADA_MIN_MIN;
          deficitInter        = cumpriuInterjornada ? 0 : Math.max(0, INTERJORNADA_MIN_MIN - descansoMin);
        }
      }

      // Atualiza estado para próxima iteração
      ultimaSaidaMin   = saidaMin;
      ultimaDataOrdinal = dataOrdinal;

      // ── DSR: 7+ dias consecutivos ────────────────────────────────────
      // Espelha: calcular_dsr()
      if (ultimaDataConsec === null) {
        diasConsecutivos = 1;
      } else {
        const diffDias = Math.round(
          (dataAtual.getTime() - ultimaDataConsec.getTime()) / 86400000
        );
        diasConsecutivos = diffDias === 1 ? diasConsecutivos + 1 : 1;
      }
      ultimaDataConsec = dataAtual;
      const violouDSR = diasConsecutivos >= 7;

      // ── Critérios e bonificação ──────────────────────────────────────
      const todos5OK = (
        cumpriuJornada && cumpriuHE && cumpriuAlmoco &&
        cumpriuIntrajornada && cumpriuInterjornada
      );
      const bonusCriterios       = todos5OK ? valorCriterios : 0;
      const bonificacaoTotalDia  = round2(bonusMarcacoes + bonusCriterios);

      resultado.push({
        id: reg.id,
        colaborador: reg.nome,
        cargo,
        dia: reg.data,
        diaSemana: reg.diaSemana,
        entrada: reg.entrada,
        saidaAlmoco: reg.saidaAlmoco,
        retornoAlmoco: reg.retornoAlmoco,
        saida: reg.saida,
        temAjusteManual: numAjustes > 0,
        numAjustes,
        tempoTrabalhado: fromMin(trabalhado),
        tempoAlmoco: fromMin(almoco),
        marcacoesCompletas: marcOK,
        marcacoesFaltantes: 4 - marcOK,
        cumpriuMarcacoes,
        bonusMarcacoes,
        limiteJornada: fromMin(LIMITE_JORNADA_MIN),
        excessoJornada: fromMin(excessoJornada),
        cumpriuJornada,
        heRealizada: fromMin(he),
        excessoHE: fromMin(excessoHE),
        cumpriuHE,
        almocoRealizado: fromMin(almoco),
        deficitAlmoco: fromMin(deficitAlmoco),
        cumpriuAlmoco,
        periodoManha: fromMin(periodoManha),
        periodoTarde: fromMin(periodoTarde),
        excessoManha: fromMin(excessoManha),
        excessoTarde: fromMin(excessoTarde),
        cumpriuIntrajornada,
        interjornadaDescanso: fromMin(descansoMin),
        deficitInterjornada: fromMin(deficitInter),
        cumpriuInterjornada,
        todos5CriteriosOK: todos5OK,
        bonusCriterios,
        bonificacaoTotalDia,
        diasConsecutivos,
        violouDSR,
      });
    }
  }

  return resultado;
}

/**
 * Gera consolidado por colaborador.
 * Espelha: gerar_consolidado()
 */
function gerarConsolidado(dias: DiaConformidade[]): ConsolidadoItem[] {
  const mapa = new Map<string, ConsolidadoItem>();

  for (const dia of dias) {
    const chave = `${dia.id}|${dia.cargo}`;
    let m = mapa.get(chave);
    if (!m) {
      m = {
        ID: dia.id,
        Colaborador: dia.colaborador,
        Cargo: dia.cargo,
        'Dias Trabalhados': 0,
        '💰 Total Bonus Marcações': 0,
        '💰 Total Bonus Critérios': 0,
        '💵 BONIFICAÇÃO TOTAL': 0,
        'Dias Todos Critérios OK': 0,
        'Dias 4 Marcações Completas': 0,
        'Dias Violou DSR': 0,
        'Total Ajustes Manuais': 0,
      };
      mapa.set(chave, m);
    }

    m['Dias Trabalhados']++;
    m['💰 Total Bonus Marcações']    += dia.bonusMarcacoes;
    m['💰 Total Bonus Critérios']     += dia.bonusCriterios;
    m['💵 BONIFICAÇÃO TOTAL']         += dia.bonificacaoTotalDia;
    if (dia.todos5CriteriosOK)         m['Dias Todos Critérios OK']++;
    if (dia.marcacoesCompletas === 4)   m['Dias 4 Marcações Completas']++;
    if (dia.violouDSR)                  m['Dias Violou DSR']++;
    m['Total Ajustes Manuais'] += dia.numAjustes;
  }

  return Array.from(mapa.values()).map(m => ({
    ...m,
    '💰 Total Bonus Marcações': round2(m['💰 Total Bonus Marcações']),
    '💰 Total Bonus Critérios': round2(m['💰 Total Bonus Critérios']),
    '💵 BONIFICAÇÃO TOTAL':     round2(m['💵 BONIFICAÇÃO TOTAL']),
  })).sort((a, b) => b['💵 BONIFICAÇÃO TOTAL'] - a['💵 BONIFICAÇÃO TOTAL']);
}

// ── ETAPA 4 — Absenteísmo ─────────────────────────────────────────────────────

/**
 * Analisa absenteísmo unificado (motoristas + ajudantes).
 * Espelha: analisar_absenteismo()
 */
function analisarAbsenteismo(
  todoRegistros: RegistroPonto[],
  mesAlvo: number,
  anoAlvo: number,
  excludedDates: string[],  // "DD/MM/YYYY"
  includeSundays: boolean
): AbsenteismoItem[] {
  if (todoRegistros.length === 0) return [];

  // Conjunto de datas excluídas para lookup rápido
  const datasExcluidas = new Set(excludedDates);

  // Filtra registros
  const filtrados = todoRegistros.filter(reg => {
    // Remove feriados
    if (datasExcluidas.has(reg.data)) return false;
    // Remove domingos (se !includeSundays)
    if (!includeSundays) {
      const [d, m, y] = reg.data.split('/').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt.getDay() === 0) return false; // domingo = 0
    }
    return true;
  });

  // Agrega por colaborador
  const mapa = new Map<string, {
    id: string; nome: string; grupo: string;
    diasUnicos: Set<string>; presencasFisicas: number;
    presencasJustificadas: number; totalPresencas: number;
  }>();

  for (const reg of filtrados) {
    // Determina grupo — heurística: se veio do array de motoristas ou ajudantes
    // Na prática, o cargo é determinado pelo tipo de arquivo; aqui unificamos
    const chave = reg.id;
    let m = mapa.get(chave);
    if (!m) {
      m = {
        id: reg.id, nome: reg.nome, grupo: reg.escala ? 'Motorista' : 'Ajudante',
        diasUnicos: new Set(), presencasFisicas: 0,
        presencasJustificadas: 0, totalPresencas: 0,
      };
      mapa.set(chave, m);
    }

    m.diasUnicos.add(reg.data);

    // Presença física: qualquer marcação preenchida
    const temFisica = [reg.entrada, reg.saidaAlmoco, reg.retornoAlmoco, reg.saida, reg.tempoTotalEmpresa]
      .some(v => v && v.trim() !== '');

    // Presença justificada: situação na lista
    const descNorm = (reg.descSituacao || '').toLowerCase();
    const temJustificada = SITUACOES_PRESENCA.some(s => descNorm.includes(s));

    const presenca = temFisica || temJustificada;

    if (temFisica)      m.presencasFisicas++;
    if (temJustificada) m.presencasJustificadas++;
    if (presenca)       m.totalPresencas++;
  }

  return Array.from(mapa.values()).map(m => {
    const totalDias  = m.diasUnicos.size;
    const faltas     = Math.max(0, totalDias - m.totalPresencas);
    const percentual = totalDias > 0 ? round2((m.totalPresencas / totalDias) * 100) : 0;
    return {
      ID: m.id,
      Nome: m.nome,
      Grupo: m.grupo,
      Total_Dias: totalDias,
      'Presenças Físicas': m.presencasFisicas,
      'Atestados/Férias': m.presencasJustificadas,
      'Total Presenças': m.totalPresencas,
      Faltas: faltas,
      'Percentual (%)': percentual,
      Valor_Incentivo: incentivoPorFaixa(percentual),
    };
  }).sort((a, b) => a.Nome.localeCompare(b.Nome));
}

// ── Pipeline principal ────────────────────────────────────────────────────────

export async function executePontoPipeline(formData: FormData) {
  try {
    const targetYear     = parseInt(formData.get('year')    as string);
    const targetMonth    = parseInt(formData.get('month')   as string);
    const includeSundays = formData.get('includeSundays') === 'true';
    const excludedRaw    = formData.get('excludedDates') as string;
    const excludedDates: string[] = excludedRaw ? JSON.parse(excludedRaw) : [];
    const files          = formData.getAll('files') as File[];

    if (!targetYear || !targetMonth || files.length === 0) {
      throw new Error('Parâmetros ou arquivos ausentes.');
    }

    // ETAPA 1: Carrega e processa todos os CSVs
    const todosRegistros = await carregarCSVs(files, targetMonth, targetYear);

    if (todosRegistros.length === 0) {
      throw new Error(`Nenhum registro encontrado para ${String(targetMonth).padStart(2,'0')}/${targetYear}. Verifique os arquivos.`);
    }

    // Separa motoristas e ajudantes
    // Heurística: arquivos com "motorista" no nome → MOTORISTA, demais → AJUDANTE
    // Na ausência de tipagem por arquivo, todos são tratados como unificados
    // e o cargo é inferido pelo nome do arquivo (padrão do Python: mesma pasta)
    const registrosMotorista: RegistroPonto[] = [];
    const registrosAjudante: RegistroPonto[]  = [];

    for (const file of files) {
      const nomeArq = file.name.toLowerCase();
      const isMot   = nomeArq.includes('motorista') || nomeArq.includes('mot_');
      const isAju   = nomeArq.includes('ajudante')  || nomeArq.includes('aju_');
      const conteudo = await file.text();
      const parsed   = parsearCSV(conteudo, targetMonth, targetYear);

      if (isMot)      registrosMotorista.push(...parsed);
      else if (isAju) registrosAjudante.push(...parsed);
      else            registrosMotorista.push(...parsed); // fallback: trata como motorista
    }

    // Deduplicação interna por grupo
    const deduplicar = (regs: RegistroPonto[]) => {
      const mapa = new Map<string, RegistroPonto>();
      for (const r of regs) {
        const k = `${r.id}|${r.data}`;
        const ex = mapa.get(k);
        if (!ex || r.score > ex.score) mapa.set(k, r);
      }
      return Array.from(mapa.values()).sort((a, b) => {
        if (a.id !== b.id) return a.id.localeCompare(b.id);
        return a.data.localeCompare(b.data);
      });
    };

    const motLimpos = deduplicar(registrosMotorista);
    const ajuLimpos = deduplicar(registrosAjudante);

    // ETAPA 2: Conformidade Motoristas
    const detalheMot     = analisarConformidade(motLimpos, 'Motorista', MOT_VALOR_MARCACOES, MOT_VALOR_CRITERIOS);
    const consolidadoMot = gerarConsolidado(detalheMot);

    // ETAPA 3: Conformidade Ajudantes
    const detalheAju     = analisarConformidade(ajuLimpos, 'Ajudante', AJU_VALOR_MARCACOES, AJU_VALOR_CRITERIOS);
    const consolidadoAju = gerarConsolidado(detalheAju);

    // Detalhe e consolidado unificados (Motoristas + Ajudantes juntos)
    const detalheUnificado     = [...detalheMot, ...detalheAju];
    const consolidadoUnificado = [...consolidadoMot, ...consolidadoAju]
      .sort((a, b) => b['💵 BONIFICAÇÃO TOTAL'] - a['💵 BONIFICAÇÃO TOTAL']);

    // Sem marcação (colaboradores sem nenhuma batida)
    const semMarcacao = todosRegistros.filter(
      r => r.entrada === '' && r.saidaAlmoco === '' && r.retornoAlmoco === '' && r.saida === ''
    );

    // ETAPA 4: Absenteísmo
    const absenteismo = analisarAbsenteismo(
      todosRegistros, targetMonth, targetYear, excludedDates, includeSundays
    );

    // Totais para summary
    const totalBonMot = detalheMot.reduce((s, d) => s + d.bonificacaoTotalDia, 0);
    const totalBonAju = detalheAju.reduce((s, d) => s + d.bonificacaoTotalDia, 0);
    const totalIncentivo = absenteismo.reduce((s, a) => s + a.Valor_Incentivo, 0);

    const saved = await firebaseStore.saveResult('ponto', {
      pipelineType : 'ponto',
      timestamp    : Date.now(),
      year         : targetYear,
      month        : targetMonth,
      // Consolidado unificado (compatível com DataViewer)
      data         : consolidadoUnificado,
      // Detalhe diário completo
      detalhePonto : detalheUnificado,
      // Absenteísmo
      absenteismoData: absenteismo,
      // Sem marcação
      semMarcacao,
      summary: [
        `${consolidadoMot.length} motoristas | R$ ${round2(totalBonMot).toFixed(2)}`,
        `${consolidadoAju.length} ajudantes  | R$ ${round2(totalBonAju).toFixed(2)}`,
        `Absenteísmo: ${absenteismo.length} colaboradores | R$ ${round2(totalIncentivo).toFixed(2)} incentivos`,
      ].join(' — '),
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };

  } catch (error: any) {
    console.error('Erro no Ponto Pipeline:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}