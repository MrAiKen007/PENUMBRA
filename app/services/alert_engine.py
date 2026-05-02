import logging
import uuid
from datetime import datetime
from typing import Optional

from app.models.alerts import Alert, AlertType, AlertSeverity, AlertSummary
from app.models.privacy import UTXO, UTXOLabel
from app.services.privacy_engine import get_wallet_utxos
from app.core.bitcoin_rpc import async_rpc_cliente

logger = logging.getLogger(__name__)

DUST_THRESHOLD = 1000
LARGE_AMOUNT_THRESHOLD = 10_000_000


async def scan_for_alerts() -> list[Alert]:
    alerts = []
    utxos = get_wallet_utxos()

    alerts.extend(_check_cioh_risk(utxos))
    alerts.extend(_check_kyc_contamination(utxos))
    alerts.extend(await _check_dust_attacks(utxos))
    alerts.extend(_check_large_unspent(utxos))

    return alerts


def _check_cioh_risk(utxos: list[UTXO]) -> list[Alert]:
    alerts = []
    by_address = {}

    for u in utxos:
        if u.address not in by_address:
            by_address[u.address] = []
        by_address[u.address].append(u)

    for addr, addr_utxos in by_address.items():
        if len(addr_utxos) > 3:
            alerts.append(Alert(
                id=str(uuid.uuid4()),
                type=AlertType.CIOH,
                severity=AlertSeverity.WARNING,
                title="Risco de CIOH detectado",
                message=f"O endereço {addr[:16]}... tem {len(addr_utxos)} UTXOs. Múltiplos UTXOs no mesmo endereço aumentam o risco de análise de blockchain.",
                suggestion="Consolida os UTXOs numa só transacção ou usa coinjoin para melhorar a privacidade.",
                timestamp=datetime.now(),
                address=addr,
            ))

    return alerts


def _check_kyc_contamination(utxos: list[UTXO]) -> list[Alert]:
    alerts = []
    kyc_utxos = [u for u in utxos if u.label == UTXOLabel.KYC]

    if kyc_utxos:
        alerts.append(Alert(
            id=str(uuid.uuid4()),
            type=AlertType.KYC_CONTAMINATION,
            severity=AlertSeverity.CRITICAL,
            title="Contaminação KYC detectada",
            message=f"Tens {len(kyc_utxos)} UTXO(s) com origem KYC na carteira. Estes fundos podem ligar a tua identidade a transacções futuras.",
            suggestion="Usa estes UTXOs KYC sempre sozinhos, nunca combinados com outros. Considera coinjoin para 'limpar' o historial.",
            timestamp=datetime.now(),
        ))

    return alerts


async def _check_dust_attacks(utxos: list[UTXO]) -> list[Alert]:
    alerts = []

    for u in utxos:
        if u.value < DUST_THRESHOLD and u.label not in [UTXOLabel.DOXXIC]:
            alerts.append(Alert(
                id=str(uuid.uuid4()),
                type=AlertType.DUST_ATTACK,
                severity=AlertSeverity.WARNING,
                title="Possível dust attack",
                message=f"UTXO de {u.value} sats detectado em {u.address[:16]}... Pequenos valores podem ser 'dust' usado para rastrear futuras transacções.",
                suggestion="Não gastas este UTXO. Marca-o como 'doxxic' e ignora-o em transacções futuras.",
                timestamp=datetime.now(),
                address=u.address,
            ))

    return alerts


def _check_large_unspent(utxos: list[UTXO]) -> list[Alert]:
    alerts = []

    for u in utxos:
        if u.value > LARGE_AMOUNT_THRESHOLD:
            alerts.append(Alert(
                id=str(uuid.uuid4()),
                type=AlertType.LARGE_AMOUNT,
                severity=AlertSeverity.INFO,
                title="UTXO de valor elevado",
                message=f"UTXO de {u.value_btc:.8f} BTC detectado. Grandes valores atraem atenção indesejada.",
                suggestion="Considera dividir em UTXOs menores ou usar multisig para maior segurança.",
                timestamp=datetime.now(),
                address=u.address,
            ))

    return alerts


async def analyze_transaction(txid: str) -> list[Alert]:
    alerts = []

    try:
        tx = await async_rpc_cliente("getrawtransaction", [txid, True])

        if len(tx.get("vin", [])) > 1:
            alerts.append(Alert(
                id=str(uuid.uuid4()),
                type=AlertType.CIOH,
                severity=AlertSeverity.WARNING,
                title="CIOH na transacção",
                message=f"A transacção {txid[:16]}... combina múltiplos inputs. Por CIOH, todos os inputs são agora ligados.",
                suggestion="No futuro, tenta usar apenas 1 input quando possível.",
                timestamp=datetime.now(),
                txid=txid,
            ))

        total_output = sum(out.get("value", 0) for out in tx.get("vout", []))
        if total_output > LARGE_AMOUNT_THRESHOLD / 1e8:
            alerts.append(Alert(
                id=str(uuid.uuid4()),
                type=AlertType.LARGE_AMOUNT,
                severity=AlertSeverity.INFO,
                title="Transacção de valor elevado",
                message=f"Transacção com {total_output:.8f} BTC. Valores elevados podem ser monitorizados.",
                suggestion="Considera usar multiple hops ou coinjoin para transacções grandes.",
                timestamp=datetime.now(),
                txid=txid,
            ))

        fee_btc = tx.get("fee", 0) if "fee" in tx else 0
        if fee_btc > 0.001:
            alerts.append(Alert(
                id=str(uuid.uuid4()),
                type=AlertType.FEE_ANOMALY,
                severity=AlertSeverity.WARNING,
                title="Fee anormalmente alta",
                message=f"Fee de {fee_btc:.8f} BTC detectada. Verifica se não foi erro.",
                suggestion="Verifica sempre a fee antes de assinar transacções.",
                timestamp=datetime.now(),
                txid=txid,
            ))

    except Exception as e:
        logger.error(f"Erro ao analisar transacção {txid}: {e}")

    return alerts


def get_alert_summary(alerts: list[Alert]) -> AlertSummary:
    by_type = {}
    for a in alerts:
        by_type[a.type.value] = by_type.get(a.type.value, 0) + 1

    return AlertSummary(
        total_alerts=len(alerts),
        critical_count=sum(1 for a in alerts if a.severity == AlertSeverity.CRITICAL),
        warning_count=sum(1 for a in alerts if a.severity == AlertSeverity.WARNING),
        info_count=sum(1 for a in alerts if a.severity == AlertSeverity.INFO),
        by_type=by_type,
        unacknowledged=sum(1 for a in alerts if not a.acknowledged),
    )


async def acknowledge_alert(alert_id: str, alerts: list[Alert]) -> bool:
    for alert in alerts:
        if alert.id == alert_id:
            alert.acknowledged = True
            return True
    return False