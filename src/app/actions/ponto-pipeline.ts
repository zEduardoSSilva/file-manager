"use server"

import { processAndSave, PipelineArgs, ProcessorOutput, PipelineResponse } from "./pipeline-utils"

// ─── Constantes ───────────────────────────────────────────────────────────────
const MOT_BONIFICACAO_DIARIA_TOTAL = 16.00
const MOT_PERCENTUAL_PONTO         = 0.20
const MOT_VALOR_PONTO              = +(MOT_BONIFICACAO_DIARIA_TOTAL * MOT_PERCENTUAL_PONTO).toFixed(2) // 3.20
const MOT_VALOR_MARCACOES          = +(MOT_VALOR_PONTO / 2).toFixed(2) // 1.60
const MOT_VALOR_CRITERIOS          = +(MOT_VALOR_PONTO / 2).toFixed(2) // 1.60

const AJU_BONIFICACAO_DIARIA_TOTAL = 12.00
const AJU_PERCENTUAL_PONTO         = 0.40
const AJU_VALOR_PONTO              = +(AJU_BONIFICACAO_DIARIA_TOTAL * AJU_PERCENTUAL_PONTO).toFixed(2) // 4.80
const AJU_VALOR_MARCACOES          = +(AJU_VALOR_PONTO / 2).toFixed(2) // 2.40
const AJU_VALOR_CRITERIOS          = +(AJU_VALOR_PONTO / 2).toFixed(2) // 2.40

const CARGA_HORARIA_PADRAO_MIN = 440  // 07:20
const INTERJORNADA_MIN_MIN     = 11 * 60 // 11h

const SITUACOES_CONTAM_PRESENCA = [
  "ATESTADO","AUXILIO DOENCA","AUXÍLIO DOENÇA","FERIAS","FÉRIAS",
  "LICENCA MATERNIDADE","LICENÇA MATERNIDADE","LICENCA PATERNIDADE",
  "LICENÇA PATERNIDADE","FALTA ABONADA","ABONADA",
]

// ─── Helpers de tempo ─────────────────────────────────────────────────────────

function horarioParaMinutos(horario: any): number | null {
  if (!horario || String(horario).trim() === "") return null
  try {
    const clean = String(horario).replace("*", "").trim()
    const [h, m] = clean.split(":").map(Number)
    return h * 60 + m
  } catch { return null }
}

function minutosParaHorario(min: number | null): string {
  if (min == null) return ""
  return `${String(Math.floor(min / 60)).padStart(2,"0")}:${String(min % 60).padStart(2,"0")}`
}

function calcularTempoTrabalhado(
  entrada: string, saidaAlmoco: string, retornoAlmoco: string, saida: string
): { trab: number | null; alm: number | null } {
  const e  = horarioParaMinutos(entrada)
  const sa = horarioParaMinutos(saidaAlmoco)
  const ra = horarioParaMinutos(retornoAlmoco)
  const s  = horarioParaMinutos(saida)

  if (e == null || s == null) return { trab: null, alm: null }

  let total = s - e
  if (total < 0) total += 24 * 60

  let alm = 0
  if (sa != null && ra != null) {
    alm = ra - sa
    if (alm < 0) alm += 24 * 60
  }

  return { trab: total - alm, alm }
}

// ─── Etapa 1: Parser de CSV de ponto ─────────────────────────────────────────

function parsearCSVPonto(rows: any[], mes: number): any[] {
  // Os dados já chegam parseados pelo pipeline-utils
  // Tentamos identificar a estrutura do CSV de ponto
  const resultado: any[] = []

  let idAtual: string | null = null
  let nomeAtual: string | null = null
  let horarioPrevisto: string | null = null

  for (const row of rows) {
    const valores = Object.values(row).map(v => String(v ?? "").trim())
    const col0 = valores[0] ?? ""
    const col1 = valores[1] ?? ""
    const col2 = valores[2] ?? ""

    // Ignora cabeçalhos
    if (/PONTO_ORIGINAL|APURAÇÃO|TRANSMENDES|PAG:|PERÍODO/i.test(col0)) continue
    if (/Total Colaborador|Total Geral/i.test(col1)) continue
    if (!col0 && !col1) continue

    // Linha de identificação do colaborador (ID numérico + nome)
    if (/^\d{2,}$/.test(col0) && !col0.includes("/") && col1) {
      idAtual = col0
      nomeAtual = col1
      horarioPrevisto = null
      continue
    }

    // Linha de escala/horário previsto (col0 vazia, tem horários)
    if (idAtual && !col0 && valores.some(v => /^\d{2}:\d{2}/.test(v))) {
      const horarios = valores.filter(v => /^\d{2}:\d{2}/.test(v))
      if (horarios.length >= 2) horarioPrevisto = horarios.join(" ")
      continue
    }

    // Linha de data + marcações
    if (/\d{2}\/\d{2}/.test(col0) && col0.length >= 5 && col0.length <= 10) {
      const data = col0.length === 10 ? col0 : `${col0}/${new Date().getFullYear()}`

      // Extrai marcações da col2 (separadas por espaço)
      const marcacoes = col2.split(/\s+/).filter(v => /^\d{2}:\d{2}/.test(v))
      const entrada        = marcacoes[0] ?? ""
      const saidaAlmoco   = marcacoes[1] ?? ""
      const retornoAlmoco = marcacoes[2] ?? ""
      const saida         = marcacoes[3] ?? ""

      // Tempo total empresa (primeira → última marcação)
      let tempoTotalEmpresa = ""
      if (marcacoes.length >= 2) {
        const ini = horarioParaMinutos(marcacoes[0])
        const fim = horarioParaMinutos(marcacoes[marcacoes.length - 1])
        if (ini != null && fim != null) {
          let diff = fim - ini
          if (diff < 0) diff += 24 * 60
          tempoTotalEmpresa = minutosParaHorario(diff)
        }
      }

      // Situação (código + descrição)
      let codSit = "", descSit = "", tempoSit = ""
      for (let i = 3; i < valores.length; i++) {
        const v = valores[i]
        if (/^\d{3}$/.test(v) && !codSit) { codSit = v; continue }
        if (v && !/^\d+$/.test(v) && !descSit) { descSit = v; continue }
        if (/^\d{2}:\d{2}/.test(v) && !tempoSit) { tempoSit = v }
      }

      resultado.push({
        ID_Colaborador: idAtual ?? "",
        Nome_Colaborador: nomeAtual ?? "",
        Data: data,
        Dia_Semana: col1,
        Entrada: entrada,
        Saida_Almoco: saidaAlmoco,
        Retorno_Almoco: retornoAlmoco,
        Saida: saida,
        Tempo_Total_Empresa: tempoTotalEmpresa,
        Horario_Previsto: horarioPrevisto ?? "",
        Cod_Situacao: codSit,
        Desc_Situacao: descSit,
        Tempo_Situacao: tempoSit,
      })
    }
  }

  // Filtra por mês
  return resultado.filter(row => {
    const parts = row.Data.split("/")
    if (parts.length < 2) return false
    return parseInt(parts[1]) === mes
  })
}

// ─── Remove duplicatas priorizando registro mais completo ─────────────────────

function removerDuplicatas(rows: any[]): any[] {
  const mapa = new Map<string, any>()
  for (const row of rows) {
    const chave = `${row.ID_Colaborador}|${row.Data}`
    const score = [row.Entrada, row.Saida_Almoco, row.Retorno_Almoco, row.Saida]
      .filter(v => v && v !== "").length
    const existing = mapa.get(chave)
    if (!existing) {
      mapa.set(chave, { ...row, _score: score })
    } else if (score > existing._score) {
      mapa.set(chave, { ...row, _score: score })
    }
  }
  return Array.from(mapa.values()).map(({ _score, ...rest }) => rest)
}

// ─── Análise de conformidade ──────────────────────────────────────────────────

function analisarConformidade(
  rows: any[],
  valorMarcacoes: number,
  valorCriterios: number,
  colNome: string
): { detalhe: any[]; consolidado: any[] } {

  const sorted = [...rows].sort((a, b) => {
    if (a.ID_Colaborador !== b.ID_Colaborador) return a.ID_Colaborador.localeCompare(b.ID_Colaborador)
    return a.Data.localeCompare(b.Data)
  })

  const ultimoRegistro: Record<string, { data: string; saidaMin: number | null }> = {}
  const detalhe: any[] = []

  for (const row of sorted) {
    const { trab, alm } = calcularTempoTrabalhado(
      row.Entrada, row.Saida_Almoco, row.Retorno_Almoco, row.Saida
    )

    const marc = [row.Entrada, row.Saida_Almoco, row.Retorno_Almoco, row.Saida]
    const marcOk = marc.filter(m => m && m !== "").length
    const cumpriuMarcacoes = marcOk === 4
    const bonusMarcacoes   = cumpriuMarcacoes ? valorMarcacoes : 0

    // Jornada
    const limiteJornada = CARGA_HORARIA_PADRAO_MIN + 120 // +2h
    const excessoJornada = trab != null ? Math.max(0, trab - limiteJornada) : null
    const cumpriuJornada = trab != null ? trab <= limiteJornada : false

    // HE
    const he            = trab != null ? Math.max(0, trab - CARGA_HORARIA_PADRAO_MIN) : 0
    const excessoHE     = Math.max(0, he - 120)
    const cumpriuHE     = he <= 120

    // Almoço
    const cumpriuAlmoco = alm != null ? alm >= 60 : false
    const deficitAlmoco = alm != null ? Math.max(0, 60 - alm) : 60

    // Intrajornada
    const e  = horarioParaMinutos(row.Entrada)
    const sa = horarioParaMinutos(row.Saida_Almoco)
    const ra = horarioParaMinutos(row.Retorno_Almoco)
    const s  = horarioParaMinutos(row.Saida)

    let periodoManha = 0, periodoTarde = 0
    if (e != null && sa != null) { periodoManha = sa - e; if (periodoManha < 0) periodoManha += 1440 }
    if (ra != null && s  != null) { periodoTarde = s - ra;  if (periodoTarde < 0) periodoTarde += 1440 }
    const excessoManha = Math.max(0, periodoManha - 360)
    const excessoTarde = Math.max(0, periodoTarde - 360)
    const cumpriuIntrajornada = excessoManha === 0 && excessoTarde === 0

    // Interjornada
    let descansoMin: number | null = null
    let cumpriuInterjornada = true
    const prev = ultimoRegistro[row.ID_Colaborador]
    if (prev && prev.saidaMin != null && e != null) {
      const prevDateOrd = dateToOrdinal(prev.data)
      const currDateOrd = dateToOrdinal(row.Data)
      if (currDateOrd >= prevDateOrd) {
        descansoMin = (currDateOrd - prevDateOrd) * 1440 + e - prev.saidaMin
        cumpriuInterjornada = descansoMin >= INTERJORNADA_MIN_MIN
      }
    }
    ultimoRegistro[row.ID_Colaborador] = { data: row.Data, saidaMin: s }

    const todos5OK = cumpriuJornada && cumpriuHE && cumpriuAlmoco && cumpriuIntrajornada && cumpriuInterjornada
    const bonusCriterios  = todos5OK ? valorCriterios : 0
    const bonificacaoTotal = +(bonusMarcacoes + bonusCriterios).toFixed(2)

    const temAjuste = marc.some(m => m && m.includes("*"))

    detalhe.push({
      "ID": row.ID_Colaborador,
      [colNome]: row.Nome_Colaborador,
      "Dia": row.Data,
      "Dia_Semana": row.Dia_Semana,
      "Entrada": row.Entrada,
      "Saida_Almoco": row.Saida_Almoco,
      "Retorno_Almoco": row.Retorno_Almoco,
      "Saida": row.Saida,
      "Tem_Ajuste_Manual": temAjuste,
      "Tempo_Trabalhado": minutosParaHorario(trab),
      "Tempo_Almoco": minutosParaHorario(alm),
      "Marcacoes_Completas": marcOk,
      "Marcacoes_Faltantes": 4 - marcOk,
      "✓ Marcacoes_100%": cumpriuMarcacoes,
      "💰 Bonus_Marcacoes": +bonusMarcacoes.toFixed(2),
      "Excesso_Jornada": minutosParaHorario(excessoJornada),
      "✓ Jornada_OK": cumpriuJornada,
      "HE_Realizada": minutosParaHorario(he),
      "Excesso_HE": minutosParaHorario(excessoHE),
      "✓ HE_OK": cumpriuHE,
      "Almoco_Realizado": minutosParaHorario(alm),
      "Deficit_Almoco": minutosParaHorario(deficitAlmoco),
      "✓ Almoco_OK": cumpriuAlmoco,
      "Periodo_Manha": minutosParaHorario(periodoManha),
      "Periodo_Tarde": minutosParaHorario(periodoTarde),
      "✓ Intrajornada_OK": cumpriuIntrajornada,
      "Interjornada_Descanso": minutosParaHorario(descansoMin),
      "✓ Interjornada_OK": cumpriuInterjornada,
      "Todos_5_Criterios_OK": todos5OK,
      "💰 Bonus_Criterios": +bonusCriterios.toFixed(2),
      "💵 Bonificacao_Total_Dia": bonificacaoTotal,
      "Desc_Situacao": row.Desc_Situacao,
    })
  }

  // Consolidado por colaborador
  const porColab: Record<string, any> = {}
  for (const row of detalhe) {
    const id = row["ID"]
    if (!porColab[id]) {
      porColab[id] = {
        "ID": id, [colNome]: row[colNome],
        dias: 0, bonusMarcacoes: 0, bonusCriterios: 0, bonifTotal: 0,
        diasCriteriosOk: 0, dias4Marc: 0, ajustes: 0,
      }
    }
    const c = porColab[id]
    c.dias++
    c.bonusMarcacoes += row["💰 Bonus_Marcacoes"]
    c.bonusCriterios += row["💰 Bonus_Criterios"]
    c.bonifTotal     += row["💵 Bonificacao_Total_Dia"]
    if (row["Todos_5_Criterios_OK"]) c.diasCriteriosOk++
    if (row["Marcacoes_Completas"] === 4) c.dias4Marc++
    if (row["Tem_Ajuste_Manual"]) c.ajustes++
  }

  const consolidado = Object.values(porColab).map((c: any) => ({
    "ID": c["ID"],
    [colNome]: c[colNome],
    "Dias_Trabalhados": c.dias,
    "💰 Total_Bonus_Marcacoes": +c.bonusMarcacoes.toFixed(2),
    "💰 Total_Bonus_Criterios": +c.bonusCriterios.toFixed(2),
    "💵 BONIFICACAO_TOTAL": +c.bonifTotal.toFixed(2),
    "Dias_Todos_Criterios_OK": c.diasCriteriosOk,
    "Dias_4_Marcacoes_Completas": c.dias4Marc,
    "Total_Ajustes_Manuais": c.ajustes,
  })).sort((a, b) => b["💵 BONIFICACAO_TOTAL"] - a["💵 BONIFICACAO_TOTAL"])

  return { detalhe, consolidado }
}

// ─── Etapa 4: Absenteísmo ─────────────────────────────────────────────────────

function analisarAbsenteismo(
  rowsMot: any[], rowsAju: any[], mes: number,
  datasExcluir: string[], considerarDomingos: boolean,
  absValor100: number, absValor90: number, absValor75: number,
): { resumo: any[]; detalhe: any[] } {

  const todos: any[] = [
    ...rowsMot.map(r => ({ ...r, Grupo: "Motorista" })),
    ...rowsAju.map(r => ({ ...r, Grupo: "Ajudante" })),
  ]

  // Remove domingos
  const filtrado = todos.filter(row => {
    const parts = row.Data?.split("/")
    if (!parts || parts.length < 3) return true
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
    if (!considerarDomingos && d.getDay() === 0) return false
    const iso = d.toISOString().slice(0, 10)
    const brFmt = `${parts[0]}/${parts[1]}/${parts[2]}`
    if (datasExcluir.includes(brFmt)) return false
    return true
  })

  const regexPresenca = new RegExp(SITUACOES_CONTAM_PRESENCA.join("|"), "i")

  const porColab: Record<string, any> = {}

  for (const row of filtrado) {
    const id   = row.ID_Colaborador
    const nome = row.Nome_Colaborador
    if (!id || !nome) continue

    if (!porColab[id]) {
      porColab[id] = {
        ID: id, Nome: nome, Grupo: row.Grupo,
        totalDias: 0, presencasFisicas: 0, presencasJustificadas: 0, totalPresencas: 0,
      }
    }

    const c = porColab[id]
    c.totalDias++

    const presencaFisica = !!(
      (row.Entrada && row.Entrada !== "") ||
      (row.Saida && row.Saida !== "") ||
      (row.Tempo_Total_Empresa && row.Tempo_Total_Empresa !== "")
    )
    const presencaJustificada = !!(row.Desc_Situacao && regexPresenca.test(row.Desc_Situacao))
    const presente = presencaFisica || presencaJustificada

    if (presencaFisica)     c.presencasFisicas++
    if (presencaJustificada) c.presencasJustificadas++
    if (presente)            c.totalPresencas++
  }

  const resumo = Object.values(porColab).map((c: any) => {
    const faltas   = Math.max(0, c.totalDias - c.totalPresencas)
    const perc     = c.totalDias > 0 ? +(c.totalPresencas / c.totalDias * 100).toFixed(2) : 0
    const incentivo = perc >= 100 ? absValor100 : perc >= 90 ? absValor90 : perc >= 75 ? absValor75 : 0
    return {
      "ID": c.ID, "Nome": c.Nome, "Grupo": c.Grupo,
      "Total_Dias": c.totalDias,
      "Presenças Físicas": c.presencasFisicas,
      "Atestados/Férias": c.presencasJustificadas,
      "Total Presenças": c.totalPresencas,
      "Faltas": faltas,
      "Percentual (%)": perc,
      "Valor_Incentivo": incentivo,
    }
  }).sort((a, b) => a.Grupo.localeCompare(b.Grupo) || a.Nome.localeCompare(b.Nome))

  return { resumo, detalhe: filtrado }
}

// ─── Helper: converte DD/MM/YYYY para ordinal de dias ────────────────────────

function dateToOrdinal(dataStr: string): number {
  const parts = dataStr.split("/")
  if (parts.length < 3) return 0
  return Math.floor(new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime() / 86400000)
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function pontoProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsData = await args.files.readAll("files")
  const fileNames: string[] = (args.formData?.getAll("fileNames") as string[]) ?? []

  const excludedDatesRaw = args.formData?.get("excludedDates") as string ?? "[]"
  const datasExcluir: string[] = JSON.parse(excludedDatesRaw)
  const considerarDomingos = args.formData?.get("includeSundays") === "true"

  const absValor100 = 50.0
  const absValor90  = 40.0
  const absValor75  = 25.0

  if (!sheetsData.length) throw new Error("Nenhum arquivo encontrado.")

  // Separa arquivos de motoristas vs ajudantes pelo nome
  const rowsMot: any[] = []
  const rowsAju: any[] = []

  sheetsData.forEach((rows, idx) => {
    const nome = (fileNames[idx] ?? "").toLowerCase()
    const parsed = parsearCSVPonto(rows, args.month ?? new Date().getMonth() + 1)
    if (/ajudante/i.test(nome)) rowsAju.push(...parsed)
    else rowsMot.push(...parsed)
  })

  const cleanMot = removerDuplicatas(rowsMot)
  const cleanAju = removerDuplicatas(rowsAju)

  // Sem marcação
  const semMarcMot = cleanMot.filter(r =>
    !r.Entrada && !r.Saida_Almoco && !r.Retorno_Almoco && !r.Saida
  )
  const semMarcAju = cleanAju.filter(r =>
    !r.Entrada && !r.Saida_Almoco && !r.Retorno_Almoco && !r.Saida
  )

  // Etapas 2 e 3
  const { detalhe: detMot, consolidado: consMot } =
    analisarConformidade(cleanMot, MOT_VALOR_MARCACOES, MOT_VALOR_CRITERIOS, "Motorista")
  const { detalhe: detAju, consolidado: consAju } =
    analisarConformidade(cleanAju, AJU_VALOR_MARCACOES, AJU_VALOR_CRITERIOS, "Ajudante")

  // Etapa 4
  const { resumo: absResumo, detalhe: absDetalhe } = analisarAbsenteismo(
    cleanMot, cleanAju, args.month ?? 1,
    datasExcluir, considerarDomingos, absValor100, absValor90, absValor75,
  )

  // Resumo de bonificações
  const resumoBonif = [
    ...["MOTORISTA", "AJUDANTE"].flatMap((grupo, gi) => {
      const det = gi === 0 ? detMot : detAju
      const vMar = gi === 0 ? MOT_VALOR_MARCACOES : AJU_VALOR_MARCACOES
      const vCri = gi === 0 ? MOT_VALOR_CRITERIOS : AJU_VALOR_CRITERIOS
      const vPon = gi === 0 ? MOT_VALOR_PONTO : AJU_VALOR_PONTO
      const tMar = det.reduce((s, r) => s + r["💰 Bonus_Marcacoes"], 0)
      const tCri = det.reduce((s, r) => s + r["💰 Bonus_Criterios"], 0)
      const tTot = det.reduce((s, r) => s + r["💵 Bonificacao_Total_Dia"], 0)
      return [
        { Grupo: grupo, Tipo: "1ª - Marcações (4/4) — GARANTIDO", Valor_Diario: `R$ ${vMar.toFixed(2)}`, Total_Pago: `R$ ${tMar.toFixed(2)}`, Regra: "Garantido se 4 batidas" },
        { Grupo: grupo, Tipo: "2ª - 5 Critérios OK — TUDO OU NADA", Valor_Diario: `R$ ${vCri.toFixed(2)}`, Total_Pago: `R$ ${tCri.toFixed(2)}`, Regra: "Jornada + HE + Almoço + Intrajornada + Interjornada" },
        { Grupo: grupo, Tipo: "TOTAL PONTO", Valor_Diario: `R$ ${vPon.toFixed(2)}`, Total_Pago: `R$ ${tTot.toFixed(2)}`, Regra: "" },
      ]
    })
  ]

  const totalBonifMot = consMot.reduce((s, r) => s + r["💵 BONIFICACAO_TOTAL"], 0)
  const totalBonifAju = consAju.reduce((s, r) => s + r["💵 BONIFICACAO_TOTAL"], 0)
  const totalIncentAbs = absResumo.reduce((s, r) => s + r["Valor_Incentivo"], 0)

  return {
    data: consMot,
    resumoMensal: absResumo,
    summary: `Ponto ${args.month}/${args.year}: ${consMot.length} motoristas · ${consAju.length} ajudantes · R$ ${(totalBonifMot + totalBonifAju).toFixed(2)} ponto · R$ ${totalIncentAbs.toFixed(2)} absenteísmo`,
    extraSheets: [
      { name: "01_Ponto_Completo_Motorista",  data: cleanMot  },
      { name: "02_Sem_Marcacao_Motorista",     data: semMarcMot },
      { name: "03_Detalhe_Ponto_Motorista",    data: detMot    },
      { name: "04_Consolidado_Motorista",      data: consMot   },
      { name: "05_Ponto_Completo_Ajudante",    data: cleanAju  },
      { name: "06_Sem_Marcacao_Ajudante",      data: semMarcAju },
      { name: "07_Detalhe_Ponto_Ajudante",     data: detAju    },
      { name: "08_Consolidado_Ajudante",       data: consAju   },
      { name: "09_Resumo_Bonificacoes",        data: resumoBonif },
      { name: "10_Absenteismo_Resumo",         data: absResumo },
      { name: "11_Absenteismo_Detalhe",        data: absDetalhe },
    ],
  }
}

export async function executePontoPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("ponto", formData, pontoProcessor)
}