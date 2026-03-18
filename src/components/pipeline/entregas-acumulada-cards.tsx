"use client";

/**
 * VisaoAcumuladaCards
 * ───────────────────────────────────────────────────────────────────────────
 * View em cards para a Visão Acumulada, inspirada no dashboard Python do
 * Grupo RFK (03 - Dashboard Interativo de Entregas).
 *
 * USO — no arquivo VisaoAcumuladaPage, basta:
 *
 *   1. Importar este componente:
 *        import { VisaoAcumuladaCards } from "./VisaoAcumuladaCards"
 *
 *   2. Adicionar state de view mode:
 *        const [viewMode, setViewMode] = useState<"tabela" | "cards">("tabela")
 *
 *   3. Adicionar toggle nos botões do header:
 *        <Button variant={viewMode === "tabela" ? "default" : "outline"} size="sm"
 *          onClick={() => setViewMode("tabela")}>
 *          <Table2 className="size-3.5 mr-1" /> Tabela
 *        </Button>
 *        <Button variant={viewMode === "cards" ? "default" : "outline"} size="sm"
 *          onClick={() => setViewMode("cards")}>
 *          <LayoutGrid className="size-3.5 mr-1" /> Cards
 *        </Button>
 *
 *   4. Renderizar condicionalmente:
 *        {viewMode === "cards" && (
 *          <VisaoAcumuladaCards
 *            rows={acumulado}
 *            veiculoMap={veiculoMap}
 *          />
 *        )}
 *
 *   5. Tipar o veiculoMap exportando VeiculoInfo de VisaoAcumuladaPage:
 *        export interface VeiculoInfo { capacidade: number; modelo: string; operacao: string }
 *
 * ───────────────────────────────────────────────────────────────────────────
 */

import { FC, JSX, useState, useMemo } from "react";
import {
  Truck, Users, MapPin, Gauge, Package, TrendingUp,
  ChevronDown, ChevronUp, LayoutGrid, Activity, Route,
  Layers, Navigation, Weight, Banknote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — espelham os do VisaoAcumuladaPage (ou importe diretamente de lá)
// ─────────────────────────────────────────────────────────────────────────────

export interface VeiculoInfo {
  capacidade: number;
  modelo:     string;
  operacao:   string;
}

export interface AccumulatedRow {
  "DATA DE ENTREGA":  string;
  "FILIAL":           string;
  "REGIÃO":           string;
  "MOTORISTA":        string;
  "AJUDANTE":         string;
  "AJUDANTE 2":       string;
  "PLACA":            string;
  "PLACA SISTEMA":    string;
  "TIPO CARGA":       string;
  "ENTREGAS":         number;
  "PESO":             number;
  "KM":               number;
  "KM_MAX":           number;
  "TEMPO_MINUTOS":    number;
  "TEMPO":            string;
  "VIAGENS":          string;
  "ROTA":             string;
  "VALOR":            number;
  "FRETE":            number;
  "DESCARGA PALET":   number;
  "HOSPEDAGEM":       number;
  "DIARIA":           number;
  "EXTRA":            number;
  "CHAPA":            number;
  __cargas:           number;
  __linhasOriginais:  Record<string, unknown>[];
}

interface VisaoAcumuladaCardsProps {
  rows:       AccumulatedRow[];
  veiculoMap: Map<string, VeiculoInfo>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalizarPlaca(placa: unknown): string {
  return String(placa ?? "").trim().toUpperCase().replace(/[-\s]/g, "");
}

function fmtNum(v: number, dec = 2): string {
  if (!v) return "—";
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtBRL(v: number): string {
  if (!v) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcOcupacao(peso: number, capacidade: number): number | null {
  if (!capacidade || capacidade <= 0) return null;
  return (peso / capacidade) * 100;
}

function calcCustoKm(freteTotal: number, km: number): number | null {
  if (!km) return null;
  return freteTotal / km;
}

function calcCustoTon(freteTotal: number, pesoKg: number): number | null {
  if (!pesoKg) return null;
  return freteTotal / (pesoKg / 1000);
}

function calcCustoNfe(freteTotal: number, valor: number): number | null {
  if (!valor) return null;
  return (freteTotal / valor) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPO CARGA — badge visual
// ─────────────────────────────────────────────────────────────────────────────

const CARGA_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "Carga A": { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/30" },
  "Carga B": { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-400/30"    },
  "Carga C": { bg: "bg-yellow-500/10",  text: "text-yellow-500",  border: "border-yellow-500/30"  },
  "Carga D": { bg: "bg-orange-500/10",  text: "text-orange-400",  border: "border-orange-400/30"  },
  "Carga E": { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-400/30"     },
};

function TipoCargaBadge({ tipo }: { tipo: string }): JSX.Element {
  const style = CARGA_STYLE[tipo] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", style.bg, style.text, style.border)}>
      {tipo || "—"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OCUPAÇÃO — barra + badge
// ─────────────────────────────────────────────────────────────────────────────

function OcupacaoBar({ pct }: { pct: number | null }): JSX.Element {
  if (pct === null) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-border" />
        <span className="text-[10px] font-bold text-muted-foreground w-12 text-right">N/C</span>
      </div>
    );
  }
  const capped = Math.min(pct, 100);
  const colorBar =
    pct >= 100 ? "bg-emerald-500" :
    pct >=  85 ? "bg-yellow-400" :
                 "bg-red-400";
  const colorText =
    pct >= 100 ? "text-emerald-500" :
    pct >=  85 ? "text-yellow-500"  :
                 "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", colorBar)}
          style={{ width: `${capped}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-bold w-12 text-right font-mono", colorText)}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELO BADGE
// ─────────────────────────────────────────────────────────────────────────────

function ModeloBadge({ modelo }: { modelo: string }): JSX.Element {
  const m = modelo.trim().toUpperCase();
  if (!m || m === "-") return <span className="text-muted-foreground/40 text-[10px]">—</span>;
  const cor =
    m === "TRUCK"     ? "bg-slate-100 text-slate-700 border-slate-200" :
    m === "TOCO"      ? "bg-violet-100 text-violet-700 border-violet-200" :
    m === "CARRETA"   ? "bg-amber-100 text-amber-700 border-amber-200" :
    m === "BITRUCK"   ? "bg-orange-100 text-orange-700 border-orange-200" :
    m === "TRUCKINHO" ? "bg-teal-100 text-teal-700 border-teal-200" :
    m === "VAN"       ? "bg-pink-100 text-pink-700 border-pink-200" :
                        "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cor)}>{m}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERAÇÃO BADGE
// ─────────────────────────────────────────────────────────────────────────────

function OperacaoBadge({ operacao }: { operacao: string }): JSX.Element {
  const op = operacao.trim().toUpperCase();
  if (!op) return <span className="text-muted-foreground/40 text-[10px]">—</span>;
  const cor =
    op === "FRETE" ? "bg-blue-100 text-blue-700 border-blue-200" :
    op === "FROTA" ? "bg-primary/10 text-primary border-primary/20" :
                     "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cor)}>{op}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INDICADOR LOGÍSTICO — bloco individual
// ─────────────────────────────────────────────────────────────────────────────

interface IndicadorProps {
  label: string;
  value: string | null;
  icon: JSX.Element;
}

const Indicador: FC<IndicadorProps> = ({ label, value, icon }) => (
  <div className="flex flex-col items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm hover:bg-white/20 transition-colors">
    <div className="opacity-80">{icon}</div>
    <span className="text-[9px] font-bold uppercase tracking-wider opacity-75">{label}</span>
    <span className="text-sm font-bold leading-tight">{value ?? "—"}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MÉTRICA BOX — grid de métricas principais no corpo do card
// ─────────────────────────────────────────────────────────────────────────────

interface MetricaBoxProps {
  label: string;
  value: string | JSX.Element;
  icon?: JSX.Element;
  highlight?: boolean;
  className?: string;
}

const MetricaBox: FC<MetricaBoxProps> = ({ label, value, icon, highlight, className }) => (
  <div className={cn(
    "flex flex-col gap-1 rounded-xl border p-3 transition-all hover:shadow-sm",
    highlight
      ? "border-primary/30 bg-primary/5"
      : "border-border bg-muted/30",
    className
  )}>
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
    <div className="text-sm font-bold text-foreground leading-tight font-mono">{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE MOTORISTA
// ─────────────────────────────────────────────────────────────────────────────

interface MotoristaCardProps {
  row:        AccumulatedRow;
  veiculoMap: Map<string, VeiculoInfo>;
}

const MotoristaCard: FC<MotoristaCardProps> = ({ row, veiculoMap }) => {
  const [expanded, setExpanded] = useState(false);

  const placa       = normalizarPlaca(row["PLACA"] || row["PLACA SISTEMA"]);
  const veiculo     = veiculoMap.get(placa);
  const capacidade  = veiculo?.capacidade ?? 0;
  const modelo      = veiculo?.modelo     ?? "";
  const operacao    = veiculo?.operacao   ?? "";

  const freteTotal  = (row["FRETE"] || 0) + (row["CHAPA"] || 0);
  const ocupacaoPct = calcOcupacao(row["PESO"], capacidade);
  const custoKm     = calcCustoKm(freteTotal, row["KM"]);
  const custoTon    = calcCustoTon(freteTotal, row["PESO"]);
  const custoNfe    = calcCustoNfe(freteTotal, row["VALOR"]);

  // Viagens como array
  const viagens = (row["VIAGENS"] || "").split(" / ").filter(Boolean);

  // Tipos de carga (pode ter múltiplos separados por " / ")
  const tiposCarga = (row["TIPO CARGA"] || "Carga A").split(" / ").filter(Boolean);

  // Cor gradiente do header baseada no tipo de carga predominante
  const headerGrad =
    tiposCarga[0] === "Carga A" ? "from-emerald-600 to-teal-600"   :
    tiposCarga[0] === "Carga B" ? "from-blue-600 to-cyan-600"      :
    tiposCarga[0] === "Carga C" ? "from-yellow-600 to-amber-600"   :
    tiposCarga[0] === "Carga D" ? "from-orange-600 to-red-500"     :
                                  "from-red-700 to-rose-600";

  // Ocupação visual
  const ocupPct = ocupacaoPct ?? 0;
  const ocupColor =
    ocupPct >= 100 ? "text-emerald-400" :
    ocupPct >=  85 ? "text-yellow-400"  :
                     "text-red-400";

  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card overflow-hidden shadow-sm",
      "transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40"
    )}>
      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className={cn("relative bg-gradient-to-br text-white px-5 py-4", headerGrad)}>
        {/* Badge multi-rota */}
        {row.__cargas > 1 && (
          <div className="absolute top-3 right-3">
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 border border-white/30 backdrop-blur-sm">
              <Layers className="h-3 w-3" />{row.__cargas} rotas
            </span>
          </div>
        )}

        {/* Nome + ajudantes */}
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight truncate drop-shadow-sm">
              {row["MOTORISTA"] || "—"}
            </p>
            {(row["AJUDANTE"] || row["AJUDANTE 2"]) && (
              <p className="text-xs text-white/80 mt-0.5 flex items-center gap-1">
                <Users className="h-3 w-3" />
                {[row["AJUDANTE"], row["AJUDANTE 2"]].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {(row["FILIAL"] || row["REGIÃO"]) && (
                <span className="text-[10px] bg-white/15 border border-white/25 rounded-full px-2 py-0.5 flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5" />
                  {[row["FILIAL"], row["REGIÃO"]].filter(Boolean).join(" · ")}
                </span>
              )}
              {tiposCarga.map((t) => <TipoCargaBadge key={t} tipo={t} />)}
            </div>
          </div>
        </div>

        {/* Placa + modelo + data */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {(row["PLACA"] || row["PLACA SISTEMA"]) && (
            <span className="text-xs bg-white/20 border border-white/30 rounded-lg px-2.5 py-1 font-mono font-bold backdrop-blur-sm">
              🚗 {row["PLACA"] || row["PLACA SISTEMA"]}
            </span>
          )}
          {modelo && <ModeloBadge modelo={modelo} />}
          {operacao && <OperacaoBadge operacao={operacao} />}
          {row["DATA DE ENTREGA"] && (
            <span className="text-[10px] text-white/70 font-mono ml-auto">{row["DATA DE ENTREGA"]}</span>
          )}
        </div>
      </div>

      {/* ── CORPO ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-4">

        {/* MÉTRICAS PRINCIPAIS — grid 3 colunas */}
        <div className="grid grid-cols-3 gap-2">
          <MetricaBox
            label="Viagens"
            value={<span className="text-primary">{viagens.length || row["VIAGENS"] ? viagens.length || 1 : "—"}</span>}
            icon={<Navigation className="h-3 w-3" />}
            highlight
          />
          <MetricaBox
            label="Entregas"
            value={<span className="text-primary">{row["ENTREGAS"] ? row["ENTREGAS"].toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"}</span>}
            icon={<Package className="h-3 w-3" />}
            highlight
          />
          <MetricaBox
            label="Tempo"
            value={row["TEMPO"] || "—"}
            icon={<Activity className="h-3 w-3" />}
          />
          <MetricaBox
            label="Peso"
            value={row["PESO"] ? `${fmtNum(row["PESO"], 0)} kg` : "—"}
            icon={<Weight className="h-3 w-3" />}
          />
          <MetricaBox
            label="Capac."
            value={capacidade ? `${capacidade.toLocaleString("pt-BR")} kg` : <span className="text-muted-foreground/50 text-xs">N/C</span>}
            icon={<Gauge className="h-3 w-3" />}
          />
          <MetricaBox
            label="KM"
            value={row["KM"] ? `${fmtNum(row["KM"], 0)} km` : "—"}
            icon={<Route className="h-3 w-3" />}
          />
        </div>

        {/* OCUPAÇÃO */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Gauge className="h-3 w-3" /> Ocupação do Veículo
            </span>
            <span className={cn("text-xs font-bold font-mono", ocupColor)}>
              {ocupacaoPct !== null ? `${ocupacaoPct.toFixed(1)}%` : "N/C"}
            </span>
          </div>
          <OcupacaoBar pct={ocupacaoPct} />
          {capacidade > 0 && (
            <p className="text-[10px] text-muted-foreground text-right font-mono">
              {fmtNum(row["PESO"], 0)} / {capacidade.toLocaleString("pt-BR")} kg
            </p>
          )}
        </div>

        {/* FATURAMENTO + FRETE */}
        <div className="grid grid-cols-2 gap-2">
          <MetricaBox
            label="Faturamento"
            value={row["VALOR"] ? fmtBRL(row["VALOR"]) : "—"}
            icon={<Banknote className="h-3 w-3" />}
          />
          <MetricaBox
            label="Frete + Chapa"
            value={freteTotal ? fmtBRL(freteTotal) : "—"}
            icon={<TrendingUp className="h-3 w-3" />}
          />
        </div>

        {/* INDICADORES LOGÍSTICOS */}
        {(custoKm || custoTon || custoNfe) && (
          <div className="rounded-xl bg-gradient-to-br from-violet-600/80 to-indigo-700/80 p-3 text-white shadow-inner">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5 opacity-80 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Indicadores Logísticos
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Indicador
                label="Custo / KM"
                value={custoKm ? fmtBRL(custoKm) : null}
                icon={<Route className="h-3.5 w-3.5" />}
              />
              <Indicador
                label="Custo / TON"
                value={custoTon ? fmtBRL(custoTon) : null}
                icon={<Weight className="h-3.5 w-3.5" />}
              />
              <Indicador
                label="Custo / NFe"
                value={custoNfe !== null ? `${custoNfe.toFixed(1)}%` : null}
                icon={<Banknote className="h-3.5 w-3.5" />}
              />
            </div>
          </div>
        )}

        {/* VIAGENS (expandível) */}
        {viagens.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/40 transition-colors"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Navigation className="h-3 w-3" />
                {viagens.length} viagem{viagens.length > 1 ? "s" : ""}
              </span>
              {expanded
                ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {expanded && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {viagens.map((v) => (
                  <span key={v} className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ROTA */}
        {row["ROTA"] && row["ROTA"] !== "CHÃO" && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Route className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span className="font-medium">{row["ROTA"]}</span>
          </div>
        )}

        {/* Custos extras (expandível — apenas se tiver algum) */}
        {(row["DESCARGA PALET"] || row["HOSPEDAGEM"] || row["DIARIA"] || row["EXTRA"]) ? (
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground list-none hover:text-foreground transition-colors">
              <TrendingUp className="h-3 w-3" /> Custos extras
              <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[
                { label: "Descarga Palet", val: row["DESCARGA PALET"] },
                { label: "Hospedagem",     val: row["HOSPEDAGEM"]     },
                { label: "Diária",         val: row["DIARIA"]         },
                { label: "Extra",          val: row["EXTRA"]          },
              ]
                .filter((e) => !!e.val)
                .map((e) => (
                  <div key={e.label} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 bg-background">
                    <span className="text-[10px] text-muted-foreground">{e.label}</span>
                    <span className="text-[10px] font-mono font-bold">{fmtBRL(e.val)}</span>
                  </div>
                ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// KPI STRIP — totalizadores no topo da view
// ─────────────────────────────────────────────────────────────────────────────

interface KpiStripProps {
  rows:       AccumulatedRow[];
  veiculoMap: Map<string, VeiculoInfo>;
}

const KpiStrip: FC<KpiStripProps> = ({ rows, veiculoMap }) => {
  const totalEntregas = rows.reduce((s, r) => s + r["ENTREGAS"], 0);
  const totalPeso     = rows.reduce((s, r) => s + r["PESO"],     0);
  const totalKm       = rows.reduce((s, r) => s + r["KM"],       0);
  const totalValor    = rows.reduce((s, r) => s + r["VALOR"],    0);
  const totalFrete    = rows.reduce((s, r) =>
    s + (r["FRETE"] || 0) + (r["CHAPA"] || 0), 0);

  // Ocupação geral (soma capacidade das placas únicas)
  const placasVistas = new Set<string>();
  let totalCap = 0;
  for (const r of rows) {
    const placa = normalizarPlaca(r["PLACA"]);
    if (!placa || placasVistas.has(placa)) continue;
    placasVistas.add(placa);
    totalCap += veiculoMap.get(placa)?.capacidade ?? 0;
  }
  const ocupGeral = totalCap > 0 ? (totalPeso / totalCap) * 100 : null;

  const kpis = [
    { label: "Motoristas",  value: rows.length.toLocaleString("pt-BR"),                         icon: <Truck      className="h-4 w-4" />, highlight: true  },
    { label: "Entregas",    value: totalEntregas.toLocaleString("pt-BR"),                        icon: <Package    className="h-4 w-4" />, highlight: true  },
    { label: "Peso total",  value: `${fmtNum(totalPeso, 0)} kg`,                                 icon: <Weight     className="h-4 w-4" />, highlight: false },
    { label: "KM total",    value: totalKm > 0 ? `${fmtNum(totalKm, 0)} km` : "—",              icon: <Route      className="h-4 w-4" />, highlight: false },
    { label: "Faturamento", value: fmtBRL(totalValor),                                           icon: <Banknote   className="h-4 w-4" />, highlight: false },
    { label: "Frete + Chapa", value: fmtBRL(totalFrete),                                         icon: <TrendingUp className="h-4 w-4" />, highlight: false },
    { label: "Ocupação",    value: ocupGeral !== null ? `${ocupGeral.toFixed(1)}%` : "N/C",      icon: <Gauge      className="h-4 w-4" />,
      highlight: false,
      colorVal: ocupGeral !== null
        ? ocupGeral >= 100 ? "text-emerald-500" : ocupGeral >= 85 ? "text-yellow-500" : "text-red-400"
        : "text-muted-foreground",
    },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {kpis.map((k) => (
        <div
          key={k.label}
          className={cn(
            "flex-1 min-w-[110px] rounded-xl border p-3 transition-all",
            k.highlight
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{k.icon}
            <span className="text-[10px] font-semibold uppercase tracking-wide">{k.label}</span>
          </div>
          <p className={cn("text-xl font-bold font-mono tracking-tight", (k as any).colorVal ?? "text-foreground")}>
            {k.value}
          </p>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export const VisaoAcumuladaCards: FC<VisaoAcumuladaCardsProps> = ({
  rows,
  veiculoMap,
}) => {
  const [busca,       setBusca]       = useState("");
  const [tipoCarga,   setTipoCarga]   = useState("");
  const [operacaoFil, setOperacaoFil] = useState("");

  // Opções dinâmicas
  const tiposDisponiveis = useMemo(
    () => [...new Set(rows.flatMap((r) => (r["TIPO CARGA"] || "").split(" / ").filter(Boolean)))].sort(),
    [rows]
  );
  const operacoesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const op = veiculoMap.get(normalizarPlaca(r["PLACA"]))?.operacao;
      if (op?.trim()) s.add(op.trim());
    });
    return [...s].sort();
  }, [rows, veiculoMap]);

  const filtrados = useMemo(() => {
    let r = rows;
    if (busca) {
      const q = busca.toLowerCase();
      r = r.filter((row) =>
        [row["MOTORISTA"], row["PLACA"], row["FILIAL"], row["REGIÃO"], row["ROTA"]]
          .some((v) => String(v ?? "").toLowerCase().includes(q))
      );
    }
    if (tipoCarga) {
      r = r.filter((row) => (row["TIPO CARGA"] || "").includes(tipoCarga));
    }
    if (operacaoFil) {
      r = r.filter((row) =>
        (veiculoMap.get(normalizarPlaca(row["PLACA"]))?.operacao ?? "").trim() === operacaoFil
      );
    }
    return r;
  }, [rows, busca, tipoCarga, operacaoFil, veiculoMap]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <LayoutGrid className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Nenhum dado para exibir em cards.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* KPI strip */}
      <KpiStrip rows={filtrados} veiculoMap={veiculoMap} />

      {/* Filtros internos da view cards */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-xl border border-border bg-card">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar motorista, placa..."
            className="h-8 text-xs pl-8"
          />
        </div>

        {tiposDisponiveis.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setTipoCarga("")}
              className={cn(
                "text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                !tipoCarga ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              Todos
            </button>
            {tiposDisponiveis.map((t) => {
              const s = CARGA_STYLE[t] ?? {};
              return (
                <button
                  key={t}
                  onClick={() => setTipoCarga(tipoCarga === t ? "" : t)}
                  className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                    tipoCarga === t
                      ? cn(s.bg, s.text, s.border, "ring-1 ring-current")
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}

        {operacoesDisponiveis.length > 1 && (
          <div className="flex gap-1">
            {(["", ...operacoesDisponiveis] as string[]).map((op) => (
              <button
                key={op || "all"}
                onClick={() => setOperacaoFil(op)}
                className={cn(
                  "text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all",
                  operacaoFil === op
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                {op || "Todos"}
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
          {filtrados.length} motorista{filtrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
        {filtrados.map((row, i) => (
          <MotoristaCard key={`${row["MOTORISTA"]}-${row["DATA DE ENTREGA"]}-${i}`} row={row} veiculoMap={veiculoMap} />
        ))}
      </div>

      {filtrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <LayoutGrid className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhum motorista para os filtros selecionados.</p>
          <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setTipoCarga(""); setOperacaoFil(""); }}>
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
};

export default VisaoAcumuladaCards;