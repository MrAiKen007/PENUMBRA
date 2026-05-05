from pydantic import BaseModel, Field

class CoinControlRequest(BaseModel):

    wallet_address: str = Field(..., min_length=1)
    selected_utxo_ids: list[str] = Field(..., min_length=1)
    destination_address: str = Field(..., min_length=1)
    amount_sats: int = Field(..., gt=0)
    change_address: str = Field(..., min_length=1)
    fee_rate: str | int = "medium"


class FeeEstimate(BaseModel):

    total_fee_sats: int
    fee_rate_sat_vb: int
    estimated_vbytes: int
    estimated_minutes: int


class CoinControlResult(BaseModel):

    psbt_hex: str
    txid_preview: str
    inputs: list[dict]
    outputs: list[dict]
    fee_estimate: FeeEstimate
    privacy_score: int
    privacy_label: str
    total_input_sats: int
    change_sats: int


class UTXOSelectionSuggestion(BaseModel):

    suggested_utxo_ids: list[str]
    privacy_score: int
    total_value_sats: int
    reasoning: str


class InsufficientFundsError(Exception):
    pass


class InvalidUTXOError(Exception):
    pass


class DustOutputError(Exception):
    pass


DUST_LIMIT_SATS = 546