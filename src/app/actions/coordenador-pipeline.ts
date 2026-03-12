"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// ─── Constantes de negócio ────────────────────────────────────────────────────

const PERCENTUAL_MAXIMO_DEVOLUCAO  = 15.0
const BONIFICACAO_MAXIMA_MOTORISTA = 16.0
const BONIFICACAO_MAXIMA_AJUDANTE  = 12.0

// Nomes de abas por prioridade (igual ao Python)
const ABAS_PERF_MOT  = ["04_Detalhe_Motorista",       "Detalhe Diário Performance", "Detalhe Diario Performance"]
const ABAS_PERF_AJU  = ["06_Detalhe_Ajudante",         "Detalhe Diário Performance", "Detalhe Diario Performance"]
const ABAS_PONTO_MOT = ["03_Detalhe_Ponto_Motorista",  "Detalhe Diario Ponto",       "Ponto Original"]
const ABAS_PONTO_AJU = ["07_Detalhe_Ponto_Ajudante",   "Detalhe Diario Ponto",       "Ponto Original"]
const ABAS_COND      = ["04_Detalhe_Diario",            "Detalhe Diário Condução",    "Detalhe Diario Conducao", "Condução Original"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: any): string {
  if (s == null) return ""
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function findCol(row: Record<string, any>, options: string[]): string | null {
  const keys = Object.keys(row)
  const normMap = new Map(keys.map(k => [norm(k), k]))
  for (const op of options) {
    const n = norm(op)
    if (normMap.has(n)) return normMap.get(n)!
    for (const [k, orig] of normMap) {
      if (k.includes(n)) return orig
    }
  }
  return null
}

function parseDate(value: any): string | null {
  if (!value) return null
  const str = String(value).trim()
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return str.slice(0, 10)
  // Excel serial date
  const num = parseFloat(str)
  if (!isNaN(num) && num > 40000) {
    const date = new Date((num - 25569) * 86400 * 1000)
    return date.toISOString().slice(0, 10)
  }
  return null
}

function toNum(v: any): number {
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? 1 : 0
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return isNaN(n) ? 0 : n
}

function boolToOk(v: any): "OK" | "FALHA" | "N/A" {
  if (v === true  || v === 1 || String(v).toLowerCase() === "true")  return "OK"
  if (v === false || v === 0 || String(v).toLowerCase() === "false") return "FALHA"
  return "N/A"
}

// ─── Lê a primeira aba disponível ─────────────────────────────────────────────

function pickSheet(
  sheetsMap: Map<string, any[]>,
  candidates: string[]
): any[] | null {
  for (const candidate of candidates) {
    for (const [sheetName, data] of sheetsMap) {
      if (norm(sheetName) === norm(candidate) || norm(sheetName).includes(norm(candidate))) {
        return data
      }
    }
  }
  return null
}

// ─── Processadores de cada fonte ─────────────────────────────────────────────

interface DailyRow {
  _colaborador: string
  _dia: string | null
  [key: string]: any
}

function processarPerformance(rows: any[], colNomeOpcoes: string[]): DailyRow[] {
  return rows.map(row => {
    const colNome = findCol(row, colNomeOpcoes) ?? findCol(row, ["Colaborador", "Nome"])
    const colDia  = findCol(row, ["Dia", "Data"])

    const colaborador = colNome ? String(row[colNome] ?? "").trim().toUpperCase() : "DESCONHECIDO"
    const dia = colDia ? parseDate(row[colDia]) : null

    const result: DailyRow = { _colaborador: colaborador, _dia: dia }

    // Mapeia colunas de critérios (aceita tanto True/False quanto "OK"/"FALHA")
    const boolCols: Array<[string[], string]> = [
      [["✓ Raio", "Raio_100m", "Raio ≥"], "PERF_Raio_100m"],
      [["✓ SLA", "SLA_Janela", "SLA ≥"],   "PERF_SLA_Janela"],
      [["✓ Tempo", "Tempo_Min", "Tempo ≥"], "PERF_Tempo_Min"],
      [["✓ Sequência", "Sequenciamento", "Seq ≥"], "PERF_Sequenciamento"],
    ]
    for (const [opts, dest] of boolCols) {
      const col = findCol(row, opts)
      result[dest] = col != null ? boolToOk(row[col]) : "N/A"
    }

    const colBonus = findCol(row, ["Bonificação Performance", "Bonificacao Performance", "Bonificação Motorista", "Bonificacao Motorista", "Bonificação Ajudante", "Bonificacao Ajudante"])
    result["PERF_Bonificacao"] = colBonus != null ? toNum(row[colBonus]) : 0

    const colPeso    = findCol(row, ["Peso Pedido Dia", "Peso_Pedido_Dia"])
    const colDev     = findCol(row, ["Peso Devolvido Dia", "Peso_Devolvido_Dia"])
    const colPctDev  = findCol(row, ["% Devolvido Dia", "Percentual_Devolvido", "PESO_Percentual_Devolvido"])
    result["Peso_Pedido_Dia"]          = colPeso   ? toNum(row[colPeso])   : 0
    result["PESO_Devolvido_Dia"]       = colDev    ? toNum(row[colDev])    : 0
    result["PESO_Percentual_Devolvido"] = colPctDev ? toNum(row[colPctDev]) : 0

    return result
  })
}

function processarPonto(rows: any[], colNomeOpcoes: string[]): DailyRow[] {
  return rows.map(row => {
    const colNome = findCol(row, colNomeOpcoes) ?? findCol(row, ["Colaborador", "Nome"])
    const colDia  = findCol(row, ["Dia", "Data"])

    const colaborador = colNome ? String(row[colNome] ?? "").trim().toUpperCase() : "DESCONHECIDO"
    const dia = colDia ? parseDate(row[colDia]) : null

    const result: DailyRow = { _colaborador: colaborador, _dia: dia }

    const boolCols: Array<[string[], string]> = [
      [["✓ Marcacoes_100%", "Marcacoes 100%", "Batidas"], "PONTO_Todas_Batidas"],
      [["✓ Intrajornada_OK", "Intrajornada OK", "Intrajornada"], "JORNADA_Intrajornada"],
      [["✓ Interjornada_OK", "Interjornada OK", "Interjornada"], "JORNADA_Interjornada"],
    ]
    for (const [opts, dest] of boolCols) {
      const col = findCol(row, opts)
      result[dest] = col != null ? boolToOk(row[col]) : "N/A"
    }

    // DSR: invertido (True = FALHA)
    const colDsr = findCol(row, ["Violou_DSR", "DSR"])
    if (colDsr) {
      const v = row[colDsr]
      result["JORNADA_DSR"] = v === true || String(v).toLowerCase() === "true" ? "FALHA" : "OK"
    } else {
      result["JORNADA_DSR"] = "N/A"
    }

    const strCols: Array<[string[], string]> = [
      [["Entrada"],               "PONTO_Entrada"],
      [["Saida_Almoco"],          "PONTO_Saida_Almoco"],
      [["Retorno_Almoco"],        "PONTO_Retorno_Almoco"],
      [["Saida", "Saída"],        "PONTO_Saida"],
      [["Excesso_Jornada"],       "JORNADA_Hora_Extra"],
      [["Tempo_Almoco"],          "JORNADA_Intervalo_Almoco"],
      [["Tempo_Trabalhado"],      "JORNADA_Tempo_Total"],
      [["Interjornada_Descanso"], "JORNADA_Interjornada_Descanso"],
      [["Deficit_Interjornada"],  "JORNADA_Deficit_Interjornada"],
    ]
    for (const [opts, dest] of strCols) {
      const col = findCol(row, opts)
      result[dest] = col != null ? (row[col] ?? "") : ""
    }

    const colBonMarcacao = findCol(row, ["Bonus_Marcacoes", "Bônus Marcações", "PONTO_Bonificacao"])
    const colBonCriterio = findCol(row, ["Bonus_Criterios", "Bônus Critérios", "JORNADA_Bonificacao"])
    const colBonTotal    = findCol(row, ["Bonificacao_Total_Dia", "Bonificação Total Dia", "TOTAL_Ponto_Bonificacao"])

    const pontoBonus    = colBonMarcacao ? toNum(row[colBonMarcacao]) : 0
    const jornadaBonus  = colBonCriterio ? toNum(row[colBonCriterio]) : 0
    result["PONTO_Bonificacao"]      = pontoBonus
    result["JORNADA_Bonificacao"]    = jornadaBonus
    result["TOTAL_Ponto_Bonificacao"] = colBonTotal
      ? toNum(row[colBonTotal])
      : pontoBonus + jornadaBonus

    return result
  })
}

function processarConducao(rows: any[]): DailyRow[] {
  return rows.map(row => {
    const colNome = findCol(row, ["Motorista", "MOTORISTA", "Colaborador"])
    const colDia  = findCol(row, ["Dia", "Data"])

    const colaborador = colNome ? String(row[colNome] ?? "").trim().toUpperCase() : "DESCONHECIDO"
    const dia = colDia ? parseDate(row[colDia]) : null

    const result: DailyRow = { _colaborador: colaborador, _dia: dia }

    const boolCols: Array<[string[], string]> = [
      [["✓ Sem Excesso Velocidade", "COND_Excesso_Velocidade"], "COND_Excesso_Velocidade"],
      [["✓ Curva 100%", "COND_Curva_Brusca"], "COND_Curva_Brusca"],
      [["✓ Banguela 100%", "COND_Banguela"],  "COND_Banguela"],
      [["✓ Ociosidade 100%", "COND_Ociosidade"], "COND_Ociosidade"],
    ]
    for (const [opts, dest] of boolCols) {
      const col = findCol(row, opts)
      result[dest] = col != null ? boolToOk(row[col]) : "N/A"
    }

    const colBonus = findCol(row, ["Bonificação Condução", "Bonificacao Conducao", "COND_Bonificacao"])
    result["COND_Bonificacao"] = colBonus ? toNum(row[colBonus]) : 0

    return result
  })
}

// ─── Merge outer join por (colaborador, dia) ─────────────────────────────────

function mergeOuter(
  left: DailyRow[],
  right: DailyRow[],
  rightPrefix?: string // não usado mas útil para debug
): DailyRow[] {
  const rightMap = new Map<string, DailyRow>()
  for (const r of right) {
    const key = `${r._colaborador}||${r._dia ?? "__null__"}`
    rightMap.set(key, r)
  }

  const seen = new Set<string>()
  const result: DailyRow[] = []

  // left side
  for (const l of left) {
    const key = `${l._colaborador}||${l._dia ?? "__null__"}`
    seen.add(key)
    const r = rightMap.get(key) ?? {}
    result.push({ ...l, ...r, _colaborador: l._colaborador, _dia: l._dia })
  }

  // right-only rows
  for (const [key, r] of rightMap) {
    if (!seen.has(key)) {
      result.push(r)
    }
  }

  return result.sort((a, b) => {
    const cmp = (a._colaborador ?? "").localeCompare(b._colaborador ?? "")
    if (cmp !== 0) return cmp
    return (a._dia ?? "").localeCompare(b._dia ?? "")
  })
}

// ─── Consolidação principal ───────────────────────────────────────────────────

function consolidar(
  dfPerf:  any[],
  dfPonto: any[],
  dfCond:  any[] | null,
  colNomeOpcoes: string[],
  bonificacaoMaxima: number
): any[] {
  const pPerf  = processarPerformance(dfPerf,  colNomeOpcoes)
  const pPonto = processarPonto(dfPonto, colNomeOpcoes)

  let merged = mergeOuter(pPerf, pPonto)

  if (dfCond !== null) {
    const pCond = processarConducao(dfCond)
    merged = mergeOuter(merged, pCond)
  }

  // Garante numérico nas bonificações
  const bonusCols = ["PERF_Bonificacao", "PONTO_Bonificacao", "JORNADA_Bonificacao",
                     "TOTAL_Ponto_Bonificacao", "COND_Bonificacao"]
  for (const row of merged) {
    for (const col of bonusCols) {
      if (!(col in row)) row[col] = 0
      row[col] = toNum(row[col])
    }
    for (const col of ["Peso_Pedido_Dia", "PESO_Devolvido_Dia", "PESO_Percentual_Devolvido"]) {
      if (!(col in row)) row[col] = 0
      row[col] = toNum(row[col])
    }
  }

  // Regra de penalização por devolução
  for (const row of merged) {
    row["PESO_Penalizado"] = row["PESO_Percentual_Devolvido"] >= PERCENTUAL_MAXIMO_DEVOLUCAO
    if (row["PESO_Penalizado"]) {
      for (const col of bonusCols) row[col] = 0
    }
  }

  // Bonificação diária total
  const fontesBon = ["PERF_Bonificacao", "TOTAL_Ponto_Bonificacao", "COND_Bonificacao"]
    .filter(c => merged.some(r => c in r))

  for (const row of merged) {
    row["Bonificacao_Diaria_Total"] = fontesBon.reduce((a, c) => a + (row[c] ?? 0), 0)
    row["Bonificacao_Max_Dia"]       = bonificacaoMaxima
    row["Percentual_Atingido"]       = bonificacaoMaxima > 0
      ? `${((row["Bonificacao_Diaria_Total"] / bonificacaoMaxima) * 100).toFixed(2)}%`
      : "0.00%"
  }

  // Bonificação acumulada por colaborador
  const acum = new Map<string, number>()
  for (const row of merged) {
    const prev = acum.get(row._colaborador) ?? 0
    const cur  = prev + (row["Bonificacao_Diaria_Total"] ?? 0)
    acum.set(row._colaborador, cur)
    row["Bonificacao_Acumulada"] = +cur.toFixed(2)
  }

  // Renomeia chaves internas
  return merged
}

// ─── Enriquecimento com funcionários ─────────────────────────────────────────

function enriquecerComFuncionarios(
  rows: any[],
  colColaborador: string,
  funcionarios: any[]
): any[] {
  if (!funcionarios.length) return rows

  const firstRow = funcionarios[0]
  const colNome  = findCol(firstRow, ["Nome", "Nome completo", "Colaborador", "Funcionario"])
  const colEmp   = findCol(firstRow, ["EMPRESA", "Empresa", "Filial", "Unidade"])
  const colCargo = findCol(firstRow, ["Cargo", "Função", "Funcao"])

  if (!colNome) return rows

  const mapaEmpresa = new Map<string, string>()
  const mapaCargo   = new Map<string, string>()
  for (const f of funcionarios) {
    const n = norm(f[colNome])
    if (colEmp   && f[colEmp])   mapaEmpresa.set(n, String(f[colEmp]))
    if (colCargo && f[colCargo]) mapaCargo.set(n, String(f[colCargo]))
  }

  return rows.map(row => ({
    ...row,
    Empresa: mapaEmpresa.get(norm(row[colColaborador])) ?? null,
    Cargo:   mapaCargo.get(norm(row[colColaborador]))   ?? null,
  }))
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function coordenadorProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsMotoristas = await args.files.readSheets("fileMotoristas")
  const sheetsAjudantes  = await args.files.readSheets("fileAjudantes")

  // Opcional: arquivo de funcionários (pode não existir)
  let funcionarios: any[] = []
  try {
    const rawFunc = await args.files.readAll("fileFuncionarios")
    funcionarios = rawFunc.flat()
  } catch { /* sem funcionários */ }

  // ── Motoristas ────────────────────────────────────────────────────────────
  const dfPerfMot  = pickSheet(sheetsMotoristas, ABAS_PERF_MOT)
  const dfPontoMot = pickSheet(sheetsMotoristas, ABAS_PONTO_MOT)
  const dfCond     = pickSheet(sheetsMotoristas, ABAS_COND)

  if (!dfPerfMot || !dfPontoMot) {
    throw new Error(
      "Arquivo de Motoristas não contém as abas esperadas.\n" +
      `Procurado: ${[...ABAS_PERF_MOT, ...ABAS_PONTO_MOT].join(", ")}`
    )
  }

  const rawMotoristas = consolidar(dfPerfMot, dfPontoMot, dfCond, ["Motorista", "MOTORISTA"], BONIFICACAO_MAXIMA_MOTORISTA)
  const motoristas = enriquecerComFuncionarios(
    rawMotoristas.map(r => ({ Motorista: r._colaborador, Dia: r._dia, ...r })),
    "Motorista",
    funcionarios
  ).filter(r => {
    if (!r.Cargo) return true // sem cadastro → mantém
    return norm(r.Cargo).includes("motorista")
  })

  // ── Ajudantes ─────────────────────────────────────────────────────────────
  const dfPerfAju  = pickSheet(sheetsAjudantes, ABAS_PERF_AJU)
  const dfPontoAju = pickSheet(sheetsAjudantes, ABAS_PONTO_AJU)

  if (!dfPerfAju || !dfPontoAju) {
    throw new Error(
      "Arquivo de Ajudantes não contém as abas esperadas.\n" +
      `Procurado: ${[...ABAS_PERF_AJU, ...ABAS_PONTO_AJU].join(", ")}`
    )
  }

  const rawAjudantes = consolidar(dfPerfAju, dfPontoAju, null, ["Ajudante", "AJUDANTE"], BONIFICACAO_MAXIMA_AJUDANTE)
  const ajudantes = enriquecerComFuncionarios(
    rawAjudantes.map(r => ({ Ajudante: r._colaborador, Dia: r._dia, ...r })),
    "Ajudante",
    funcionarios
  ).filter(r => {
    if (!r.Cargo) return true
    return norm(r.Cargo).includes("ajudante")
  })

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalMotoristas  = new Set(motoristas.map(r => r["Motorista"])).size
  const totalAjudantes   = new Set(ajudantes.map(r => r["Ajudante"])).size
  const bonMotoristas    = motoristas.reduce((a, r) => a + (r["Bonificacao_Diaria_Total"] ?? 0), 0)
  const bonAjudantes     = ajudantes.reduce((a, r)  => a + (r["Bonificacao_Diaria_Total"] ?? 0), 0)
  const diasPenalizados  = [...motoristas, ...ajudantes].filter(r => r["PESO_Penalizado"]).length

  console.log(`[Coordenador] ${totalMotoristas} motoristas · R$ ${bonMotoristas.toFixed(2)}`)
  console.log(`[Coordenador] ${totalAjudantes} ajudantes · R$ ${bonAjudantes.toFixed(2)}`)
  console.log(`[Coordenador] ${diasPenalizados} dias penalizados por devolução ≥ ${PERCENTUAL_MAXIMO_DEVOLUCAO}%`)

  return {
    data: motoristas,         // compatibilidade com DataViewer (primeira aba)
    motoristas,
    ajudantes,
    erros: [],
    summary:
      `Coordenador ${args.month}/${args.year}: ` +
      `${totalMotoristas} motoristas (R$ ${bonMotoristas.toFixed(2)}) · ` +
      `${totalAjudantes} ajudantes (R$ ${bonAjudantes.toFixed(2)}) · ` +
      `${diasPenalizados} dias penalizados`,
    extraSheets: [
      { name: "Motoristas_Ajustado", data: motoristas },
      { name: "Ajudantes_Ajustado",  data: ajudantes  },
    ],
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeCoordenadorPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("coordenador", formData, coordenadorProcessor)
}