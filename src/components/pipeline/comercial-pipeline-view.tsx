"use client";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  ChangeEvent,
  FC,
  JSX,
} from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Filter,
  Package,
  Users,
  Download,
  GitBranch,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge }   from "@/components/ui/badge";
import { Button }  from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Faixa   = "30+" | "10-29" | "8-9" | "0-7";
type TabId   = "upload" | "analise" | "tabela" | "organograma";
type SortDir = 1 | -1;

/** Uma linha do arquivo principal já enriquecida com hierarquia */
interface RowData {
  _arquivo: string;
  _aba: string;
  // ── colunas do arquivo principal ──
  DM_FILIAL: string;
  DT_FATURAMENTO: string;
  DT_RETORNO: string;
  DT_FECHAMENTO: string;
  DIAS_ABERTO: string;
  CARGA: string;
  VIAGEM: string;
  PEDIDO: string;
  TIPO_OPERACAO: string;
  NOTA: string;
  MUNICIPIO: string;
  ENDERECO: string;
  COD_CLIENTE: string;
  LOJA: string;
  CLIENTE: string;
  FATURAMENTO: string;
  FATURAMENTO_DEV: string;
  VOLUME: string;
  VOLUME_DEV: string;
  PESO: string;
  PESO_DEV: string;
  MOTIVO_DEV: string;
  COD: string;        // código do vendedor — chave do join com hierarquia
  VENDEDOR: string;
  COD_USUARIO: string;
  USUARIO: string;
  STATUS: string;
  MOTIVO: string;
  DATA_AGENDAMENTO: string;
  DATA_PLANEJADA: string;
  OBS: string;
  // ── colunas vindas do join com hierarquia ──
  COD_DIRETOR: string;
  DIRETOR: string;
  COD_REGIAO: string;
  FECHAMENTO_HIER: string;  // coluna FECHAMENTO da hierarquia (evita conflito)
  GERENTE: string;
  LOCAL: string;
  COD_SUPERVISOR: string;
  SUPERVISOR: string;
  REGIAO: string;
  FLAG_SEM_SUPERVISOR: string;
  FLAG_SEM_REGIAO: string;
  FLAG_SEM_DIRETOR: string;
}

/** Linha lida da planilha de hierarquia */
interface HierRow {
  COD_DIRETOR: string;
  DIRETOR: string;
  COD_REGIAO: string;
  FECHAMENTO: string;
  GERENTE: string;
  LOCAL: string;
  COD_SUPERVISOR: string;
  SUPERVISOR: string;
  REGIAO: string;
  COD_VENDEDOR: string;
  VENDEDOR: string;
  FLAG_SEM_SUPERVISOR: string;
  FLAG_SEM_REGIAO: string;
  FLAG_SEM_DIRETOR: string;
}

interface ArquivoProcessado {
  arquivo: string;
  aba: string;
  totalLinhas: number;
  rows: RowData[];
}

interface ResumoItem {
  label: string;
  viagens: number;   // contagem DISTINTA de VIAGEM
  regs: number;
}

interface TableCol {
  key: keyof RowData;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Campos do arquivo principal */
const CAMPOS_PRINCIPAL = [
  "DM_FILIAL","DT_FATURAMENTO","DT_RETORNO","DT_FECHAMENTO","DIAS_ABERTO",
  "CARGA","VIAGEM","PEDIDO","TIPO_OPERACAO","NOTA","MUNICIPIO","ENDERECO",
  "COD_CLIENTE","LOJA","CLIENTE","FATURAMENTO","FATURAMENTO_DEV","VOLUME",
  "VOLUME_DEV","PESO","PESO_DEV","MOTIVO_DEV","COD","VENDEDOR","COD_USUARIO",
  "USUARIO","STATUS","MOTIVO","DATA_AGENDAMENTO","DATA_PLANEJADA","OBS",
] as const;

/** Campos da hierarquia */
const CAMPOS_HIER = [
  "COD_DIRETOR","DIRETOR","COD_REGIAO","FECHAMENTO","GERENTE","LOCAL",
  "COD_SUPERVISOR","SUPERVISOR","REGIAO","COD_VENDEDOR","VENDEDOR",
  "FLAG_SEM_SUPERVISOR","FLAG_SEM_REGIAO","FLAG_SEM_DIRETOR",
] as const;

const DATE_CAMPOS = new Set([
  "DT_FATURAMENTO","DT_RETORNO","DT_FECHAMENTO","DATA_AGENDAMENTO","DATA_PLANEJADA",
]);

const FAIXAS: Faixa[] = ["30+", "10-29", "8-9", "0-7"];

const FAIXA_META: Record<Faixa, { label: string; textCn: string; chipCn: string }> = {
  "30+":   { label: "+30 dias",   textCn: "text-destructive",      chipCn: "bg-destructive/10 text-destructive border-destructive/30"    },
  "10-29": { label: "10–29 dias", textCn: "text-yellow-500",       chipCn: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"       },
  "8-9":   { label: "8–9 dias",   textCn: "text-emerald-500",      chipCn: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"    },
  "0-7":   { label: "≤ 7 dias",   textCn: "text-muted-foreground", chipCn: "bg-muted text-muted-foreground border-border"                },
};

/** Colunas exibidas na tabela detalhada — agora inclui hierarquia */
const TABLE_COLS: TableCol[] = [
  { key: "STATUS",           label: "Status"         },
  { key: "MOTIVO",           label: "Motivo"         },
  { key: "DM_FILIAL",        label: "Filial"         },
  { key: "GERENTE",          label: "Gerente"        },
  { key: "SUPERVISOR",       label: "Supervisor"     },
  { key: "REGIAO",           label: "Região"         },
  { key: "VENDEDOR",         label: "Vendedor"       },
  { key: "CLIENTE",          label: "Cliente"        },
  { key: "MUNICIPIO",        label: "Município"      },
  { key: "VIAGEM",           label: "Viagem"         },
  { key: "DT_FATURAMENTO",   label: "Dt. Fatur."    },
  { key: "DIAS_ABERTO",      label: "Dias"           },
  { key: "DATA_AGENDAMENTO", label: "Agendamento"   },
  { key: "DATA_PLANEJADA",   label: "Planejada"     },
  { key: "FATURAMENTO",      label: "Faturamento"   },
  { key: "PESO",             label: "Peso (kg)"     },
  { key: "TIPO_OPERACAO",    label: "Tipo Op."      },
  { key: "COD",              label: "Cód. Vend."    },
  { key: "OBS",              label: "OBS"            },
];

const PER_PAGE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — leitura / normalização
// ─────────────────────────────────────────────────────────────────────────────

function normKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toLocaleDateString("pt-BR");
  return String(v).trim();
}

function parseDateStr(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toLocaleDateString("pt-BR");
  const n = Number(v);
  if (!isNaN(n) && n > 1000) {
    const ssf = (XLSX.SSF as unknown as {
      parse_date_code: (n: number) => { d: number; m: number; y: number } | null;
    }).parse_date_code(n);
    if (ssf)
      return `${String(ssf.d).padStart(2,"0")}/${String(ssf.m).padStart(2,"0")}/${ssf.y}`;
  }
  return String(v).trim();
}

function encontrarAba(wb: XLSX.WorkBook): string | null {
  const abas = wb.SheetNames.map((n) => ({ o: n, n: normKey(n) }));
  return (
    abas.find((a) => a.n === "BANCO DE DADOS")?.o ??
    abas.find((a) => a.n === "NAO MEXER")?.o ??
    wb.SheetNames[0] ??
    null
  );
}

function buildColMap(rawRows: Record<string, unknown>[]): Record<string, string> {
  const map: Record<string, string> = {};
  Object.keys(rawRows[0] ?? {}).forEach((k) => { map[normKey(k)] = k; });
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// HIERARQUIA — leitura e índice para join
// ─────────────────────────────────────────────────────────────────────────────

function lerHierarquia(file: File): Promise<HierRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (!raw.length) throw new Error(`Hierarquia vazia em "${file.name}"`);
        const colMap = buildColMap(raw);
        const rows: HierRow[] = raw.map((r) => {
          const g = (campo: string) => normVal(r[colMap[campo] ?? ""] ?? "");
          return {
            COD_DIRETOR:       g("COD_DIRETOR"),
            DIRETOR:           g("DIRETOR"),
            COD_REGIAO:        g("COD_REGIAO"),
            FECHAMENTO:        g("FECHAMENTO"),
            GERENTE:           g("GERENTE"),
            LOCAL:             g("LOCAL"),
            COD_SUPERVISOR:    g("COD_SUPERVISOR"),
            SUPERVISOR:        g("SUPERVISOR"),
            REGIAO:            g("REGIAO"),
            COD_VENDEDOR:      g("COD_VENDEDOR"),
            VENDEDOR:          g("VENDEDOR"),
            FLAG_SEM_SUPERVISOR: g("FLAG_SEM_SUPERVISOR"),
            FLAG_SEM_REGIAO:     g("FLAG_SEM_REGIAO"),
            FLAG_SEM_DIRETOR:    g("FLAG_SEM_DIRETOR"),
          };
        });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error(`Falha ao ler hierarquia "${file.name}"`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Monta índice { codVendedor → HierRow } normalizando o código como inteiro string
 * para evitar problema de "1" vs "1.0".
 */
function buildHierIndex(hierRows: HierRow[]): Map<string, HierRow> {
  const idx = new Map<string, HierRow>();
  for (const h of hierRows) {
    const cod = normalizarCod(h.COD_VENDEDOR);
    if (cod) idx.set(cod, h);
  }
  return idx;
}

function normalizarCod(v: string): string {
  const n = parseFloat(v);
  return isNaN(n) ? v.trim() : String(Math.round(n));
}

/** Enriquece um RowData com campos da hierarquia via join por COD */
function enriquecerComHier(row: RowData, idx: Map<string, HierRow>): RowData {
  const cod = normalizarCod(row.COD);
  const h   = idx.get(cod);
  if (!h) return row;
  return {
    ...row,
    COD_DIRETOR:       h.COD_DIRETOR,
    DIRETOR:           h.DIRETOR,
    COD_REGIAO:        h.COD_REGIAO,
    FECHAMENTO_HIER:   h.FECHAMENTO,
    GERENTE:           h.GERENTE,
    LOCAL:             h.LOCAL,
    COD_SUPERVISOR:    h.COD_SUPERVISOR,
    SUPERVISOR:        h.SUPERVISOR,
    REGIAO:            h.REGIAO,
    FLAG_SEM_SUPERVISOR: h.FLAG_SEM_SUPERVISOR,
    FLAG_SEM_REGIAO:     h.FLAG_SEM_REGIAO,
    FLAG_SEM_DIRETOR:    h.FLAG_SEM_DIRETOR,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSAMENTO DO ARQUIVO PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

function processarArquivo(
  file: File,
  hierIdx: Map<string, HierRow>
): Promise<ArquivoProcessado> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = XLSX.read(e.target?.result, { type: "array", cellDates: true });
        const aba = encontrarAba(wb);
        if (!aba) throw new Error(`Nenhuma aba válida em "${file.name}"`);

        const sheet   = wb.Sheets[aba];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (!rawRows.length) throw new Error(`Aba "${aba}" vazia em "${file.name}"`);

        const colMap = buildColMap(rawRows);

        const HIER_DEFAULTS: Pick<
          RowData,
          "COD_DIRETOR"|"DIRETOR"|"COD_REGIAO"|"FECHAMENTO_HIER"|"GERENTE"|"LOCAL"|
          "COD_SUPERVISOR"|"SUPERVISOR"|"REGIAO"|"FLAG_SEM_SUPERVISOR"|"FLAG_SEM_REGIAO"|"FLAG_SEM_DIRETOR"
        > = {
          COD_DIRETOR:"", DIRETOR:"", COD_REGIAO:"", FECHAMENTO_HIER:"",
          GERENTE:"", LOCAL:"", COD_SUPERVISOR:"", SUPERVISOR:"", REGIAO:"",
          FLAG_SEM_SUPERVISOR:"", FLAG_SEM_REGIAO:"", FLAG_SEM_DIRETOR:"",
        };

        const rows: RowData[] = rawRows.map((raw) => {
          const obj: RowData = {
            _arquivo: file.name,
            _aba:     aba,
            ...HIER_DEFAULTS,
          } as RowData;

          for (const campo of CAMPOS_PRINCIPAL) {
            const originalKey = colMap[campo];
            const rawVal      = originalKey != null ? raw[originalKey] : undefined;
            (obj as Record<string, string>)[campo] = DATE_CAMPOS.has(campo)
              ? parseDateStr(rawVal)
              : normVal(rawVal);
          }

          // Recalcula DIAS_ABERTO se vazio
          if (!obj.DIAS_ABERTO && obj.DT_FATURAMENTO) {
            const parts = obj.DT_FATURAMENTO.split("/");
            if (parts.length === 3) {
              const dt = new Date(+parts[2], +parts[1] - 1, +parts[0]);
              if (!isNaN(dt.getTime()))
                obj.DIAS_ABERTO = String(Math.floor((Date.now() - dt.getTime()) / 86_400_000));
            }
          }

          return hierIdx.size > 0 ? enriquecerComHier(obj, hierIdx) : obj;
        });

        resolve({ arquivo: file.name, aba, totalLinhas: rows.length, rows });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}"`));
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — análise
// ─────────────────────────────────────────────────────────────────────────────

function faixaDias(d: string | number): Faixa {
  const n = parseInt(String(d)) || 0;
  if (n >= 30) return "30+";
  if (n >= 10) return "10-29";
  if (n >= 8)  return "8-9";
  return "0-7";
}

function contarPor(rows: RowData[], campo: keyof RowData): ResumoItem[] {
  const map = new Map<string, { viagens: Set<string>; regs: number }>();
  for (const r of rows) {
    const k     = r[campo] || "N/A";
    const entry = map.get(k) ?? { viagens: new Set<string>(), regs: 0 };
    entry.viagens.add(r.VIAGEM);
    entry.regs++;
    map.set(k, entry);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, viagens: v.viagens.size, regs: v.regs }))
    .sort((a, b) => b.viagens - a.viagens);
}

function contarFaixas(rows: RowData[]): Record<Faixa, number> {
  const m: Record<Faixa, Set<string>> = {
    "30+": new Set(), "10-29": new Set(), "8-9": new Set(), "0-7": new Set(),
  };
  for (const r of rows) m[faixaDias(r.DIAS_ABERTO)].add(r.VIAGEM);
  return { "30+": m["30+"].size, "10-29": m["10-29"].size, "8-9": m["8-9"].size, "0-7": m["0-7"].size };
}

function kpisPorFilial(
  rows: RowData[], filial: string
): Record<Faixa, number> & { total: number } {
  const vMap: Record<string, number> = {};
  for (const r of rows.filter((r) => r.DM_FILIAL === filial)) {
    const d = parseInt(r.DIAS_ABERTO) || 0;
    if (vMap[r.VIAGEM] == null || d > vMap[r.VIAGEM]) vMap[r.VIAGEM] = d;
  }
  const vals = Object.values(vMap);
  return {
    total:   vals.length,
    "30+":   vals.filter((d) => d >= 30).length,
    "10-29": vals.filter((d) => d >= 10 && d < 30).length,
    "8-9":   vals.filter((d) => d >= 8 && d <= 9).length,
    "0-7":   vals.filter((d) => d <= 7).length,
  };
}

function fmtBRL(v: string): string {
  const n = parseFloat(v.replace(",", "."));
  if (isNaN(n) || n === 0) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sortRows(arr: RowData[], col: keyof RowData, dir: SortDir): RowData[] {
  return [...arr].sort((a, b) => {
    const va = a[col] ?? "", vb = b[col] ?? "";
    const na = parseFloat(String(va).replace(",", "."));
    const nb = parseFloat(String(vb).replace(",", "."));
    if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
    return String(va).localeCompare(String(vb), "pt-BR") * dir;
  });
}

function uniqSorted(arr: string[]): string[] {
  return [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTAR EXCEL
// ─────────────────────────────────────────────────────────────────────────────

function exportarExcel(rows: RowData[]): void {
  if (!rows.length) return;
  const COLS: { key: keyof RowData; label: string }[] = [
    { key: "DM_FILIAL",        label: "Filial"           },
    { key: "GERENTE",          label: "Gerente"          },
    { key: "SUPERVISOR",       label: "Supervisor"       },
    { key: "REGIAO",           label: "Região"           },
    { key: "COD",              label: "Cód. Vendedor"    },
    { key: "VENDEDOR",         label: "Vendedor"         },
    { key: "STATUS",           label: "Status"           },
    { key: "MOTIVO",           label: "Motivo"           },
    { key: "VIAGEM",           label: "Viagem"           },
    { key: "CLIENTE",          label: "Cliente"          },
    { key: "MUNICIPIO",        label: "Município"        },
    { key: "ENDERECO",         label: "Endereço"         },
    { key: "COD_CLIENTE",      label: "Cód. Cliente"     },
    { key: "PEDIDO",           label: "Pedido"           },
    { key: "NOTA",             label: "Nota"             },
    { key: "TIPO_OPERACAO",    label: "Tipo Operação"    },
    { key: "DT_FATURAMENTO",   label: "Dt. Faturamento"  },
    { key: "DIAS_ABERTO",      label: "Dias Aberto"      },
    { key: "DATA_AGENDAMENTO", label: "Dt. Agendamento"  },
    { key: "DATA_PLANEJADA",   label: "Dt. Planejada"    },
    { key: "FATURAMENTO",      label: "Faturamento (R$)" },
    { key: "PESO",             label: "Peso (kg)"        },
    { key: "VOLUME",           label: "Volume"           },
    { key: "MOTIVO_DEV",       label: "Motivo Dev."      },
    { key: "LOCAL",            label: "Local"            },
    { key: "DIRETOR",          label: "Diretor"          },
    { key: "OBS",              label: "OBS"              },
    { key: "_arquivo",         label: "Arquivo Origem"   },
  ];
  const numericKeys = new Set<keyof RowData>(["DIAS_ABERTO","FATURAMENTO","PESO","VOLUME","VIAGEM","PEDIDO","NOTA"]);
  const data = rows.map((r) => {
    const obj: Record<string, string | number> = {};
    for (const col of COLS) {
      const v    = r[col.key];
      const asN  = parseFloat(String(v).replace(",", "."));
      obj[col.label] = numericKeys.has(col.key) && !isNaN(asN) ? asN : (v || "");
    }
    return obj;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = COLS.map((col) => ({
    wch: Math.max(col.label.length, ...data.slice(0, 50).map((row) => String(row[col.label] ?? "").length)) + 2,
  }));
  XLSX.utils.book_append_sheet(wb, ws, "Visao Comercial");
  const ts = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  XLSX.writeFile(wb, `Visao_Comercial_${ts}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const StatusBadge: FC<{ v: string }> = ({ v }) => {
  if (!v) return <Badge variant="outline" className="text-xs font-mono">N/A</Badge>;
  const u = v.toUpperCase();
  if (u.includes("CHÃO") || u.includes("CHAO"))
    return <Badge className="text-xs font-mono bg-destructive/15 text-destructive border border-destructive/30">⚠ {v}</Badge>;
  if (u.includes("AGEND"))
    return <Badge className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-400/30">📅 {v}</Badge>;
  if (u.includes("ENTREGUE") || u === "OK")
    return <Badge className="text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-400/30">✓ {v}</Badge>;
  return <Badge className="text-xs font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-400/30">⏳ {v}</Badge>;
};

const DiasBadge: FC<{ v: string }> = ({ v }) => {
  const f = faixaDias(v);
  return (
    <span className={cn("text-xs font-mono font-bold px-2 py-0.5 rounded-full border", FAIXA_META[f].chipCn)}>
      {v || "0"}d
    </span>
  );
};

const ProgressBar: FC<{ pct: number }> = ({ pct }) => (
  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
    <div
      className="h-full rounded-full bg-primary transition-all duration-500"
      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
    />
  </div>
);

const EmptyState: FC<{ msg?: string }> = ({ msg }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
    <Package className="h-10 w-10 opacity-30" />
    <p className="text-sm font-medium">{msg ?? "Nenhum dado carregado."}</p>
    {!msg && <p className="text-xs">Vá na aba <strong>Upload</strong> e selecione seus arquivos.</p>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ZONE
// ─────────────────────────────────────────────────────────────────────────────

interface UploadZoneProps {
  onDados:      (files: File[]) => void;
  onHierarquia: (file: File)    => void;
  loadingDados: boolean;
  loadingHier:  boolean;
  progresso:    string;
  erro:         string | null;
  arquivos:     ArquivoProcessado[];
  hierarquia:   { nome: string; linhas: number } | null;
  onRemoveDados:     (nome: string) => void;
  onRemoveHierarquia: () => void;
}

const UploadZone: FC<UploadZoneProps> = ({
  onDados, onHierarquia,
  loadingDados, loadingHier,
  progresso, erro,
  arquivos, hierarquia,
  onRemoveDados, onRemoveHierarquia,
}) => {
  const inputDadosRef = useRef<HTMLInputElement>(null);
  const inputHierRef  = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* ── Arquivo principal ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          1 · Arquivos principais (Banco de Dados) — até 5
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragging(false);
            const files = Array.from(e.dataTransfer.files).filter(
              (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
            );
            if (files.length) onDados(files);
          }}
          onClick={() => inputDadosRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/30"
          )}
        >
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold">Arraste ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground">
            Lê a aba <strong>Banco de Dados</strong> (fallback: <strong>nao mexer</strong>)
          </p>
          <Button size="sm" variant="outline" disabled={loadingDados} tabIndex={-1}>
            <Upload className="h-3.5 w-3.5 mr-2" />
            {loadingDados ? "Processando..." : "Selecionar .xlsx"}
          </Button>
          <input
            ref={inputDadosRef} type="file" accept=".xlsx,.xls" multiple
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onDados(files);
              if (inputDadosRef.current) inputDadosRef.current.value = "";
            }}
            disabled={loadingDados} className="hidden"
          />
        </div>
      </div>

      {/* ── Hierarquia ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          2 · Arquivo de Hierarquia (opcional — enriquece com Gerente / Supervisor / Região)
        </p>
        <div
          onClick={() => inputHierRef.current?.click()}
          className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border p-4 cursor-pointer hover:border-primary/50 hover:bg-accent/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            {hierarquia ? (
              <div>
                <p className="text-sm font-medium">{hierarquia.nome}</p>
                <p className="text-xs text-muted-foreground font-mono">{hierarquia.linhas.toLocaleString("pt-BR")} linhas de hierarquia</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecionar planilha de hierarquia...</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hierarquia && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveHierarquia(); }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <Button size="sm" variant="outline" disabled={loadingHier} tabIndex={-1}>
              {loadingHier ? "Lendo..." : "Selecionar"}
            </Button>
          </div>
          <input
            ref={inputHierRef} type="file" accept=".xlsx,.xls"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0];
              if (f) onHierarquia(f);
              if (inputHierRef.current) inputHierRef.current.value = "";
            }}
            disabled={loadingHier} className="hidden"
          />
        </div>
      </div>

      {/* Progresso / erro */}
      {progresso && (
        <p className={cn(
          "text-xs font-mono px-3 py-2 rounded-md border",
          progresso.startsWith("✅")
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : "text-muted-foreground bg-muted border-border"
        )}>{progresso}</p>
      )}
      {erro && (
        <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{erro}</span>
        </div>
      )}

      {/* Lista arquivos carregados */}
      {arquivos.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">
              {arquivos.length} arquivo(s) —{" "}
              <span className="text-primary font-mono">
                {arquivos.reduce((s, a) => s + a.totalLinhas, 0).toLocaleString("pt-BR")} registros consolidados
              </span>
              {hierarquia && (
                <span className="ml-2 text-emerald-500">· hierarquia aplicada ✓</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {arquivos.map((a) => (
              <div key={a.arquivo} className="flex items-center justify-between gap-2 text-xs rounded-md border px-3 py-2 bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="truncate font-medium">{a.arquivo}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px] font-mono">{a.aba}</Badge>
                  <span className="text-muted-foreground font-mono">{a.totalLinhas.toLocaleString("pt-BR")} linhas</span>
                  <button onClick={() => onRemoveDados(a.arquivo)} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string; value: number; sub: string;
  faixa: Faixa | ""; active: boolean; onClick: () => void;
}

const KpiCard: FC<KpiCardProps> = ({ label, value, sub, faixa, active, onClick }) => {
  const meta = faixa ? FAIXA_META[faixa] : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 min-w-[110px] text-left rounded-xl border p-4 transition-all hover:border-primary/50 hover:bg-accent/40",
        active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"
      )}
    >
      <p className={cn("text-xs font-semibold uppercase tracking-wide mb-1", meta?.textCn ?? "text-muted-foreground")}>{label}</p>
      <p className="text-3xl font-bold font-mono tracking-tight">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FILIAL CARD
// ─────────────────────────────────────────────────────────────────────────────

interface FilialCardProps {
  filial: string;
  kpis: Record<Faixa, number> & { total: number };
  activeFaixa: Faixa | "";
  onClick: () => void;
}

const FilialCard: FC<FilialCardProps> = ({ filial, kpis, activeFaixa, onClick }) => {
  const isDimmed = activeFaixa !== "" && kpis[activeFaixa] === 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-4 transition-all",
        isDimmed ? "opacity-20 pointer-events-none border-border bg-card"
                 : "border-border bg-card hover:border-primary/50 hover:bg-accent/30"
      )}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1 truncate">{filial}</p>
      <p className="text-2xl font-bold font-mono leading-none mb-3">{kpis.total}</p>
      {FAIXAS.map((f) => {
        const meta = FAIXA_META[f]; const n = kpis[f]; const pct = kpis.total > 0 ? (n / kpis.total) * 100 : 0;
        return (
          <div key={f} className="flex items-center gap-1.5 mb-1">
            <span className={cn("text-[10px] font-mono font-bold w-10 text-right shrink-0", meta.textCn)}>{f}</span>
            <ProgressBar pct={pct} />
            <span className={cn("text-[10px] font-mono font-bold w-4 text-right shrink-0", meta.textCn)}>{n}</span>
          </div>
        );
      })}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO TABLE
// ─────────────────────────────────────────────────────────────────────────────

interface ResumoTableProps { title: string; data: ResumoItem[]; totalViagens: number; }

const ResumoTable: FC<ResumoTableProps> = ({ title, data, totalViagens }) => {
  const [open, setOpen] = useState(true);
  const totalRegs = data.reduce((s, r) => s + r.regs, 0);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Valor","Viagens","%","Regs."].map((h) => (
                  <TableHead key={h} className={cn("text-[10px] uppercase tracking-wide h-8", h !== "Valor" && "text-right")}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => {
                const pct = totalViagens > 0 ? (row.viagens / totalViagens) * 100 : 0;
                return (
                  <TableRow key={i} className="hover:bg-accent/30">
                    <TableCell className="text-xs py-1.5 max-w-[180px] truncate" title={row.label}>{row.label}</TableCell>
                    <TableCell className="text-xs py-1.5 font-mono font-bold text-right">{row.viagens}</TableCell>
                    <TableCell className="py-1.5 w-28">
                      <div className="flex items-center gap-1.5">
                        <ProgressBar pct={pct} />
                        <span className="text-[10px] text-muted-foreground w-9 text-right font-mono">{pct.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] py-1.5 text-muted-foreground text-right">{row.regs}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-primary/5 border-t-2 border-primary/20 hover:bg-primary/10">
                <TableCell className="text-xs py-1.5 font-bold text-primary">Total</TableCell>
                <TableCell className="text-xs py-1.5 font-mono font-bold text-primary text-right">{totalViagens}</TableCell>
                <TableCell className="text-xs py-1.5 font-bold text-primary">100%</TableCell>
                <TableCell className="text-xs py-1.5 font-mono text-primary text-right">{totalRegs}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA TABLE
// ─────────────────────────────────────────────────────────────────────────────

const DataTable: FC<{ rows: RowData[] }> = ({ rows }) => {
  const [sortCol, setSortCol] = useState<keyof RowData>("DIAS_ABERTO");
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [page, setPage]       = useState(0);

  const sorted   = useMemo(() => sortRows(rows, sortCol, sortDir), [rows, sortCol, sortDir]);
  const pages    = Math.ceil(sorted.length / PER_PAGE);
  const pageRows = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  function doSort(col: keyof RowData): void {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortCol(col); setSortDir(-1); }
    setPage(0);
  }

  function SortIcon({ col }: { col: keyof RowData }): JSX.Element {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />;
    return sortDir === 1
      ? <ArrowUp   className="h-3 w-3 text-primary shrink-0" />
      : <ArrowDown className="h-3 w-3 text-primary shrink-0" />;
  }

  function renderCell(r: RowData, col: keyof RowData): JSX.Element {
    const v = r[col];
    switch (col) {
      case "STATUS":       return <StatusBadge v={v} />;
      case "DIAS_ABERTO":  return <DiasBadge v={v} />;
      case "DM_FILIAL":    return <span className="font-mono font-bold text-primary text-xs">{v||"—"}</span>;
      case "VIAGEM":       return <span className="font-mono font-bold text-violet-400 text-xs">{v||"—"}</span>;
      case "GERENTE":      return <span className="font-medium text-xs text-blue-400">{v||"—"}</span>;
      case "SUPERVISOR":   return <span className="text-xs text-cyan-400">{v||"—"}</span>;
      case "REGIAO":       return <span className="font-mono text-xs">{v||"—"}</span>;
      case "FATURAMENTO":  return <span className="font-mono text-xs">{fmtBRL(v)}</span>;
      default:             return <span className="text-xs">{v||"—"}</span>;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">{sorted.length.toLocaleString("pt-BR")} registros</span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p-1))} disabled={page===0} className="h-7 px-2 text-xs">‹</Button>
            <span className="text-xs text-muted-foreground px-2 font-mono">{page+1}/{pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages-1, p+1))} disabled={page===pages-1} className="h-7 px-2 text-xs">›</Button>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[420px] scrollbar-thin">
          <Table className="min-w-max w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {TABLE_COLS.map((c) => (
                  <TableHead key={c.key} onClick={() => doSort(c.key)}
                    className="text-[10px] uppercase tracking-wide h-9 cursor-pointer select-none whitespace-nowrap hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-1">{c.label}<SortIcon col={c.key} /></div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={TABLE_COLS.length} className="text-center py-10 text-muted-foreground text-sm">Nenhum registro.</TableCell></TableRow>
              ) : pageRows.map((r, i) => (
                <TableRow key={i} className="hover:bg-accent/30">
                  {TABLE_COLS.map((c) => (
                    <TableCell key={c.key} title={r[c.key]}
                      className="py-1.5 px-3 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap align-middle">
                      {renderCell(r, c.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ORGANOGRAMA
// ─────────────────────────────────────────────────────────────────────────────

interface OrganoProps { hierRows: HierRow[] }

const Organograma: FC<OrganoProps> = ({ hierRows }) => {
  const [busca, setBusca] = useState("");

  const q = busca.trim().toUpperCase();

  // Filtra pelo campo de busca
  const filtered = useMemo(() => {
    if (!q) return hierRows;
    return hierRows.filter((r) =>
      [r.VENDEDOR, r.COD_VENDEDOR, r.SUPERVISOR, r.COD_SUPERVISOR,
       r.GERENTE, r.REGIAO, r.LOCAL, r.DIRETOR]
        .some((v) => (v || "").toUpperCase().includes(q))
    );
  }, [hierRows, q]);

  // Agrupa LOCAL → COD_SUPERVISOR → vendedores
  const locais = useMemo(() => {
    const locMap = new Map<string, Map<string, HierRow[]>>();
    for (const r of filtered) {
      const loc = r.LOCAL || "—";
      const sup = r.COD_SUPERVISOR || "—";
      if (!locMap.has(loc)) locMap.set(loc, new Map());
      const supMap = locMap.get(loc)!;
      if (!supMap.has(sup)) supMap.set(sup, []);
      supMap.get(sup)!.push(r);
    }
    return locMap;
  }, [filtered]);

  // Stats gerais
  const totalVend    = new Set(hierRows.map((r) => r.COD_VENDEDOR).filter(Boolean)).size;
  const totalSup     = new Set(hierRows.map((r) => r.COD_SUPERVISOR).filter(Boolean)).size;
  const totalAtivos  = hierRows.filter((r) => r.VENDEDOR && r.VENDEDOR.toUpperCase() !== "VAGO").length;

  if (!hierRows.length) return <EmptyState msg="Nenhuma hierarquia carregada. Faça upload na aba Upload." />;

  function hl(text: string): JSX.Element {
    if (!q || !text) return <>{text || "—"}</>;
    const idx = text.toUpperCase().indexOf(q);
    if (idx < 0) return <>{text}</>;
    return <>{text.slice(0, idx)}<mark className="bg-yellow-400/40 text-foreground rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border bg-card">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar vendedor, supervisor, gerente, região..."
          className="h-8 text-xs flex-1 min-w-[220px]"
        />
        <Badge variant="outline" className="text-[10px] font-mono gap-1"><Users className="h-3 w-3" />{totalVend} vendedores</Badge>
        <Badge variant="outline" className="text-[10px] font-mono">{totalSup} supervisores</Badge>
        <Badge className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-400/30">{totalAtivos} ativos</Badge>
      </div>

      {/* Conteúdo */}
      {filtered.length === 0 ? (
        <EmptyState msg={`Nenhum resultado para "${busca}"`} />
      ) : (
        <div className="space-y-3">
          {[...locais.entries()].map(([local, supMap]) => {
            const gerente    = [...supMap.values()].flat().find((r) => r.GERENTE)?.GERENTE ?? "—";
            const codRegiao  = [...supMap.values()].flat().find((r) => r.COD_REGIAO)?.COD_REGIAO ?? "";
            const countSupLoc = supMap.size;
            return (
              <LocalBlock key={local} local={local} gerente={gerente} codRegiao={codRegiao}
                countSup={countSupLoc} supMap={supMap} hl={hl} q={q} />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── LOCAL BLOCK ───────────────────────────────────────────────────────────────

interface LocalBlockProps {
  local: string; gerente: string; codRegiao: string; countSup: number;
  supMap: Map<string, HierRow[]>;
  hl: (s: string) => JSX.Element; q: string;
}

const LocalBlock: FC<LocalBlockProps> = ({ local, gerente, codRegiao, countSup, supMap, hl, q }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className={cn("rounded-xl border overflow-hidden transition-all", open ? "border-border" : "border-border/50")}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-blue-600/80 to-cyan-600/80 hover:brightness-110 transition-all text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            {codRegiao && <span className="text-[10px] font-mono text-white/70">{codRegiao}</span>}
            <span className="font-bold text-sm text-white font-mono tracking-wide">{hl(local)}</span>
            <span className="text-[10px] bg-white/20 border border-white/30 text-white rounded-full px-2 py-0.5 font-mono">{countSup} sup.</span>
          </div>
          <p className="text-xs text-white/75 mt-0.5">{hl(gerente)}</p>
        </div>
        {open
          ? <ChevronUp   className="h-4 w-4 text-white/70 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-white/70 shrink-0" />}
      </button>

      {/* Body: grid de cartões de supervisor */}
      {open && (
        <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 bg-background">
          {[...supMap.entries()].map(([codSup, rows]) => {
            const supervisor = rows.find((r) => r.SUPERVISOR)?.SUPERVISOR ?? "—";
            const regiao     = rows.find((r) => r.REGIAO)?.REGIAO ?? "—";
            const seen       = new Set<string>();
            const vendors    = rows.filter((r) => {
              const k = `${r.COD_VENDEDOR}|${r.VENDEDOR}`;
              if (seen.has(k)) return false; seen.add(k); return true;
            });
            return (
              <div key={codSup} className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors">
                {/* Sup header */}
                <div className="px-3 py-2 border-b border-border bg-muted/40">
                  <p className="text-[10px] font-mono font-bold text-primary">{codSup}</p>
                  <p className="text-xs font-bold text-foreground font-mono">{hl(regiao)}</p>
                  <p className="text-[11px] text-muted-foreground">{hl(supervisor)}</p>
                </div>
                {/* Vendors */}
                <div className="p-2 space-y-1">
                  {vendors.map((r, vi) => {
                    const isVago = !r.VENDEDOR || r.VENDEDOR.toUpperCase() === "VAGO";
                    return (
                      <div key={vi} className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 border text-xs transition-colors",
                        isVago
                          ? "border-border/50 bg-muted/20 opacity-50"
                          : "border-border bg-background hover:border-primary/30"
                      )}>
                        <span className="font-mono font-bold text-blue-400 text-[10px] w-8 shrink-0">{r.COD_VENDEDOR || "—"}</span>
                        <span className={cn("truncate flex-1", isVago && "italic text-muted-foreground")}>
                          {isVago ? "VAGO" : hl(r.VENDEDOR)}
                        </span>
                        {r.FLAG_SEM_SUPERVISOR === "1" && (
                          <span className="text-[9px] text-yellow-500 font-bold shrink-0">S/SUP</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTER BAR
// ─────────────────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filialFiltro:    string; setFilialFiltro:    (v: string) => void; filiais:    string[];
  statusFiltro:    string; setStatusFiltro:    (v: string) => void; statuses:   string[];
  motivoFiltro:    string; setMotivoFiltro:    (v: string) => void; motivos:    string[];
  gerenteFiltro:   string; setGerenteFiltro:   (v: string) => void; gerentes:   string[];
  supervisorFiltro:string; setSupervisorFiltro:(v: string) => void; supervisores:string[];
  regiaoFiltro:    string; setRegiaoFiltro:    (v: string) => void; regioes:    string[];
  faixaFiltro:     string; setFaixaFiltro:     (v: string) => void;
  activeFaixa:     string; setActiveFaixa:     (v: string) => void;
  clienteFiltro:   string; setClienteFiltro:   (v: string) => void;
  onReset: () => void;
  extraAction?: JSX.Element;
  info?: JSX.Element;
}

const FilterBar: FC<FilterBarProps> = (props) => {
  const selects: { id: string; label: string; val: string; set: (v: string) => void; opts: string[]; placeholder: string }[] = [
    { id:"filial",    label:"Filial",      val:props.filialFiltro,     set:props.setFilialFiltro,     opts:props.filiais,      placeholder:"Todas"   },
    { id:"gerente",   label:"Gerente",     val:props.gerenteFiltro,    set:props.setGerenteFiltro,    opts:props.gerentes,     placeholder:"Todos"   },
    { id:"supervisor",label:"Supervisor",  val:props.supervisorFiltro, set:props.setSupervisorFiltro, opts:props.supervisores, placeholder:"Todos"   },
    { id:"regiao",    label:"Região",      val:props.regiaoFiltro,     set:props.setRegiaoFiltro,     opts:props.regioes,      placeholder:"Todas"   },
    { id:"status",    label:"Status",      val:props.statusFiltro,     set:props.setStatusFiltro,     opts:props.statuses,     placeholder:"Todos"   },
    { id:"motivo",    label:"Motivo",      val:props.motivoFiltro,     set:props.setMotivoFiltro,     opts:props.motivos,      placeholder:"Todos"   },
  ];

  return (
    <div className="flex flex-wrap gap-3 items-end p-3 rounded-xl border border-border bg-card">
      {selects.map(({ id, label, val, set, opts, placeholder }) => (
        <div key={id} className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
          <Select value={val || "__all__"} onValueChange={(v) => set(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs min-w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{placeholder}</SelectItem>
              {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}

      {/* Faixa dias */}
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Faixa Dias</Label>
        <Select
          value={(props.faixaFiltro || props.activeFaixa) || "__all__"}
          onValueChange={(v) => { props.setFaixaFiltro(v === "__all__" ? "" : v); props.setActiveFaixa(""); }}
        >
          <SelectTrigger className="h-8 text-xs min-w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {FAIXAS.map((f) => (
              <SelectItem key={f} value={f}>
                <span className={FAIXA_META[f].textCn}>{FAIXA_META[f].label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cliente */}
      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Cliente</Label>
        <Input
          value={props.clienteFiltro}
          onChange={(e: ChangeEvent<HTMLInputElement>) => props.setClienteFiltro(e.target.value)}
          placeholder="Buscar cliente..." className="h-8 text-xs"
        />
      </div>

      <Button variant="outline" size="sm" onClick={props.onReset} className="h-8 text-xs gap-1.5">
        <RefreshCw className="h-3 w-3" />Limpar
      </Button>

      {props.extraAction}

      {props.info && <div className="ml-auto self-end">{props.info}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────

export function VisaoComercialPage(): JSX.Element {
  const [tab,             setTab]             = useState<TabId>("upload");
  const [arquivos,        setArquivos]        = useState<ArquivoProcessado[]>([]);
  const [hierRows,        setHierRows]        = useState<HierRow[]>([]);
  const [hierMeta,        setHierMeta]        = useState<{ nome: string; linhas: number } | null>(null);
  const [hierIdx,         setHierIdx]         = useState<Map<string, HierRow>>(new Map());
  const [loadingDados,    setLoadingDados]    = useState(false);
  const [loadingHier,     setLoadingHier]     = useState(false);
  const [progresso,       setProgresso]       = useState("");
  const [erro,            setErro]            = useState<string | null>(null);

  // filtros
  const [filialFiltro,     setFilialFiltro]     = useState("");
  const [statusFiltro,     setStatusFiltro]     = useState("");
  const [motivoFiltro,     setMotivoFiltro]     = useState("");
  const [gerenteFiltro,    setGerenteFiltro]    = useState("");
  const [supervisorFiltro, setSupervisorFiltro] = useState("");
  const [regiaoFiltro,     setRegiaoFiltro]     = useState("");
  const [clienteFiltro,    setClienteFiltro]    = useState("");
  const [faixaFiltro,      setFaixaFiltro]      = useState("");
  const [activeFaixa,      setActiveFaixa]      = useState<Faixa | "">("");

  // ── dados consolidados ────────────────────────────────────────────────────
  const allRows   = useMemo(() => arquivos.flatMap((a) => a.rows), [arquivos]);
  const filiais   = useMemo(() => uniqSorted(allRows.map((r) => r.DM_FILIAL)),       [allRows]);
  const statuses  = useMemo(() => uniqSorted(allRows.map((r) => r.STATUS  || "N/A")),[allRows]);
  const motivos   = useMemo(() => uniqSorted(allRows.map((r) => r.MOTIVO).filter(Boolean)), [allRows]);
  const gerentes  = useMemo(() => uniqSorted(allRows.map((r) => r.GERENTE).filter(Boolean)), [allRows]);
  const supervisores = useMemo(() => uniqSorted(allRows.map((r) => r.SUPERVISOR).filter(Boolean)), [allRows]);
  const regioes   = useMemo(() => uniqSorted(allRows.map((r) => r.REGIAO).filter(Boolean)), [allRows]);

  // ── filtrados ─────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const fAtiva = faixaFiltro || activeFaixa;
    return allRows.filter((r) => {
      if (filialFiltro     && r.DM_FILIAL !== filialFiltro)            return false;
      if (statusFiltro     && (r.STATUS||"N/A") !== statusFiltro)      return false;
      if (motivoFiltro     && (r.MOTIVO||"") !== motivoFiltro)         return false;
      if (gerenteFiltro    && r.GERENTE !== gerenteFiltro)             return false;
      if (supervisorFiltro && r.SUPERVISOR !== supervisorFiltro)       return false;
      if (regiaoFiltro     && r.REGIAO !== regiaoFiltro)               return false;
      if (clienteFiltro    && !r.CLIENTE.toLowerCase().includes(clienteFiltro.toLowerCase())) return false;
      if (fAtiva           && faixaDias(r.DIAS_ABERTO) !== fAtiva)    return false;
      return true;
    });
  }, [allRows, filialFiltro, statusFiltro, motivoFiltro, gerenteFiltro, supervisorFiltro, regiaoFiltro, clienteFiltro, faixaFiltro, activeFaixa]);

  // ── KPIs globais (viagem mais crítica por viagem) ─────────────────────────
  const globalViaMap = useMemo(() => {
    const m: Record<string, number> = {};
    allRows.forEach((r) => {
      const d = parseInt(r.DIAS_ABERTO) || 0;
      if (m[r.VIAGEM] == null || d > m[r.VIAGEM]) m[r.VIAGEM] = d;
    });
    return m;
  }, [allRows]);

  const gVals    = Object.values(globalViaMap);
  const kpiTotal = gVals.length;
  const kpi30    = gVals.filter((d) => d >= 30).length;
  const kpi10    = gVals.filter((d) => d >= 10 && d < 30).length;
  const kpi7     = gVals.filter((d) => d >= 8 && d <= 9).length;
  const kpiM7    = gVals.filter((d) => d <= 7).length;
  const perc     = (n: number) => kpiTotal ? `${Math.round((n / kpiTotal) * 100)}% do total` : "—";

  // ── resumos filtrados ─────────────────────────────────────────────────────
  const totalViagFiltradas = useMemo(() => new Set(filtrados.map((r) => r.VIAGEM)).size, [filtrados]);
  const faixasCount  = useMemo(() => contarFaixas(filtrados), [filtrados]);
  const porStatus    = useMemo(() => contarPor(filtrados, "STATUS"),        [filtrados]);
  const porMotivo    = useMemo(() => contarPor(filtrados, "MOTIVO"),        [filtrados]);
  const porMotivoDev = useMemo(() => contarPor(filtrados, "MOTIVO_DEV"),    [filtrados]);
  const porFilial    = useMemo(() => contarPor(filtrados, "DM_FILIAL"),     [filtrados]);
  const porMunicipio = useMemo(() => contarPor(filtrados, "MUNICIPIO"),     [filtrados]);
  const porGerente   = useMemo(() => contarPor(filtrados, "GERENTE"),       [filtrados]);
  const porSupervisor= useMemo(() => contarPor(filtrados, "SUPERVISOR"),    [filtrados]);
  const porRegiao    = useMemo(() => contarPor(filtrados, "REGIAO"),        [filtrados]);
  const porVendedor  = useMemo(() => contarPor(filtrados, "VENDEDOR"),      [filtrados]);
  const porTipo      = useMemo(() => contarPor(filtrados, "TIPO_OPERACAO"), [filtrados]);

  const kpisPorFil = useMemo(
    () => Object.fromEntries(filiais.map((f) => [f, kpisPorFilial(allRows, f)])),
    [allRows, filiais]
  );

  // ── upload hierarquia ─────────────────────────────────────────────────────
  const handleHierarquia = useCallback(async (file: File): Promise<void> => {
    setLoadingHier(true); setErro(null);
    try {
      const rows = await lerHierarquia(file);
      const idx  = buildHierIndex(rows);
      setHierRows(rows);
      setHierIdx(idx);
      setHierMeta({ nome: file.name, linhas: rows.length });
      // Re-enriquece arquivos já carregados
      if (arquivos.length > 0) {
        setArquivos((prev) =>
          prev.map((a) => ({
            ...a,
            rows: a.rows.map((r) => enriquecerComHier(r, idx)),
          }))
        );
        setProgresso(`✅ Hierarquia aplicada — ${rows.length.toLocaleString("pt-BR")} linhas · ${idx.size} vendedores mapeados.`);
      } else {
        setProgresso(`✅ Hierarquia carregada — ${rows.length.toLocaleString("pt-BR")} linhas.`);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao ler hierarquia.");
    } finally {
      setLoadingHier(false);
    }
  }, [arquivos]);

  // ── upload dados ──────────────────────────────────────────────────────────
  const handleDados = useCallback(async (files: File[]): Promise<void> => {
    const novosNomes = new Set(files.map((f) => f.name));
    const mantidos   = arquivos.filter((a) => !novosNomes.has(a.arquivo));
    if (mantidos.length + files.length > 5) {
      setErro("Máximo de 5 arquivos. Remova alguns antes de adicionar mais."); return;
    }
    setLoadingDados(true); setErro(null); setProgresso("");
    try {
      const results: ArquivoProcessado[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgresso(`Lendo ${i+1}/${files.length}: ${files[i].name}...`);
        results.push(await processarArquivo(files[i], hierIdx));
      }
      const todos = [...mantidos, ...results];
      setArquivos(todos);
      setProgresso(
        `✅ ${todos.reduce((s, a) => s + a.totalLinhas, 0).toLocaleString("pt-BR")} registros em ${todos.length} arquivo(s).` +
        (hierIdx.size > 0 ? ` Hierarquia aplicada (${hierIdx.size} vendedores).` : "")
      );
      if (tab === "upload") setTab("analise");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao processar arquivo.");
    } finally {
      setLoadingDados(false);
    }
  }, [arquivos, hierIdx, tab]);

  function removeArquivo(nome: string): void {
    setArquivos((prev) => prev.filter((a) => a.arquivo !== nome));
    setProgresso("");
  }
  function removeHierarquia(): void {
    setHierRows([]); setHierIdx(new Map()); setHierMeta(null);
    // Remove enriquecimento
    setArquivos((prev) =>
      prev.map((a) => ({
        ...a,
        rows: a.rows.map((r) => ({
          ...r,
          COD_DIRETOR:"", DIRETOR:"", COD_REGIAO:"", FECHAMENTO_HIER:"",
          GERENTE:"", LOCAL:"", COD_SUPERVISOR:"", SUPERVISOR:"", REGIAO:"",
          FLAG_SEM_SUPERVISOR:"", FLAG_SEM_REGIAO:"", FLAG_SEM_DIRETOR:"",
        })),
      }))
    );
    setProgresso("");
  }

  function resetFiltros(): void {
    setFilialFiltro(""); setStatusFiltro(""); setMotivoFiltro("");
    setGerenteFiltro(""); setSupervisorFiltro(""); setRegiaoFiltro("");
    setClienteFiltro(""); setFaixaFiltro(""); setActiveFaixa("");
  }

  function handleKpiClick(f: Faixa): void {
    setActiveFaixa((a) => (a === f ? "" : f));
    setFaixaFiltro("");
  }

  const filterProps: FilterBarProps = {
    filialFiltro,     setFilialFiltro,     filiais,
    statusFiltro,     setStatusFiltro,     statuses,
    motivoFiltro,     setMotivoFiltro,     motivos,
    gerenteFiltro,    setGerenteFiltro,    gerentes,
    supervisorFiltro, setSupervisorFiltro, supervisores,
    regiaoFiltro,     setRegiaoFiltro,     regioes,
    faixaFiltro,      setFaixaFiltro,
    activeFaixa,      setActiveFaixa,
    clienteFiltro,    setClienteFiltro,
    onReset: resetFiltros,
  };

  const TABS: { id: TabId; label: string; icon: JSX.Element }[] = [
    { id: "upload",       label: "Upload",            icon: <Upload      className="h-3.5 w-3.5" /> },
    { id: "analise",      label: "Análise",           icon: <Filter      className="h-3.5 w-3.5" /> },
    { id: "tabela",       label: "Tabela Detalhada",  icon: <Package     className="h-3.5 w-3.5" /> },
    { id: "organograma",  label: "Organograma",       icon: <GitBranch   className="h-3.5 w-3.5" /> },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Visão Comercial
          </h1>
          {allRows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {arquivos.length} arquivo(s) ·{" "}
              <span className="font-mono text-foreground">{allRows.length.toLocaleString("pt-BR")}</span> registros ·{" "}
              <span className="font-mono text-primary font-bold">{kpiTotal.toLocaleString("pt-BR")}</span> viagens distintas
              {hierMeta && <span className="ml-2 text-emerald-500">· hierarquia: {hierMeta.nome}</span>}
            </p>
          )}
        </div>
        {/* badges arquivos */}
        {arquivos.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {arquivos.map((a) => (
              <Badge key={a.arquivo} variant="outline" className="text-[10px] gap-1 font-mono">
                <FileSpreadsheet className="h-3 w-3" />{a.arquivo}
                <button onClick={() => removeArquivo(a.arquivo)} className="ml-0.5 hover:text-destructive transition-colors"><X className="h-2.5 w-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── UPLOAD ── */}
      {tab === "upload" && (
        <UploadZone
          onDados={handleDados} onHierarquia={handleHierarquia}
          loadingDados={loadingDados} loadingHier={loadingHier}
          progresso={progresso} erro={erro}
          arquivos={arquivos} hierarquia={hierMeta}
          onRemoveDados={removeArquivo} onRemoveHierarquia={removeHierarquia}
        />
      )}

      {/* ── ANÁLISE ── */}
      {tab === "analise" && (
        allRows.length === 0 ? <EmptyState /> : (
          <div className="space-y-5">
            {/* KPIs */}
            <div className="flex gap-2 flex-wrap">
              <KpiCard label="Total Viagens" value={kpiTotal} sub="distintas (todos os arquivos)" faixa="" active={false}
                onClick={() => { setActiveFaixa(""); setFaixaFiltro(""); }} />
              {(["30+","10-29","8-9","0-7"] as Faixa[]).map((f, idx) => {
                const vals = [kpi30, kpi10, kpi7, kpiM7];
                return <KpiCard key={f} label={FAIXA_META[f].label} value={vals[idx]} sub={perc(vals[idx])}
                  faixa={f} active={activeFaixa === f} onClick={() => handleKpiClick(f)} />;
              })}
            </div>

            {/* Chips faixas */}
            <div className="flex gap-2 flex-wrap">
              {FAIXAS.map((f) => (
                <span key={f}
                  onClick={() => handleKpiClick(f)}
                  className={cn("text-xs px-3 py-1 rounded-full border font-mono font-bold cursor-pointer transition-all",
                    FAIXA_META[f].chipCn, activeFaixa === f && "ring-2 ring-offset-1 ring-current")}
                >
                  {FAIXA_META[f].label}: {faixasCount[f]}
                </span>
              ))}
            </div>

            {/* Filtros */}
            <FilterBar
              {...filterProps}
              info={
                <span className="text-xs text-muted-foreground font-mono">
                  <span className="text-foreground font-bold">{filtrados.length.toLocaleString("pt-BR")}</span> regs ·{" "}
                  <span className="text-primary font-bold">{totalViagFiltradas}</span> viagens
                </span>
              }
            />

            {/* Filiais */}
            {filiais.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />Por Filial — clique para filtrar
                  </p>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
                  {filiais.map((f) => (
                    <FilialCard key={f} filial={f}
                      kpis={kpisPorFil[f] ?? { total:0,"30+":0,"10-29":0,"8-9":0,"0-7":0 }}
                      activeFaixa={activeFaixa}
                      onClick={() => setFilialFiltro((v) => (v === f ? "" : f))} />
                  ))}
                </div>
              </div>
            )}

            {/* Tabelas resumo */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Análise Detalhada</p>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
                <ResumoTable title="Por Status"        data={porStatus}     totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Motivo"        data={porMotivo}     totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Motivo Dev."   data={porMotivoDev}  totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Gerente"       data={porGerente}    totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Supervisor"    data={porSupervisor} totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Região"        data={porRegiao}     totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Filial"        data={porFilial}     totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Município"     data={porMunicipio}  totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Vendedor"      data={porVendedor}   totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Tipo Operação" data={porTipo}       totalViagens={totalViagFiltradas} />
              </div>
            </div>
          </div>
        )
      )}

      {/* ── TABELA DETALHADA ── */}
      {tab === "tabela" && (
        allRows.length === 0 ? <EmptyState /> : (
          <div className="space-y-3">
            <FilterBar
              {...filterProps}
              extraAction={
                <Button variant="outline" size="sm"
                onClick={() => exportarExcel(filtrados)}>
                  <Download className="h-3 w-3" />
                  Exportar Excel ({filtrados.length.toLocaleString("pt-BR")} regs)
                </Button>
              }
            />
            <DataTable rows={filtrados} />
          </div>
        )
      )}

      {/* ── ORGANOGRAMA ── */}
      {tab === "organograma" && (
        <Organograma hierRows={hierRows} />
      )}
    </div>
  );
}

export default VisaoComercialPage;