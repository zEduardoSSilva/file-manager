"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  Upload, Download, BarChart3, Loader2, FileCode, Trash2,
  ChevronRight, Users, TrendingUp, Package, DollarSign,
  AlertTriangle, Activity, XCircle, CheckCircle2, Info,
} from "lucide-react"
import { Button }   from "@/components/ui/button"
import { cn }       from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

const h = React.createElement

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLS_COLABORADORES = ["MOTORISTA", "AJUDANTE", "AJUDANTE 2", "AJUDANTE_1", "AJUDANTE2"]

// Descrição dos arquivos necessários
const FONTES = [
  {
    label: "Entregas",
    desc: "Controle logístico com MOTORISTA, AJUDANTE e VIAGENS",
    cls: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400",
  },
  {
    label: "Faturamento",
    desc: "Fat_Fechamento com VIAGEM, FATURAMENTO, FATURAMENTO_DEV, NOTA, MOTIVO_DEV",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400",
  },
  {
    label: "Motivos Dev",
    desc: "Motivos_Sistema com MOTIVO_DEV e CONSIDERA (SIM/NÃO)",
    cls: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/20 dark:border-violet-900 dark:text-violet-400",
  },
  {
    label: "Chave Join",
    desc: "Número da VIAGEM une as 3 fontes — suporta múltiplas viagens (ex: 67712/67715)",
    cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400",
  },
  {
    label: "Filtro",
    desc: "Motivos NÃO culpa logística são excluídos do Faturamento_Dev e NFes_Dev",
    cls: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-400",
  },
]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DetalheRow {
  colaborador: string
  viagem: string
  faturamento: number
  faturamentoDev: number       // apenas motivos culpa logística
  faturamentoDevBruto: number  // tudo
  quantidadeNFe: number
  quantidadeNFeDev: number
  pctVendaDevolvida: number
  pctQtdNotasDevolvidas: number
}

interface ResumoRow {
  colaborador: string
  qtdViagens: number
  faturamentoTotal: number
  faturamentoDevolvido: number
  faturamentoDevBruto: number
  totalNFes: number
  totalNFesDev: number
  pctVendaDevolvida: number
  pctQtdNotasDevolvidas: number
  // extras para análise
  pctDevBrutoVsLiquido: number  // quanto foi desconsiderado por motivo sistema
}

interface Resultado {
  resumo:   ResumoRow[]
  detalhe:  DetalheRow[]
  // totais globais
  totalFat:    number
  totalFatDev: number
  totalNFe:    number
  totalNFeDev: number
  totalViagens: number
  totalColab:  number
  // meta
  motivosDesconsiderados: number
  motivosConsiderados: number
}

type ActiveTab = "resumo" | "detalhe" | "analise"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nanV(v: any): string {
  const s = String(v ?? "").trim()
  return s === "nan" || s === "NaN" || s === "None" || s === "none" ? "" : s
}

function toNum(v: any): number {
  const s = nanV(v)
  if (!s) return 0
  return parseFloat(s.replace(",", ".")) || 0
}

function normKey(v: any): string {
  const s = String(v ?? "").trim().replace(/\D/g, "").replace(/^0+/, "")
  return s === "" ? "0" : s
}

// Explode viagens concatenadas: "67712/67715" → ["67712","67715"]
function explodeViagem(v: any): string[] {
  const s = nanV(v)
  if (!s) return []
  const parts = s.split(/[\/;,|\s]+/)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const n = p.replace(/\D/g, "")
    if (n && !seen.has(n)) { out.push(n); seen.add(n) }
  }
  return out
}

function normNome(s: any): string {
  return String(s ?? "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim()
}

function fmtRS(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtPct(n: number) { return (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%" }
function fmtPctN(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%" }

// ─── Processamento ────────────────────────────────────────────────────────────

function processar(
  entregasRaw: any[],
  faturamentoRaw: any[],
  motivosRaw: any[],
): Resultado {

  // 1. Mapa de motivos: normNome(motivo) → culpa logística (true = considera, false = ignora)
  const motivoMap = new Map<string, boolean>()
  let motivosConsiderados = 0, motivosDesconsiderados = 0
  for (const m of motivosRaw) {
    const motivo = nanV(m.MOTIVO_DEV ?? m.motivo ?? "")
    const considera = String(m.CONSIDERA ?? "").trim().toUpperCase() === "SIM"
    if (motivo) {
      motivoMap.set(normNome(motivo), considera)
      if (considera) motivosConsiderados++
      else motivosDesconsiderados++
    }
  }

  // 2. Agrega faturamento por VIAGEM_KEY
  // Cada nota (NOTA) é única — conta NFe
  // FATURAMENTO_DEV > 0 = devolução
  // Se motivo NÃO = desconsiderar do faturamento_dev filtrado
  const fatMap = new Map<string, {
    faturamento: number
    faturamentoDevBruto: number  // tudo que tem FATURAMENTO_DEV > 0
    faturamentoDev: number       // só motivos culpa (SIM ou sem motivo no mapa)
    notas: Set<string>           // todas as notas
    notasDev: Set<string>        // notas com devolução culpa
    notasDevBruto: Set<string>   // notas com qualquer devolução
  }>()

  for (const r of faturamentoRaw) {
    const key = normKey(r["VIAGEM"] ?? r["Viagem"] ?? "")
    if (!key || key === "0") continue

    const fat    = toNum(r["FATURAMENTO"])
    const fatDev = toNum(r["FATURAMENTO_DEV"])
    const nota   = nanV(r["NOTA"] ?? r["Nota"] ?? "")
    const motivo = nanV(r["MOTIVO_DEV"] ?? r["Motivo_Dev"] ?? "")
    const isDev  = fatDev > 0

    // Decide se é culpa logística:
    // Se tem mapa de motivos: usa o mapa. Se não tem motivo na nota: considera culpa (conservador).
    // Se não tem mapa de motivos nenhum: assume culpa.
    let isCulpa = isDev
    if (isDev && motivo && motivoMap.size > 0) {
      const culpaNoMapa = motivoMap.get(normNome(motivo))
      // SIM = culpa logística = considera devolução; NÃO = não é culpa = desconsiderar
      isCulpa = culpaNoMapa !== false  // undefined (motivo desconhecido) → considera
    }

    if (!fatMap.has(key)) {
      fatMap.set(key, {
        faturamento: 0, faturamentoDevBruto: 0, faturamentoDev: 0,
        notas: new Set(), notasDev: new Set(), notasDevBruto: new Set(),
      })
    }
    const d = fatMap.get(key)!
    d.faturamento += fat
    if (isDev) {
      d.faturamentoDevBruto += fatDev
      if (nota) d.notasDevBruto.add(nota)
    }
    if (isDev && isCulpa) {
      d.faturamentoDev += fatDev
      if (nota) d.notasDev.add(nota)
    }
    if (nota) d.notas.add(nota)
  }

  // 3. Gera colaborador × viagem
  // Filtra MOTORISTA PADRAO
  const records: { colaborador: string; viagem: string }[] = []

  for (const r of entregasRaw) {
    const motorista = nanV(r["MOTORISTA"] ?? r["motorista"] ?? "").trim()
    if (!motorista || motorista.toLowerCase().startsWith("motorista padrao")) continue

    const viagens: string[] = []
    // Coluna VIAGENS pode ter múltiplos
    const viagemRaw = r["VIAGENS"] ?? r["VIAGEM"] ?? r["Viagem"] ?? r["viagem"] ?? ""
    viagens.push(...explodeViagem(viagemRaw))
    if (!viagens.length) continue

    // Todos os colaboradores da linha
    const colaboradores: string[] = [motorista]
    for (const col of COLS_COLABORADORES.filter(c => c !== "MOTORISTA")) {
      const nome = nanV(r[col] ?? "").trim()
      if (nome && nome !== motorista) colaboradores.push(nome)
    }

    for (const colab of colaboradores) {
      for (const v of viagens) {
        records.push({ colaborador: colab, viagem: v })
      }
    }
  }

  // Deduplica colaborador × viagem (mesmo par pode aparecer várias vezes por linha do controle)
  const seen = new Set<string>()
  const recordsUniq = records.filter(r => {
    const k = `${r.colaborador}|${r.viagem}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })

  // 4. Cruza com faturamento
  const detalhe: DetalheRow[] = recordsUniq.map(r => {
    const fat = fatMap.get(r.viagem) ?? {
      faturamento: 0, faturamentoDevBruto: 0, faturamentoDev: 0,
      notas: new Set<string>(), notasDev: new Set<string>(), notasDevBruto: new Set<string>(),
    }
    const fat_n = fat.faturamento
    const dev_n = fat.faturamentoDev
    const nfe   = fat.notas.size
    const nfeDev = fat.notasDev.size
    return {
      colaborador:         r.colaborador,
      viagem:              r.viagem,
      faturamento:         +fat_n.toFixed(2),
      faturamentoDev:      +dev_n.toFixed(2),
      faturamentoDevBruto: +fat.faturamentoDevBruto.toFixed(2),
      quantidadeNFe:       nfe,
      quantidadeNFeDev:    nfeDev,
      pctVendaDevolvida:   fat_n > 0 ? +(dev_n / fat_n).toFixed(6) : 0,
      pctQtdNotasDevolvidas: nfe > 0 ? +(nfeDev / nfe).toFixed(6) : 0,
    }
  }).sort((a, b) => a.colaborador.localeCompare(b.colaborador) || a.viagem.localeCompare(b.viagem))

  // 5. Resumo por colaborador
  const resMapa = new Map<string, ResumoRow>()
  for (const d of detalhe) {
    if (!resMapa.has(d.colaborador)) {
      resMapa.set(d.colaborador, {
        colaborador: d.colaborador,
        qtdViagens: 0, faturamentoTotal: 0, faturamentoDevolvido: 0,
        faturamentoDevBruto: 0, totalNFes: 0, totalNFesDev: 0,
        pctVendaDevolvida: 0, pctQtdNotasDevolvidas: 0, pctDevBrutoVsLiquido: 0,
      })
    }
    const r = resMapa.get(d.colaborador)!
    r.qtdViagens++
    r.faturamentoTotal    += d.faturamento
    r.faturamentoDevolvido += d.faturamentoDev
    r.faturamentoDevBruto  += d.faturamentoDevBruto
    r.totalNFes   += d.quantidadeNFe
    r.totalNFesDev += d.quantidadeNFeDev
  }

  const resumo: ResumoRow[] = Array.from(resMapa.values()).map(r => ({
    ...r,
    faturamentoTotal:    +r.faturamentoTotal.toFixed(2),
    faturamentoDevolvido: +r.faturamentoDevolvido.toFixed(2),
    faturamentoDevBruto:  +r.faturamentoDevBruto.toFixed(2),
    pctVendaDevolvida:   r.faturamentoTotal > 0 ? +(r.faturamentoDevolvido / r.faturamentoTotal).toFixed(6) : 0,
    pctQtdNotasDevolvidas: r.totalNFes > 0 ? +(r.totalNFesDev / r.totalNFes).toFixed(6) : 0,
    pctDevBrutoVsLiquido: r.faturamentoDevBruto > 0
      ? +((1 - r.faturamentoDevolvido / r.faturamentoDevBruto)).toFixed(4) : 0,
  })).sort((a, b) => b.faturamentoTotal - a.faturamentoTotal)

  // 6. Totais globais
  const totalFat    = resumo.reduce((s, r) => s + r.faturamentoTotal, 0)
  const totalFatDev = resumo.reduce((s, r) => s + r.faturamentoDevolvido, 0)
  const totalNFe    = resumo.reduce((s, r) => s + r.totalNFes, 0)
  const totalNFeDev = resumo.reduce((s, r) => s + r.totalNFesDev, 0)

  return {
    resumo, detalhe,
    totalFat, totalFatDev, totalNFe, totalNFeDev,
    totalViagens: new Set(detalhe.map(d => d.viagem)).size,
    totalColab: resumo.length,
    motivosConsiderados, motivosDesconsiderados,
  }
}

// ─── Excel export ─────────────────────────────────────────────────────────────

function gerarExcel(resultado: Resultado) {
  const wb = XLSX.utils.book_new()

  // Aba 1: Resumo
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.resumo.map(r => ({
    "Colaborador":                    r.colaborador,
    "Qtd_Viagens":                    r.qtdViagens,
    "Faturamento_Total (R$)":         r.faturamentoTotal,
    "Faturamento_Devolvido (R$)":     r.faturamentoDevolvido,
    "Total_NFes":                     r.totalNFes,
    "Total_NFes_Devolvidas":          r.totalNFesDev,
    "Percentual_Venda_Devolvida":     r.pctVendaDevolvida,
    "Percentual_Qtd_Notas_Devolvidas": r.pctQtdNotasDevolvidas,
  }))), "Resumo por Colaborador")

  // Aba 2: Detalhamento
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.detalhe.map(d => ({
    "Colaborador":                     d.colaborador,
    "Viagem":                          d.viagem,
    "Faturamento (R$)":                d.faturamento,
    "Faturamento_Dev (R$)":            d.faturamentoDev,
    "Quantidade_NFe":                  d.quantidadeNFe,
    "Quantidade_NFe_Dev":              d.quantidadeNFeDev,
    "Percentual_Venda_Devolvida":      d.pctVendaDevolvida,
    "Percentual_Qtd_Notas_Devolvidas": d.pctQtdNotasDevolvidas,
  }))), "Detalhamento")

  const now = new Date()
  XLSX.writeFile(wb, `FaturamentoDev_${now.getDate().toString().padStart(2,"0")}${(now.getMonth()+1).toString().padStart(2,"0")}${now.getFullYear()}.xlsx`)
}

// ─── Helpers render ───────────────────────────────────────────────────────────

function dash() { return h("span", { className: "text-muted-foreground/30" }, "—") }

function THead(headers: string[]) {
  return h("thead", { className: "sticky top-0 z-10" },
    h("tr", { style: { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.9)" } },
      ...headers.map((hd, i) =>
        h("th", { key: i, className: "px-2 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap text-[10px]" }, hd)
      )
    )
  )
}

function PctBadge({ pct, inverted = false }: { pct: number; inverted?: boolean }) {
  // Para devolução: baixo é bom (inverted=true), alto é ruim
  const pctN = pct * 100
  const isBad  = inverted ? pctN > 10 : pctN < 10
  const isWarn = inverted ? pctN > 5  : pctN < 5
  const cls = pctN === 0
    ? "bg-muted/40 text-muted-foreground"
    : inverted
      ? pctN > 20 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
        : pctN > 10 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        : pctN > 5  ? "bg-yellow-100 text-yellow-700"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      : "bg-blue-100 text-blue-700"
  return h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", cls) },
    fmtPct(pct)
  )
}

function SparkBar({ pct, bad = false }: { pct: number; bad?: boolean }) {
  const color = bad
    ? pct > 20 ? "bg-red-500" : pct > 10 ? "bg-amber-500" : pct > 5 ? "bg-yellow-400" : "bg-emerald-500"
    : "bg-blue-500"
  return h("div", { className: "flex items-center gap-1.5 justify-center" },
    h("div", { className: "w-16 h-1.5 rounded-full bg-muted overflow-hidden" },
      h("div", { className: cn("h-full rounded-full transition-all", color), style: { width: `${Math.min(pct, 100)}%` } })
    ),
    h("span", { className: "text-[10px] font-mono text-muted-foreground w-9 text-right" }, fmtPctN(pct))
  )
}

// ─── Tabela Resumo ────────────────────────────────────────────────────────────

function TabelaResumo({ rows }: { rows: ResumoRow[] }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 360px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["Colaborador", "Viagens", "Fat. Total R$", "Fat. Dev R$",
               "% Venda Dev.", "NFes", "NFes Dev.", "% NFes Dev.",
               "Fat. Dev Bruto R$", "% Descontado"]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const pctVenda = r.pctVendaDevolvida * 100
            const pctNFe   = r.pctQtdNotasDevolvidas * 100
            const pctDesc  = r.pctDevBrutoVsLiquido * 100
            const rc = pctVenda > 20 ? "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20"
              : pctVenda > 10 ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
              : "bg-background hover:bg-muted/10"
            return h("tr", { key: i, className: cn("border-b transition-colors", rc) },
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px]" }, r.colaborador),
              h("td", { className: "px-2 py-1.5 text-center font-bold text-blue-600" }, r.qtdViagens),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" },
                r.faturamentoTotal > 0 ? `R$\u00A0${fmtRS(r.faturamentoTotal)}` : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.faturamentoDevolvido > 0
                  ? h("span", { className: "text-red-500 font-bold" }, `R$\u00A0${fmtRS(r.faturamentoDevolvido)}`)
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" },
                h(SparkBar, { pct: pctVenda, bad: true })
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.totalNFes || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.totalNFesDev > 0
                  ? h("span", { className: "font-bold text-red-500" }, r.totalNFesDev)
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { pct: r.pctQtdNotasDevolvidas, inverted: true })),
              // Fat dev bruto (antes do filtro de motivos)
              h("td", { className: "px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground" },
                r.faturamentoDevBruto > 0 ? `R$\u00A0${fmtRS(r.faturamentoDevBruto)}` : dash()
              ),
              // % desconsiderado por motivo sistema
              h("td", { className: "px-2 py-1.5 text-center" },
                pctDesc > 0
                  ? h("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700" },
                      `${fmtPctN(pctDesc)}`)
                  : dash()
              )
            )
          })
        )
      )
    )
  )
}

// ─── Tabela Detalhe ───────────────────────────────────────────────────────────

function TabelaDetalhe({ rows }: { rows: DetalheRow[] }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 360px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead(["Colaborador", "Viagem", "Faturamento R$", "Fat. Dev R$",
               "% Venda Dev.", "Qtd NFes", "NFes Dev.", "% NFes Dev."]),
        h("tbody", {},
          ...rows.map((d, i) => {
            const pctV = d.pctVendaDevolvida * 100
            const rc = pctV > 20 ? "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10"
              : pctV > 10 ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-950/10"
              : "bg-background hover:bg-muted/10"
            return h("tr", { key: i, className: cn("border-b transition-colors", rc) },
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px]" }, d.colaborador),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground" }, d.viagem),
              h("td", { className: "px-2 py-1.5 text-center font-mono font-bold text-primary" },
                d.faturamento > 0 ? `R$\u00A0${fmtRS(d.faturamento)}` : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                d.faturamentoDev > 0
                  ? h("span", { className: "text-red-500 font-bold" }, `R$\u00A0${fmtRS(d.faturamentoDev)}`)
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { pct: d.pctVendaDevolvida, inverted: true })),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, d.quantidadeNFe || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                d.quantidadeNFeDev > 0
                  ? h("span", { className: "font-bold text-red-500" }, d.quantidadeNFeDev)
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { pct: d.pctQtdNotasDevolvidas, inverted: true }))
            )
          })
        )
      )
    )
  )
}

// ─── Aba Análise ──────────────────────────────────────────────────────────────

function AbaAnalise({ resultado }: { resultado: Resultado }) {
  const { resumo } = resultado

  // Top 8 por % devolução valor
  const topDevVal  = [...resumo].filter(r => r.pctVendaDevolvida > 0)
    .sort((a, b) => b.pctVendaDevolvida - a.pctVendaDevolvida).slice(0, 8)
  const maxDevVal  = topDevVal[0]?.pctVendaDevolvida ?? 1

  // Top 8 por % devolução NFe
  const topDevNFe  = [...resumo].filter(r => r.pctQtdNotasDevolvidas > 0)
    .sort((a, b) => b.pctQtdNotasDevolvidas - a.pctQtdNotasDevolvidas).slice(0, 8)

  // Top 8 por faturamento
  const topFat     = [...resumo].sort((a, b) => b.faturamentoTotal - a.faturamentoTotal).slice(0, 8)
  const maxFat     = topFat[0]?.faturamentoTotal ?? 1

  // Top 8 por valor devolvido absoluto
  const topAbsDev  = [...resumo].filter(r => r.faturamentoDevolvido > 0)
    .sort((a, b) => b.faturamentoDevolvido - a.faturamentoDevolvido).slice(0, 8)
  const maxAbsDev  = topAbsDev[0]?.faturamentoDevolvido ?? 1

  // Alertas: % devolução acima de 20%
  const alertas    = resumo.filter(r => r.pctVendaDevolvida * 100 > 20)
  const semDev     = resumo.filter(r => r.faturamentoDevolvido === 0 && r.faturamentoTotal > 0)

  function OcCard({ title, badge, badgeClass, children }: { title: string; badge?: any; badgeClass?: string; children: any }) {
    return h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-2.5 border-b border-border/60 bg-muted/10 flex items-center justify-between" },
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, title),
        badge != null && h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full", badgeClass || "bg-muted text-muted-foreground") }, badge)
      ),
      children
    )
  }

  function OcRow({ label, val, max, colorClass, prefix = "" }: { label: string; val: number; max: number; colorClass: string; prefix?: string }) {
    const pct = max > 0 ? Math.min((val / max) * 100, 100) : 0
    const display = prefix ? `${prefix}${fmtRS(val)}` : fmtRS(val)
    return h("div", { className: "flex items-center gap-3 px-4 py-2 border-b border-border/60 last:border-b-0" },
      h("div", { className: "flex-1 text-[11px] font-medium truncate" }, label),
      h("div", { className: "w-20 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0" },
        h("div", { className: cn("h-full rounded-full", colorClass), style: { width: `${pct}%` } })
      ),
      h("div", { className: cn("text-[11px] font-bold font-mono w-20 text-right flex-shrink-0",
        colorClass.includes("red") ? "text-red-500"
        : colorClass.includes("amber") ? "text-amber-600"
        : colorClass.includes("emerald") ? "text-emerald-600"
        : "text-blue-600") }, display)
    )
  }

  function OcRowPct({ label, val }: { label: string; val: number }) {
    const pctN = val * 100
    const color = pctN > 20 ? "bg-red-500" : pctN > 10 ? "bg-amber-500" : pctN > 5 ? "bg-yellow-400" : "bg-emerald-500"
    return h("div", { className: "flex items-center gap-3 px-4 py-2 border-b border-border/60 last:border-b-0" },
      h("div", { className: "flex-1 text-[11px] font-medium truncate" }, label),
      h("div", { className: "w-20 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0" },
        h("div", { className: cn("h-full rounded-full", color), style: { width: `${Math.min(pctN * 3, 100)}%` } })
      ),
      h("span", { className: cn("text-[11px] font-bold font-mono w-16 text-right flex-shrink-0",
        pctN > 20 ? "text-red-500" : pctN > 10 ? "text-amber-600" : pctN > 5 ? "text-yellow-600" : "text-emerald-600"
      )}, fmtPct(val))
    )
  }

  return h("div", { className: "space-y-4" },

    // Alertas críticos
    alertas.length > 0 && h("div", { className: "rounded-xl border border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/10 shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-2.5 border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 flex items-center gap-2" },
        h(AlertTriangle, { className: "size-3.5 text-red-500" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-400" },
          `${alertas.length} Colaborador(es) com Devolução > 20% do Faturamento`
        )
      ),
      h("div", { className: "p-3 flex flex-wrap gap-2" },
        ...alertas.map((r, i) =>
          h("div", { key: i, className: "flex items-center gap-2 border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 rounded-lg px-3 py-2 min-w-[220px] flex-1" },
            h("span", { className: "text-sm" }, "🔴"),
            h("div", {},
              h("div", { className: "text-[11px] font-semibold leading-tight" }, r.colaborador),
              h("div", { className: "text-[10px] text-muted-foreground" },
                `Dev: ${fmtPct(r.pctVendaDevolvida)} · R$\u00A0${fmtRS(r.faturamentoDevolvido)} de R$\u00A0${fmtRS(r.faturamentoTotal)}`
              )
            )
          )
        )
      )
    ),

    h("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },

      // % Devolução por valor
      h(OcCard as any, {
        title: "Maior % Devolução em Valor",
        badge: `${topDevVal.length} colaborador(es)`,
        badgeClass: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      },
        h("div", {},
          topDevVal.length === 0
            ? h("div", { className: "px-4 py-6 text-center text-[11px] text-emerald-600 font-medium" }, "✓ Nenhuma devolução registrada.")
            : topDevVal.map((r, i) => h(OcRowPct as any, { key: i, label: r.colaborador, val: r.pctVendaDevolvida }))
        )
      ),

      // Valor devolvido absoluto
      h(OcCard as any, {
        title: "Maior Valor Devolvido (R$)",
        badge: `R$\u00A0${fmtRS(resultado.totalFatDev)}`,
        badgeClass: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      },
        h("div", {},
          topAbsDev.length === 0
            ? h("div", { className: "px-4 py-6 text-center text-[11px] text-emerald-600 font-medium" }, "✓ Nenhuma devolução.")
            : topAbsDev.map((r, i) => h(OcRow as any, { key: i, label: r.colaborador, val: r.faturamentoDevolvido, max: maxAbsDev, colorClass: "bg-red-500", prefix: "R$\u00A0" }))
        )
      ),

      // % Devolução por NFe
      h(OcCard as any, {
        title: "Maior % Notas Devolvidas",
        badge: `${topDevNFe.length}`,
        badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      },
        h("div", {},
          topDevNFe.length === 0
            ? h("div", { className: "px-4 py-6 text-center text-[11px] text-emerald-600 font-medium" }, "✓ Nenhuma nota devolvida.")
            : topDevNFe.map((r, i) => h(OcRowPct as any, { key: i, label: r.colaborador, val: r.pctQtdNotasDevolvidas }))
        )
      ),

      // Top faturamento
      h(OcCard as any, {
        title: "Maior Faturamento Total",
        badge: `R$\u00A0${fmtRS(resultado.totalFat)}`,
        badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      },
        h("div", {},
          topFat.map((r, i) => h(OcRow as any, { key: i, label: r.colaborador, val: r.faturamentoTotal, max: maxFat, colorClass: "bg-emerald-500", prefix: "R$\u00A0" }))
        )
      ),
    ),

    // Colaboradores sem devolução — destaque positivo
    semDev.length > 0 && h(OcCard as any, {
      title: `✓ Colaboradores sem Nenhuma Devolução (${semDev.length})`,
      badge: `${semDev.length} / ${resumo.length}`,
      badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
    },
      h("div", { className: "p-3 flex flex-wrap gap-2" },
        ...semDev.map((r, i) =>
          h("div", { key: i, className: "flex items-center gap-2 border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 rounded-lg px-3 py-1.5" },
            h(CheckCircle2, { className: "size-3 text-emerald-500 shrink-0" }),
            h("span", { className: "text-[11px] font-medium" }, r.colaborador),
            h("span", { className: "text-[10px] text-muted-foreground font-mono" }, `R$\u00A0${fmtRS(r.faturamentoTotal)}`)
          )
        )
      )
    )
  )
}

// ─── KPI Grid ────────────────────────────────────────────────────────────────

function KpiGrid({ r }: { r: Resultado }) {
  const pctDev  = r.totalFat > 0 ? r.totalFatDev / r.totalFat : 0
  const pctNFe  = r.totalNFe > 0 ? r.totalNFeDev / r.totalNFe : 0
  const pctFatN = pctDev * 100

  const kpis = [
    { label: "Colaboradores",         value: `${r.totalColab}`,                    color: "text-primary",     icon: Users },
    { label: "Viagens com Fat.",       value: `${r.totalViagens}`,                  color: "text-blue-600",    icon: Package },
    { label: "Faturamento Total",      value: `R$\u00A0${fmtRS(r.totalFat)}`,       color: "text-emerald-600", icon: DollarSign },
    { label: "Fat. Devolvido",         value: `R$\u00A0${fmtRS(r.totalFatDev)}`,    color: r.totalFatDev > 0 ? "text-red-500" : "text-emerald-600", icon: XCircle,
      sub: `${fmtPct(pctDev)} do faturamento` },
    { label: "Total NFes",             value: `${r.totalNFe}`,                      color: "text-cyan-600",    icon: Activity },
    { label: "NFes Devolvidas",        value: `${r.totalNFeDev}`,                   color: r.totalNFeDev > 0 ? "text-red-500" : "text-emerald-600", icon: AlertTriangle,
      sub: `${fmtPct(pctNFe)} das notas` },
    { label: "Motivos Culpa Log.",     value: `${r.motivosConsiderados}`,            color: "text-amber-600",   icon: XCircle },
    { label: "Motivos Excluídos",      value: `${r.motivosDesconsiderados}`,         color: "text-violet-600",  icon: CheckCircle2 },
  ]

  return h("div", { className: "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-6" },
    ...kpis.map((k, i) =>
      h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-4 py-3" },
        h("div", { className: "flex items-center gap-2 mb-1" },
          h(k.icon, { className: cn("size-3.5 shrink-0", k.color) })
        ),
        h("p", { className: cn("text-base font-bold font-mono leading-tight truncate", k.color) }, k.value),
        h("p", { className: "text-[10px] text-muted-foreground mt-0.5" }, k.label),
        k.sub && h("p", { className: cn("text-[9px] font-bold mt-0.5", pctFatN > 10 ? "text-red-400" : "text-muted-foreground/60") }, k.sub)
      )
    )
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MotivosDevPipelineView() {
  const [files, setFiles]         = React.useState<{ data: any[]; nome: string; tipo: "entregas" | "faturamento" | "motivos" }[]>([])
  const [loading, setLoading]     = React.useState(false)
  const [resultado, setResultado] = React.useState<Resultado | null>(null)
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("resumo")
  const [search, setSearch]       = React.useState("")
  const { toast }                 = useToast()

  async function lerArquivo(file: File) {
    const nome = file.name.toLowerCase()
    if (nome.endsWith(".json")) {
      const raw = JSON.parse(await file.text())
      if (Array.isArray(raw)) return raw
      const vals = Object.entries(raw as Record<string, any>)
        .filter(([k]) => k.toLowerCase() !== "acumulado")
        .map(([, v]) => v)
      return vals.flat() as any[]
    }
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: "array", cellDates: false })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
  }

  function detectarTipo(nome: string): "entregas" | "faturamento" | "motivos" {
    const n = nome.toLowerCase()
    if (/fat|fatur|fechamento/i.test(n))   return "faturamento"
    if (/motivo|sistema/i.test(n))          return "motivos"
    return "entregas"
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
    setLoading(true); setResultado(null)
    setTimeout(() => {
      try {
        const entregasRaw    = files.filter(f => f.tipo === "entregas").flatMap(f => f.data)
        const faturamentoRaw = files.filter(f => f.tipo === "faturamento").flatMap(f => f.data)
        const motivosRaw     = files.filter(f => f.tipo === "motivos").flatMap(f => f.data)
        if (!entregasRaw.length)    throw new Error("Nenhum arquivo de Entregas encontrado.")
        if (!faturamentoRaw.length) throw new Error("Nenhum arquivo de Faturamento encontrado.")
        const res = processar(entregasRaw, faturamentoRaw, motivosRaw)
        setResultado(res)
        toast({
          title: "Análise concluída",
          description: `${res.totalColab} colaboradores · ${res.totalViagens} viagens · R$\u00A0${fmtRS(res.totalFat)} faturado`,
        })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro na análise", description: err.message })
      } finally { setLoading(false) }
    }, 60)
  }

  const q = search.toLowerCase()
  const resumoFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.resumo || [])
      : resultado.resumo.filter(r => r.colaborador.toLowerCase().includes(q)),
    [resultado, search]
  )
  const detalheFilt = React.useMemo(() =>
    !q || !resultado ? (resultado?.detalhe || [])
      : resultado.detalhe.filter(d => d.colaborador.toLowerCase().includes(q) || d.viagem.includes(q)),
    [resultado, search]
  )

  const tipoTag  = {
    entregas:    "bg-primary/10 text-primary",
    faturamento: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    motivos:     "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400",
  }
  const tipoNome = { entregas: "Entregas", faturamento: "Faturamento", motivos: "Motivos Dev" }

  const countLabel = activeTab === "resumo"
    ? `${resumoFilt.length} / ${resultado?.resumo.length || 0} colaboradores`
    : activeTab === "detalhe"
    ? `${detalheFilt.length} / ${resultado?.detalhe.length || 0} registros`
    : ""

  return h("div", { className: "space-y-6" },

    // Banner
    h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-start gap-3" },
      h(DollarSign, { className: "size-4 text-primary shrink-0 mt-0.5" }),
      h("div", { className: "text-sm text-muted-foreground" },
        h("span", { className: "font-semibold text-foreground" }, "Faturamento & Devoluções "),
        "— Cruza ",
        h("strong", {}, "Entregas · Faturamento · Motivos do Sistema"),
        ". Calcula ",
        h("strong", {}, "% Venda Devolvida · % NFes Devolvidas"),
        " por colaborador, filtrando motivos que não são culpa da logística."
      )
    ),

    // Upload
    h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
        h(Package, { className: "size-4 text-primary" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Arquivos de Entrada")
      ),
      h("div", { className: "p-4 space-y-4" },

        // Drop zone
        h("div", {
          className: cn(
            "border-2 border-dashed rounded-xl bg-muted/10 min-h-[100px] flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
            "hover:border-primary/40 hover:bg-muted/20"
          ),
          onClick: () => document.getElementById("fatdev-input")?.click()
        },
          h("input", { id: "fatdev-input", type: "file", multiple: true, className: "hidden", onChange: handleFileChange }),
          files.length === 0
            ? h("div", { className: "text-center space-y-1.5" },
                h(FileCode, { className: "size-8 mx-auto opacity-20" }),
                h("p", { className: "text-xs text-muted-foreground italic" }, "Entregas · Faturamento (Fat_Fechamento) · Motivos_Sistema (opcional)"),
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

        // Guia de fontes
        h("div", { className: "grid grid-cols-5 gap-1.5" },
          ...FONTES.map((rule, i) =>
            h("div", { key: i, className: cn("flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[10px]", rule.cls) },
              h(ChevronRight, { className: "size-3 shrink-0 opacity-60 mt-0.5" }),
              h("div", {},
                h("div", { className: "font-bold leading-tight" }, rule.label),
                h("div", { className: "opacity-70 leading-tight mt-0.5" }, rule.desc)
              )
            )
          )
        ),

        // Botões
        h("div", { className: "flex gap-2" },
          h(Button, {
            className: "flex-1 h-9 text-xs font-semibold shadow-sm",
            onClick: analisar,
            disabled: loading || !files.filter(f => f.tipo === "entregas").length || !files.filter(f => f.tipo === "faturamento").length
          },
            loading
              ? h(React.Fragment, {}, h(Loader2, { className: "mr-1.5 size-3.5 animate-spin" }), "Processando...")
              : h(React.Fragment, {}, h(BarChart3, { className: "mr-1.5 size-3.5" }), "Analisar Faturamento")
          ),
          resultado && h(Button, {
            variant: "outline" as const, size: "sm" as const, className: "h-9 text-xs gap-1.5",
            onClick: () => gerarExcel(resultado)
          }, h(Download, { className: "size-3.5" }), "Excel")
        )
      )
    ),

    // Resultado
    resultado && h("div", { className: "space-y-4" },
      h(KpiGrid as any, { r: resultado }),

      // Abas
      h("div", { className: "flex items-center gap-3 flex-wrap" },
        h("div", { className: "flex border-b border-border" },
          ...(([
            { id: "resumo"  as ActiveTab, label: `Resumo (${resultado.resumo.length})`,    icon: Users },
            { id: "detalhe" as ActiveTab, label: `Detalhamento (${resultado.detalhe.length})`, icon: TrendingUp },
            { id: "analise" as ActiveTab, label: "Análise de Desempenho",                   icon: Activity },
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
        activeTab !== "analise" && h(React.Fragment, {},
          h("input", {
            className: "flex-1 min-w-[200px] max-w-xs h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary",
            placeholder: activeTab === "detalhe" ? "Buscar colaborador ou viagem..." : "Buscar colaborador...",
            value: search,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)
          }),
          h("span", { className: "text-[10px] text-muted-foreground font-mono ml-auto" }, countLabel)
        )
      ),

      activeTab === "resumo"
        ? h(TabelaResumo, { rows: resumoFilt })
        : activeTab === "detalhe"
        ? h(TabelaDetalhe, { rows: detalheFilt })
        : h(AbaAnalise, { resultado })
    )
  )
}