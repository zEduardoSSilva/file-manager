"use client"

import * as React from "react"
import { PipelineResult, AbsenteismoData } from "@/lib/firebase"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Info, CheckCircle2 } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

// Tabela virtualizada — renderiza apenas linhas visíveis
const DataTable = React.memo(({ data, limit = 500 }: { data: any[], limit?: number }) => {
  const headers = React.useMemo(() => data && data.length > 0 ? Object.keys(data[0]) : [], [data]);
  const displayData = React.useMemo(() => data ? data.slice(0, limit) : [], [data, limit]);
  const parentRef = React.useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: displayData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  })

  const formatCell = React.useCallback((h: string, value: any) => {
    if (h.includes('R$') || h.includes('Bonificação') || h.includes('Total')) {
      return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, style: 'currency', currency: 'BRL' })
    }
    return value
  }, [])

  if (!data || data.length === 0) return <p className="text-xs p-4 italic text-muted-foreground">Nenhum dado consolidado encontrado.</p>;

  return (
    <div className="rounded-md border overflow-hidden min-w-0 w-full bg-white shadow-sm">
      <div className="overflow-x-auto">
        <Table className="min-w-max w-full table-auto border-collapse">
          <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
            <TableRow className="bg-slate-100 border-b">
              {headers.map((h, i) => (
                <TableHead key={i} className="text-[10px] uppercase font-black py-3 px-4 whitespace-nowrap text-muted-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>
      </div>
      <div ref={parentRef} className="overflow-auto max-h-[500px]">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = displayData[virtualRow.index]
            return (
              <div
                key={virtualRow.index}
                className="flex bg-white hover:bg-primary/5 transition-colors border-b last:border-0 group"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {headers.map((h, j) => (
                  <div key={j} className="py-2 px-4 text-[11px] whitespace-nowrap group-hover:text-primary transition-colors flex-shrink-0" style={{ minWidth: 120 }}>
                    {formatCell(h, row[h])}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {data.length > limit && (
        <p className="text-[10px] text-center p-3 text-muted-foreground bg-slate-50 italic border-t font-medium">
          Exibindo os primeiros {limit} registros de {data.length}. Use o botão Exportar Excel para ver todos os dados.
        </p>
      )}
    </div>
  )
});
DataTable.displayName = 'DataTable';

export function DataViewer({ result }: { result: PipelineResult }) {
  const isPonto = result.pipelineType === 'ponto';

  return (
    <Card className="border-t-4 border-t-green-500 shadow-xl overflow-hidden min-w-0 w-full bg-white animate-in zoom-in-95 duration-300">
      <CardHeader className="p-4 sm:p-6 pb-4 border-b bg-slate-50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <CardTitle className="text-base sm:text-lg truncate font-bold text-primary">Resultados: {result.pipelineType.toUpperCase()}</CardTitle>
              {result.id && (
                <Badge className="bg-green-600 text-white border-none text-[10px] font-bold py-0.5 h-5">
                  <CheckCircle2 className="size-3 mr-1" /> SINCRONIZADO
                </Badge>
              )}
            </div>
            <CardDescription className="text-[11px] font-bold text-muted-foreground/80 truncate uppercase tracking-wider">
              Período: {result.month.toString().padStart(2, '0')}/{result.year} | REF: {result.id?.slice(-8) || 'SESSÃO'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-4">
        <Tabs defaultValue="drivers" className="w-full">
          <div className="px-4 sm:px-0">
            <TabsList className="mb-4 h-10 w-full sm:w-auto justify-start bg-slate-100 p-1 border">
              <TabsTrigger value="drivers" className="text-[11px] sm:text-xs px-6 font-bold data-[state=active]:shadow-md">CONSOLIDADO</TabsTrigger>
              {isPonto && result.absenteismoData && (
                <TabsTrigger value="abs" className="text-[11px] sm:text-xs px-6 font-bold data-[state=active]:shadow-md">ABSENTEÍSMO</TabsTrigger>
              )}
              <TabsTrigger value="overview" className="text-[11px] sm:text-xs px-6 font-bold data-[state=active]:shadow-md">ANÁLISE IA</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="drivers" className="w-full focus-visible:outline-none">
            <div className="px-4 sm:px-0 pb-4 min-w-0">
              <DataTable data={result.data} />
            </div>
          </TabsContent>

          {isPonto && result.absenteismoData && (
            <TabsContent value="abs" className="w-full focus-visible:outline-none">
              <div className="px-4 sm:px-0 pb-4 min-w-0">
                <DataTable data={result.absenteismoData} limit={50} />
              </div>
            </TabsContent>
          )}

          <TabsContent value="overview" className="w-full focus-visible:outline-none">
             <div className="mx-4 sm:mx-0 p-5 rounded-xl bg-slate-50 border border-primary/10 mb-4 shadow-inner">
                <h4 className="text-xs font-black mb-3 flex items-center gap-2 text-primary uppercase tracking-widest">
                  <Info className="size-4" /> Relatório de Sistema
                </h4>
                <p className="text-[12px] leading-relaxed text-muted-foreground font-medium">
                  {result.summary || "Relatório processado com sucesso. Navegue pelas abas para visualizar os detalhes analíticos e indicadores de performance."}
                </p>
              </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
