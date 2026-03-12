
"use client"

import * as React from "react"
import { Sparkles, Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { adjustPipelineParameters } from "@/ai/flows/ai-parameter-assistant-tool"
import { useToast } from "@/hooks/use-toast"

interface AIParamAssistantProps {
  onParamsUpdate: (month: number, year: number) => void;
  currentMonth: number;
  currentYear: number;
}

export function AIParamAssistant({ onParamsUpdate, currentMonth, currentYear }: AIParamAssistantProps) {
  const [prompt, setPrompt] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const { toast } = useToast()

  const handleAssistant = async () => {
    if (!prompt.trim()) return;
    
    setLoading(true)
    try {
      const result = await adjustPipelineParameters({
        naturalLanguagePrompt: prompt,
        currentMonth,
        currentYear
      });

      if (result) {
        onParamsUpdate(result.month, result.year);
        toast({
          title: "Parâmetros Atualizados",
          description: result.reasoning,
        });
        setPrompt("");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no Assistente",
        description: "Não foi possível interpretar o pedido.",
      });
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary animate-pulse" />
          <CardTitle className="text-base">Assistente de Parâmetros</CardTitle>
        </div>
        <CardDescription>
          Ajuste o período usando linguagem natural.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input 
            placeholder='Ex: "mude para janeiro de 2026"' 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAssistant()}
            className="bg-background border-primary/20"
            disabled={loading}
          />
          <Button onClick={handleAssistant} disabled={loading || !prompt.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
