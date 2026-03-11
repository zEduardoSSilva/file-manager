"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  BarChart3,
  FileSpreadsheet,
  HelpCircle,
  TrendingUp,
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
import { executeCcoPipeline } from "@/app/actions/cco-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"

// Componente de visualização para os resultados do CCO
function CcoResultViewer({ result }: { result: PipelineResult }) {
  const { resumoMensal, resumoSimples } = result;

  if (!resumoMensal || resumoMensal.length === 0) {
    return null; // Não renderiza nada se não houver dados
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Tabela de Resumo Mensal */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo Mensal por Empresa</CardTitle>
          <CardDescription>{resumoMensal.length} empresas analisadas.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[450px] border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/90">
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-center">Total Dias</TableHead>
                  <TableHead className="text-center">Média Diária</TableHead>
                  <TableHead className="text-right">Bonificação Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumoMensal.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.empresa}</TableCell>
                    <TableCell className="text-center">{item.totalDias}</TableCell>
                    <TableCell className="text-center">{item.mediaDiaria.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{item.bonificacaoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tabela de Resumo Simples */}
      {resumoSimples && (
        <Card>
          <CardHeader>
            <CardTitle>Consolidado Geral</CardTitle>
            <CardDescription>Visão geral dos totais calculados.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Total Geral de Dias</TableCell>
                  <TableCell className="text-right font-mono">{resumoSimples.totalGeralDias}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Bonificação Total Geral</TableCell>
                  <TableCell className="text-right font-mono">{resumoSimples.bonificacaoTotalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


export function CcoPipelineView() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);
  const [fileMotoristas, setFileMotoristas] = React.useState<File | null>(null);
  const [fileAjudantes, setFileAjudantes] = React.useState<File | null>(null);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, setFile: (f: File | null) => void) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
    e.target.value = ''; // Permite selecionar o mesmo arquivo novamente
  }

  const canRun = !!(fileMotoristas && fileAjudantes);

  const runPipeline = async (download = false) => {
    if (!canRun) return;
    setIsExecuting(true);
    setLastResult(null);
    setProgress(10);
    setLogs([]);

    addLog(`Iniciando Consolidador CCO — ${String(month).padStart(2, '0')}/${year}`);
    addLog('Carregando Motoristas_Ajustado e Ajudantes_Ajustado...');

    try {
      const formData = new FormData();
      formData.append('year', year.toString());
      formData.append('month', month.toString());
      formData.append('fileMotoristas', fileMotoristas!);
      formData.append('fileAjudantes', fileAjudantes!);

      setProgress(50);
      addLog('Enviando dados e iniciando processamento no servidor...');

      const response = await executeCcoPipeline(formData);

      if (!response.success) throw new Error(response.error);

      setLastResult(response.result);
      addLog(response.result.summary || "Processamento concluído com sucesso!", 'success');
      setProgress(100);

      toast({
        title: 'CCO — Processado com sucesso',
        description: response.result.summary || `Análise concluída.`,
      });

      if (download) {
        addLog("Preparando arquivos para download...", 'info');
        downloadMultipleSheets([
          { data: response.result.resumoMensal || [], name: 'Resumo_Mensal' },
          { data: response.result.data || [], name: 'Dados_Consolidados' },
        ], `CCO_Consolidado_${month}_${year}`);
      }

    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error');
      setProgress(0);
      toast({ variant: 'destructive', title: 'Erro no Pipeline CCO', description: error.message });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidador CCO — Análise por Empresa</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Lógica idêntica ao Pipeline Coordenadores, mas com bonificação de R$ 16,00/dia. Domingos são removidos.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">Médias diárias (Motoristas + Ajudantes) por Empresa com bonificação de R$ 16,00/dia.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configuração</CardTitle>
              <CardDescription className="text-xs">Período e arquivos de entrada (Motoristas + Ajudantes Ajustados).</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">Ano</Label><Input type="number" value={year} className="h-9" onChange={e => setYear(parseInt(e.target.value))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Mês</Label><Input type="number" min={1} max={12} value={month} className="h-9" onChange={e => setMonth(parseInt(e.target.value))} /></div>
              </div>

              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />

              <div className="space-y-2">
                <Label className="font-semibold flex items-center gap-2"><FileSpreadsheet className="size-4"/>Arquivos de Entrada</Label>
                <FileInputRow id="motoristas" label="Motoristas_Ajustado.xlsx" file={fileMotoristas} setFile={setFileMotoristas} onFileChange={handleFileSelect} />
                <FileInputRow id="ajudantes" label="Ajudantes_Ajustado.xlsx" file={fileAjudantes} setFile={setFileAjudantes} onFileChange={handleFileSelect} />
              </div>

              {isExecuting && <Progress value={progress} className="h-2 mt-4" />}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 flex-col sm:flex-row gap-2">
                <Button className="w-full h-12 bg-primary text-white font-bold text-base shadow-md" onClick={() => runPipeline(false)} disabled={isExecuting || !canRun}>
                  {isExecuting ? <><Loader2 className="mr-2 animate-spin" />Processando...</> : <><Play className="mr-2 fill-current" />Executar Pipeline</>}
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => runPipeline(true)} disabled={isExecuting || !canRun}>
                  <Download className="mr-2 size-4"/> Baixar Excel
                </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full flex flex-col border bg-slate-50 overflow-hidden shadow-sm">
            <CardHeader className="p-3 border-b bg-muted/20 flex items-center gap-2">
              <FileCode className="size-3 text-muted-foreground" />
              <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Console</CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-4 font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? <p className="text-muted-foreground italic">Aguardando arquivos...</p> : logs.map((log, i) => <div key={i} className={`${log.includes('[ERRO]') ? 'text-destructive' : log.includes('[OK]') ? 'text-green-600' : 'text-slate-500'}`}>{log}</div>)}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && <CcoResultViewer result={lastResult} />}
    </div>
  )
}

// Componente auxiliar para a linha de input de arquivo
const FileInputRow = ({ id, label, file, setFile, onFileChange }: any) => (
  <div className="flex items-center gap-3 p-2 rounded-lg border bg-background">
    <div className="flex-1 min-w-0">
      <Label htmlFor={id} className="text-xs font-semibold truncate flex items-center gap-2">{label} {file && <Badge variant="secondary">{file.name}</Badge>}
      </Label>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      {file && <Button variant="ghost" size="icon" className="size-7" onClick={() => setFile(null)}><Trash2 className="size-3.5 text-destructive" /></Button>}
      <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2">
        <Label htmlFor={id}>{file ? 'Trocar' : 'Selecionar'}</Label>
      </Button>
      <Input id={id} type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => onFileChange(e, setFile)} />
    </div>
  </div>
);
