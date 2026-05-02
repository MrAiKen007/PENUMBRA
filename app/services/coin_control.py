import logging
from app.core.bitcoin_rpc import build_psbt, async_rpc_cliente, rpc_cliente
from app.models.coin_control import (
    CoinControlRequest, FeeEstimate, CoinControlResult,
    UTXOSelectionSuggestion, InsufficientFundsError, InvalidUTXOError,
    DustOutputError, DUST_LIMIT_SATS
)
from app.models.privacy import UTXO, UTXOLabel
from app.services.privacy_engine import (
    get_wallet_utxos, calculate_privacy_score, quick_score, calculate_estimated_fee
)

logger = logging.getLogger(__name__)


async def estimate_fee_bitcoin_core(
    num_inputs: int,
    num_outputs: int = 2,
    fee_rate: str | int = "medium"
) -> FeeEstimate:

    try:
        fee_info = await async_rpc_cliente("estimatesmartfee", [6])
        fee_rate_btc_kvb = fee_info.get("feerate", 0.00010000)
        rate = int(fee_rate_btc_kvb * 100_000)
    except Exception:
        rate = 10

    if isinstance(fee_rate, str):
        multiplier = {"fast": 2.0, "medium": 1.0, "slow": 0.5}
        rate = int(rate * multiplier.get(fee_rate, 1.0))

    estimated_vbytes = (num_inputs * 68) + (num_outputs * 31) + 10
    total_fee = estimated_vbytes * rate

    time_map = {30: 10, 20: 30, 10: 60, 5: 120}
    estimated_minutes = time_map.get(rate, 60)

    return FeeEstimate(
        total_fee_sats=total_fee,
        fee_rate_sat_vb=rate,
        estimated_vbytes=estimated_vbytes,
        estimated_minutes=estimated_minutes,
    )


def validate_selection(
    selected_utxos: list[UTXO],
    amount_sats: int,
    fee_sats: int,
) -> tuple[int, int]:

    total_input = sum(u.value for u in selected_utxos)
    total_needed = amount_sats + fee_sats
    change = total_input - total_needed

    if total_input < total_needed:
        raise InsufficientFundsError(
            f"Fundos insuficientes: tens {total_input} sats, "
            f"precisas de {total_needed} sats (envio + fee)."
        )

    if 0 < change < DUST_LIMIT_SATS:
        raise DustOutputError(
            f"O troco seria de {change} sats — inferior ao dust limit ({DUST_LIMIT_SATS} sats). "
            f"Aumenta ligeiramente o valor de envio ou aceita perder o troco na fee."
        )

    return total_input, max(0, change)


def build_psbt_bitcoin_core(
    selected_utxos: list[UTXO],
    destination_address: str,
    amount_sats: int,
    change_address: str,
    change_sats: int,
) -> tuple[str, str]:

    inputs = [{"txid": u.txid, "vout": u.vout} for u in selected_utxos]
    
    outputs = {destination_address: amount_sats / 100_000_000}
    if change_sats > DUST_LIMIT_SATS:
        outputs[change_address] = change_sats / 100_000_000

    psbt_hex = build_psbt(inputs, outputs)
    
    txid_preview = "preview_nao_disponivel"
    
    return psbt_hex, txid_preview


async def build_transaction(request: CoinControlRequest) -> CoinControlResult:

    all_utxos = get_wallet_utxos()
    utxo_map = {u.utxo_id: u for u in all_utxos}

    selected_utxos = []
    for utxo_id in request.selected_utxo_ids:
        utxo = utxo_map.get(utxo_id)
        if not utxo:
            raise InvalidUTXOError(
                f"UTXO '{utxo_id}' não encontrado na carteira. "
                f"Pode ter sido gasto entretanto."
            )
        selected_utxos.append(utxo)

    logger.info(
        f"Construindo tx: {len(selected_utxos)} inputs → "
        f"{request.amount_sats} sats para {request.destination_address[:16]}..."
    )

    fee_estimate = await estimate_fee_bitcoin_core(
        num_inputs=len(selected_utxos),
        num_outputs=2,
        fee_rate=request.fee_rate,
    )

    total_input, change_sats = validate_selection(
        selected_utxos=selected_utxos,
        amount_sats=request.amount_sats,
        fee_sats=fee_estimate.total_fee_sats,
    )

    privacy_report = calculate_privacy_score(
        selected_utxos=selected_utxos,
        destination_address=request.destination_address,
        change_address=request.change_address,
        send_amount_sats=request.amount_sats,
        all_wallet_utxos=all_utxos,
    )

    psbt_hex, txid_preview = build_psbt_bitcoin_core(
        selected_utxos=selected_utxos,
        destination_address=request.destination_address,
        amount_sats=request.amount_sats,
        change_address=request.change_address,
        change_sats=change_sats,
    )

    return CoinControlResult(
        psbt_hex=psbt_hex,
        txid_preview=txid_preview,
        inputs=[
            {"utxo_id": u.utxo_id, "value_sats": u.value, "address": u.address, "label": u.label}
            for u in selected_utxos
        ],
        outputs=[
            {"address": request.destination_address, "value_sats": request.amount_sats, "type": "payment"},
            {"address": request.change_address, "value_sats": change_sats, "type": "change"},
        ],
        fee_estimate=fee_estimate,
        privacy_score=privacy_report.score,
        privacy_label=privacy_report.label,
        total_input_sats=total_input,
        change_sats=change_sats,
    )


async def suggest_best_utxos(
    wallet_address: str,
    amount_sats: int,
) -> UTXOSelectionSuggestion:

    all_utxos = get_wallet_utxos()
    fee_estimate = await estimate_fee_bitcoin_core(num_inputs=1, num_outputs=2)
    total_needed = amount_sats + fee_estimate.total_fee_sats

    usable = [
        u for u in all_utxos
        if u.confirmed and u.label not in [UTXOLabel.DOXXIC]
    ]

    if not usable:
        return UTXOSelectionSuggestion(
            suggested_utxo_ids=[],
            privacy_score=0,
            total_value_sats=0,
            reasoning="Não há UTXOs disponíveis para esta transacção.",
        )

    safe_utxos = sorted(
        [u for u in usable if u.label == UTXOLabel.SAFE and u.value >= total_needed],
        key=lambda u: u.value
    )

    if safe_utxos:
        best = safe_utxos[0]
        return UTXOSelectionSuggestion(
            suggested_utxo_ids=[best.utxo_id],
            privacy_score=quick_score([best]),
            total_value_sats=best.value,
            reasoning=(
                f"Usa apenas o UTXO de {best.value_btc:.8f} BTC — "
                f"é suficiente sozinho e tem historial limpo. "
                f"Score de privacidade: máximo."
            ),
        )

    safe_sorted = sorted(
        [u for u in usable if u.label == UTXOLabel.SAFE],
        key=lambda u: u.value,
        reverse=True
    )

    selected = []
    accumulated = 0
    for utxo in safe_sorted:
        selected.append(utxo)
        accumulated += utxo.value
        if accumulated >= total_needed:
            break

    if accumulated >= total_needed:
        score = quick_score(selected)
        return UTXOSelectionSuggestion(
            suggested_utxo_ids=[u.utxo_id for u in selected],
            privacy_score=score,
            total_value_sats=accumulated,
            reasoning=(
                f"Combinação mínima de {len(selected)} UTXOs safe "
                f"para cobrir o valor. Score de privacidade: {score}/100. "
                f"Considera fazer o envio em dois momentos diferentes para melhorar."
            ),
        )

    return UTXOSelectionSuggestion(
        suggested_utxo_ids=[u.utxo_id for u in usable[:2]],
        privacy_score=quick_score(usable[:2]),
        total_value_sats=sum(u.value for u in usable[:2]),
        reasoning=(
            "Fundos safe insuficientes. Considera aguardar receber mais "
            "fundos num endereço limpo antes de fazer esta transacção."
        ),
    )