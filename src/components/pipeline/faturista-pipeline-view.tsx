"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  Package,
  Truck,
  HelpCircle,
  FileSpreadsheet,
  BadgePercent,
  Clock,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AIParamAssistant } from "./ai-param-assistant"
import { executeFaturistaPipeline } from "@/app/actions/faturista-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"

function FaturistaResultViewer({ result }: { result: PipelineResult }) {
  const { resumoMensal, dadosConsolidados } = result;

  return (
    <div className="space-y-6 mt-6 animate-in fade-in duration-500">
      {resumoMensal && resumoMensal.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo Mensal por Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Bonificação Cintas</TableHead>
                  <TableHead className="text-right">Bonificação Liberação</TableHead>
                  <TableHead className="text-right font-bold">Bonificação Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumoMensal.map((item: any) => (
                  <TableRow key={item.empresa}>
                    <TableCell className="font-medium">{item.empresa}</TableCell>
                    <TableCell className="text-right font-mono">{item.bonificacaoCintas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    <TableCell className="text-right font-mono">{item.bonificacaoLiberacao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{item.bonificacaoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {dadosConsolidados && dadosConsolidados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dados Consolidados</CardTitle>
            <CardDescription>Visão detalhada de todos os registros processados.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/90">
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Processo</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead className="text-right">% Aplicado</TableHead>
                    <TableHead className="text-right">Bonificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosConsolidados.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{item.data}</TableCell>
                      <TableCell>{item.empresa}</TableCell>
                      <TableCell>
                        <Badge variant={item.processo === 'CINTAS' ? 'secondary' : 'outline'}>{item.processo}</Badge>
                      </TableCell>
                      <TableCell>{item.horarioFinal}</TableCell>
                      <TableCell className="text-right">{item.percentualAplicado * 100}%</TableCell>
                      <TableCell className="text-right font-mono">{item.valorBonificacao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function FaturistaPipelineView() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);
  const [fileTempos, setFileTempos] = React.useState<File | null>(null);
  const [metaCintas, setMetaCintas] = React.useState<number>(200);
  const [metaLib, setMetaLib] = React.useState<number>(200);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null);
  const { toast } = useToast();

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    const prefix = type === 'error' ? '❌ ' : type === 'success' ? '✅ ' : type === 'warn' ? '⚠️ ' : '';
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`]);
  };

  const canRun = !!fileTempos;

  const runPipeline = async (download = false) => {
    if (!canRun) return;
    setIsExecuting(true);
    setLastResult(null);
    setProgress(5);
    setLogs([]);
    addLog(`Iniciando Pipeline Faturista — ${String(month).padStart(2, '0')}/${year}`);
    addLog(`Metas: Cintas R$ ${metaCintas.toFixed(2)} | Liberação R$ ${metaLib.toFixed(2)}`);

    try {
      const formData = new FormData();
      formData.append('year', year.toString());
      formData.append('month', month.toString());
      formData.append('fileTempos', fileTempos!);
      formData.append('metaCintas', metaCintas.toString());
      formData.append('metaLib', metaLib.toString());

      setProgress(50);
      addLog('Enviando dados e processando no servidor...');
      const response = await executeFaturistaPipeline(formData);

      if (!response.success) {
        throw new Error(response.error || "Erro desconhecido no servidor");
      }

      setLastResult(response.result);
      setProgress(100);
      addLog(response.result.summary || "Processamento concluído com sucesso!", 'success');

      if (download) {
        addLog('Gerando planilha para download...', 'info');
        downloadMultipleSheets([
            { data: response.result.resumoMensal, name: 'Resumo_Mensal' },
            { data: response.result.dadosConsolidados, name: 'Dados_Consolidados' },
        ], `Faturista_Consolidado_${month}_${year}`);
      }

      toast({ title: 'Pipeline Concluído', description: response.result.summary || "Análise concluída." });

    } catch (error: any) {
      addLog(error.message, 'error');
      setProgress(0);
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">
      <Alert className="bg-primary/5 border-primary/20">
          <BadgePercent className="size-4 text-primary mt-1" />
          <AlertTitle className="ml-2">Pipeline Faturista — Cintas + Liberação</AlertTitle>
          <AlertDescription className="text-xs mt-1 ml-2">Análise de Tempos e Movimentos para bonificação baseada em horários.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Configuração da Análise</CardTitle>
              <CardDescription>Defina período, metas e arquivo de entrada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Ano</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} /></div>
                <div><Label>Mês</Label><Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} /></div>
              </div>
              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                      <Label className="flex items-center gap-2 mb-2"><Package className="size-4"/>Meta Cintas (R$)</Label>
                      <Input type="number" step="10" value={metaCintas} onChange={e => setMetaCintas(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                      <Label className="flex items-center gap-2 mb-2"><Truck className="size-4"/>Meta Liberação (R$)</Label>
                      <Input type="number" step="10" value={metaLib} onChange={e => setMetaLib(parseFloat(e.target.value) || 0)} />
                  </div>
              </div>

              <div className="pt-2">
                <Label className="font-medium">Arquivo de Tempos e Movimentos</Label>
                  <div className="flex items-center gap-2 p-2 mt-2 rounded-md border bg-background text-sm">
                    <FileSpreadsheet className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-medium truncate">{fileTempos?.name || "Selecionar arquivo..."}</span>
                    {fileTempos && <Button variant="ghost" size="icon" className="size-6" onClick={() => setFileTempos(null)}><Trash2 className="size-3.5 text-destructive" /></Button>}
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2 cursor-pointer">
                      <Label htmlFor="faturista-upload">{fileTempos ? 'Trocar' : 'Selecionar'}</Label>
                    </Button>
                    <Input id="faturista-upload" type="file" className="hidden" accept=".xlsx,.xls" onChange={e => { if (e.target.files?.[0]) setFileTempos(e.target.files[0]); e.target.value = '' }} />
                  </div>
              </div>
              {isExecuting && <Progress value={progress} className="h-2 mt-4" />}
            </CardContent>
            <CardFooter className="bg-muted/20 border-t p-4 flex gap-2">
                <Button className="flex-1 h-11 text-base" onClick={() => runPipeline(false)} disabled={!canRun || isExecuting}>
                    {isExecuting ? <><Loader2 className="mr-2 animate-spin"/> Processando...</> : <><Play className="mr-2"/> Executar Pipeline</>}
                </Button>
                <Button variant="outline" className="h-11" onClick={() => runPipeline(true)} disabled={!canRun || isExecuting}>
                    <Download className="mr-2 size-4"/> Baixar Excel
                </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full flex flex-col shadow-sm">
            <CardHeader className="p-3 border-b bg-muted/20">
              <CardTitle className="text-sm flex items-center gap-2"><FileCode className="size-4"/> Console</CardTitle>
            </CardHeader>
            <ScrollArea className="bg-slate-50 flex-1 p-3 font-mono text-[10px]">
              {logs.length === 0 ? <span className="text-muted-foreground italic">Aguardando execução...</span> : logs.map((log, i) => <div key={i}>{log}</div>)}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && <FaturistaResultViewer result={lastResult} />}
    </div>
  );
}
