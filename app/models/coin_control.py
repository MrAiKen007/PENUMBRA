from pydantic import BaseModel

class CoinControlRequest(BaseModel):

    wallet_address: str
    selected_utxo_ids: list[str]
    destination_address: str
    amount_sats: int
    change_address: str
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