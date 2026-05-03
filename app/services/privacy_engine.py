from typing import Optional, List
from app.core.bitcoin_rpc import rpc_cliente
from app.models.privacy import UTXO, UTXOLabel, ScoreBreakdown, PrivacyAlert, PrivacyReport
from app.services.wallet_service import WalletManager

def get_wallet_utxos(wallet_name: Optional[str] = None) -> List[UTXO]:
    try:

        target_wallet = wallet_name or WalletManager.get_current_wallet()
        unspents = rpc_cliente("listunspent", [0, 9999999], wallet=target_wallet)
        utxos = []
        for u in unspents:
            value_sats = int(u["amount"] * 100_000_000)
            core_label = u.get("label", "").lower()
            utxo_label = UTXOLabel.UNKNOWN
            
            if "kyc" in core_label:
                utxo_label = UTXOLabel.KYC
            elif "doxxic" in core_label:
                utxo_label = UTXOLabel.DOXXIC
            elif "safe" in core_label:
                utxo_label = UTXOLabel.SAFE
            elif "mixed" in core_label:
                utxo_label = UTXOLabel.MIXED

            utxos.append(UTXO(
                txid=u["txid"],
                vout=u["vout"],
                value=value_sats,
                address=u["address"],
                label=utxo_label,
                confirmed=(u["confirmations"] > 0)
            ))
        return utxos
    except Exception as e:
        print(f"Erro ao obter UTXOs do Bitcoin Core: {e}")
        return []

def count_address_appearances(address: str, all_wallet_utxos: Optional[list[UTXO]] = None) -> int:
    try:
        received = rpc_cliente("listreceivedbyaddress", [0, True, True, address])
        if received and len(received) > 0:
            return len(received[0].get("txids", []))
        return 0
    except Exception:
        if all_wallet_utxos:
            return sum(1 for utxo in all_wallet_utxos if utxo.address == address)
        return 0

def calculate_estimated_fee(num_inputs: int, num_outputs: int) -> int:

    try:
        fee_info = rpc_cliente("estimatesmartfee", [2])
        fee_rate_btc_kvb = fee_info.get("feerate", 0.00010000)
        fee_rate_sat_vb = int(fee_rate_btc_kvb * 100_000)
    except Exception:
        fee_rate_sat_vb = 10

    estimated_vbytes = (num_inputs * 148) + (num_outputs * 34) + 10
    return estimated_vbytes * fee_rate_sat_vb


def has_kyc_utxo(utxos: list[UTXO]) -> bool:
    return any(u.label == UTXOLabel.KYC for u in utxos)

def has_mixed_labels(utxos: list[UTXO]) -> bool:
    labels = {u.label for u in utxos}
    meaningful_labels = labels - {UTXOLabel.UNKNOWN}
    return len(meaningful_labels) > 1

def is_round_amount(amount_sats: int) -> bool:
    return amount_sats % 100_000 == 0 and amount_sats >= 1_000_000


def calculate_privacy_score(
    selected_utxos: list[UTXO],
    destination_address: str,
    change_address: str,
    send_amount_sats: int,
    all_wallet_utxos: Optional[list[UTXO]] = None,
) -> PrivacyReport:

    if not selected_utxos:
        raise ValueError("Pelo menos 1 UTXO deve ser seleccionado.")

    breakdown = ScoreBreakdown()
    alerts: list[PrivacyAlert] = []
    suggestions: list[str] = []

    if all_wallet_utxos is None:
        all_wallet_utxos = get_wallet_utxos()

    if len(selected_utxos) > 1:
        penalty = min(25, (len(selected_utxos) - 1) * 10)
        breakdown.cioh_penalty = penalty
        alerts.append(PrivacyAlert(
            severity="warning",
            title="Múltiplos inputs detectados",
            message=(
                f"Estás a combinar {len(selected_utxos)} UTXOs numa só transacção. "
                f"Qualquer analista de blockchain vai assumir que todos pertencem "
                f"à mesma carteira — e terá razão."
            ),
            suggestion=(
                "Usa apenas 1 UTXO se o valor for suficiente. "
                "Se precisares de múltiplos, considera fazer transacções separadas."
            )
        ))
        suggestions.append(
            f"Verifica se algum dos teus UTXOs cobre os "
            f"{send_amount_sats / 100_000_000:.8f} BTC sozinho."
        )

    change_appearances = count_address_appearances(change_address, all_wallet_utxos)
    if change_appearances > 0:
        breakdown.address_reuse_penalty = 30
        alerts.append(PrivacyAlert(
            severity="critical",
            title="Reutilização de endereço de troco",
            message=(
                f"O endereço de troco '{change_address[:12]}...' "
                f"já foi usado {change_appearances} vez(es) on-chain. "
                f"Isto liga todas as tuas transacções passadas e futuras."
            ),
            suggestion=(
                "Pede ao teu nó Bitcoin Core para gerar um novo endereço de troco. "
                "Nunca uses o mesmo endereço duas vezes."
            )
        ))
        suggestions.append(
            "Usa um endereço de troco fresco gerado com 'getnewaddress' ou 'getrawchangeaddress' no Bitcoin Core."
        )

    if has_kyc_utxo(selected_utxos) and len(selected_utxos) > 1:
        breakdown.kyc_contamination_penalty = 20
        kyc_count = sum(1 for u in selected_utxos if u.label == UTXOLabel.KYC)
        alerts.append(PrivacyAlert(
            severity="critical",
            title="Contaminação KYC detectada",
            message=(
                f"Tens {kyc_count} UTXO(s) KYC nos teus inputs. "
                f"Ao combiná-los com outros UTXOs, estás a revelar que "
                f"todos os inputs pertencem à mesma pessoa identificada."
            ),
            suggestion=(
                "Usa UTXOs KYC SEMPRE sozinhos, nunca combinados com outros. "
                "Se quiseres 'limpar' um UTXO KYC, usa coinjoin antes de o gastar."
            )
        ))

    input_addresses = {utxo.address for utxo in selected_utxos}
    if change_address in input_addresses:
        breakdown.change_exposure_penalty = 15
        alerts.append(PrivacyAlert(
            severity="warning",
            title="Endereço de troco exposto",
            message=(
                "O endereço de troco é igual a um dos teus inputs. "
                "Isto confirma sem margem de dúvida qual output é o troco, "
                "facilitando o rastreio das tuas transacções futuras."
            ),
            suggestion="Gera sempre um endereço de troco diferente de todos os teus inputs."
        ))

    if is_round_amount(send_amount_sats):
        breakdown.round_amount_penalty = 10
        alerts.append(PrivacyAlert(
            severity="info",
            title="Valor de envio redondo",
            message=(
                f"Estás a enviar {send_amount_sats / 100_000_000:.8f} BTC — "
                f"um valor redondo. Isso torna óbvio qual output é o pagamento "
                f"e qual é o troco, facilitando o rastreio."
            ),
            suggestion=(
                "Se possível, ajusta o valor para algo menos redondo "
                "(ex: em vez de 0.1 BTC, envia 0.09873 BTC)."
            )
        ))

    score = breakdown.final_score
    label = PrivacyReport.label_from_score(score)

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: severity_order.get(a.severity, 99))

    if breakdown.cioh_penalty > 0:
        best_single_utxo = max(selected_utxos, key=lambda u: u.value)
        if best_single_utxo.value >= send_amount_sats:
            suggestions.insert(0,
                f"Usa apenas o UTXO de {best_single_utxo.value_btc:.8f} BTC. "
                f"É suficiente para cobrir o envio e aumenta o score para "
                f"{min(100, score + breakdown.cioh_penalty)}/100."
            )

    return PrivacyReport(
        score=score,
        label=label,
        breakdown=breakdown,
        alerts=alerts,
        suggestions=suggestions,
        is_safe_to_send=score >= 70,
    )

def quick_score(utxos: list[UTXO]) -> int:
    if not utxos:
        return 100

    score = 100
    if len(utxos) > 1:
        score -= min(25, (len(utxos) - 1) * 10)
    if has_kyc_utxo(utxos) and len(utxos) > 1:
        score -= 20
    if has_mixed_labels(utxos):
        score -= 10
    return max(0, score)