"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { Button }      from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn }          from "@/lib/utils"

const h = React.createElement

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiaColaborador {
  data: string
  dia_semana: string
  marcacoes: string[]
  situacoes: { cod: string; desc: string; tempo: string }[]
}

interface Colaborador {
  id: string
  nome: string
  escala: string
  horario_previsto: string
  dias: DiaColaborador[]
}

interface RegistroPonto {
  ID: string; Nome: string; Escala: string; Horario_Previsto: string
  Data: string; Dia_Semana: string
  Entrada: string; Saida_Almoco: string; Retorno_Almoco: string; Saida: string
  Qtd_Marcacoes: number; Marcacoes_Completas: string
  Tempo_Trabalhado: string; Intervalo_Almoco: string; Hora_Extra: string
  Cod_Situacao: string; Desc_Situacao: string; Tipo_Presenca: string
}

interface RegistroDetalhe {
  ID: string; Nome: string; Dia: string; Dia_Semana: string
  Entrada: string; Saida_Almoco: string; Retorno_Almoco: string; Saida: string
  Tem_Ajuste_Manual: boolean
  Tempo_Trabalhado: string; Tempo_Almoco: string
  Marcacoes_Completas: number; Marcacoes_Faltantes: number
  Marcacoes_100pct: boolean; Bonus_Marcacoes: number
  Excesso_Jornada: string; Jornada_OK: boolean
  HE_Realizada: string; Excesso_HE: string; HE_OK: boolean
  Almoco_Realizado: string; Deficit_Almoco: string; Almoco_OK: boolean
  Periodo_Manha: string; Periodo_Tarde: string; Intrajornada_OK: boolean
  Interjornada_Descanso: string; Interjornada_OK: boolean
  Todos_5_Criterios_OK: boolean
  Bonus_Criterios: number; Bonificacao_Total_Dia: number
  Desc_Situacao: string
}

interface RegistroAbsenteismo {
  ID: string; Nome: string; Escala: string
  Dias_Uteis_Mes: number; Dias_Trabalhados: number
  Dias_Atestado: number; Dias_Auxilio_Doenca: number; Dias_Ferias: number
  Dias_Acidente_Trabalho: number; Dias_Abono: number
  Dias_Falta_Injustificada: number; Total_Presencas: number; Pct_Presenca: string
}

type ActiveTab = "ponto" | "absenteismo" | "detalhe"

// ─── Constantes ───────────────────────────────────────────────────────────────

const PRESENCA_JUSTIFICADA: Record<string, string> = {
  "002": "Férias", "003": "Auxílio Doença", "004": "Acidente Trabalho",
  "014": "Atestado", "073": "Atestado Acidente Trabalho Not", "501": "ABONO",
}
const FALTA_CODES  = new Set(["015"])
const IGNORE_CODES = new Set(["016","317","318","400","404","077","078","079","305","499","999"])

const CARGA_HORARIA_MIN   = 440
const INTERJORNADA_MIN    = 660
const VALOR_MARCACOES_MOT = 1.60
const VALOR_CRITERIOS_MOT = 1.60
const VALOR_MARCACOES_AJU = 2.40
const VALOR_CRITERIOS_AJU = 2.40

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToOrdinal(s: string): number {
  const p = s.split("/")
  if (p.length < 3) return 0
  return Math.floor(new Date(+p[2], +p[1] - 1, +p[0]).getTime() / 86400000)
}

function hmToMin(s: string): number {
  const m = String(s ?? "").match(/(\d+):(\d{2})/)
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0
}

function minToHm(m: number): string {
  if (!m) return ""
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`
}

function sitPrincipal(situacoes: DiaColaborador["situacoes"]): { cod: string; desc: string } {
  for (const s of situacoes) {
    if (s.cod && !IGNORE_CODES.has(s.cod)) return { cod: s.cod, desc: s.desc }
  }
  return { cod: "", desc: "" }
}

function calcularDia(marcacoes: string[], horarioPrevisto: string) {
  const r = {
    entrada: "", saida_almoco: "", retorno_almoco: "", saida: "",
    trab_min: 0, intervalo_min: 0, he_min: 0,
    qtd_marcacoes: marcacoes.length, marcacoes_ok: false,
  }
  if (!marcacoes.length) return r
  r.entrada        = marcacoes[0] ?? ""
  r.saida_almoco   = marcacoes[1] ?? ""
  r.retorno_almoco = marcacoes[2] ?? ""
  r.saida          = marcacoes[3] ?? ""
  r.marcacoes_ok   = marcacoes.length >= 4

  const e = hmToMin(r.entrada)
  const s = r.saida ? hmToMin(r.saida) : null
  if (s !== null) {
    let total = s - e
    if (total < 0) total += 1440
    let interv = 0
    if (r.saida_almoco && r.retorno_almoco) {
      interv = hmToMin(r.retorno_almoco) - hmToMin(r.saida_almoco)
      if (interv < 0) interv += 1440
    }
    r.intervalo_min = interv
    r.trab_min      = total - interv
    let prev = 0
    if (horarioPrevisto) {
      const hp = horarioPrevisto.match(/\d{2}:\d{2}/g) ?? []
      if (hp.length >= 4)
        prev = (hmToMin(hp[3]) - hmToMin(hp[0])) - (hmToMin(hp[2]) - hmToMin(hp[1]))
    }
    if (prev > 0) r.he_min = Math.max(0, r.trab_min - prev)
  }
  return r
}

function diasUteisMes(periodoStr: string): number {
  const m = periodoStr.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/)
  if (!m) return 0
  const parse = (s: string) => { const [d, mo, y] = s.split("/"); return new Date(+y, +mo - 1, +d) }
  let d = parse(m[1])
  const fim = parse(m[2])
  let count = 0
  while (d <= fim) { if (d.getDay() !== 0) count++; d = new Date(d.getTime() + 86400000) }
  return count
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseApuracao(rawData: any[][]): {
  colaboradores: Colaborador[]; periodo: string; periodStart: string; periodEnd: string
} {
  const mapa = new Map<string, Colaborador>()
  const ordem: string[] = []
  let current: Colaborador | null = null
  let periodStart = "", periodEnd = ""

  for (const cols of rawData) {
    const c = Array.from({ length: 12 }, (_, i) => String(cols[i] ?? "").trim())

    if (c[8] === "Período:" && c[9]) { periodStart = c[9]; periodEnd = c[11] }

    if (/^\d{2,}$/.test(c[0]) && c[1] && !/[/:]/.test(c[0]) && c[0] !== "0002") {
      if (mapa.has(c[0])) {
        current = mapa.get(c[0])!
      } else {
        current = { id: c[0], nome: c[1], escala: "", horario_previsto: "", dias: [] }
        mapa.set(c[0], current)
        ordem.push(c[0])
      }
      continue
    }

    if (!current) continue

    if (/^\d{4}$/.test(c[4]) && /\d{2}:\d{2}/.test(c[8])) {
      if (!current.horario_previsto) { current.escala = c[4]; current.horario_previsto = c[8] }
      continue
    }

    if (c[3].includes("Total Colaborador")) { current = null; continue }

    if (/^\d{2}\/\d{2}/.test(c[0])) {
      const marcacoes = c[2].match(/\d{2}:\d{2}/g) ?? []
      const situacoes: DiaColaborador["situacoes"] = []
      if (c[6] && c[7]) situacoes.push({ cod: c[6], desc: c[7], tempo: c[9] })
      if (!current.dias.some(d => d.data === c[0]))
        current.dias.push({ data: c[0], dia_semana: c[1], marcacoes, situacoes })
      continue
    }

    if (!c[0] && c[6] && c[7] && current.dias.length)
      current.dias[current.dias.length - 1].situacoes.push({ cod: c[6], desc: c[7], tempo: c[9] })
  }

  const colaboradores = ordem.map(id => mapa.get(id)!)
  const periodo = periodStart && periodEnd ? `${periodStart} a ${periodEnd}` : ""
  return { colaboradores, periodo, periodStart, periodEnd }
}

// ─── Geração de dados ─────────────────────────────────────────────────────────

function gerarCartaoPonto(colaboradores: Colaborador[]): RegistroPonto[] {
  const rows: RegistroPonto[] = []
  for (const colab of colaboradores) {
    for (const dia of colab.dias) {
      const calc = calcularDia(dia.marcacoes, colab.horario_previsto)
      const { cod, desc } = sitPrincipal(dia.situacoes)
      const tipo = dia.marcacoes.length
        ? "Presença Física"
        : PRESENCA_JUSTIFICADA[cod] ?? (FALTA_CODES.has(cod) || !cod ? "Falta" : desc || "—")
      rows.push({
        ID: colab.id, Nome: colab.nome, Escala: colab.escala,
        Horario_Previsto: colab.horario_previsto,
        Data: dia.data, Dia_Semana: dia.dia_semana,
        Entrada: calc.entrada, Saida_Almoco: calc.saida_almoco,
        Retorno_Almoco: calc.retorno_almoco, Saida: calc.saida,
        Qtd_Marcacoes: calc.qtd_marcacoes,
        Marcacoes_Completas: dia.marcacoes.length ? (calc.marcacoes_ok ? "SIM" : "NÃO") : "",
        Tempo_Trabalhado: minToHm(calc.trab_min),
        Intervalo_Almoco: minToHm(calc.intervalo_min),
        Hora_Extra: minToHm(calc.he_min),
        Cod_Situacao: cod, Desc_Situacao: desc, Tipo_Presenca: tipo,
      })
    }
  }
  return rows
}

function gerarAbsenteismo(colaboradores: Colaborador[], diasUteis: number): RegistroAbsenteismo[] {
  return colaboradores.map(colab => {
    let trabalhados = 0, atestado = 0, aux = 0, ferias = 0, acidente = 0, abono = 0, falta = 0
    for (const dia of colab.dias) {
      if (dia.marcacoes.length) { trabalhados++; continue }
      const { cod } = sitPrincipal(dia.situacoes)
      if      (cod === "014") atestado++
      else if (cod === "003") aux++
      else if (cod === "002") ferias++
      else if (cod === "004") acidente++
      else if (cod === "501") abono++
      else                    falta++
    }
    const total = trabalhados + atestado + aux + ferias + acidente + abono
    const pct   = diasUteis > 0 ? Math.round((total / diasUteis) * 1000) / 10 : 0
    return {
      ID: colab.id, Nome: colab.nome, Escala: colab.escala,
      Dias_Uteis_Mes: diasUteis, Dias_Trabalhados: trabalhados,
      Dias_Atestado: atestado, Dias_Auxilio_Doenca: aux, Dias_Ferias: ferias,
      Dias_Acidente_Trabalho: acidente, Dias_Abono: abono,
      Dias_Falta_Injustificada: falta, Total_Presencas: total, Pct_Presenca: `${pct}%`,
    }
  })
}

function gerarDetalhe(colaboradores: Colaborador[], grupo: "Motorista" | "Ajudante"): RegistroDetalhe[] {
  const vMar = grupo === "Motorista" ? VALOR_MARCACOES_MOT : VALOR_MARCACOES_AJU
  const vCri = grupo === "Motorista" ? VALOR_CRITERIOS_MOT : VALOR_CRITERIOS_AJU
  const rows: RegistroDetalhe[] = []
  const ultimoReg: Record<string, { data: string; saidaMin: number | null }> = {}

  const sorted = colaboradores
    .flatMap(c => c.dias.filter(d => d.marcacoes.length).map(d => ({ colab: c, dia: d })))
    .sort((a, b) => {
      const idCmp = a.colab.id.localeCompare(b.colab.id)
      return idCmp !== 0 ? idCmp : dateToOrdinal(a.dia.data) - dateToOrdinal(b.dia.data)
    })

  for (const { colab, dia } of sorted) {
    const calc = calcularDia(dia.marcacoes, colab.horario_previsto)
    const { desc } = sitPrincipal(dia.situacoes)
    const e   = calc.entrada        ? hmToMin(calc.entrada)        : null
    const sa  = calc.saida_almoco   ? hmToMin(calc.saida_almoco)   : null
    const ra  = calc.retorno_almoco ? hmToMin(calc.retorno_almoco) : null
    const s   = calc.saida          ? hmToMin(calc.saida)          : null
    const trab = calc.trab_min, alm = calc.intervalo_min
    const marcOk = calc.qtd_marcacoes
    const cumpriuMarcacoes = marcOk === 4
    const bonusMarcacoes   = cumpriuMarcacoes ? vMar : 0

    const limiteJornada  = CARGA_HORARIA_MIN + 120
    const excessoJornada = trab > 0 ? Math.max(0, trab - limiteJornada) : 0
    const cumpriuJornada = trab > 0 ? trab <= limiteJornada : false
    const he             = trab > 0 ? Math.max(0, trab - CARGA_HORARIA_MIN) : 0
    const excessoHE      = Math.max(0, he - 120)
    const cumpriuHE      = he <= 120
    const cumpriuAlmoco  = alm >= 60
    const deficitAlmoco  = Math.max(0, 60 - alm)

    let periodoManha = 0, periodoTarde = 0
    if (e !== null && sa !== null) { periodoManha = sa - e; if (periodoManha < 0) periodoManha += 1440 }
    if (ra !== null && s !== null) { periodoTarde = s - ra; if (periodoTarde < 0) periodoTarde += 1440 }
    const cumpriuIntra = Math.max(periodoManha, periodoTarde) <= 360

    let descansoMin: number | null = null, cumpriuInter = true
    const prev = ultimoReg[colab.id]
    if (prev && prev.saidaMin !== null && e !== null) {
      const diff = dateToOrdinal(dia.data) - dateToOrdinal(prev.data)
      if (diff >= 0) { descansoMin = diff * 1440 + e - prev.saidaMin; cumpriuInter = descansoMin >= INTERJORNADA_MIN }
    }
    ultimoReg[colab.id] = { data: dia.data, saidaMin: s }

    const todos5 = cumpriuJornada && cumpriuHE && cumpriuAlmoco && cumpriuIntra && cumpriuInter
    const bonusCri = todos5 ? vCri : 0

    rows.push({
      ID: colab.id, Nome: colab.nome, Dia: dia.data, Dia_Semana: dia.dia_semana,
      Entrada: calc.entrada, Saida_Almoco: calc.saida_almoco,
      Retorno_Almoco: calc.retorno_almoco, Saida: calc.saida,
      Tem_Ajuste_Manual: dia.marcacoes.some(m => m.includes("*")),
      Tempo_Trabalhado: minToHm(trab), Tempo_Almoco: minToHm(alm),
      Marcacoes_Completas: marcOk, Marcacoes_Faltantes: 4 - marcOk,
      Marcacoes_100pct: cumpriuMarcacoes, Bonus_Marcacoes: +bonusMarcacoes.toFixed(2),
      Excesso_Jornada: minToHm(excessoJornada), Jornada_OK: cumpriuJornada,
      HE_Realizada: minToHm(he), Excesso_HE: minToHm(excessoHE), HE_OK: cumpriuHE,
      Almoco_Realizado: minToHm(alm), Deficit_Almoco: minToHm(deficitAlmoco), Almoco_OK: cumpriuAlmoco,
      Periodo_Manha: minToHm(periodoManha), Periodo_Tarde: minToHm(periodoTarde), Intrajornada_OK: cumpriuIntra,
      Interjornada_Descanso: descansoMin !== null ? minToHm(descansoMin) : "", Interjornada_OK: cumpriuInter,
      Todos_5_Criterios_OK: todos5,
      Bonus_Criterios: +bonusCri.toFixed(2),
      Bonificacao_Total_Dia: +(bonusMarcacoes + bonusCri).toFixed(2),
      Desc_Situacao: desc,
    })
  }
  return rows
}

function gerarExcel(
  ponto: RegistroPonto[], absenteismo: RegistroAbsenteismo[],
  detalhe: RegistroDetalhe[], periodo: string
) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ponto),       "Cartao_Ponto")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(absenteismo), "Relatorio_Absenteismo")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe),     "Detalhe_Conformidade")
  XLSX.writeFile(wb, `Ponto_${periodo.replace(/\//g, "-").replace(/ /g, "_")}.xlsx`)
}

// ─── Sub-componentes de render (sem JSX) ─────────────────────────────────────

function dash() { return h("span", { className: "text-muted-foreground/30" }, "—") }
function okIcon(ok: boolean) {
  return h("span", { className: ok ? "text-emerald-600 font-bold" : "text-red-500 font-bold" }, ok ? "✓" : "✗")
}

function THead(headers: string[], extraClass = "px-3") {
  return h("thead", { className: "sticky top-0 z-10" },
    h("tr", {
      style: { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.9)" }
    },
      ...headers.map(hd =>
        h("th", { key: hd, className: `${extraClass} py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap text-[10px]` }, hd)
      )
    )
  )
}

function TabelaPonto({ rows }: { rows: RegistroPonto[] }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["ID","Nome","Data","Dia","Entrada","Saída Alm.","Ret. Alm.","Saída",
               "Marc.","OK?","Trab.","Intervalo","HE","Cód","Situação","Tipo Presença"]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const isFalta = r.Tipo_Presenca === "Falta"
            const isJust  = !!PRESENCA_JUSTIFICADA[r.Cod_Situacao]
            return h("tr", {
              key: i,
              className: cn("border-b transition-colors",
                isFalta ? "bg-red-50 hover:bg-red-100"
                : isJust ? "bg-emerald-50 hover:bg-emerald-100"
                : i % 2 === 0 ? "bg-background hover:bg-muted/10" : "bg-muted/5 hover:bg-muted/10")
            },
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.ID),
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px]" }, r.Nome),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Data),
              h("td", { className: "px-3 py-1.5 text-center" }, r.Dia_Semana),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Entrada || dash()),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Saida_Almoco || dash()),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Retorno_Almoco || dash()),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Saida || dash()),
              h("td", { className: "px-3 py-1.5 text-center" }, r.Qtd_Marcacoes || dash()),
              h("td", { className: "px-3 py-1.5 text-center" },
                r.Marcacoes_Completas === "SIM"
                  ? h("span", { className: "text-emerald-600 font-bold" }, "✓")
                  : r.Marcacoes_Completas === "NÃO"
                  ? h("span", { className: "text-red-500 font-bold" }, "✗")
                  : dash()
              ),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Tempo_Trabalhado || dash()),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Intervalo_Almoco || dash()),
              h("td", { className: "px-3 py-1.5 text-center font-mono" },
                r.Hora_Extra
                  ? h("span", { className: "text-amber-600 font-bold" }, r.Hora_Extra)
                  : dash()
              ),
              h("td", { className: "px-3 py-1.5 text-center font-mono text-muted-foreground" }, r.Cod_Situacao || dash()),
              h("td", { className: "px-3 py-1.5 text-left min-w-[180px] text-muted-foreground" }, r.Desc_Situacao || dash()),
              h("td", { className: "px-3 py-1.5 text-center" },
                h("span", {
                  className: cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    r.Tipo_Presenca === "Presença Física" ? "bg-blue-100 text-blue-700"
                    : isFalta ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-700")
                }, r.Tipo_Presenca)
              )
            )
          })
        )
      )
    )
  )
}

function TabelaAbsenteismo({ rows }: { rows: RegistroAbsenteismo[] }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["ID","Nome","Escala","Dias Úteis","Trabalhados",
               "Atestado","Aux. Doença","Férias","Acidente","Abono",
               "Faltas","Total Presenças","% Presença"]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const pct    = parseFloat(r.Pct_Presenca)
            const isBad  = pct < 75
            const isGood = pct >= 100
            return h("tr", {
              key: i,
              className: cn("border-b transition-colors",
                isBad  ? "bg-red-50 hover:bg-red-100"
                : isGood ? "bg-emerald-50 hover:bg-emerald-100"
                : i % 2 === 0 ? "bg-background hover:bg-muted/10" : "bg-muted/5 hover:bg-muted/10")
            },
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.ID),
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px]" }, r.Nome),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Escala),
              h("td", { className: "px-3 py-1.5 text-center font-mono" }, r.Dias_Uteis_Mes),
              h("td", { className: "px-3 py-1.5 text-center font-bold text-blue-700" }, r.Dias_Trabalhados),
              ...[r.Dias_Atestado, r.Dias_Auxilio_Doenca, r.Dias_Ferias, r.Dias_Acidente_Trabalho, r.Dias_Abono]
                .map((v, ci) => h("td", { key: ci, className: "px-3 py-1.5 text-center" },
                  v > 0 ? h("span", { className: "font-bold text-emerald-700" }, v) : dash()
                )),
              h("td", { className: "px-3 py-1.5 text-center" },
                r.Dias_Falta_Injustificada > 0
                  ? h("span", { className: "font-bold text-red-600" }, r.Dias_Falta_Injustificada)
                  : dash()
              ),
              h("td", { className: "px-3 py-1.5 text-center font-bold" }, r.Total_Presencas),
              h("td", { className: "px-3 py-1.5 text-center" },
                h("span", {
                  className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                    pct >= 100 ? "bg-emerald-100 text-emerald-700"
                    : pct >= 90 ? "bg-blue-100 text-blue-700"
                    : pct >= 75 ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700")
                }, r.Pct_Presenca)
              )
            )
          })
        )
      )
    )
  )
}

function TabelaDetalhe({ rows }: { rows: RegistroDetalhe[] }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["ID","Nome","Dia","Dia","Entrada","S.Alm","R.Alm","Saída",
               "Trab.","Almoço","Marc.","Bônus Marc.",
               "Exc.Jorn","Jorn.✓","HE","Exc.HE","HE✓",
               "Alm.✓","Intra✓","Interjorn.","Inter✓",
               "5 Crit.✓","Bônus Crit.","Total Dia","Situação"], "px-2"),
        h("tbody", {},
          ...rows.map((r, i) => {
            const ok5 = r.Todos_5_Criterios_OK
            return h("tr", {
              key: i,
              className: cn("border-b transition-colors",
                ok5 ? "bg-emerald-50 hover:bg-emerald-100"
                : r.Bonus_Marcacoes > 0 ? "bg-background hover:bg-muted/10"
                : "bg-red-50 hover:bg-red-100")
            },
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.ID),
              h("td", { className: "px-2 py-1.5 text-left font-medium min-w-[160px]" }, r.Nome),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Dia),
              h("td", { className: "px-2 py-1.5 text-center" }, r.Dia_Semana),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Entrada),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Saida_Almoco || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Retorno_Almoco || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Saida),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Tempo_Trabalhado),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.Tempo_Almoco || dash()),
              h("td", { className: "px-2 py-1.5 text-center" },
                h("span", { className: cn("font-bold", r.Marcacoes_100pct ? "text-emerald-600" : "text-red-500") },
                  `${r.Marcacoes_Completas}/4`)
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-emerald-700" },
                r.Bonus_Marcacoes > 0 ? `R$${r.Bonus_Marcacoes.toFixed(2)}` : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-amber-600" }, r.Excesso_Jornada || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(r.Jornada_OK)),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, r.HE_Realizada || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-amber-600" }, r.Excesso_HE || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(r.HE_OK)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(r.Almoco_OK)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(r.Intrajornada_OK)),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-[10px]" }, r.Interjornada_Descanso || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(r.Interjornada_OK)),
              h("td", { className: "px-2 py-1.5 text-center" },
                h("span", {
                  className: cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    ok5 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")
                }, ok5 ? "SIM" : "NÃO")
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-emerald-700" },
                r.Bonus_Criterios > 0 ? `R$${r.Bonus_Criterios.toFixed(2)}` : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" },
                `R$${r.Bonificacao_Total_Dia.toFixed(2)}`
              ),
              h("td", { className: "px-2 py-1.5 text-left text-muted-foreground min-w-[160px]" }, r.Desc_Situacao || dash())
            )
          })
        )
      )
    )
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PontoApuracaoView() {
  const [file,          setFile]          = React.useState<File | null>(null)
  const [loading,       setLoading]       = React.useState(false)
  const [error,         setError]         = React.useState<string | null>(null)
  const [periodo,       setPeriodo]       = React.useState("")
  const [colaboradores, setColaboradores] = React.useState<Colaborador[]>([])
  const [ponto,         setPonto]         = React.useState<RegistroPonto[]>([])
  const [absenteismo,   setAbsenteismo]   = React.useState<RegistroAbsenteismo[]>([])
  const [detalhe,       setDetalhe]       = React.useState<RegistroDetalhe[]>([])
  const [activeTab,     setActiveTab]     = React.useState<ActiveTab>("ponto")
  const [searchPonto,   setSearchPonto]   = React.useState("")
  const [searchAbs,     setSearchAbs]     = React.useState("")
  const [searchDetalhe, setSearchDetalhe] = React.useState("")
  const [diasUteis,     setDiasUteis]     = React.useState(0)

  const inputRef = React.useRef<HTMLInputElement>(null)

  async function processarArquivo(f: File) {
    setLoading(true); setError(null)
    setPonto([]); setAbsenteismo([]); setColaboradores([]); setDetalhe([])
    try {
      const buf  = await f.arrayBuffer()
      const nome = f.name.toLowerCase()
      let rawData: any[][]

      if (nome.endsWith(".csv")) {
        const texto = new TextDecoder("utf-8").decode(buf)
        const primeiraLinha = texto.split("\n")[0] ?? ""
        const sep = primeiraLinha.includes(";") ? ";" : primeiraLinha.includes("\t") ? "\t" : ","
        rawData = texto
          .split("\n")
          .map(linha => linha.replace(/\r$/, "").split(sep).map(v => v.trim()))
          .filter(row => row.some(v => v !== ""))
      } else {
        const wb = XLSX.read(buf, { type: "array", cellDates: false })
        rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1, blankrows: true, defval: "",
        }) as any[][]
      }

      const { colaboradores: colabs, periodo: per } = parseApuracao(rawData)
      const du  = per ? diasUteisMes(per) : 0
      const pt  = gerarCartaoPonto(colabs)
      const ab  = gerarAbsenteismo(colabs, du)
      const det = gerarDetalhe(colabs, "Motorista")

      setColaboradores(colabs); setPeriodo(per); setDiasUteis(du)
      setPonto(pt); setAbsenteismo(ab); setDetalhe(det)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleFile(f: File) { setFile(f); processarArquivo(f) }

  const pontoFiltrado = React.useMemo(() => {
    if (!searchPonto) return ponto
    const s = searchPonto.toLowerCase()
    return ponto.filter(r => r.Nome.toLowerCase().includes(s) || r.Data.includes(s) || r.Tipo_Presenca.toLowerCase().includes(s))
  }, [ponto, searchPonto])

  const absFiltrado = React.useMemo(() => {
    if (!searchAbs) return absenteismo
    const s = searchAbs.toLowerCase()
    return absenteismo.filter(r => r.Nome.toLowerCase().includes(s))
  }, [absenteismo, searchAbs])

  const detalheFiltrado = React.useMemo(() => {
    if (!searchDetalhe) return detalhe
    const s = searchDetalhe.toLowerCase()
    return detalhe.filter(r => r.Nome.toLowerCase().includes(s) || r.Dia.includes(s))
  }, [detalhe, searchDetalhe])

  const done = ponto.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  const searchValue  = activeTab === "ponto" ? searchPonto : activeTab === "detalhe" ? searchDetalhe : searchAbs
  const countLabel   = activeTab === "ponto"
    ? `${pontoFiltrado.length} / ${ponto.length} registros`
    : activeTab === "detalhe"
    ? `${detalheFiltrado.length} / ${detalhe.length} registros`
    : `${absFiltrado.length} / ${absenteismo.length} colaboradores`

  return h("div", { className: "space-y-4" },

    // ── Card Upload ──
    h(Card, { className: "shadow-sm border-border/60" },
      h(CardHeader, { className: "pb-3" },
        h(CardTitle, { className: "flex items-center gap-2 text-base" }, "Apuração de Ponto"),
        h(CardDescription, {}, "Carregue o arquivo de apuração (CSV ou XLSX) gerado pelo sistema de ponto.")
      ),
      h(CardContent, {},
        h("div", {
          onDrop: (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) },
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onClick: () => inputRef.current?.click(),
          className: cn(
            "rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors",
            file ? "border-emerald-300 bg-emerald-50" : "border-border hover:border-primary/40 hover:bg-muted/10"
          )
        },
          loading
            ? h("div", { className: "size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" })
            : file
            ? h("div", { className: "size-8 text-emerald-500 text-2xl text-center" }, "✓")
            : h("div", { className: "size-8 text-muted-foreground/40 text-2xl text-center" }, "📄"),

          h("div", { className: "text-center" },
            loading
              ? h("p", { className: "text-sm font-medium text-primary" }, "Processando...")
              : file
              ? h("div", {},
                  h("p", { className: "text-sm font-semibold text-emerald-700" }, file.name),
                  h("p", { className: "text-xs text-emerald-600 mt-0.5" },
                    `${colaboradores.length} colaboradores · ${ponto.length} registros · ${periodo}`)
                )
              : h("div", {},
                  h("p", { className: "text-sm text-muted-foreground" }, "Arraste ou clique para selecionar"),
                  h("p", { className: "text-xs text-muted-foreground/60 mt-0.5" }, "CSV ou XLSX de apuração")
                )
          ),

          done && h("div", {
            className: "flex gap-2 mt-1",
            onClick: (e: React.MouseEvent) => e.stopPropagation()
          },
            h(Button, {
              size: "sm", className: "gap-1.5 h-7 text-xs",
              onClick: () => gerarExcel(ponto, absenteismo, detalhe, periodo)
            }, "↓ Baixar Excel"),
            h(Button, {
              size: "sm", variant: "outline" as const, className: "gap-1.5 h-7 text-xs",
              onClick: () => {
                setFile(null); setPonto([]); setAbsenteismo([])
                setColaboradores([]); setPeriodo(""); setDetalhe([])
              }
            }, "✕ Limpar")
          )
        ),

        error && h("div", { className: "mt-3 flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20" },
          "⚠ " + error
        ),

        h("input", {
          ref: inputRef, type: "file", accept: ".csv,.xlsx,.xls", className: "hidden",
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0])
          }
        })
      )
    ),

    // ── Stats ──
    done && h("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3" },
      ...[
        { label: "Colaboradores",   value: colaboradores.length,                                               color: "text-primary"     },
        { label: "Registros Ponto", value: ponto.length,                                                       color: "text-blue-600"    },
        { label: "Dias Úteis/Mês",  value: diasUteis,                                                          color: "text-emerald-600" },
        { label: "Faltas Totais",   value: absenteismo.reduce((s, r) => s + r.Dias_Falta_Injustificada, 0),    color: "text-amber-600"   },
      ].map(stat =>
        h("div", { key: stat.label, className: "rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center gap-3" },
          h("div", { className: "size-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0" },
            h("span", { className: cn("text-sm font-bold", stat.color) }, "•")
          ),
          h("div", {},
            h("p", { className: cn("text-xl font-bold font-mono leading-tight", stat.color) }, stat.value),
            h("p", { className: "text-[10px] text-muted-foreground" }, stat.label)
          )
        )
      )
    ),

    // ── Abas + Tabelas ──
    done && h("div", { className: "space-y-3" },

      // Cabeçalho das abas + busca
      h("div", { className: "flex items-center gap-3 flex-wrap" },
        h("div", { className: "flex border-b border-border" },
          ...([
            { id: "ponto"       as ActiveTab, label: "Cartão de Ponto"       },
            { id: "absenteismo" as ActiveTab, label: "Relatório Absenteísmo" },
            { id: "detalhe"     as ActiveTab, label: "Detalhe Conformidade"  },
          ]).map(t =>
            h("button", {
              key: t.id,
              onClick: () => setActiveTab(t.id),
              className: cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )
            }, t.label)
          )
        ),
        h("div", { className: "flex-1 min-w-[200px] max-w-xs" },
          h("input", {
            className: "w-full h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary",
            placeholder: activeTab === "ponto" ? "Buscar nome, data, tipo..."
              : activeTab === "detalhe" ? "Buscar nome ou data..."
              : "Buscar colaborador...",
            value: searchValue,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              if (activeTab === "ponto") setSearchPonto(e.target.value)
              else if (activeTab === "detalhe") setSearchDetalhe(e.target.value)
              else setSearchAbs(e.target.value)
            }
          })
        ),
        h("span", { className: "text-[10px] text-muted-foreground font-mono ml-auto" }, countLabel)
      ),

      // Tabelas condicionais
      activeTab === "ponto"       && h(TabelaPonto,       { rows: pontoFiltrado }),
      activeTab === "absenteismo" && h(TabelaAbsenteismo, { rows: absFiltrado }),
      activeTab === "detalhe"     && h(TabelaDetalhe,     { rows: detalheFiltrado })
    )
  )
}