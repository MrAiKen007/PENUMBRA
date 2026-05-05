from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class TransactionType(str, Enum):

    SIMPLE = "simple"          
    COMPLEX = "complex"         
    COINJOIN = "coinjoin"      
    CONSOLIDATION = "consolidation" 
    DISTRIBUTION = "distribution"    
    PEELING = "peeling"         
    UNKNOWN = "unknown"


class ScriptType(str, Enum):

    P2PKH = "p2pkh"      
    P2SH = "p2sh"        
    P2WPKH = "p2wpkh"    
    P2WSH = "p2wsh"      
    P2TR = "p2tr"        
    UNKNOWN = "unknown"


class PrivacyScore(str, Enum):

    LOW = "low"           
    MEDIUM = "medium"     
    HIGH = "high"        
    UNKNOWN = "unknown"


class ChangeHeuristic(str, Enum):

    NEW_ADDRESS = "new_address"           
    SCRIPT_TYPE_MATCH = "script_match"    
    NON_ROUND_VALUE = "non_round"         
    SMALLER_OUTPUT = "smaller_output"
    TWO_OUTPUTS = "two_outputs"   
    INPUT_REUSE = "input_reuse"
    OPTIMAL_CHANGE = "optimal_change"


class ClusterConfidence(float, Enum):

    SPECULATIVE = 0.3
    PROBABLE = 0.6 
    HIGH = 0.85 
    CERTAIN = 1.0 


class UTXOInfo(BaseModel):

    txid: str
    vout: int
    value_sats: int
    address: str
    script_type: ScriptType = ScriptType.UNKNOWN
    is_spent: bool = False
    created_at_block: Optional[int] = None
    spent_at_block: Optional[int] = None
    spent_by_txid: Optional[str] = None
    
    @property
    def utxo_id(self) -> str:
        return f"{self.txid}:{self.vout}"


class ChangeOutput(BaseModel):

    address: str
    value_sats: int
    confidence: float = Field(ge=0.0, le=1.0)
    heuristics: List[ChangeHeuristic] = Field(default_factory=list)
    explanation: str = ""


class PaymentOutput(BaseModel):

    address: str
    value_sats: int
    is_external: bool = True  
    known_entity: Optional[str] = None


class InputAnalysis(BaseModel):

    txid: str 
    vout: int
    address: str
    value_sats: int
    script_type: ScriptType = ScriptType.UNKNOWN
    cluster_id: Optional[str] = None
    
    @property
    def utxo_id(self) -> str:
        return f"{self.txid}:{self.vout}"


class OutputAnalysis(BaseModel):

    address: str
    value_sats: int
    vout: int
    script_type: ScriptType = ScriptType.UNKNOWN
    is_change: bool = False
    change_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    is_new_address: bool = False 
    cluster_id: Optional[str] = None


class CIOHAnalysis(BaseModel):

    applicable: bool = False
    input_addresses: List[str] = Field(default_factory=list)
    cluster_id: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    warning: str = ""
    
    @property
    def is_clustering_applicable(self) -> bool:

        return len(set(self.input_addresses)) >= 2


class TransactionAnalysis(BaseModel):

    txid: str
    tx_type: TransactionType = TransactionType.UNKNOWN
    privacy_score: PrivacyScore = PrivacyScore.UNKNOWN
    
    inputs: List[InputAnalysis] = Field(default_factory=list)
    total_input_value: int = 0
    input_addresses: List[str] = Field(default_factory=list)
    
    outputs: List[OutputAnalysis] = Field(default_factory=list)
    total_output_value: int = 0
    output_addresses: List[str] = Field(default_factory=list)
    
    change_output: Optional[ChangeOutput] = None
    payment_outputs: List[PaymentOutput] = Field(default_factory=list)
    
    cioh: CIOHAnalysis = Field(default_factory=CIOHAnalysis)
    
    fee_sats: int = 0
    fee_rate: float = 0.0
    
    block_height: Optional[int] = None
    timestamp: Optional[datetime] = None
    confirmed: bool = False
    
    has_address_reuse: bool = False
    is_peeling_candidate: bool = False
    warnings: List[str] = Field(default_factory=list)
    
    def analyze_change(self) -> Optional[ChangeOutput]:

        if len(self.outputs) < 2:
            return None
            
        candidates = []
        input_addr_set = set(self.input_addresses)
        
        for out in self.outputs:
            score = 0.0
            heuristics = []
            
            if out.is_new_address:
                score += 0.25
                heuristics.append(ChangeHeuristic.NEW_ADDRESS)
            
            input_scripts = set(inp.script_type for inp in self.inputs)
            if out.script_type in input_scripts:
                score += 0.20
                heuristics.append(ChangeHeuristic.SCRIPT_TYPE_MATCH)
            
            btc_value = out.value_sats / 1e8
            if not self._is_round_value(btc_value):
                score += 0.20
                heuristics.append(ChangeHeuristic.NON_ROUND_VALUE)
            
            if len(self.outputs) == 2:
                other = next(o for o in self.outputs if o.vout != out.vout)
                if out.value_sats < other.value_sats:
                    score += 0.15
                    heuristics.append(ChangeHeuristic.SMALLER_OUTPUT)
            
            if len(self.outputs) == 2:
                score += 0.10
                heuristics.append(ChangeHeuristic.TWO_OUTPUTS)
            
            if out.address in input_addr_set:
                score -= 0.30
                heuristics.append(ChangeHeuristic.INPUT_REUSE)
            
            if score >= 0.4:
                candidates.append((out, score, heuristics))
        
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            best = candidates[0]
            
            self.change_output = ChangeOutput(
                address=best[0].address,
                value_sats=best[0].value_sats,
                confidence=min(best[1], 0.95),  # Nunca 100%
                heuristics=best[2],
                explanation=self._explain_change(best[2], best[1])
            )
            
            # Atualiza o output correspondente
            for out in self.outputs:
                if out.address == self.change_output.address:
                    out.is_change = True
                    out.change_confidence = self.change_output.confidence
            
            return self.change_output
        
        return None
    
    def _is_round_value(self, btc: float) -> bool:
        """Verifica se valor BTC é arredondado (pagamento típico)."""
        # Verifica decimais comuns em pagamentos
        str_val = f"{btc:.8f}"
        decimal_part = str_val.split('.')[1] if '.' in str_val else '00000000'
        
        # Valores como 0.1, 0.5, 1.0, 2.0, 10.0, etc
        round_patterns = ['00000000', '10000000', '50000000', '0000000']
        return any(decimal_part.startswith(p.rstrip('0')) for p in round_patterns)
    
    def _explain_change(self, heuristics: List[ChangeHeuristic], score: float) -> str:
        """Gera explicação para identificação de troco."""
        explanations = []
        if ChangeHeuristic.NEW_ADDRESS in heuristics:
            explanations.append("endereço novo")
        if ChangeHeuristic.SCRIPT_TYPE_MATCH in heuristics:
            explanations.append("mesmo tipo de script")
        if ChangeHeuristic.NON_ROUND_VALUE in heuristics:
            explanations.append("valor não arredondado")
        if ChangeHeuristic.SMALLER_OUTPUT in heuristics:
            explanations.append("valor menor")
        
        confidence_word = "provável" if score < 0.7 else "muito provável"
        return f"Troco {confidence_word}: {', '.join(explanations)}"
    
    def classify_transaction(self) -> TransactionType:
        """Classifica a transação por padrão."""
        n_inputs = len(self.inputs)
        n_outputs = len(self.outputs)
        
        # Detecta CoinJoin
        if self._is_coinjoin_pattern():
            self.tx_type = TransactionType.COINJOIN
            self.privacy_score = PrivacyScore.HIGH
            return self.tx_type
        
        # Simples: 1 input, 2 outputs
        if n_inputs == 1 and n_outputs == 2:
            self.tx_type = TransactionType.SIMPLE
            self.privacy_score = PrivacyScore.LOW
            return self.tx_type
        
        # Peeling chain candidate
        if n_inputs == 1 and n_outputs == 2:
            # Verificar se segue padrão de peeling
            values = sorted([o.value_sats for o in self.outputs], reverse=True)
            if values[0] > values[1] * 10:  # Grande diferença
                self.tx_type = TransactionType.PEELING
                self.is_peeling_candidate = True
                return self.tx_type
        
        # Consolidation: muitos inputs
        if n_inputs >= 5 and n_outputs <= 2:
            self.tx_type = TransactionType.CONSOLIDATION
            return self.tx_type
        
        # Distribution: muitos outputs
        if n_inputs <= 2 and n_outputs >= 5:
            self.tx_type = TransactionType.DISTRIBUTION
            return self.tx_type
        
        self.tx_type = TransactionType.COMPLEX
        return self.tx_type
    
    def _is_coinjoin_pattern(self) -> bool:
        """Detecta padrão CoinJoin (múltiplos outputs de valores similares)."""
        if len(self.outputs) < 3:
            return False
        
        values = [o.value_sats for o in self.outputs]
        if len(values) < 3:
            return False
        
        # Agrupa valores similares (dentro de 10% de variação)
        from collections import defaultdict
        value_groups = defaultdict(list)
        
        for v in values:
            # Usa valor arredondado como chave
            rounded = round(v, -int(len(str(int(v))) * 0.3))  # Arredonda ~30% dos dígitos
            value_groups[rounded].append(v)
        
        # CoinJoin tem múltiplos outputs com valores muito similares
        for group in value_groups.values():
            if len(group) >= 3:
                return True
        
        return False
    
    def apply_cioh(self) -> CIOHAnalysis:
        """Aplica heurística Common Input Ownership."""
        unique_inputs = list(set(self.input_addresses))
        
        self.cioh = CIOHAnalysis(
            applicable=len(unique_inputs) >= 2,
            input_addresses=unique_inputs,
            cluster_id=f"cioh_{self.txid[:16]}",
            confidence=0.85 if len(unique_inputs) >= 2 else 0.0,
            warning=(
                f"CIOH: {len(unique_inputs)} endereços como inputs "
                f"→ provavelmente mesma carteira"
            ) if len(unique_inputs) >= 2 else ""
        )
        
        return self.cioh


class Cluster(BaseModel):
    """Cluster de endereços controlados pela mesma entidade."""
    cluster_id: str
    addresses: List[str] = Field(default_factory=list)
    created_by: List[str] = Field(default_factory=list)  # TXIDs que criaram o cluster
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reason: str = ""
    
    # Metadados
    first_seen_block: Optional[int] = None
    last_seen_block: Optional[int] = None
    total_value_sats: int = 0
    
    def add_address(self, address: str, txid: str) -> None:
        """Adiciona endereço ao cluster se novo."""
        if address not in self.addresses:
            self.addresses.append(address)
        if txid not in self.created_by:
            self.created_by.append(txid)


class EntityCluster(BaseModel):
    """Cluster de entidade conhecida (exchanges, etc)."""
    entity_name: str
    entity_type: str  # exchange, mixer, service, etc
    addresses: List[str] = Field(default_factory=list)
    risk_level: str = "unknown"
    source: str = "known_entity"  # Como foi identificado


class FlowPath(BaseModel):
    """Caminho de fluxo de fundos entre endereços."""
    source: str
    target: str
    path: List[str]  # Lista de TXIDs
    total_value_sats: int
    hops: int
    confidence: float


class ForensicReport(BaseModel):
    """Relatório forense completo."""
    target_address: str
    transactions_analyzed: List[TransactionAnalysis] = Field(default_factory=list)
    clusters: List[Cluster] = Field(default_factory=list)
    entity_clusters: List[EntityCluster] = Field(default_factory=list)
    flow_paths: List[FlowPath] = Field(default_factory=list)
    
    # Resumo
    total_transactions: int = 0
    total_volume_sats: int = 0
    unique_counterparties: int = 0
    
    # Riscos
    privacy_score: PrivacyScore = PrivacyScore.UNKNOWN
    risk_addresses: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    
    def get_cluster_for_address(self, address: str) -> Optional[Cluster]:
        """Retorna cluster que contém o endereço."""
        for cluster in self.clusters:
            if address in cluster.addresses:
                return cluster
        return None
    
    def get_related_addresses(self, address: str) -> List[str]:
        """Retorna endereços relacionados via clustering."""
        cluster = self.get_cluster_for_address(address)
        if cluster:
            return [a for a in cluster.addresses if a != address]
        return []
