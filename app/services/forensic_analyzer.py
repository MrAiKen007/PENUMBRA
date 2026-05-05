import asyncio
import logging
from typing import Dict, List, Optional, Set, Tuple
from collections import defaultdict

from app.models.forensic import (
    TransactionAnalysis, InputAnalysis, OutputAnalysis,
    CIOHAnalysis, Cluster, ChangeOutput, PaymentOutput,
    TransactionType, PrivacyScore, ScriptType, ChangeHeuristic,
    ForensicReport, EntityCluster, FlowPath
)
from app.models.graph import NodeRisk
from app.services.graph_builder import fetch_transaction, fetch_address_transactions, _resolve_entity
from app.core.bitcoin_rpc import async_rpc_cliente

logger = logging.getLogger(__name__)

# Base de dados de endereços conhecidos (entidades)
KNOWN_ENTITIES_DB = {
    # Exchanges
    "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": {"name": "Binance Cold", "type": "exchange", "risk": "high"},
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": {"name": "Binance Hot", "type": "exchange", "risk": "high"},
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": {"name": "Coinbase", "type": "exchange", "risk": "high"},
    "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF": {"name": "MtGox Cold", "type": "exchange", "risk": "high"},
    # Mixers
    "1CK6KHY6MHgYvmRQ4PAafKYDrg1ejbH1cE": {"name": "BitcoinFog", "type": "mixer", "risk": "critical"},
    # Services
    "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": {"name": "Satoshi Dice", "type": "gambling", "risk": "medium"},
}


class ScriptAnalyzer:
    """Analisa tipos de script de endereços Bitcoin."""
    
    @staticmethod
    def get_script_type(address: str) -> ScriptType:
        """Determina o tipo de script a partir do endereço."""
        if not address or address == "unknown":
            return ScriptType.UNKNOWN
        
        if address.startswith("1"):
            return ScriptType.P2PKH
        elif address.startswith("3"):
            return ScriptType.P2SH
        elif address.startswith("bc1q"):
            # SegWit v0 - bech32
            if len(address) == 42:  # P2WPKH
                return ScriptType.P2WPKH
            else:  # P2WSH (mais longo)
                return ScriptType.P2WSH
        elif address.startswith("bc1p"):
            return ScriptType.P2TR  # Taproot
        
        return ScriptType.UNKNOWN


class ChangeDetector:
    """Detector profissional de endereços de troco."""
    
    def __init__(self):
        self.seen_addresses: Set[str] = set()
        self.address_first_seen: Dict[str, int] = {}
    
    def is_new_address(self, address: str, current_block: int) -> bool:
        """Verifica se endereço nunca foi visto antes."""
        return address not in self.seen_addresses
    
    def mark_seen(self, address: str, block_height: int):
        """Marca endereço como visto."""
        self.seen_addresses.add(address)
        if address not in self.address_first_seen:
            self.address_first_seen[address] = block_height
    
    def analyze_transaction(self, tx_analysis: TransactionAnalysis) -> Optional[ChangeOutput]:
        """
        Análise completa de troco usando múltiplas heurísticas.
        Retorna o output mais provável de ser troco com score de confiança.
        """
        outputs = tx_analysis.outputs
        inputs = tx_analysis.inputs
        
        if len(outputs) < 2:
            return None
        
        # CoinJoin: não tentar detectar troco
        if tx_analysis.tx_type == TransactionType.COINJOIN:
            return None
        
        input_addrs = set(inp.address for inp in inputs if inp.address != "unknown")
        input_scripts = set(inp.script_type for inp in inputs)
        
        candidates = []
        
        for out in outputs:
            score = 0.0
            heuristics = []
            reasons = []
            
            # Heurística 1: Endereço novo (mais forte)
            if out.is_new_address:
                score += 0.30
                heuristics.append(ChangeHeuristic.NEW_ADDRESS)
                reasons.append("endereço nunca usado antes")
            
            # Heurística 2: Tipo de script igual aos inputs
            if out.script_type in input_scripts:
                score += 0.25
                heuristics.append(ChangeHeuristic.SCRIPT_TYPE_MATCH)
                reasons.append(f"mesmo tipo de script ({out.script_type.value})")
            
            # Heurística 3: Valor não-arredondado
            btc = out.value_sats / 1e8
            if not self._is_round_amount(btc):
                score += 0.20
                heuristics.append(ChangeHeuristic.NON_ROUND_VALUE)
                reasons.append("valor 'quebrado' (não arredondado)")
            
            # Heurística 4: Transação de apenas 2 outputs
            if len(outputs) == 2:
                score += 0.15
                heuristics.append(ChangeHeuristic.TWO_OUTPUTS)
                
                # Heurística 5: É o output de menor valor
                other = next(o for o in outputs if o.vout != out.vout)
                if out.value_sats < other.value_sats:
                    score += 0.10
                    heuristics.append(ChangeHeuristic.SMALLER_OUTPUT)
                    reasons.append("valor menor (possível troco)")
            
            # Penalidade: Endereço reutilizado (pagamento comum)
            if out.address in input_addrs:
                score -= 0.40
                reasons.append("ATENÇÃO: endereço reutilizado")
            
            # Penalidade: Valor muito redondo
            if self._is_round_amount(btc) and btc >= 0.01:
                score -= 0.15
                reasons.append("valor muito arredondado (provável pagamento)")
            
            if score >= 0.40:  # Threshold para considerar candidato
                candidates.append({
                    'output': out,
                    'score': score,
                    'heuristics': heuristics,
                    'reasons': reasons
                })
        
        if not candidates:
            return None
        
        # Seleciona melhor candidato
        candidates.sort(key=lambda x: x['score'], reverse=True)
        best = candidates[0]
        
        # Ajusta confiança baseada no score
        confidence = min(best['score'] * 1.1, 0.95)  # Cap em 95%
        
        # Gera explicação
        explanation = self._generate_explanation(best['reasons'], confidence)
        
        return ChangeOutput(
            address=best['output'].address,
            value_sats=best['output'].value_sats,
            confidence=confidence,
            heuristics=best['heuristics'],
            explanation=explanation
        )
    
    def _is_round_amount(self, btc: float) -> bool:
        """Detecta valores arredondados típicos de pagamentos."""
        if btc == 0:
            return True
        
        # Remove decimais
        sats = int(btc * 1e8)
        
        # Padrões arredondados comuns
        round_patterns = [
            1_0000_0000,    # 1 BTC
            5_0000_0000,    # 0.5 BTC
            2_5000_0000,    # 0.25 BTC
            1_000_0000,     # 0.1 BTC
            500_0000,       # 0.05 BTC
            100_0000,       # 0.01 BTC
            50_0000,        # 0.005 BTC
            10_0000,        # 0.001 BTC
            5_0000,         # 0.0005 BTC
            1_0000,         # 0.0001 BTC
        ]
        
        # Verifica se é múltiplo de valores comuns
        for pattern in round_patterns:
            if sats % pattern == 0 and sats >= pattern:
                return True
        
        # Verifica quantidade de zeros decimais
        btc_str = f"{btc:.8f}"
        if "." in btc_str:
            decimal = btc_str.split(".")[1]
            # Se tem muitos zeros no início do decimal
            if decimal.rstrip("0") == "":
                return True
            # Se os primeiros 5+ dígitos são zero
            if decimal[:5] == "00000":
                return True
        
        return False
    
    def _generate_explanation(self, reasons: List[str], confidence: float) -> str:
        """Gera explicação legível para a inferência."""
        level = "muito provável" if confidence > 0.7 else "provável" if confidence > 0.5 else "possível"
        
        positive_reasons = [r for r in reasons if not r.startswith("ATENÇÃO") and not r.startswith("valor muito arredondado")]
        
        if positive_reasons:
            return f"Troco {level}: {', '.join(positive_reasons[:3])}. Confiança: {confidence:.0%}"
        else:
            return f"Troco {level} (indícios fracos). Confiança: {confidence:.0%}"


class ClusteringEngine:
    """
    Motor de clusterização de entidades.
    Implementa CIOH (Common Input Ownership Heuristic) e outras técnicas.
    """
    
    def __init__(self):
        self.clusters: Dict[str, Cluster] = {}
        self.address_to_cluster: Dict[str, str] = {}
        self.change_detector = ChangeDetector()
    
    def process_transaction(self, tx_analysis: TransactionAnalysis) -> List[Cluster]:
        """
        Processa transação e atualiza clusters baseado em heurísticas.
        Retorna lista de clusters afetados.
        """
        affected_clusters = []
        
        # Não clusterizar CoinJoin
        if tx_analysis.tx_type == TransactionType.COINJOIN:
            logger.debug(f"Ignorando CoinJoin {tx_analysis.txid[:16]}... para clusterização")
            return affected_clusters
        
        # CIOH: inputs comuns = mesma entidade
        cioh = tx_analysis.apply_cioh()
        if cioh.applicable:
            cluster = self._merge_addresses_into_cluster(
                cioh.input_addresses,
                tx_analysis.txid,
                confidence=cioh.confidence,
                reason=cioh.warning
            )
            if cluster:
                affected_clusters.append(cluster)
        
        # Heurística de troco: change e inputs = mesma entidade
        if tx_analysis.change_output:
            change_addr = tx_analysis.change_output.address
            input_addrs = [inp.address for inp in tx_analysis.inputs if inp.address != "unknown"]
            
            # Change pertence ao mesmo cluster que os inputs
            if input_addrs:
                # Encontra cluster dos inputs
                input_cluster_id = None
                for addr in input_addrs:
                    if addr in self.address_to_cluster:
                        input_cluster_id = self.address_to_cluster[addr]
                        break
                
                if input_cluster_id:
                    # Adiciona change ao mesmo cluster
                    cluster = self.clusters.get(input_cluster_id)
                    if cluster and change_addr not in cluster.addresses:
                        cluster.add_address(change_addr, tx_analysis.txid)
                        self.address_to_cluster[change_addr] = input_cluster_id
                        affected_clusters.append(cluster)
                else:
                    # Cria novo cluster com inputs + change
                    cluster = self._merge_addresses_into_cluster(
                        input_addrs + [change_addr],
                        tx_analysis.txid,
                        confidence=tx_analysis.change_output.confidence * 0.9,
                        reason=f"Change heuristic: troco provável junta-se aos inputs"
                    )
                    if cluster:
                        affected_clusters.append(cluster)
        
        # Address reuse detectado: fortalece cluster
        for inp in tx_analysis.inputs:
            for out in tx_analysis.outputs:
                if inp.address == out.address and inp.address != "unknown":
                    # Reutilização de endereço em transação
                    self._strengthen_cluster_for_address(inp.address, 0.1)
        
        return affected_clusters
    
    def _merge_addresses_into_cluster(
        self,
        addresses: List[str],
        txid: str,
        confidence: float,
        reason: str
    ) -> Optional[Cluster]:
        """Mescla endereços em cluster existente ou cria novo."""
        unique_addrs = list(set(a for a in addresses if a != "unknown"))
        
        if len(unique_addrs) < 2:
            return None
        
        # Verifica se algum endereço já pertence a um cluster
        existing_clusters = set()
        for addr in unique_addrs:
            if addr in self.address_to_cluster:
                existing_clusters.add(self.address_to_cluster[addr])
        
        if existing_clusters:
            # Mescla todos em um cluster (o maior ou primeiro)
            sorted_clusters = sorted(
                existing_clusters,
                key=lambda cid: len(self.clusters[cid].addresses),
                reverse=True
            )
            target_cluster_id = sorted_clusters[0]
            target_cluster = self.clusters[target_cluster_id]
            
            # Adiciona novos endereços
            for addr in unique_addrs:
                if addr not in target_cluster.addresses:
                    target_cluster.add_address(addr, txid)
                    self.address_to_cluster[addr] = target_cluster_id
            
            # Mescla outros clusters se necessário
            for other_id in sorted_clusters[1:]:
                other = self.clusters[other_id]
                for addr in other.addresses:
                    if addr not in target_cluster.addresses:
                        target_cluster.add_address(addr, txid)
                        self.address_to_cluster[addr] = target_cluster_id
                # Remove cluster mesclado
                del self.clusters[other_id]
            
            # Atualiza confiança
            target_cluster.confidence = max(target_cluster.confidence, confidence)
            target_cluster.reason = reason
            
            return target_cluster
        
        else:
            # Cria novo cluster
            cluster_id = f"cluster_{txid[:16]}"
            cluster = Cluster(
                cluster_id=cluster_id,
                addresses=unique_addrs.copy(),
                created_by=[txid],
                confidence=confidence,
                reason=reason
            )
            
            self.clusters[cluster_id] = cluster
            for addr in unique_addrs:
                self.address_to_cluster[addr] = cluster_id
            
            return cluster
    
    def _strengthen_cluster_for_address(self, address: str, boost: float):
        """Fortalece confiança de cluster quando endereço é reutilizado."""
        if address in self.address_to_cluster:
            cluster_id = self.address_to_cluster[address]
            cluster = self.clusters.get(cluster_id)
            if cluster:
                cluster.confidence = min(1.0, cluster.confidence + boost)
    
    def get_cluster_for_address(self, address: str) -> Optional[Cluster]:
        """Retorna cluster de um endereço."""
        if address in self.address_to_cluster:
            return self.clusters.get(self.address_to_cluster[address])
        return None
    
    def get_all_clusters(self) -> List[Cluster]:
        """Retorna todos os clusters."""
        return list(self.clusters.values())


class ForensicAnalyzer:
    """
    Analisador forense completo para transações Bitcoin.
    """
    
    def __init__(self):
        self.change_detector = ChangeDetector()
        self.clustering = ClusteringEngine()
        self.analyzed_txids: Set[str] = set()
        self.known_entities = KNOWN_ENTITIES_DB
    
    async def analyze_address(
        self,
        address: str,
        max_transactions: int = 50
    ) -> ForensicReport:
        """
        Análise forense completa de um endereço.
        """
        logger.info(f"Iniciando análise forense de {address[:20]}...")
        
        report = ForensicReport(
            target_address=address,
            clusters=[],
            entity_clusters=[]
        )
        
        # Busca transações do endereço
        transactions = await fetch_address_transactions(address)
        
        if not transactions:
            report.warnings.append("Nenhuma transação encontrada para este endereço")
            return report
        
        # Limita número de transações
        transactions = transactions[:max_transactions]
        
        # Analisa cada transação
        for tx in transactions:
            txid = tx.get("txid")
            if not txid or txid in self.analyzed_txids:
                continue
            
            try:
                tx_analysis = await self._analyze_transaction(txid, tx)
                if tx_analysis:
                    report.transactions_analyzed.append(tx_analysis)
                    self.analyzed_txids.add(txid)
                    
                    # Processa clusterização
                    self.clustering.process_transaction(tx_analysis)
                    
                    # Atualiza métricas
                    report.total_transactions += 1
                    report.total_volume_sats += tx_analysis.total_output_value
                    
                    # Detecta riscos
                    self._detect_risks(tx_analysis, report)
                    
            except Exception as e:
                logger.warning(f"Erro ao analisar {txid[:16]}...: {e}")
                continue
        
        # Adiciona clusters ao relatório
        report.clusters = self.clustering.get_all_clusters()
        
        # Adiciona entidades conhecidas
        report.entity_clusters = self._detect_known_entities(report)
        
        # Calcula score de privacidade
        report.privacy_score = self._calculate_privacy_score(report)
        
        # Gera warnings finais
        self._generate_summary_warnings(report)
        
        logger.info(
            f"Análise completa: {report.total_transactions} txs, "
            f"{len(report.clusters)} clusters, {len(report.risk_addresses)} riscos"
        )
        
        return report
    
    async def _analyze_transaction(
        self,
        txid: str,
        tx_summary: dict
    ) -> Optional[TransactionAnalysis]:
        """Analisa uma transação individual em profundidade."""
        
        # Busca detalhes completos
        try:
            tx_detail = await fetch_transaction(txid)
        except Exception as e:
            logger.debug(f"Não foi possível buscar detalhes de {txid}: {e}")
            return None
        
        inputs = tx_detail.get("vin", [])
        outputs = tx_detail.get("vout", [])
        status = tx_detail.get("status", {})
        
        # Cria análise base
        analysis = TransactionAnalysis(
            txid=txid,
            block_height=status.get("block_height"),
            confirmed=status.get("confirmed", False),
            fee_sats=tx_summary.get("fee", 0) or self._calculate_fee(inputs, outputs)
        )
        
        # Processa inputs
        for idx, inp in enumerate(inputs):
            prevout = inp.get("prevout", {})
            addr = prevout.get("scriptpubkey_address", "unknown")
            value = prevout.get("value", 0)
            
            input_analysis = InputAnalysis(
                txid=inp.get("txid", ""),
                vout=inp.get("vout", 0),
                address=addr,
                value_sats=value,
                script_type=ScriptAnalyzer.get_script_type(addr)
            )
            
            analysis.inputs.append(input_analysis)
            analysis.total_input_value += value
            if addr != "unknown":
                analysis.input_addresses.append(addr)
                self.change_detector.mark_seen(addr, analysis.block_height or 0)
        
        # Processa outputs
        for idx, out in enumerate(outputs):
            addr = out.get("scriptpubkey_address", "")
            value = out.get("value", 0)
            
            # Verifica se é novo endereço
            is_new = self.change_detector.is_new_address(addr, analysis.block_height or 0)
            
            output_analysis = OutputAnalysis(
                address=addr,
                value_sats=value,
                vout=idx,
                script_type=ScriptAnalyzer.get_script_type(addr),
                is_new_address=is_new
            )
            
            analysis.outputs.append(output_analysis)
            analysis.total_output_value += value
            if addr:
                analysis.output_addresses.append(addr)
                self.change_detector.mark_seen(addr, analysis.block_height or 0)
        
        # Classifica transação
        analysis.classify_transaction()
        
        # Detecta troco
        analysis.analyze_change()
        
        # Verifica address reuse
        input_set = set(analysis.input_addresses)
        output_set = set(analysis.output_addresses)
        reused = input_set & output_set
        if reused:
            analysis.has_address_reuse = True
            for addr in reused:
                analysis.warnings.append(
                    f"Reutilização de endereço: {addr[:20]}... usado como input e output"
                )
        
        # Fee rate
        if analysis.fee_sats > 0:
            # Estima tamanho ~250 bytes para tx simples
            estimated_size = len(inputs) * 150 + len(outputs) * 50 + 100
            analysis.fee_rate = analysis.fee_sats / estimated_size if estimated_size > 0 else 0
        
        return analysis
    
    def _calculate_fee(self, inputs: List[dict], outputs: List[dict]) -> int:
        """Calcula fee estimada."""
        input_total = sum(
            inp.get("prevout", {}).get("value", 0)
            for inp in inputs
        )
        output_total = sum(
            out.get("value", 0)
            for out in outputs
        )
        return max(0, input_total - output_total)
    
    def _detect_risks(self, tx_analysis: TransactionAnalysis, report: ForensicReport):
        """Detecta endereços de risco na transação."""
        
        all_addresses = set(tx_analysis.input_addresses + tx_analysis.output_addresses)
        
        for addr in all_addresses:
            # Verifica entidades conhecidas
            if addr in self.known_entities:
                entity = self.known_entities[addr]
                if addr not in report.risk_addresses:
                    report.risk_addresses.append(addr)
                    report.warnings.append(
                        f"Endereço ligado a {entity['name']} ({entity['type']})"
                    )
    
    def _detect_known_entities(self, report: ForensicReport) -> List[EntityCluster]:
        """Detecta entidades conhecidas no relatório."""
        entities = []
        all_addresses = set()
        
        for tx in report.transactions_analyzed:
            all_addresses.update(tx.input_addresses)
            all_addresses.update(tx.output_addresses)
        
        for addr in all_addresses:
            if addr in self.known_entities:
                info = self.known_entities[addr]
                # Verifica se já existe
                existing = next((e for e in entities if e.entity_name == info['name']), None)
                if existing:
                    if addr not in existing.addresses:
                        existing.addresses.append(addr)
                else:
                    entities.append(EntityCluster(
                        entity_name=info['name'],
                        entity_type=info['type'],
                        addresses=[addr],
                        risk_level=info.get('risk', 'unknown'),
                        source='known_database'
                    ))
        
        return entities
    
    def _calculate_privacy_score(self, report: ForensicReport) -> PrivacyScore:
        """Calcula score de privacidade geral."""
        
        # Pontuação base
        score = 0
        factors = []
        
        # CoinJoins aumentam privacidade
        coinjoin_count = sum(
            1 for tx in report.transactions_analyzed
            if tx.tx_type == TransactionType.COINJOIN
        )
        if coinjoin_count > 0:
            score += 30 * min(coinjoin_count, 3)
            factors.append(f"{coinjoin_count} CoinJoin(s)")
        
        # Address reuse reduz privacidade
        reuse_count = sum(
            1 for tx in report.transactions_analyzed
            if tx.has_address_reuse
        )
        if reuse_count > 0:
            score -= 25 * reuse_count
            factors.append(f"{reuse_count} reutilização(ões)")
        
        # CIOH expõe conexões
        cioh_count = sum(
            1 for tx in report.transactions_analyzed
            if tx.cioh.applicable
        )
        if cioh_count > 0:
            score -= 15 * cioh_count
            factors.append(f"{cioh_count} CIOH detectado(s)")
        
        # Muitos clusters = mais exposição
        cluster_factor = min(len(report.clusters) * 5, 20)
        score -= cluster_factor
        
        # Normaliza
        if score > 50:
            return PrivacyScore.HIGH
        elif score > 0:
            return PrivacyScore.MEDIUM
        else:
            return PrivacyScore.LOW
    
    def _generate_summary_warnings(self, report: ForensicReport):
        """Gera warnings sumarizados."""
        
        if report.privacy_score == PrivacyScore.LOW:
            report.warnings.append(
                "Score de privacidade BAIXO: suas transações são facilmente rastreáveis"
            )
        elif report.privacy_score == PrivacyScore.HIGH:
            report.warnings.append(
                "Score de privacidade ALTO: boas práticas de privacidade detectadas"
            )
        
        # Resumo de clusters
        if report.clusters:
            total_linked = sum(len(c.addresses) for c in report.clusters)
            report.warnings.append(
                f"Clusterização: {len(report.clusters)} cluster(s) com {total_linked} endereços relacionados"
            )
        
        # Entidades de risco
        if report.entity_clusters:
            risky = [e for e in report.entity_clusters if e.risk_level in ['high', 'critical']]
            if risky:
                report.warnings.append(
                    f"ALERTA: Conexão com {len(risky)} entidade(s) de risco detectada(s)"
                )


# Função de conveniência
async def analyze_address_forensic(
    address: str,
    max_transactions: int = 50
) -> ForensicReport:
    """
    Função principal para análise forense.
    """
    analyzer = ForensicAnalyzer()
    return await analyzer.analyze_address(address, max_transactions)
