
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
import { Info, Award, UserCheck, AlertTriangle, Truck, UserCircle, Clock, CalendarCheck } from "lucide-react"

export function DataViewer({ result }: { result: PipelineResult }) {
  const isPerformaxxi = result.pipelineType === 'performaxxi';
  const isPonto = result.pipelineType === 'ponto';

  const renderTable = (data: DriverConsolidated[], type: 'Motorista' | 'Ajudante') => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{type}</TableHead>
            <TableHead className="text-center">Atividade</TableHead>
            {isPonto ? (
               <TableHead className="text-center">Ponto (4/4)</TableHead>
            ) : (
               <TableHead className="text-center">Bonif. (4/4)</TableHead>
            )}
            <TableHead className="text-center">Desempenho %</TableHead>
            <TableHead className="text-center">Total (R$)</TableHead>
            <TableHead className="text-center">Detalhes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                <div>
                  <p>{row.Motorista || row.Ajudante}</p>
                  {row.ID && <p className="text-[10px] text-muted-foreground">ID: {row.ID}</p>}
                </div>
              </TableCell>
              <TableCell className="text-center">{row['Dias com Atividade']}</TableCell>
              <TableCell className="text-center">{row['Dias Bonif. Máxima (4/4)'] || row['Dias Bonif. Ponto (4/4)']}</TableCell>
              <TableCell className="text-center">
                <Badge variant={row['Percentual de Desempenho (%)'] >= 90 ? 'default' : 'secondary'} className={row['Percentual de Desempenho (%)'] >= 90 ? 'bg-green-600' : ''}>
                  {row['Percentual de Desempenho (%)']}%
                </Badge>
              </TableCell>
              <TableCell className="text-center font-bold">R$ {row['Total Bonificação (R$)'].toFixed(2)}</TableCell>
              <TableCell className="text-center text-[10px] text-muted-foreground font-mono">
                {isPonto ? (
                  `Adj: ${row['Total Ajustes Manuais']} | Bm: ${row['Total Bônus Marcações']?.toFixed(1)} | Bc: ${row['Total Bônus Critérios']?.toFixed(1)}`
                ) : !isPerformaxxi ? (
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

  const renderAbsenteismoTable = (data: AbsenteismoData[]) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Colaborador</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead className="text-center">Dias</TableHead>
            <TableHead className="text-center">Presenças</TableHead>
            <TableHead className="text-center">Faltas</TableHead>
            <TableHead className="text-center">Frequência %</TableHead>
            <TableHead className="text-center">Incentivo (R$)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{row.Nome}</TableCell>
              <TableCell className="text-xs">{row.Grupo}</TableCell>
              <TableCell className="text-center">{row.Total_Dias}</TableCell>
              <TableCell className="text-center">{row.Presencas}</TableCell>
              <TableCell className="text-center text-destructive">{row.Faltas}</TableCell>
              <TableCell className="text-center">
                <Badge variant={row.Percentual >= 90 ? 'default' : 'secondary'}>
                  {row.Percentual}%
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
              Referência: {result.month.toString().padStart(2, '0')}/{result.year} | Salvo em {new Date(result.timestamp).toLocaleString()}
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
            {(isPerformaxxi || isPonto) && result.helpersData && (
              <TabsTrigger value="helpers" className="flex items-center gap-2">
                <UserCircle className="size-3" /> Ajudantes
              </TabsTrigger>
            )}
            {isPonto && result.absenteismoData && (
              <TabsTrigger value="abs" className="flex items-center gap-2">
                <CalendarCheck className="size-3" /> Absenteísmo
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
                      {isPonto ? result.absenteismoData?.reduce((acc, curr) => acc + curr.Faltas, 0) : result.data.reduce((acc, curr) => acc + (curr['Falhas SLA'] || curr['Falhas Exc. Velocidade'] || 0), 0)}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{isPonto ? 'Total Faltas' : 'Gargalo Crítico'}</span>
                 </div>
                 <div className="p-4 rounded-lg border bg-primary/5 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold text-primary">
                      R$ {(
                        result.data.reduce((acc, curr) => acc + curr['Total Bonificação (R$)'], 0) + 
                        (result.helpersData?.reduce((acc, curr) => acc + curr['Total Bonificação (R$)'], 0) || 0) +
                        (isPonto ? (result.absenteismoData?.reduce((acc, curr) => acc + curr.Valor_Incentivo, 0) || 0) : 0)
                      ).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Geral (R$)</span>
                 </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="drivers">
            {renderTable(result.data, 'Motorista')}
          </TabsContent>

          {(isPerformaxxi || isPonto) && result.helpersData && (
            <TabsContent value="helpers">
              {renderTable(result.helpersData, 'Ajudante')}
            </TabsContent>
          )}

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
