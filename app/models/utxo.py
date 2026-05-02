from enum import Enum
from typing import Optional
from pydantic import BaseModel


class UTXOLabel(str, Enum):
    SAFE = "safe"
    KYC = "kyc"
    MIXED = "mixed"
    DOXXIC = "doxxic"
    UNKNOWN = "unknown"


class UTXO(BaseModel):
    txid: str
    vout: int
    value: int
    address: str
    label: UTXOLabel = UTXOLabel.UNKNOWN
    confirmed: bool = True
    block_height: Optional[int] = None

    @property
    def value_btc(self) -> float:
        return self.value / 100_000_000

    @property
    def utxo_id(self) -> str:
        return f"{self.txid}:{self.vout}"


class UTXOWithScore(BaseModel):
    utxo: UTXO
    privacy_score: int
    cioh_risk: bool = False
    kyc_linked: bool = False
    suggestions: list[str] = []
