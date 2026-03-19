"use client";

/**
 * FechamentoDiario — Dashboard integrado ao sistema (duas abas)
 * ─────────────────────────────────────────────────────────────────────────────
 * Aba "Visão"    → KPIs, cards por filial, distribuição por status/tipo carga
 * Aba "Detalhes" → Tabela editável inline com exportação Excel + HTML
 *
 * LÓGICA DE COMPLEMENTAR COM DIAS ANTERIORES (atualizada):
 *   1. Complementa campos em branco dos registros ATUAIS com dados do anterior
 *      (comportamento original mantido).
 *   2. NOVO: Adiciona ao relatório as linhas do dia anterior cujo STATUS
 *      NÃO é "FECHADO" (em branco ou PENDENTE) e que não existem já no
 *      relatório atual (dedup por VIAGEM ou PLACA).
 *      Essas linhas aparecem marcadas como _vindoAnterior: true.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo, useRef, useEffect, ChangeEvent, FC, JSX } from "react";
import * as XLSX from "xlsx";
import {
  Download, Upload, RefreshCw, AlertCircle, FileSpreadsheet,
  CheckCircle2, XCircle, ClipboardList, LayoutDashboard, Table2,
  Truck, Package, Weight, Route, TrendingUp, Activity,
} from "lucide-react";
import { Button }  from "@/components/ui/button";
import { Badge }   from "@/components/ui/badge";
import { Input }   from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type AnyRow  = Record<string, any>;
type TabView = "visao" | "detalhes";

interface FechRow {
  // ── identificação / datas ──
  "DATA DE ENTREGA":     string;
  DT_FECHAMENTO:         string;
  DATA:                  string;
  // ── equipe / veículo ──
  FILIAL:                string;
  REGIÃO:                string;
  MODELO:                string;
  OPERACAO:              string;
  MOTORISTA:             string;
  AJUDANTE:              string;
  AJUDANTE_1:            string;   // Ajudante 2
  "AJUDANTE 2":          string;   // alias mantido
  CATEGORIA_ORIGEM:      string;
  DESTINO:               string;
  "PLACA SISTEMA":       string;
  PLACA:                 string;
  // ── operação ──
  ENTREGAS:              number;
  PESO:                  number;
  CAPACIDADE:            number;
  TEMPO:                 string;
  KM:                    number;
  VIAGEM:                string;   // alias: VIAGENS
  VIAGENS:               string;
  ROTA:                  string;
  OBSERVAÇÃO:            string;
  Tipo_Carga:            string;
  // ── origem ──
  ARQUIVO_ORIGEM:        string;
  ABA_ORIGEM:            string;
  // ── fechamento (editáveis) ──
  VOLTOU_LOGISTICA:      string;
  STATUS:                string;
  DATA_RETORNO:          string;
  RESPONSAVEL:           string;
  OBSERVACAO_FINANCEIRO: string;
  // ── interno ──
  _idx:                  number;
  _preenchidoAnterior:   boolean;
  _vindoAnterior:        boolean;  // NEW: linha nova vinda do dia anterior
}

interface ArquivoAnterior { nome: string; linhas: AnyRow[] }

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS_FECHAMENTO: (keyof FechRow)[] = [
  "VOLTOU_LOGISTICA", "STATUS", "DATA_RETORNO", "RESPONSAVEL", "OBSERVACAO_FINANCEIRO"
];

const TABLE_COLS: { key: keyof FechRow; label: string; editavel: boolean; mono?: boolean }[] = [
  // ── identificação ──
  { key: "DATA DE ENTREGA",     label: "Dt. Entrega",   editavel: false, mono: true },
  { key: "DT_FECHAMENTO",       label: "Dt. Fecham.",   editavel: false, mono: true },
  { key: "DATA",                label: "Dt. Fatur.",    editavel: false, mono: true },
  // ── equipe / veículo ──
  { key: "FILIAL",              label: "Filial",        editavel: false             },
  { key: "REGIÃO",              label: "Região",        editavel: false             },
  { key: "MODELO",              label: "Modelo",        editavel: false             },
  { key: "OPERACAO",            label: "Operação",      editavel: false             },
  { key: "MOTORISTA",           label: "Motorista",     editavel: false             },
  { key: "AJUDANTE",            label: "Ajudante",      editavel: false             },
  { key: "AJUDANTE_1",          label: "Ajudante 2",    editavel: false             },
  { key: "CATEGORIA_ORIGEM",    label: "Categoria",     editavel: false             },
  { key: "DESTINO",             label: "Destino",       editavel: false             },
  { key: "PLACA SISTEMA",       label: "Placa Sist.",   editavel: false, mono: true },
  { key: "PLACA",               label: "Placa",         editavel: false, mono: true },
  // ── operação ──
  { key: "ENTREGAS",            label: "Entregas",      editavel: false, mono: true },
  { key: "PESO",                label: "Peso (kg)",     editavel: false, mono: true },
  { key: "CAPACIDADE",          label: "Capac.",        editavel: false, mono: true },
  { key: "TEMPO",               label: "Tempo",         editavel: false, mono: true },
  { key: "KM",                  label: "KM",            editavel: false, mono: true },
  { key: "VIAGEM",              label: "Viagem(ns)",    editavel: false, mono: true },
  { key: "OBSERVAÇÃO",          label: "Observação",    editavel: false             },
  { key: "Tipo_Carga",          label: "Tipo Carga",    editavel: false             },
  // ── fechamento ──
  { key: "VOLTOU_LOGISTICA",      label: "Voltou Log.", editavel: true              },
  { key: "STATUS",                label: "Status",      editavel: true              },
  { key: "DATA_RETORNO",          label: "Dt. Retorno", editavel: true,  mono: true },
  { key: "RESPONSAVEL",           label: "Responsável", editavel: true              },
  { key: "OBSERVACAO_FINANCEIRO", label: "Obs. Fin.",   editavel: true              },
];

const CARGA_STYLE: Record<string, { text: string; chip: string }> = {
  "Carga A": { text: "text-emerald-500", chip: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  "Carga B": { text: "text-blue-400",    chip: "bg-blue-500/10 text-blue-400 border-blue-400/30"          },
  "Carga C": { text: "text-yellow-500",  chip: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"    },
  "Carga D": { text: "text-orange-400",  chip: "bg-orange-500/10 text-orange-400 border-orange-400/30"    },
  "Carga E": { text: "text-red-400",     chip: "bg-red-500/10 text-red-400 border-red-400/30"              },
};

// ─────────────────────────────────────────────────────────────────────────────
const LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  TABLE_COLS.map(({ key, label }) => [label, key as string])
)

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  OK:"FECHADO",FINALIZADO:"FECHADO",FINALIZADA:"FECHADO",CONCLUIDO:"FECHADO",
  "CONCLUÍDA":"FECHADO",ENTREGUE:"FECHADO",ENTREGUES:"FECHADO",FECHADO:"FECHADO",
  FECHADA:"FECHADO",ENCERRADO:"FECHADO",ENCERRADA:"FECHADO",LIQUIDADO:"FECHADO",LIQUIDADA:"FECHADO",
  PENDENTE:"PENDENTE",PEND:"PENDENTE",PENDENCIA:"PENDENTE","PENDÊNCIAS":"PENDENTE",
  AGUARDANDO:"PENDENTE",AGUARDA:"PENDENTE","EM ABERTO":"PENDENTE",ABERTO:"PENDENTE",
  ABERTA:"PENDENTE","EM ANDAMENTO":"PENDENTE","EM ANALISE":"PENDENTE","EM ANÁLISE":"PENDENTE",
  "A VERIFICAR":"PENDENTE",VERIFICAR:"PENDENTE",INCOMPLETO:"PENDENTE",INCOMPLETA:"PENDENTE",
};

function extractTempo(v: any): string {
  if (v == null || String(v).trim() === "") return "";

  if (v instanceof Date) {
    const h = v.getHours().toString().padStart(2, "0");
    const m = v.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  const s = String(v).trim();
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0 && n < 1) {
    const totalMin = Math.round(n * 24 * 60);
    return `${Math.floor(totalMin / 60).toString().padStart(2, "0")}:${(totalMin % 60).toString().padStart(2, "0")}`;
  }

  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;

  return s;
}

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

/** Retorna a chave de dedup de uma linha (VIAGEM normalizada ou PLACA normalizada) */
function dedupKey(row: AnyRow | FechRow): string {
  const viagem = String((row as any)["VIAGENS"] ?? (row as any)["VIAGEM"] ?? "").trim();
  if (viagem && viagem.toLowerCase() !== "nan") return `v:${viagem}`;
  const placa = String((row as any)["PLACA"] ?? (row as any)["PLACA SISTEMA"] ?? "")
    .toUpperCase().replace(/[-\s]/g, "").trim();
  if (placa) return `p:${placa}`;
  return "";
}

function rowToFechRow(row: AnyRow, idx: number): FechRow {
  const s = (k: string) => String(row[k] ?? "").trim();
  return {
    "DATA DE ENTREGA":     s("DATA DE ENTREGA"),
    DT_FECHAMENTO:         s("DT_FECHAMENTO"),
    DATA:                  s("DATA"),
    FILIAL:                s("FILIAL"),
    REGIÃO:                s("REGIÃO"),
    MODELO:                s("MODELO"),
    OPERACAO:              s("OPERACAO"),
    MOTORISTA:             s("MOTORISTA"),
    AJUDANTE:              s("AJUDANTE"),
    AJUDANTE_1:            s("AJUDANTE_1") || s("AJUDANTE 2"),
    "AJUDANTE 2":          s("AJUDANTE 2") || s("AJUDANTE_1"),
    CATEGORIA_ORIGEM:      s("CATEGORIA_ORIGEM"),
    DESTINO:               s("DESTINO"),
    "PLACA SISTEMA":       s("PLACA SISTEMA"),
    PLACA:                 s("PLACA") || s("PLACA SISTEMA"),
    ENTREGAS:              numVal(row["ENTREGAS"]),
    PESO:                  numVal(row["PESO"]),
    CAPACIDADE:            numVal(row["CAPACIDADE"]),
    TEMPO:                 extractTempo(row["TEMPO"]),
    KM:                    numVal(row["KM"]),
    VIAGEM:                s("VIAGEM") || s("VIAGENS"),
    VIAGENS:               s("VIAGENS") || s("VIAGEM"),
    ROTA:                  s("ROTA"),
    OBSERVAÇÃO:            s("OBSERVAÇÃO"),
    Tipo_Carga:            s("Tipo_Carga") || s("TIPO CARGA") || "Carga A",
    ARQUIVO_ORIGEM:        s("ARQUIVO_ORIGEM"),
    ABA_ORIGEM:            s("ABA_ORIGEM"),
    VOLTOU_LOGISTICA:      s("VOLTOU_LOGISTICA"),
    STATUS:                normalizarStatus(s("STATUS")),
    DATA_RETORNO:          s("DATA_RETORNO"),
    RESPONSAVEL:           s("RESPONSAVEL"),
    OBSERVACAO_FINANCEIRO: s("OBSERVACAO_FINANCEIRO"),
    _idx: idx, _preenchidoAnterior: false, _vindoAnterior: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MESCLAGEM COM DIAS ANTERIORES (LÓGICA ATUALIZADA)
//
// Fase 1 — Complementa campos vazios dos registros ATUAIS (igual antes)
// Fase 2 — NOVO: adiciona linhas do anterior que:
//           a) não estão FECHADAS (STATUS vazio ou PENDENTE)
//           b) não existem no relatório atual (dedup por VIAGEM ou PLACA)
// ─────────────────────────────────────────────────────────────────────────────

function mesclarComAnterior(fechRows: FechRow[], anteriorRows: AnyRow[]): FechRow[] {
  if (anteriorRows.length === 0) return fechRows;

  // ── Índice por VIAGEM para complementar campos ────────────────────────────
  const idxViagem: Record<string, AnyRow> = {};
  for (const r of anteriorRows) {
    const v = String(
      r["VIAGEM"] ?? r["VIAGENS"] ?? r["Viagem(ns)"] ?? r["LIQUIDAÇÃO"] ?? r["ID"] ?? ""
    ).trim();
    if (!v) continue;
    const score = CAMPOS_FECHAMENTO.filter(c => !vazio(r[c as string])).length;
    const existing = idxViagem[v];
    const existingScore = existing
      ? CAMPOS_FECHAMENTO.filter(c => !vazio(existing[c as string])).length
      : -1;
    if (score > existingScore) idxViagem[v] = r;
  }

  // ── Índice por PLACA (fallback) ───────────────────────────────────────────
  const idxPlaca: Record<string, AnyRow> = {};
  for (const r of anteriorRows) {
    const placa = String(r["PLACA"] ?? r["PLACA SISTEMA"] ?? r["Placa"] ?? r["Placa Sist."] ?? "")
      .trim().toUpperCase().replace(/[-\s]/g, "");
    if (!placa) continue;
    const score = CAMPOS_FECHAMENTO.filter(c => !vazio(r[c as string])).length;
    const existing = idxPlaca[placa];
    const existingScore = existing
      ? CAMPOS_FECHAMENTO.filter(c => !vazio(existing[c as string])).length
      : -1;
    if (score > existingScore) idxPlaca[placa] = r;
  }

  // ── FASE 1: complementa campos dos atuais ────────────────────────────────
  const fase1 = fechRows.map(row => {
    const viagem   = String(row.VIAGENS ?? row.VIAGEM ?? "").trim();
    const placaNorm = (row.PLACA ?? "").toUpperCase().replace(/[-\s]/g, "")
      || String(row["PLACA SISTEMA"] ?? "").toUpperCase().replace(/[-\s]/g, "");

    const fonte = (viagem && idxViagem[viagem]) || (placaNorm && idxPlaca[placaNorm]);
    if (!fonte) return row;

    const merged: FechRow = { ...row, _preenchidoAnterior: true };

    for (const campo of CAMPOS_FECHAMENTO) {
      const valorFonte = String(fonte[campo as string] ?? "").trim();
      if (vazio(valorFonte)) continue;

      if (campo === "STATUS") {
        const statusFonte = normalizarStatus(valorFonte);
        const statusAtual = String(row[campo] ?? "").trim();
        if (statusFonte === "FECHADO") {
          merged[campo] = "FECHADO";
        } else if (vazio(statusAtual)) {
          merged[campo] = statusFonte;
        }
      } else {
        if (!vazio(row[campo as string])) continue;
        (merged as any)[campo] = valorFonte;
      }
    }

    return merged;
  });

  // ── FASE 2: adiciona linhas do anterior que não estão FECHADAS ────────────
  // Monta conjunto de chaves de dedup dos registros atuais
  const chaveAtual = new Set(fase1.map(r => dedupKey(r)).filter(Boolean));

  const linhasParaAdicionar: FechRow[] = [];
  let idxExtra = fase1.length;

  for (const raw of anteriorRows) {
    // Normaliza status da linha anterior
    const statusAnt = normalizarStatus(String(raw["STATUS"] ?? raw["Status"] ?? "").trim());

    // Só adiciona se NÃO estiver FECHADO
    if (statusAnt === "FECHADO") continue;

    // Converte para FechRow para poder checar dedup
    const fr = rowToFechRow(raw, idxExtra);
    fr.STATUS = statusAnt; // garante status normalizado

    const chave = dedupKey(fr);

    // Só adiciona se não existir já no relatório atual
    if (chave && chaveAtual.has(chave)) continue;

    // Marca como vindo do dia anterior
    fr._vindoAnterior = true;
    fr._preenchidoAnterior = false;

    linhasParaAdicionar.push(fr);
    if (chave) chaveAtual.add(chave); // evita duplicatas entre múltiplos arquivos
    idxExtra++;
  }

  // Renumera _idx para não ter colisões
  const resultado = [...fase1, ...linhasParaAdicionar].map((r, i) => ({ ...r, _idx: i }));

  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// GERADOR HTML (para exportar)
// ─────────────────────────────────────────────────────────────────────────────

function gerarHtml(rows: FechRow[], dia: string): string {
  const agora = new Date().toLocaleString("pt-BR");
  const total = rows.length;
  const fechados = rows.filter((r) => r.STATUS === "FECHADO").length;
  const pendentes = rows.filter((r) => r.STATUS === "PENDENTE").length;
  const outros = total - fechados - pendentes;

  const stBadge = (st: string) => {
    if (st === "FECHADO")  return `<span style="background:rgba(0,184,148,.15);border:1px solid rgba(0,184,148,.4);color:#00b894;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">✅ FECHADO</span>`;
    if (st === "PENDENTE") return `<span style="background:rgba(253,203,110,.15);border:1px solid rgba(253,203,110,.5);color:#b8860b;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">⏳ PENDENTE</span>`;
    if (!st)               return `<span style="background:rgba(90,122,110,.08);border:1px solid #c8e6dc;color:#5a7a6e;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">— S/ STATUS</span>`;
    return                        `<span style="background:rgba(225,112,85,.1);border:1px solid rgba(225,112,85,.4);color:#e17055;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:.72em;font-weight:700;font-family:'IBM Plex Mono',monospace;">⚠️ ${st}</span>`;
  };
  const vlBadge = (vl: string) => {
    const v = vl.toUpperCase().trim();
    if (v === "SIM") return `<span style="color:#00916e;font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:.8em;">✅ SIM</span>`;
    if (v === "NÃO" || v === "NAO") return `<span style="color:#d63031;font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:.8em;">❌ NÃO</span>`;
    return `<span style="color:#aac4b8;font-size:.78em;">—</span>`;
  };

  const filiais = [...new Set(rows.map((r) => r.FILIAL).filter(Boolean))].sort();
  const resumoFiliais = filiais.map((f) => {
    const sub = rows.filter((r) => r.FILIAL === f);
    const fech = sub.filter((r) => r.STATUS === "FECHADO").length;
    const pend = sub.filter((r) => r.STATUS === "PENDENTE").length;
    const pct  = sub.length > 0 ? Math.round((fech / sub.length) * 100) : 0;
    return `<div class="fc">
      <div class="fc-name">📍 ${f}</div>
      <div class="fc-tot">${sub.length}</div>
      <div class="fc-row"><span style="color:#00b894">✅ ${fech} fech.</span><span style="color:#b8860b">⏳ ${pend} pend.</span></div>
      <div class="fc-bar-track"><div class="fc-bar-fill" style="width:${pct}%"></div></div>
      <div class="fc-pct">${pct}% fechado</div>
    </div>`;
  }).join("");

  const thead = TABLE_COLS.map((c) => `<th>${c.label}</th>`).join("")
  const tbody = rows.map((r) => {
    // Linhas vindas do anterior: borda laranja. Linhas complementadas: borda azul.
    const estilo = r._vindoAnterior
      ? `style="border-left:3px solid rgba(253,152,0,.7);"`
      : r._preenchidoAnterior
        ? `style="border-left:3px solid rgba(9,132,227,.6);"`
        : "";
    const tds = TABLE_COLS.map(({ key, mono }) => {
      const v = String((r as any)[key] ?? "").trim();
      if (key === "STATUS")           return `<td>${stBadge(v)}</td>`;
      if (key === "VOLTOU_LOGISTICA") return `<td>${vlBadge(v)}</td>`;
      const style = mono ? `style="font-family:'IBM Plex Mono',monospace;"` : "";
      return `<td ${style}>${v || "—"}</td>`;
    }).join("");
    return `<tr ${estilo}>${tds}</tr>`;
  }).join("");

  const dadosJson = JSON.stringify(rows.map((r) => {
    const obj: Record<string, any> = {};
    TABLE_COLS.forEach(({ key, label }) => { obj[label] = (r as any)[key] ?? ""; });
    return obj;
  }));

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
.header{background:linear-gradient(135deg,#00b894,#00cec9);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:200;box-shadow:0 2px 12px rgba(0,184,148,.25);}
.header-left{display:flex;align-items:center;gap:14px;}
.header-logo{width:38px;height:38px;background:rgba(255,255,255,.25);border:2px solid rgba(255,255,255,.5);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.3em;}
.header-title{font-family:'IBM Plex Mono',monospace;font-size:1.05em;font-weight:700;color:#fff;letter-spacing:.5px;}
.header-sub{font-size:.75em;color:rgba(255,255,255,.8);font-family:'IBM Plex Mono',monospace;margin-top:2px;}
.header-right{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.pill{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:.78em;font-weight:600;font-family:'IBM Plex Mono',monospace;}
.pill-v{background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.6);color:#00916e;}
.pill-a{background:rgba(253,203,110,.2);border:1px solid rgba(253,203,110,.6);color:#7d5a00;}
.pill-t{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.9);}
.btn-exp{background:#0984e3;color:#fff;border:none;padding:7px 16px;border-radius:8px;cursor:pointer;font-size:.83em;font-weight:600;font-family:'IBM Plex Sans',sans-serif;transition:all .2s;}
.btn-exp:hover{background:#2979e0;transform:translateY(-1px);}
.tabs{background:#fff;border-bottom:2px solid #c8e6dc;padding:0 24px;display:flex;}
.tab-btn{padding:12px 18px;font-family:'IBM Plex Mono',monospace;font-size:.82em;font-weight:600;cursor:pointer;border:none;background:transparent;color:#5a7a6e;border-bottom:3px solid transparent;margin-bottom:-2px;transition:all .2s;}
.tab-btn:hover{color:#00b894;}
.tab-btn.active{color:#00b894;border-bottom-color:#00b894;}
.page{display:none;}.page.active{display:block;}
.kpi-strip{background:#fff;border-bottom:1px solid #c8e6dc;padding:14px 24px;display:flex;gap:12px;flex-wrap:wrap;}
.kpi{flex:1;min-width:130px;padding:14px 18px;border-radius:10px;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden;}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:currentColor;opacity:.35;border-radius:10px 10px 0 0;}
.kpi-lbl{font-size:.68em;font-weight:700;text-transform:uppercase;letter-spacing:.8px;font-family:'IBM Plex Mono',monospace;opacity:.8;}
.kpi-val{font-size:2em;font-weight:700;font-family:'IBM Plex Mono',monospace;line-height:1;}
.kpi-sub{font-size:.7em;opacity:.65;font-family:'IBM Plex Mono',monospace;}
.k-total{background:rgba(0,184,148,.08);color:#00916e;border:1px solid rgba(0,184,148,.25);}
.k-fech{background:rgba(0,184,148,.08);color:#00916e;border:1px solid rgba(0,184,148,.3);}
.k-pend{background:rgba(253,203,110,.12);color:#b8860b;border:1px solid rgba(253,203,110,.5);}
.k-out{background:rgba(225,112,85,.08);color:#e17055;border:1px solid rgba(225,112,85,.3);}
.k-peso{background:rgba(9,132,227,.06);color:#0984e3;border:1px solid rgba(9,132,227,.2);}
.k-ent{background:rgba(9,132,227,.06);color:#0984e3;border:1px solid rgba(9,132,227,.2);}
.sec{padding:16px 24px 0;}
.sec-title{font-family:'IBM Plex Mono',monospace;font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5a7a6e;margin-bottom:12px;display:flex;align-items:center;gap:8px;}
.sec-title::after{content:'';flex:1;height:1px;background:#c8e6dc;}
.filiais-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;padding:0 24px 16px;}
.fc{background:#fff;border:1px solid #ddeee8;border-radius:12px;padding:14px;border-left:4px solid #00b894;}
.fc-name{font-family:'IBM Plex Mono',monospace;font-size:.82em;font-weight:700;color:#00916e;margin-bottom:6px;}
.fc-tot{font-family:'IBM Plex Mono',monospace;font-size:1.8em;font-weight:700;color:#1a2e26;line-height:1;margin-bottom:8px;}
.fc-row{display:flex;gap:12px;font-size:.72em;font-weight:600;font-family:'IBM Plex Mono',monospace;margin-bottom:8px;}
.fc-bar-track{height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:4px;}
.fc-bar-fill{height:100%;background:linear-gradient(90deg,#00b894,#00cec9);border-radius:3px;transition:width .4s;}
.fc-pct{font-size:.65em;color:#5a7a6e;font-family:'IBM Plex Mono',monospace;}
.resumo-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 24px 16px;}
.resumo-box{background:#fff;border:1px solid #ddeee8;border-radius:10px;overflow:hidden;}
.resumo-title{padding:8px 14px;font-family:'IBM Plex Mono',monospace;font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#5a7a6e;background:#f8fcfa;border-bottom:1px solid #ddeee8;}
.mini-table{width:100%;border-collapse:collapse;}
.mini-table th{padding:6px 12px;background:linear-gradient(135deg,#00b894,#00cec9);font-family:'IBM Plex Mono',monospace;font-size:.68em;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.92);}
.mini-table td{padding:5px 12px;font-size:.78em;border-bottom:1px solid #ddeee8;color:#1a2e26;}
.mini-table tbody tr:nth-child(even){background:#f8fcfa;}
.mini-table .tr-tot td{background:rgba(0,184,148,.08);color:#00916e;font-weight:700;font-family:'IBM Plex Mono',monospace;border-bottom:none;}
.bar-mini{display:flex;align-items:center;gap:6px;}
.bar-track{flex:1;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;}
.bar-fill{height:100%;background:#00b894;border-radius:2px;}
.table-wrap{overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 200px);padding:0 24px 40px;}
.table-wrap::-webkit-scrollbar{height:6px;width:5px;}
.table-wrap::-webkit-scrollbar-track{background:#e8f5f1;}
.table-wrap::-webkit-scrollbar-thumb{background:#a8d5c5;border-radius:3px;}
table{border-collapse:collapse;width:max-content;min-width:100%;}
thead th{background:linear-gradient(135deg,#00b894,#00cec9);padding:10px 12px;text-align:left;font-family:'IBM Plex Mono',monospace;font-size:.7em;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,.92);white-space:nowrap;position:sticky;top:0;border-bottom:2px solid #00916e;}
tbody tr{border-bottom:1px solid #ddeee8;background:#fff;transition:background .12s;}
tbody tr:nth-child(even){background:#f8fcfa;}
tbody tr:hover{background:#edf7f3;}
tbody td{padding:7px 12px;font-size:.82em;white-space:nowrap;color:#1a2e26;vertical-align:middle;max-width:200px;overflow:hidden;text-overflow:ellipsis;}
.legend{padding:6px 24px;background:#f5faf8;border-bottom:1px solid #c8e6dc;font-size:.75em;color:#5a7a6e;display:flex;align-items:center;gap:16px;font-family:'IBM Plex Mono',monospace;flex-wrap:wrap;}
.legend-item{display:flex;align-items:center;gap:6px;}
@media(max-width:900px){.resumo-grid{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <div class="header-logo">🔥</div>
    <div>
      <div class="header-title">GRUPO RFK — Fechamento Diário</div>
      <div class="header-sub">Dia: ${dia} · Gerado em ${agora}</div>
    </div>
  </div>
  <div class="header-right">
    <span class="pill pill-v">✅ ${fechados} Fechados</span>
    <span class="pill pill-a">⏳ ${pendentes} Pendentes</span>
    <span class="pill pill-t">📋 ${total} registros</span>
    <button class="btn-exp" onclick="exportar()">📥 Exportar Excel</button>
  </div>
</div>
<div class="tabs">
  <button class="tab-btn active" id="tab-visao" onclick="switchTab('visao')">📊 Visão Geral</button>
  <button class="tab-btn" id="tab-det" onclick="switchTab('det')">📋 Detalhes</button>
</div>
<div id="page-visao" class="page active">
  <div class="kpi-strip">
    <div class="kpi k-total"><div class="kpi-lbl">Total</div><div class="kpi-val">${total}</div></div>
    <div class="kpi k-fech"><div class="kpi-lbl">✅ Fechados</div><div class="kpi-val">${fechados}</div><div class="kpi-sub">${total > 0 ? Math.round(fechados/total*100) : 0}% do total</div></div>
    <div class="kpi k-pend"><div class="kpi-lbl">⏳ Pendentes</div><div class="kpi-val">${pendentes}</div></div>
    <div class="kpi k-out"><div class="kpi-lbl">⚠️ Outros</div><div class="kpi-val">${outros}</div></div>
    <div class="kpi k-ent"><div class="kpi-lbl">📦 Entregas</div><div class="kpi-val">${rows.reduce((s,r)=>s+r.ENTREGAS,0).toLocaleString("pt-BR")}</div></div>
    <div class="kpi k-peso"><div class="kpi-lbl">⚖️ Peso (kg)</div><div class="kpi-val">${rows.reduce((s,r)=>s+r.PESO,0).toLocaleString("pt-BR",{maximumFractionDigits:0})}</div></div>
  </div>
  <div class="sec"><div class="sec-title">📍 Distribuição por Filial</div></div>
  <div class="filiais-grid">${resumoFiliais || "<p style='padding:0 24px;color:#5a7a6e;font-size:.85em;'>Nenhuma filial identificada.</p>"}</div>
  <div class="sec"><div class="sec-title">📊 Análise por Status e Tipo de Carga</div></div>
  <div class="resumo-grid">
    <div class="resumo-box">
      <div class="resumo-title">Por Status</div>
      <table class="mini-table"><thead><tr><th>Status</th><th>Qtd</th><th>%</th></tr></thead>
      <tbody id="res-status"></tbody></table>
    </div>
    <div class="resumo-box">
      <div class="resumo-title">Por Tipo de Carga</div>
      <table class="mini-table"><thead><tr><th>Tipo</th><th>Qtd</th><th>%</th></tr></thead>
      <tbody id="res-carga"></tbody></table>
    </div>
  </div>
</div>
<div id="page-det" class="page">
  <div class="legend">
    <div class="legend-item"><div style="width:10px;height:10px;border-radius:2px;background:rgba(253,152,0,.6);border:1px solid rgba(253,152,0,.8)"></div>Vindo do dia anterior (pendente)</div>
    <div class="legend-item"><div style="width:10px;height:10px;border-radius:2px;background:rgba(9,132,227,.5);border:1px solid rgba(9,132,227,.7)"></div>Campo complementado do anterior</div>
  </div>
  <div class="table-wrap">
    <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  </div>
</div>
<script>
const DADOS=${dadosJson};
function switchTab(t){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+t).classList.add('active');
  document.getElementById('tab-'+t).classList.add('active');
}
function resumoTabela(id,map,total){
  const arr=Object.entries(map).sort((a,b)=>b[1]-a[1]);
  document.getElementById(id).innerHTML=
    arr.map(([k,n])=>{
      const pct=total>0?Math.round(n/total*100):0;
      return '<tr><td>'+k+'</td><td style="text-align:center;font-family:monospace;font-weight:700;">'+n+'</td>'
        +'<td><div class="bar-mini"><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div>'
        +'<span style="font-size:.72em;font-family:monospace;min-width:28px;text-align:right;">'+pct+'%</span></div></td></tr>';
    }).join('')
    +'<tr class="tr-tot"><td>Total</td><td style="text-align:center;">'+total+'</td><td></td></tr>';
}
function exportar(){
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(DADOS);
  ws['!cols']=Object.keys(DADOS[0]||{}).map(k=>({wch:Math.max(k.length,14)}));
  XLSX.utils.book_append_sheet(wb,ws,"Fechamento");
  XLSX.writeFile(wb,'RFK_Fechamento_${dia.replace(/\//g,"-")}.xlsx');
}
window.onload=()=>{
  const byStatus={},byCarga={};
  DADOS.forEach(d=>{
    const st=d['Status']||'S/ Status';
    byStatus[st]=(byStatus[st]||0)+1;
    const tc=d['Tipo Carga']||'Carga A';
    byCarga[tc]=(byCarga[tc]||0)+1;
  });
  resumoTabela('res-status',byStatus,DADOS.length);
  resumoTabela('res-carga',byCarga,DADOS.length);
};
<\/script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI COMPONENTES REACT
// ─────────────────────────────────────────────────────────────────────────────

const StatusBadge: FC<{ v: string }> = ({ v }) => {
  if (v === "FECHADO")  return <Badge className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/30">✓ FECHADO</Badge>;
  if (v === "PENDENTE") return <Badge className="text-[10px] font-mono bg-yellow-500/10 text-yellow-500 border-yellow-500/30">⏳ PENDENTE</Badge>;
  if (!v)               return <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground/50">—</Badge>;
  return <Badge className="text-[10px] font-mono bg-destructive/10 text-destructive border-destructive/30">⚠ {v}</Badge>;
};

const VlBadge: FC<{ v: string }> = ({ v }) => {
  const u = v.toUpperCase().trim();
  if (u === "SIM") return <span className="text-[10px] font-mono font-bold text-emerald-500">✅ SIM</span>;
  if (u === "NAO" || u === "NÃO") return <span className="text-[10px] font-mono font-bold text-destructive">❌ NÃO</span>;
  return <span className="text-muted-foreground/40 text-[10px]">—</span>;
};

const TipoBadge: FC<{ v: string }> = ({ v }) => {
  const s = CARGA_STYLE[v] ?? { chip: "bg-muted text-muted-foreground border-border" };
  return <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", s.chip)}>{v || "—"}</span>;
};

const ProgressBar: FC<{ pct: number }> = ({ pct }) => (
  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CARD POR FILIAL (aba Visão)
// ─────────────────────────────────────────────────────────────────────────────

const FilialCard: FC<{ filial: string; rows: FechRow[] }> = ({ filial, rows }) => {
  const total   = rows.length;
  const fechados = rows.filter((r) => r.STATUS === "FECHADO").length;
  const pendentes= rows.filter((r) => r.STATUS === "PENDENTE").length;
  const outros   = total - fechados - pendentes;
  const pctFech  = total > 0 ? (fechados / total) * 100 : 0;
  const totalEnt = rows.reduce((s, r) => s + r.ENTREGAS, 0);
  const totalPeso= rows.reduce((s, r) => s + r.PESO, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4 border-l-[3px] border-l-primary">
      <p className="text-xs font-bold font-mono text-primary mb-1 truncate">📍 {filial}</p>
      <p className="text-2xl font-bold font-mono text-foreground leading-none mb-3">{total}</p>
      <div className="space-y-1.5 mb-3">
        {[
          { label: "✅ Fech.", v: fechados, color: "text-emerald-500" },
          { label: "⏳ Pend.", v: pendentes, color: "text-yellow-500" },
          { label: "⚠ Outros", v: outros,   color: "text-destructive" },
        ].map(({ label, v, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn("text-[10px] font-mono font-bold w-16 text-right shrink-0", color)}>{label}</span>
            <ProgressBar pct={total > 0 ? (v / total) * 100 : 0} />
            <span className={cn("text-[10px] font-mono font-bold w-4 text-right shrink-0", color)}>{v}</span>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-border flex gap-3 text-[10px] text-muted-foreground font-mono">
        <span>📦 {totalEnt.toLocaleString("pt-BR")} ent.</span>
        <span>⚖️ {fmtNum(totalPeso)} kg</span>
      </div>
      <div className="mt-2">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-muted-foreground font-mono">% Fechado</span>
          <span className="font-mono font-bold text-primary">{pctFech.toFixed(0)}%</span>
        </div>
        <ProgressBar pct={pctFech} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO TABLE (aba Visão)
// ─────────────────────────────────────────────────────────────────────────────

const ResumoBox: FC<{ title: string; items: { label: string; count: number }[]; total: number }> = ({
  title, items, total,
}) => (
  <Card className="overflow-hidden">
    <button className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
    </button>
    <div className="max-h-60 overflow-y-auto scrollbar-thin">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Valor","Qtd","%"].map((h) => (
              <TableHead key={h} className={cn("text-[10px] uppercase tracking-wide h-8", h !== "Valor" && "text-right")}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const pct = total > 0 ? (item.count / total) * 100 : 0;
            return (
              <TableRow key={item.label} className="hover:bg-accent/30">
                <TableCell className="text-xs py-1.5 max-w-[160px] truncate" title={item.label}>{item.label}</TableCell>
                <TableCell className="text-xs py-1.5 font-mono font-bold text-right">{item.count}</TableCell>
                <TableCell className="py-1.5 w-24">
                  <div className="flex items-center gap-1.5">
                    <ProgressBar pct={pct} />
                    <span className="text-[10px] text-muted-foreground font-mono min-w-[28px] text-right">{pct.toFixed(0)}%</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-primary/5 border-t-2 border-primary/20 hover:bg-primary/10">
            <TableCell className="text-xs py-1.5 font-bold text-primary">Total</TableCell>
            <TableCell className="text-xs py-1.5 font-mono font-bold text-primary text-right">{total}</TableCell>
            <TableCell className="text-xs py-1.5 text-primary">100%</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface FechamentoDiarioProps {
  rows:        AnyRow[];
  filterDay:   number;
  filterMonth: number;
  filterYear:  number;
  filial?:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export const FechamentoDiario: FC<FechamentoDiarioProps> = ({
  rows, filterDay, filterMonth, filterYear,
}) => {
  const anteriorInputRef = useRef<HTMLInputElement>(null);

  // ── estado ────────────────────────────────────────────────────────────────
  const [arquivosAnteriores, setArquivosAnteriores] = useState<ArquivoAnterior[]>([]);
  const [loadingAnt, setLoadingAnt] = useState(false);
  const [erroAnt,    setErroAnt]    = useState<string | null>(null);
  const [tab,        setTab]        = useState<TabView>("visao");
  const [editingCell, setEditingCell] = useState<{ row: number; col: keyof FechRow } | null>(null);
  const [editValue,   setEditValue]   = useState("");
  const [localRows,   setLocalRows]   = useState<FechRow[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>(""); // "" = todos

  const anteriorRows = useMemo(
    () => arquivosAnteriores.flatMap((a) => a.linhas),
    [arquivosAnteriores]
  );

  const fechRowsBase = useMemo(
    () => rows.map((r, i) => rowToFechRow(r, i)),
    [rows]
  );
 
  const fechRowsMesclados = useMemo(
    () => mesclarComAnterior(fechRowsBase, anteriorRows),
    [fechRowsBase, anteriorRows]
  );
 
  useEffect(() => {
    setLocalRows(fechRowsMesclados);
  }, [fechRowsMesclados]); // eslint-disable-line react-hooks/exhaustive-deps
 
  const rowsExibidos = localRows.length > 0 ? localRows : fechRowsMesclados;

  // rows da aba detalhes (filtro de status aplicado)
  const rowsFiltradosDetalhes = useMemo(
    () => filtroStatus ? rowsExibidos.filter((r) => r.STATUS === filtroStatus) : rowsExibidos,
    [rowsExibidos, filtroStatus]
  );

  // statuses únicos para o select
  const statusUnicos = useMemo(
    () => [...new Set(rowsExibidos.map((r) => r.STATUS || "S/ Status").filter(Boolean))].sort(),
    [rowsExibidos]
  );

  // ── estatísticas ──────────────────────────────────────────────────────────
  const totalRows  = rowsExibidos.length;
  const fechados   = rowsExibidos.filter((r) => r.STATUS === "FECHADO").length;
  const pendentes  = rowsExibidos.filter((r) => r.STATUS === "PENDENTE").length;
  const outros     = totalRows - fechados - pendentes;
  const complAnt   = rowsExibidos.filter((r) => r._preenchidoAnterior).length;
  const vindoAnt   = rowsExibidos.filter((r) => r._vindoAnterior).length;
  const totalEnt   = rowsExibidos.reduce((s, r) => s + r.ENTREGAS, 0);
  const totalPeso  = rowsExibidos.reduce((s, r) => s + r.PESO, 0);
  const totalKm    = rowsExibidos.reduce((s, r) => s + r.KM, 0);
  const pctFech    = totalRows > 0 ? Math.round((fechados / totalRows) * 100) : 0;

  const filiais = useMemo(
    () => [...new Set(rowsExibidos.map((r) => r.FILIAL).filter(Boolean))].sort(),
    [rowsExibidos]
  );

  const porStatus = useMemo(() => {
    const m: Record<string, number> = {};
    rowsExibidos.forEach((r) => { const k = r.STATUS || "S/ Status"; m[k] = (m[k] ?? 0) + 1; });
    return Object.entries(m).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [rowsExibidos]);

  const porCarga = useMemo(() => {
    const m: Record<string, number> = {};
    rowsExibidos.forEach((r) => { const k = r.Tipo_Carga || "Carga A"; m[k] = (m[k] ?? 0) + 1; });
    return Object.entries(m).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [rowsExibidos]);

  const porFilialStatus = useMemo(() => {
    const m: Record<string, number> = {};
    rowsExibidos.forEach((r) => {
      const k = r.FILIAL || "Sem filial";
      m[k] = (m[k] ?? 0) + (r.STATUS === "FECHADO" ? 1 : 0);
    });
    return Object.entries(m).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [rowsExibidos]);

  const diaLabel = filterDay > 0
    ? `${String(filterDay).padStart(2,"0")}/${String(filterMonth).padStart(2,"0")}/${filterYear}`
    : `${String(filterMonth).padStart(2,"0")}/${filterYear}`;

  // ── upload anteriores ─────────────────────────────────────────────────────
  async function handleAnteriorUpload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (arquivosAnteriores.length + files.length > 5) {
      setErroAnt(`Máximo 5 arquivos. Já tem ${arquivosAnteriores.length}.`);
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
        const data   = XLSX.utils.sheet_to_json<AnyRow>(sheet, { defval: "", cellDates: false } as any);

        // Remapeia label → key para cada linha
        const remapeado = data.map(row => {
          const novo: AnyRow = {};
          for (const [col, val] of Object.entries(row)) {
            const key = LABEL_TO_KEY[col] ?? col;
            novo[key] = val;
          }
          if (novo["STATUS"]) {
            novo["STATUS"] = normalizarStatus(String(novo["STATUS"]));
          }
          return novo;
        });

        novos.push({ nome: file.name, linhas: remapeado });
      }
      setArquivosAnteriores((prev) => {
        const nomesNovos = new Set(novos.map((n) => n.nome));
        return [...prev.filter((a) => !nomesNovos.has(a.nome)), ...novos];
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

  // ── edição inline ─────────────────────────────────────────────────────────
  function startEdit(ri: number, col: keyof FechRow): void {
    setEditingCell({ row: ri, col });
    setEditValue(String((rowsExibidos[ri] as any)[col] ?? ""));
  }
  function commitEdit(): void {
    if (!editingCell) return;
    const { row: ri, col } = editingCell;
    const final = col === "STATUS" ? normalizarStatus(editValue) : editValue;
    setLocalRows((prev) => prev.map((r, i) => i === ri ? { ...r, [col]: final } : r));
    setEditingCell(null);
  }

  // ── exportações ───────────────────────────────────────────────────────────
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
    XLSX.writeFile(wb, `RFK_Fechamento_${diaLabel.replace(/\//g, "-")}.xlsx`);
  }

  function exportarHtml(): void {
    const html = gerarHtml(rowsExibidos, diaLabel);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `RFK_Fechamento_${diaLabel.replace(/\//g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — empty state
  // ─────────────────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <ClipboardList className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Nenhum dado para o dia selecionado.</p>
        <p className="text-xs">Ajuste o filtro <strong>Dia</strong> para um valor específico.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-in">

      {/* ── HEADER DO COMPONENTE ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">

        {/* Título + dia + badges de progresso */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Fechamento Diário
            </h2>
            <Badge variant="outline" className="font-mono text-sm px-3">{diaLabel}</Badge>
            {vindoAnt > 0 && (
              <Badge className="text-[10px] bg-orange-500/10 text-orange-500 border-orange-400/30">
                +{vindoAnt} Anterior
              </Badge>
            )}
            {complAnt > 0 && (
              <Badge className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-400/30">
                {complAnt} Complementados
              </Badge>
            )}
          </div>
          {/* KPIs em linha no header */}
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              { label: "Total",    v: totalRows, cn: "text-primary"       },
              { label: "✅ Fech.", v: fechados,  cn: "text-emerald-500"   },
              { label: "⏳ Pend.", v: pendentes, cn: "text-yellow-500"    },
              { label: "⚠ Outros",v: outros,    cn: "text-destructive"   },
            ].map((k) => (
              <span key={k.label} className={cn("text-xs font-mono font-bold", k.cn)}>
                {k.label}: {k.v}
              </span>
            ))}
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-xs text-muted-foreground font-mono">{pctFech}% fechado</span>
          </div>
        </div>

        {/* Upload anteriores */}
        <div className="flex flex-col gap-1.5 items-end">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Complementar
            {arquivosAnteriores.length > 0 && (
              <span className="ml-1 font-normal normal-case text-muted-foreground/60">
                ({arquivosAnteriores.length}/5 · {anteriorRows.length} linhas)
              </span>
            )}
          </span>

          {/* Info do que será incluído */}
          {arquivosAnteriores.length === 0 && (
            <p className="text-[10px] text-muted-foreground/60 text-right max-w-[260px] leading-tight">
              Linhas Pendentes <strong>Adicionadas</strong> e <strong>Fechadas</strong> Ignoradas.
            </p>
          )}

          {arquivosAnteriores.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end">
              {arquivosAnteriores.map((a) => (
                <div key={a.nome} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg border border-border bg-muted/30 font-mono max-w-[180px]">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="truncate">{a.nome}</span>
                  <span className="text-muted-foreground/50 shrink-0">·{a.linhas.length}</span>
                  <button onClick={() => removerArquivoAnterior(a.nome)} className="hover:text-destructive transition-colors shrink-0">
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
              disabled={loadingAnt || arquivosAnteriores.length >= 5}
              onClick={() => anteriorInputRef.current?.click()}>
              <Upload className="h-3 w-3" />
              {loadingAnt ? "Lendo..." : arquivosAnteriores.length >= 5 ? "Máx. 5" : arquivosAnteriores.length > 0 ? "Adicionar mais" : "Excels Anteriores"}
            </Button>
            {arquivosAnteriores.length > 0 && (
              <button onClick={() => setArquivosAnteriores([])} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">Limpar</button>
            )}
          </div>
          {erroAnt && (
            <p className="text-[10px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{erroAnt}
            </p>
          )}
          <input ref={anteriorInputRef} type="file" accept=".xlsx,.xls" multiple onChange={handleAnteriorUpload} className="hidden" />
        </div>

        {/* Exportações */}
        <div className="flex gap-2 self-start">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={exportarExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={exportarHtml}>
            <Download className="h-3.5 w-3.5" /> HTML
          </Button>
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border">
        {[
          { id: "visao" as TabView,    label: "Visão Geral",   icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
          { id: "detalhes" as TabView, label: "Detalhes",      icon: <Table2          className="h-3.5 w-3.5" /> },
        ].map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ABA: VISÃO GERAL
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "visao" && (
        <div className="space-y-5">

          {/* KPI strip */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "Total",       v: totalRows,                            sub: "registros",      cn: "border-primary/30 bg-primary/5 text-primary"      },
              { label: "✅ Fechados", v: fechados,                             sub: `${pctFech}% do total`, cn: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" },
              { label: "⏳ Pendentes",v: pendentes,                            sub: `${totalRows > 0 ? Math.round(pendentes/totalRows*100) : 0}% do total`, cn: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500"   },
              { label: "⚠ Outros",   v: outros,                               sub: "sem status / outro",  cn: "border-destructive/30 bg-destructive/10 text-destructive" },
              { label: "📦 Entregas", v: totalEnt,                            sub: "total do dia",   cn: "border-blue-400/30 bg-blue-500/10 text-blue-400"  },
              { label: "⚖️ Peso",    v: fmtNum(totalPeso),                   sub: "kg total",       cn: "border-border bg-card text-foreground"             },
              { label: "🛣️ KM",      v: fmtNum(totalKm),                    sub: "km total",       cn: "border-border bg-card text-foreground"             },
            ].map((k) => (
              <div key={k.label} className={cn("flex-1 min-w-[110px] rounded-xl border p-4", k.cn)}>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75 mb-1">{k.label}</p>
                <p className="text-2xl font-bold font-mono tracking-tight">{typeof k.v === "number" ? k.v.toLocaleString("pt-BR") : k.v}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Barra de progresso de fechamento */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progresso de Fechamento</span>
              <span className="text-sm font-bold font-mono text-primary">{pctFech}%</span>
            </div>
            <div className="h-3 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-700"
                style={{ width: `${pctFech}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-mono">
              <span>{fechados} fechados</span>
              <span>{totalRows - fechados} restantes</span>
            </div>
          </div>

          {/* Cards por filial */}
          {filiais.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">📍 Por Filial</p>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                {filiais.map((f) => (
                  <FilialCard key={f} filial={f} rows={rowsExibidos.filter((r) => r.FILIAL === f)} />
                ))}
              </div>
            </div>
          )}

          {/* Resumos */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">📊 Análise Detalhada</p>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
              <ResumoBox title="Por Status"       items={porStatus}      total={totalRows} />
              <ResumoBox title="Por Tipo de Carga" items={porCarga}      total={totalRows} />
              <ResumoBox title="Fechados por Filial" items={porFilialStatus} total={fechados} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ABA: DETALHES (tabela editável + filtro de status)
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "detalhes" && (
        <div className="space-y-3">

          {/* Toolbar detalhes */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border bg-card">

            {/* Filtro de status */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Filtrar por Status</span>
              <div className="flex gap-1.5 flex-wrap">
                {(["", ...statusUnicos] as string[]).map((st) => {
                  const isActive = filtroStatus === st;
                  const style =
                    st === ""         ? "border-border text-muted-foreground"                          :
                    st === "FECHADO"  ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"     :
                    st === "PENDENTE" ? "border-yellow-500/40 text-yellow-500 bg-yellow-500/10"        :
                                        "border-destructive/40 text-destructive bg-destructive/10";
                  return (
                    <button key={st || "__all__"}
                      onClick={() => setFiltroStatus(st)}
                      className={cn(
                        "text-[10px] font-bold px-2.5 py-1 rounded-full border font-mono transition-all",
                        style,
                        isActive ? "ring-2 ring-offset-1 ring-current" : "opacity-60 hover:opacity-100"
                      )}>
                      {st === "" ? "Todos" : st || "S/ Status"}
                      {st !== "" && (
                        <span className="ml-1 opacity-70">
                          ({rowsExibidos.filter((r) => (r.STATUS || "S/ Status") === st).length})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1" />

            {/* Info + ações */}
            <div className="flex items-center gap-3 flex-wrap">
              {vindoAnt > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm bg-orange-400/40 border border-orange-400/60 shrink-0" />
                  {vindoAnt} do dia anterior
                </div>
              )}
              {complAnt > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm bg-blue-400/40 border border-blue-400/60 shrink-0" />
                  {complAnt} compl. do anterior
                </div>
              )}
              <span className="text-[10px] text-muted-foreground font-mono">
                <span className="text-foreground font-bold">{rowsFiltradosDetalhes.length}</span>
                {filtroStatus && <span className="text-primary"> filtrados</span>} / {rowsExibidos.length} total
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5"
                onClick={() => setLocalRows(fechRowsMesclados)}>
                <RefreshCw className="h-3 w-3" /> Resetar
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                onClick={() => {
                  const data = rowsFiltradosDetalhes.map((r) => {
                    const obj: Record<string, any> = {};
                    TABLE_COLS.forEach(({ key, label }) => { obj[label] = (r as any)[key] ?? ""; });
                    obj["ARQUIVO_ORIGEM"] = r.ARQUIVO_ORIGEM;
                    obj["ABA_ORIGEM"]     = r.ABA_ORIGEM;
                    return obj;
                  });
                  if (!data.length) return;
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(data);
                  ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({
                    wch: Math.max(k.length, ...data.slice(0,50).map((row) => String(row[k] ?? "").length)) + 2,
                  }));
                  const sufixo = filtroStatus ? `_${filtroStatus}` : "";
                  XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
                  XLSX.writeFile(wb, `RFK_Fechamento_${diaLabel.replace(/\//g, "-")}${sufixo}.xlsx`);
                }}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Exportar{filtroStatus ? ` (${filtroStatus})` : ""} Excel
              </Button>
            </div>
          </div>

          {/* Tabela editável */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto overflow-y-auto max-h-[520px] scrollbar-thin">
              <Table className="min-w-max w-full">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {TABLE_COLS.map((c) => (
                      <TableHead key={c.key}
                        className={cn("text-[10px] uppercase tracking-wide h-9 whitespace-nowrap", c.editavel && "bg-primary/5 text-primary")}>
                        {c.label}{c.editavel && <span className="ml-1 text-[8px] opacity-60">✎</span>}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsFiltradosDetalhes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLS.length} className="text-center py-10 text-muted-foreground text-sm">
                        Nenhum registro para o status selecionado.
                      </TableCell>
                    </TableRow>
                  ) : rowsFiltradosDetalhes.map((row, ri) => {
                    const riOriginal = rowsExibidos.findIndex((r) => r._idx === row._idx);
                    return (
                      <TableRow
                        key={row._idx}
                        className={cn(
                          "hover:bg-accent/30",
                          // Laranja = vindo do dia anterior | Azul = campo complementado
                          row._vindoAnterior
                            ? "border-l-2 border-l-orange-400/70"
                            : row._preenchidoAnterior
                              ? "border-l-2 border-l-blue-400/60"
                              : ""
                        )}
                      >
                        {TABLE_COLS.map(({ key, editavel, mono }) => {
                          const v    = String((row as any)[key] ?? "").trim();
                          const isEd = editingCell?.row === riOriginal && editingCell?.col === key;
                          if (editavel) {
                            return (
                              <TableCell key={key} className="py-1.5 px-2 bg-primary/[0.02] cursor-pointer"
                                onClick={() => !isEd && startEdit(riOriginal, key)}>
                                {isEd ? (
                                  <Input autoFocus value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={commitEdit}
                                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                                    className="h-6 text-xs px-1.5 py-0 min-w-[100px]" />
                                ) : key === "STATUS"           ? <StatusBadge v={v} />
                                  : key === "VOLTOU_LOGISTICA" ? <VlBadge v={v} />
                                  : <span className={cn("text-xs", !v && "text-muted-foreground/30")}>{v || "—"}</span>}
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={key} title={v}
                              className="py-1.5 px-3 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap align-middle">
                              {key === "STATUS"             ? <StatusBadge v={v} />
                               : key === "VOLTOU_LOGISTICA" ? <VlBadge v={v} />
                               : key === "Tipo_Carga"       ? <TipoBadge v={v || "Carga A"} />
                               : key === "PLACA" || key === "PLACA SISTEMA"
                                 ? <span className="font-mono font-bold text-primary text-xs">{v || "—"}</span>
                               : key === "MOTORISTA"
                                 ? <span className="font-medium text-xs">{v || "—"}</span>
                               : (key === "ENTREGAS" || key === "PESO" || key === "KM" || key === "CAPACIDADE")
                                 ? <span className="font-mono text-xs tabular-nums">{fmtNum(v)}</span>
                               : <span className={cn("text-xs", mono && "font-mono", !v && "text-muted-foreground/40")}>{v || "—"}</span>}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground px-1">
            💡 Clique nas células marcadas com <span className="text-primary font-bold">✎</span> para editar.
            <kbd className="ml-1 text-[9px] px-1 border border-border rounded">Enter</kbd> confirma ·
            <kbd className="ml-1 text-[9px] px-1 border border-border rounded">Esc</kbd> cancela.
            <span className="ml-3 inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-400/40 border border-orange-400/60" />
              Do dia anterior
            </span>
            <span className="ml-2 inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400/40 border border-blue-400/60" />
              Campo complementado
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default FechamentoDiario;