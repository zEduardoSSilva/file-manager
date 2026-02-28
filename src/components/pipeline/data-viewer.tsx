
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
import { Info, Truck, CalendarCheck, CheckCircle2 } from "lucide-react"

export function DataViewer({ result }: { result: PipelineResult }) {
  const isPonto = result.pipelineType === 'ponto';

  const renderTable = (data: any[], type: 'Motorista' | 'Ajudante' | 'Colaborador') => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="min-w-[140px] text-xs py-2 px-3">{type}</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Dias</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Bonus M.</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Bonus C.</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Total (R$)</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">4/4 OK</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/30">
              <TableCell className="font-medium py-2 px-3">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase font-bold truncate max-w-[120px]">{row.Funcionario || row.Motorista || row.Ajudante || row.Nome}</p>
                  <p className="text-[9px] text-muted-foreground">Cargo: {row.Cargo || 'N/A'}</p>
                </div>
              </TableCell>
              <TableCell className="text-center text-[10px] sm:text-xs py-2 px-1">{row['Dias com Atividade'] || row.Dias_Trabalhados || 0}</TableCell>
              <TableCell className="text-center text-[10px] sm:text-xs py-2 px-1 font-mono">
                {Number(row['💰 Total_Bonus_Marcacoes'] || 0).toFixed(2)}
              </TableCell>
              <TableCell className="text-center text-[10px] sm:text-xs py-2 px-1 font-mono">
                {Number(row['💰 Total_Bonus_Criterios'] || 0).toFixed(2)}
              </TableCell>
              <TableCell className="text-center font-bold text-primary text-[10px] sm:text-xs py-2 px-1">
                {Number(row['Total Bonificação (R$)'] || row['💵 BONIFICACAO_TOTAL'] || 0).toFixed(2)}
              </TableCell>
              <TableCell className="text-center py-2 px-1">
                <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 h-4">
                  {row['Dias Bonif. Máxima (4/4)'] || row.Dias_4_Marcacoes_Completas || 0}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  const renderAbsenteismoTable = (data: AbsenteismoData[]) => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs py-2 px-3">Nome</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Denom.</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Total P.</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Faltas</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Freq %</TableHead>
            <TableHead className="text-center text-xs py-2 px-1">Incentivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/30">
              <TableCell className="font-medium py-2 px-3">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase font-bold truncate max-w-[120px]">{row.Nome}</p>
                  <p className="text-[9px] text-muted-foreground">ID: {row.ID}</p>
                </div>
              </TableCell>
              <TableCell className="text-center font-bold text-[10px] sm:text-xs py-2 px-1">{row.Total_Dias}</TableCell>
              <TableCell className="text-center font-semibold text-primary text-[10px] sm:text-xs py-2 px-1">{row['Total Presenças']}</TableCell>
              <TableCell className="text-center text-destructive font-bold text-[10px] sm:text-xs py-2 px-1">{row.Faltas}</TableCell>
              <TableCell className="text-center py-2 px-1">
                <Badge variant={row['Percentual (%)'] >= 90 ? 'default' : 'secondary'} className="text-[8px] sm:text-[10px] h-4 px-1">
                  {row['Percentual (%)']}%
                </Badge>
              </TableCell>
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
    <Card className="border-t-4 border-t-green-500 shadow-sm">
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Dados Transformados: {result.pipelineType.toUpperCase()}</CardTitle>
              {result.id && (
                <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20 flex items-center gap-1 text-[9px] py-0 h-5">
                  <CheckCircle2 className="size-2.5" /> SINCRONIZADO
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Período: {result.month.toString().padStart(2, '0')}/{result.year}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono opacity-60">
              FB-ID: {result.id?.substring(0, 12)}...
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <Tabs defaultValue="drivers">
          <TabsList className="mb-4 h-8 sm:h-10 w-full sm:w-auto overflow-x-auto justify-start sm:justify-center">
            <TabsTrigger value="overview" className="text-xs h-7 sm:h-8">Sumário IA</TabsTrigger>
            <TabsTrigger value="drivers" className="flex items-center gap-1 sm:gap-2 text-xs h-7 sm:h-8">
              <Truck className="size-3" /> Consolidado
            </TabsTrigger>
            {isPonto && result.absenteismoData && (
              <TabsTrigger value="abs" className="flex items-center gap-1 sm:gap-2 text-xs h-7 sm:h-8">
                <CalendarCheck className="size-3" /> Absenteísmo
              </TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="overview">
             <div className="bg-primary/5 p-3 sm:p-4 rounded-lg border border-primary/10">
                <h4 className="text-xs sm:text-sm font-semibold mb-2 flex items-center gap-2">
                  <Info className="size-3 sm:size-4 text-primary" /> Análise Inteligente
                </h4>
                <p className="text-[11px] sm:text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap italic">
                  {result.summary || "Processando resumo da IA..."}
                </p>
              </div>
          </TabsContent>
          
          <TabsContent value="drivers">
            {renderTable(result.data, 'Colaborador')}
          </TabsContent>

          {isPonto && result.absenteismoData && (
            <TabsContent value="abs">
              {renderAbsenteismoTable(result.absenteismoData)}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
