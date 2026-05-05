from enum import Enum
from pydantic import BaseModel
from typing import Optional


class NodeType(str, Enum):
    ADDRESS = "address"
    TRANSACTION = "transaction"
    CLUSTER = "cluster"
    ENTITY = "entity"


class NodeRisk(str, Enum):
    SAFE = "safe"
    CAUTION = "caution"
    HIGH = "high"
    CRITICAL = "critical"


class ConnectedAddressInfo(BaseModel):
    """Detailed info about a connected address"""
    address: str
    relationship_type: str
    confidence: float
    transactions: list[dict] = []  # Full transaction details
    total_value_sats: int = 0
    direction: str  # incoming, outgoing, bidirectional
    heuristics: list[str] = []
    is_known_entity: bool = False
    entity_name: Optional[str] = None
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None


class GraphNode(BaseModel):
    id: str
    type: NodeType
    label: str
    risk: NodeRisk = NodeRisk.SAFE
    value_sats: int = 0
    entity_name: Optional[str] = None
    is_watched: bool = False
    cluster_id: Optional[str] = None
    cluster_confidence: Optional[float] = None
    metadata: dict = {}
    # Forensic relationship data
    relationships: list[dict] = []
    transaction_count: int = 0
    total_volume_sats: int = 0
    # Connected addresses with full details
    connected_addresses: list[ConnectedAddressInfo] = []


class GraphEdge(BaseModel):
    source: str
    target: str
    value_sats: int
    txid: str
    is_cioh: bool = False
    label: str = ""
    # Relationship confidence and details
    confidence: float = 1.0
    relationship_type: str = "transaction"
    details: dict = {}

    def model_post_init(self, __context):
        if not self.label:
            self.label = f"{self.value_sats / 1e8:.8f} BTC"


class ClusterInfo(BaseModel):
    cluster_id: str
    addresses: list[str]
    confidence: float
    reason: str
    entity_type: str = "unknown"
    total_value_sats: int = 0


class RelationshipInfo(BaseModel):
    """Detailed relationship between two addresses/clusters"""
    source_address: str
    target_address: str
    relationship_type: str
    confidence: float
    shared_transactions: list[str]
    total_value_transferred: int
    direction: str
    heuristics: list[str]
    details: dict = {}
    privacy_score: str = "unknown"
    risk_level: str = "low"


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    clusters: list[ClusterInfo]
    depth_reached: int
    warnings: list[str]
    stats: dict