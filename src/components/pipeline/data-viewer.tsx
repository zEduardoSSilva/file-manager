
"use client"

import * as React from "react"
import { PipelineResult, DriverConsolidated } from "@/lib/firebase"
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
import { Info, Award, UserCheck, AlertTriangle, Truck, UserCircle } from "lucide-react"

export function DataViewer({ result }: { result: PipelineResult }) {
  const isPerformaxxi = result.pipelineType === 'performaxxi';

  const renderTable = (data: DriverConsolidated[], type: 'Motorista' | 'Ajudante') => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{type}</TableHead>
            {isPerformaxxi && <TableHead>Empresa</TableHead>}
            <TableHead className="text-center">Atividade</TableHead>
            <TableHead className="text-center">Bonif. (4/4)</TableHead>
            <TableHead className="text-center">Desempenho %</TableHead>
            <TableHead className="text-center">Total (R$)</TableHead>
            {!isPerformaxxi ? (
              <TableHead className="text-center">Falhas (C/B/O/V)</TableHead>
            ) : (
              <TableHead className="text-center">Falhas (R/S/T/Seq)</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{row.Motorista || row.Ajudante}</TableCell>
              {isPerformaxxi && <TableCell className="text-xs text-muted-foreground">{row.Empresa}</TableCell>}
              <TableCell className="text-center">{row['Dias com Atividade']}</TableCell>
              <TableCell className="text-center">{row['Dias Bonif. Máxima (4/4)']}</TableCell>
              <TableCell className="text-center">
                <Badge variant={row['Percentual de Desempenho (%)'] >= 90 ? 'default' : 'secondary'} className={row['Percentual de Desempenho (%)'] >= 90 ? 'bg-green-600' : ''}>
                  {row['Percentual de Desempenho (%)']}%
                </Badge>
              </TableCell>
              <TableCell className="text-center font-bold">R$ {row['Total Bonificação (R$)'].toFixed(2)}</TableCell>
              <TableCell className="text-center text-[10px] text-muted-foreground font-mono">
                {!isPerformaxxi ? (
                  `${row['Falhas Curva Brusca']} / ${row['Falhas Banguela']} / ${row['Falhas Ociosidade']} / ${row['Falhas Exc. Velocidade']}`
                ) : (
                  `${row['Falhas Raio']} / ${row['Falhas SLA']} / ${row['Falhas Tempo']} / ${row['Falhas Sequência']}`
                )}
              </TableCell>
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
            <CardTitle>Dados Transformados: {isPerformaxxi ? 'Performaxxi' : 'vFleet'}</CardTitle>
            <CardDescription>
              Referência: {result.month.toString().padStart(2, '0')}/{result.year} | Salvo no Firebase em {new Date(result.timestamp).toLocaleString()}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-primary border-primary/30 uppercase tracking-tighter">
            ID: {result.id}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Resumo Executivo</TabsTrigger>
            <TabsTrigger value="drivers" className="flex items-center gap-2">
              <Truck className="size-3" /> Motoristas
            </TabsTrigger>
            {isPerformaxxi && result.helpersData && (
              <TabsTrigger value="helpers" className="flex items-center gap-2">
                <UserCircle className="size-3" /> Ajudantes
              </TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Info className="size-4 text-primary" />
                  Sumário de IA
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap italic">
                  {result.summary || "Nenhum resumo disponível."}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 rounded-lg border bg-accent/5 flex flex-col items-center justify-center text-center">
                    <Award className="size-8 text-accent mb-2" />
                    <span className="text-2xl font-bold text-primary">
                      {result.data.filter(d => d['Percentual de Desempenho (%)'] === 100).length}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">100% Desempenho</span>
                 </div>
                 <div className="p-4 rounded-lg border bg-green-50 flex flex-col items-center justify-center text-center">
                    <UserCheck className="size-8 text-green-600 mb-2" />
                    <span className="text-2xl font-bold text-primary">
                      {result.data.length + (result.helpersData?.length || 0)}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Pessoas</span>
                 </div>
                 <div className="p-4 rounded-lg border bg-destructive/5 flex flex-col items-center justify-center text-center">
                    <AlertTriangle className="size-8 text-destructive mb-2" />
                    <span className="text-2xl font-bold text-primary">
                      {result.data.reduce((acc, curr) => acc + (curr['Falhas SLA'] || curr['Falhas Exc. Velocidade'] || 0), 0)}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Gargalo Crítico</span>
                 </div>
                 <div className="p-4 rounded-lg border bg-primary/5 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold text-primary">
                      R$ {(result.data.reduce((acc, curr) => acc + curr['Total Bonificação (R$)'], 0) + (result.helpersData?.reduce((acc, curr) => acc + curr['Total Bonificação (R$)'], 0) || 0)).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Geral (R$)</span>
                 </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="drivers">
            {renderTable(result.data, 'Motorista')}
          </TabsContent>

          {isPerformaxxi && result.helpersData && (
            <TabsContent value="helpers">
              {renderTable(result.helpersData, 'Ajudante')}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
