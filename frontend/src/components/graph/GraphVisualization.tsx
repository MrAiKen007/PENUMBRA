import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { graphApi, walletApi } from '@/lib/api'
import { useStore } from '@/store/useStore'
import {
  getRiskColor,
  truncateAddress,
  formatBTC,
  truncateTxid,
} from '@/lib/utils'
import type { GraphNode, GraphEdge } from '@/types'
import { Search, Wallet, History, ChevronDown, ChevronUp } from 'lucide-react'

export function GraphVisualization() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { currentGraph, setCurrentGraph, currentWallet } = useStore()
  const [address, setAddress] = useState('')
  const [depth, setDepth] = useState(2)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [walletAddresses, setWalletAddresses] = useState<Array<{ address: string; label: string; txids: string[]; amount: number }>>([])
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [addressesError, setAddressesError] = useState<string | null>(null)

  const loadGraph = async (addr?: string) => {
    const targetAddress = addr || address
    if (!targetAddress) return
    setIsLoading(true)
    try {
      const data = await graphApi.getGraph(targetAddress, depth)
      setCurrentGraph(data)
    } catch (err) {
      console.error('Failed to load graph:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadWalletAddresses = async () => {
    console.log('loadWalletAddresses called, currentWallet:', currentWallet)
    if (!currentWallet) {
      setAddressesError('Nenhuma carteira conectada. Carregue uma carteira primeiro.')
      return
    }
    setIsLoadingAddresses(true)
    setAddressesError(null)
    try {
      console.log('Calling walletApi.getAddresses()...')
      const data = await walletApi.getAddresses()
      console.log('Received addresses:', data)
      setWalletAddresses(data.addresses)
      if (data.addresses.length > 0 && !address) {
        const firstAddress = data.addresses[0].address
        setSelectedWalletAddress(firstAddress)
        setAddress(firstAddress)
        loadGraph(firstAddress)
      }
    } catch (err: any) {
      console.error('Failed to load wallet addresses:', err)
      console.error('Error response:', err.response)
      setAddressesError(err.response?.data?.detail || err.message || 'Erro ao carregar endereços')
    } finally {
      setIsLoadingAddresses(false)
    }
  }

  useEffect(() => {
    loadWalletAddresses()
  }, [])

  useEffect(() => {
    if (currentWallet) {
      loadWalletAddresses()
    }
  }, [currentWallet])

  useEffect(() => {
    if (!currentGraph || !svgRef.current || !containerRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const container = containerRef.current
    const width = container.clientWidth
    const height = 500

    svg.attr('width', width).attr('height', height)

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    const g = svg.append('g')

    // Force simulation
    const simulation = d3
      .forceSimulation<GraphNode & d3.SimulationNodeDatum>(currentGraph.nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode & d3.SimulationNodeDatum, GraphEdge>(
            currentGraph.edges as any
          )
          .id((d: any) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))

    // Links
    const link = g
      .append('g')
      .attr('stroke', 'hsl(var(--graph-link))')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(currentGraph.edges)
      .join('line')
      .attr('stroke-width', (d) => Math.sqrt(d.value_sats / 1e8) + 1)
      .attr('stroke', (d) => (d.is_cioh ? 'hsl(var(--graph-link-cioh))' : 'hsl(var(--graph-link))'))
      .attr('class', 'graph-link')

    // Nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(currentGraph.nodes)
      .join('g')
      .attr('class', 'graph-node')
      .call(
        d3
          .drag<any, any>()
          .on('start', (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event: any, d: any) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as any
      )
      .on('click', (_, d) => {
        setSelectedNode(d)
      })

    // Node circles
    node
      .append('circle')
      .attr('r', (d) => {
        if (d.type === 'cluster') return 25
        if (d.type === 'entity') return 20
        return 15
      })
      .attr('fill', (d) => getRiskColor(d.risk))
      .attr('stroke', 'hsl(var(--graph-stroke))')
      .attr('stroke-width', 2)

    // Node icons
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('fill', 'hsl(var(--graph-stroke))')
      .text((d) => {
        if (d.type === 'address') return 'A'
        if (d.type === 'transaction') return 'T'
        if (d.type === 'cluster') return 'C'
        if (d.type === 'entity') return 'E'
        return '?'
      })

    // Node labels
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => {
        if (d.type === 'cluster') return 35
        if (d.type === 'entity') return 30
        return 25
      })
      .attr('font-size', '11px')
      .attr('fill', 'hsl(var(--graph-text))')
      .text((d) => {
        if (d.entity_name) return d.entity_name
        if (d.label) return truncateAddress(d.label, 4, 4)
        return truncateAddress(d.id, 4, 4)
      })

    // Update positions
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
    }
  }, [currentGraph])

  return (
    <Card
      title="Grafo de Rastreabilidade"
      subtitle="Visualização de endereços e transações"
      className="h-full"
    >
      <div className="space-y-4">
        {isLoadingAddresses && (
          <div className="p-3 bg-[#F5F5F5] rounded-xl border border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#FF5533] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-[#6B6B6B]">A carregar endereços...</span>
            </div>
          </div>
        )}

        {addressesError && !isLoadingAddresses && (
          <div className="p-3 bg-[#FEF2F2] rounded-xl border border-[#e02020]/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#e02020]" />
                <span className="text-sm text-[#e02020]">{addressesError}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={loadWalletAddresses}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {currentWallet && walletAddresses.length > 0 && !isLoadingAddresses && (
          <div className="p-3 bg-gradient-to-r from-[#FF5533]/10 to-[#FF016B]/10 rounded-xl border border-[#FF5533]/20">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-[#FF5533]" />
              <span className="text-sm font-medium text-[#0A0A0A]">Carteira: {currentWallet}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedWalletAddress || ''}
                onChange={(e) => {
                  const addr = e.target.value
                  setSelectedWalletAddress(addr)
                  setAddress(addr)
                  loadGraph(addr)
                }}
                className="flex-1 text-sm bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-[#0A0A0A] focus:border-[#FF5533]/50 focus:ring-2 focus:ring-[#FF5533]/20 outline-none"
              >
                <option value="">Selecionar endereço...</option>
                {walletAddresses.map((addr) => (
                  <option key={addr.address} value={addr.address}>
                    {truncateAddress(addr.address, 8, 8)} {addr.label ? `(${addr.label})` : ''} - {formatBTC(addr.amount)} BTC
                  </option>
                ))}
              </select>
            </div>
            {selectedWalletAddress && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 mt-2 text-xs text-[#FF5533] hover:text-[#FF016B] font-medium transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
                {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
            {showHistory && selectedWalletAddress && (
              <div className="mt-3 pt-3 border-t border-[#FF5533]/20">
                <p className="text-xs font-medium text-[#6B6B6B] mb-2">Transações:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {walletAddresses.find(a => a.address === selectedWalletAddress)?.txids.map((txid, idx) => (
                    <div key={txid} className="text-xs font-mono text-[#0A0A0A] bg-white/60 px-2 py-1 rounded">
                      {idx + 1}. {truncateTxid(txid)}
                    </div>
                  )) || <span className="text-xs text-[#9B9B9B]">Sem transações</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Endereço Bitcoin"
              placeholder="bc1q..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="w-24">
            <Input
              label="Profundidade"
              type="number"
              min={1}
              max={5}
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value))}
            />
          </div>
          <Button onClick={() => loadGraph()} isLoading={isLoading} className="h-9">
            <Search className="w-4 h-4 mr-2" />
            Analisar
          </Button>
        </div>

        <div ref={containerRef} className="relative">
          <svg ref={svgRef} className="w-full bg-gradient-to-br from-[#F8F8F8] to-[#FFFFFF] rounded-xl border border-[#E8E8E8] shadow-inner" style={{ minHeight: '500px' }} />

          {!currentGraph && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[#6B6B6B] font-medium">
                Introduza um endereço para visualizar o grafo
              </p>
            </div>
          )}
        </div>

        {currentGraph && (
          <div className="flex flex-wrap items-center gap-4 text-sm p-3 bg-[#FAFAFA] rounded-xl border border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#16a34a] ring-2 ring-[#16a34a]/20" />
              <span className="text-[#6B6B6B] font-medium">Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#d97706] ring-2 ring-[#d97706]/20" />
              <span className="text-[#6B6B6B] font-medium">Cuidado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#e02020] ring-2 ring-[#e02020]/20" />
              <span className="text-[#6B6B6B] font-medium">Alto Risco</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#7c3aed] ring-2 ring-[#7c3aed]/20" />
              <span className="text-[#6B6B6B] font-medium">Crítico</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-[#FF5533] rounded-full" />
              <span className="text-[#6B6B6B] font-medium">CIOH</span>
            </div>
          </div>
        )}

        {selectedNode && (
          <div className="p-4 bg-white rounded-xl border border-[#E8E8E8] shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E8E8E8] pb-3 mb-3">
              <h4 className="font-semibold text-[#0A0A0A] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5533]" />
                Detalhes do Nó
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedNode(null)}
                className="text-[#6B6B6B] hover:text-[#0A0A0A]"
              >
                Fechar
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6B6B6B]">Tipo:</span>
                <span className="font-medium text-[#0A0A0A] capitalize">{selectedNode.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B6B6B]">ID:</span>
                <span className="font-mono text-[#0A0A0A] text-xs">{selectedNode.id}</span>
              </div>
              {selectedNode.entity_name && (
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Entidade:</span>
                  <span className="font-medium text-[#0A0A0A]">{selectedNode.entity_name}</span>
                </div>
              )}
              {selectedNode.value_sats > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Valor:</span>
                  <span className="font-semibold text-[#FF5533]">{formatBTC(selectedNode.value_sats)} BTC</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-[#E8E8E8]">
                <span className="text-[#6B6B6B]">Risco:</span>
                <Badge
                  variant={
                    selectedNode.risk === 'safe'
                      ? 'safe'
                      : selectedNode.risk === 'caution'
                      ? 'warning'
                      : 'danger'
                  }
                >
                  {selectedNode.risk}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
