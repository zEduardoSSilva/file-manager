
import { Skeleton } from "@/components/ui/skeleton"
import { PipelineLayout } from "@/components/pipeline/pipeline-layout"

export default function LoadingPipeline() {
  return (
    <PipelineLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
          <div>
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    </PipelineLayout>
  )
}
