import * as React from "react"
import { collection, getDocs, getFirestore } from "firebase/firestore"
import { initializeApp, getApps, getApp } from "firebase/app"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import {
  Database, RefreshCw, Loader2, Activity, FileStack, CheckCircle2,
  Clock, TrendingUp, Layers, Zap, AlertTriangle, CalendarDays,
  ShieldAlert, BookOpen, Pencil, Trash2, WifiOff, ExternalLink, User as UserIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { fetchUsageHistory, SPARK_LIMITS, type DailyUsage } from "@/lib/firebaseUsageTracker"

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDj733yNRCHjua7X-0rkHc74VA4qkDpg9w",
  authDomain:        "file-manager-hub-50030335.firebaseapp.com",
  projectId:         "file-manager-hub-50030335",
  storageBucket:     "file-manager-hub-50030335.firebasestorage.app",
  messagingSenderId: "187801013388",
  appId:             "1:187801013388:web:ef1417fae5d8d24d93ffa9",
}
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const db  = getFirestore(app)

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface PipelineDoc {
  id: string; pipelineType: string; timestamp: number
  year: number; month: number; summary?: string; data?: any[]
}
interface PipelineStat {
  type: string; label: string; count: number; totalRows: number; latest: number; color: string
}

const PIPELINE_LABELS: Record<string, string> = {
  "consolidacao-entregas": "Consolidação Entregas", "vfleet": "vFleet",
  "performaxxi": "Performaxxi", "ponto": "Ponto", "devolucoes": "Devoluções",
  "faturista": "Faturista", "roadshow": "Roadshow", "coordenadores": "Coordenadores",
  "cco": "CCO", "consolidador": "Consolidador", "retorno-pedidos": "Retorno Pedidos",
  "retorno-pedidos-ul": "Retorno Pedidos UL", "mercanete-roadshow": "Mercanete Roadshow",
}
const PIPELINE_COLORS = [
  "#6366f1","#22c55e","#f59e0b","#ec4899","#14b8a6","#f97316",
  "#8b5cf6","#06b6d4","#84cc16","#ef4444","#a855f7","#0ea5e9",
]

function isQuotaError(e: any): boolean {
  const msg = String(e?.message ?? e?.code ?? "").toLowerCase()
  return msg.includes("resource-exhausted") || msg.includes("quota") || msg.includes("429")
}

function fmtTs(ts: number) {
  return new Date(ts).toLocaleString("pt-BR", {
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",
  })
}
function fmtRelative(ts: number) {
  if (!ts) return "Nunca"
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  const h   = Math.floor(diff / 3_600_000)
  const d   = Math.floor(diff / 86_400_000)
  if (min < 1)  return "agora mesmo"
  if (min < 60) return `${min}min atrás`
  if (h < 24)   return `${h}h atrás`
  return `${d}d atrás`
}
function fmtDate(iso: string) {
  const [, m, d] = iso.split("-"); return `${d}/${m}`
}

// ─── Barra de quota ───────────────────────────────────────────────────────────
function QuotaBar({ label, value = 0, limit = 1, icon: Icon, color, exceeded }: {
  label: string; value?: number; limit: number; icon: React.ElementType
  color: "blue" | "emerald" | "rose"; exceeded?: boolean
}) {
  const pct     = exceeded ? 100 : Math.min(((value || 0) / limit) * 100, 100)
  const warning = pct >= 80
  const danger  = exceeded || pct >= 95

  const FILL = {
    blue:    "[&>div]:bg-blue-500",
    emerald: "[&>div]:bg-emerald-500",
    rose:    "[&>div]:bg-rose-500",
  }
  const ICON = {
    blue:    "text-blue-500",
    emerald: "text-emerald-600",
    rose:    "text-rose-500",
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("size-3.5", danger ? "text-red-500" : warning ? "text-amber-500" : ICON[color])} />
          <span className="text-[11px] font-semibold text-foreground/80">{label}</span>
          {exceeded && (
            <Badge className="text-[9px] h-4 px-1 bg-red-100 text-red-700 border-red-200">EXCEDIDO</Badge>
          )}
          {!exceeded && danger && (
            <Badge className="text-[9px] h-4 px-1 bg-red-100 text-red-700 border-red-200">CRÍTICO</Badge>
          )}
          {!exceeded && !danger && warning && (
            <Badge className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-200">ATENÇÃO</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
          <span className={cn("font-bold", danger ? "text-red-600" : warning ? "text-amber-600" : "text-foreground")}>
            {exceeded ? limit.toLocaleString("pt-BR") + "+" : (value || 0).toLocaleString("pt-BR")}
          </span>
          <span className="opacity-40">/</span>
          <span>{limit.toLocaleString("pt-BR")}</span>
        </div>
      </div>
      <Progress
        value={pct}
        className={cn("h-2", danger ? "[&>div]:bg-red-500" : warning ? "[&>div]:bg-amber-500" : FILL[color])}
      />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        {exceeded
          ? <span className="text-red-600 font-semibold">Cota diária esgotada — serviço suspenso.</span>
          : <><span>{pct.toFixed(1)}% utilizado</span><span>{(limit - (value || 0)).toLocaleString("pt-BR")} restantes</span></>
        }
      </div>
    </div>
  )
}

const tooltipStyle = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: 8, fontSize: 11,
}

// ════════════════════════════════════════════════════════════════════════════
export default function FirebaseUsage() {
  const [docs,         setDocs]         = React.useState<PipelineDoc[]>([])
  const [loading,      setLoading]      = React.useState(true)
  const [lastUpdate,   setLastUpdate]   = React.useState(0)
  const [usage,        setUsage]        = React.useState<DailyUsage[]>([])
  const [usageLoading, setUsageLoading] = React.useState(true)

  // Erros de quota
  const [quotaExceeded,      setQuotaExceeded]      = React.useState(false)
  const [usageQuotaExceeded, setUsageQuotaExceeded] = React.useState(false)

  const handleRefresh = React.useCallback(() => {
    const loadData = async () => {
      setLoading(true)
      setQuotaExceeded(false)
      try {
        const snap   = await getDocs(collection(db, "pipeline_results"))
        const result: PipelineDoc[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id:           d.id,
            pipelineType: data.pipelineType ?? "desconhecido",
            timestamp:    data.timestamp    ?? 0,
            year:         data.year         ?? 0,
            month:        data.month        ?? 0,
            summary:      data.summary      ?? "",
            data:         data.data         ?? [],
          }
        })
        result.sort((a, b) => b.timestamp - a.timestamp)
        setDocs(result)
        setLastUpdate(Date.now())
      } catch (e: any) {
        console.error("[AdminDashboard]", e)
        if (isQuotaError(e)) setQuotaExceeded(true)
      } finally {
        setLoading(false)
      }
    }

    const loadUsage = async () => {
      setUsageLoading(true)
      setUsageQuotaExceeded(false)
      try {
        setUsage(await fetchUsageHistory(7))
      } catch (e: any) {
        console.error("[AdminDashboard] usage:", e)
        if (isQuotaError(e)) setUsageQuotaExceeded(true)
      } finally {
        setUsageLoading(false)
      }
    }

    loadData()
    loadUsage()
  }, [])

  React.useEffect(() => { handleRefresh() }, [handleRefresh])

  // ── Métricas ──────────────────────────────────────────────────────────────
  const stats = React.useMemo<PipelineStat[]>(() => {
    if (!docs) return []
    const map = new Map<string, { count: number; totalRows: number; latest: number; idx: number }>()
    let ci = 0
    for (const doc of docs) {
      const t = doc.pipelineType
      if (!map.has(t)) map.set(t, { count: 0, totalRows: 0, latest: 0, idx: ci++ })
      const s = map.get(t)!
      s.count++; s.totalRows += doc.data?.length ?? 0
      if (doc.timestamp > s.latest) s.latest = doc.timestamp
    }
    return [...map.entries()].map(([type, s]) => ({
      type, label: PIPELINE_LABELS[type] ?? type,
      count: s.count, totalRows: s.totalRows, latest: s.latest,
      color: PIPELINE_COLORS[s.idx % PIPELINE_COLORS.length],
    })).sort((a, b) => b.totalRows - a.totalRows)
  }, [docs])

  const totalDocs = docs?.length ?? 0
  const totalRows = React.useMemo(() => docs?.reduce((acc, d) => acc + (d.data?.length ?? 0), 0) ?? 0, [docs])

  // Hoje
  const todayUsage = usage.find(u => u.date === new Date().toISOString().slice(0, 10)) 
                     ?? { totalReads: 0, totalWrites: 0, totalDeletes: 0, users: {} };

  const pieData = stats.slice(0, 6).map(s => ({ name: s.label, value: s.count, fill: s.color }))

  const monthActivity = React.useMemo(() => {
    if (!docs) return []
    const map = new Map<string, number>()
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      map.set(`${d.getMonth()+1}/${d.getFullYear()}`, 0)
    }
    for (const doc of docs) {
      const key = `${doc.month}/${doc.year}`
      if (map.has(key)) map.set(key, map.get(key)! + 1)
    }
    return [...map.entries()].map(([key, value]) => ({ name: key, importações: value }))
  }, [docs])

  const usageChartData = usage.map(u => ({
    name: fmtDate(u.date), 
    Leituras: u.totalReads ?? 0, 
    Escritas: u.totalWrites ?? 0, 
    Exclusões: u.totalDeletes ?? 0,
  }))

  const userUsageChartData = React.useMemo(() => {
    if (!todayUsage || !todayUsage.users) return [];
    const data = Object.entries(todayUsage.users)
      .map(([id, user]) => ({
        name: user.name || 'Anônimo',
        Leituras: user.reads,
        Escritas: user.writes,
        Exclusões: user.deletes,
      }))
      .sort((a, b) => (b.Leituras + b.Escritas + b.Exclusões) - (a.Leituras + a.Escritas + a.Exclusões));
    return data.slice(0, 10); // Top 10 users
  }, [todayUsage]);

  const isRefreshing = loading || usageLoading
  const anyQuotaExceeded = quotaExceeded || usageQuotaExceeded

  return (
    <div className="space-y-4 md:space-y-6 p-3 sm:p-4 md:p-6">

      {/* ── Banner de quota excedida ── */}
      {anyQuotaExceeded && (
        <Alert className="border-red-300 bg-red-50 text-red-700">
          <WifiOff className="size-4 mt-1 text-red-600" />
          <AlertTitle className="text-red-800 font-semibold">Cota diária do Firebase esgotada</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="text-sm leading-relaxed">
              O plano gratuito (Spark) tem um limite diário de operações. Você atingiu esse limite hoje.
              O serviço será <strong>restabelecido automaticamente à meia-noite</strong> (horário do Firebase, UTC-8).
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="size-5 text-primary" /> Visão Administrativa
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Firebase — <span className="font-mono text-xs">pipeline_results</span>
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          {lastUpdate > 0 && !isRefreshing && (
            <span className="text-[11px] text-muted-foreground">Atualizado {fmtRelative(lastUpdate)}</span>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={handleRefresh}
            disabled={isRefreshing || anyQuotaExceeded}
            title={anyQuotaExceeded ? "Aguarde o reset da cota (meia-noite UTC)" : undefined}
          >
            {isRefreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {isRefreshing ? "Atualizando..." : anyQuotaExceeded ? "Cota esgotada" : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Documentos no banco",
            value: isRefreshing ? "—" : (totalDocs || 0).toLocaleString("pt-BR"),
            icon: FileStack, color: "text-primary", bg: "bg-primary/5 border-primary/20",
          },
          {
            label: "Total de registros",
            value: isRefreshing ? "—" : (totalRows || 0).toLocaleString("pt-BR"),
            icon: Database, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200",
          },
          {
            label: "Pipelines ativos",
            value: isRefreshing ? "—" : (stats?.length ?? 0).toString(),
            icon: Zap, color: "text-amber-600", bg: "bg-amber-50 border-amber-200",
          },
          {
            label: anyQuotaExceeded ? "Cota excedida" : "Última importação",
            value: isRefreshing ? "—" : anyQuotaExceeded ? "Reset às 00h UTC" : docs?.[0] ? fmtRelative(docs[0].timestamp) : "N/A",
            icon: anyQuotaExceeded ? AlertTriangle : Clock,
            color: anyQuotaExceeded ? "text-red-600" : "text-violet-600",
            bg: anyQuotaExceeded ? "bg-red-50 border-red-200" : "bg-violet-50 border-violet-200",
          },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className={cn("rounded-xl border p-3 sm:p-4 flex items-center gap-3 shadow-sm", card.bg)}>
              <div className="size-9 rounded-lg flex items-center justify-center shrink-0 bg-white/60 shadow-sm border border-white/80">
                <Icon className={cn("size-4", card.color)} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-lg sm:text-xl font-bold leading-tight tracking-tight whitespace-nowrap", isRefreshing && "animate-pulse bg-muted-foreground/20 rounded-md text-transparent w-10")}>
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5 break-words">{card.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Cota diária ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className={cn("size-3.5", anyQuotaExceeded ? "text-red-500" : "text-primary")} />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Cota Diária — Plano Gratuito</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          {usageLoading ? (
            <div className="md:col-span-3 flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /><span className="text-sm">Carregando dados de consumo...</span>
            </div>
          ) : (
            <>
              <QuotaBar label="Leituras"  value={todayUsage.totalReads}   limit={SPARK_LIMITS.reads}   icon={BookOpen} color="blue"    exceeded={usageQuotaExceeded} />
              <QuotaBar label="Escritas"  value={todayUsage.totalWrites}  limit={SPARK_LIMITS.writes}  icon={Pencil}   color="emerald" exceeded={usageQuotaExceeded} />
              <QuotaBar label="Exclusões" value={todayUsage.totalDeletes} limit={SPARK_LIMITS.deletes} icon={Trash2}   color="rose"    exceeded={usageQuotaExceeded} />
            </>
          )}
        </div>

        {/* Histórico 7 dias */}
        {!usageLoading && usage.length > 0 && (
          <>
            <div className="px-4 sm:px-5 pb-1 flex items-center gap-2 border-t pt-3">
              <CalendarDays className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Histórico de Consumo — últimos 7 dias</span>
            </div>
            <div className="px-4 sm:px-5 pb-4">
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={usageChartData} barSize={14} barGap={2} margin={{ left: -20, right: 10, top: 8, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: string) => [(v || 0).toLocaleString("pt-BR"), n]} />
                  <Bar dataKey="Leituras"  fill="#3b82f6" fillOpacity={0.8} radius={[3,3,0,0]} />
                  <Bar dataKey="Escritas"  fill="#22c55e" fillOpacity={0.8} radius={[3,3,0,0]} />
                  <Bar dataKey="Exclusões" fill="#f43f5e" fillOpacity={0.8} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* ── Gráficos de Atividade e Consumo ── */}
      {!anyQuotaExceeded && docs.length > 0 && (
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Consumo por Usuário (Hoje) */}
            <div className="lg:col-span-2 rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/5 flex items-center gap-2">
                <UserIcon className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Consumo por Usuário (Hoje)
                </span>
              </div>
              <div className="p-4">
                {usageLoading ? (
                  <div className="flex items-center justify-center h-[220px]"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : userUsageChartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[220px]">
                    <p className="text-sm text-muted-foreground text-center">Nenhum consumo de usuário registrado hoje.</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={userUsageChartData} margin={{ left: -20, right: 10, top: 4, bottom: 0 }} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={80} interval={0} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted))", radius: 6 }} contentStyle={tooltipStyle} formatter={(v: any, name: string) => [v.toLocaleString("pt-BR"), name]} />
                        <Bar dataKey="Leituras" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="Escritas" stackId="a" fill="#22c55e" />
                        <Bar dataKey="Exclusões" stackId="a" fill="#f43f5e" radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-3 justify-center">
                      {[["#3b82f6","Leituras"],["#22c55e","Escritas"],["#f43f5e","Exclusões"]].map(([c,l]) => (
                        <div key={l} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <div className="size-2 rounded-full" style={{ background: c }} />{l}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Documentos (Pizza) */}
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/5 flex items-center gap-2">
                <Layers className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Documentos</span>
              </div>
              <div className="p-4 flex flex-col items-center">
                <PieChart width={160} height={160}>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, "docs"]} />
                </PieChart>
                <div className="w-full max-w-xs px-4 space-y-1.5 mt-3">
                  {pieData.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="size-2 rounded-full shrink-0" style={{ background: e.fill }} />
                        <span className="text-muted-foreground truncate">{e.name}</span>
                      </div>
                      <span className="font-semibold shrink-0 ml-2">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Atividade mensal */}
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/5 flex items-center gap-2">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Importações por Mês (últimos 6)
              </span>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={monthActivity} barSize={32} margin={{ left: -20, right: 10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, "importações"]} />
                  <Bar dataKey="importações" fill="hsl(var(--primary))" fillOpacity={0.7} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela + Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Resumo por Pipeline */}
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/5 flex items-center gap-2">
                <Database className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Resumo por Pipeline</span>
              </div>
              <ScrollArea className="h-[320px]">
                {isRefreshing ? <div className="flex items-center justify-center h-full"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead><tr className="bg-muted/10">
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Pipeline</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Docs</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Registros</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Última</th>
                      </tr></thead>
                      <tbody>
                        {stats.map((s, i) => (
                          <tr key={s.type} className={cn("border-t border-border/30 hover:bg-muted/5 transition-colors", i%2===0?"bg-background":"bg-muted/5")}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full shrink-0" style={{ background: s.color }} />
                                <span className="font-medium text-foreground/80 truncate max-w-[140px]">{s.label}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap">{s.count}</td>
                            <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                              {s.totalRows > 0
                                ? <span className="font-semibold text-emerald-600">{s.totalRows.toLocaleString("pt-BR")}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">
                              {s.latest ? fmtRelative(s.latest) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Atividade Recente */}
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="size-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Atividade Recente</span>
                </div>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">últimos {docs.slice(0,20).length}</Badge>
              </div>
              <ScrollArea className="h-[320px]">
                {isRefreshing ? <div className="flex items-center justify-center h-full"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                : docs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <AlertTriangle className="size-6 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Sem atividade recente.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {docs.slice(0,20).map(doc => {
                      const stat  = stats.find(s => s.type === doc.pipelineType)
                      const color = stat?.color ?? "#94a3b8"
                      const rowCount = doc.data?.length ?? 0
                      return (
                        <div key={doc.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/5 transition-colors">
                          <div className="size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                            style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                            <CheckCircle2 className="size-3.5" style={{ color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-semibold">{PIPELINE_LABELS[doc.pipelineType] ?? doc.pipelineType}</span>
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                                {String(doc.month).padStart(2,"0")}/{doc.year}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">{fmtTs(doc.timestamp)}</span>
                              {rowCount > 0 && (
                                <><span className="text-[10px] text-muted-foreground">·</span>
                                <span className="text-[10px] font-semibold text-emerald-600">{rowCount.toLocaleString("pt-BR")} registros</span></>
                              )}
                            </div>
                            {doc.summary && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate opacity-70">{doc.summary}</p>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 text-right">{fmtRelative(doc.timestamp)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-y-1 gap-x-4 text-[10px] text-muted-foreground/80 px-1 pt-2">
        <span className="font-mono">firebase-hub-50030335 · {anyQuotaExceeded ? "cota excedida" : `${totalDocs} docs · ${(totalRows || 0).toLocaleString("pt-BR")} registros`}</span>
        {lastUpdate > 0 && !isRefreshing && <span className="text-right">Snapshot em {fmtTs(lastUpdate)}</span>}
      </div>
    </div>
  )
}
