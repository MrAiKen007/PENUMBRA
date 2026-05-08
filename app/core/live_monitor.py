import asyncio
import logging
import zmq
import zmq.asyncio
from app.services.privacy_engine import calculate_privacy_score
from app.core.bitcoin_rpc import async_get_transaction as get_transaction, extract_addresses

logger = logging.getLogger(__name__)


async def _queue_new_addresses_from_tx(tx: dict, monitored_addresses: set) -> None:
    """
    Quando uma nova transação é detectada via ZMQ, enfileira endereços desconhecidos
    que interagiram com os endereços monitorizados — para revisão humana.
    Só endereços que NÃO são já entidades conhecidas são enfileirados.
    """
    try:
        from app.services.graph_builder import (
            KNOWN_ENTITIES, _user_entities_cache, EXCHANGE_PREFIXES, _load_user_entities
        )
        from app.db import get_db, queue_address_for_review, get_entity

        await _load_user_entities()

        # Recolhe todos os endereços na transação
        all_addresses = set()
        for inp in tx.get("vin", []):
            addr = inp.get("prevout", {}).get("scriptpubkey_address", "")
            if addr and addr not in ["COINBASE", "unknown"]:
                all_addresses.add(addr)
        for out in tx.get("vout", []):
            addr = out.get("scriptpubkey_address", "")
            if addr:
                all_addresses.add(addr)

        # Só nos interessa se a tx envolver um endereço monitorizado
        if not (all_addresses & monitored_addresses):
            return

        # Filtra: só endereços desconhecidos e não-monitorizados
        to_review = [
            addr for addr in all_addresses
            if addr not in monitored_addresses
            and addr not in KNOWN_ENTITIES
            and addr not in _user_entities_cache
        ]
        if not to_review:
            return

        txid = tx.get("txid", "unknown")
        async for db in get_db():
            for addr in to_review:
                existing = await get_entity(db, addr)
                if existing:
                    continue

                suggested_type = None
                suggested_reason = None
                for prefix in EXCHANGE_PREFIXES:
                    if addr.startswith(prefix):
                        suggested_type = "exchange"
                        suggested_reason = f"Prefixo '{prefix}' associado a exchanges conhecidas"
                        break

                await queue_address_for_review(
                    db=db,
                    address=addr,
                    detection_source="live_monitor",
                    context={"txid": txid, "monitored_addresses": list(monitored_addresses)[:5]},
                    suggested_type=suggested_type,
                    suggested_reason=suggested_reason,
                )
                logger.info(f"[live_monitor] Endereço {addr[:20]}... enfileirado para revisão humana")
            break

    except Exception as e:
        logger.warning(f"[live_monitor] Não foi possível enfileirar endereços: {e}")


async def start_zmq_listener(monitored_addresses: set, notify_callback):

    context = zmq.asyncio.Context()
    socket = context.socket(zmq.SUB)
    socket.connect("tcp://127.0.0.1:28332")
    socket.setsockopt(zmq.SUBSCRIBE, b"hashtx")

    logger.info("ZMQ listener activo — a aguardar transacções...")
    print("ZMQ listener activo — a aguardar transacções...")

    while True:
        topic, body, seq = await socket.recv_multipart()
        txid = body.hex()

        tx = await get_transaction(txid)
        involved_addresses = extract_addresses(tx)

        if involved_addresses & monitored_addresses:
            await notify_callback({
                "type": "new_transaction",
                "txid": txid,
                "message": "Nova transacção detectada que afecta a tua privacidade"
            })

            # Enfileira endereços desconhecidos desta transação para revisão humana
            asyncio.create_task(
                _queue_new_addresses_from_tx(tx, monitored_addresses)
            )