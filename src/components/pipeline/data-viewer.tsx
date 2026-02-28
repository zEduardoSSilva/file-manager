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

export function DataViewer({ result }: { result: PipelineResult }) {
  const isPonto = result.pipelineType === 'ponto';

  const renderTable = (data: any[]) => {
    if (!data || data.length === 0) return <p className="text-xs p-4 italic text-muted-foreground">Nenhum dado consolidado encontrado.</p>;
    
    const headers = Object.keys(data[0]);

    return (
      <div className="rounded-md border overflow-x-auto min-w-0 w-full bg-white shadow-sm">
        <Table className="min-w-max w-full table-auto">
          <TableHeader>
            <TableRow className="bg-muted/50">
              {headers.map((h, i) => (
                <TableHead key={i} className="text-[10px] uppercase font-bold py-3 px-4 whitespace-nowrap">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 100).map((row, i) => (
              <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                {headers.map((h, j) => (
                  <TableCell key={j} className="py-2.5 px-4 text-[11px] whitespace-nowrap border-b">
                    {h.includes('R$') || h.includes('Bonificação') 
                      ? Number(row[h] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, style: 'currency', currency: 'BRL' })
                      : row[h]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.length > 100 && (
          <p className="text-[10px] text-center p-3 text-muted-foreground bg-muted/5 italic border-t">
            Exibindo os primeiros 100 registros. Use o botão Exportar para visualizar os {data.length} itens totais.
          </p>
        )}
      </div>
    )
  }

  const renderAbsenteismoTable = (data: AbsenteismoData[]) => (
    <div className="rounded-md border overflow-x-auto min-w-0 w-full bg-white shadow-sm">
      <Table className="min-w-max w-full">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-[11px] py-3 px-4">Nome</TableHead>
            <TableHead className="text-center text-[11px] py-3 px-4">Dias</TableHead>
            <TableHead className="text-center text-[11px] py-3 px-4">Freq %</TableHead>
            <TableHead className="text-center text-[11px] py-3 px-4">Faltas</TableHead>
            <TableHead className="text-center text-[11px] py-3 px-4">Incentivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/30 transition-colors">
              <TableCell className="py-2.5 px-4 border-b">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase font-bold truncate max-w-[200px]">{row.Nome}</p>
                  <p className="text-[9px] text-muted-foreground">ID: {row.ID}</p>
                </div>
              </TableCell>
              <TableCell className="text-center font-bold text-[11px] py-2.5 px-4 border-b">{row.Total_Dias}</TableCell>
              <TableCell className="text-center py-2.5 px-4 border-b">
                <Badge variant={row['Percentual (%)'] >= 90 ? 'default' : 'secondary'} className="text-[10px] h-5 px-2">
                  {row['Percentual (%)']}%
                </Badge>
              </TableCell>
              <TableCell className="text-center text-destructive font-bold text-[11px] py-2.5 px-4 border-b">{row.Faltas}</TableCell>
              <TableCell className="text-center font-bold text-green-700 text-[11px] py-2.5 px-4 border-b">
                {row.Valor_Incentivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <Card className="border-t-4 border-t-green-500 shadow-lg overflow-hidden min-w-0 w-full">
      <CardHeader className="p-4 sm:p-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <CardTitle className="text-base sm:text-lg truncate">Resultados: {result.pipelineType.toUpperCase()}</CardTitle>
              {result.id && (
                <Badge className="bg-green-500 text-white border-none text-[10px] py-0.5 h-5 animate-in fade-in zoom-in duration-300">
                  <CheckCircle2 className="size-3 mr-1" /> SINCRONIZADO
                </Badge>
              )}
            </div>
            <CardDescription className="text-[11px] font-medium text-muted-foreground truncate">
              Período: {result.month.toString().padStart(2, '0')}/{result.year} | DOC: {result.id || 'Processando...'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <Tabs defaultValue="drivers" className="w-full">
          <div className="px-4 sm:px-0">
            <TabsList className="mb-4 h-9 w-full sm:w-auto justify-start bg-muted/50 p-1">
              <TabsTrigger value="drivers" className="text-[11px] sm:text-xs px-4">Consolidado</TabsTrigger>
              {isPonto && result.absenteismoData && (
                <TabsTrigger value="abs" className="text-[11px] sm:text-xs px-4">Absenteísmo</TabsTrigger>
              )}
              <TabsTrigger value="overview" className="text-[11px] sm:text-xs px-4">Sumário IA</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="drivers" className="w-full focus-visible:outline-none">
            <div className="px-4 sm:px-0 pb-4 min-w-0">
              {renderTable(result.data)}
            </div>
          </TabsContent>

          {isPonto && result.absenteismoData && (
            <TabsContent value="abs" className="w-full focus-visible:outline-none">
              <div className="px-4 sm:px-0 pb-4 min-w-0">
                {renderAbsenteismoTable(result.absenteismoData)}
              </div>
            </TabsContent>
          )}

          <TabsContent value="overview" className="w-full focus-visible:outline-none">
             <div className="mx-4 sm:mx-0 p-4 rounded-xl bg-primary/5 border border-primary/10 mb-4 shadow-inner">
                <h4 className="text-xs font-bold mb-2 flex items-center gap-2 text-primary">
                  <Info className="size-4" /> ANÁLISE DO SISTEMA
                </h4>
                <p className="text-[12px] leading-relaxed text-muted-foreground break-words">
                  {result.summary || "Relatório processado e salvo no banco de dados. Navegue pelas abas para visualizar os detalhes analíticos."}
                </p>
              </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
