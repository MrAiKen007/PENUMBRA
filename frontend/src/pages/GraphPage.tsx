import { GraphVisualization } from '@/components/graph/GraphVisualization'

export function GraphPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Rastreabilidade</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Visualização de grafos de transações e análise de clusters
        </p>
      </div>

      <div className="h-[600px]">
        <GraphVisualization />
      </div>
    </div>
  )
}
