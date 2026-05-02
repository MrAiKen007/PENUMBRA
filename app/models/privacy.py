from pydantic import BaseModel
from app.models.utxo import UTXO, UTXOLabel


class ScoreBreakdown(BaseModel):
    base_score: int = 100
    cioh_penalty: int = 0
    address_reuse_penalty: int = 0
    kyc_contamination_penalty: int = 0
    change_exposure_penalty: int = 0
    round_amount_penalty: int = 0

    @property
    def total_penalty(self) -> int:
        return (
            self.cioh_penalty +
            self.address_reuse_penalty +
            self.kyc_contamination_penalty +
            self.change_exposure_penalty +
            self.round_amount_penalty
        )

    @property
    def final_score(self) -> int:
        return max(0, self.base_score - self.total_penalty)

class PrivacyAlert(BaseModel):
    severity: str
    title: str
    message: str
    suggestion: str

class PrivacyReport(BaseModel):
    score: int
    label: str
    breakdown: ScoreBreakdown
    alerts: list[PrivacyAlert]
    suggestions: list[str]
    is_safe_to_send: bool

    @classmethod
    def label_from_score(cls, score: int) -> str:
        if score >= 80:
            return "Seguro"
        elif score >= 50:
            return "Cuidado"
        else:
            return "Exposto"