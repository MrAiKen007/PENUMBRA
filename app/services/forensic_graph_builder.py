import asyncio
import logging
from typing import Dict, List, Optional, Set, Tuple

from app.models.graph import (
    NodeType, NodeRisk, GraphNode, GraphEdge,
    ClusterInfo, GraphData
)
from app.models.forensic import (
    ForensicReport, TransactionAnalysis, Cluster,
    TransactionType, PrivacyScore, ChangeHeuristic
)
from app.services.graph_builder import (
    fetch_transaction, fetch_address_transactions, 
    _resolve_entity, KNOWN_ENTITIES, EXCHANGE_PREFIXES
)
from app.services.forensic_analyzer import (
    ForensicAnalyzer, ChangeDetector, ClusteringEngine,
    ScriptAnalyzer, analyze_address_forensic
)
from app.core.bitcoin_rpc import async_rpc_cliente

logger = logging.getLogger(__name__)


class ForensicGraphBuilder:
    """
    Construtor de grafo com análise forense profissional.
    
    Este builder cria um grafo enriquecido com:
    - Detecção de change addresses
    - Clusterização CIOH
    - Identificação de CoinJoin
    - Scoring de privacidade
    - Análise de peeling chains
    """
    
    def __init__(
        self,
        watched_address: str,
        max_depth: int = 2,
        max_nodes: int = 100,
        enable_forensic: bool = True
    ):
        self.watched_address = watched_address
        self.max_depth = max_depth
        self.max_nodes = max_nodes
        self.enable_forensic = enable_forensic
        
        # Estado do grafo
        self._nodes: Dict[str, GraphNode] = {}
        self._edges: List[GraphEdge] = []
        self._visited_txids: Set[str] = set()
        self._visited_addresses: Set[str] = set()
        self._warnings: List[str] = []
        
        # Estado forense
        self.forensic_analyzer = ForensicAnalyzer() if enable_forensic else None
        self.change_detector = ChangeDetector() if enable_forensic else None
        self.clustering = ClusteringEngine() if enable_forensic else None
        
        # Cache de análises
        self._tx_analyses: Dict[str, TransactionAnalysis] = {}
        self._change_addresses: Set[str] = set()
        self._coinjoin_txids: Set[str] = set()
        
        # Métricas
        self.stats = {
            "change_detected": 0,
            "coinjoin_detected": 0,
            "clusters_formed": 0,
            "peeling_chains": 0,
        }
    
    async def build(self) -> Tuple[GraphData, Optional[ForensicReport]]:
        """
        Constrói grafo completo com análise forense.
        Retorna (GraphData, ForensicReport opcional).
        """
        logger.info(
            f"Construindo grafo forense para {self.watched_address[:20]}... "
            f"(depth={self.max_depth}, forensic={self.enable_forensic})"
        )
        
        # Análise forense completa primeiro
        forensic_report = None
        if self.enable_forensic:
            try:
                forensic_report = await self.forensic_analyzer.analyze_address(
                    self.watched_address,
                    max_transactions=50
                )
                self._apply_forensic_results(forensic_report)
            except Exception as e:
                logger.warning(f"Erro na análise forense: {e}")
        
        # Constrói grafo tradicional
        self._add_address_node(self.watched_address, is_watched=True)
        await self._expand_address(self.watched_address, current_depth=0)
        
        # Aplica clustering CIOH no grafo
        if self.enable_forensic and self.clustering:
            await self._apply_clustering_to_graph()
        
        # Calcula estatísticas finais
        stats = self._calculate_stats()
        if forensic_report:
            stats["forensic"] = {
                "total_transactions": forensic_report.total_transactions,
                "privacy_score": forensic_report.privacy_score.value,
                "clusters_found": len(forensic_report.clusters),
                "entity_clusters": len(forensic_report.entity_clusters),
            }
        
        # Converte clusters para formato GraphData
        clusters = self._convert_clusters_to_info()
        
        logger.info(
            f"Grafo concluído: {len(self._nodes)} nós, {len(self._edges)} arestas, "
            f"{len(clusters)} clusters, {self.stats['change_detected']} changes"
        )
        
        graph_data = GraphData(
            nodes=list(self._nodes.values()),
            edges=self._edges,
            clusters=clusters,
            depth_reached=self.max_depth,
            warnings=self._warnings + (forensic_report.warnings if forensic_report else []),
            stats=stats
        )
        
        return graph_data, forensic_report
    
    def _apply_forensic_results(self, report: ForensicReport):
        """Aplica resultados forenses ao estado do builder."""
        
        # Coleta endereços de troco
        for tx in report.transactions_analyzed:
            if tx.change_output:
                self._change_addresses.add(tx.change_output.address)
                self.stats["change_detected"] += 1
            
            if tx.tx_type == TransactionType.COINJOIN:
                self._coinjoin_txids.add(tx.txid)
                self.stats["coinjoin_detected"] += 1
            
            # Cache análise
            self._tx_analyses[tx.txid] = tx
        
        # Atualiza contadores
        self.stats["clusters_formed"] = len(report.clusters)
    
    async def _expand_address(self, address: str, current_depth: int) -> None:
        """Expande grafo a partir de um endereço."""
        if current_depth >= self.max_depth:
            return
        if address in self._visited_addresses:
            return
        if len(self._nodes) >= self.max_nodes:
            self._warnings.append(
                f"Grafo limitado a {self.max_nodes} nós para performance"
            )
            return
        
        self._visited_addresses.add(address)
        
        # Busca transações
        transactions = await fetch_address_transactions(address)
        
        for tx in transactions:
            txid = tx.get("txid", "")
            if txid in self._visited_txids:
                continue
            if len(self._nodes) >= self.max_nodes:
                break
            
            self._visited_txids.add(txid)
            await self._process_transaction(tx, current_depth)
    
    async def _process_transaction(self, tx: dict, current_depth: int) -> None:
        """Processa transação com análise forense."""
        txid = tx.get("txid", "")
        
        # Busca ou usa análise cacheada
        tx_analysis = self._tx_analyses.get(txid)
        if not tx_analysis and self.enable_forensic:
            try:
                tx_analysis = await self._quick_analyze(txid, tx)
                if tx_analysis:
                    self._tx_analyses[txid] = tx_analysis
            except Exception as e:
                logger.debug(f"Análise rápida falhou para {txid[:16]}: {e}")
        
        # Busca detalhes básicos
        try:
            tx_detail = await fetch_transaction(txid)
        except Exception as e:
            logger.warning(f"Não foi possível buscar {txid[:16]}: {e}")
            return
        
        inputs = tx_detail.get("vin", [])
        outputs = tx_detail.get("vout", [])
        total_value = sum(out.get("value", 0) for out in outputs)
        
        # Detecta CoinJoin
        is_coinjoin = txid in self._coinjoin_txids or (
            tx_analysis and tx_analysis.tx_type == TransactionType.COINJOIN
        )
        
        # Cria nó de transação
        tx_node_id = f"tx:{txid}"
        if tx_node_id not in self._nodes:
            risk = NodeRisk.SAFE
            tx_type = "normal"
            
            if is_coinjoin:
                tx_type = "coinjoin"
                # CoinJoin é neutro para risco - é privacidade
            elif tx_analysis and tx_analysis.has_address_reuse:
                risk = NodeRisk.HIGH
                tx_type = "address_reuse"
            
            metadata = {
                "txid": txid,
                "confirmed": tx_detail.get("status", {}).get("confirmed", False),
                "block_height": tx_detail.get("status", {}).get("block_height"),
                "n_inputs": len(inputs),
                "n_outputs": len(outputs),
                "is_coinjoin": is_coinjoin,
                "tx_type": tx_type,
            }
            
            # Adiciona info de change se disponível
            if tx_analysis and tx_analysis.change_output:
                metadata["change_address"] = tx_analysis.change_output.address
                metadata["change_confidence"] = tx_analysis.change_output.confidence
                metadata["change_explanation"] = tx_analysis.change_output.explanation
            
            self._nodes[tx_node_id] = GraphNode(
                id=tx_node_id,
                type=NodeType.TRANSACTION,
                label=f"TX {txid[:8]}...",
                risk=risk,
                value_sats=total_value,
                metadata=metadata
            )
        
        # Processa inputs
        input_addresses = []
        for inp in inputs:
            prevout = inp.get("prevout", {})
            addr = prevout.get("scriptpubkey_address", "")
            value = prevout.get("value", 0)
            
            if not addr or addr in ["COINBASE", "unknown"]:
                continue
            
            input_addresses.append(addr)
            self._add_address_node(addr)
            
            # Edge com flag CIOH
            is_cioh = (
                tx_analysis and 
                tx_analysis.cioh.applicable and 
                len(input_addresses) > 1
            )
            
            self._edges.append(GraphEdge(
                source=addr,
                target=tx_node_id,
                value_sats=value,
                txid=txid,
                is_cioh=is_cioh,
                label=f"{value / 1e8:.8f} BTC"
            ))
        
        # Processa outputs com detecção de change
        for idx, out in enumerate(outputs):
            addr = out.get("scriptpubkey_address", "")
            value = out.get("value", 0)
            
            if not addr:
                continue
            
            # Verifica se é change
            is_change = addr in self._change_addresses
            
            # Ajusta risco do endereço
            self._add_address_node(addr, is_change=is_change)
            
            # Se é change, atualiza visualização
            if is_change and addr in self._nodes:
                self._nodes[addr].metadata["is_change"] = True
            
            # Edge output
            self._edges.append(GraphEdge(
                source=tx_node_id,
                target=addr,
                value_sats=value,
                txid=txid,
                label=f"{value / 1e8:.8f} BTC"
            ))
        
        # Detecta address reuse
        input_set = set(input_addresses)
        output_set = set(out.get("scriptpubkey_address", "") for out in outputs)
        reused = input_set & output_set
        
        if reused:
            for addr in reused:
                if addr in self._nodes:
                    self._nodes[addr].risk = NodeRisk.CRITICAL
                    self._nodes[addr].metadata["address_reuse"] = True
                    
                    if addr == self.watched_address:
                        self._warnings.append(
                            f"REUTILIZAÇÃO CRÍTICA: {addr[:20]}... usado como input e output. "
                            f"Pagamento e troco ligados ao mesmo utilizador!"
                        )
        
        # Expande próxima camada
        if current_depth + 1 < self.max_depth:
            new_addrs = (input_set | output_set) - self._visited_addresses
            for addr in list(new_addrs)[:5]:
                await self._expand_address(addr, current_depth + 1)
    
    async def _quick_analyze(self, txid: str, tx_summary: dict) -> Optional[TransactionAnalysis]:
        """Análise rápida de transação durante construção do grafo."""
        try:
            tx_detail = await fetch_transaction(txid)
            
            from app.models.forensic import TransactionAnalysis, InputAnalysis, OutputAnalysis
            
            analysis = TransactionAnalysis(txid=txid)
            
            # Processa inputs
            for inp in tx_detail.get("vin", []):
                prevout = inp.get("prevout", {})
                addr = prevout.get("scriptpubkey_address", "unknown")
                value = prevout.get("value", 0)
                
                analysis.inputs.append(InputAnalysis(
                    txid=inp.get("txid", ""),
                    vout=inp.get("vout", 0),
                    address=addr,
                    value_sats=value,
                    script_type=ScriptAnalyzer.get_script_type(addr)
                ))
                if addr != "unknown":
                    analysis.input_addresses.append(addr)
                    analysis.total_input_value += value
            
            # Processa outputs
            for idx, out in enumerate(tx_detail.get("vout", [])):
                addr = out.get("scriptpubkey_address", "")
                value = out.get("value", 0)
                
                is_new = self.change_detector.is_new_address(addr, 0) if self.change_detector else True
                
                analysis.outputs.append(OutputAnalysis(
                    address=addr,
                    value_sats=value,
                    vout=idx,
                    script_type=ScriptAnalyzer.get_script_type(addr),
                    is_new_address=is_new
                ))
                if addr:
                    analysis.output_addresses.append(addr)
                    analysis.total_output_value += value
            
            # Classifica e analisa
            analysis.classify_transaction()
            analysis.analyze_change()
            analysis.apply_cioh()
            
            # Address reuse
            reused = set(analysis.input_addresses) & set(analysis.output_addresses)
            if reused:
                analysis.has_address_reuse = True
            
            return analysis
            
        except Exception as e:
            logger.debug(f"Análise rápida falhou: {e}")
            return None
    
    def _add_address_node(
        self, 
        address: str, 
        is_watched: bool = False,
        is_change: bool = False
    ) -> None:
        """Adiciona nó de endereço ao grafo."""
        if address in self._nodes:
            if is_watched:
                self._nodes[address].is_watched = True
            return
        
        # Resolve entidade
        entity = _resolve_entity(address)
        risk = NodeRisk.SAFE
        entity_name = None
        node_type = NodeType.ADDRESS
        
        if entity:
            entity_name = entity["name"]
            risk = entity["risk"]
            node_type = NodeType.ENTITY
            self._warnings.append(
                f"ENTIDADE: {address[:20]}... identificado como '{entity_name}'"
            )
        
        # Ajusta risco para change
        if is_change and not entity:
            # Change é normal, não é risco
            pass
        
        label = entity_name if entity_name else f"{address[:6]}...{address[-4:]}"
        
        metadata = {"full_address": address}
        if is_change:
            metadata["is_change"] = True
            metadata["change_note"] = "Endereço de troco detectado"
        
        self._nodes[address] = GraphNode(
            id=address,
            type=node_type,
            label=label,
            risk=risk,
            is_watched=is_watched,
            entity_name=entity_name,
            metadata=metadata
        )
    
    async def _apply_clustering_to_graph(self):
        """Aplica resultados de clusterização aos nós do grafo."""
        if not self.clustering:
            return
        
        clusters = self.clustering.get_all_clusters()
        
        for cluster in clusters:
            # Cria nó de cluster se relevante
            if len(cluster.addresses) >= 3:
                cluster_node_id = f"cluster:{cluster.cluster_id}"
                
                # Verifica se endereço assistido está no cluster
                has_watched = self.watched_address in cluster.addresses
                
                # Calcula valor total
                total_value = sum(
                    self._nodes[addr].value_sats 
                    for addr in cluster.addresses 
                    if addr in self._nodes
                )
                
                self._nodes[cluster_node_id] = GraphNode(
                    id=cluster_node_id,
                    type=NodeType.CLUSTER,
                    label=f"Cluster ({len(cluster.addresses)} addrs)",
                    risk=NodeRisk.HIGH if has_watched else NodeRisk.CAUTION,
                    value_sats=total_value,
                    metadata={
                        "cluster_id": cluster.cluster_id,
                        "addresses": cluster.addresses[:10],  # Limita para performance
                        "total_addresses": len(cluster.addresses),
                        "confidence": cluster.confidence,
                        "reason": cluster.reason,
                        "has_watched_address": has_watched
                    }
                )
                
                # Liga endereços ao cluster
                for addr in cluster.addresses[:5]:  # Limita conexões
                    if addr in self._nodes:
                        self._edges.append(GraphEdge(
                            source=addr,
                            target=cluster_node_id,
                            value_sats=0,
                            txid="clustering",
                            label="CIOH cluster"
                        ))
    
    def _convert_clusters_to_info(self) -> List[ClusterInfo]:
        """Converte clusters internos para formato GraphData."""
        if not self.clustering:
            return []
        
        clusters = []
        for cluster in self.clustering.get_all_clusters():
            if len(cluster.addresses) >= 2:
                clusters.append(ClusterInfo(
                    cluster_id=cluster.cluster_id,
                    addresses=cluster.addresses,
                    confidence=cluster.confidence,
                    reason=cluster.reason
                ))
        return clusters
    
    def _calculate_stats(self) -> dict:
        """Calcula estatísticas do grafo."""
        address_nodes = [n for n in self._nodes.values() if n.type == NodeType.ADDRESS]
        entity_nodes = [n for n in self._nodes.values() if n.type == NodeType.ENTITY]
        cluster_nodes = [n for n in self._nodes.values() if n.type == NodeType.CLUSTER]
        high_risk = [n for n in self._nodes.values() if n.risk in [NodeRisk.HIGH, NodeRisk.CRITICAL]]
        cioh_edges = [e for e in self._edges if e.is_cioh]
        
        return {
            "total_nodes": len(self._nodes),
            "total_edges": len(self._edges),
            "address_count": len(address_nodes),
            "transaction_count": len(self._visited_txids),
            "entity_count": len(entity_nodes),
            "cluster_nodes": len(cluster_nodes),
            "high_risk_nodes": len(high_risk),
            "cioh_inferences": len(cioh_edges),
            **self.stats
        }


# Função principal
async def build_forensic_graph(
    address: str,
    depth: int = 2,
    max_nodes: int = 100,
    enable_forensic: bool = True
) -> Tuple[GraphData, Optional[ForensicReport]]:
    """
    Constrói grafo com análise forense profissional.
    
    Args:
        address: Endereço Bitcoin para analisar
        depth: Profundidade da busca (1-3)
        max_nodes: Limite de nós
        enable_forensic: Ativar análise forense
    
    Returns:
        Tupla de (GraphData, ForensicReport)
    """
    depth = max(1, min(depth, 3))
    max_nodes = max(10, min(max_nodes, 200))
    
    builder = ForensicGraphBuilder(
        watched_address=address,
        max_depth=depth,
        max_nodes=max_nodes,
        enable_forensic=enable_forensic
    )
    
    return await builder.build()
