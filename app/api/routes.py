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
    utxos = get_wallet_utxos()
    return {"utxos": [u.model_dump() for u in utxos], "count": len(utxos)}


@router.post("/privacy/score")
async def score_utxos(utxo_ids: list[str]):
    all_utxos = get_wallet_utxos()
    selected = [u for u in all_utxos if u.utxo_id in utxo_ids]
    score = quick_score(selected)
    return {"score": score, "utxos": [u.utxo_id for u in selected]}


@router.post("/psbt/build")
async def create_psbt(req: Request):
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
    suggestion = await suggest_best_utxos(address, amount_sats)
    return suggestion.model_dump()


@router.get("/graph/{address}")
async def get_graph(address: str, depth: int = 2, max_nodes: int = 100, wallet: str = None):
    from app.services.wallet_service import WalletManager, load_wallet
    
    if not address or address == 'unknown' or len(address) < 20:
        logger.warning(f"Invalid address rejected: {address}")
        raise HTTPException(status_code=400, detail=f"Invalid address: {address}")
    

    if wallet:
        try:
            load_wallet(wallet)
        except Exception as e:

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
    from app.services.wallet_service import WalletManager, load_wallet

    if wallet:
        try:
            load_wallet(wallet)
        except Exception as e:
            error_str = str(e)
            if "already loaded" in error_str.lower() or "-35" in error_str:
                logger.debug(f"Wallet {wallet} already loaded, continuing...")
            else:
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
    from app.services.wallet_service import load_wallet

    if wallet:
        try:
            load_wallet(wallet)
        except Exception as e:
            error_str = str(e)
            if "already loaded" in error_str.lower() or "-35" in error_str:
                logger.debug(f"Wallet {wallet} already loaded, continuing...")
            else:
                logger.warning(f"Could not load wallet {wallet}: {e}")

    try:
        report = await analyze_address_forensic(address, max_transactions)
        return report.model_dump()
    except Exception as e:
        logger.error(f"Forensic analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wallet/addresses")
async def get_wallet_addresses():
    from app.services.wallet_service import list_received_by_address, WalletManager, list_transactions
    from app.core.bitcoin_rpc import async_rpc_cliente
    
    try:
        current_wallet = WalletManager.get_current_wallet()
        logger.info(f"[wallet/addresses] Current wallet: {current_wallet}")
        if not current_wallet:
            return {"addresses": []}
        
        received_addresses = list_received_by_address(min_conf=0, include_empty=True)
        logger.info(f"[wallet/addresses] listreceivedbyaddress returned {len(received_addresses)} addresses")
        for addr_data in received_addresses:
            logger.debug(f"[wallet/addresses] Received: {addr_data.get('address', 'N/A')[:30]}...")
        
        txs = list_transactions(count=1000)
        logger.info(f"[wallet/addresses] listtransactions returned {len(txs)} txs")
        
        address_map = {}
        
        for addr_data in received_addresses:
            addr = addr_data.get("address")
            if addr:
                address_map[addr] = {
                    "address": addr,
                    "label": addr_data.get("label", ""),
                    "txids": addr_data.get("txids", []),
                    "amount": addr_data.get("amount", 0)
                }
        
        for tx in txs:
            addr = tx.get("address")
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
                txid = tx.get("txid")
                if txid and txid not in address_map[addr]["txids"]:
                    address_map[addr]["txids"].append(txid)
        
        unique_addresses = list(address_map.values())
        
        if not unique_addresses:
            try:
                from app.services.wallet_service import rpc_cliente
                all_addrs = rpc_cliente("getaddressesbylabel", [{}], wallet=current_wallet)
                for addr in all_addrs.keys():
                    unique_addresses.append({
                        "address": addr,
                        "label": "",
                        "txids": [],
                        "amount": 0
                    })
            except Exception as e:
                logger.debug(f"Could not get addresses by label: {e}")
        
        logger.info(f"Found {len(unique_addresses)} addresses total")
        return {"addresses": unique_addresses}
    except Exception as e:
        import traceback
        logger.error(f"Error getting wallet addresses: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/alerts")
async def get_alerts():
    alerts = await scan_for_alerts()
    return {"alerts": [a.model_dump() for a in alerts]}


@router.get("/alerts/summary")
async def alerts_summary():
    alerts = await scan_for_alerts()
    summary = get_alert_summary(alerts)
    return summary.model_dump()


@router.post("/alerts/analyze/{txid}")
async def analyze_tx(txid: str):
    alerts = await analyze_transaction(txid)
    return {"txid": txid, "alerts": [a.model_dump() for a in alerts]}


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    await websocket.accept()
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except:
        await manager.disconnect(websocket)


from pydantic import BaseModel
from typing import Literal
from app.db import get_db, create_or_update_entity, get_entity, get_all_entities, delete_entity, search_entities
import re


def validate_bitcoin_address(address: str) -> bool:
    if not address or len(address) < 26:
        return False

    patterns = [
        r'^1[a-km-zA-HJ-NP-Z1-9]{25,34}$',
        r'^3[a-km-zA-HJ-NP-Z1-9]{25,34}$',
        r'^bc1[ac-hj-np-z02-9]{11,71}$',
        r'^tb1[ac-hj-np-z02-9]{11,71}$',
        r'^bcrt1[ac-hj-np-z02-9]{11,71}$',
    ]

    return any(re.match(pattern, address) for pattern in patterns)


class EntityCreate(BaseModel):
    address: str
    name: str
    entity_type: Literal["exchange", "mixer", "gambling", "kyc", "service", "unknown"]
    risk_level: Literal["safe", "medium", "high", "critical"] = "medium"
    notes: Optional[str] = None


class EntityResponse(BaseModel):
    address: str
    name: str
    entity_type: str
    risk_level: str
    source: str
    notes: Optional[str]
    confidence: float
    created_at: Optional[str] = None


@router.post("/entities", response_model=EntityResponse)
async def create_entity(entity: EntityCreate):
    if not validate_bitcoin_address(entity.address):
        raise HTTPException(
            status_code=400,
            detail="Endereço Bitcoin inválido. Formatos aceites: 1... (P2PKH), 3... (P2SH), bc1... (Bech32), tb1... (testnet), bcrt1... (regtest)"
        )

    try:
        async for db in get_db():
            db_entity = await create_or_update_entity(
                db=db,
                address=entity.address,
                name=entity.name,
                entity_type=entity.entity_type,
                risk_level=entity.risk_level,
                source="user",
                notes=entity.notes,
                confidence=1.0
            )
            return EntityResponse(
                address=db_entity.address,
                name=db_entity.name,
                entity_type=db_entity.entity_type,
                risk_level=db_entity.risk_level,
                source=db_entity.source,
                notes=db_entity.notes,
                confidence=db_entity.confidence,
                created_at=str(db_entity.created_at) if db_entity.created_at else None
            )
    except Exception as e:
        logger.error(f"Error creating entity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entities", response_model=list[EntityResponse])
async def list_entities(
    entity_type: Optional[str] = None,
    risk_level: Optional[str] = None,
    limit: int = 1000
):
    try:
        async for db in get_db():
            entities = await get_all_entities(db, entity_type, risk_level, limit)
            return [
                EntityResponse(
                    address=e.address,
                    name=e.name,
                    entity_type=e.entity_type,
                    risk_level=e.risk_level,
                    source=e.source,
                    notes=e.notes,
                    confidence=e.confidence,
                    created_at=str(e.created_at) if e.created_at else None
                )
                for e in entities
            ]
    except Exception as e:
        logger.error(f"Error listing entities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entities/{address}", response_model=EntityResponse)
async def get_entity_by_address(address: str):
    try:
        async for db in get_db():
            entity = await get_entity(db, address)
            if not entity:
                raise HTTPException(status_code=404, detail="Entity not found")
            return EntityResponse(
                address=entity.address,
                name=entity.name,
                entity_type=entity.entity_type,
                risk_level=entity.risk_level,
                source=entity.source,
                notes=entity.notes,
                confidence=entity.confidence,
                created_at=str(entity.created_at) if entity.created_at else None
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/entities/{address}")
async def delete_entity_by_address(address: str):
    try:
        async for db in get_db():
            deleted = await delete_entity(db, address)
            if not deleted:
                raise HTTPException(status_code=404, detail="Entity not found")
            return {"message": "Entity deleted successfully", "address": address}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting entity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entities/search/{query}", response_model=list[EntityResponse])
async def search_entities_endpoint(query: str, limit: int = 50):
    try:
        async for db in get_db():
            entities = await search_entities(db, query, limit)
            return [
                EntityResponse(
                    address=e.address,
                    name=e.name,
                    entity_type=e.entity_type,
                    risk_level=e.risk_level,
                    source=e.source,
                    notes=e.notes,
                    confidence=e.confidence,
                    created_at=str(e.created_at) if e.created_at else None
                )
                for e in entities
            ]
    except Exception as e:
        logger.error(f"Error searching entities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from app.db import (
    get_pending_reviews, get_pending_review,
    label_pending_review, dismiss_pending_review, count_pending_reviews,
    create_or_update_entity,
)
from app.services.graph_builder import invalidate_entity_cache


class PendingReviewResponse(BaseModel):
    address: str
    status: str
    detection_source: Optional[str]
    context: Optional[dict]
    suggested_type: Optional[str]
    suggested_reason: Optional[str]
    created_at: Optional[str]


class LabelReviewRequest(BaseModel):
    name: str
    entity_type: Literal["exchange", "mixer", "gambling", "kyc", "service", "unknown"]
    risk_level: Literal["safe", "medium", "high", "critical"] = "high"
    notes: Optional[str] = None


@router.get("/reviews/pending", response_model=list[PendingReviewResponse])
async def list_pending_reviews(limit: int = 100):
    try:
        async for db in get_db():
            reviews = await get_pending_reviews(db, status="pending", limit=limit)
            return [
                PendingReviewResponse(
                    address=r.address,
                    status=r.status,
                    detection_source=r.detection_source,
                    context=r.context,
                    suggested_type=r.suggested_type,
                    suggested_reason=r.suggested_reason,
                    created_at=str(r.created_at) if r.created_at else None,
                )
                for r in reviews
            ]
    except Exception as e:
        logger.error(f"Error listing pending reviews: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reviews/pending/count")
async def count_pending():
    try:
        async for db in get_db():
            count = await count_pending_reviews(db)
            return {"pending_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reviews/pending/{address}/label", response_model=EntityResponse)
async def label_review(address: str, req: LabelReviewRequest):
    if not validate_bitcoin_address(address):
        raise HTTPException(
            status_code=400,
            detail="Endereço Bitcoin inválido"
        )

    try:
        async for db in get_db():
            review = await label_pending_review(
                db=db,
                address=address,
                entity_type=req.entity_type,
                name=req.name,
                risk_level=req.risk_level,
                notes=req.notes,
            )
            if not review:
                raise HTTPException(status_code=404, detail="Revisão pendente não encontrada")

            entity = await create_or_update_entity(
                db=db,
                address=address,
                name=req.name,
                entity_type=req.entity_type,
                risk_level=req.risk_level,
                source="user_review",
                notes=req.notes,
                confidence=1.0,
            )

            invalidate_entity_cache()

            logger.info(
                f"Endereço {address[:20]}... classificado como '{req.entity_type}' "
                f"(KYC={req.entity_type == 'kyc'}) pelo utilizador"
            )

            return EntityResponse(
                address=entity.address,
                name=entity.name,
                entity_type=entity.entity_type,
                risk_level=entity.risk_level,
                source=entity.source,
                notes=entity.notes,
                confidence=entity.confidence,
                created_at=str(entity.created_at) if entity.created_at else None,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error labeling review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reviews/pending/{address}/dismiss")
async def dismiss_review(address: str):
    """
    Descarta a revisão de um endereço sem classificar.
    Use quando não souber o que é o endereço ou quando não for relevante.
    O endereço NÃO é guardado como entidade — continua desconhecido.
    """
    try:
        async for db in get_db():
            dismissed = await dismiss_pending_review(db, address)
            if not dismissed:
                raise HTTPException(status_code=404, detail="Revisão pendente não encontrada")
            return {"message": "Revisão descartada", "address": address}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reviews/history", response_model=list[PendingReviewResponse])
async def list_review_history(status: str = "labeled", limit: int = 100):
    """
    Lista histórico de revisões por estado: 'labeled' ou 'dismissed'.
    """
    if status not in ("labeled", "dismissed", "pending"):
        raise HTTPException(status_code=400, detail="Status deve ser: pending, labeled ou dismissed")
    try:
        async for db in get_db():
            reviews = await get_pending_reviews(db, status=status, limit=limit)
            return [
                PendingReviewResponse(
                    address=r.address,
                    status=r.status,
                    detection_source=r.detection_source,
                    context=r.context,
                    suggested_type=r.suggested_type,
                    suggested_reason=r.suggested_reason,
                    created_at=str(r.created_at) if r.created_at else None,
                )
                for r in reviews
            ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/address/{address}/utxos")
async def get_address_utxos(address: str):
    """
    Retorna UTXOs de qualquer endereço Bitcoin público.
    Não requer carteira - funciona com endereços externos.
    Usa mempool API ou scantxoutset do Bitcoin Core.
    """
    import httpx
    from app.config import settings
    from app.models.utxo import UTXO, UTXOLabel

    logger.info(f"[address/utxos] Fetching UTXOs for external address: {address[:30]}...")

    # Validate address format
    if not address or len(address) < 20:
        raise HTTPException(status_code=400, detail="Endereço inválido")

    utxos = []

    # Try mempool API first (works for any address)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch address info from mempool
            url = f"{settings.MEMPOOL_API_URL}/address/{address}"
            response = await client.get(url)
            response.raise_for_status()
            addr_info = response.json()

            # Get UTXOs from chain_stats
            chain_stats = addr_info.get("chain_stats", {})
            funded_txo_count = chain_stats.get("funded_txo_count", 0)

            if funded_txo_count > 0:
                # Fetch UTXOs
                utxos_url = f"{settings.MEMPOOL_API_URL}/address/{address}/utxo"
                utxos_response = await client.get(utxos_url)
                utxos_response.raise_for_status()
                mempool_utxos = utxos_response.json()

                for u in mempool_utxos:
                    utxos.append(UTXO(
                        txid=u["txid"],
                        vout=u["vout"],
                        value=u["value"],
                        address=address,
                        label=UTXOLabel.UNKNOWN,
                        confirmed=(u.get("status", {}).get("confirmed", False))
                    ))

                logger.info(f"[address/utxos] Found {len(utxos)} UTXOs via mempool API")
                return {
                    "address": address,
                    "utxos": [u.model_dump() for u in utxos],
                    "count": len(utxos),
                    "source": "mempool_api"
                }
    except Exception as e:
        logger.warning(f"[address/utxos] Mempool API failed: {e}")

    # Fallback to Bitcoin Core scantxoutset
    try:
        from app.core.bitcoin_rpc import async_rpc_cliente
        scan_result = await async_rpc_cliente("scantxoutset", ["start", [f"addr({address})"]])

        if scan_result and scan_result.get("success"):
            for u in scan_result.get("unspents", []):
                utxos.append(UTXO(
                    txid=u["txid"],
                    vout=u["vout"],
                    value=int(u["amount"] * 100_000_000),
                    address=address,
                    label=UTXOLabel.UNKNOWN,
                    confirmed=True
                ))

            logger.info(f"[address/utxos] Found {len(utxos)} UTXOs via scantxoutset")
            return {
                "address": address,
                "utxos": [u.model_dump() for u in utxos],
                "count": len(utxos),
                "source": "scantxoutset"
            }
    except Exception as e:
        logger.warning(f"[address/utxos] scantxoutset failed: {e}")

    # Return empty if both methods failed
    return {
        "address": address,
        "utxos": [],
        "count": 0,
        "source": "none",
        "warning": "Não foi possível obter UTXOs. Endereço pode estar vazio ou APIs indisponíveis."
    }