"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  Truck,
  Download,
  FileSpreadsheet,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AIParamAssistant } from "./ai-param-assistant"
import { executeRoadshowPipeline } from "@/app/actions/roadshow-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"

function RoadshowResultViewer({ result }: { result: PipelineResult }) {
  const { resumoMensal, resumoAritmetico, dadosConsolidados } = result;

  if (!resumoMensal && !dadosConsolidados) {
    return null;
  }

  return (
    <div className="space-y-6 mt-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {resumoMensal && resumoMensal.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Resumo Mensal por Região</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Região</TableHead>
                    <TableHead className="text-right">Incentivo Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumoMensal.map((item: any) => (
                    <TableRow key={item.regiao}>
                      <TableCell className="font-medium">{item.regiao}</TableCell>
                      <TableCell className="text-right font-mono">{item.incentivoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {resumoAritmetico && (
          <Card>
            <CardHeader>
              <CardTitle>Resumo Aritmético</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
                <div className="flex justify-between py-1.5 border-b"><span>Média Ocupação Jornada</span><Badge variant="secondary">{(resumoAritmetico.mediaOcupacaoJornada * 100).toFixed(2)}%</Badge></div>
                <div className="flex justify-between py-1.5 border-b"><span>Média Ocupação Veículo</span><Badge variant="secondary">{(resumoAritmetico.mediaOcupacaoVeiculo * 100).toFixed(2)}%</Badge></div>
                <div className="flex justify-between pt-2 text-base font-bold"><span>Total Incentivo</span><span className="text-green-600">{resumoAritmetico.totalIncentivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
            </CardContent>
          </Card>
        )}
      </div>

      {dadosConsolidados && dadosConsolidados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dados Consolidados</CardTitle>
            <CardDescription>Detalhes do cálculo de incentivo por rota.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/90">
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Região</TableHead>
                    <TableHead className="text-center">Ocup. Jornada</TableHead>
                    <TableHead className="text-center">Ocup. Veículo</TableHead>
                    <TableHead className="text-center">Indicador</TableHead>
                    <TableHead className="text-right">Incentivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosConsolidados.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{item.data}</TableCell>
                      <TableCell>{item.placa}</TableCell>
                      <TableCell>{item.regiao}</TableCell>
                      <TableCell className="text-center">{(item.ocupacaoJornada * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-center">{(item.ocupacaoVeiculo * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-center font-bold">{(item.indicadorFinal * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono">{item.incentivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
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

export function RoadshowPipelineView() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);
  const [fileConsolidado, setFileConsolidado] = React.useState<File | null>(null);
  const [filePedidos, setFilePedidos] = React.useState<File | null>(null);
  const [fileVeiculos, setFileVeiculos] = React.useState<File | null>(null);
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

  const canRun = !!fileConsolidado;

  const runPipeline = async (download = false) => {
    if (!canRun) return;
    setIsExecuting(true);
    setLastResult(null);
    setProgress(5);
    setLogs([]);
    addLog(`Iniciando Pipeline Roadshow — ${String(month).padStart(2, '0')}/${year}`);

    try {
      const formData = new FormData();
      formData.append('year', year.toString());
      formData.append('month', month.toString());
      if (fileConsolidado) formData.append('fileConsolidado', fileConsolidado);
      if (filePedidos) formData.append('filePedidos', filePedidos);
      if (fileVeiculos) formData.append('fileVeiculos', fileVeiculos);

      setProgress(50);
      addLog('Enviando dados para processamento no servidor...');
      const response = await executeRoadshowPipeline(formData);

      if (!response.success) {
        throw new Error(response.error || "Erro desconhecido no servidor");
      }

      setLastResult(response.result);
      setProgress(100);
      addLog(response.result.summary || "Processamento concluído com sucesso!", 'success');

      if (download) {
        addLog('Gerando planilha para download...', 'info');
        const sheets = [
          { data: response.result.resumoMensal, name: 'Resumo_Mensal' },
          { data: [response.result.resumoAritmetico], name: 'Resumo_Aritmetico' },
          { data: response.result.dadosConsolidados, name: 'Dados_Consolidados' },
        ];
        downloadMultipleSheets(sheets, `Roadshow_Consolidado_${month}_${year}`);
      }

      toast({ title: 'Pipeline Concluído', description: response.result.summary });

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
      <Alert className="bg-orange-50 border-orange-200">
        <MapPin className="size-4 text-orange-600 mt-1" />
        <AlertTitle className="ml-2 text-orange-900">Pipeline Roadshow — Ocupação e Incentivo</AlertTitle>
        <AlertDescription className="text-xs mt-1 ml-2">Análise de ocupação de jornada e veículo para cálculo de incentivo por região.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Configuração da Análise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Ano</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} /></div>
                <div><Label>Mês</Label><Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} /></div>
              </div>
              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />
              <div>
                <Label className="font-medium">Arquivos de Dados</Label>
                <div className="space-y-2 mt-2">
                  <FileInputRow id="rs-cons" label="Consolidado Entregas (Obrigatório)" file={fileConsolidado} setFile={setFileConsolidado} />
                  <FileInputRow id="rs-peds" label="Relatório Pedidos (Opcional)" file={filePedidos} setFile={setFilePedidos} />
                  <FileInputRow id="rs-veic" label="Cadastro Veículos (Opcional)" file={fileVeiculos} setFile={setFileVeiculos} />
                </div>
              </div>
              {isExecuting && <Progress value={progress} className="h-2" />}
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

      {lastResult && !isExecuting && <RoadshowResultViewer result={lastResult} />}
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