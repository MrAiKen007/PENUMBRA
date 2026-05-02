from typing import Optional
from pydantic import BaseModel


class TransactionInput(BaseModel):
    txid: str
    vout: int
    address: str
    value_sats: int
    script_sig: Optional[str] = None
    witness: Optional[list[str]] = None


class TransactionOutput(BaseModel):
    address: str
    value_sats: int
    script_pub_key: Optional[str] = None
    is_change: bool = False


class Transaction(BaseModel):
    txid: str
    version: int = 2
    locktime: int = 0
    size: int = 0
    vsize: int = 0
    fee_sats: int = 0
    inputs: list[TransactionInput]
    outputs: list[TransactionOutput]
    confirmed: bool = False
    block_height: Optional[int] = None
    block_time: Optional[int] = None

    @property
    def total_input_sats(self) -> int:
        return sum(inp.value_sats for inp in self.inputs)

    @property
    def total_output_sats(self) -> int:
        return sum(out.value_sats for out in self.outputs)

    @property
    def fee_rate_sat_vb(self) -> float:
        if self.vsize > 0:
            return self.fee_sats / self.vsize
        return 0.0
