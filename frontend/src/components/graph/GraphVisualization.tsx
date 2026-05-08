import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { graphApi, walletApi } from '@/lib/api'
import { useStore } from '@/store/useStore'
import { EntityClassifier } from './EntityClassifier'
import {
  getRiskColor,
  truncateAddress,
  formatBTC,
  truncateTxid,
} from '@/lib/utils'
import type { GraphNode, GraphEdge, ForensicReport, TransactionAnalysis, Entity } from '@/types'
import {
  Search,
  Wallet,
  History,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Network,
  AlertTriangle,
  Shield,
  Eye,
  Bitcoin,
  FileSearch,
  Users,
  Link2,
  Fingerprint,
  ArrowRightLeft,
  ExternalLink,
  Calendar,
  Building2,
  Tag
} from 'lucide-react'

export function GraphVisualization() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  
  const { currentGraph, setCurrentGraph, currentWallet } = useStore()
  const [address, setAddress] = useState('')
  const [depth, setDepth] = useState(2)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [, setHoveredNode] = useState<GraphNode | null>(null)
  const [walletAddresses, setWalletAddresses] = useState<Array<{ address: string; label: string; txids: string[]; amount: number }>>([])
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [addressesError, setAddressesError] = useState<string | null>(null)
  const [viewMode] = useState<'force' | 'hierarchical'>('force')
  const [highlightCIOH, setHighlightCIOH] = useState(true)
  const [useForensic, setUseForensic] = useState(true)
  const [forensicData, setForensicData] = useState<ForensicReport | null>(null)
  const [selectedTx, setSelectedTx] = useState<TransactionAnalysis | null>(null)
  const [showForensicPanel, setShowForensicPanel] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [showEntityClassifier, setShowEntityClassifier] = useState(false)
  const [entityToClassify, setEntityToClassify] = useState<string | undefined>(undefined)

  const loadGraph = async (addr?: string) => {
    const targetAddress = addr || address
    if (!targetAddress || targetAddress === 'unknown' || targetAddress === '') {
      console.log('[Graph] Invalid or empty address, skipping:', targetAddress)
      return
    }
    
    // Basic validation - Bitcoin addresses start with specific prefixes
    const validPrefixes = ['bc1', 'bcrt', 'tb', 'm', 'n', '1', '2', '3']
    const isValidAddress = validPrefixes.some(prefix => targetAddress.toLowerCase().startsWith(prefix))
    if (!isValidAddress) {
      console.log('[Graph] Address format invalid, skipping:', targetAddress)
      return
    }
    setIsLoading(true)
    setGraphError(null)
    setForensicData(null)
    
    try {
      // Primeiro carrega o grafo básico (rápido)
      console.log('[Graph] Loading basic graph for:', targetAddress, 'wallet:', currentWallet)
      const basicData = await graphApi.getGraph(targetAddress, depth, 100, currentWallet || undefined)
      console.log('[Graph] Basic data received:', basicData)
      console.log('[Graph] Nodes count:', basicData?.nodes?.length)
      console.log('[Graph] Edges count:', basicData?.edges?.length)
      
      if (basicData && basicData.nodes && basicData.edges) {
        console.log('[Graph] Setting graph with', basicData.nodes.length, 'nodes and', basicData.edges.length, 'edges')
        setCurrentGraph(basicData)
        setIsLoading(false) // Libera a UI imediatamente
        setGraphError(null)
        
        // Depois carrega análise forense em background (se ativado)
        if (useForensic) {
          console.log('[Graph] Loading forensic analysis in background...')
          try {
            const forensicReport = await graphApi.getForensicAnalysis(targetAddress, 30, currentWallet || undefined)
            console.log('[Graph] Forensic analysis loaded:', forensicReport)
            setForensicData(forensicReport)
          } catch (forensicErr: any) {
            console.warn('[Graph] Forensic analysis failed:', forensicErr)
            // Não mostra erro - a análise forense é opcional
          }
        }
      } else {
        throw new Error('Invalid graph data structure')
      }
    } catch (err: any) {
      console.error('[Graph] Failed to load graph:', err)
      setGraphError(`Failed to load graph: ${err.message || 'Backend error'}. Please check if the API is running.`)
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
      
      // Filter out invalid addresses
      const validAddresses = data.addresses.filter((a: any) => 
        a.address && 
        a.address !== 'unknown' && 
        a.address.length >= 20
      )
      
      // Filter only addresses with transactions
      const addressesWithTxs = validAddresses.filter((a: any) => a.txids && a.txids.length > 0)
      console.log('[Graph] All addresses:', validAddresses)
      console.log('[Graph] Addresses with transactions:', addressesWithTxs)
      
      setWalletAddresses(validAddresses)
      
      // Select first address with transactions
      if (addressesWithTxs.length > 0 && !address) {
        const firstAddressWithTxs = addressesWithTxs[0].address
        console.log('[Graph] Auto-selecting address with transactions:', firstAddressWithTxs)
        setSelectedWalletAddress(firstAddressWithTxs)
        setAddress(firstAddressWithTxs)
        loadGraph(firstAddressWithTxs)
      } else if (data.addresses.length > 0 && !address) {
        // No addresses with transactions, just select first but show warning
        const firstAddress = data.addresses[0].address
        setSelectedWalletAddress(firstAddress)
        setAddress(firstAddress)
        // Don't auto-load graph if no transactions
        setAddressesError('Endereço selecionado não tem transações. Selecione outro endereço.')
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

  const resetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current)
      svg.transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity)
    }
  }, [])

  const centerOnNode = useCallback((nodeId: string) => {
    if (!svgRef.current || !currentGraph) return
    
    const node = currentGraph.nodes.find(n => n.id === nodeId)
    if (!node || !('x' in node) || !('y' in node)) return
    
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    if (!container) return
    
    const width = container.clientWidth
    const height = 500
    
    const x = (node as any).x || 0
    const y = (node as any).y || 0
    
    svg.transition().duration(750).call(
      zoomRef.current!.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(1.5).translate(-x, -y)
    )
  }, [currentGraph])

  // Refs para armazenar dados de relacionamento para highlight
  const nodeConnectionsRef = useRef<Map<string, Set<string>>>(new Map())
  const edgeElementsRef = useRef<d3.Selection<any, any, any, any> | null>(null)
  const nodeElementsRef = useRef<d3.Selection<any, any, any, any> | null>(null)

  useEffect(() => {
    console.log('[D3] useEffect triggered. currentGraph:', currentGraph)
    
    if (!currentGraph) {
      console.log('[D3] No currentGraph, returning')
      return
    }
    if (!svgRef.current) {
      console.log('[D3] No svgRef, returning')
      return
    }
    if (!containerRef.current) {
      console.log('[D3] No containerRef, returning')
      return
    }
    
    console.log('[D3] Rendering graph with', currentGraph.nodes.length, 'nodes and', currentGraph.edges.length, 'edges')

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const container = containerRef.current
    const width = container.clientWidth
    const height = 600

    svg.attr('width', width).attr('height', height)
    
    // === GRAFO INTERLIGADO OBSIDIAN-STYLE ===
    // Criar arestas diretas entre endereços relacionados (além das transações)
    const obsidianAddressNodes = currentGraph.nodes.filter(n => n.type === 'address' || n.type === 'entity')
    const txNodes = currentGraph.nodes.filter(n => n.type === 'transaction')
    
    // Mapa de endereço -> transações
    const addressToTxs = new Map<string, Set<string>>()
    
    // Processar arestas existentes para construir relacionamentos
    currentGraph.edges.forEach(edge => {
      const source = typeof edge.source === 'string' ? edge.source : (edge.source as any).id
      const target = typeof edge.target === 'string' ? edge.target : (edge.target as any).id
      
      if (!source.startsWith('tx:') && target.startsWith('tx:')) {
        // Endereço -> Transação
        if (!addressToTxs.has(source)) addressToTxs.set(source, new Set())
        addressToTxs.get(source)!.add(target)
      } else if (source.startsWith('tx:') && !target.startsWith('tx:')) {
        // Transação -> Endereço
        if (!addressToTxs.has(target)) addressToTxs.set(target, new Set())
        addressToTxs.get(target)!.add(source)
      }
    })
    
    // Criar arestas diretas entre endereços que compartilham múltiplas transações
    const directAddressEdges: GraphEdge[] = []
    const addressList = obsidianAddressNodes.map(n => n.id)
    
    for (let i = 0; i < addressList.length; i++) {
      for (let j = i + 1; j < addressList.length; j++) {
        const addr1 = addressList[i]
        const addr2 = addressList[j]
        
        const txs1 = addressToTxs.get(addr1) || new Set()
        const txs2 = addressToTxs.get(addr2) || new Set()
        
        // Encontrar transações em comum
        const commonTxs = new Set([...txs1].filter(x => txs2.has(x)))
        
        if (commonTxs.size >= 2) {
          // Aresta direta! Quanto mais transações em comum, mais forte a ligação
          const strength = Math.min(commonTxs.size / 5, 1) // Max 1.0
          
          directAddressEdges.push({
            source: addr1,
            target: addr2,
            value_sats: strength * 1e8, // Usar como proxy de força
            txid: `direct:${addr1.slice(0,8)}_${addr2.slice(0,8)}`,
            is_cioh: false,
            label: `${commonTxs.size} txs`,
            confidence: strength,
            relationship_type: 'obsidian_link',
          } as GraphEdge)
        }
      }
    }
    
    console.log(`[D3] Created ${directAddressEdges.length} direct address-to-address edges`)
    
    // Combinar arestas originais com as diretas
    const allEdges = [...currentGraph.edges, ...directAddressEdges]
    
    // Mapa de conexões para highlight
    const connections = new Map<string, Set<string>>()
    allEdges.forEach(edge => {
      const source = typeof edge.source === 'string' ? edge.source : (edge.source as any).id
      const target = typeof edge.target === 'string' ? edge.target : (edge.target as any).id
      
      if (!connections.has(source)) connections.set(source, new Set())
      if (!connections.has(target)) connections.set(target, new Set())
      connections.get(source)!.add(target)
      connections.get(target)!.add(source)
    })
    nodeConnectionsRef.current = connections
    
    if (currentGraph.nodes.length === 0) {
      console.log('[D3] No nodes to render')
      // Show message in SVG
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('fill', '#6B7280')
        .text('Nenhum dado encontrado para este endereço')
      return
    }
    
    // Check if we only have the watched address (single node)
    const addressNodes = currentGraph.nodes.filter(n => n.type === 'address')
    const hasRelationships = currentGraph.edges.some(e => 
      !e.source.startsWith('tx:') && !e.target.startsWith('tx:')
    )
    
    console.log('[D3] Address nodes:', addressNodes.length)
    console.log('[D3] Has relationships:', hasRelationships)
    
    if (addressNodes.length === 1 && !hasRelationships) {
      // Show warning about no relationships
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 50)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('fill', '#F59E0B')
        .text('⚠️ Nenhuma transação encontrada - verifique se a carteira está carregada')
    }

    // Define gradients and filters
    const defs = svg.append('defs')
    
    // Glow filter for CIOH edges
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
    
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '2')
      .attr('result', 'coloredBlur')
    
    const feMerge = filter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Gradient for nodes
    const nodeGradient = defs.append('linearGradient')
      .attr('id', 'nodeGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%')
    
    nodeGradient.append('stop').attr('offset', '0%').attr('stop-color', '#FF5533')
    nodeGradient.append('stop').attr('offset', '100%').attr('stop-color', '#FF016B')

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    zoomRef.current = zoom
    svg.call(zoom)

    const g = svg.append('g')
    gRef.current = g

    // === FÍSICA ORGÂNICA ESTILO OBSIDIAN ===
    // Simulação com forças mais naturais e interligadas
    
    const simulation = d3
      .forceSimulation<GraphNode & d3.SimulationNodeDatum>(currentGraph.nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode & d3.SimulationNodeDatum, GraphEdge>(
            allEdges as any
          )
          .id((d: any) => d.id)
          .distance((d: any) => {
            // Arestas Obsidian têm distância menor (nós mais próximos)
            if (d.relationship_type === 'obsidian_link') {
              return 60 + (1 - (d.confidence || 0.5)) * 40
            }
            // Arestas de transação - distância média
            if (d.source.startsWith('tx:') || d.target.startsWith('tx:')) {
              return 80
            }
            // Outras arestas diretas
            return 100
          })
          .strength((d: any) => {
            // Arestas Obsidian são mais "fortes" (atraem mais)
            if (d.relationship_type === 'obsidian_link') {
              return 0.8 * (d.confidence || 0.5)
            }
            return 0.3
          })
      )
      // Força de repulsão mais suave
      .force('charge', d3.forceManyBody()
        .strength((d: any) => {
          // Endereços têm repulsão menor (queremos clusters)
          if (d.type === 'address' || d.type === 'entity') return -150
          if (d.type === 'transaction') return -80
          return -200
        })
        .distanceMax(400)
      )
      // Centro suave
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.02))
      // Colisão suave para não sobrepor demais
      .force('collision', d3.forceCollide()
        .radius((d: any) => {
          if (d.type === 'cluster') return 35
          if (d.type === 'entity') return 30
          if (d.type === 'transaction') return 22
          return 25
        })
        .strength(0.4)
      )
      // Força de clustering para endereços relacionados
      .force('cluster', (alpha: number) => {
        // Força artificial que atrai endereços com arestas Obsidian
        obsidianEdges.forEach(edge => {
          const sourceNode = currentGraph.nodes.find(n => n.id === edge.source)
          const targetNode = currentGraph.nodes.find(n => n.id === edge.target)
          if (sourceNode && targetNode && (sourceNode as any).x && (targetNode as any).x) {
            const dx = (targetNode as any).x - (sourceNode as any).x
            const dy = (targetNode as any).y - (sourceNode as any).y
            const strength = (edge.confidence || 0.5) * alpha * 0.5
            ;(sourceNode as any).vx += dx * strength * 0.01
            ;(sourceNode as any).vy += dy * strength * 0.01
            ;(targetNode as any).vx -= dx * strength * 0.01
            ;(targetNode as any).vy -= dy * strength * 0.01
          }
        })
      })
      // Força X/Y suave para manter no canvas
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))

    // Links group
    const linkGroup = g.append('g').attr('class', 'links')
    
    // Separar tipos de arestas
    const obsidianEdges = allEdges.filter(e => (e as any).relationship_type === 'obsidian_link')
    const addressEdges = allEdges.filter(e => 
      !e.source.startsWith('tx:') && !e.target.startsWith('tx:') && (e as any).relationship_type !== 'obsidian_link'
    )
    const txEdges = allEdges.filter(e => 
      e.source.startsWith('tx:') || e.target.startsWith('tx:')
    )
    
    console.log('[D3] Obsidian direct edges:', obsidianEdges.length)
    console.log('[D3] Address-to-address edges:', addressEdges.length)
    console.log('[D3] Transaction edges:', txEdges.length)

    // Links - com classes CSS para highlight
    const link = linkGroup
      .selectAll('line.edge')
      .data(allEdges)
      .join('line')
      .attr('class', d => {
        const source = typeof d.source === 'string' ? d.source : (d.source as any).id
        const target = typeof d.target === 'string' ? d.target : (d.target as any).id
        const isObsidian = (d as any).relationship_type === 'obsidian_link'
        return `edge edge-${source.replace(/[^a-zA-Z0-9]/g, '_')} edge-${target.replace(/[^a-zA-Z0-9]/g, '_')} ${isObsidian ? 'obsidian-link' : ''}`
      })
      .attr('id', d => {
        const source = typeof d.source === 'string' ? d.source : (d.source as any).id
        const target = typeof d.target === 'string' ? d.target : (d.target as any).id
        return `edge-${source.replace(/[^a-zA-Z0-9]/g, '_')}-${target.replace(/[^a-zA-Z0-9]/g, '_')}`
      })
      .attr('stroke-width', (d) => {
        // Arestas Obsidian (diretas) - mais finas e elegantes
        if ((d as any).relationship_type === 'obsidian_link') {
          return 1 + ((d.confidence || 0.5) * 2)
        }
        // Outras arestas
        if (!d.source.startsWith('tx:') && !d.target.startsWith('tx:')) {
          return Math.max(2, (d.confidence || 0.5) * 4)
        }
        return Math.max(0.5, Math.sqrt(d.value_sats / 1e8) * 0.5)
      })
      .attr('stroke', (d) => {
        // Arestas Obsidian - cor roxa/azul suave
        if ((d as any).relationship_type === 'obsidian_link') {
          return '#8B5CF6' // Violeta suave
        }
        // Address-to-address relationships
        if (!d.source.startsWith('tx:') && !d.target.startsWith('tx:')) {
          if (d.is_cioh) return '#FF5533'
          if (d.relationship_type === 'cluster') return '#6366F1'
          return '#10B981'
        }
        // Transaction edges
        if (d.is_cioh && highlightCIOH) return '#FF5533'
        return '#9CA3AF'
      })
      .attr('stroke-opacity', (d) => {
        if ((d as any).relationship_type === 'obsidian_link') {
          return 0.4 // Mais sutis
        }
        if (!d.source.startsWith('tx:') && !d.target.startsWith('tx:')) {
          return 0.9
        }
        return d.is_cioh && highlightCIOH ? 0.8 : 0.2
      })
      .attr('filter', (d) => d.is_cioh ? 'url(#glow)' : null)
      .attr('stroke-dasharray', (d) => {
        if ((d as any).relationship_type === 'obsidian_link') {
          return null // Linhas sólidas para Obsidian
        }
        if (d.is_cioh) return '5,5'
        if (!d.source.startsWith('tx:') && !d.target.startsWith('tx:')) return null
        return '2,2'
      })
      .style('cursor', 'pointer')
    
    // Guardar referência para highlight
    edgeElementsRef.current = link

    // Nodes group
    const nodeGroup = g.append('g').attr('class', 'nodes')
    
    // Nodes - com highlight de conexões estilo Obsidian
    const node = nodeGroup
      .selectAll('g')
      .data(currentGraph.nodes)
      .join('g')
      .attr('class', d => `graph-node node-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
      .style('cursor', 'pointer')
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
        centerOnNode(d.id)
      })
      .on('mouseover', function(event, d) {
        setHoveredNode(d)
        
        // === HIGHLIGHT ESTILO OBSIDIAN ===
        const nodeId = d.id.replace(/[^a-zA-Z0-9]/g, '_')
        const connectedNodes = connections.get(d.id) || new Set()
        
        // Diminuir opacidade de todos os nós e arestas
        d3.selectAll('.graph-node').style('opacity', 0.2)
        d3.selectAll('.edge').attr('stroke-opacity', 0.05)
        
        // Destacar o nó atual
        d3.select(this).style('opacity', 1)
        d3.select(this).select('circle').attr('stroke-width', 4)
          .style('filter', 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.6))')
        
        // Destacar nós conectados
        connectedNodes.forEach(connectedId => {
          const safeId = connectedId.replace(/[^a-zA-Z0-9]/g, '_')
          d3.select(`.node-${safeId}`).style('opacity', 1)
        })
        
        // Destacar arestas conectadas
        d3.selectAll(`.edge-${nodeId}`)
          .attr('stroke-opacity', 1)
          .attr('stroke-width', (d: any) => {
            const baseWidth = (d.relationship_type === 'obsidian_link')
              ? 1 + ((d.confidence || 0.5) * 2)
              : Math.max(0.5, Math.sqrt(d.value_sats / 1e8) * 0.5)
            return baseWidth * 2 // Aumentar em hover
          })
      })
      .on('mouseout', function(_, d) {
        setHoveredNode(null)
        
        // Restaurar opacidades normais
        d3.selectAll('.graph-node').style('opacity', 1)
        d3.selectAll('.edge')
          .attr('stroke-opacity', (d: any) => {
            if (d.relationship_type === 'obsidian_link') return 0.4
            if (!d.source.startsWith('tx:') && !d.target.startsWith('tx:')) return 0.9
            return d.is_cioh && highlightCIOH ? 0.8 : 0.2
          })
          .attr('stroke-width', (d: any) => {
            if (d.relationship_type === 'obsidian_link') {
              return 1 + ((d.confidence || 0.5) * 2)
            }
            if (!d.source.startsWith('tx:') && !d.target.startsWith('tx:')) {
              return Math.max(2, (d.confidence || 0.5) * 4)
            }
            return Math.max(0.5, Math.sqrt(d.value_sats / 1e8) * 0.5)
          })
        
        d3.select(this).select('circle').attr('stroke-width', d => d.is_watched ? 3 : 2)
          .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))')
      })
    
    // Guardar referência
    nodeElementsRef.current = node

    // Node circles with better styling
    node
      .append('circle')
      .attr('r', (d) => {
        if (d.type === 'cluster') return 30
        if (d.type === 'entity') return 25
        if (d.type === 'transaction') return 18
        return 20
      })
      .attr('fill', (d) => {
        const baseColor = getRiskColor(d.risk)
        return baseColor
      })
      .attr('stroke', (d) => {
        if (d.is_watched) return '#FF5533'
        return '#FFFFFF'
      })
      .attr('stroke-width', (d) => d.is_watched ? 3 : 2)
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))')
      .transition()
      .duration(300)
      .attr('r', (d) => {
        if (d.type === 'cluster') return 30
        if (d.type === 'entity') return 25
        if (d.type === 'transaction') return 18
        return 20
      })

    // Node icons with better symbols
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', (d) => {
        if (d.type === 'cluster') return '14px'
        if (d.type === 'entity') return '12px'
        return '10px'
      })
      .attr('fill', '#FFFFFF')
      .attr('font-weight', 'bold')
      .text((d) => {
        if (d.type === 'address') return '₿'
        if (d.type === 'transaction') return 'T'
        if (d.type === 'cluster') return '⚡'
        if (d.type === 'entity') return '🏢'
        return '?'
      })

    // Node labels with better visibility
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => {
        if (d.type === 'cluster') return 42
        if (d.type === 'entity') return 35
        return 30
      })
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', '#374151')
      .style('text-shadow', '0 1px 2px rgba(255,255,255,0.8)')
      .text((d) => {
        if (d.entity_name) return d.entity_name.length > 15 ? d.entity_name.slice(0, 15) + '...' : d.entity_name
        if (d.label && d.label !== d.id) return d.label.length > 12 ? d.label.slice(0, 12) + '...' : d.label
        return truncateAddress(d.id, 6, 4)
      })
    
    // Value labels for high-value nodes
    node
      .filter(d => d.value_sats > 1e8) // > 1 BTC
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => {
        if (d.type === 'cluster') return 55
        if (d.type === 'entity') return 48
        return 42
      })
      .attr('font-size', '9px')
      .attr('fill', '#FF5533')
      .attr('font-weight', '600')
      .text(d => formatBTC(d.value_sats) + ' BTC')

    // Edge labels for value
    const edgeLabels = linkGroup
      .selectAll('text')
      .data(currentGraph.edges.filter(e => e.value_sats > 1e7)) // Only for > 0.1 BTC
      .join('text')
      .attr('font-size', '9px')
      .attr('fill', '#6B7280')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .style('pointer-events', 'none')
      .text(d => formatBTC(d.value_sats))
    
    // Update positions
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      
      edgeLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
    }
  }, [currentGraph, viewMode, highlightCIOH, centerOnNode])

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
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => loadGraph()} 
              isLoading={isLoading} 
              className="h-9"
            >
              <Search className="w-4 h-4 mr-2" />
              Analisar
            </Button>
            <button
              onClick={() => setUseForensic(!useForensic)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                useForensic 
                  ? 'bg-orange-100 text-orange-700 border border-orange-200' 
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
              title={useForensic ? 'Análise forense ativada' : 'Análise forense desativada'}
            >
              <Fingerprint className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={containerRef} className="relative">
          <svg 
            ref={svgRef} 
            className="w-full bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 shadow-inner" 
            style={{ minHeight: '600px', height: '600px' }} 
          />

          {!currentGraph && !isLoading && !graphError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Network className="w-10 h-10 text-white" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-slate-700 font-semibold text-lg">
                  Grafo de Rastreabilidade
                </p>
                <p className="text-slate-500 text-sm max-w-xs">
                  Visualize conexões entre endereços, transações e entidades. Identifique riscos e padrões de movimentação.
                </p>
              </div>
              {currentWallet && walletAddresses.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 px-4 py-2 rounded-full">
                  <Wallet className="w-4 h-4" />
                  <span>Selecione um endereço da carteira acima</span>
                </div>
              )}
            </div>
          )}
          
          {/* Error State */}
          {graphError && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 p-8">
              <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <div className="text-center space-y-2 max-w-md">
                <p className="text-red-700 font-semibold text-lg">
                  Erro ao carregar grafo
                </p>
                <p className="text-red-600 text-sm">
                  {graphError}
                </p>
                <Button 
                  onClick={() => loadGraph()} 
                  variant="outline" 
                  size="sm"
                  className="mt-4"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}
          
          {/* Loading State */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-slate-600 text-sm font-medium">
                Analisando endereço e construindo grafo...
              </p>
              {useForensic && (
                <p className="text-slate-500 text-xs">
                  Modo forense ativado (pode demorar mais)
                </p>
              )}
            </div>
          )}
          
          {currentGraph && (
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-lg p-2 flex flex-col gap-2">
                <button
                  onClick={resetZoom}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                  title="Resetar zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (svgRef.current && zoomRef.current) {
                      const svg = d3.select(svgRef.current)
                      svg.transition().call(zoomRef.current.scaleBy, 1.3)
                    }
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (svgRef.current && zoomRef.current) {
                      const svg = d3.select(svgRef.current)
                      svg.transition().call(zoomRef.current.scaleBy, 0.7)
                    }
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
              
              <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-lg p-2">
                <button
                  onClick={() => setHighlightCIOH(!highlightCIOH)}
                  className={`p-2 rounded-lg transition-colors ${highlightCIOH ? 'bg-orange-100 text-orange-600' : 'hover:bg-slate-100 text-slate-600'}`}
                  title="Destacar CIOH"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {currentGraph && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-sm p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                <span className="text-slate-600 font-medium">Seguro</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
                <span className="text-slate-600 font-medium">Cuidado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500 ring-2 ring-rose-500/20" />
                <span className="text-slate-600 font-medium">Alto Risco</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-violet-600 ring-2 ring-violet-600/20" />
                <span className="text-slate-600 font-medium">Crítico</span>
              </div>
              <div className="h-4 w-px bg-slate-300 mx-2" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-orange-500 rounded-full" />
                <span className="text-slate-600 font-medium">CIOH Detectado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-violet-500 rounded-full opacity-60" />
                <span className="text-slate-600 font-medium">Ligação Direta (Obsidian)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gradient-to-br from-orange-500 to-pink-500" />
                <span className="text-slate-600 font-medium">Endereço Rastreado</span>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="flex items-center gap-2 text-xs text-slate-500 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <ArrowRightLeft className="w-4 h-4 text-blue-500" />
              <span>
                <strong>Dica:</strong> Clique em qualquer nó (bolinha) para ver as especificações do endereço e todos os endereços conectados/carteiras relacionadas.
              </span>
            </div>
          </div>
        )}

        {/* Forensic Analysis Panel */}
        {forensicData && showForensicPanel && (
          <div className="mt-4 p-4 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-orange-500" />
                Análise Forense
              </h4>
              <div className="flex items-center gap-2">
                <Badge variant={forensicData.privacy_score === 'high' ? 'safe' : forensicData.privacy_score === 'medium' ? 'warning' : 'danger'}>
                  Privacidade: {forensicData.privacy_score}
                </Badge>
                <button 
                  onClick={() => setShowForensicPanel(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-white rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Transações</p>
                <p className="text-lg font-semibold text-slate-900">{forensicData.total_transactions}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Volume</p>
                <p className="text-lg font-semibold text-orange-600">{formatBTC(forensicData.total_volume_sats)} BTC</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Clusters</p>
                <p className="text-lg font-semibold text-blue-600">{forensicData.clusters.length}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Entidades</p>
                <p className="text-lg font-semibold text-violet-600">{forensicData.entity_clusters.length}</p>
              </div>
            </div>
            
            {/* Clusters Section */}
            {forensicData.clusters.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4" />
                  Clusters Detectados (CIOH)
                </h5>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {forensicData.clusters.slice(0, 5).map((cluster) => (
                    <div key={cluster.cluster_id} className="p-2 bg-white rounded-lg border border-slate-100 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">{cluster.cluster_id}</span>
                        <Badge variant="warning" className="text-xs">{cluster.confidence.toFixed(0)}% confiança</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{cluster.addresses.length} endereços</p>
                      <p className="text-xs text-slate-400">{cluster.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Transactions List */}
            {forensicData.transactions_analyzed.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
                  <Link2 className="w-4 h-4" />
                  Transações Analisadas
                </h5>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {forensicData.transactions_analyzed.slice(0, 10).map((tx) => (
                    <div 
                      key={tx.txid} 
                      className="p-2 bg-white rounded-lg border border-slate-100 text-sm cursor-pointer hover:border-orange-300 transition-colors"
                      onClick={() => setSelectedTx(selectedTx?.txid === tx.txid ? null : tx)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-600">{truncateTxid(tx.txid)}</span>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={tx.tx_type === 'coinjoin' ? 'safe' : tx.tx_type === 'simple' ? 'warning' : 'default'}
                            className="text-xs"
                          >
                            {tx.tx_type}
                          </Badge>
                          {tx.change_output && (
                            <span className="text-xs text-green-600">💰 Troco detectado</span>
                          )}
                        </div>
                      </div>
                      
                      {selectedTx?.txid === tx.txid && (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          <p className="text-xs text-slate-500">
                            Inputs: {tx.inputs.length} | Outputs: {tx.outputs.length}
                          </p>
                          <p className="text-xs text-slate-500">
                            Valor: {formatBTC(tx.total_output_value)} BTC | Fee: {formatBTC(tx.fee_sats)} BTC
                          </p>
                          {tx.change_output && (
                            <div className="p-2 bg-green-50 rounded">
                              <p className="text-xs text-green-700">
                                <strong>Troco:</strong> {truncateAddress(tx.change_output.address, 8, 8)}
                              </p>
                              <p className="text-xs text-green-600">{tx.change_output.explanation}</p>
                            </div>
                          )}
                          {tx.cioh.applicable && (
                            <div className="p-2 bg-amber-50 rounded">
                              <p className="text-xs text-amber-700">
                                <strong>CIOH:</strong> {tx.cioh.warning}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Forensic Warnings */}
            {forensicData.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <h5 className="text-sm font-medium text-amber-800 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Alertas da Análise
                </h5>
                <ul className="space-y-1">
                  {forensicData.warnings.slice(0, 5).map((warning, idx) => (
                    <li key={idx} className="text-xs text-amber-700">• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* Toggle Forensic Panel Button */}
        {forensicData && !showForensicPanel && (
          <button
            onClick={() => setShowForensicPanel(true)}
            className="mt-4 flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            <ChevronUp className="w-4 h-4" />
            Mostrar Análise Forense
          </button>
        )}

        {selectedNode && (
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h4 className="font-semibold text-slate-900 flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: getRiskColor(selectedNode.risk) }}
                >
                  {selectedNode.type === 'address' && '₿'}
                  {selectedNode.type === 'transaction' && 'T'}
                  {selectedNode.type === 'cluster' && '⚡'}
                  {selectedNode.type === 'entity' && '🏢'}
                </div>
                <div>
                  <span className="block">{selectedNode.entity_name || truncateAddress(selectedNode.id, 8, 8)}</span>
                  <span className="text-xs font-normal text-slate-500 capitalize">{selectedNode.type}</span>
                </div>
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-500 flex items-center gap-2">
                  <Bitcoin className="w-4 h-4" />
                  Valor Total
                </span>
                <span className="font-semibold text-orange-600 text-lg">
                  {formatBTC(selectedNode.value_sats)} BTC
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-500 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Nível de Risco
                </span>
                <Badge
                  variant={
                    selectedNode.risk === 'safe'
                      ? 'safe'
                      : selectedNode.risk === 'caution'
                      ? 'warning'
                      : selectedNode.risk === 'high'
                      ? 'danger'
                      : 'danger'
                  }
                  className="capitalize"
                >
                  {selectedNode.risk === 'critical' && <AlertTriangle className="w-3 h-3 mr-1" />}
                  {selectedNode.risk}
                </Badge>
              </div>
              
              <div className="pt-2">
                <span className="text-slate-500 text-xs uppercase tracking-wide">ID Completo</span>
                <p className="font-mono text-xs text-slate-700 bg-slate-50 p-2 rounded-lg mt-1 break-all">
                  {selectedNode.id}
                </p>
              </div>
              
              {selectedNode.is_watched && (
                <div className="flex items-center gap-2 text-orange-600 bg-orange-50 p-3 rounded-lg">
                  <Eye className="w-4 h-4" />
                  <span className="font-medium">Endereço em monitorização</span>
                </div>
              )}
              
              {/* Connected Addresses / Wallet Connections */}
              {selectedNode.connected_addresses && selectedNode.connected_addresses.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h5 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-[#FF5533]" />
                    Endereços Conectados ({selectedNode.connected_addresses.length})
                  </h5>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {selectedNode.connected_addresses.map((conn, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 bg-gradient-to-r from-slate-50 to-white rounded-lg border border-slate-200 hover:border-[#FF5533] transition-all cursor-pointer shadow-sm"
                        onClick={() => {
                          setAddress(conn.address)
                          loadGraph(conn.address)
                        }}
                      >
                        {/* Address Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {conn.is_known_entity ? (
                              <span className="text-lg">🏢</span>
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-[#FF5533]/10 flex items-center justify-center text-xs">₿</span>
                            )}
                            <span className="font-mono text-xs text-slate-700">
                              {conn.entity_name || truncateAddress(conn.address, 8, 6)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge 
                              variant={conn.confidence > 0.7 ? 'danger' : conn.confidence > 0.4 ? 'warning' : 'safe'}
                              className="text-xs"
                            >
                              {(conn.confidence * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Direction & Value */}
                        <div className="flex items-center justify-between text-sm mb-2">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs font-medium ${
                              conn.direction === 'outgoing' ? 'text-red-500' : 
                              conn.direction === 'incoming' ? 'text-green-500' : 'text-slate-500'
                            }`}>
                              {conn.direction === 'outgoing' ? 'Enviado →' : 
                               conn.direction === 'incoming' ? '← Recebido' : '↔ Bidirecional'}
                            </span>
                          </div>
                          <span className="font-semibold text-[#FF5533]">
                            {formatBTC(conn.total_value_sats)} BTC
                          </span>
                        </div>
                        
                        {/* Transaction Summary */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                          <span>{conn.transactions.length} transação(ões)</span>
                          {conn.first_seen && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(conn.first_seen).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        
                        {/* Heuristics */}
                        {conn.heuristics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {conn.heuristics.map((h, hidx) => (
                              <span 
                                key={hidx} 
                                className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded"
                              >
                                {h === 'cioh' ? 'CIOH' : h === 'transaction' ? 'Transação' : h}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {/* Transaction List (collapsible) */}
                        {conn.transactions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500 mb-1">Transações:</p>
                            <div className="space-y-1">
                              {conn.transactions.slice(0, 3).map((tx, tidx) => (
                                <div key={tidx} className="flex items-center justify-between text-xs">
                                  <span className="font-mono text-slate-600">
                                    {truncateTxid(tx.txid)}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-500">{formatBTC(tx.value_sats)} BTC</span>
                                    {tx.is_cioh && (
                                      <span className="text-[10px] px-1 bg-orange-200 text-orange-800 rounded">CIOH</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {conn.transactions.length > 3 && (
                                <p className="text-xs text-slate-400 italic">
                                  +{conn.transactions.length - 3} mais...
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Explore Button */}
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setAddress(conn.address)
                              loadGraph(conn.address)
                            }}
                            className="flex items-center gap-1 text-xs text-[#FF5533] hover:text-[#FF016B] font-medium"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Explorar este endereço
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Legacy: Relationship Details (fallback) */}
              {(!selectedNode.connected_addresses || selectedNode.connected_addresses.length === 0) && 
               selectedNode.relationships && selectedNode.relationships.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h5 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Relações ({selectedNode.relationships.length})
                  </h5>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedNode.relationships.map((rel, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-orange-300 transition-colors cursor-pointer"
                        onClick={() => {
                          setAddress(rel.peer_address)
                          loadGraph(rel.peer_address)
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-slate-700">
                            {truncateAddress(rel.peer_address, 6, 4)}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={rel.confidence > 0.7 ? 'danger' : rel.confidence > 0.4 ? 'warning' : 'safe'}
                              className="text-xs"
                            >
                              {(rel.confidence * 100).toFixed(0)}%
                            </Badge>
                            <span className={`text-xs ${rel.direction === 'outgoing' ? 'text-red-500' : rel.direction === 'incoming' ? 'text-green-500' : 'text-slate-500'}`}>
                              {rel.direction === 'outgoing' ? '→' : rel.direction === 'incoming' ? '←' : '↔'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{rel.shared_transactions.length} txns</span>
                          <span>{formatBTC(rel.total_value_sats)} BTC</span>
                        </div>
                        {rel.heuristics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {rel.heuristics.map((h, hidx) => (
                              <span 
                                key={hidx} 
                                className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded"
                              >
                                {h === 'cioh' ? 'CIOH' : h}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Cluster Info */}
              {selectedNode.cluster_id && (
                <div className="pt-4 border-t border-slate-200">
                  <h5 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Cluster
                  </h5>
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <p className="text-xs text-indigo-700">
                      <strong>ID:</strong> {selectedNode.cluster_id}
                    </p>
                    {selectedNode.cluster_confidence && (
                      <p className="text-xs text-indigo-600 mt-1">
                        <strong>Confiança:</strong> {(selectedNode.cluster_confidence * 100).toFixed(0)}%
                      </p>
                    )}
                    <p className="text-xs text-indigo-600 mt-1">
                      Endereços neste cluster compartilham controlo com base na análise de entradas comuns (CIOH).
                    </p>
                  </div>
                </div>
              )}
              
              <div className="flex gap-2 pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setAddress(selectedNode.id)
                    loadGraph(selectedNode.id)
                  }}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Explorar
                </Button>
                {selectedNode.type === 'address' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEntityToClassify(selectedNode.id)
                      setShowEntityClassifier(true)
                    }}
                    className="flex items-center gap-1"
                  >
                    <Tag className="w-4 h-4" />
                    Classificar
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(selectedNode.id)}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Entity Classifier Modal */}
        {showEntityClassifier && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
              <EntityClassifier
                address={entityToClassify}
                onEntitySaved={(entity: Entity) => {
                  setShowEntityClassifier(false)
                  setEntityToClassify(undefined)
                  // Reload graph to show new entity
                  if (currentGraph) {
                    loadGraph()
                  }
                }}
                onClose={() => {
                  setShowEntityClassifier(false)
                  setEntityToClassify(undefined)
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
