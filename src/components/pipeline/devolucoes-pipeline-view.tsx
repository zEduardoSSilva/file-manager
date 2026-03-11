"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  Download,
  PackageX,
  FileSpreadsheet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeDevolucoesPipeline } from "@/app/actions/devolucoes-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function DevolucoesResultViewer({ result }: { result: PipelineResult }) {
  const { resumoPorRepresentante, resumoPorCliente } = result || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 animate-in fade-in duration-500">
      <Card>
        <CardHeader>
          <CardTitle>Resumo por Representante</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Representante</TableHead>
                  <TableHead className="text-right">Valor Devolvido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumoPorRepresentante?.map((item: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.representante}</TableCell>
                    <TableCell className="text-right font-mono">{item.totalDevolvido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo por Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor Devolvido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumoPorCliente?.map((item: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.cliente}</TableCell>
                    <TableCell className="text-right font-mono">{item.totalDevolvido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export function DevolucoesPipelineView() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);
  const [files, setFiles] = React.useState<File[]>([]);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null);
  const { toast } = useToast();

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString();
    const prefixes = { info: '', error: '❌ ', success: '✅ ', warn: '⚠️ ' };
    setLogs(prev => [...prev, `[${ts}] ${prefixes[type]}${msg}`]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        setFiles(Array.from(e.target.files));
    }
  }

  const canRun = files.length > 0;

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return;

    setIsExecuting(true);
    setLastResult(null);
    setProgress(5);
    setLogs([]);
    addLog('Iniciando Pipeline de Devoluções...');

    try {
      const formData = new FormData();
      formData.append('year', year.toString());
      formData.append('month', month.toString());
      files.forEach(file => formData.append('files', file));

      setProgress(50);
      addLog('Enviando arquivos e processando no servidor...');
      const response = await executeDevolucoesPipeline(formData);

      if (!response.success) {
        throw new Error(response.error || "Erro desconhecido no servidor.");
      }
      
      setLastResult(response.result);
      setProgress(100);
      addLog(response.result.summary || "Processamento concluído com sucesso!", 'success');

      if (downloadOnly) {
        addLog('Gerando planilhas para download...', 'info');
        downloadMultipleSheets([
          { data: response.result.resumoPorRepresentante, name: 'Resumo_Representante' },
          { data: response.result.resumoPorCliente, name: 'Resumo_Cliente' },
          { data: response.result.dadosCompletos, name: 'Dados_Completos' },
        ], `Devolucoes_Consolidado_${month}_${year}`);
      }

      toast({ title: 'Pipeline Concluído', description: response.result.summary || "Análise concluída." });

    } catch (error: any) {
      addLog(error.message, 'error');
      setProgress(0);
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message });
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-rose-50 border-rose-200">
        <PackageX className="size-4 text-rose-600 mt-1" />
        <AlertTitle className="ml-2 text-rose-900">Gestão de Devoluções</AlertTitle>
        <AlertDescription className="ml-2 text-xs mt-1">
          Análise de quebras e devoluções por colaborador com base nos arquivos de controle logístico e faturamento.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuração do Pipeline</CardTitle>
              <CardDescription>Selecione o período e os arquivos necessários para a análise.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Ano</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} /></div>
                <div><Label>Mês</Label><Input type="number" value={month} min={1} max={12} onChange={e => setMonth(parseInt(e.target.value))} /></div>
              </div>
              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y); }} currentMonth={month} currentYear={year} />
              <div>
                  <Label className="font-medium">Arquivos de Dados</Label>
                  <div className="mt-2 border rounded-lg p-2 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-md border bg-background text-sm">
                          <FileSpreadsheet className="size-4 text-muted-foreground"/>
                          <span className="flex-1 font-medium truncate">{files.length > 0 ? `${files.length} arquivos selecionados` : "Nenhum arquivo selecionado"}</span>
                          {files.length > 0 && <Button variant="ghost" size="icon" className="size-6" onClick={() => setFiles([])}><Trash2 className="size-3.5 text-destructive"/></Button>}
                          <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2 cursor-pointer">
                              <Label htmlFor="file-upload">Selecionar</Label>
                          </Button>
                          <Input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                      </div>
                  </div>
              </div>
              {isExecuting && <Progress value={progress} className="h-2"/>}
            </CardContent>
            <CardFooter className="bg-muted/20 border-t p-4 flex gap-2">
                <Button className="flex-1 h-11 text-base" onClick={() => runPipeline(false)} disabled={!canRun || isExecuting}>
                    {isExecuting ? <><Loader2 className="mr-2 animate-spin"/> Processando...</> : <><Play className="mr-2"/> Executar Análise</>}
                </Button>
                <Button variant="outline" className="h-11" onClick={() => runPipeline(true)} disabled={!canRun || isExecuting}>
                    <Download className="mr-2 size-4"/> Baixar Excel
                </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="h-full">
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

      {lastResult && !isExecuting && <DevolucoesResultViewer result={lastResult} />}
    </div>
  );
}
