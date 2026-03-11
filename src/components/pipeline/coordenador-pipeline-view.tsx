"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  Building2,
  Download,
  FileSpreadsheet,
  HelpCircle,
  AlertTriangle,
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
import { executeCoordenadorPipeline } from "@/app/actions/coordenador-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"

function CoordenadorResultViewer({ result }: { result: PipelineResult }) {
  const {
    resumo,
    dadosConsolidados,
    erros
  } = result;

  if (!resumo && !dadosConsolidados) {
    return null;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {erros && erros.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erros de Processamento ({erros.length})</AlertTitle>
          <AlertDescription>
            <ScrollArea className="h-24 mt-2">
              <ul className="list-disc pl-5 space-y-1">
                {erros.map((erro: any, index: number) => (
                  <li key={index} className="text-xs">{erro.erro} - {erro.detalhes}</li>
                ))}
              </ul>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      )}

      {resumo && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo da Bonificação</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coordenador</TableHead>
                  <TableHead className="text-right">Bonificação Total</TableHead>
                  <TableHead className="text-right">Total de Dias</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(resumo.bonificacaoPorCoordenador).map(([coordenador, valor]: [string, any]) => (
                  <TableRow key={coordenador}>
                    <TableCell className="font-medium">{coordenador}</TableCell>
                    <TableCell className="text-right font-mono">{valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    <TableCell className="text-right font-mono">{resumo.diasPorCoordenador[coordenador]}</TableCell>
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
            <CardDescription>Detalhes dia a dia por empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/90">
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Média Diária</TableHead>
                    <TableHead className="text-right">Bonificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosConsolidados.map((dado: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{dado.Data}</TableCell>
                      <TableCell className="font-medium">{dado.Empresa}</TableCell>
                      <TableCell className="text-right">{dado['Média Diária'].toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{dado.Bonificação.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
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

export function CoordenadorPipelineView() {
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
    const prefix = type === 'error' ? '❌ ' : type === 'success' ? '✅ ' : type === 'warn' ? '⚠️ ' : '';
    setLogs(prev => [...prev, `${prefix}[${ts}] ${msg}`]);
  };

  const canRun = !!(fileMotoristas && fileAjudantes);

  const runPipeline = async (download = false) => {
    if (!canRun) return;
    setIsExecuting(true);
    setLastResult(null);
    setProgress(5);
    setLogs([]);
    addLog(`Iniciando Pipeline Coordenadores — ${String(month).padStart(2, '0')}/${year}`);

    try {
      const formData = new FormData();
      formData.append('year', year.toString());
      formData.append('month', month.toString());
      formData.append('fileMotoristas', fileMotoristas!);
      formData.append('fileAjudantes', fileAjudantes!);

      setProgress(40);
      addLog('Enviando arquivos para o servidor...');
      const response = await executeCoordenadorPipeline(formData);
      setProgress(80);
      addLog('Servidor processou os dados. Analisando resposta...');

      if (!response.success) {
        throw new Error(response.error || "Ocorreu um erro desconhecido no servidor.");
      }

      setLastResult(response.result);
      addLog(response.result.summary || "Processamento concluído com sucesso!", 'success');
      setProgress(100);

      toast({ title: 'Pipeline Concluído', description: response.result.summary || "Análise concluída." });

      if (download) {
        addLog("Gerando arquivo Excel para download...", 'info');
        const sheets = [
          { data: response.result.dadosConsolidados, name: 'Consolidado' },
          { data: Object.entries(response.result.resumo.bonificacaoPorCoordenador).map(([k,v]) => ({ Coordenador: k, Bonificacao: v, Dias: response.result.resumo.diasPorCoordenador[k] })), name: 'Resumo' },
          { data: response.result.erros, name: 'Erros' }
        ];
        downloadMultipleSheets(sheets, `Coordenadores_Consolidado_${month}_${year}`);
      }

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
        <Building2 className="size-4 text-primary mt-1" />
        <AlertTitle className="ml-2">Pipeline Coordenadores — Gestão Modular</AlertTitle>
        <AlertDescription className="ml-2 text-xs mt-1">Análise de desempenho, ponto e tempo para bonificação de coordenadores.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Configuração da Análise</CardTitle>
              <CardDescription>Defina o período e os arquivos base para o processamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Ano</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Mês</Label><Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} /></div>
              </div>
              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />
              <div>
                <Label className="font-medium">Arquivos Base</Label>
                <div className="space-y-2 mt-2">
                  <FileInputRow id="cmot" label="Motoristas Ajustado" file={fileMotoristas} setFile={setFileMotoristas} />
                  <FileInputRow id="caju" label="Ajudantes Ajustado" file={fileAjudantes} setFile={setFileAjudantes} />
                </div>
              </div>
              {isExecuting && <Progress value={progress} className="h-2" />}
            </CardContent>
            <CardFooter className="bg-muted/20 border-t p-4 flex gap-2">
              <Button className="flex-1 h-11 text-base" onClick={() => runPipeline(false)} disabled={isExecuting || !canRun}>
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Processando...</> : <><Play className="mr-2" /> Executar</>}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => runPipeline(true)} disabled={isExecuting || !canRun}>
                <Download className="mr-2 size-4" /> Baixar Excel
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full flex flex-col shadow-sm">
            <CardHeader className="p-3 border-b bg-muted/20">
              <CardTitle className="text-sm flex items-center gap-2"><FileCode className="size-4" /> Console</CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 bg-slate-50 p-3 font-mono text-[10px]">
              {logs.length === 0 ? <p className="text-muted-foreground italic">Aguardando execução...</p> : logs.map((log, i) => <div key={i} className="whitespace-pre-wrap">{log}</div>)}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && <CoordenadorResultViewer result={lastResult} />}
    </div>
  );
}

const FileInputRow = ({ id, label, file, setFile }: { id: string, label: string, file: File | null, setFile: (f: File | null) => void }) => (
  <div className="flex items-center gap-2 p-2 rounded-md border bg-background text-sm">
    <FileSpreadsheet className="size-4 text-muted-foreground" />
    <span className="flex-1 font-medium truncate">{file?.name || label}</span>
    {file && <Button variant="ghost" size="icon" className="size-6" onClick={() => setFile(null)}><Trash2 className="size-3.5 text-destructive" /></Button>}
    <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2 cursor-pointer">
      <Label htmlFor={id}>{file ? 'Trocar' : 'Selecionar'}</Label>
    </Button>
    <Input id={id} type="file" className="hidden" accept=".xlsx,.xls" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = '' }} />
  </div>
);