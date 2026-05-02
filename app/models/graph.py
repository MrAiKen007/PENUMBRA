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


class GraphNode(BaseModel):
    id: str
    type: NodeType
    label: str
    risk: NodeRisk = NodeRisk.SAFE
    value_sats: int = 0
    entity_name: Optional[str] = None
    is_watched: bool = False
    metadata: dict = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    value_sats: int
    txid: str
    is_cioh: bool = False
    label: str = ""

    def model_post_init(self, __context):
        if not self.label:
            self.label = f"{self.value_sats / 1e8:.8f} BTC"


class ClusterInfo(BaseModel):
    cluster_id: str
    addresses: list[str]
    confidence: float
    reason: str


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    clusters: list[ClusterInfo]
    depth_reached: int
    warnings: list[str]
    stats: dict