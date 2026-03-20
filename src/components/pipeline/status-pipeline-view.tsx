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
  Download,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
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
type TabId   = "upload" | "analise" | "tabela";
type SortDir = 1 | -1;

interface RowData {
  _arquivo: string;
  _aba: string;
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
  COD: string;
  VENDEDOR: string;
  COD_USUARIO: string;
  USUARIO: string;
  STATUS: string;
  MOTIVO: string;
  DATA_AGENDAMENTO: string;
  DATA_PLANEJADA: string;
  OBS: string;
}

interface ArquivoProcessado {
  arquivo: string;
  aba: string;
  totalLinhas: number;
  rows: RowData[];
}

interface ResumoItem {
  label: string;
  /** contagem distinta de VIAGEM */
  viagens: number;
  regs: number;
}

interface TableCol {
  key: keyof RowData;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS = [
  "DM_FILIAL","DT_FATURAMENTO","DT_RETORNO","DT_FECHAMENTO","DIAS_ABERTO",
  "CARGA","VIAGEM","PEDIDO","TIPO_OPERACAO","NOTA","MUNICIPIO","ENDERECO",
  "COD_CLIENTE","LOJA","CLIENTE","FATURAMENTO","FATURAMENTO_DEV","VOLUME",
  "VOLUME_DEV","PESO","PESO_DEV","MOTIVO_DEV","COD","VENDEDOR","COD_USUARIO",
  "USUARIO","STATUS","MOTIVO","DATA_AGENDAMENTO","DATA_PLANEJADA","OBS",
] as const;

const DATE_CAMPOS = new Set([
  "DT_FATURAMENTO","DT_RETORNO","DT_FECHAMENTO","DATA_AGENDAMENTO","DATA_PLANEJADA",
]);

const FAIXAS: Faixa[] = ["30+", "10-29", "8-9", "0-7"];

const FAIXA_META: Record<Faixa, { label: string; textCn: string; chipCn: string }> = {
  "30+":   { label: "+30 dias",   textCn: "text-destructive",      chipCn: "bg-destructive/10 text-destructive border-destructive/30"      },
  "10-29": { label: "10–29 dias", textCn: "text-yellow-500",       chipCn: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"          },
  "8-9":   { label: "8–9 dias",   textCn: "text-emerald-500",      chipCn: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"       },
  "0-7":   { label: "≤ 7 dias",   textCn: "text-muted-foreground", chipCn: "bg-muted text-muted-foreground border-border"                   },
};

const TABLE_COLS: TableCol[] = [
  { key: "STATUS",           label: "Status"       },
  { key: "MOTIVO",           label: "Motivo"       },
  { key: "DM_FILIAL",        label: "Filial"       },
  { key: "CLIENTE",          label: "Cliente"      },
  { key: "MUNICIPIO",        label: "Município"    },
  { key: "VIAGEM",           label: "Viagem"       },
  { key: "DT_FATURAMENTO",   label: "Dt. Fatur."  },
  { key: "DIAS_ABERTO",      label: "Dias"         },
  { key: "DATA_AGENDAMENTO", label: "Agendamento" },
  { key: "DATA_PLANEJADA",   label: "Planejada"   },
  { key: "FATURAMENTO",      label: "Faturamento" },
  { key: "PESO",             label: "Peso (kg)"   },
  { key: "OBS",              label: "OBS"          },
];

const PER_PAGE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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
    if (ssf) {
      return `${String(ssf.d).padStart(2, "0")}/${String(ssf.m).padStart(2, "0")}/${ssf.y}`;
    }
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

function processarArquivo(file: File): Promise<ArquivoProcessado> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", cellDates: true });
        const aba = encontrarAba(wb);
        if (!aba) throw new Error(`Nenhuma aba válida em "${file.name}"`);

        const sheet = wb.Sheets[aba];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (!rawRows.length) throw new Error(`Aba "${aba}" vazia em "${file.name}"`);

        const colMap: Record<string, string> = {};
        Object.keys(rawRows[0]).forEach((k) => { colMap[normKey(k)] = k; });

        const rows: RowData[] = rawRows.map((raw) => {
          const obj = { _arquivo: file.name, _aba: aba } as RowData;
          for (const campo of CAMPOS) {
            const originalKey = colMap[campo];
            const rawVal = originalKey != null ? raw[originalKey] : undefined;
            (obj as Record<string, string>)[campo] = DATE_CAMPOS.has(campo)
              ? parseDateStr(rawVal)
              : normVal(rawVal);
          }
          // Recalcula DIAS_ABERTO se vazio
          if (!obj.DIAS_ABERTO && obj.DT_FATURAMENTO) {
            const parts = obj.DT_FATURAMENTO.split("/");
            if (parts.length === 3) {
              const dt = new Date(+parts[2], +parts[1] - 1, +parts[0]);
              if (!isNaN(dt.getTime())) {
                obj.DIAS_ABERTO = String(
                  Math.floor((Date.now() - dt.getTime()) / 86_400_000)
                );
              }
            }
          }
          return obj;
        });

        resolve({ arquivo: file.name, aba, totalLinhas: rows.length, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}"`));
    reader.readAsArrayBuffer(file);
  });
}

function faixaDias(d: string | number): Faixa {
  const n = parseInt(String(d)) || 0;
  if (n >= 30) return "30+";
  if (n >= 10) return "10-29";
  if (n >= 8)  return "8-9";
  return "0-7";
}

/** Agrupa por campo → { label, viagens distintas, regs } */
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

/** Contagem distinta de VIAGEM por faixa */
function contarFaixas(rows: RowData[]): Record<Faixa, number> {
  const m: Record<Faixa, Set<string>> = {
    "30+": new Set(), "10-29": new Set(), "8-9": new Set(), "0-7": new Set(),
  };
  for (const r of rows) m[faixaDias(r.DIAS_ABERTO)].add(r.VIAGEM);
  return {
    "30+":   m["30+"].size,
    "10-29": m["10-29"].size,
    "8-9":   m["8-9"].size,
    "0-7":   m["0-7"].size,
  };
}

/** KPIs por filial: viagem mais crítica (max dias) por viagem */
function kpisPorFilial(
  rows: RowData[],
  filial: string
): Record<Faixa, number> & { total: number } {
  const sub = rows.filter((r) => r.DM_FILIAL === filial);
  const vMap: Record<string, number> = {};
  for (const r of sub) {
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

const EmptyState: FC = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
    <Package className="h-10 w-10 opacity-30" />
    <p className="text-sm font-medium">Nenhum dado carregado.</p>
    <p className="text-xs">Vá na aba <strong>Upload</strong> e selecione seus arquivos Excel.</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ZONE
// ─────────────────────────────────────────────────────────────────────────────

interface UploadZoneProps {
  onFiles:    (files: File[]) => void;
  loading:    boolean;
  progresso:  string;
  erro:       string | null;
  arquivos:   ArquivoProcessado[];
  onRemove:   (nome: string) => void;
}

const UploadZone: FC<UploadZoneProps> = ({
  onFiles, loading, progresso, erro, arquivos, onRemove,
}) => {
  const inputRef              = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const files = Array.from(e.dataTransfer.files).filter(
            (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
          );
          if (files.length) onFiles(files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/30"
        )}
      >
        <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
        <div className="text-center">
          <p className="font-semibold text-sm">Arraste os arquivos ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground mt-1">
            Até <strong>5 arquivos .xlsx</strong> de uma vez —
            lê a aba <strong>Banco de Dados</strong> (fallback: <strong>nao mexer</strong>)
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} tabIndex={-1}>
          <Upload className="h-4 w-4 mr-2" />
          {loading ? "Processando..." : "Selecionar arquivos"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={handleChange}
          disabled={loading}
          className="hidden"
        />
      </div>

      {progresso && (
        <p className={cn(
          "text-xs font-mono px-3 py-2 rounded-md border",
          progresso.startsWith("✅")
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : "text-muted-foreground bg-muted border-border"
        )}>
          {progresso}
        </p>
      )}

      {erro && (
        <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {arquivos.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">
              {arquivos.length} arquivo(s) —{" "}
              <span className="text-primary font-mono">
                {arquivos.reduce((s, a) => s + a.totalLinhas, 0).toLocaleString("pt-BR")} registros consolidados
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {arquivos.map((a) => (
              <div
                key={a.arquivo}
                className="flex items-center justify-between gap-2 text-xs rounded-md border border-border px-3 py-2 bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="truncate text-foreground font-medium">{a.arquivo}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px] font-mono">{a.aba}</Badge>
                  <span className="text-muted-foreground font-mono">
                    {a.totalLinhas.toLocaleString("pt-BR")} linhas
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(a.arquivo); }}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                  >
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
  label:  string;
  value:  number;
  sub:    string;
  faixa:  Faixa | "";
  active: boolean;
  onClick: () => void;
}

const KpiCard: FC<KpiCardProps> = ({ label, value, sub, faixa, active, onClick }) => {
  const meta = faixa ? FAIXA_META[faixa] : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 min-w-[110px] text-left rounded-xl border p-4 transition-all",
        "hover:border-primary/50 hover:bg-accent/40",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card"
      )}
    >
      <p className={cn(
        "text-xs font-semibold uppercase tracking-wide mb-1",
        meta?.textCn ?? "text-muted-foreground"
      )}>
        {label}
      </p>
      <p className="text-3xl font-bold font-mono tracking-tight text-foreground">
        {value.toLocaleString("pt-BR")}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FILIAL CARD
// ─────────────────────────────────────────────────────────────────────────────

interface FilialCardProps {
  filial:      string;
  kpis:        Record<Faixa, number> & { total: number };
  activeFaixa: Faixa | "";
  onClick:     () => void;
}

const FilialCard: FC<FilialCardProps> = ({ filial, kpis, activeFaixa, onClick }) => {
  const isDimmed = activeFaixa !== "" && kpis[activeFaixa] === 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-4 transition-all",
        isDimmed
          ? "opacity-20 pointer-events-none border-border bg-card"
          : "border-border bg-card hover:border-primary/50 hover:bg-accent/30"
      )}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1 truncate">{filial}</p>
      <p className="text-2xl font-bold font-mono text-foreground leading-none mb-3">
        {kpis.total}
      </p>
      {FAIXAS.map((f) => {
        const meta = FAIXA_META[f];
        const n    = kpis[f];
        const pct  = kpis.total > 0 ? (n / kpis.total) * 100 : 0;
        return (
          <div key={f} className="flex items-center gap-1.5 mb-1">
            <span className={cn("text-[10px] font-mono font-bold w-10 text-right shrink-0", meta.textCn)}>
              {f}
            </span>
            <ProgressBar pct={pct} />
            <span className={cn("text-[10px] font-mono font-bold w-4 text-right shrink-0", meta.textCn)}>
              {n}
            </span>
          </div>
        );
      })}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO TABLE
// ─────────────────────────────────────────────────────────────────────────────

interface ResumoTableProps {
  title:        string;
  data:         ResumoItem[];
  totalViagens: number;
}

const ResumoTable: FC<ResumoTableProps> = ({ title, data, totalViagens }) => {
  const [open, setOpen] = useState(true);
  const totalRegs = data.reduce((s, r) => s + r.regs, 0);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {open
          ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide h-8">Valor</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Viagens</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8">%</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Regs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => {
                const pct = totalViagens > 0 ? (row.viagens / totalViagens) * 100 : 0;
                return (
                  <TableRow key={i} className="hover:bg-accent/30">
                    <TableCell
                      className="text-xs py-1.5 max-w-[180px] truncate"
                      title={row.label}
                    >
                      {row.label}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 font-mono font-bold text-right">
                      {row.viagens}
                    </TableCell>
                    <TableCell className="py-1.5 w-28">
                      <div className="flex items-center gap-1.5">
                        <ProgressBar pct={pct} />
                        <span className="text-[10px] text-muted-foreground w-9 text-right font-mono">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] py-1.5 text-muted-foreground text-right">
                      {row.regs}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-primary/5 border-t-2 border-primary/20 hover:bg-primary/10">
                <TableCell className="text-xs py-1.5 font-bold text-primary">Total</TableCell>
                <TableCell className="text-xs py-1.5 font-mono font-bold text-primary text-right">
                  {totalViagens}
                </TableCell>
                <TableCell className="text-xs py-1.5 font-bold text-primary">100%</TableCell>
                <TableCell className="text-xs py-1.5 font-mono text-primary text-right">
                  {totalRegs}
                </TableCell>
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
      case "STATUS":      return <StatusBadge v={v} />;
      case "DIAS_ABERTO": return <DiasBadge v={v} />;
      case "DM_FILIAL":   return <span className="font-mono font-bold text-primary text-xs">{v || "—"}</span>;
      case "VIAGEM":      return <span className="font-mono font-bold text-violet-400 text-xs">{v || "—"}</span>;
      case "FATURAMENTO": return <span className="font-mono text-xs">{fmtBRL(v)}</span>;
      default:            return <span className="text-xs text-foreground">{v || "—"}</span>;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">
          {sorted.length.toLocaleString("pt-BR")} registros
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-7 px-2 text-xs"
            >‹</Button>
            <span className="text-xs text-muted-foreground px-2 font-mono">{page + 1}/{pages}</span>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page === pages - 1}
              className="h-7 px-2 text-xs"
            >›</Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[420px] scrollbar-thin">
          <Table className="min-w-max w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {TABLE_COLS.map((c) => (
                  <TableHead
                    key={c.key}
                    onClick={() => doSort(c.key)}
                    className="text-[10px] uppercase tracking-wide h-9 cursor-pointer select-none whitespace-nowrap hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {c.label}
                      <SortIcon col={c.key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TABLE_COLS.length}
                    className="text-center py-10 text-muted-foreground text-sm"
                  >
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r, i) => (
                  <TableRow key={i} className="hover:bg-accent/30">
                    {TABLE_COLS.map((c) => (
                      <TableCell
                        key={c.key}
                        title={r[c.key]}
                        className="py-1.5 px-3 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap align-middle"
                      >
                        {renderCell(r, c.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTER BAR
// ─────────────────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filialFiltro:  string; setFilialFiltro:  (v: string) => void; filiais:  string[];
  statusFiltro:  string; setStatusFiltro:  (v: string) => void; statuses: string[];
  motivoFiltro:  string; setMotivoFiltro:  (v: string) => void; motivos:  string[];
  faixaFiltro:   string; setFaixaFiltro:   (v: string) => void;
  activeFaixa:   string; setActiveFaixa:   (v: string) => void;
  clienteFiltro: string; setClienteFiltro: (v: string) => void;
  onReset: () => void;
  extraAction?: JSX.Element;
  info?: JSX.Element;
}

const FilterBar: FC<FilterBarProps> = ({
  filialFiltro,  setFilialFiltro,  filiais,
  statusFiltro,  setStatusFiltro,  statuses,
  motivoFiltro,  setMotivoFiltro,  motivos,
  faixaFiltro,   setFaixaFiltro,
  activeFaixa,   setActiveFaixa,
  clienteFiltro, setClienteFiltro,
  onReset, extraAction, info,
}) => (
  <div className="flex flex-wrap gap-3 items-end p-3 rounded-xl border border-border bg-card">
    {(
      [
        { id: "filial", label: "Filial",  val: filialFiltro, set: setFilialFiltro, opts: filiais  },
        { id: "status", label: "Status",  val: statusFiltro, set: setStatusFiltro, opts: statuses },
        { id: "motivo", label: "Motivo",  val: motivoFiltro, set: setMotivoFiltro, opts: motivos  },
      ] as const
    ).map(({ id, label, val, set, opts }) => (
      <div key={id} className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
        <Select value={val || "__all__"} onValueChange={(v) => set(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs min-w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    ))}

    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Faixa Dias</Label>
      <Select
        value={(faixaFiltro || activeFaixa) || "__all__"}
        onValueChange={(v) => { setFaixaFiltro(v === "__all__" ? "" : v); setActiveFaixa(""); }}
      >
        <SelectTrigger className="h-8 text-xs min-w-[120px]">
          <SelectValue />
        </SelectTrigger>
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

    <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Cliente</Label>
      <Input
        value={clienteFiltro}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setClienteFiltro(e.target.value)}
        placeholder="Buscar cliente..."
        className="h-8 text-xs"
      />
    </div>

    <Button variant="outline" size="sm" onClick={onReset} className="h-8 text-xs gap-1.5">
      <RefreshCw className="h-3 w-3" />
      Limpar
    </Button>

    {extraAction}

    {info && <div className="ml-auto self-end">{info}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardViagens(): JSX.Element {
  const [tab,           setTab]           = useState<TabId>("upload");
  const [arquivos,      setArquivos]      = useState<ArquivoProcessado[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [progresso,     setProgresso]     = useState("");
  const [erro,          setErro]          = useState<string | null>(null);

  const [filialFiltro,  setFilialFiltro]  = useState("");
  const [statusFiltro,  setStatusFiltro]  = useState("");
  const [motivoFiltro,  setMotivoFiltro]  = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [faixaFiltro,   setFaixaFiltro]   = useState("");
  const [activeFaixa,   setActiveFaixa]   = useState<Faixa | "">("");

  // ── dados ─────────────────────────────────────────────────────────────────
  const allRows  = useMemo(() => arquivos.flatMap((a) => a.rows), [arquivos]);
  const filiais  = useMemo(() => [...new Set(allRows.map((r) => r.DM_FILIAL).filter(Boolean))].sort(), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map((r) => r.STATUS || "N/A").filter(Boolean))].sort(), [allRows]);
  const motivos  = useMemo(() => [...new Set(allRows.map((r) => r.MOTIVO).filter(Boolean))].sort(), [allRows]);

  // ── filtrados ─────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const fAtiva = faixaFiltro || activeFaixa;
    return allRows.filter((r) => {
      if (filialFiltro  && r.DM_FILIAL !== filialFiltro)          return false;
      if (statusFiltro  && (r.STATUS || "N/A") !== statusFiltro)  return false;
      if (motivoFiltro  && (r.MOTIVO || "") !== motivoFiltro)     return false;
      if (clienteFiltro && !r.CLIENTE.toLowerCase().includes(clienteFiltro.toLowerCase())) return false;
      if (fAtiva        && faixaDias(r.DIAS_ABERTO) !== fAtiva)   return false;
      return true;
    });
  }, [allRows, filialFiltro, statusFiltro, motivoFiltro, clienteFiltro, faixaFiltro, activeFaixa]);

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
  const perc     = (n: number): string =>
    kpiTotal ? `${Math.round((n / kpiTotal) * 100)}% do total` : "—";

  // ── resumos filtrados ─────────────────────────────────────────────────────
  const totalViagFiltradas = useMemo(
    () => new Set(filtrados.map((r) => r.VIAGEM)).size,
    [filtrados]
  );
  const faixasCount  = useMemo(() => contarFaixas(filtrados),              [filtrados]);
  const porStatus    = useMemo(() => contarPor(filtrados, "STATUS"),        [filtrados]);
  const porMotivo    = useMemo(() => contarPor(filtrados, "MOTIVO"),        [filtrados]);
  const porMotivoDev = useMemo(() => contarPor(filtrados, "MOTIVO_DEV"),    [filtrados]);
  const porFilial    = useMemo(() => contarPor(filtrados, "DM_FILIAL"),     [filtrados]);
  const porMunicipio = useMemo(() => contarPor(filtrados, "MUNICIPIO"),     [filtrados]);
  const porVendedor  = useMemo(() => contarPor(filtrados, "VENDEDOR"),      [filtrados]);
  const porTipo      = useMemo(() => contarPor(filtrados, "TIPO_OPERACAO"), [filtrados]);

  const kpisPorFil = useMemo(
    () => Object.fromEntries(filiais.map((f) => [f, kpisPorFilial(allRows, f)])),
    [allRows, filiais]
  );

  // ── upload handler ────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: File[]): Promise<void> => {
    const novosNomes = new Set(files.map((f) => f.name));
    const mantidos   = arquivos.filter((a) => !novosNomes.has(a.arquivo));
    if (mantidos.length + files.length > 5) {
      setErro("Máximo de 5 arquivos. Remova alguns antes de adicionar mais.");
      return;
    }
    setLoading(true); setErro(null); setProgresso("");
    try {
      const results: ArquivoProcessado[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgresso(`Lendo ${i + 1}/${files.length}: ${files[i].name}...`);
        results.push(await processarArquivo(files[i]));
      }
      const todos = [...mantidos, ...results];
      setArquivos(todos);
      setProgresso(
        `✅ ${todos.reduce((s, a) => s + a.totalLinhas, 0).toLocaleString("pt-BR")} registros em ${todos.length} arquivo(s).`
      );
      if (tab === "upload") setTab("analise");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao processar arquivo.");
    } finally {
      setLoading(false);
    }
  }, [arquivos, tab]);

  const handleExport = useCallback(() => {
    if (!filtrados.length) {
      alert("Não há dados na tabela para exportar.");
      return;
    }
    const dataForSheet = filtrados.map(row => {
      const mappedRow = {};
      TABLE_COLS.forEach(col => {
        mappedRow[col.label] = row[col.key];
      });
      return mappedRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tabela Detalhada");

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Viagens_Pendentes_${today}.xlsx`);
  }, [filtrados]);

  function removeArquivo(nome: string): void {
    setArquivos((prev) => prev.filter((a) => a.arquivo !== nome));
    setProgresso("");
  }

  function resetFiltros(): void {
    setFilialFiltro(""); setStatusFiltro(""); setMotivoFiltro("");
    setClienteFiltro(""); setFaixaFiltro(""); setActiveFaixa("");
  }

  function handleKpiClick(f: Faixa): void {
    setActiveFaixa((a) => (a === f ? "" : f));
    setFaixaFiltro("");
  }

  const filterProps = {
    filialFiltro,  setFilialFiltro,  filiais,
    statusFiltro,  setStatusFiltro,  statuses,
    motivoFiltro,  setMotivoFiltro,  motivos,
    faixaFiltro,   setFaixaFiltro,
    activeFaixa,   setActiveFaixa,
    clienteFiltro, setClienteFiltro,
    onReset: resetFiltros,
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: "upload",  label: "Upload"           },
    { id: "analise", label: "Análise"          },
    { id: "tabela",  label: "Tabela Detalhada" },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Viagens Pendentes
          </h1>
          {allRows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {arquivos.length} arquivo(s) ·{" "}
              <span className="font-mono text-foreground">
                {allRows.length.toLocaleString("pt-BR")}
              </span>{" "}
              registros ·{" "}
              <span className="font-mono text-primary font-bold">
                {kpiTotal.toLocaleString("pt-BR")}
              </span>{" "}
              viagens distintas
            </p>
          )}
        </div>
        {arquivos.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {arquivos.map((a) => (
              <Badge key={a.arquivo} variant="outline" className="text-[10px] gap-1 font-mono">
                <FileSpreadsheet className="h-3 w-3" />
                {a.arquivo}
                <button
                  onClick={() => removeArquivo(a.arquivo)}
                  className="ml-0.5 hover:text-destructive transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── UPLOAD ── */}
      {tab === "upload" && (
        <UploadZone
          onFiles={handleFiles}
          loading={loading}
          progresso={progresso}
          erro={erro}
          arquivos={arquivos}
          onRemove={removeArquivo}
        />
      )}

      {/* ── ANÁLISE ── */}
      {tab === "analise" && (
        allRows.length === 0 ? <EmptyState /> : (
          <div className="space-y-5">

            {/* KPIs */}
            <div className="flex gap-2 flex-wrap">
              <KpiCard
                label="Total Viagens" value={kpiTotal}
                sub="distintas (todos os arquivos)"
                faixa="" active={false}
                onClick={() => { setActiveFaixa(""); setFaixaFiltro(""); }}
              />
              {(["30+", "10-29", "8-9", "0-7"] as Faixa[]).map((f, idx) => {
                const vals = [kpi30, kpi10, kpi7, kpiM7];
                return (
                  <KpiCard
                    key={f}
                    label={FAIXA_META[f].label}
                    value={vals[idx]}
                    sub={perc(vals[idx])}
                    faixa={f}
                    active={activeFaixa === f}
                    onClick={() => handleKpiClick(f)}
                  />
                );
              })}
            </div>

            {/* Chips faixas filtradas */}
            <div className="flex gap-2 flex-wrap">
              {FAIXAS.map((f) => (
                <span
                  key={f}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border font-mono font-bold cursor-pointer transition-all",
                    FAIXA_META[f].chipCn,
                    activeFaixa === f && "ring-2 ring-offset-1 ring-current"
                  )}
                  onClick={() => handleKpiClick(f)}
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
                  <span className="text-foreground font-bold">
                    {filtrados.length.toLocaleString("pt-BR")}
                  </span>{" "}regs ·{" "}
                  <span className="text-primary font-bold">{totalViagFiltradas}</span>{" "}viagens
                </span>
              }
            />

            {/* Cards filiais */}
            {filiais.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Por Filial — clique para filtrar
                  </p>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
                  {filiais.map((f) => (
                    <FilialCard
                      key={f}
                      filial={f}
                      kpis={kpisPorFil[f] ?? { total: 0, "30+": 0, "10-29": 0, "8-9": 0, "0-7": 0 }}
                      activeFaixa={activeFaixa}
                      onClick={() => setFilialFiltro((v) => (v === f ? "" : f))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Tabelas de análise */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Análise Detalhada
                </p>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
                <ResumoTable title="Por Status"        data={porStatus}    totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Motivo"        data={porMotivo}    totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Motivo Dev."   data={porMotivoDev} totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Filial"        data={porFilial}    totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Município"     data={porMunicipio} totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Vendedor"      data={porVendedor}  totalViagens={totalViagFiltradas} />
                <ResumoTable title="Por Tipo Operação" data={porTipo}      totalViagens={totalViagFiltradas} />
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
                onClick={handleExport} className="h-8 text-xs gap-1.5">
                  <Download className="h-3 w-3" />
                    Exportar Excel ({filtrados.length.toLocaleString("pt-BR")} regs)
                </Button>
              }
            />
            <DataTable rows={filtrados} />
          </div>
        )
      )}
    </div>
  );
}

export default DashboardViagens;