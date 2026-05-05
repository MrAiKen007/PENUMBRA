from fastapi import APIRouter, WebSocket, HTTPException, Request
from typing import Optional
import json
import logging

from app.models.coin_control import CoinControlRequest
from app.models.alerts import AlertSummary
from app.services.privacy_engine import get_wallet_utxos, calculate_privacy_score, quick_score
from app.services.coin_control import build_transaction, suggest_best_utxos
from app.services.graph_builder import build_traceability_graph
from app.services.forensic_graph_builder import build_forensic_graph
from app.services.forensic_analyzer import analyze_address_forensic
from app.services.alert_engine import scan_for_alerts, get_alert_summary, analyze_transaction
from app.websocket.manager import manager
from app.websocket.alerts import start_alert_monitoring, process_new_transaction

router = APIRouter()
logger = logging.getLogger(__name__)


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
async def create_psbt(req: Request):
    """Constroi PSBT com UTXOs selecionados."""
    body = await req.json()
    logger.info(f"[PSBT BUILD] Raw payload received: {json.dumps(body, indent=2)}")

    try:
        request = CoinControlRequest(**body)
    except Exception as e:
        logger.error(f"[PSBT BUILD] Validation failed: {e}")
        logger.error(f"[PSBT BUILD] Expected schema: wallet_address (str), selected_utxo_ids (list[str]), destination_address (str), amount_sats (int > 0), change_address (str), fee_rate (str|int)")
        raise HTTPException(status_code=422, detail=f"Validation error: {e}")

    logger.info(f"[PSBT BUILD] Validated: wallet={request.wallet_address}, utxos={len(request.selected_utxo_ids)}, dest={request.destination_address[:20]}..., amount={request.amount_sats}, fee={request.fee_rate}")

    try:
        result = await build_transaction(request)
        return result.model_dump()
    except Exception as e:
        logger.error(f"[PSBT BUILD] Transaction build error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/psbt/suggest")
async def suggest_utxos(address: str, amount_sats: int):
    """Sugere melhores UTXOs para transação."""
    suggestion = await suggest_best_utxos(address, amount_sats)
    return suggestion.model_dump()


@router.get("/graph/{address}")
async def get_graph(address: str, depth: int = 2, max_nodes: int = 100, wallet: str = None):
    """Constroi grafo de rastreabilidade para endereço."""
    from app.services.wallet_service import WalletManager, load_wallet
    
    # Validate address - reject invalid/unknown addresses
    if not address or address == 'unknown' or len(address) < 20:
        logger.warning(f"Invalid address rejected: {address}")
        raise HTTPException(status_code=400, detail=f"Invalid address: {address}")
    
    # Load wallet if specified or if current wallet is not set
    if wallet:
        try:
            load_wallet(wallet)
        except Exception as e:
            # Ignore "already loaded" errors - this is expected
            error_str = str(e)
            if "already loaded" in error_str or "-35" in error_str:
                logger.debug(f"Wallet {wallet} already loaded, continuing...")
            else:
                logger.warning(f"Could not load wallet {wallet}: {e}")
    
    current_wallet = WalletManager.get_current_wallet()
    logger.info(f"Building graph for {address} with wallet: {current_wallet}")
    
    graph = await build_traceability_graph(address, depth, max_nodes)
    return graph.model_dump()


@router.get("/graph/{address}/forensic")
async def get_forensic_graph(address: str, depth: int = 2, max_nodes: int = 100, forensic: bool = True, wallet: str = None):
    """
    Constroi grafo com análise forense profissional.
    
    Inclui:
    - Detecção de change addresses
    - Clusterização CIOH
    - Identificação de CoinJoin
    - Scoring de privacidade
    """
    from app.services.wallet_service import WalletManager, load_wallet
    
    # Load wallet if specified
    if wallet:
        try:
            load_wallet(wallet)
        except Exception as e:
            logger.warning(f"Could not load wallet {wallet}: {e}")
    
    try:
        graph_data, forensic_report = await build_forensic_graph(
            address, depth, max_nodes, enable_forensic=forensic
        )
        
        response = {
            "graph": graph_data.model_dump(),
            "forensic": forensic_report.model_dump() if forensic_report else None
        }
        return response
    except Exception as e:
        logger.error(f"Forensic graph error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forensic/analyze/{address}")
async def forensic_analyze(address: str, max_transactions: int = 50, wallet: str = None):
    """
    Análise forense completa de um endereço.
    
    Retorna:
    - Transações analisadas com heurísticas
    - Clusters de entidades
    - Detecção de change addresses
    - Score de privacidade
    - Warnings e riscos
    """
    from app.services.wallet_service import load_wallet
    
    # Load wallet if specified
    if wallet:
        try:
            load_wallet(wallet)
        except Exception as e:
            logger.warning(f"Could not load wallet {wallet}: {e}")
    
    try:
        report = await analyze_address_forensic(address, max_transactions)
        return report.model_dump()
    except Exception as e:
        logger.error(f"Forensic analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wallet/addresses")
async def get_wallet_addresses():
    """Retorna endereços únicos da carteira conectada."""
    from app.services.wallet_service import list_received_by_address, WalletManager, list_transactions
    from app.core.bitcoin_rpc import async_rpc_cliente
    
    try:
        current_wallet = WalletManager.get_current_wallet()
        logger.info(f"[wallet/addresses] Current wallet: {current_wallet}")
        if not current_wallet:
            return {"addresses": []}
        
        # Get addresses from listreceivedbyaddress
        received_addresses = list_received_by_address(min_conf=0, include_empty=True)
        logger.info(f"[wallet/addresses] listreceivedbyaddress returned {len(received_addresses)} addresses")
        for addr_data in received_addresses:
            logger.debug(f"[wallet/addresses] Received: {addr_data.get('address', 'N/A')[:30]}...")
        
        # Get addresses from listtransactions to catch sent addresses
        txs = list_transactions(count=1000)
        logger.info(f"[wallet/addresses] listtransactions returned {len(txs)} txs")
        
        # Combine all addresses
        address_map = {}  # address -> {txids, amount, label}
        
        # Process received addresses
        for addr_data in received_addresses:
            addr = addr_data.get("address")
            if addr:
                address_map[addr] = {
                    "address": addr,
                    "label": addr_data.get("label", ""),
                    "txids": addr_data.get("txids", []),
                    "amount": addr_data.get("amount", 0)
                }
        
        # Process transaction addresses (for sent transactions)
        for tx in txs:
            addr = tx.get("address")
            # Skip invalid addresses
            if not addr or addr == 'unknown' or len(addr) < 20:
                continue
            if addr and addr not in address_map:
                address_map[addr] = {
                    "address": addr,
                    "label": tx.get("label", ""),
                    "txids": [tx.get("txid")] if tx.get("txid") else [],
                    "amount": abs(tx.get("amount", 0))  # Sent amount is negative
                }
            elif addr and addr in address_map:
                # Add txid if not already present
                txid = tx.get("txid")
                if txid and txid not in address_map[addr]["txids"]:
                    address_map[addr]["txids"].append(txid)
        
        # Convert to list and filter only addresses with transactions
        unique_addresses = [
            addr_info for addr_info in address_map.values()
            if addr_info["txids"] and len(addr_info["txids"]) > 0
        ]
        
        logger.info(f"Found {len(unique_addresses)} addresses with transactions")
        return {"addresses": unique_addresses}
    except Exception as e:
        import traceback
        logger.error(f"Error getting wallet addresses: {e}")
        logger.error(traceback.format_exc())
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