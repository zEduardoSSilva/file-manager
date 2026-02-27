"use client"

import * as React from "react"
import { PipelineResult, DriverConsolidated, AbsenteismoData } from "@/lib/firebase"
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
import { Info, Truck, CalendarCheck } from "lucide-react"

export function DataViewer({ result }: { result: PipelineResult }) {
  const isPonto = result.pipelineType === 'ponto';

  const renderTable = (data: any[], type: 'Motorista' | 'Ajudante') => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">{type}</TableHead>
            <TableHead className="text-center">Dias Trab.</TableHead>
            <TableHead className="text-center">Bonus Marc.</TableHead>
            <TableHead className="text-center">Bonus Crit.</TableHead>
            <TableHead className="text-center">Total (R$)</TableHead>
            <TableHead className="text-center">4/4 OK</TableHead>
            <TableHead className="text-center">Crit. OK</TableHead>
            <TableHead className="text-center">Ajustes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                <div>
                  <p className="text-xs uppercase">{row.Motorista || row.Ajudante || row.Nome}</p>
                  <p className="text-[10px] text-muted-foreground">ID: {row.ID}</p>
                </div>
              </TableCell>
              <TableCell className="text-center">{row.Dias_Trabalhados}</TableCell>
              <TableCell className="text-center text-xs">R$ {Number(row['💰 Total_Bonus_Marcacoes'] || 0).toFixed(2)}</TableCell>
              <TableCell className="text-center text-xs">R$ {Number(row['💰 Total_Bonus_Criterios'] || 0).toFixed(2)}</TableCell>
              <TableCell className="text-center font-bold text-primary">R$ {Number(row['💵 BONIFICACAO_TOTAL'] || 0).toFixed(2)}</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-[10px]">{row.Dias_4_Marcacoes_Completas}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-[10px]">{row.Dias_Todos_Criterios_OK}</Badge>
              </TableCell>
              <TableCell className="text-center text-destructive font-mono text-xs">{row.Total_Ajustes_Manuais}</TableCell>
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
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="text-center">Grupo</TableHead>
            <TableHead className="text-center">Denom. (Dias)</TableHead>
            <TableHead className="text-center">Pres. Físicas</TableHead>
            <TableHead className="text-center">Atestados/Férias</TableHead>
            <TableHead className="text-center">Abonos Man.</TableHead>
            <TableHead className="text-center">Total Pres.</TableHead>
            <TableHead className="text-center">Faltas</TableHead>
            <TableHead className="text-center">Freq %</TableHead>
            <TableHead className="text-center">Incentivo (R$)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium text-[10px] uppercase">
                {row.Nome}
                <p className="text-[9px] text-muted-foreground">ID: {row.ID}</p>
              </TableCell>
              <TableCell className="text-center text-[10px]">{row.Grupo}</TableCell>
              <TableCell className="text-center font-bold">{row.Total_Dias}</TableCell>
              <TableCell className="text-center">{row['Presenças Físicas']}</TableCell>
              <TableCell className="text-center">{row['Atestados/Férias']}</TableCell>
              <TableCell className="text-center text-amber-600">{row['Abonos Manuais']}</TableCell>
              <TableCell className="text-center font-semibold text-primary">{row['Total Presenças']}</TableCell>
              <TableCell className="text-center text-destructive font-bold">{row.Faltas}</TableCell>
              <TableCell className="text-center">
                <Badge variant={row['Percentual (%)'] >= 90 ? 'default' : 'secondary'} className="text-[10px]">
                  {row['Percentual (%)']}%
                </Badge>
              </TableCell>
              <TableCell className="text-center font-bold text-green-700">R$ {row.Valor_Incentivo.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <Card className="border-t-4 border-t-primary">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Dados Transformados: {result.pipelineType.toUpperCase()}</CardTitle>
            <CardDescription>
              Referência: {result.month.toString().padStart(2, '0')}/{result.year}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-primary border-primary/30 uppercase tracking-tighter">
            ID: {result.id}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="drivers">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Sumário IA</TabsTrigger>
            <TabsTrigger value="drivers" className="flex items-center gap-2">
              <Truck className="size-3" /> Consolidado
            </TabsTrigger>
            {isPonto && result.absenteismoData && (
              <TabsTrigger value="abs" className="flex items-center gap-2">
                <CalendarCheck className="size-3" /> Absenteísmo
              </TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="overview">
             <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Info className="size-4 text-primary" /> Sumário IA
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap italic">
                  {result.summary || "Nenhum resumo disponível."}
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
