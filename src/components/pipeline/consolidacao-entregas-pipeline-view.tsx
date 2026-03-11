"use client"

import * as React from "react"
import { Play, Trash2, FileCode, Loader2, FileSpreadsheet, HelpCircle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DatePicker } from "@/components/ui/date-picker"
import { executeConsolidacaoEntregasPipeline } from "@/app/actions/consolidacao-entregas-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"

const FILIAIS = [
  { id: "cambe",        label: "CONTROLE DE DISTRIBUIÇÃO - CAMBE.xlsx" },
  { id: "cascavel",     label: "CONTROLE DE DISTRIBUIÇÃO - CASCAVEL.xlsx" },
  { id: "curitiba",     label: "CONTROLE DE DISTRIBUIÇÃO - CURITIBA.xlsx" },
  { id: "campo-grande", label: "CONTROLE DE DISTRIBUIÇÃO - CAMPO GRANDE.xlsx" },
  { id: "dourados",     label: "CONTROLE DE DISTRIBUIÇÃO - DOURADOS.xlsx" },
];

export function ConsolidacaoEntregasPipelineView() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [files, setFiles] = React.useState<Record<string, File | null>>({});
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null);
  const { toast } = useToast();

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    const prefix = type === 'error' ? '❌ [ERRO] ' : type === 'success' ? '✅ [OK] ' : type === 'warn' ? '⚠️ [AVISO] ' : '';
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`]);
  };

  const canRun = date && FILIAIS.every(f => files[f.id]);

  const handleFileChange = (id: string, file: File | null) => {
    setFiles(prev => ({ ...prev, [id]: file }));
  };

  const runPipeline = async () => {
    if (!canRun) return;

    setIsExecuting(true);
    setProgress(5);
    setLogs([]);
    addLog('Iniciando Consolidação de Entregas...');

    try {
      const formData = new FormData();
      formData.append('date', date.toISOString());
      for (const filial of FILIAIS) {
        if (files[filial.id]) {
          formData.append(filial.id, files[filial.id]!);
        }
      }

      setProgress(20); addLog('Enviando arquivos para o servidor...');
      const response = await executeConsolidacaoEntregasPipeline(formData);

      if (!response.success) {
        throw new Error(response.error);
      }

      setProgress(100);
      setLastResult(response.result);
      addLog('Consolidação concluída com sucesso!', 'success');
      addLog(`Arquivo de resumo gerado: ${response.result.summary}`, 'success');
      
      toast({ title: 'Consolidação Concluída', description: response.result.summary });

    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error');
      setProgress(0);
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message });
    } finally {
      setIsExecuting(false);
    }
  };

  const downloadResult = () => {
    if (!lastResult || !lastResult.data) return;

    const sheets = Object.entries(lastResult.data).map(([name, data]) => ({ name, data }));
    const fileName = lastResult.summary || `Consolidado_Entregas_${new Date().toLocaleDateString('pt-BR')}`;

    downloadMultipleSheets(sheets, fileName);
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <FileCode className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidador de Entregas</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Consolida os arquivos de controle de entregas de cada filial, gerando um resumo diário em Excel com abas por filial e um acumulado.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">Processa os arquivos de distribuição, unificando os dados em um único relatório.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuração da Análise</CardTitle>
              <CardDescription>Selecione a data e os arquivos de controle de cada filial.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Data de Processamento</Label>
                <DatePicker date={date} setDate={setDate} />
              </div>

              <div className="space-y-2">
                <Label>Arquivos de Controle</Label>
                <div className="space-y-2 rounded-lg border p-2">
                  {FILIAIS.map(filial => (
                     <div key={filial.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
                      <FileSpreadsheet className="size-3.5 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold truncate">{filial.label}</span>
                        {files[filial.id] ? <span className="text-[11px] text-primary font-medium truncate block">{files[filial.id]?.name}</span>
                              : <span className="text-[11px] text-muted-foreground italic truncate block">Selecione o arquivo</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {files[filial.id] && <Button variant="ghost" size="icon" className="size-6" onClick={() => handleFileChange(filial.id, null)}><Trash2 className="size-3 text-destructive" /></Button>}
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => document.getElementById(filial.id)?.click()}>{files[filial.id] ? 'Trocar' : 'Selecionar'}</Button>
                      </div>
                      <input id={filial.id} type="file" className="hidden" accept=".xlsx,.xls" onChange={e => handleFileChange(filial.id, e.target.files?.[0] || null)} />
                    </div>
                  ))}
                </div>
              </div>
              {isExecuting && <Progress value={progress} className="h-2"/>}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t p-4">
              <Button className="w-full h-12 text-base" onClick={runPipeline} disabled={isExecuting || !canRun}>
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Processando...</> : <><Play className="mr-2"/> Iniciar Consolidação</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col shadow-sm">
              <CardHeader className="p-3 border-b bg-muted/20">
                  <CardTitle className="text-sm flex items-center gap-2"><FileCode className="size-4"/> Console</CardTitle>
              </CardHeader>
              <ScrollArea className="bg-slate-50 flex-1 p-3 font-mono text-[10px]">
                {logs.length === 0 ? <span className="text-muted-foreground italic">Aguardando execução...</span> : logs.map((log, i) => <div key={i}>{log}</div>)}
              </ScrollArea>
          </Card>
          {lastResult && (
            <Card>
              <CardHeader>
                <CardTitle>Resultado</CardTitle>
                <CardDescription>O arquivo consolidado está pronto para download.</CardDescription>
              </CardHeader>
              <CardContent>
                  <Button onClick={downloadResult} className="w-full">
                      <Download className="mr-2" />
                      Baixar {lastResult.summary}
                  </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
