
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
  const isPonto = result.pipelineType === 'ponto';

  const renderTable = (data: DriverConsolidated[], type: 'Motorista' | 'Ajudante') => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">{type}</TableHead>
            {isPonto ? (
              <>
                <TableHead className="text-center">Dias Trab.</TableHead>
                <TableHead className="text-center">Bonus Marc.</TableHead>
                <TableHead className="text-center">Bonus Crit.</TableHead>
                <TableHead className="text-center">Total (R$)</TableHead>
                <TableHead className="text-center">4/4 OK</TableHead>
                <TableHead className="text-center">Crit. OK</TableHead>
                <TableHead className="text-center">Ajustes</TableHead>
              </>
            ) : (
              <>
                <TableHead className="text-center">Atividade</TableHead>
                <TableHead className="text-center">Bonif. (4/4)</TableHead>
                <TableHead className="text-center">Desempenho %</TableHead>
                <TableHead className="text-center">Total (R$)</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                <div>
                  <p className="text-xs uppercase">{row.Motorista || row.Ajudante}</p>
                  <p className="text-[10px] text-muted-foreground">ID: {row.ID}</p>
                </div>
              </TableCell>
              {isPonto ? (
                <>
                  <TableCell className="text-center">{row.Dias_Trabalhados}</TableCell>
                  <TableCell className="text-center text-xs">R$ {row['💰 Total_Bonus_Marcacoes']?.toFixed(2)}</TableCell>
                  <TableCell className="text-center text-xs">R$ {row['💰 Total_Bonus_Criterios']?.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold text-primary">R$ {row['💵 BONIFICACAO_TOTAL']?.toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px]">{row.Dias_4_Marcacoes_Completas}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px]">{row.Dias_Todos_Criterios_OK}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-destructive font-mono text-xs">{row.Total_Ajustes_Manuais}</TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-center">{row['Dias com Atividade']}</TableCell>
                  <TableCell className="text-center">{row['Dias Bonif. Máxima (4/4)']}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={row['Percentual de Desempenho (%)']! >= 90 ? 'default' : 'secondary'}>
                      {row['Percentual de Desempenho (%)']}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-bold">R$ {row['Total Bonificação (R$)']?.toFixed(2)}</TableCell>
                </>
              )}
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
            <TableHead className="text-center">Dias</TableHead>
            <TableHead className="text-center">Presenças</TableHead>
            <TableHead className="text-center">Faltas</TableHead>
            <TableHead className="text-center">Freq %</TableHead>
            <TableHead className="text-center">Incentivo (R$)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium text-xs uppercase">{row.Nome}</TableCell>
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
              <Truck className="size-3" /> Motoristas
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
            {renderTable(result.data, 'Motorista')}
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
