from fastapi import APIRouter, WebSocket, HTTPException
from typing import Optional

from app.models.coin_control import CoinControlRequest
from app.models.alerts import AlertSummary
from app.services.privacy_engine import get_wallet_utxos, calculate_privacy_score, quick_score
from app.services.coin_control import build_transaction, suggest_best_utxos
from app.services.graph_builder import build_traceability_graph
from app.services.alert_engine import scan_for_alerts, get_alert_summary, analyze_transaction
from app.websocket.manager import manager
from app.websocket.alerts import start_alert_monitoring, process_new_transaction

router = APIRouter()


@router.get("/utxos")
async def list_utxos():
    """Lista todos os UTXOs da carteira."""
    utxos = get_wallet_utxos()
    return {"utxos": [u.model_dump() for u in utxos], "count": len(utxos)}


@router.post("/privacy/score")
async def score_utxos(utxo_ids: list[str]):
    """Calcula privacy score para UTXOs selecionados."""
    all_utxos = get_wallet_utxos()
    selected = [u for u in all_utxos if u.utxo_id in utxo_ids]
    score = quick_score(selected)
    return {"score": score, "utxos": [u.utxo_id for u in selected]}


@router.post("/psbt/build")
async def create_psbt(request: CoinControlRequest):
    """Constroi PSBT com UTXOs selecionados."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"PSBT build request: wallet={request.wallet_address}, utxos={len(request.selected_utxo_ids)}, dest={request.destination_address[:20]}..., amount={request.amount_sats}, fee={request.fee_rate}")
    try:
        result = await build_transaction(request)
        return result.model_dump()
    except Exception as e:
        logger.error(f"PSBT build error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/psbt/suggest")
async def suggest_utxos(address: str, amount_sats: int):
    """Sugere melhores UTXOs para transação."""
    suggestion = await suggest_best_utxos(address, amount_sats)
    return suggestion.model_dump()


@router.get("/graph/{address}")
async def get_graph(address: str, depth: int = 2, max_nodes: int = 100):
    """Constroi grafo de rastreabilidade para endereço."""
    graph = await build_traceability_graph(address, depth, max_nodes)
    return graph.model_dump()


@router.get("/wallet/addresses")
async def get_wallet_addresses():
    """Retorna endereços únicos da carteira conectada."""
    from app.services.wallet_service import list_received_by_address, WalletManager
    try:
        current_wallet = WalletManager.get_current_wallet()
        if not current_wallet:
            return {"addresses": []}
        addresses = list_received_by_address(min_conf=0, include_empty=True)
        unique_addresses = []
        seen = set()
        for addr_data in addresses:
            addr = addr_data.get("address")
            if addr and addr not in seen:
                seen.add(addr)
                unique_addresses.append({
                    "address": addr,
                    "label": addr_data.get("label", ""),
                    "txids": addr_data.get("txids", []),
                    "amount": addr_data.get("amount", 0)
                })
        return {"addresses": unique_addresses}
    except Exception as e:
        import traceback
        print(f"Error getting wallet addresses: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/alerts")
async def get_alerts():
    """Lista todos os alertas ativos."""
    alerts = await scan_for_alerts()
    return {"alerts": [a.model_dump() for a in alerts]}


@router.get("/alerts/summary")
async def alerts_summary():
    """Resumo de alertas."""
    alerts = await scan_for_alerts()
    summary = get_alert_summary(alerts)
    return summary.model_dump()


@router.post("/alerts/analyze/{txid}")
async def analyze_tx(txid: str):
    """Analisa transação específica para alertas."""
    alerts = await analyze_transaction(txid)
    return {"txid": txid, "alerts": [a.model_dump() for a in alerts]}


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket para alertas em tempo real."""
    await websocket.accept()
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except:
        await manager.disconnect(websocket)