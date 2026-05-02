from enum import Enum
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertType(str, Enum):
    CIOH = "cioh"
    ADDRESS_REUSE = "address_reuse"
    KYC_CONTAMINATION = "kyc_contamination"
    PEELING_CHAIN = "peeling_chain"
    DUST_ATTACK = "dust_attack"
    LARGE_AMOUNT = "large_amount"
    FEE_ANOMALY = "fee_anomaly"
    ENTITY_DETECTED = "entity_detected"
    CHANGE_EXPOSED = "change_exposed"


class Alert(BaseModel):
    id: str
    type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    suggestion: str
    timestamp: datetime
    txid: Optional[str] = None
    address: Optional[str] = None
    acknowledged: bool = False
    metadata: dict = {}


class AlertSummary(BaseModel):
    total_alerts: int
    critical_count: int
    warning_count: int
    info_count: int
    by_type: dict[str, int]
    unacknowledged: int