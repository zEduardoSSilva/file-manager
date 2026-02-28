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
    if (!data || data.length === 0) return <p className="text-xs p-4 italic text-muted-foreground">Nenhum dado consolidado.</p>;
    
    // Pega as chaves do primeiro registro para os cabeçalhos dinâmicos
    const headers = Object.keys(data[0]);

    return (
      <div className="rounded-md border overflow-x-auto min-w-0 max-w-full">
        <Table className="min-w-[800px] sm:min-w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/50">
              {headers.map((h, i) => (
                <TableHead key={i} className="text-[9px] uppercase font-bold py-2 px-2 whitespace-nowrap overflow-hidden text-ellipsis">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 50).map((row, i) => (
              <TableRow key={i} className="hover:bg-muted/30">
                {headers.map((h, j) => (
                  <TableCell key={j} className="py-2 px-2 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {h.includes('R$') || h.includes('Bonificação') 
                      ? Number(row[h] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                      : row[h]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.length > 50 && (
          <p className="text-[9px] text-center p-2 text-muted-foreground bg-muted/10 italic">
            Exibindo apenas os primeiros 50 registros. O arquivo completo contém {data.length} linhas.
          </p>
        )}
      </div>
    )
  }

  const renderAbsenteismoTable = (data: AbsenteismoData[]) => (
    <div className="rounded-md border overflow-x-auto min-w-0 max-w-full">
      <Table className="min-w-[600px] sm:min-w-full">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-[10px] sm:text-xs py-2 px-2">Nome</TableHead>
            <TableHead className="text-center text-[10px] sm:text-xs py-2 px-1">Dias</TableHead>
            <TableHead className="text-center text-[10px] sm:text-xs py-2 px-1">Freq %</TableHead>
            <TableHead className="text-center text-[10px] sm:text-xs py-2 px-1">Faltas</TableHead>
            <TableHead className="text-center text-[10px] sm:text-xs py-2 px-1">Incentivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/30">
              <TableCell className="py-2 px-2">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase font-bold truncate max-w-[150px]">{row.Nome}</p>
                  <p className="text-[9px] text-muted-foreground">ID: {row.ID}</p>
                </div>
              </TableCell>
              <TableCell className="text-center font-bold text-[10px] sm:text-xs py-2 px-1">{row.Total_Dias}</TableCell>
              <TableCell className="text-center py-2 px-1">
                <Badge variant={row['Percentual (%)'] >= 90 ? 'default' : 'secondary'} className="text-[9px] h-4 px-1">
                  {row['Percentual (%)']}%
                </Badge>
              </TableCell>
              <TableCell className="text-center text-destructive font-bold text-[10px] sm:text-xs py-2 px-1">{row.Faltas}</TableCell>
              <TableCell className="text-center font-bold text-green-700 text-[10px] sm:text-xs py-2 px-1">
                {row.Valor_Incentivo.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <Card className="border-t-4 border-t-green-500 shadow-sm overflow-hidden min-w-0">
      <CardHeader className="p-4 sm:p-6 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-base truncate">Resultados: {result.pipelineType.toUpperCase()}</CardTitle>
              {result.id && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[9px] py-0 h-4">
                  <CheckCircle2 className="size-2.5 mr-1" /> SINCRONIZADO
                </Badge>
              )}
            </div>
            <CardDescription className="text-[10px]">
              Ref: {result.month.toString().padStart(2, '0')}/{result.year} | {result.id?.substring(0,8)}...
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <Tabs defaultValue="drivers" className="min-w-0">
          <TabsList className="mb-4 h-8 w-full justify-start overflow-x-auto whitespace-nowrap bg-muted/50">
            <TabsTrigger value="drivers" className="text-[10px] sm:text-xs px-3">Consolidado</TabsTrigger>
            {isPonto && result.absenteismoData && (
              <TabsTrigger value="abs" className="text-[10px] sm:text-xs px-3">Absenteísmo</TabsTrigger>
            )}
            <TabsTrigger value="overview" className="text-[10px] sm:text-xs px-3">Sumário IA</TabsTrigger>
          </TabsList>
          
          <TabsContent value="drivers" className="min-w-0 overflow-hidden">
            {renderTable(result.data)}
          </TabsContent>

          {isPonto && result.absenteismoData && (
            <TabsContent value="abs" className="min-w-0">
              {renderAbsenteismoTable(result.absenteismoData)}
            </TabsContent>
          )}

          <TabsContent value="overview">
             <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                <h4 className="text-[10px] sm:text-xs font-semibold mb-1 flex items-center gap-2">
                  <Info className="size-3 text-primary" /> Análise Inteligente
                </h4>
                <p className="text-[10px] sm:text-xs leading-relaxed text-muted-foreground italic">
                  {result.summary || "Processando resumo..."}
                </p>
              </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
