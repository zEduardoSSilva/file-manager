"use client";

/**
 * FechamentoDiario
 * ─────────────────────────────────────────────────────────────────────────────
 * Aba dentro da Visão Analítica que:
 *   1. Recebe os rows do dia selecionado (vindos do VisaoAnaliticaPage)
 *   2. Mostra uma tabela editável com as colunas de fechamento
 *   3. Permite complementar linhas sem preenchimento com dados de dias anteriores
 *      (via upload de um Excel anterior)
 *   4. Exporta Excel  →  planilha pronta para enviar no grupo
 *   5. Exporta HTML   →  dashboard visual idêntico ao padrão RFK
 *
 * INTEGRAÇÃO NO VisaoAnaliticaPage:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Importe:
 *      import { FechamentoDiario } from "./FechamentoDiario"
 *
 * 2. Adicione a aba no header do Card (junto com "Exportar Excel"):
 *      import { ClipboardList } from "lucide-react"
 *      ...
 *      <Button variant={activeSubTab==="fechamento" ? "default" : "outline"}
 *        size="sm" className="h-8 text-xs gap-1.5"
 *        onClick={() => setActiveSubTab("fechamento")}>
 *        <ClipboardList className="size-3.5" /> Fechamento Diário
 *      </Button>
 *
 * 3. State:
 *      const [activeSubTab, setActiveSubTab] = useState<"tabela"|"fechamento">("tabela")
 *
 * 4. Renderize condicionalmente (abaixo dos filtros do Card, antes da tabela):
 *      {activeSubTab === "fechamento" && (
 *        <FechamentoDiario
 *          rows={filtered}           // rows já filtrados pelo dia
 *          filterDay={filterDay}
 *          filterMonth={filterMonth}
 *          filterYear={filterYear}
 *          filial={filterFilial === "all" ? undefined : filterFilial}
 *        />
 *      )}
 *
 * 5. Tipagem — reutilize o tipo Row do VisaoAnaliticaPage:
 *      export type { Row }   // adicione export no VisaoAnaliticaPage
 *    Ou simplesmente declare aqui como Record<string, any> (já está assim).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo, useRef, ChangeEvent, FC, JSX } from "react";
import * as XLSX from "xlsx";
import {
  Download, Upload, RefreshCw, AlertCircle,
  FileSpreadsheet, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, ClipboardList,
} from "lucide-react";
import { Button }  from "@/components/ui/button";
import { Badge }   from "@/components/ui/badge";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type AnyRow = Record<string, any>;

/** Linha editável do fechamento */
interface FechRow {
  // ── vem do Firebase (acumulado) ──
  PLACA:        string;
  MOTORISTA:    string;
  AJUDANTE:     string;
  "AJUDANTE 2": string;
  FILIAL:       string;
  REGIÃO:       string;
  ROTA:         string;
  VIAGENS:      string;
  ENTREGAS:     number | string;
  PESO:         number | string;
  CAPACIDADE:   number | string;
  TEMPO:        string;
  KM:           number | string;
  OBSERVAÇÃO:   string;
  Tipo_Carga:   string;
  ARQUIVO_ORIGEM: string;
  ABA_ORIGEM:     string;
  // ── campos de fechamento (editáveis / vindos do dia anterior) ──
  VOLTOU_LOGISTICA:       string;
  STATUS:                 string;
  DATA_RETORNO:           string;
  RESPONSAVEL:            string;
  OBSERVACAO_FINANCEIRO:  string;
  // ── controle interno ──
  _idx: number;
  _preenchidoAnterior: boolean; // true = complementado pelo Excel anterior
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUNAS DE FECHAMENTO (editáveis pelo usuário)
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS_FECHAMENTO: (keyof FechRow)[] = [
  "VOLTOU_LOGISTICA",
  "STATUS",
  "DATA_RETORNO",
  "RESPONSAVEL",
  "OBSERVACAO_FINANCEIRO",
];

const CAMPOS_FECHAMENTO_LABEL: Record<string, string> = {
  VOLTOU_LOGISTICA:      "Voltou Log.",
  STATUS:                "Status",
  DATA_RETORNO:          "Dt. Retorno",
  RESPONSAVEL:           "Responsável",
  OBSERVACAO_FINANCEIRO: "Obs. Financeiro",
};

/** Colunas exibidas na tabela (readonly + editável) */
const TABLE_COLS: { key: keyof FechRow; label: string; editavel: boolean; mono?: boolean }[] = [
  { key: "PLACA",                 label: "Placa",          editavel: false, mono: true  },
  { key: "MOTORISTA",             label: "Motorista",      editavel: false              },
  { key: "AJUDANTE",              label: "Ajudante",       editavel: false              },
  { key: "FILIAL",                label: "Filial",         editavel: false              },
  { key: "ROTA",                  label: "Rota",           editavel: false              },
  { key: "VIAGENS",               label: "Viagem(ns)",     editavel: false, mono: true  },
  { key: "ENTREGAS",              label: "Entregas",       editavel: false, mono: true  },
  { key: "PESO",                  label: "Peso (kg)",      editavel: false, mono: true  },
  { key: "CAPACIDADE",            label: "Capac.",         editavel: false, mono: true  },
  { key: "KM",                    label: "KM",             editavel: false, mono: true  },
  { key: "TEMPO",                 label: "Tempo",          editavel: false, mono: true  },
  { key: "Tipo_Carga",            label: "Tipo Carga",     editavel: false              },
  { key: "OBSERVAÇÃO",            label: "Observação",     editavel: false              },
  // ── campos de fechamento ──
  { key: "VOLTOU_LOGISTICA",      label: "Voltou Log.",    editavel: true               },
  { key: "STATUS",                label: "Status",         editavel: true               },
  { key: "DATA_RETORNO",          label: "Dt. Retorno",    editavel: true, mono: true   },
  { key: "RESPONSAVEL",           label: "Responsável",    editavel: true               },
  { key: "OBSERVACAO_FINANCEIRO", label: "Obs. Fin.",      editavel: true               },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAPEAMENTO DE STATUS (igual ao Python)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  OK: "FECHADO", FINALIZADO: "FECHADO", FINALIZADA: "FECHADO",
  CONCLUIDO: "FECHADO", "CONCLUÍDA": "FECHADO", ENTREGUE: "FECHADO",
  ENTREGUES: "FECHADO", FECHADO: "FECHADO", FECHADA: "FECHADO",
  ENCERRADO: "FECHADO", ENCERRADA: "FECHADO", LIQUIDADO: "FECHADO", LIQUIDADA: "FECHADO",
  PENDENTE: "PENDENTE", PEND: "PENDENTE", PENDENCIA: "PENDENTE",
  "PENDÊNCIAS": "PENDENTE", AGUARDANDO: "PENDENTE", AGUARDA: "PENDENTE",
  "EM ABERTO": "PENDENTE", ABERTO: "PENDENTE", ABERTA: "PENDENTE",
  "EM ANDAMENTO": "PENDENTE", "EM ANALISE": "PENDENTE", "EM ANÁLISE": "PENDENTE",
  "A VERIFICAR": "PENDENTE", VERIFICAR: "PENDENTE", INCOMPLETO: "PENDENTE", INCOMPLETA: "PENDENTE",
};

function normalizarStatus(v: string): string {
  const s = (v ?? "").toString().trim().toUpperCase();
  return STATUS_MAP[s] ?? s;
}

function vazio(v: any): boolean {
  return v == null || String(v).trim() === "" || String(v).toLowerCase() === "nan";
}

function numVal(v: any): number {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmtNum(v: any, dec = 0): string {
  const n = numVal(v);
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSÃO Row → FechRow
// ─────────────────────────────────────────────────────────────────────────────

function rowToFechRow(row: AnyRow, idx: number): FechRow {
  const s = (k: string) => String(row[k] ?? "").trim();
  return {
    PLACA:                 s("PLACA") || s("PLACA SISTEMA"),
    MOTORISTA:             s("MOTORISTA"),
    AJUDANTE:              s("AJUDANTE"),
    "AJUDANTE 2":          s("AJUDANTE 2"),
    FILIAL:                s("FILIAL"),
    REGIÃO:                s("REGIÃO"),
    ROTA:                  s("ROTA"),
    VIAGENS:               s("VIAGENS") || s("VIAGEM"),
    ENTREGAS:              numVal(row["ENTREGAS"]),
    PESO:                  numVal(row["PESO"]),
    CAPACIDADE:            numVal(row["CAPACIDADE"]),
    TEMPO:                 s("TEMPO"),
    KM:                    numVal(row["KM"]),
    OBSERVAÇÃO:            s("OBSERVAÇÃO"),
    Tipo_Carga:            s("Tipo_Carga") || s("TIPO CARGA") || "Carga A",
    ARQUIVO_ORIGEM:        s("ARQUIVO_ORIGEM"),
    ABA_ORIGEM:            s("ABA_ORIGEM"),
    // fechamento — inicia vazio
    VOLTOU_LOGISTICA:      s("VOLTOU_LOGISTICA"),
    STATUS:                normalizarStatus(s("STATUS")),
    DATA_RETORNO:          s("DATA_RETORNO"),
    RESPONSAVEL:           s("RESPONSAVEL"),
    OBSERVACAO_FINANCEIRO: s("OBSERVACAO_FINANCEIRO"),
    _idx:                  idx,
    _preenchidoAnterior:   false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MESCLAGEM COM DIA ANTERIOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Para cada linha sem preenchimento de fechamento, tenta complementar com
 * o último registro do dia anterior que tenha a mesma placa.
 */
function mesclarComAnterior(fechRows: FechRow[], anteriorRows: AnyRow[]): FechRow[] {
  // índice: PLACA → última linha do anterior com preenchimento
  const idx: Record<string, AnyRow> = {};
  for (const r of anteriorRows) {
    const placa = String(r["PLACA"] ?? r["PLACA SISTEMA"] ?? "").trim().toUpperCase().replace(/[-\s]/g, "");
    if (!placa) continue;
    // prefere linha com mais campos preenchidos
    const score = CAMPOS_FECHAMENTO.filter((c) => !vazio(r[c as string])).length;
    const existing = idx[placa];
    const existingScore = existing
      ? CAMPOS_FECHAMENTO.filter((c) => !vazio(existing[c as string])).length
      : -1;
    if (score > existingScore) idx[placa] = r;
  }

  return fechRows.map((row) => {
    // verifica se já tem algum campo de fechamento preenchido
    const jaTemDados = CAMPOS_FECHAMENTO.some((c) => !vazio(row[c as string]));
    if (jaTemDados) return row;

    const placaNorm = row.PLACA.toUpperCase().replace(/[-\s]/g, "");
    const fonte = idx[placaNorm];
    if (!fonte) return row;

    const merged: FechRow = { ...row, _preenchidoAnterior: true };
    for (const campo of CAMPOS_FECHAMENTO) {
      const valorFonte = String(fonte[campo as string] ?? "").trim();
      if (!vazio(row[campo as string]) || vazio(valorFonte)) continue;
      (merged as any)[campo] = campo === "STATUS" ? normalizarStatus(valorFonte) : valorFonte;
    }
    return merged;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DE HTML (estilo RFK — igual ao Python)
// ─────────────────────────────────────────────────────────────────────────────

function gerarHtml(rows: FechRow[], dia: string): string {
  const agora = new Date().toLocaleString("pt-BR");
  const total    = rows.length;
  const fechados = rows.filter((r) => r.STATUS === "FECHADO").length;
  const pendentes= rows.filter((r) => r.STATUS === "PENDENTE").length;
  const outros   = total - fechados - pendentes;

  const stBadge = (st: string) => {
    if (st === "FECHADO")  return `<span style="background:rgba(0,184,148,.15);border:1px solid rgba(0,184,148,.4);color:#00b894;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">✅ FECHADO</span>`;
    if (st === "PENDENTE") return `<span style="background:rgba(253,203,110,.15);border:1px solid rgba(253,203,110,.5);color:#b8860b;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">⏳ PENDENTE</span>`;
    if (!st)               return `<span style="background:rgba(90,122,110,.08);border:1px solid #c8e6dc;color:#5a7a6e;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">— S/ STATUS</span>`;
    return `<span style="background:rgba(225,112,85,.1);border:1px solid rgba(225,112,85,.4);color:#e17055;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">⚠️ ${st}</span>`;
  };

  const vlBadge = (vl: string) => {
    const v = vl.toUpperCase().trim();
    if (v === "SIM") return `<span style="color:#00916e;font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:.8em;">✅ SIM</span>`;
    if (v === "NÃO" || v === "NAO") return `<span style="color:#d63031;font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:.8em;">❌ NÃO</span>`;
    return `<span style="color:#aac4b8;font-size:.78em;">—</span>`;
  };

  const thead = TABLE_COLS.map((c) => `<th>${c.label}</th>`).join("");

  const tbody = rows.map((r) => {
    const marcador = r._preenchidoAnterior
      ? `style="border-left:3px solid rgba(9,132,227,.6);"` : "";
    const tds = TABLE_COLS.map(({ key, mono }) => {
      const v = String((r as any)[key] ?? "").trim();
      if (key === "STATUS")           return `<td>${stBadge(v)}</td>`;
      if (key === "VOLTOU_LOGISTICA") return `<td>${vlBadge(v)}</td>`;
      const content = v || "—";
      const style   = mono ? `style="font-family:'IBM Plex Mono',monospace;"` : "";
      return `<td ${style}>${content}</td>`;
    }).join("");
    return `<tr ${marcador}>${tds}</tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RFK — Fechamento Diário ${dia}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'IBM Plex Sans',sans-serif;background:#eef2f0;color:#1a2e26;font-size:13px;}
.header{background:linear-gradient(135deg,#00b894,#00cec9);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,184,148,.25);}
.header-left{display:flex;align-items:center;gap:14px;}
.header-logo{width:38px;height:38px;background:rgba(255,255,255,.25);border:2px solid rgba(255,255,255,.5);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.3em;}
.header-title{font-family:'IBM Plex Mono',monospace;font-size:1.05em;font-weight:700;color:#fff;letter-spacing:.5px;text-shadow:0 1px 3px rgba(0,0,0,.15);}
.header-subtitle{font-size:.75em;color:rgba(255,255,255,.8);font-family:'IBM Plex Mono',monospace;margin-top:2px;}
.header-right{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.pill{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:.78em;font-weight:600;font-family:'IBM Plex Mono',monospace;}
.pill-verde{background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.6);color:#00916e;}
.pill-amarelo{background:rgba(253,203,110,.2);border:1px solid rgba(253,203,110,.6);color:#7d5a00;}
.pill-text{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.9);}
.btn-exp{background:#0984e3;color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:.85em;font-weight:600;font-family:'IBM Plex Sans',sans-serif;transition:all .2s;}
.btn-exp:hover{background:#2979e0;transform:translateY(-1px);box-shadow:0 4px 10px rgba(9,132,227,.4);}

.kpi-strip{background:#fff;border-bottom:1px solid #c8e6dc;padding:12px 24px;display:flex;gap:12px;flex-wrap:wrap;}
.kpi-card{flex:1;min-width:140px;padding:14px 18px;border-radius:10px;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden;}
.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:currentColor;opacity:.35;border-radius:10px 10px 0 0;}
.kpi-lbl{font-size:.68em;font-weight:700;text-transform:uppercase;letter-spacing:.8px;font-family:'IBM Plex Mono',monospace;opacity:.8;}
.kpi-val{font-size:2em;font-weight:700;font-family:'IBM Plex Mono',monospace;line-height:1;}
.kpi-total{background:rgba(0,184,148,.08);color:#00916e;border:1px solid rgba(0,184,148,.25);}
.kpi-fech{background:rgba(0,184,148,.08);color:#00916e;border:1px solid rgba(0,184,148,.3);}
.kpi-pend{background:rgba(253,203,110,.12);color:#b8860b;border:1px solid rgba(253,203,110,.5);}
.kpi-out{background:rgba(225,112,85,.08);color:#e17055;border:1px solid rgba(225,112,85,.3);}

.legend{padding:8px 24px;background:#f5faf8;border-bottom:1px solid #c8e6dc;font-size:.78em;color:#5a7a6e;display:flex;align-items:center;gap:16px;font-family:'IBM Plex Mono',monospace;}
.legend-item{display:flex;align-items:center;gap:6px;}
.legend-dot{width:10px;height:10px;border-radius:2px;}

.table-wrap{overflow-x:auto;padding:16px 24px 40px;max-height:calc(100vh - 280px);overflow-y:auto;}
.table-wrap::-webkit-scrollbar{height:6px;width:5px;}
.table-wrap::-webkit-scrollbar-track{background:#e8f5f1;}
.table-wrap::-webkit-scrollbar-thumb{background:#a8d5c5;border-radius:3px;}
table{border-collapse:collapse;width:max-content;min-width:100%;}
thead th{background:linear-gradient(135deg,#00b894,#00cec9);padding:10px 12px;text-align:left;font-family:'IBM Plex Mono',monospace;font-size:.7em;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,.92);white-space:nowrap;position:sticky;top:0;border-bottom:2px solid #00916e;}
tbody tr{border-bottom:1px solid #ddeee8;background:#fff;transition:background .12s;}
tbody tr:nth-child(even){background:#f8fcfa;}
tbody tr:hover{background:#edf7f3;}
tbody td{padding:7px 12px;font-size:.82em;white-space:nowrap;color:#1a2e26;vertical-align:middle;max-width:200px;overflow:hidden;text-overflow:ellipsis;}
.mono{font-family:'IBM Plex Mono',monospace;}
.right{text-align:right;}
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="header-logo">🔥</div>
    <div>
      <div class="header-title">GRUPO RFK — Fechamento Diário</div>
      <div class="header-subtitle">Dia: ${dia} · Gerado em ${agora}</div>
    </div>
  </div>
  <div class="header-right">
    <span class="pill pill-verde">✅ ${fechados} Fechados</span>
    <span class="pill pill-amarelo">⏳ ${pendentes} Pendentes</span>
    <span class="pill pill-text">📋 ${total} registros</span>
    <button class="btn-exp" onclick="exportar()">📥 Exportar Excel</button>
  </div>
</div>

<div class="kpi-strip">
  <div class="kpi-card kpi-total"><div class="kpi-lbl">Total</div><div class="kpi-val">${total}</div></div>
  <div class="kpi-card kpi-fech"><div class="kpi-lbl">✅ Fechados</div><div class="kpi-val">${fechados}</div></div>
  <div class="kpi-card kpi-pend"><div class="kpi-lbl">⏳ Pendentes</div><div class="kpi-val">${pendentes}</div></div>
  <div class="kpi-card kpi-out"><div class="kpi-lbl">⚠️ Outros</div><div class="kpi-val">${outros}</div></div>
</div>

<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:rgba(9,132,227,.5)"></div>Linha complementada do dia anterior</div>
</div>

<div class="table-wrap">
  <table id="tabela">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</div>

<script>
const DADOS = ${JSON.stringify(rows.map(r => {
  const obj: Record<string, any> = {};
  TABLE_COLS.forEach(({ key, label }) => { obj[label] = (r as any)[key] ?? ""; });
  return obj;
}))};

function exportar() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(DADOS);
  ws['!cols'] = Object.keys(DADOS[0] || {}).map(k => ({ wch: Math.max(k.length, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
  const d = "${dia}".replace(/\\//g, "-");
  XLSX.writeFile(wb, \`RFK_Fechamento_\${d}.xlsx\`);
}
<\/script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

const StatusBadge: FC<{ v: string }> = ({ v }) => {
  if (v === "FECHADO")  return <Badge className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/15">✓ FECHADO</Badge>;
  if (v === "PENDENTE") return <Badge className="text-[10px] font-mono bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/15">⏳ PENDENTE</Badge>;
  if (!v)               return <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground/50">—</Badge>;
  return <Badge className="text-[10px] font-mono bg-destructive/10 text-destructive border-destructive/30">⚠ {v}</Badge>;
};

const VlBadge: FC<{ v: string }> = ({ v }) => {
  const u = v.toUpperCase().trim();
  if (u === "SIM") return <span className="text-[10px] font-mono font-bold text-emerald-500">✅ SIM</span>;
  if (u === "NAO" || u === "NÃO") return <span className="text-[10px] font-mono font-bold text-destructive">❌ NÃO</span>;
  return <span className="text-muted-foreground/40 text-[10px]">—</span>;
};

const TipoCargaBadge: FC<{ v: string }> = ({ v }) => {
  const style =
    v === "Carga A" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" :
    v === "Carga B" ? "bg-blue-500/10 text-blue-400 border-blue-400/30" :
    v === "Carga C" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" :
    v === "Carga D" ? "bg-orange-500/10 text-orange-400 border-orange-400/30" :
                      "bg-red-500/10 text-red-400 border-red-400/30";
  return <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", style)}>{v || "—"}</span>;
};

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface FechamentoDiarioProps {
  rows:         AnyRow[];   // rows já filtrados pelo dia (vindos do VisaoAnaliticaPage)
  filterDay:    number;
  filterMonth:  number;
  filterYear:   number;
  filial?:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export const FechamentoDiario: FC<FechamentoDiarioProps> = ({
  rows, filterDay, filterMonth, filterYear, filial,
}) => {
  const anteriorInputRef = useRef<HTMLInputElement>(null);

  // ── estado ─────────────────────────────────────────────────────────────────
  /** Cada arquivo anterior carregado: { nome, linhas } */
  interface ArquivoAnterior { nome: string; linhas: AnyRow[] }
  const [arquivosAnteriores, setArquivosAnteriores] = useState<ArquivoAnterior[]>([]);
  const [loadingAnt,  setLoadingAnt]  = useState(false);
  const [erroAnt,     setErroAnt]     = useState<string | null>(null);

  /** Todos os rows de todos os arquivos anteriores mesclados (para a função mesclarComAnterior) */
  const anteriorRows = useMemo(
    () => arquivosAnteriores.flatMap((a) => a.linhas),
    [arquivosAnteriores]
  );
  const [editingCell,   setEditingCell]   = useState<{ row: number; col: keyof FechRow } | null>(null);
  const [editValue,     setEditValue]     = useState("");
  const [showPreview,   setShowPreview]   = useState(false);

  // Estado local das linhas (permite edição inline)
  const [localRows, setLocalRows] = useState<FechRow[]>([]);

  // Quando rows externos mudam, reinicializa
  const fechRowsBase = useMemo(
    () => rows.map((r, i) => rowToFechRow(r, i)),
    [rows]
  );

  // Mescla com anterior sempre que anteriorRows ou base muda
  const fechRowsMesclados = useMemo(
    () => mesclarComAnterior(fechRowsBase, anteriorRows),
    [fechRowsBase, anteriorRows]
  );

  // localRows é inicializado na primeira vez ou quando a base muda
  const rowsExibidos: FechRow[] = localRows.length === fechRowsMesclados.length
    ? localRows
    : fechRowsMesclados;

  function resetLocal(): void {
    setLocalRows(fechRowsMesclados);
  }

  // Garante sync quando mescla muda
  useMemo(() => {
    setLocalRows(fechRowsMesclados);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechRowsMesclados]);

  // ── estatísticas ───────────────────────────────────────────────────────────
  const totalRows    = rowsExibidos.length;
  const fechados     = rowsExibidos.filter((r) => r.STATUS === "FECHADO").length;
  const pendentes    = rowsExibidos.filter((r) => r.STATUS === "PENDENTE").length;
  const outros       = totalRows - fechados - pendentes;
  const complAnt     = rowsExibidos.filter((r) => r._preenchidoAnterior).length;

  // ── label do dia ───────────────────────────────────────────────────────────
  const diaLabel = filterDay > 0
    ? `${String(filterDay).padStart(2,"0")}/${String(filterMonth).padStart(2,"0")}/${filterYear}`
    : `${String(filterMonth).padStart(2,"0")}/${filterYear}`;

  // ── upload dos arquivos anteriores (até 5 de uma vez ou em adições) ─────────
  async function handleAnteriorUpload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const totalDepois = arquivosAnteriores.length + files.length;
    if (totalDepois > 5) {
      setErroAnt(`Máximo de 5 arquivos anteriores. Já tem ${arquivosAnteriores.length}, tentando adicionar ${files.length}.`);
      if (anteriorInputRef.current) anteriorInputRef.current.value = "";
      return;
    }

    setLoadingAnt(true); setErroAnt(null);
    const novos: ArquivoAnterior[] = [];
    try {
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const wb     = XLSX.read(buffer, { type: "array" });
        const sheet  = wb.Sheets[wb.SheetNames[0]];
        const data   = XLSX.utils.sheet_to_json<AnyRow>(sheet, { defval: "" });
        const linhas = data.map((r) => ({
          ...r,
          STATUS: normalizarStatus(String(r["STATUS"] ?? "")),
        }));
        novos.push({ nome: file.name, linhas });
      }
      // mantém arquivos já carregados + novos (sem duplicar por nome)
      setArquivosAnteriores((prev) => {
        const nomesNovos = new Set(novos.map((n) => n.nome));
        const mantidos   = prev.filter((a) => !nomesNovos.has(a.nome));
        return [...mantidos, ...novos];
      });
    } catch (err) {
      setErroAnt(err instanceof Error ? err.message : "Erro ao ler arquivo.");
    } finally {
      setLoadingAnt(false);
      if (anteriorInputRef.current) anteriorInputRef.current.value = "";
    }
  }

  function removerArquivoAnterior(nome: string): void {
    setArquivosAnteriores((prev) => prev.filter((a) => a.nome !== nome));
  }

  // ── edição inline ──────────────────────────────────────────────────────────
  function startEdit(rowIdx: number, col: keyof FechRow): void {
    setEditingCell({ row: rowIdx, col });
    setEditValue(String((rowsExibidos[rowIdx] as any)[col] ?? ""));
  }

  function commitEdit(): void {
    if (!editingCell) return;
    const { row: ri, col } = editingCell;
    const finalValue = col === "STATUS" ? normalizarStatus(editValue) : editValue;
    setLocalRows((prev) =>
      prev.map((r, i) =>
        i === ri ? { ...r, [col]: finalValue } : r
      )
    );
    setEditingCell(null);
  }

  // ── exportar Excel ─────────────────────────────────────────────────────────
  function exportarExcel(): void {
    if (!rowsExibidos.length) return;
    const data = rowsExibidos.map((r) => {
      const obj: Record<string, any> = {};
      TABLE_COLS.forEach(({ key, label }) => { obj[label] = (r as any)[key] ?? ""; });
      obj["ARQUIVO_ORIGEM"] = r.ARQUIVO_ORIGEM;
      obj["ABA_ORIGEM"]     = r.ABA_ORIGEM;
      return obj;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({
      wch: Math.max(k.length, ...data.slice(0,50).map((r) => String(r[k] ?? "").length)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
    const ts = diaLabel.replace(/\//g, "-");
    XLSX.writeFile(wb, `RFK_Fechamento_${ts}.xlsx`);
  }

  // ── exportar HTML ──────────────────────────────────────────────────────────
  function exportarHtml(): void {
    const html = gerarHtml(rowsExibidos, diaLabel);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `RFK_Fechamento_${diaLabel.replace(/\//g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <ClipboardList className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Nenhum dado para o dia selecionado.</p>
        <p className="text-xs">Ajuste o filtro <strong>Dia</strong> para um valor específico (ex: 18).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border bg-card">

        {/* Dia */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dia</span>
          <Badge variant="outline" className="font-mono text-sm px-3 py-1">{diaLabel}</Badge>
        </div>

        {/* KPIs inline */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "Total",     v: totalRows, cn: "bg-primary/5 text-primary border-primary/20"                   },
            { label: "Fechados",  v: fechados,  cn: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"       },
            { label: "Pendentes", v: pendentes, cn: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"          },
            { label: "Outros",    v: outros,    cn: "bg-destructive/10 text-destructive border-destructive/30"       },
          ].map((k) => (
            <div key={k.label} className={cn("rounded-xl border px-3 py-2 text-center min-w-[80px]", k.cn)}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75">{k.label}</p>
              <p className="text-xl font-bold font-mono">{k.v}</p>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {/* Upload anteriores */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Complementar com dias anteriores
              {arquivosAnteriores.length > 0 && (
                <span className="ml-2 normal-case font-normal text-muted-foreground/60">
                  ({arquivosAnteriores.length}/5 · {anteriorRows.length.toLocaleString("pt-BR")} linhas)
                </span>
              )}
            </span>
            {complAnt > 0 && (
              <Badge className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-400/30">
                {complAnt} complementadas
              </Badge>
            )}
          </div>

          {/* Lista de arquivos já carregados */}
          {arquivosAnteriores.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {arquivosAnteriores.map((a) => (
                <div key={a.nome}
                  className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border border-border bg-muted/30 font-mono max-w-[220px]"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="truncate">{a.nome}</span>
                  <span className="text-muted-foreground/60 shrink-0">·{a.linhas.length}</span>
                  <button
                    onClick={() => removerArquivoAnterior(a.nome)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Botão de adicionar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              disabled={loadingAnt || arquivosAnteriores.length >= 5}
              onClick={() => anteriorInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {loadingAnt
                ? "Lendo..."
                : arquivosAnteriores.length >= 5
                ? "Máx. 5 arquivos"
                : arquivosAnteriores.length > 0
                ? "Adicionar mais"
                : "Selecionar Excels anteriores"}
            </Button>
            {arquivosAnteriores.length > 0 && (
              <button
                onClick={() => setArquivosAnteriores([])}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Limpar todos
              </button>
            )}
          </div>

          {erroAnt && (
            <div className="flex items-center gap-1.5 text-destructive text-[10px]">
              <AlertCircle className="h-3 w-3" />{erroAnt}
            </div>
          )}

          <input
            ref={anteriorInputRef}
            type="file" accept=".xlsx,.xls"
            multiple
            onChange={handleAnteriorUpload}
            className="hidden"
          />
        </div>

        {/* Ações de exportação */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={resetLocal}>
            <RefreshCw className="h-3.5 w-3.5" /> Resetar edições
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportarExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={exportarHtml}>
            <Download className="h-3.5 w-3.5" /> Baixar HTML
          </Button>
        </div>
      </div>

      {/* Legenda */}
      {complAnt > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
          <div className="w-3 h-3 rounded-sm bg-blue-400/40 border border-blue-400/60 flex-shrink-0" />
          Linha com bordal azul = dados de fechamento complementados do dia anterior
        </div>
      )}

      {/* ── TABELA EDITÁVEL ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto overflow-y-auto max-h-[480px] scrollbar-thin">
          <Table className="min-w-max w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {TABLE_COLS.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "text-[10px] uppercase tracking-wide h-9 whitespace-nowrap",
                      c.editavel && "bg-primary/5 text-primary"
                    )}
                  >
                    {c.label}
                    {c.editavel && <span className="ml-1 text-[8px] opacity-60">✎</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsExibidos.map((row, ri) => (
                <TableRow
                  key={ri}
                  className={cn(
                    "hover:bg-accent/30",
                    row._preenchidoAnterior && "border-l-2 border-l-blue-400/60"
                  )}
                >
                  {TABLE_COLS.map(({ key, editavel, mono }) => {
                    const v    = String((row as any)[key] ?? "").trim();
                    const isEd = editingCell?.row === ri && editingCell?.col === key;

                    // célula editável
                    if (editavel) {
                      return (
                        <TableCell
                          key={key}
                          className="py-1.5 px-2 bg-primary/[0.02] cursor-pointer"
                          onClick={() => !isEd && startEdit(ri, key)}
                        >
                          {isEd ? (
                            <Input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                              className="h-6 text-xs px-1.5 py-0 min-w-[100px]"
                            />
                          ) : key === "STATUS" ? (
                            <StatusBadge v={v} />
                          ) : key === "VOLTOU_LOGISTICA" ? (
                            <VlBadge v={v} />
                          ) : (
                            <span className={cn("text-xs", !v && "text-muted-foreground/30")}>{v || "—"}</span>
                          )}
                        </TableCell>
                      );
                    }

                    // célula readonly
                    return (
                      <TableCell
                        key={key}
                        title={v}
                        className="py-1.5 px-3 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap align-middle"
                      >
                        {key === "STATUS"        ? <StatusBadge v={v} /> :
                         key === "VOLTOU_LOGISTICA" ? <VlBadge v={v} /> :
                         key === "Tipo_Carga"    ? <TipoCargaBadge v={v || "Carga A"} /> :
                         key === "PLACA"         ? <span className="font-mono font-bold text-primary text-xs">{v || "—"}</span> :
                         key === "MOTORISTA"     ? <span className="font-medium text-xs">{v || "—"}</span> :
                         key === "ENTREGAS" || key === "PESO" || key === "KM" || key === "CAPACIDADE"
                           ? <span className="font-mono text-xs tabular-nums">{fmtNum(v)}</span> :
                         <span className={cn("text-xs", mono && "font-mono", !v && "text-muted-foreground/40")}>
                           {v || "—"}
                         </span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dica de edição */}
      <p className="text-[10px] text-muted-foreground px-1">
        💡 Clique em qualquer célula das colunas marcadas com <span className="text-primary font-bold">✎</span> para editar inline.
        Pressione <kbd className="text-[9px] px-1 border border-border rounded">Enter</kbd> ou clique fora para confirmar.
      </p>
    </div>
  );
};

export default FechamentoDiario;