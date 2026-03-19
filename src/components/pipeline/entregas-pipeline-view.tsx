"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  Play, Trash2, Loader2, FileSpreadsheet, HelpCircle,
  CheckCircle2, Circle, XCircle, AlertTriangle,
  ChevronRight, Terminal, Info, Database, Building2, Calendar,
  Clock, ShieldAlert, Download, Upload, Eye, TableProperties,
  Hash, Rows, BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { executeConsolidacaoEntregasPipeline, montarNomeAba } from "@/app/actions/import-entregas-action"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StageStatus = "idle" | "running" | "done" | "error" | "warn"
interface Stage { id: string; label: string; description: string; status: StageStatus }
interface LogEntry { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }
interface DuplicadaInfo { viagens: string; data: string; motorista: string; filial: string }

// NOVO: resultado da análise local de cada arquivo (zero Firebase)
interface AnaliseArquivo {
  id: string        // id da filial (ex: "cambe")
  cd: string        // label curto (ex: "CAMBE")
  regiao: string    // ex: "RK01"
  fileName: string  // nome original do File
  colunas: number   // colunas de dados detectadas
  linhas: number    // registros processados
  abaAlvo: string   // aba(s) lida(s)
  dados: any[]      // registros em memória
  fileSize: number
}

// ─── Filiais ──────────────────────────────────────────────────────────────────
const FILIAIS = [
  { id: "cambe",        label: "CAMBE.xlsx",       regiao: "RK01" },
  { id: "cascavel",     label: "CASCAVEL.xlsx",     regiao: "KP01" },
  { id: "curitiba",     label: "CURITIBA.xlsx",     regiao: "RK03" },
  { id: "campo-grande", label: "CAMPO GRANDE.xlsx", regiao: "BV01" },
  { id: "dourados",     label: "DOURADOS.xlsx",     regiao: "BV02" },
]

const MAPA_FILIAL: Record<string, string> = {
  "cambe": "Cambe", "cascavel": "Cascavel", "curitiba": "Curitiba",
  "campo-grande": "Campo Grande", "dourados": "Dourados",
}
const MAPA_REGIAO: Record<string, string> = {
  "Cambe": "RK01", "Cascavel": "KP01", "Curitiba": "RK03",
  "Campo Grande": "BV01", "Dourados": "BV02",
}

// ─── Etapas ───────────────────────────────────────────────────────────────────
const STAGES_DIA: Stage[] = [
  { id: "load",  label: "Carregar arquivos",    description: "Lê os arquivos de cada filial selecionada",          status: "idle" },
  { id: "sheet", label: "Localizar aba",        description: "Busca a aba DD.MM.YYYY em cada arquivo",             status: "idle" },
  { id: "parse", label: "Processar registros",  description: "Extrai tabelas · PLACA fallback · TEMPO HH:MM",      status: "idle" },
  { id: "ready", label: "Pronto para ação",     description: "Importe para Firebase ou baixe o Excel",             status: "idle" },
]

const STAGES_MES: Stage[] = [
  { id: "load",  label: "Carregar arquivo",     description: "Lê um arquivo por vez",                              status: "idle" },
  { id: "scan",  label: "Varrer abas do mês",   description: "Filtra abas DD.MM.YYYY do mês/ano selecionado",      status: "idle" },
  { id: "parse", label: "Processar registros",  description: "Extrai tabelas de cada aba encontrada",              status: "idle" },
  { id: "ready", label: "Pronto para ação",     description: "Importe para Firebase ou baixe o Excel",             status: "idle" },
]

// Etapas usadas durante a importação Firebase (mantém as antigas)
const STAGES_IMPORT_DIA: Stage[] = [
  { id: "load",  label: "Carregar arquivos",    description: "Lê os arquivos de cada filial selecionada",          status: "idle" },
  { id: "sheet", label: "Localizar aba",        description: "Busca a aba DD.MM.YYYY em cada arquivo",             status: "idle" },
  { id: "dedup", label: "Verificar duplicatas", description: "1 leitura de metadata — sem ler subcoleção",         status: "idle" },
  { id: "parse", label: "Processar registros",  description: "Extrai tabelas · PLACA fallback · TEMPO HH:MM",      status: "idle" },
  { id: "accum", label: "Gerar Acumulado",      description: "Consolida filiais · remove CHÃO",                    status: "idle" },
  { id: "save",  label: "Salvar Firebase",      description: "Escreve apenas os novos itens na subcoleção items/", status: "idle" },
]
const STAGES_IMPORT_MES: Stage[] = [
  { id: "load",  label: "Carregar arquivo",     description: "Lê um arquivo por vez",                              status: "idle" },
  { id: "scan",  label: "Varrer abas do mês",   description: "Filtra abas DD.MM.YYYY do mês/ano selecionado",      status: "idle" },
  { id: "dedup", label: "Verificar duplicatas", description: "1 leitura de metadata — sem ler subcoleção",         status: "idle" },
  { id: "parse", label: "Processar registros",  description: "Extrai tabelas de cada aba encontrada",              status: "idle" },
  { id: "accum", label: "Gerar Acumulado",      description: "Consolida todos os dias · remove CHÃO",              status: "idle" },
  { id: "save",  label: "Salvar Firebase",      description: "Escreve apenas os novos itens na subcoleção items/", status: "idle" },
]

const REGRAS = [
  { condition: "Registros CHÃO",     result: "Removidos apenas no Acumulado",           variant: "warn"    as const },
  { condition: "PLACA vazia",        result: "Substituída por PLACA SISTEMA",            variant: "info"    as const },
  { condition: "TEMPO",              result: "Convertido para HH:MM",                   variant: "info"    as const },
  { condition: "Viagens duplicadas", result: "Ignoradas, já existem no Firebase",        variant: "warn"    as const },
  { condition: "Doc no banco",       result: "1 por mês — nunca recria, só acrescenta",  variant: "success" as const },
]

// ─── Helpers de estilo ────────────────────────────────────────────────────────
function StageIcon({ status }: { status: StageStatus }) {
  if (status === "running") return <Loader2 className="size-4 animate-spin text-primary shrink-0" />
  if (status === "done")    return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
  if (status === "error")   return <XCircle className="size-4 text-destructive shrink-0" />
  if (status === "warn")    return <AlertTriangle className="size-4 text-amber-500 shrink-0" />
  return <Circle className="size-4 text-muted-foreground/30 shrink-0" />
}

const stageBg: Record<StageStatus, string> = {
  idle:    "bg-muted/20 border-border/40",
  running: "bg-primary/5 border-primary/30",
  done:    "bg-emerald-50 border-emerald-200",
  error:   "bg-red-50 border-red-200",
  warn:    "bg-amber-50 border-amber-200",
}
const stageLbl: Record<StageStatus, string> = {
  idle:    "text-muted-foreground",
  running: "text-primary font-semibold",
  done:    "text-emerald-700 font-medium",
  error:   "text-red-700 font-semibold",
  warn:    "text-amber-700 font-medium",
}
const ruleColor = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger:  "border-red-200 bg-red-50 text-red-700",
  warn:    "border-amber-200 bg-amber-50 text-amber-700",
  info:    "border-blue-200 bg-blue-50 text-blue-700",
}
const logColor: Record<LogEntry["type"], string> = {
  info:    "text-slate-400",
  success: "text-emerald-400",
  error:   "text-red-400 font-semibold",
  warn:    "text-amber-400",
  step:    "text-primary font-semibold",
}
const logPrefix: Record<LogEntry["type"], string> = {
  info: "   ", success: "✅ ", error: "❌ ", warn: "⚠️  ", step: "▶  ",
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── Parse local (browser) — espelha parseSheetWithHeaderDetection do server ─
function removeAcentos(txt: string): string {
  return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
}
function norm(s: string): string {
  return removeAcentos(s).replace(/\s+/g, " ").trim()
}
function findCol(keys: string[], ...pats: RegExp[]): string | undefined {
  for (const pat of pats) {
    const f = keys.find(k => pat.test(norm(k)))
    if (f) return f
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function formatarTempo(valor: any): string {
  if (valor == null || valor === "") return ""
 
  // Caso 1: objeto Date gerado pelo cellDates:true
  // Dec 30 1899 é a época zero do Excel → extrai só HH:MM
  if (valor instanceof Date) {
    const h = valor.getHours()
    const m = valor.getMinutes()
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
 
  // Caso 2: número decimal (fração de dia) — o mais comum com cellDates:false
  const num = Number(valor)
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60)
    return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`
  }
 
  // Caso 3: número inteiro > 1 = pode ser segundos ou minutos totais (raro)
  // ignora e cai no tratamento de string
 
  // Caso 4: string "HH:MM" ou "HH:MM:SS"
  const str = String(valor).trim()
  const match = str.match(/^(\d+):(\d{2})(?::\d{2})?$/)
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`
 
  return str
}

// ─── parseSheetLocal ──────────────────────────────────────────────────────────
// Detecta todos os blocos DATA+MOTORISTA+PESO na aba, igual ao Python.
// Para cada bloco captura category_name (col índice 5) e os dados até o
// próximo bloco. Retorna rows com __rota__, __destino__ e __colNames__.
function parseSheetLocal(sheet: XLSX.WorkSheet): { rows: any[]; colNames: string[] } {
  if (!sheet || !sheet["!ref"]) return { rows: [], colNames: [] }

  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, blankrows: true, defval: undefined,
  })

  // ── 1. Acha o PRIMEIRO cabeçalho principal (tem MOTORISTA + PESO + DATA) ──
  // Igual ao Python: "DATA" in row_values and "MOTORISTA" in row_values and "PESO" in row_values
  let firstHeaderIndex = -1
  let mainHeaderRow: any[] = []

  for (let i = 0; i < Math.min(rawData.length, 30); i++) {
    const rowVals = (rawData[i] ?? []).map(v => String(v ?? "").trim().toUpperCase())
    if (
      rowVals.includes("DATA") &&
      rowVals.includes("MOTORISTA") &&
      rowVals.includes("PESO")
    ) {
      firstHeaderIndex = i
      mainHeaderRow    = rawData[i] ?? []
      break
    }
  }

  if (firstHeaderIndex === -1) return { rows: [], colNames: [] }

  // ── 2. Monta nomes de coluna do cabeçalho principal ───────────────────────
  const colNames: string[] = []
  const counts: Record<string, number> = {}
  for (let i = 0; i < mainHeaderRow.length; i++) {
    let name = mainHeaderRow[i] != null ? String(mainHeaderRow[i]).trim() : `__COL_${i}`
    if (!name) name = `__COL_${i}`
    const c = counts[name] ?? 0; counts[name] = c + 1
    colNames.push(c === 0 ? name : `${name}_${c + 1}`)
  }

  // ── 3. Coleta TODOS os índices de blocos (linhas com DATA+MOTORISTA+PESO) ─
  // Igual ao Python: header_row_indices
  const headerRowIndices: number[] = [firstHeaderIndex]
  for (let i = firstHeaderIndex + 1; i < rawData.length; i++) {
    const rowVals = (rawData[i] ?? []).map(v => String(v ?? "").trim().toUpperCase())
    if (
      rowVals.includes("DATA") &&
      rowVals.includes("MOTORISTA") &&
      rowVals.includes("PESO")
    ) {
      headerRowIndices.push(i)
    }
  }

  // ── 4. Processa cada bloco ────────────────────────────────────────────────
  const result: any[] = []

  for (let b = 0; b < headerRowIndices.length; b++) {
    const startIdx = headerRowIndices[b]
    const endIdx   = b + 1 < headerRowIndices.length
      ? headerRowIndices[b + 1]
      : rawData.length

    // category_name = df.iloc[start_idx, 5]  → índice 5 = coluna F
    const categoryName = String(rawData[startIdx]?.[5] ?? "").trim()

    // Dados do bloco: linhas startIdx+1 até endIdx (exclusive)
    for (let r = startIdx + 1; r < endIdx; r++) {
      const row = rawData[r]
      if (!row) continue
      if (row.every((v: any) => v == null || v === "")) continue

      // Monta objeto com os nomes de coluna do cabeçalho principal
      const obj: Record<string, any> = {}
      for (let c = 0; c < colNames.length; c++) {
        const val = row[c]
        if (val != null && val !== "") obj[colNames[c]] = val
      }
      if (Object.keys(obj).length === 0) continue

      // __rota__    = category_name do bloco (col F do sub-cabeçalho)
      // __destino__ = valor da col F nos dados (table_data.iloc[:, 5])
      obj.__rota__    = categoryName
      obj.__destino__ = String(row[5] ?? "").trim()   // col F dos dados = DESTINO

      result.push(obj)
    }
  }

  Object.assign(result, { __colNames__: colNames })
  return { rows: result, colNames }
}

// ─── processarRowsLocal ───────────────────────────────────────────────────────
// Sem filtro de CHÃO (a Visão Analítica filtra depois).
// Ordem de colunas igual ao Python: ordem_colunas do bloco 6.
// CATEGORIA_ORIGEM = __rota__, DESTINO = __destino__
function processarRowsLocal(rows: any[], filialNome: string, dataEntrega: string): any[] {
  if (!rows.length) return []
  const keys: string[] = (rows as any).__colNames__ ?? Object.keys(rows[0] ?? {})

  // Detecta colunas pelo nome (igual ao findCol já existente no arquivo)
  const colData       = findCol(keys, /^DATA$/)
  const colMotorista  = findCol(keys, /^MOTORISTA$/)
  const colAjudante1  = findCol(keys, /^AJUDANTE$/)
  // Python mantém AJUDANTE_1 como alias — tenta variações
  const colAjudante2  = findCol(keys, /^AJUDANTE.?1$/, /^AJUDANTE.?2$/, /^AJUDANTE_1$/)
  const colPlaca      = findCol(keys, /^PLACA$/)
  const colPlacaSis   = findCol(keys, /PLACA.?SISTEMA/)
  const colEntregas   = findCol(keys, /^ENTREGAS$/)
  const colPeso       = findCol(keys, /^PESO$/)
  const colTempo      = findCol(keys, /^TEMPO$/)
  const colKm         = findCol(keys, /^KM$/)
  // Python usa LIQUIDAÇÃO → VIAGEM ou ID → VIAGEM
  const colViagens    = findCol(keys, /LIQUIDA/, /VIAGEN/, /^ID$/)
  const colObs        = findCol(keys, /OBSERVA/)
  const colChapa      = findCol(keys, /^CHAPA$/)
  const colFrete      = findCol(keys, /^FRETE$/)
  // Python mescla DESCARGA PLT + DESCARGA PALET → DESCARGA
  const colDescarga   = findCol(keys, /DESCARGA/)
  const colHospedagem = findCol(keys, /HOSPED/)
  const colDiaria     = findCol(keys, /^DIARIA$/, /^DIÁRIA$/)
  const colExtra      = findCol(keys, /^EXTRA$/)
  const colSaida      = findCol(keys, /^SA[IÍ]DA$/)
  const colModelo     = findCol(keys, /^MODELO$/)
  const colOcp        = findCol(keys, /^OCP$/)
  const colValor      = findCol(keys, /^VALOR$/)
  const colStatus     = findCol(keys, /^STATUS$/)
  const colContrato   = findCol(keys, /^CONTRATO$/)
  const colPerforma   = findCol(keys, /PERFORMAXXI/)
  const colEntDev     = findCol(keys, /ENTREGAS.?DEV/)
  const colValorDev   = findCol(keys, /VALOR.?DEV/)
  const colTipoJust   = findCol(keys, /TIPO.?DE.?JUST/, /JUSTIF/)

  const resultado: any[] = []

  for (const row of rows) {
    const dataVal = colData ? row[colData] : null
    if (!dataVal) continue

    // Igual ao Python: ignora linhas com TOTAL/GERAL/CARGAS/FROTA/FRETE no campo DATA
    if (/TOTAL|GERAL|CARGAS|FROTA|FRETE/.test(String(dataVal).toUpperCase())) continue

    const motoristaVal = colMotorista ? row[colMotorista] : null
    if (!motoristaVal) continue
    if (String(motoristaVal).toUpperCase() === "MOTORISTA") continue

    // PLACA: prefere PLACA, fallback PLACA SISTEMA (igual ao Python)
    let placa = colPlaca ? (row[colPlaca] ?? null) : null
    if (!placa && colPlacaSis) placa = row[colPlacaSis] ?? null

    // CATEGORIA_ORIGEM = valor do sub-cabeçalho do bloco (col F)
    const categoriaOrigem = String(row.__rota__    ?? "").trim()
    // DESTINO = valor da col F nos dados (vazio em filiais sem essa coluna)
    const destino         = String(row.__destino__ ?? "").trim()

    // Ordem igual ao Python (ordem_colunas bloco 6 + acumulado bloco 7)
    resultado.push({
      "FILIAL":           filialNome,
      "REGIÃO":           MAPA_REGIAO[filialNome] ?? "",
      "DATA DE ENTREGA":  dataEntrega,
      "DATA":             dataVal,
      "MOTORISTA":        motoristaVal,
      "AJUDANTE":         colAjudante1  ? (row[colAjudante1] ?? null) : null,
      "AJUDANTE 2":       colAjudante2  ? (row[colAjudante2] ?? null) : null,
      "CATEGORIA_ORIGEM": categoriaOrigem,
      "DESTINO":          destino || null,
      "PLACA SISTEMA":    colPlacaSis   ? (row[colPlacaSis]  ?? null) : null,
      "PLACA":            placa,
      "ENTREGAS":         colEntregas   ? (row[colEntregas]  ?? null) : null,
      "PESO":             colPeso       ? (row[colPeso]      ?? null) : null,
      "TEMPO":            colTempo      ? formatarTempo(row[colTempo]) : "",
      "KM":               colKm         ? (row[colKm]        ?? null) : null,
      "VIAGENS":          colViagens    ? (row[colViagens]   ?? null) : null,
      "OBSERVAÇÃO":       colObs        ? (row[colObs]       ?? null) : null,
      "CHAPA":            colChapa      ? (row[colChapa]     ?? null) : null,
      "FRETE":            colFrete      ? (row[colFrete]     ?? null) : null,
      "DESCARGA PALET":   colDescarga   ? (row[colDescarga]  ?? null) : null,
      "HOSPEDAGEM":       colHospedagem ? (row[colHospedagem]?? null) : null,
      "DIARIA":           colDiaria     ? (row[colDiaria]    ?? null) : null,
      "EXTRA":            colExtra      ? (row[colExtra]     ?? null) : null,
      "SAÍDA":            colSaida      ? (row[colSaida]     ?? null) : null,
      "MODELO":           colModelo     ? (row[colModelo]    ?? null) : null,
      "OCP":              colOcp        ? (row[colOcp]       ?? null) : null,
      "CONTRATO":         colContrato   ? (row[colContrato]  ?? null) : null,
      "STATUS":           colStatus     ? (row[colStatus]    ?? null) : null,
      "VALOR":            colValor      ? (row[colValor]     ?? null) : null,
      "PERFORMAXXI":      colPerforma   ? (row[colPerforma]  ?? null) : null,
      "ENTREGAS DEV":     colEntDev     ? (row[colEntDev]    ?? null) : null,
      "VALOR DEV":        colValorDev   ? (row[colValorDev]  ?? null) : null,
      "TIPO JUSTIFICATIVA": colTipoJust ? (row[colTipoJust]  ?? null) : null,
    })
  }

  return resultado
}

// ─────────────────────────────────────────────────────────────────────────────
function serialParaData(serial: any): string {
  if (serial == null || serial === "") return ""
 
  // Se já é string no formato DD/MM/YYYY ou DD.MM.YYYY → retorna como está
  const str = String(serial).trim()
  if (/^\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}$/.test(str)) return str
 
  // Converte número serial Excel → Date
  // Excel epoch: 1 = 01/01/1900, com bug do ano 1900 (leap year falso)
  const num = Number(serial)
  if (!isNaN(num) && num > 1000) {
    // Fórmula padrão: epoch Excel = 25569 dias até 01/01/1970
    const ms = (num - 25569) * 86400 * 1000
    const d = new Date(ms)
    // Ajusta para UTC para evitar offset de fuso
    const day   = String(d.getUTCDate()).padStart(2, "0")
    const month = String(d.getUTCMonth() + 1).padStart(2, "0")
    const year  = d.getUTCFullYear()
    return `${day}/${month}/${year}`
  }
 
  return str
}

// ─── Dialog de duplicadas ─────────────────────────────────────────────────────
function DuplicadasDialog({ open, onClose, duplicadas }: {
  open: boolean; onClose: () => void; duplicadas: DuplicadaInfo[]
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-amber-500" />
            Viagens não importadas — já existem no banco
          </DialogTitle>
          <DialogDescription className="text-xs">
            Já constam no Firebase e <strong>não foram cadastradas novamente</strong>.
            Para substituir, apague os registros na Visão Analítica antes de reimportar.
          </DialogDescription>
        </DialogHeader>
        <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-700 bg-amber-50 w-fit">
          {duplicadas.length} viagem{duplicadas.length !== 1 ? "ns" : ""} ignorada{duplicadas.length !== 1 ? "s" : ""}
        </Badge>
        <ScrollArea className="flex-1 rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/30 border-b sticky top-0">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Viagens</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Data</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Motorista</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Filial</th>
              </tr>
            </thead>
            <tbody>
              {duplicadas.map((d, i) => (
                <tr key={i} className={cn("border-b", i % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                  <td className="px-3 py-2 font-mono text-amber-700">{d.viagens}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.data}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{d.motorista}</td>
                  <td className="px-3 py-2">{d.filial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <DialogFooter className="pt-2">
          <DialogClose asChild>
            <Button size="sm" className="gap-1.5">
              <CheckCircle2 className="size-3.5" /> Entendido
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tabela de Análise ────────────────────────────────────────────────────────
function TabelaAnalise({ analises }: { analises: AnaliseArquivo[] }) {
  if (analises.length === 0) return null
  const totalLinhas = analises.reduce((s, a) => s + a.linhas, 0)

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TableProperties className="size-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Resultado da Análise
          </span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-300 text-emerald-700 bg-emerald-50">
            {analises.length} arquivo{analises.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground italic">
          zero leituras Firebase
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b bg-muted/5">
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">
                <div className="flex items-center gap-1.5"><Building2 className="size-3" /> CD</div>
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Arquivo</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Aba processada</th>
              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                <div className="flex items-center justify-center gap-1.5"><Hash className="size-3" /> Colunas</div>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                <div className="flex items-center justify-center gap-1.5"><Rows className="size-3" /> Linhas</div>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Tamanho</th>
              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {analises.map((a, i) => (
              <tr key={a.id} className={cn("border-b hover:bg-muted/5 transition-colors", i % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                      {a.regiao}
                    </span>
                    <span className="font-semibold">{a.cd}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-muted-foreground truncate max-w-[140px] block" title={a.fileName}>
                    {a.fileName}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[10px] bg-muted/30 px-1.5 py-0.5 rounded">{a.abaAlvo || "—"}</span>
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-blue-600">{a.colunas}</td>
                <td className="px-3 py-2.5 text-center font-bold text-primary">{a.linhas.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtSize(a.fileSize)}</td>
                <td className="px-3 py-2.5 text-center">
                  {a.linhas > 0
                    ? <Badge className="text-[9px] h-4 px-1.5 bg-emerald-100 text-emerald-700 border-emerald-200">✓ OK</Badge>
                    : <Badge className="text-[9px] h-4 px-1.5 bg-amber-100 text-amber-700 border-amber-200">Vazio</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/10">
              <td className="px-3 py-2.5 font-bold text-foreground" colSpan={3}>Total</td>
              <td className="px-3 py-2.5 text-center font-bold text-blue-600">—</td>
              <td className="px-3 py-2.5 text-center font-bold text-primary">{totalLinhas.toLocaleString("pt-BR")}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Painel de ações pós-análise ──────────────────────────────────────────────
function PainelAcoes({ analises, onImportar, onBaixarExcel, isImporting, importDone, stats, duplicadas, onVerDuplicadas }: {
  analises: AnaliseArquivo[]
  onImportar: () => void
  onBaixarExcel: () => void
  isImporting: boolean
  importDone: boolean
  stats: { filiaisOk: number; novos: number; total: number; duplicadas: number } | null
  duplicadas: DuplicadaInfo[]
  onVerDuplicadas: () => void
}) {
  const total = analises.reduce((s, a) => s + a.linhas, 0)
  return (
    <div className="rounded-xl border-2 border-primary/20 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-primary/10 bg-primary/5 flex items-center gap-2">
        <Eye className="size-4 text-primary" />
        <span className="text-xs font-bold text-primary">O que deseja fazer com os dados analisados?</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{total.toLocaleString("pt-BR")} registros em memória</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/20 rounded-lg px-3 py-2.5 border border-border/40">
          <Info className="size-3.5 shrink-0 mt-0.5 text-blue-500" />
          <span>
            Dados <strong>apenas em memória</strong> — nenhum custo Firebase gerado até agora. Escolha a ação:
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Baixar Excel */}
          <button
            onClick={onBaixarExcel}
            disabled={isImporting}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all group",
              "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <div className="size-9 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
              <Download className="size-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-800">Baixar Excel</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">Gera .xlsx local · zero Firebase</p>
            </div>
          </button>

          {/* Importar Firebase */}
          <button
            onClick={onImportar}
            disabled={isImporting || importDone}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all group",
              importDone
                ? "border-emerald-300 bg-emerald-50 cursor-default"
                : "border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            <div className={cn("size-9 rounded-lg flex items-center justify-center transition-colors",
              importDone ? "bg-emerald-100" : "bg-blue-100 group-hover:bg-blue-200")}>
              {isImporting
                ? <Loader2 className="size-4 text-blue-600 animate-spin" />
                : importDone
                  ? <CheckCircle2 className="size-4 text-emerald-600" />
                  : <Upload className="size-4 text-blue-600" />}
            </div>
            <div>
              <p className={cn("text-xs font-bold", importDone ? "text-emerald-800" : "text-blue-800")}>
                {importDone ? "Importado!" : isImporting ? "Importando..." : "Importar Firebase"}
              </p>
              <p className={cn("text-[10px] mt-0.5", importDone ? "text-emerald-600" : "text-blue-600")}>
                {importDone ? "Dados salvos com sucesso" : "Grava no banco de dados"}
              </p>
            </div>
          </button>
        </div>

        {/* Stats pós-importação */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-center">
              <p className="text-sm font-bold text-primary">{stats.filiaisOk}/5</p>
              <p className="text-[10px] text-muted-foreground">Filiais</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-center">
              <p className="text-sm font-bold text-foreground">{stats.novos.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-muted-foreground">Novos registros</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
              <p className="text-sm font-bold text-emerald-700">{stats.total.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-muted-foreground">Total no banco</p>
            </div>
          </div>
        )}

        {/* Banner duplicadas */}
        {duplicadas.length > 0 && (
          <button
            onClick={onVerDuplicadas}
            className="w-full flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left hover:bg-amber-100 transition-colors"
          >
            <ShieldAlert className="size-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-amber-800">
                {duplicadas.length} viagem{duplicadas.length !== 1 ? "ns" : ""} não importada{duplicadas.length !== 1 ? "s" : ""}
              </p>
              <p className="text-[10px] text-amber-600">Já existem no banco. Clique para ver os detalhes.</p>
            </div>
            <ChevronRight className="size-3.5 text-amber-500 shrink-0" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ConsolidacaoEntregasPipelineView() {
  const today = new Date()

  const [year,  setYear]  = React.useState(today.getFullYear())
  const [month, setMonth] = React.useState(today.getMonth() + 1)
  const [day,   setDay]   = React.useState<number>(today.getDate())

  const [files, setFiles] = React.useState<Record<string, File | null>>({})

  // ── estado de análise local (etapa 1 — zero Firebase) ────────────────────
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [analises,    setAnalises]    = React.useState<AnaliseArquivo[]>([])
  const [analiseDone, setAnaliseDone] = React.useState(false)

  // ── estado de importação Firebase (etapa 2 — só se o usuário pedir) ──────
  const [isImporting, setIsImporting] = React.useState(false)
  const [importDone,  setImportDone]  = React.useState(false)

  const [progress, setProgress] = React.useState(0)
  const [stages,   setStages]   = React.useState<Stage[]>(STAGES_DIA)
  const [logs,     setLogs]     = React.useState<LogEntry[]>([])
  const [stats,    setStats]    = React.useState<{
    filiaisOk: number; novos: number; total: number; duplicadas: number
  } | null>(null)

  const [duplicadas,     setDuplicadas]     = React.useState<DuplicadaInfo[]>([])
  const [showDuplicadas, setShowDuplicadas] = React.useState(false)

  const logEndRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const modoMesCompleto = day === 0

  React.useEffect(() => {
    // etapas mudam conforme análise ativa ou não
    if (isImporting || importDone) return
    const base = analiseDone
      ? (modoMesCompleto ? STAGES_MES : STAGES_DIA)
      : (modoMesCompleto ? STAGES_MES : STAGES_DIA)
    setStages(base.map(s => ({ ...s, status: "idle" })))
  }, [modoMesCompleto])

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") =>
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString("pt-BR"), message, type }])

  const setStage = (id: string, status: StageStatus) =>
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))

  const resetAnalise = () => {
    setStages((modoMesCompleto ? STAGES_MES : STAGES_DIA).map(s => ({ ...s, status: "idle" })))
    setProgress(0); setStats(null)
    setAnalises([]); setAnaliseDone(false)
    setImportDone(false); setDuplicadas([]); setShowDuplicadas(false)
  }

  const canAnalyze = FILIAIS.some(f => files[f.id])
  const abaPreview = day > 0 ? montarNomeAba(day, month, year) : null

  const handleFileChange = (id: string, file: File | null) => {
    setFiles(prev => ({ ...prev, [id]: file }))
    if (analiseDone) resetAnalise()
  }

  // ── ETAPA 1: Análise local no browser — zero Firebase ────────────────────
  const runAnalise = async () => {
    if (!canAnalyze) return
    setIsAnalyzing(true); setLogs([]); resetAnalise()

    try {
      const selecionados = FILIAIS.filter(f => files[f.id])
      const modoLabel = day > 0
        ? `aba ${montarNomeAba(day, month, year)}`
        : `mês ${String(month).padStart(2, "0")}/${year} completo`

      addLog(`Análise local — ${modoLabel}`, "step")
      addLog(`${selecionados.length} filial(is): ${selecionados.map(f => f.regiao).join(" · ")}`)
      if (modoMesCompleto) addLog("Modo mês completo — pode ser demorado para arquivos grandes.", "warn")

      setStage("load", "running"); setProgress(10)
      await new Promise(r => setTimeout(r, 80))
      selecionados.forEach(f => {
        const sz = files[f.id]?.size ?? 0
        addLog(`• [${f.regiao}] ${f.label} — ${fmtSize(sz)}${sz > 5 * 1024 * 1024 ? " ⚠️ arquivo grande" : ""}`)
      })
      setStage("load", "done"); setProgress(20)

      const stage2id = modoMesCompleto ? "scan" : "sheet"
      addLog(day > 0 ? `Localizando aba "${abaPreview}"...` : "Varrendo abas do mês...", "step")
      setStage(stage2id, "running"); setProgress(35)

      const novasAnalises: AnaliseArquivo[] = []

      for (const filial of selecionados) {
        const file = files[filial.id]!
        const buffer = await file.arrayBuffer()
        const filialNome = MAPA_FILIAL[filial.id] ?? "Desconhecida"

        if (day > 0) {
          const abaAlvo = montarNomeAba(day, month, year)
          const wb = XLSX.read(buffer, { type: "array", cellDates: true, sheets: abaAlvo })

          if (!wb.SheetNames.includes(abaAlvo)) {
            addLog(`[${filial.regiao}] Aba "${abaAlvo}" não encontrada — pulando.`, "warn")
            continue
          }

          const { rows, colNames } = parseSheetLocal(wb.Sheets[abaAlvo])
          const dataEntrega = abaAlvo.replace(/\./g, "/")
          const dados = processarRowsLocal(rows, filialNome, dataEntrega)

          novasAnalises.push({
            id: filial.id, cd: filial.label.replace(".xlsx", ""),
            regiao: filial.regiao, fileName: file.name,
            colunas: colNames.filter(c => !c.startsWith("__")).length,
            linhas: dados.length, abaAlvo, dados, fileSize: file.size,
          })
          addLog(`• [${filial.regiao}] ${dados.length} registros — aba ${abaAlvo}`, "success")

        } else {
          const wb = XLSX.read(buffer, { type: "array", cellDates: true })
          const abasMes = wb.SheetNames.filter(name => {
            const m = name.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
            return m && parseInt(m[2]) === month && parseInt(m[3]) === year
          })

          if (abasMes.length === 0) {
            addLog(`[${filial.regiao}] Nenhuma aba do mês encontrada — pulando.`, "warn")
            continue
          }

          let todosDados: any[] = []
          let colunasMax = 0
          for (const abaAlvo of abasMes) {
            const { rows, colNames } = parseSheetLocal(wb.Sheets[abaAlvo])
            const dados = processarRowsLocal(rows, filialNome, abaAlvo.replace(/\./g, "/"))
            todosDados = todosDados.concat(dados)
            colunasMax = Math.max(colunasMax, colNames.filter(c => !c.startsWith("__")).length)
          }

          novasAnalises.push({
            id: filial.id, cd: filial.label.replace(".xlsx", ""),
            regiao: filial.regiao, fileName: file.name,
            colunas: colunasMax, linhas: todosDados.length,
            abaAlvo: `${abasMes.length} aba(s)`, dados: todosDados, fileSize: file.size,
          })
          addLog(`• [${filial.regiao}] ${todosDados.length} registros de ${abasMes.length} aba(s)`, "success")
        }
      }

      setStage(stage2id, "done"); setProgress(70)
      setStage("parse", "running"); setProgress(85)
      await new Promise(r => setTimeout(r, 60))
      setStage("parse", "done")
      setStage("ready", "done"); setProgress(100)

      setAnalises(novasAnalises)
      setAnaliseDone(true)

      const totalLins = novasAnalises.reduce((s, a) => s + a.linhas, 0)
      addLog(`Análise concluída — ${totalLins.toLocaleString("pt-BR")} registros em memória · zero Firebase.`, "success")
      addLog("Escolha: baixar Excel ou importar para Firebase.", "step")

      toast({ title: "Análise concluída", description: `${totalLins.toLocaleString("pt-BR")} registros prontos · sem custo Firebase` })

    } catch (err: any) {
      addLog(`FALHA: ${err.message}`, "error")
      setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
      setProgress(0)
      toast({ variant: "destructive", title: "Erro na análise", description: err.message })
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── ETAPA 2a: Baixar Excel sem Firebase ──────────────────────────────────
  const handleBaixarExcel = () => {
    if (!analises.length) return
    try {
      const wb = XLSX.utils.book_new()
      for (const a of analises) {
        if (!a.dados.length) continue
        const semChao = a.dados.filter(r => removeAcentos(String(r["ROTA"] ?? "")).trim() !== "TESTE")
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(semChao), a.cd.slice(0, 31))
      }
      const acumulado = analises.flatMap(a =>
        a.dados.filter(r => removeAcentos(String(r["ROTA"] ?? "")).trim() !== "TESTE")
      )
      if (acumulado.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acumulado), "Acumulado")

      const nome = day > 0
        ? `Entregas_${String(day).padStart(2,"0")}-${String(month).padStart(2,"0")}-${year}.xlsx`
        : `Entregas_${String(month).padStart(2,"0")}-${year}.xlsx`

      XLSX.writeFile(wb, nome)
      addLog(`Excel gerado: ${nome}`, "success")
      toast({ title: "Excel baixado", description: nome })
    } catch (err: any) {
      addLog(`Erro ao gerar Excel: ${err.message}`, "error")
      toast({ variant: "destructive", title: "Erro ao gerar Excel", description: err.message })
    }
  }

  // ── ETAPA 2b: Importar para Firebase (só se o usuário quiser) ────────────
  const handleImportar = async () => {
    if (!analises.length || isImporting || importDone) return
    setIsImporting(true)

    // Troca as etapas laterais para o modo importação
    const importStages = modoMesCompleto ? STAGES_IMPORT_MES : STAGES_IMPORT_DIA
    setStages(importStages.map(s => ({ ...s, status: "idle" })))
    setProgress(0)

    addLog("Iniciando importação para Firebase...", "step")

    try {
      const selecionados = FILIAIS.filter(f => files[f.id])
      const modoLabel = day > 0
        ? `aba ${montarNomeAba(day, month, year)}`
        : `mês ${String(month).padStart(2, "0")}/${year} completo`

      setStage("load", "running"); setProgress(8)
      await new Promise(r => setTimeout(r, 80))
      selecionados.forEach(f => {
        const sz = files[f.id]?.size ?? 0
        addLog(`• [${f.regiao}] ${f.label} — ${fmtSize(sz)}`)
      })
      setStage("load", "done"); setProgress(15)

      const formData = new FormData()
      formData.append("year",  String(year))
      formData.append("month", String(month))
      formData.append("day",   String(day))
      if (day > 0) formData.append("sheetName", montarNomeAba(day, month, year))
      for (const filial of FILIAIS) {
        if (files[filial.id]) {
          formData.append("files",     files[filial.id]!)
          formData.append("fileNames", files[filial.id]!.name)
        }
      }

      const stage2id = modoMesCompleto ? "scan" : "sheet"
      addLog(day > 0 ? `Localizando aba "${abaPreview}"...` : "Varrendo abas do mês...", "step")
      setStage(stage2id, "running"); setProgress(25)
      setStage("dedup", "running"); setProgress(35)
      addLog("Verificando duplicatas (1 leitura de metadata)...", "info")

      const response = await executeConsolidacaoEntregasPipeline(formData)

      if (!response.success) {
        const msg = response.error ?? "Erro desconhecido"
        addLog(`FALHA: ${msg}`, "error")
        if (msg.includes("não foi encontrada")) {
          addLog(`Dica: verifique se o arquivo contém a aba "${abaPreview}".`, "warn")
          addLog(`Formato esperado: DD.MM.YYYY — ex: ${abaPreview}`, "warn")
        }
        setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
        setProgress(0)
        toast({ variant: "destructive", title: "Erro na importação", description: msg })
        return
      }

      setStage(stage2id, "done")
      setStage("dedup", "done"); setProgress(55)
      addLog("Duplicatas verificadas.", "success")

      setStage("parse", "running"); setProgress(68)
      await new Promise(r => setTimeout(r, 80))
      setStage("parse", "done"); setProgress(80)
      addLog("Registros extraídos e padronizados.", "success")

      addLog("Gerando Acumulado — removendo CHÃO...", "step")
      setStage("accum", "running"); setProgress(90)
      await new Promise(r => setTimeout(r, 60))
      setStage("accum", "done")

      setStage("save", "running"); setProgress(97)
      const result = response.result

      const dups: DuplicadaInfo[] = (result as any).duplicadas ?? []
      if (dups.length > 0) {
        setDuplicadas(dups)
        addLog(`${dups.length} viagem(ns) ignorada(s) — já existem no banco.`, "warn")
        setTimeout(() => setShowDuplicadas(true), 400)
      }

      const m = (result.summary ?? "").match(/(\d+) filiais? · (\d+) novos · (\d+) total/)
      if (m) setStats({ filiaisOk: parseInt(m[1]), novos: parseInt(m[2]), total: parseInt(m[3]), duplicadas: dups.length })

      addLog("Dados sincronizados com Firebase.", "success")
      setStage("save", "done"); setProgress(100)
      addLog(result.summary ?? "Pipeline concluído.", "success")
      setImportDone(true)

      toast({
        title: "Importação concluída",
        description: dups.length > 0 ? `${result.summary} — verifique as duplicatas.` : result.summary,
      })

    } catch (err: any) {
      addLog(`FALHA: ${err.message}`, "error")
      setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
      setProgress(0)
      toast({ variant: "destructive", title: "Erro na importação", description: err.message })
    } finally {
      setIsImporting(false)
    }
  }

  const doneCount = stages.filter(s => s.status === "done" || s.status === "warn").length
  const hasError  = stages.some(s => s.status === "error")

  return (
    <div className="space-y-6">

      {/* Alert */}
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidação de Entregas</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Analisa localmente primeiro (zero Firebase). Depois escolha: baixar Excel ou importar.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          <strong>Novo fluxo:</strong> Analise primeiro (zero custo) → veja a tabela de resultados →
          escolha <strong>Baixar Excel</strong> ou <strong>Importar para Firebase</strong>.
          Com <strong>dia preenchido</strong> → lê apenas aquela aba.
          Com <strong>dia 0</strong> → lê o mês completo.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                Configuração da Consolidação
              </CardTitle>
              <CardDescription>Selecione o período e os arquivos de cada filial.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Período */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Ano
                    <TooltipProvider><Tooltip>
                      <TooltipTrigger asChild><HelpCircle className="size-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent><p>Ano de referência. Ex: <strong>2026</strong>.</p></TooltipContent>
                    </Tooltip></TooltipProvider>
                  </Label>
                  <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Mês
                    <TooltipProvider><Tooltip>
                      <TooltipTrigger asChild><HelpCircle className="size-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent><p>Mês (1–12). Ex: <strong>3</strong> para março.</p></TooltipContent>
                    </Tooltip></TooltipProvider>
                  </Label>
                  <Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Dia
                    <TooltipProvider><Tooltip>
                      <TooltipTrigger asChild><HelpCircle className="size-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent><p>Dia específico → aba <span className="font-mono">DD.MM.YYYY</span>.<br/>Deixe <strong>0</strong> para o mês todo.</p></TooltipContent>
                    </Tooltip></TooltipProvider>
                  </Label>
                  <Input
                    type="number" min={0} max={31}
                    value={day === 0 ? "" : day}
                    placeholder="0 = mês todo"
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      setDay(isNaN(v) || v < 0 ? 0 : Math.min(v, 31))
                      if (analiseDone) resetAnalise()
                    }}
                  />
                </div>
              </div>

              {/* Preview do modo */}
              {modoMesCompleto ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <Clock className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-700">
                    <span className="font-semibold">Modo mês completo</span> — todas as abas{" "}
                    <span className="font-mono">DD.{String(month).padStart(2,"0")}.{year}</span>{" "}
                    serão analisadas localmente.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <Calendar className="size-3.5 text-primary shrink-0" />
                  <span className="text-[11px] text-primary">
                    Aba alvo: <span className="font-mono font-bold">{abaPreview}</span>
                    <span className="text-muted-foreground ml-2">— apenas esta aba será analisada</span>
                  </span>
                </div>
              )}

              <AIParamAssistant
                onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }}
                currentMonth={month} currentYear={year}
              />

              {/* Filiais */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-primary">
                  Arquivos de Controle ({FILIAIS.filter(f => files[f.id]).length}/{FILIAIS.length} selecionados)
                </Label>
                <div className="space-y-1.5 rounded-xl border border-border/60 p-2 bg-muted/5">
                  {FILIAIS.map(filial => {
                    const hasFile = !!files[filial.id]
                    const sz      = files[filial.id]?.size ?? 0
                    const isBig   = hasFile && sz > 5 * 1024 * 1024
                    const analise = analises.find(a => a.id === filial.id)
                    return (
                      <div key={filial.id} className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                        hasFile ? "bg-emerald-50 border-emerald-200" : "bg-background border-border/40 hover:bg-muted/10"
                      )}>
                        <FileSpreadsheet className={cn("size-4 shrink-0", hasFile ? "text-emerald-600" : "text-primary/50")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                              hasFile ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                            )}>
                              {filial.regiao}
                            </span>
                            <span className="text-xs font-semibold truncate">
                              CONTROLE DE DISTRIBUIÇÃO — {filial.label}
                            </span>
                            {isBig && (
                              <Badge className="text-[9px] h-4 px-1.5 bg-amber-100 text-amber-700 border-amber-200">
                                {fmtSize(sz)} — arquivo grande
                              </Badge>
                            )}
                            {analise && (
                              <Badge className="text-[9px] h-4 px-1.5 bg-blue-100 text-blue-700 border-blue-200">
                                {analise.linhas} linhas · {analise.colunas} cols
                              </Badge>
                            )}
                          </div>
                          {hasFile
                            ? <span className="text-[11px] text-emerald-600 font-medium truncate block mt-0.5">
                                {files[filial.id]?.name}
                                {!isBig && <span className="text-muted-foreground ml-1">({fmtSize(sz)})</span>}
                              </span>
                            : <span className="text-[11px] text-muted-foreground italic mt-0.5 block">
                                Nenhum arquivo selecionado
                              </span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasFile && (
                            <Button variant="ghost" size="icon" className="size-6"
                              onClick={() => handleFileChange(filial.id, null)}>
                              <Trash2 className="size-3 text-destructive/70" />
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => document.getElementById(`file-ent-${filial.id}`)?.click()}>
                            {hasFile ? "Trocar" : "Selecionar"}
                          </Button>
                        </div>
                        <input
                          id={`file-ent-${filial.id}`} type="file" className="hidden" accept=".xlsx,.xls"
                          onChange={e => handleFileChange(filial.id, e.target.files?.[0] || null)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Progresso */}
              {(isAnalyzing || isImporting || progress > 0) && (
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {hasError
                        ? "Erro na execução"
                        : isImporting
                          ? "Importando para Firebase..."
                          : progress === 100
                            ? "Análise concluída"
                            : "Analisando localmente..."}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className={cn("h-2", hasError && "[&>div]:bg-destructive")} />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>{doneCount}/{stages.length} etapas</span>
                    <span>
                      {isAnalyzing || isImporting
                        ? (stages.find(s => s.status === "running")?.label ?? "...")
                        : progress === 100 ? "Pipeline finalizado" : ""}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 pb-4">
              <Button
                size="sm" className="w-full h-9 text-xs font-semibold shadow-sm"
                onClick={analiseDone ? resetAnalise : runAnalise}
                disabled={isAnalyzing || isImporting || (!canAnalyze && !analiseDone)}
                variant={analiseDone ? "outline" : "default"}
              >
                {isAnalyzing
                  ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Analisando...</>
                  : analiseDone
                    ? <><BarChart3 className="mr-1.5 size-3.5" /> Nova Análise</>
                    : <><Eye className="mr-1.5 size-3.5" /> Analisar Arquivos</>}
              </Button>
            </CardFooter>
          </Card>

          {/* ── Tabela de resultado (aparece após análise) ── */}
          {analiseDone && <TabelaAnalise analises={analises} />}

          {/* ── Painel de ações (aparece após análise) ── */}
          {analiseDone && (
            <PainelAcoes
              analises={analises}
              onImportar={handleImportar}
              onBaixarExcel={handleBaixarExcel}
              isImporting={isImporting}
              importDone={importDone}
              stats={stats}
              duplicadas={duplicadas}
              onVerDuplicadas={() => setShowDuplicadas(true)}
            />
          )}
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-4">

          {/* Etapas */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Etapas — {modoMesCompleto ? "Mês Completo" : "Dia Específico"}
              </span>
            </div>
            <div className="p-3 space-y-2">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-0.5">
                    <StageIcon status={stage.status} />
                    {idx < stages.length - 1 && (
                      <div className={cn("w-px mt-1 min-h-[14px]",
                        stage.status === "done" ? "bg-emerald-300" : "bg-border/60")} />
                    )}
                  </div>
                  <div className={cn("flex-1 px-2.5 py-1.5 rounded-lg border text-xs transition-all", stageBg[stage.status])}>
                    <p className={cn("leading-tight", stageLbl[stage.status])}>{stage.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stage.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats pós-importação */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: "Filiais",             value: `${stats.filiaisOk}/5`,              icon: Building2,    highlight: false, warn: false },
                { label: "Novos registros",     value: stats.novos.toLocaleString("pt-BR"), icon: Database,     highlight: false, warn: false },
                { label: "Total no banco",      value: stats.total.toLocaleString("pt-BR"), icon: CheckCircle2, highlight: true,  warn: false, span: true },
                ...(stats.duplicadas > 0 ? [{ label: "Duplicadas ignoradas", value: stats.duplicadas.toLocaleString("pt-BR"), icon: ShieldAlert, highlight: false, warn: true, span: true }] : []),
              ] as any[]).map((stat: any) => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={cn(
                    "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
                    stat.span ? "col-span-2" : "",
                    stat.warn ? "bg-amber-50 border-amber-200" : stat.highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border/60"
                  )}>
                    <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0",
                      stat.warn ? "bg-amber-100" : stat.highlight ? "bg-primary/10" : "bg-muted/30")}>
                      <Icon className={cn("size-3.5",
                        stat.warn ? "text-amber-500" : stat.highlight ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-bold leading-tight",
                        stat.warn ? "text-amber-700" : stat.highlight ? "text-primary" : "text-foreground")}>
                        {stat.value}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Regras */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Regras</span>
            </div>
            <div className="p-3 space-y-1.5">
              {REGRAS.map((rule, idx) => (
                <div key={idx} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]", ruleColor[rule.variant])}>
                  <ChevronRight className="size-3 mt-0.5 shrink-0 opacity-60" />
                  <div>
                    <span className="font-semibold">{rule.condition}</span>
                    <span className="mx-1 opacity-50">→</span>
                    <span>{rule.result}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Console */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Console</span>
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                  limpar
                </button>
              )}
            </div>
            <ScrollArea className="h-[240px] bg-slate-950">
              <div className="p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0
                  ? <span className="text-slate-500 italic">Aguardando análise...</span>
                  : logs.map((log, i) => (
                    <div key={i} className={cn("flex gap-1.5", logColor[log.type])}>
                      <span className="text-slate-600 shrink-0">{log.time}</span>
                      <span className="shrink-0">{logPrefix[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>

        </div>
      </div>

      <DuplicadasDialog
        open={showDuplicadas}
        onClose={() => setShowDuplicadas(false)}
        duplicadas={duplicadas}
      />
    </div>
  )
}