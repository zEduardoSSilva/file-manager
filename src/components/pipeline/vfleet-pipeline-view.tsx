"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { Upload, Truck, Download, Info, BarChart3, Table2, AlertTriangle, Loader2, FileCode, Trash2, Files, ChevronRight } from "lucide-react"
import { Button }      from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { cn }          from "@/lib/utils"
import { useToast }    from "@/hooks/use-toast"

const h = React.createElement

// ─── Constantes vFleet ────────────────────────────────────────────────────────

const BONIFICACAO_DIARIA = 4.80

const VFLEET_RULES = [
  {
    cond: "Velocidade OK",
    desc: "Zero segundos com excesso de velocidade no dia",
    valor: "critério 1/4",
    cls: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400",
  },
  {
    cond: "Curva Brusca OK",
    desc: "Nenhuma ocorrência de curva brusca registrada",
    valor: "critério 2/4",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400",
  },
  {
    cond: "Banguela OK",
    desc: "Zero segundos em marcha lenta (banguela) no dia",
    valor: "critério 3/4",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400",
  },
  {
    cond: "Motor Ocioso OK",
    desc: "Nenhum registro de veículo parado com motor ligado",
    valor: "critério 4/4",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400",
  },
  {
    cond: "4/4 = Bonificado",
    desc: "Todos os critérios atendidos no dia → bônus",
    valor: `R$\u00A0${BONIFICACAO_DIARIA.toFixed(2)}`,
    cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400",
  },
]

const TIPO_LABEL: Record<string, string> = {
  EXCESSO_VELOCIDADE:    "Excesso de Velocidade",
  CURVA_BRUSCA:          "Curva Brusca",
  FREADA_BRUSCA:         "Frenagem Brusca",
  PARADO_LIGADO:         "Motor Ocioso",
  SEM_CINTO:             "Sem Cinto",
  MANUSEIO_CELULAR:      "Uso de Celular",
  USO_CIGARRO:           "Uso de Cigarro",
  EXCESSO_RPM:           "Excesso de RPM",
  FADIGA:                "Fadiga / Sonolência",
  CAMERA_OBSTRUIDA:      "Câmera Obstruída",
  PERMANENCIA_PONTO:     "Permanência em Ponto",
  MANUTENCAO_PROGRAMADA: "Manutenção Programada",
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RegistroDia {
  Motorista: string; Placa: string; UO: string
  DataISO: string; Dia: string
  Dist_km: number; Tempo_Ignicao: string
  Exc_Velocidade_s: number; Exc_Velocidade_OK: boolean
  Curva_Brusca: number;     Curva_OK: boolean
  Banguela_s: number;       Banguela_OK: boolean
  Parado_Ligado_s: number;  Parado_OK: boolean
  Aceleracao_Brusca: number; Frenagem_Brusca: number
  Sem_Cinto: number; Uso_Celular: number; Fadiga: number; Uso_Cigarro: number
  RPM_Vermelho_s: number; Excesso_RPM_s: number
  Criterios_OK: number; Dia_Bonificado: boolean; Bonificacao: number
  Qtd_Alertas: number; Tipos_Alertas: string
}

interface RegistroResumo {
  Motorista: string; UO: string
  Dias_Ativos: number; Dias_Bonificados: number
  Total_RS: number; Pct_Desempenho: number
  Dist_km_Total: number
  Falhas_Velocidade: number; Falhas_Curva: number
  Falhas_Banguela: number; Falhas_Parado: number
  Total_Sem_Cinto: number; Total_Celular: number
  Total_Fadiga: number; Total_Alertas: number; Score_Risco: number
  _alertasTipos?: Record<string, number>
}

interface Resultado {
  cartao: RegistroDia[]
  resumo: RegistroResumo[]
  alertasPorTipo: Record<string, number>
  alertasPorMot: Map<string, Record<string, number>>
}

type ActiveTab = "resumo" | "cartao" | "ocorrencias"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSec(v: any): number {
  if (!v || v === "-" || v === "00:00:00") return 0
  const p = String(v).split(":").map(Number)
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0
}

function parseKm(v: any): number {
  if (!v || v === "-") return 0
  return parseFloat(String(v).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0
}

function parseDateIso(v: any): string {
  const s = String(v ?? "").trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return s.slice(0, 10)
  return s
}

function formatDateBR(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function normalizePlate(s: any): string {
  if (!s) return ""
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function extractName(text: any): string {
  if (!text || String(text).trim() === "" || ["#N/D", "nan", "-"].includes(String(text).trim())) return ""
  const s = String(text).trim()
  return s.replace(/[-\s]*\d{11}[-\s]*/g, "").replace(/\s*-\s*$/, "").replace(/^\s*-\s*/, "").trim()
}

function calcRisco(c: Omit<RegistroResumo, "Score_Risco">): number {
  const d = c.Dias_Ativos || 1
  let score = 0
  score += (c.Falhas_Velocidade / d) * 30
  score += (c.Falhas_Curva / d) * 20
  score += (c.Falhas_Banguela / d) * 10
  score += (c.Falhas_Parado / d) * 10
  score += Math.min(c.Total_Sem_Cinto * 5, 20)
  score += Math.min(c.Total_Celular * 8, 20)
  score += Math.min(c.Total_Fadiga * 10, 30)
  return Math.round(score)
}

// ─── Processamento ────────────────────────────────────────────────────────────

function processar(boletim: any[], entregas: any[], alertas: any[]): Resultado {
  const mapaEntregas = new Map<string, { mot: string; uo: string }>()
  for (const r of entregas) {
    const placa = normalizePlate(r["PLACA"] || r["PLACA SISTEMA"] || "")
    const data  = parseDateIso(r["DATA DE ENTREGA"] || r["DATA"] || "")
    const mot   = String(r["MOTORISTA"] || "").trim()
    const uo    = String(r["REGIÃO"] || r["FILIAL"] || "").trim()
    if (placa && data && mot) mapaEntregas.set(`${placa}|${data}`, { mot, uo })
  }

  const alertasPorChave   = new Map<string, string[]>()
  const alertasPorMotData = new Map<string, number>()
  const alertasPorMot     = new Map<string, Record<string, number>>()
  const alertasPorTipo: Record<string, number> = {}

  for (const r of alertas) {
    const placa = normalizePlate(r["PLACA"] || "")
    const data  = parseDateIso(r["DATA"] || "")
    const tipo  = String(r["TIPO"] || "").trim()
    let   mot   = String(r["MOTORISTA"] || "").trim()

    if (!mot || /sem identif/i.test(mot)) {
      const found = mapaEntregas.get(`${placa}|${data}`)
      if (found) mot = found.mot
    }

    const chPl = `${placa}|${data}`
    if (!alertasPorChave.has(chPl)) alertasPorChave.set(chPl, [])
    alertasPorChave.get(chPl)!.push(tipo)
    alertasPorTipo[tipo] = (alertasPorTipo[tipo] || 0) + 1

    if (mot && !/sem identif/i.test(mot)) {
      const chMot = `${mot}|${data}`
      alertasPorMotData.set(chMot, (alertasPorMotData.get(chMot) || 0) + 1)
      if (!alertasPorMot.has(mot)) alertasPorMot.set(mot, {})
      alertasPorMot.get(mot)![tipo] = (alertasPorMot.get(mot)![tipo] || 0) + 1
    }
  }

  const ativos = boletim.filter(r =>
    parseKm(r["DISTÂNCIA PERCORRIDA"]) > 0 || parseSec(r["TEMPO IGNIÇÃO LIGADA"]) > 0
  )

  const cartao: RegistroDia[] = []

  for (const r of ativos) {
    let nome = extractName(r["MOTORISTAS"] || r["MOTORISTA"] || r["MOTORISTA_NOME"] || "")
    const placa   = normalizePlate(r["PLACA"] || "")
    const dataIso = parseDateIso(r["DIA"] || r["DATA"] || "")

    if (!nome && placa && dataIso) {
      nome = mapaEntregas.get(`${placa}|${dataIso}`)?.mot || ""
    }
    if (!nome) continue

    const uo = String(r["UO"] || "").trim() || mapaEntregas.get(`${placa}|${dataIso}`)?.uo || ""

    const excVelSec = parseSec(r["EXCESSO DE VELOCIDADE"])
    const curvaN    = parseInt(String(r["CURVA BRUSCA"] ?? 0)) || 0
    const banguSec  = parseSec(r["BANGUELA"])
    const paradoSec = parseSec(r["PARADO LIGADO"])
    const acelN     = parseInt(String(r["ACELERAÇÃO BRUSCA"] ?? 0)) || 0
    const frenN     = parseInt(String(r["FRENAGEM BRUSCA"] ?? 0)) || 0
    const cintN     = parseInt(String(r["SEM CINTO"] ?? 0)) || 0
    const celN      = parseInt(String(r["USO DE CELULAR"] ?? 0)) || 0
    const fadN      = parseInt(String(r["FADIGA"] ?? 0)) || 0
    const cigarN    = parseInt(String(r["USO DE CIGARRO"] ?? 0)) || 0
    const rpmVermSec = parseSec(r["RPM VERMELHO"])
    const exRPMSec   = parseSec(r["EXCESSO DE RPM"])
    const distN      = parseKm(r["DISTÂNCIA PERCORRIDA"])

    const cVel   = excVelSec === 0
    const cCurva = curvaN    === 0
    const cBang  = banguSec  === 0
    const cPar   = paradoSec === 0
    const critOK = (cVel ? 1 : 0) + (cCurva ? 1 : 0) + (cBang ? 1 : 0) + (cPar ? 1 : 0)
    const bonif  = critOK === 4 ? BONIFICACAO_DIARIA : 0

    const alertasDia = alertasPorChave.get(`${placa}|${dataIso}`) || []
    const alertasMot = alertasPorMotData.get(`${nome}|${dataIso}`) || 0
    const totalAlDia = Math.max(alertasDia.length, alertasMot)

    cartao.push({
      Motorista: nome, Placa: placa, UO: uo,
      DataISO: dataIso, Dia: formatDateBR(dataIso),
      Dist_km: distN,
      Tempo_Ignicao: String(r["TEMPO IGNIÇÃO LIGADA"] || "00:00:00"),
      Exc_Velocidade_s: excVelSec, Exc_Velocidade_OK: cVel,
      Curva_Brusca: curvaN, Curva_OK: cCurva,
      Banguela_s: banguSec, Banguela_OK: cBang,
      Parado_Ligado_s: paradoSec, Parado_OK: cPar,
      Aceleracao_Brusca: acelN, Frenagem_Brusca: frenN,
      Sem_Cinto: cintN, Uso_Celular: celN, Fadiga: fadN, Uso_Cigarro: cigarN,
      RPM_Vermelho_s: rpmVermSec, Excesso_RPM_s: exRPMSec,
      Criterios_OK: critOK, Dia_Bonificado: critOK === 4, Bonificacao: bonif,
      Qtd_Alertas: totalAlDia,
      Tipos_Alertas: [...new Set(alertasDia)].join(", "),
    })
  }

  const porMot = new Map<string, any>()
  for (const d of cartao) {
    if (!porMot.has(d.Motorista)) {
      porMot.set(d.Motorista, {
        Motorista: d.Motorista, UO: d.UO,
        Dias_Ativos: 0, Dias_Bonificados: 0, Total_RS: 0,
        Dist_km_Total: 0, Falhas_Velocidade: 0, Falhas_Curva: 0,
        Falhas_Banguela: 0, Falhas_Parado: 0,
        Total_Sem_Cinto: 0, Total_Celular: 0, Total_Fadiga: 0, Total_Alertas: 0,
      })
    }
    const c = porMot.get(d.Motorista)!
    c.Dias_Ativos++
    if (d.Dia_Bonificado) c.Dias_Bonificados++
    c.Total_RS        += d.Bonificacao
    c.Dist_km_Total   += d.Dist_km
    if (!d.Exc_Velocidade_OK) c.Falhas_Velocidade++
    if (!d.Curva_OK)          c.Falhas_Curva++
    if (!d.Banguela_OK)       c.Falhas_Banguela++
    if (!d.Parado_OK)         c.Falhas_Parado++
    c.Total_Sem_Cinto += d.Sem_Cinto
    c.Total_Celular   += d.Uso_Celular
    c.Total_Fadiga    += d.Fadiga
    c.Total_Alertas   += d.Qtd_Alertas
  }

  const resumo: RegistroResumo[] = Array.from(porMot.values())
    .map(c => ({
      ...c,
      Total_RS:       +c.Total_RS.toFixed(2),
      Dist_km_Total:  +c.Dist_km_Total.toFixed(1),
      Pct_Desempenho: c.Dias_Ativos > 0
        ? +(c.Dias_Bonificados / c.Dias_Ativos * 100).toFixed(1) : 0,
      Score_Risco: calcRisco(c),
      _alertasTipos: alertasPorMot.get(c.Motorista),
    }))
    .sort((a: RegistroResumo, b: RegistroResumo) => b.Pct_Desempenho - a.Pct_Desempenho)

  return { cartao, resumo, alertasPorTipo, alertasPorMot }
}

// ─── Excel ────────────────────────────────────────────────────────────────────

function gerarExcel(cartao: RegistroDia[], resumo: RegistroResumo[]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo.map(r => ({
    "Motorista": r.Motorista, "UO": r.UO,
    "Dias Ativos": r.Dias_Ativos, "Dias Bonificados": r.Dias_Bonificados,
    "Total Bonificação (R$)": r.Total_RS, "% Desempenho": r.Pct_Desempenho,
    "Distância Total (km)": r.Dist_km_Total,
    "Falhas Velocidade": r.Falhas_Velocidade, "Falhas Curva": r.Falhas_Curva,
    "Falhas Banguela": r.Falhas_Banguela, "Falhas Ociosidade": r.Falhas_Parado,
    "Total Sem Cinto": r.Total_Sem_Cinto, "Total Celular": r.Total_Celular,
    "Total Fadiga": r.Total_Fadiga, "Total Alertas": r.Total_Alertas,
    "Score Risco": r.Score_Risco,
  }))), "Resumo_Motorista")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cartao.map(d => ({
    "Motorista": d.Motorista, "Placa": d.Placa, "UO": d.UO, "Dia": d.Dia,
    "Distância (km)": d.Dist_km, "Tempo Ignição": d.Tempo_Ignicao,
    "Exc. Velocidade (s)": d.Exc_Velocidade_s, "✓ Velocidade OK": d.Exc_Velocidade_OK,
    "Curva Brusca": d.Curva_Brusca, "✓ Curva OK": d.Curva_OK,
    "Banguela (s)": d.Banguela_s, "✓ Banguela OK": d.Banguela_OK,
    "Parado Ligado (s)": d.Parado_Ligado_s, "✓ Parado OK": d.Parado_OK,
    "Critérios OK (4)": d.Criterios_OK, "Dia Bonificado": d.Dia_Bonificado,
    "Bonificação (R$)": d.Bonificacao,
    "Aceleração Brusca": d.Aceleracao_Brusca, "Frenagem Brusca": d.Frenagem_Brusca,
    "Sem Cinto": d.Sem_Cinto, "Celular": d.Uso_Celular, "Fadiga": d.Fadiga,
    "Qtd. Alertas": d.Qtd_Alertas, "Tipos Alertas": d.Tipos_Alertas,
  }))), "Cartao_Diario")
  const now = new Date()
  XLSX.writeFile(wb, `Desempenho_Motoristas_${now.getDate().toString().padStart(2, "0")}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getFullYear()}.xlsx`)
}

// ─── Helpers render ───────────────────────────────────────────────────────────

function dash() { return h("span", { className: "text-muted-foreground/30" }, "—") }

function okIcon(ok: boolean) {
  return h("span", { className: ok ? "text-emerald-600 font-bold" : "text-red-500 font-bold" }, ok ? "✓" : "✗")
}

function numBadge(n: number, color: "red" | "amber" = "red") {
  if (!n) return dash()
  return h("span", { className: cn("font-bold font-mono", color === "amber" ? "text-amber-600" : "text-red-500") }, n)
}

function pctBadge(pct: number) {
  return h("span", {
    className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
      pct >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      : pct >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400")
  }, `${pct}%`)
}

function riscoBadge(score: number) {
  if (score >= 60) return h("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" }, "ALTO")
  if (score >= 30) return h("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" }, "MÉDIO")
  return h("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" }, "BAIXO")
}

function THead(headers: string[]) {
  return h("thead", { className: "sticky top-0 z-10" },
    h("tr", {
      style: { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.9)" }
    },
      ...headers.map((hd, i) =>
        h("th", { key: `${hd}-${i}`, className: "px-2 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap text-[10px]" }, hd)
      )
    )
  )
}

// ─── Tabela Resumo ────────────────────────────────────────────────────────────

function TabelaResumo({ rows }: { rows: RegistroResumo[] }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["Motorista", "UO", "Dias", "Bonif.", "Total R$", "% Desempenho",
               "F.Vel.", "F.Curva", "F.Bang.", "F.Ociosidade",
               "Dist. km", "Sem Cinto", "Celular", "Fadiga", "Alertas", "Risco"]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const pct = r.Pct_Desempenho
            return h("tr", {
              key: i,
              className: cn("border-b transition-colors",
                pct >= 80 ? "bg-background hover:bg-muted/10"
                : pct >= 50 ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                : "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20")
            },
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px]" }, r.Motorista),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground max-w-[80px] truncate" }, r.UO || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-bold text-blue-600" }, r.Dias_Ativos),
              h("td", { className: "px-2 py-1.5 text-center font-bold text-emerald-600" }, r.Dias_Bonificados),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" }, `R$\u00A0${r.Total_RS.toFixed(2)}`),
              h("td", { className: "px-2 py-1.5 text-center" }, pctBadge(pct)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Falhas_Velocidade)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Falhas_Curva)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Falhas_Banguela)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Falhas_Parado)),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.Dist_km_Total.toFixed(0)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Total_Sem_Cinto, "amber")),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Total_Celular, "amber")),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(r.Total_Fadiga)),
              h("td", { className: "px-2 py-1.5 text-center" },
                r.Total_Alertas > 0
                  ? h("span", { className: "font-bold text-amber-600 font-mono" }, r.Total_Alertas)
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, riscoBadge(r.Score_Risco))
            )
          })
        )
      )
    )
  )
}

// ─── Tabela Cartão Diário ─────────────────────────────────────────────────────

function TabelaCartao({ rows }: { rows: RegistroDia[] }) {
  const sorted = React.useMemo(() =>
    [...rows].sort((a, b) => a.DataISO.localeCompare(b.DataISO) || a.Motorista.localeCompare(b.Motorista)),
    [rows]
  )
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["Motorista", "Placa", "Data", "Dist.km", "Ignição",
               "Vel✓", "Curva✓", "Bang✓", "Parado✓",
               "Crit.", "Bonif?", "R$",
               "Ac.Brusca", "Fren.Brusca", "Sem Cinto", "Celular", "Fadiga", "Alertas"]),
        h("tbody", {},
          ...sorted.map((d, i) => {
            const critColor = d.Criterios_OK === 4 ? "text-emerald-600"
              : d.Criterios_OK >= 3 ? "text-amber-600" : "text-red-500"
            return h("tr", {
              key: i,
              className: cn("border-b transition-colors",
                d.Dia_Bonificado ? "bg-background hover:bg-muted/10"
                : d.Criterios_OK >= 3 ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                : "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20")
            },
              h("td", { className: "px-2 py-1.5 text-left font-medium min-w-[160px]" }, d.Motorista),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-[10px]" }, d.Placa),
              h("td", { className: "px-2 py-1.5 text-center font-mono whitespace-nowrap" }, d.Dia),
              h("td", { className: "px-2 py-1.5 text-center font-mono" }, d.Dist_km.toFixed(0)),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-[10px]" }, d.Tempo_Ignicao || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.Exc_Velocidade_OK)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.Curva_OK)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.Banguela_OK)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.Parado_OK)),
              h("td", { className: "px-2 py-1.5 text-center" },
                h("span", { className: cn("font-bold font-mono", critColor) }, `${d.Criterios_OK}/4`)
              ),
              h("td", { className: "px-2 py-1.5 text-center" },
                h("span", {
                  className: cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    d.Dia_Bonificado
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400")
                }, d.Dia_Bonificado ? "SIM" : "NÃO")
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" },
                d.Bonificacao > 0 ? `R$\u00A0${d.Bonificacao.toFixed(2)}` : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(d.Aceleracao_Brusca, "amber")),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(d.Frenagem_Brusca, "amber")),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(d.Sem_Cinto, "amber")),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(d.Uso_Celular)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBadge(d.Fadiga)),
              h("td", { className: "px-2 py-1.5 text-center" },
                d.Qtd_Alertas > 0
                  ? h("span", { className: "font-bold text-amber-600 font-mono", title: d.Tipos_Alertas }, d.Qtd_Alertas)
                  : dash()
              )
            )
          })
        )
      )
    )
  )
}

// ─── Aba Ocorrências ──────────────────────────────────────────────────────────

function AbaOcorrencias({ resultado }: { resultado: Resultado }) {
  const { resumo, alertasPorTipo, alertasPorMot } = resultado

  const tiposOrd  = Object.entries(alertasPorTipo).sort((a, b) => b[1] - a[1])
  const maxTipo   = tiposOrd[0]?.[1] || 1
  const topAlMot  = [...resumo].sort((a, b) => b.Total_Alertas - a.Total_Alertas).slice(0, 8).filter(r => r.Total_Alertas > 0)
  const maxAlMot  = topAlMot[0]?.Total_Alertas || 1
  const topVel    = [...resumo].filter(r => r.Falhas_Velocidade > 0).sort((a, b) => b.Falhas_Velocidade - a.Falhas_Velocidade).slice(0, 8)
  const maxVel    = topVel[0]?.Falhas_Velocidade || 1
  const topDist   = [...resumo].sort((a, b) => b.Dist_km_Total - a.Dist_km_Total).slice(0, 8)
  const maxDist   = topDist[0]?.Dist_km_Total || 1
  const zeroBonif = resumo.filter(r => r.Dias_Bonificados === 0 && r.Dias_Ativos >= 3)
  const highRisk  = resumo.filter(r => r.Score_Risco >= 60)
  const medRisk   = resumo.filter(r => r.Score_Risco >= 30 && r.Score_Risco < 60)
  const totalKm   = resumo.reduce((s, r) => s + r.Dist_km_Total, 0)

  function OcRow({ label, val, max, colorClass }: { label: string; val: number | string; max: number; colorClass: string }) {
    const n   = typeof val === "string" ? parseFloat(val) : val
    const pct = max > 0 ? Math.min((n / max) * 100, 100) : 0
    return h("div", { className: "flex items-center gap-3 px-4 py-2 border-b border-border/60 last:border-b-0" },
      h("div", { className: "flex-1 text-[11px] font-medium truncate" }, label),
      h("div", { className: "w-20 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0" },
        h("div", { className: cn("h-full rounded-full", colorClass), style: { width: `${pct}%` } })
      ),
      h("div", { className: cn("text-[11px] font-bold font-mono w-8 text-right", colorClass.replace("bg-", "text-")) }, val)
    )
  }

  function OcCard({ title, badge, badgeClass, children }: { title: string; badge?: string | number; badgeClass?: string; children: React.ReactNode }) {
    return h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-2.5 border-b border-border/60 bg-muted/10 flex items-center justify-between" },
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, title),
        badge != null && h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full", badgeClass || "bg-muted text-muted-foreground") }, badge)
      ),
      children
    )
  }

  return h("div", { className: "space-y-4" },
    (highRisk.length > 0 || medRisk.length > 0) && h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-2.5 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
        h(AlertTriangle, { className: "size-3 text-amber-500" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Matriz de Risco — Requer Atenção Imediata"),
      ),
      h("div", { className: "p-3 flex flex-wrap gap-2" },
        ...highRisk.map((r, i) =>
          h("div", { key: i, className: "flex items-center gap-2 border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 rounded-lg px-3 py-2 min-w-[200px] flex-1" },
            h("span", { className: "text-sm" }, "🔴"),
            h("div", {},
              h("div", { className: "text-[11px] font-semibold leading-tight" }, r.Motorista),
              h("div", { className: "text-[10px] text-muted-foreground" },
                `Score ${r.Score_Risco} · Vel:${r.Falhas_Velocidade} Cinto:${r.Total_Sem_Cinto} Cel:${r.Total_Celular}`)
            )
          )
        ),
        ...medRisk.map((r, i) =>
          h("div", { key: i, className: "flex items-center gap-2 border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 rounded-lg px-3 py-2 min-w-[200px] flex-1" },
            h("span", { className: "text-sm" }, "🟡"),
            h("div", {},
              h("div", { className: "text-[11px] font-semibold leading-tight" }, r.Motorista),
              h("div", { className: "text-[10px] text-muted-foreground" },
                `Score ${r.Score_Risco} · ${r.Falhas_Velocidade + r.Falhas_Curva + r.Falhas_Banguela + r.Falhas_Parado} falhas nos 4 critérios`)
            )
          )
        )
      )
    ),

    h("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
      h(OcCard as any, {
        title: "Ocorrências por Tipo de Alerta",
        badge: tiposOrd.reduce((s, [, v]) => s + v, 0) + " total",
        badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      },
        h("div", {},
          tiposOrd.length === 0
            ? h("div", { className: "px-4 py-6 text-center text-[11px] text-muted-foreground" }, "Nenhum alerta no período.")
            : tiposOrd.map(([tipo, qtd], i) =>
                h(OcRow as any, { key: i, label: TIPO_LABEL[tipo] || tipo.replace(/_/g, " "), val: qtd, max: maxTipo, colorClass: "bg-amber-500" })
              )
        )
      ),
      h(OcCard as any, {
        title: "Motoristas com Mais Alertas",
        badge: topAlMot.length,
        badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      },
        h("div", {},
          topAlMot.length === 0
            ? h("div", { className: "px-4 py-6 text-center text-[11px] text-muted-foreground" }, "Nenhum alerta registrado.")
            : topAlMot.map((r, i) =>
                h(OcRow as any, { key: i, label: r.Motorista, val: r.Total_Alertas, max: maxAlMot, colorClass: "bg-amber-500" })
              )
        )
      ),
      h(OcCard as any, {
        title: "Falhas de Velocidade por Motorista",
        badge: topVel.length,
        badgeClass: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      },
        h("div", {},
          topVel.length === 0
            ? h("div", { className: "px-4 py-6 text-center text-[11px] text-emerald-600 font-medium" }, "✓ Nenhuma falha de velocidade.")
            : topVel.map((r, i) =>
                h(OcRow as any, { key: i, label: r.Motorista, val: r.Falhas_Velocidade, max: maxVel, colorClass: "bg-red-500" })
              )
        )
      ),
      h(OcCard as any, {
        title: "Distância Percorrida por Motorista (km)",
        badge: `${totalKm.toFixed(0)} km`,
        badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
      },
        h("div", {},
          topDist.map((r, i) =>
            h(OcRow as any, { key: i, label: r.Motorista, val: r.Dist_km_Total.toFixed(0), max: maxDist, colorClass: "bg-blue-500" })
          )
        )
      ),
    ),

    zeroBonif.length > 0 && h(OcCard as any, {
      title: "Motoristas Sem Nenhum Dia Bonificado",
      badge: zeroBonif.length,
      badgeClass: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
    },
      h("div", {},
        zeroBonif.map((r, i) =>
          h("div", { key: i, className: "flex items-center gap-3 px-4 py-2 border-b border-border/60 last:border-b-0" },
            h("div", { className: "flex-1 text-[11px] font-medium" }, r.Motorista),
            h("div", { className: "text-[10px] text-muted-foreground font-mono" },
              `${r.Dias_Ativos} dias · F.Vel:${r.Falhas_Velocidade} F.Curva:${r.Falhas_Curva} F.Bang:${r.Falhas_Banguela} F.Ocio:${r.Falhas_Parado}`
            ),
            h("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" }, "R$\u00A00,00")
          )
        )
      )
    ),

    alertasPorMot.size > 0 && h(OcCard as any, {
      title: "Detalhamento de Alertas por Motorista",
      badge: alertasPorMot.size,
      badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
    },
      h("div", {},
        [...alertasPorMot.entries()]
          .sort((a, b) =>
            Object.values(b[1]).reduce((s, v) => s + v, 0) -
            Object.values(a[1]).reduce((s, v) => s + v, 0)
          )
          .map(([mot, tipos], i) => {
            const total = Object.values(tipos).reduce((s, v) => s + v, 0)
            const tiposStr = Object.entries(tipos)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => `${TIPO_LABEL[t] || t}: ${n}`)
              .join(" · ")
            return h("div", { key: i, className: "flex items-center gap-3 px-4 py-2 border-b border-border/60 last:border-b-0" },
              h("div", { className: "text-[11px] font-medium min-w-[160px]" }, mot),
              h("div", { className: "flex-1 text-[10px] text-muted-foreground truncate" }, tiposStr),
              h("span", { className: "font-bold font-mono text-amber-600 flex-shrink-0" }, total)
            )
          })
      )
    )
  )
}

// ─── KPI cards ────────────────────────────────────────────────────────────────

function KpiGrid({ resultado }: { resultado: Resultado }) {
  const { cartao, resumo } = resultado
  const totalRS   = resumo.reduce((s, r) => s + r.Total_RS, 0)
  const totalDias = cartao.length
  const diasBonif = cartao.filter(d => d.Dia_Bonificado).length
  const totalAl   = resumo.reduce((s, r) => s + r.Total_Alertas, 0)
  const semCintoT = resumo.reduce((s, r) => s + r.Total_Sem_Cinto, 0)
  const celularT  = resumo.reduce((s, r) => s + r.Total_Celular, 0)

  const items = [
    { label: "Motoristas",        value: resumo.length,                       extra: undefined,   colorClass: "text-primary"     },
    { label: "Dias Analisados",   value: totalDias,                           extra: undefined,   colorClass: "text-blue-600"    },
    { label: "Dias Bonificados",  value: diasBonif,                           extra: `/ ${totalDias}`, colorClass: "text-emerald-600" },
    { label: "Total Bonificação", value: `R$\u00A0${totalRS.toFixed(2)}`,     extra: undefined,   colorClass: "text-primary"     },
    { label: "Total Alertas",     value: totalAl,                             extra: undefined,   colorClass: "text-amber-600"   },
    { label: "Sem Cinto + Celular", value: semCintoT + celularT,              extra: undefined,   colorClass: "text-red-500"     },
  ]

  return h("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" },
    ...items.map((kpi, i) =>
      h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-4 py-3" },
        h("p", { className: cn("text-lg font-bold font-mono leading-tight", kpi.colorClass) },
          kpi.value,
          kpi.extra && h("span", { className: "text-sm text-muted-foreground" }, kpi.extra)
        ),
        h("p", { className: "text-[10px] text-muted-foreground mt-0.5" }, kpi.label)
      )
    )
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function VFleetPipelineView() {
  const [files, setFiles]         = React.useState<{ data: any[]; nome: string; tipo: "boletim" | "entregas" | "alertas" }[]>([])
  const [loading, setLoading]     = React.useState(false)
  const [resultado, setResultado] = React.useState<Resultado | null>(null)
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("resumo")
  const [search, setSearch]       = React.useState("")
  const { toast }                 = useToast()

  function detectarTipo(nome: string): "boletim" | "entregas" | "alertas" {
    const n = nome.toLowerCase()
    if (/alerta/i.test(n))                                          return "alertas"
    if (/entrega|controle|logistic|consolidado/i.test(n))          return "entregas"
    return "boletim"
  }

  async function lerArquivo(file: File) {
    const nome = file.name.toLowerCase()
    if (nome.endsWith(".json")) {
      const text = await file.text()
      const raw  = JSON.parse(text)
      return Array.isArray(raw) ? raw : Object.values(raw as Record<string, any[]>).flat()
    } else {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: "array", cellDates: false })
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    for (const file of Array.from(e.target.files || [])) {
      try {
        const data = await lerArquivo(file)
        const tipo = detectarTipo(file.name)
        setFiles(prev => [...prev, { data, nome: file.name, tipo }])
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro ao ler arquivo", description: `${file.name}: ${err.message}` })
      }
    }
    e.target.value = ""
  }

  function analisar() {
    setLoading(true); setResultado(null)
    setTimeout(() => {
      try {
        const boletim  = files.filter(f => f.tipo === "boletim").flatMap(f => f.data)
        const entregas = files.filter(f => f.tipo === "entregas").flatMap(f => f.data)
        const alertas  = files.filter(f => f.tipo === "alertas").flatMap(f => f.data)
        if (!boletim.length) throw new Error("Nenhum Boletim do Veículo encontrado.")
        const res = processar(boletim, entregas, alertas)
        setResultado(res)
        toast({ title: "Análise concluída", description: `${res.resumo.length} motoristas · ${res.cartao.length} dias analisados` })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro na análise", description: err.message })
      } finally { setLoading(false) }
    }, 60)
  }

  const q = search.toLowerCase()
  const resumoFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.resumo || []) : resultado.resumo.filter(r => r.Motorista.toLowerCase().includes(q)),
    [resultado, search]
  )
  const cartaoFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.cartao || []) : resultado.cartao.filter(d =>
      d.Motorista.toLowerCase().includes(q) || d.Placa.toLowerCase().includes(q) || d.Dia.includes(q)
    ),
    [resultado, search]
  )

  const countLabel = activeTab === "cartao"
    ? `${cartaoFilt.length} / ${resultado?.cartao.length || 0} dias`
    : `${resumoFilt.length} / ${resultado?.resumo.length || 0} motoristas`

  const tipoTag: Record<string, string> = {
    boletim:  "bg-primary/10 text-primary",
    entregas: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    alertas:  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  }
  const tipoNome: Record<string, string> = { boletim: "Boletim", entregas: "Entregas", alertas: "Alertas" }

  return h("div", { className: "space-y-6" },

    // ── Banner correto do vFleet
    h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-start gap-3" },
      h(Info, { className: "size-4 text-primary shrink-0 mt-0.5" }),
      h("div", { className: "text-sm text-muted-foreground" },
        h("span", { className: "font-semibold text-foreground" }, "Análise de Desempenho vFleet "),
        "— Avalia ",
        h("strong", {}, "Velocidade · Curva Brusca · Banguela · Motor Ocioso"),
        `. R$\u00A0${BONIFICACAO_DIARIA.toFixed(2)} por dia com os 4 critérios OK. `,
        "Carregue o Boletim do Veículo, opcionalmente o Relatório de Entregas e o Histórico de Alertas."
      )
    ),

    // ── Upload
    h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
        h(Truck, { className: "size-4 text-primary" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Arquivos de Entrada"),
      ),
      h("div", { className: "p-4 space-y-4" },

        // Zona de drop
        h("div", {
          className: cn(
            "border-2 border-dashed rounded-xl bg-muted/10 min-h-[110px] flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
            "hover:border-primary/40 hover:bg-muted/20"
          ),
          onClick: () => document.getElementById("vfleet-files-input")?.click()
        },
          h("input", { id: "vfleet-files-input", type: "file", multiple: true, className: "hidden", onChange: handleFileChange }),
          files.length === 0
            ? h("div", { className: "text-center space-y-1.5" },
                h(Files, { className: "size-8 mx-auto opacity-20" }),
                h("p", { className: "text-xs text-muted-foreground italic" }, "Boletim_do_Veiculo · Relatorio_Entregas · Historico_Alertas"),
                h("p", { className: "text-[10px] text-muted-foreground/60" }, "XLSX, XLS ou JSON · clique para selecionar")
              )
            : h("div", { className: "w-full space-y-1.5" },
                ...files.map((f, idx) =>
                  h("div", { key: idx, className: "flex items-center gap-2 bg-background px-3 py-2 rounded-lg border text-xs" },
                    h(FileCode, { className: "size-3 text-muted-foreground shrink-0" }),
                    h("span", { className: cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", tipoTag[f.tipo]) }, tipoNome[f.tipo]),
                    h("span", { className: "truncate flex-1 font-medium" }, f.nome),
                    h("span", { className: "text-[10px] text-muted-foreground font-mono" }, `${f.data.length} linhas`),
                    h(Button, {
                      variant: "ghost" as const, size: "icon" as const, className: "size-6 shrink-0",
                      onClick: (e: React.MouseEvent) => { e.stopPropagation(); setFiles(files.filter((_, i) => i !== idx)) }
                    }, h(Trash2, { className: "size-3 text-destructive/70" }))
                  )
                ),
                h("div", { className: "flex items-center gap-2 pt-1 text-[10px] text-muted-foreground" },
                  h(Upload, { className: "size-3" }),
                  "Clique para adicionar mais arquivos"
                )
              )
        ),

        // ── Régua dos 4 critérios vFleet
        h("div", { className: "grid grid-cols-5 gap-1.5" },
          ...VFLEET_RULES.map((rule, i) =>
            h("div", { key: i, className: cn("flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px]", rule.cls) },
              h(ChevronRight, { className: "size-3 shrink-0 opacity-60 mt-0.5" }),
              h("div", { className: "flex-1 min-w-0" },
                h("div", { className: "font-semibold text-[10px] leading-tight" }, rule.cond),
                h("div", { className: "leading-tight opacity-75 mt-0.5" }, rule.desc),
                h("div", { className: "mt-1 font-bold text-[10px]" }, rule.valor)
              )
            )
          )
        ),

        // Botões
        h("div", { className: "flex gap-2" },
          h(Button, {
            className: "flex-1 h-9 text-xs font-semibold shadow-sm",
            onClick: analisar,
            disabled: loading || files.filter(f => f.tipo === "boletim").length === 0
          },
            loading
              ? h(React.Fragment, {}, h(Loader2, { className: "mr-1.5 size-3.5 animate-spin" }), "Processando...")
              : h(React.Fragment, {}, h(BarChart3, { className: "mr-1.5 size-3.5" }), "Analisar Desempenho")
          ),
          resultado && h(Button, {
            variant: "outline" as const, size: "sm" as const, className: "h-9 text-xs gap-1.5",
            onClick: () => gerarExcel(resultado.cartao, resultado.resumo)
          }, h(Download, { className: "size-3.5" }), "Excel"),
        )
      )
    ),

    // ── Resultado
    resultado && h("div", { className: "space-y-4" },
      h(KpiGrid as any, { resultado }),

      h("div", { className: "flex items-center gap-3 flex-wrap" },
        h("div", { className: "flex border-b border-border" },
          ...(([
            { id: "resumo"      as ActiveTab, label: "Resumo por Motorista",  icon: BarChart3     },
            { id: "cartao"      as ActiveTab, label: "Cartão Diário",          icon: Table2        },
            { id: "ocorrencias" as ActiveTab, label: "Análise de Ocorrências", icon: AlertTriangle },
          ] as const).map(t =>
            h("button", {
              key: t.id,
              onClick: () => { setActiveTab(t.id); setSearch("") },
              className: cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )
            }, h(t.icon, { className: "size-3.5" }), t.label)
          ))
        ),
        activeTab !== "ocorrencias" && h(React.Fragment, {},
          h("input", {
            className: "flex-1 min-w-[200px] max-w-xs h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary",
            placeholder: activeTab === "cartao" ? "Buscar motorista, placa, data..." : "Buscar motorista...",
            value: search,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)
          }),
          h("span", { className: "text-[10px] text-muted-foreground font-mono ml-auto" }, countLabel)
        )
      ),

      activeTab === "resumo"
        ? h(TabelaResumo, { rows: resumoFilt })
        : activeTab === "cartao"
        ? h(TabelaCartao, { rows: cartaoFilt })
        : h(AbaOcorrencias, { resultado })
    )
  )
}