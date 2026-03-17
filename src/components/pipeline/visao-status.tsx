'''"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ServerCrash } from "lucide-react"

export function VisaoStatusPage() {
  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Visão de Status
              </CardTitle>
              <CardDescription>Monitoramento do status dos pipelines e integrações.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           <div className="py-20 text-center">
              <ServerCrash className="size-8 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className='font-semibold text-lg'>Página em Construção</h3>
              <p className="text-sm text-muted-foreground">Esta visualização ainda está sendo desenvolvida.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  )
}
'''