"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { Upload, Zap, Download, Info, BarChart3, Table2, AlertTriangle, Loader2, FileCode, Trash2, ChevronRight, Users, TrendingUp, Package, Filter, X } from "lucide-react"
import { Button }      from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { cn }          from "@/lib/utils"
import { useToast }    from "@/hooks/use-toast"

const h = React.createElement

// ─── Constantes ───────────────────────────────────────────────────────────────

const VALOR_MOT  = 8.00
const VALOR_AJUD = 7.20
const CRITERIOS  = 4

const MIN_RAIO  = 70.0
const MIN_SLA   = 80.0
const MIN_TEMPO = 100.0
const MIN_SEQ   = 0.0

const RULES = [
  { cond: "4/4 critérios",  mot: "R$ 8,00",  ajud: "R$ 7,20",  cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400" },
  { cond: "3/4 critérios",  mot: "R$ 6,00",  ajud: "R$ 5,40",  cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400" },
  { cond: "2/4 critérios",  mot: "R$ 4,00",  ajud: "R$ 3,60",  cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400" },
  { cond: "1/4 critério",   mot: "R$ 2,00",  ajud: "R$ 1,80",  cls: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-400" },
  { cond: "0/4 critérios",  mot: "R$ 0,00",  ajud: "R$ 0,00",  cls: "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400" },
]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiasColaborador {
  colaborador: string; empresa: string; cargo: string; operacao: string; data: string
  totalPedidos: number; pesoDia: number
  pesoDevolvido: number        // total bruto
  pesoDevFiltrado: number      // após excluir ocorrências desmarcadas
  ocorrencias: { descricao: string; peso: number }[]  // lista de ocorrências do dia
  pRaio: number; pSLA: number; pTempo: number; pSeq: number
  cRaio: boolean; cSLA: boolean; cTempo: boolean; cSeq: boolean
  cumpridos: number; bonif: number
}

interface ResumoColaborador {
  colaborador: string; empresa: string; cargo: string; operacao: string
  dias: number; diasMax: number; pct: number; bonif: number
  fRaio: number; fSLA: number; fTempo: number; fSeq: number
  totalPedidos: number; pesoTotal: number; pesoDevolvido: number
}

interface Resultado {
  detalhe:        DiasColaborador[]
  motoristas:     ResumoColaborador[]
  ajudantes:      ResumoColaborador[]
  standbyCount:   number
  totalLinhas:    number
  todasOcorrencias: string[]   // lista única de ocorrências para o filtro
}

type ActiveTab = "motoristas" | "ajudantes" | "detalhe"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normNome(s: any): string {
  if (!s) return ""
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim()
}

function parseDateIso(v: any): string {
  const s = String(v ?? "").trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return s.slice(0, 10)
  const n = Number(s)
  if (!isNaN(n) && n > 40000) return new Date((n - 25569) * 86400000).toISOString().slice(0, 10)
  return s.slice(0, 10)
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function toFloat(x: any): number {
  if (x == null || x === "") return NaN
  const s = String(x).trim().replace(/[^0-9.,]/g, "")
  if (!s) return NaN
  // Formato com vírgula decimal: 2.124,15 → 2124.15
  if (s.includes(",")) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."))
  }
  return parseFloat(s)
}

function parseMinutos(ini: any, fim: any): number {
  if (!ini || !fim) return NaN
  const i = new Date(String(ini).replace(/^(\d{2})\/(\d{2})\/(\d{4}) /, "$3-$2-$1 ")).getTime()
  const f = new Date(String(fim).replace(/^(\d{2})\/(\d{2})\/(\d{4}) /, "$3-$2-$1 ")).getTime()
  if (isNaN(i) || isNaN(f)) return NaN
  return (f - i) / 60000
}

function matchFuzzy(nomeRelatorio: string, nomeCadastro: string): boolean {
  const a = normNome(nomeRelatorio)
  const b = normNome(nomeCadastro)
  if (a === b) return true
  const tokens = a.split(" ").filter(t => t.length > 1)
  return tokens.length >= 2 && tokens.every(t => b.includes(t))
}

function padronizarColaborador(
  nome: any,
  funcionarios: any[]
): { nomePadronizado: string; empresa: string; cargo: string; operacao: string } {
  const n = String(nome ?? "").trim()
  if (!n || n === "N.R." || n === "nan") return { nomePadronizado: n, empresa: "", cargo: "", operacao: "" }
  if (!funcionarios.length) return { nomePadronizado: n, empresa: "", cargo: "", operacao: "" }

  const exato = funcionarios.find(f => normNome(f.NOME) === normNome(n))
  if (exato) return { nomePadronizado: exato.NOME, empresa: exato.EMPRESA ?? "", cargo: exato.CARGO ?? "", operacao: exato.OPERACAO ?? "" }

  const fuzzy = funcionarios.find(f => matchFuzzy(n, f.NOME))
  if (fuzzy) return { nomePadronizado: fuzzy.NOME, empresa: fuzzy.EMPRESA ?? "", cargo: fuzzy.CARGO ?? "", operacao: fuzzy.OPERACAO ?? "" }

  return { nomePadronizado: n, empresa: "", cargo: "", operacao: "" }
}

// ─── Processamento ────────────────────────────────────────────────────────────

function processar(rotas: any[], funcionarios: any[]): Resultado {
  const totalLinhas = rotas.length
  const semStandby  = rotas.filter(r =>
    String(r["Status Rota"] ?? "").toLowerCase() !== "standby"
  )
  const standbyCount = totalLinhas - semStandby.length

  // Pedido único: chave = Motorista|Data|CódigoCliente
  type PedidoKey = string
  interface Pedido {
    motoristaPad: string; empresaMot: string; cargoMot: string; opMot: string
    ajudante1Pad: string; empresaAj1: string; cargoAj1: string; opAj1: string
    ajudante2Pad: string; empresaAj2: string; cargoAj2: string; opAj2: string
    data: string
    distMin: number; slaOK: boolean; tempoMin: number; seqOK: boolean
    pesoEntrega: number
    // ocorrências com peso devolvido associado
    ocorrencias: { descricao: string; peso: number }[]
  }
  const pedidos = new Map<PedidoKey, Pedido>()

  for (const r of semStandby) {
    const data    = parseDateIso(r["Data Rota"] ?? "")
    const codCli  = String(r["Código Cliente"] ?? r["Codigo Cliente"] ?? "").trim()
    const motNome = String(r["Nome Motorista"] ?? "").trim()
    const aj1Nome = String(r["Nome Primeiro Ajudante"] ?? "").trim()
    const aj2Nome = String(r["Nome Segundo Ajudante"] ?? "").trim()

    if (!motNome || motNome === "nan" || !data) continue

    const { nomePadronizado: motPad, empresa: empMot, cargo: crgMot, operacao: opMot } =
      padronizarColaborador(motNome, funcionarios)
    const { nomePadronizado: aj1Pad, empresa: empAj1, cargo: crgAj1, operacao: opAj1 } =
      aj1Nome && aj1Nome !== "nan"
        ? padronizarColaborador(aj1Nome, funcionarios)
        : { nomePadronizado: "", empresa: "", cargo: "", operacao: "" }
    const { nomePadronizado: aj2Pad, empresa: empAj2, cargo: crgAj2, operacao: opAj2 } =
      aj2Nome && aj2Nome !== "nan"
        ? padronizarColaborador(aj2Nome, funcionarios)
        : { nomePadronizado: "", empresa: "", cargo: "", operacao: "" }

    const key: PedidoKey = `${motPad}|${data}|${codCli}`

    const dist      = toFloat(r["Distância Cliente (metros)"] ?? r["Distancia Cliente (metros)"])
    const slaStr    = String(r["SLA Janela Atendimento"] ?? "").trim()
    const slaOK     = /sim|ok/i.test(slaStr)
    const tempo     = parseMinutos(r["Chegada Cliente Realizado"], r["Fim Atendimento Cliente Realizado"])
    const seqP      = Number(r["Sequência Entrega Planejado"] ?? r["Sequencia Entrega Planejado"] ?? NaN)
    const seqR      = Number(r["Sequência Entrega Realizado"] ?? r["Sequencia Entrega Realizado"] ?? NaN)
    const seqOK     = !isNaN(seqP) && !isNaN(seqR) ? seqP === seqR : false
    const pesoDev   = toFloat(r["Peso Devolvido"]) || 0
    const descOcorr = String(r["Descrição Ocorrência"] ?? r["Descricao Ocorrencia"] ?? "").trim()

    if (pedidos.has(key)) {
      // Linha duplicada do mesmo pedido — atualiza critérios, acumula ocorrências adicionais
      const p = pedidos.get(key)!
      if (!isNaN(dist) && dist < p.distMin) p.distMin = dist
      p.slaOK   = p.slaOK || slaOK
      if (!isNaN(tempo)) p.tempoMin = Math.max(p.tempoMin, tempo)
      p.seqOK   = p.seqOK || seqOK
      // Linha duplicada do mesmo pedido (mesma chave Motorista|Data|CodCli):
      // O peso devolvido já foi capturado na primeira linha — NÃO somar novamente.
      // Só registra ocorrência nova se for uma descrição diferente das já existentes
      // E se o peso devolvido for diferente (i.e. não é a mesma linha repetida)
      if (pesoDev > 0 && descOcorr) {
        const jaExiste = p.ocorrencias.some(
          o => o.descricao === descOcorr && Math.abs(o.peso - pesoDev) < 0.01
        )
        if (!jaExiste) {
          p.ocorrencias.push({ descricao: descOcorr, peso: pesoDev })
        }
      }
    } else {
      const pesoEntrega = toFloat(r["Peso Entrega"]) || 0
      const ocorrencias: { descricao: string; peso: number }[] = []
      if (pesoDev > 0 && descOcorr) {
        ocorrencias.push({ descricao: descOcorr, peso: pesoDev })
      }
      pedidos.set(key, {
        motoristaPad: motPad, empresaMot: empMot, cargoMot: crgMot, opMot,
        ajudante1Pad: aj1Pad, empresaAj1: empAj1, cargoAj1: crgAj1, opAj1,
        ajudante2Pad: aj2Pad, empresaAj2: empAj2, cargoAj2: crgAj2, opAj2,
        data,
        distMin:  isNaN(dist) ? 9999999 : dist,
        slaOK, tempoMin: isNaN(tempo) ? 0 : tempo, seqOK,
        pesoEntrega,
        ocorrencias,
      })
    }
  }

  // Coleta todas as ocorrências únicas para o filtro
  const setOcorr = new Set<string>()
  for (const p of pedidos.values()) {
    for (const o of p.ocorrencias) if (o.descricao) setOcorr.add(o.descricao)
  }
  const todasOcorrencias = Array.from(setOcorr).sort()

  // Agrupa por colaborador + dia
  type DiaKey = string
  interface DiaAgg {
    total: number; raio: number; sla: number; tempo: number; seq: number
    peso: number
    ocorrencias: Map<string, number>  // descricao → peso acumulado
    empresa: string; cargo: string; operacao: string
  }
  const porDiaMot = new Map<DiaKey, DiaAgg>()
  const porDiaAj1 = new Map<DiaKey, DiaAgg>()
  const porDiaAj2 = new Map<DiaKey, DiaAgg>()

  function addPedido(map: Map<DiaKey, DiaAgg>, colab: string, data: string, p: Pedido, empresa: string, cargo: string, operacao: string) {
    const key = `${colab}|${data}`
    if (!map.has(key)) map.set(key, { total: 0, raio: 0, sla: 0, tempo: 0, seq: 0, peso: 0, ocorrencias: new Map(), empresa, cargo, operacao })
    const d = map.get(key)!
    d.total++
    if (p.distMin <= 100)  d.raio++
    if (p.slaOK)           d.sla++
    if (p.tempoMin >= 1.0) d.tempo++
    if (p.seqOK)           d.seq++
    d.peso += p.pesoEntrega
    for (const o of p.ocorrencias) {
      d.ocorrencias.set(o.descricao, (d.ocorrencias.get(o.descricao) ?? 0) + o.peso)
    }
  }

  for (const p of pedidos.values()) {
    if (p.motoristaPad) addPedido(porDiaMot, p.motoristaPad, p.data, p, p.empresaMot, p.cargoMot, p.opMot)
    if (p.ajudante1Pad) addPedido(porDiaAj1, p.ajudante1Pad, p.data, p, p.empresaAj1, p.cargoAj1, p.opAj1)
    if (p.ajudante2Pad) addPedido(porDiaAj2, p.ajudante2Pad, p.data, p, p.empresaAj2, p.cargoAj2, p.opAj2)
  }

  function calcDetalhe(map: Map<DiaKey, DiaAgg>, valor: number): DiasColaborador[] {
    const rows: DiasColaborador[] = []
    for (const [key, d] of map) {
      const [colaborador, data] = key.split("|")
      const tot = d.total || 1
      const pR = +(d.raio  / tot * 100).toFixed(1)
      const pS = +(d.sla   / tot * 100).toFixed(1)
      const pT = +(d.tempo / tot * 100).toFixed(1)
      const pQ = +(d.seq   / tot * 100).toFixed(1)
      const cR = pR >= MIN_RAIO, cS = pS >= MIN_SLA, cT = pT >= MIN_TEMPO, cQ = pQ >= MIN_SEQ
      const cum = (cR?1:0)+(cS?1:0)+(cT?1:0)+(cQ?1:0)
      const bonif = +((cum / CRITERIOS) * valor).toFixed(2)

      const pesoDevolvido = Array.from(d.ocorrencias.values()).reduce((s, v) => s + v, 0)
      const ocorrencias   = Array.from(d.ocorrencias.entries()).map(([descricao, peso]) => ({ descricao, peso }))

      rows.push({
        colaborador, empresa: d.empresa, cargo: d.cargo, operacao: d.operacao, data,
        totalPedidos: d.total, pesoDia: +d.peso.toFixed(2),
        pesoDevolvido: +pesoDevolvido.toFixed(2),
        pesoDevFiltrado: +pesoDevolvido.toFixed(2),  // recalculado no render
        ocorrencias,
        pRaio: pR, pSLA: pS, pTempo: pT, pSeq: pQ,
        cRaio: cR, cSLA: cS, cTempo: cT, cSeq: cQ,
        cumpridos: cum, bonif,
      })
    }
    return rows.sort((a, b) => a.data.localeCompare(b.data) || a.colaborador.localeCompare(b.colaborador))
  }

  const detMot  = calcDetalhe(porDiaMot, VALOR_MOT)
  const detAj1  = calcDetalhe(porDiaAj1, VALOR_AJUD)
  const detAj2  = calcDetalhe(porDiaAj2, VALOR_AJUD)
  const detalhe = [...detMot, ...detAj1, ...detAj2]

  function calcResumo(det: DiasColaborador[]): ResumoColaborador[] {
    const map = new Map<string, ResumoColaborador>()
    for (const d of det) {
      if (!map.has(d.colaborador)) {
        map.set(d.colaborador, {
          colaborador: d.colaborador, empresa: d.empresa, cargo: d.cargo, operacao: d.operacao,
          dias: 0, diasMax: 0, pct: 0, bonif: 0, fRaio: 0, fSLA: 0, fTempo: 0, fSeq: 0,
          totalPedidos: 0, pesoTotal: 0, pesoDevolvido: 0,
        })
      }
      const r = map.get(d.colaborador)!
      r.dias++
      if (d.cumpridos === CRITERIOS) r.diasMax++
      r.bonif          += d.bonif
      if (!d.cRaio)    r.fRaio++
      if (!d.cSLA)     r.fSLA++
      if (!d.cTempo)   r.fTempo++
      if (!d.cSeq)     r.fSeq++
      r.totalPedidos   += d.totalPedidos
      r.pesoTotal      += d.pesoDia
      r.pesoDevolvido  += d.pesoDevolvido
    }
    return Array.from(map.values())
      .map(r => ({
        ...r,
        bonif:         +r.bonif.toFixed(2),
        pesoTotal:     +r.pesoTotal.toFixed(2),
        pesoDevolvido: +r.pesoDevolvido.toFixed(2),
        pct: r.dias > 0 ? +((r.diasMax / r.dias) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
  }

  const motoristas = calcResumo(detMot)
  const ajudantes  = calcResumo([...detAj1, ...detAj2])

  return { detalhe, motoristas, ajudantes, standbyCount, totalLinhas, todasOcorrencias }
}

// ─── Excel ────────────────────────────────────────────────────────────────────

function gerarExcel(resultado: Resultado, ocorrIgnoradas: Set<string>) {
  const wb = XLSX.utils.book_new()

  function pesoDevFiltrado(d: DiasColaborador) {
    return d.ocorrencias
      .filter(o => !ocorrIgnoradas.has(o.descricao))
      .reduce((s, o) => s + o.peso, 0)
  }

  const toSheetMot = (rows: ResumoColaborador[]) => rows.map(r => ({
    "Motorista": r.colaborador, "Empresa": r.empresa, "Cargo": r.cargo,
    "Dias Ativos": r.dias, "Dias 4/4": r.diasMax, "% Desempenho": r.pct,
    "Total Bonificação (R$)": r.bonif, "Total Pedidos": r.totalPedidos,
    "Peso Total (kg)": r.pesoTotal, "Peso Devolvido (kg)": r.pesoDevolvido,
    "Falhas Raio": r.fRaio, "Falhas SLA": r.fSLA, "Falhas Tempo": r.fTempo, "Falhas Seq": r.fSeq,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheetMot(resultado.motoristas)), "Consolidado_Motorista")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheetMot(resultado.ajudantes)), "Consolidado_Ajudante")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.detalhe.map(d => ({
    "Colaborador": d.colaborador, "Empresa": d.empresa, "Cargo": d.cargo,
    "Data": d.data ? formatDateBR(d.data) : "", "Total Pedidos": d.totalPedidos,
    "Peso Dia (kg)": d.pesoDia,
    "Peso Devolvido Bruto (kg)": d.pesoDevolvido,
    "Peso Devolvido Filtrado (kg)": +pesoDevFiltrado(d).toFixed(2),
    "% Raio": d.pRaio, "✓ Raio": d.cRaio,
    "% SLA": d.pSLA,   "✓ SLA": d.cSLA,
    "% Tempo": d.pTempo, "✓ Tempo": d.cTempo,
    "% Sequência": d.pSeq, "✓ Sequência": d.cSeq,
    "Critérios (4)": d.cumpridos, "Bonificação (R$)": d.bonif,
  }))), "Detalhe_Diario")
  const now = new Date()
  XLSX.writeFile(wb, `Performaxxi_${now.getDate().toString().padStart(2,"0")}${(now.getMonth()+1).toString().padStart(2,"0")}${now.getFullYear()}.xlsx`)
}

// ─── Helpers render ───────────────────────────────────────────────────────────

function dash() { return h("span", { className: "text-muted-foreground/30" }, "—") }
function okIcon(ok: boolean) {
  return h("span", { className: ok ? "text-emerald-600 font-bold" : "text-red-500 font-bold" }, ok ? "✓" : "✗")
}
function numBad(n: number, cls = "text-red-500") {
  if (!n) return dash()
  return h("span", { className: cn("font-bold font-mono", cls) }, n)
}
function pctBar(pct: number) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
  const textColor = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"
  return h("div", { className: "flex items-center gap-2 justify-center" },
    h("div", { className: "w-12 h-1.5 rounded-full bg-muted overflow-hidden" },
      h("div", { className: cn("h-full rounded-full", color), style: { width: `${Math.min(pct, 100)}%` } })
    ),
    h("span", { className: cn("text-[11px] font-bold font-mono w-8", textColor) }, `${pct}%`)
  )
}
function pctBadge(pct: number) {
  return h("span", {
    className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
      pct >= 80  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      : pct >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400")
  }, `${pct}%`)
}

function fmtKg(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtRS(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

// ─── Painel de Filtro de Ocorrências ─────────────────────────────────────────

function PainelOcorrencias({
  ocorrencias,
  ignoradas,
  onChange,
}: {
  ocorrencias: string[]
  ignoradas: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const [aberto, setAberto] = React.useState(false)
  const ignoradasCount = ignoradas.size

  return h("div", { className: "relative" },
    h(Button, {
      variant: "outline" as const,
      size: "sm" as const,
      className: cn("h-8 text-xs gap-1.5", ignoradasCount > 0 && "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400"),
      onClick: () => setAberto(!aberto),
    },
      h(Filter, { className: "size-3.5" }),
      "Ocorrências",
      ignoradasCount > 0 && h("span", {
        className: "bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      }, `${ignoradasCount} ignoradas`)
    ),

    aberto && h("div", {
      className: "absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl p-3 min-w-[300px] max-w-[360px]"
    },
      h("div", { className: "flex items-center justify-between mb-2" },
        h("p", { className: "text-[11px] font-bold text-foreground" }, "Ignorar ocorrências (não conta como devolução)"),
        h("button", {
          className: "text-muted-foreground hover:text-foreground",
          onClick: () => setAberto(false)
        }, h(X, { className: "size-3.5" }))
      ),
      h("div", { className: "flex gap-1.5 mb-2" },
        h("button", {
          className: "text-[10px] text-muted-foreground hover:text-primary underline",
          onClick: () => onChange(new Set(ocorrencias))
        }, "Ignorar todos"),
        h("span", { className: "text-muted-foreground/30" }, "·"),
        h("button", {
          className: "text-[10px] text-muted-foreground hover:text-primary underline",
          onClick: () => onChange(new Set())
        }, "Limpar"),
      ),
      h("div", { className: "space-y-1 max-h-[260px] overflow-y-auto pr-1" },
        ...ocorrencias.map(oc =>
          h("label", {
            key: oc,
            className: cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-[11px] transition-colors",
              ignoradas.has(oc)
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                : "hover:bg-muted/50 text-foreground"
            )
          },
            h("input", {
              type: "checkbox",
              checked: ignoradas.has(oc),
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const novo = new Set(ignoradas)
                if (e.target.checked) novo.add(oc)
                else novo.delete(oc)
                onChange(novo)
              },
              className: "accent-amber-500"
            }),
            h("span", { className: "flex-1 leading-tight" }, oc)
          )
        )
      )
    )
  )
}

// ─── Tabela Resumo ────────────────────────────────────────────────────────────

function TabelaResumo({ rows, tipo }: { rows: ResumoColaborador[]; tipo: "Motorista" | "Ajudante" }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead([tipo, "Empresa", "Cargo", "Dias", "4/4", "R$", "% Desempenho",
               "Pedidos", "Peso kg", "Dev. kg",
               "F.Raio", "F.SLA", "F.Tempo", "F.Seq"]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const pct = r.pct
            const rc = pct >= 80 ? "bg-background hover:bg-muted/10"
              : pct >= 50 ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
              : "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20"
            return h("tr", { key: i, className: cn("border-b transition-colors", rc) },
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px]" }, r.colaborador),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground" }, r.empresa || dash()),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground max-w-[100px] truncate" }, r.cargo || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-bold text-blue-600" }, r.dias),
              h("td", { className: "px-2 py-1.5 text-center font-bold text-emerald-600" }, r.diasMax),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" }, `R$\u00A0${fmtRS(r.bonif)}`),
              h("td", { className: "px-2 py-1.5 text-center" }, pctBadge(pct)),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.totalPedidos),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, fmtKg(r.pesoTotal)),
              h("td", { className: "px-2 py-1.5 text-center" },
                r.pesoDevolvido > 0
                  ? h("span", { className: "font-bold text-red-500 font-mono" }, fmtKg(r.pesoDevolvido))
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, numBad(r.fRaio)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBad(r.fSLA)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBad(r.fTempo)),
              h("td", { className: "px-2 py-1.5 text-center" }, numBad(r.fSeq))
            )
          })
        )
      )
    )
  )
}

// ─── Tabela Detalhe Diário ────────────────────────────────────────────────────

function TabelaDetalhe({ rows, ocorrIgnoradas }: { rows: DiasColaborador[]; ocorrIgnoradas: Set<string> }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 340px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["Colaborador", "Empresa", "Data", "Pedidos", "Peso kg",
               "Dev. Bruto kg", "Dev. Líquido kg", "% Dev.",
               "% Raio", "Raio✓", "% SLA", "SLA✓", "% Tempo", "Tempo✓", "% Seq", "Seq✓",
               "Crit.", "R$"]),
        h("tbody", {},
          ...rows.map((d, i) => {
            const rc = d.cumpridos === 4 ? "bg-background hover:bg-muted/10"
              : d.cumpridos >= 2 ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
              : "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20"
            const critColor = d.cumpridos === 4 ? "text-emerald-600" : d.cumpridos >= 2 ? "text-amber-600" : "text-red-500"

            // Peso devolvido líquido (excluindo ocorrências ignoradas)
            const devLiquido = d.ocorrencias
              .filter(o => !ocorrIgnoradas.has(o.descricao))
              .reduce((s, o) => s + o.peso, 0)
            const pctDev = d.pesoDia > 0 ? +((devLiquido / d.pesoDia) * 100).toFixed(1) : 0
            const devColor = pctDev > 30 ? "text-red-500 font-bold" : pctDev > 10 ? "text-amber-600 font-semibold" : "text-muted-foreground"

            return h("tr", { key: i, className: cn("border-b transition-colors", rc) },
              h("td", { className: "px-2 py-1.5 text-left font-medium min-w-[160px]" }, d.colaborador),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground" }, d.empresa || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono whitespace-nowrap" }, d.data ? formatDateBR(d.data) : dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, d.totalPedidos),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, fmtKg(d.pesoDia)),
              // Dev. Bruto
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" },
                d.pesoDevolvido > 0 ? fmtKg(d.pesoDevolvido) : dash()
              ),
              // Dev. Líquido
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                devLiquido > 0
                  ? h("span", { className: devColor }, fmtKg(devLiquido))
                  : dash()
              ),
              // % Devolução
              h("td", { className: "px-2 py-1.5 text-center" },
                devLiquido > 0
                  ? h("span", { className: cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      pctDev > 30 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      : pctDev > 10 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                    )}, `${pctDev}%`)
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, pctBar(d.pRaio)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.cRaio)),
              h("td", { className: "px-2 py-1.5 text-center" }, pctBar(d.pSLA)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.cSLA)),
              h("td", { className: "px-2 py-1.5 text-center" }, pctBar(d.pTempo)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.cTempo)),
              h("td", { className: "px-2 py-1.5 text-center" }, pctBar(d.pSeq)),
              h("td", { className: "px-2 py-1.5 text-center" }, okIcon(d.cSeq)),
              h("td", { className: "px-2 py-1.5 text-center" },
                h("span", { className: cn("font-bold font-mono", critColor) }, `${d.cumpridos}/4`)
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" },
                d.bonif > 0 ? `R$\u00A0${fmtRS(d.bonif)}` : dash()
              )
            )
          })
        )
      )
    )
  )
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function KpiGrid({ resultado, ocorrIgnoradas }: { resultado: Resultado; ocorrIgnoradas: Set<string> }) {
  const { motoristas: mots, ajudantes: ajs } = resultado
  const bonifMot  = mots.reduce((s, r) => s + r.bonif, 0)
  const bonifAjud = ajs.reduce((s, r) => s + r.bonif, 0)
  const pesoTotal = mots.reduce((s, r) => s + r.pesoTotal, 0)
  const totalPed  = mots.reduce((s, r) => s + r.totalPedidos, 0)

  // Devolução líquida global (respeitando filtro)
  const devLiquido = resultado.detalhe
    .filter(d => {
      // só motoristas (evitar duplo contagem)
      return resultado.motoristas.some(m => m.colaborador === d.colaborador)
    })
    .reduce((s, d) => {
      return s + d.ocorrencias
        .filter(o => !ocorrIgnoradas.has(o.descricao))
        .reduce((ss, o) => ss + o.peso, 0)
    }, 0)
  const pctDev = pesoTotal > 0 ? +((devLiquido / pesoTotal) * 100).toFixed(1) : 0

  const items = [
    { label: "Motoristas",          value: mots.length,                       color: "text-primary"     },
    { label: "Ajudantes",           value: ajs.length,                        color: "text-blue-600"    },
    { label: "Pedidos Processados", value: totalPed,                          color: "text-cyan-600"    },
    { label: "Bonif. Motoristas",   value: `R$\u00A0${fmtRS(bonifMot)}`,      color: "text-emerald-600" },
    { label: "Bonif. Ajudantes",    value: `R$\u00A0${fmtRS(bonifAjud)}`,     color: "text-emerald-600" },
    { label: `Dev. Líquida (${pctDev}%)`, value: fmtKg(devLiquido) + " kg",  color: pctDev > 20 ? "text-red-500" : "text-amber-600" },
  ]
  return h("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" },
    ...items.map((kpi, i) =>
      h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-4 py-3" },
        h("p", { className: cn("text-lg font-bold font-mono leading-tight", kpi.color) }, kpi.value),
        h("p", { className: "text-[10px] text-muted-foreground mt-0.5" }, kpi.label)
      )
    )
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PerformaxxiPipelineView() {
  const [files, setFiles]           = React.useState<{ data: any[]; nome: string; tipo: "relatorio" | "funcionarios" }[]>([])
  const [loading, setLoading]       = React.useState(false)
  const [resultado, setResultado]   = React.useState<Resultado | null>(null)
  const [activeTab, setActiveTab]   = React.useState<ActiveTab>("motoristas")
  const [search, setSearch]         = React.useState("")
  const [ocorrIgnoradas, setOcorrIgnoradas] = React.useState<Set<string>>(new Set())
  const { toast }                   = useToast()

  async function lerArquivo(file: File) {
    const nome = file.name.toLowerCase()
    if (nome.endsWith(".json")) {
      const raw = JSON.parse(await file.text())
      if (Array.isArray(raw)) return raw
      const vals = Object.values(raw as Record<string, any>)
      if (vals.length === 1 && Array.isArray(vals[0])) return vals[0] as any[]
      return vals.flat() as any[]
    }
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: "array", cellDates: false })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
  }

  function detectarTipo(nome: string): "relatorio" | "funcionarios" {
    return /funcionari/i.test(nome) ? "funcionarios" : "relatorio"
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    for (const file of Array.from(e.target.files || [])) {
      try {
        const data = await lerArquivo(file)
        setFiles(prev => [...prev, { data, nome: file.name, tipo: detectarTipo(file.name) }])
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro ao ler arquivo", description: `${file.name}: ${err.message}` })
      }
    }
    e.target.value = ""
  }

  function analisar() {
    setLoading(true); setResultado(null); setOcorrIgnoradas(new Set())
    setTimeout(() => {
      try {
        const rotas = files.filter(f => f.tipo === "relatorio").flatMap(f => f.data)
        const funcs = files.filter(f => f.tipo === "funcionarios").flatMap(f => f.data)
        if (!rotas.length) throw new Error("Nenhum relatório de rotas encontrado.")
        const res = processar(rotas, funcs)
        setResultado(res)
        toast({ title: "Análise concluída", description: `${res.motoristas.length} motoristas · ${res.ajudantes.length} ajudantes · ${res.standbyCount} StandBy removidos` })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro na análise", description: err.message })
      } finally { setLoading(false) }
    }, 60)
  }

  const q = search.toLowerCase()
  const motFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.motoristas || []) : resultado.motoristas.filter(r => r.colaborador.toLowerCase().includes(q) || r.empresa.toLowerCase().includes(q)),
    [resultado, search]
  )
  const ajFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.ajudantes || []) : resultado.ajudantes.filter(r => r.colaborador.toLowerCase().includes(q) || r.empresa.toLowerCase().includes(q)),
    [resultado, search]
  )
  const detFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.detalhe || []) : resultado.detalhe.filter(d => d.colaborador.toLowerCase().includes(q)),
    [resultado, search]
  )

  const countLabel = activeTab === "motoristas" ? `${motFilt.length} / ${resultado?.motoristas.length || 0}`
    : activeTab === "ajudantes" ? `${ajFilt.length} / ${resultado?.ajudantes.length || 0}`
    : `${detFilt.length} / ${resultado?.detalhe.length || 0}`

  const tipoTag  = { relatorio: "bg-primary/10 text-primary", funcionarios: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400" }
  const tipoNome = { relatorio: "Relatório", funcionarios: "Funcionários" }

  return h("div", { className: "space-y-6" },

    // Banner
    h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-start gap-3" },
      h(Zap, { className: "size-4 text-primary shrink-0 mt-0.5" }),
      h("div", { className: "text-sm text-muted-foreground" },
        h("span", { className: "font-semibold text-foreground" }, "Performaxxi "),
        "— Bonificação proporcional por 4 critérios: ",
        h("strong", {}, "Raio · SLA · Tempo · Sequência"),
        `. Motorista R$ ${fmtRS(VALOR_MOT)} · Ajudante R$ ${fmtRS(VALOR_AJUD)} por dia completo (4/4).`
      )
    ),

    // Upload
    h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
        h(Package, { className: "size-4 text-primary" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Arquivos de Entrada")
      ),
      h("div", { className: "p-4 space-y-4" },
        h("div", {
          className: cn(
            "border-2 border-dashed rounded-xl bg-muted/10 min-h-[110px] flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
            "hover:border-primary/40 hover:bg-muted/20"
          ),
          onClick: () => document.getElementById("performaxxi-input")?.click()
        },
          h("input", { id: "performaxxi-input", type: "file", multiple: true, className: "hidden", onChange: handleFileChange }),
          files.length === 0
            ? h("div", { className: "text-center space-y-1.5" },
                h(FileCode, { className: "size-8 mx-auto opacity-20" }),
                h("p", { className: "text-xs text-muted-foreground italic" }, "RelatorioAnaliticoRotaPedidos · Funcionario (opcional)"),
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
                  h(Upload, { className: "size-3" }), "Clique para adicionar mais arquivos"
                )
              )
        ),

        // Regras
        h("div", { className: "grid grid-cols-5 gap-1.5" },
          ...RULES.map((rule, i) =>
            h("div", { key: i, className: cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px]", rule.cls) },
              h(ChevronRight, { className: "size-3 shrink-0 opacity-60" }),
              h("div", { className: "flex-1 min-w-0" },
                h("div", { className: "font-semibold text-[10px] leading-tight" }, rule.cond),
                h("div", { className: "leading-tight" }, `Mot ${rule.mot} · Ajud ${rule.ajud}`)
              )
            )
          )
        ),

        // Botões
        h("div", { className: "flex gap-2" },
          h(Button, {
            className: "flex-1 h-9 text-xs font-semibold shadow-sm",
            onClick: analisar,
            disabled: loading || !files.filter(f => f.tipo === "relatorio").length
          },
            loading
              ? h(React.Fragment, {}, h(Loader2, { className: "mr-1.5 size-3.5 animate-spin" }), "Processando...")
              : h(React.Fragment, {}, h(BarChart3, { className: "mr-1.5 size-3.5" }), "Analisar Performance")
          ),
          resultado && h(Button, {
            variant: "outline" as const, size: "sm" as const, className: "h-9 text-xs gap-1.5",
            onClick: () => gerarExcel(resultado, ocorrIgnoradas)
          }, h(Download, { className: "size-3.5" }), "Excel")
        )
      )
    ),

    // Resultado
    resultado && h("div", { className: "space-y-4" },

      h(KpiGrid as any, { resultado, ocorrIgnoradas }),

      // Abas + controles
      h("div", { className: "flex items-center gap-3 flex-wrap" },
        h("div", { className: "flex border-b border-border" },
          ...(([
            { id: "motoristas" as ActiveTab, label: `Motoristas (${resultado.motoristas.length})`, icon: Users },
            { id: "ajudantes"  as ActiveTab, label: `Ajudantes (${resultado.ajudantes.length})`,  icon: Users },
            { id: "detalhe"    as ActiveTab, label: "Detalhe Diário",                              icon: TrendingUp },
          ] as const).map(t =>
            h("button", {
              key: t.id,
              onClick: () => { setActiveTab(t.id); setSearch("") },
              className: cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )
            }, h(t.icon, { className: "size-3.5" }), t.label)
          ))
        ),
        h("input", {
          className: "flex-1 min-w-[200px] max-w-xs h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary",
          placeholder: "Buscar colaborador ou empresa...",
          value: search,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)
        }),
        // Filtro de ocorrências aparece apenas no Detalhe Diário
        activeTab === "detalhe" && resultado.todasOcorrencias.length > 0 &&
          h(PainelOcorrencias, {
            ocorrencias: resultado.todasOcorrencias,
            ignoradas: ocorrIgnoradas,
            onChange: setOcorrIgnoradas,
          }),
        h("span", { className: "text-[10px] text-muted-foreground font-mono ml-auto" }, countLabel)
      ),

      activeTab === "motoristas"
        ? h(TabelaResumo, { rows: motFilt, tipo: "Motorista" })
        : activeTab === "ajudantes"
        ? h(TabelaResumo, { rows: ajFilt,  tipo: "Ajudante" })
        : h(TabelaDetalhe, { rows: detFilt, ocorrIgnoradas })
    )
  )
}