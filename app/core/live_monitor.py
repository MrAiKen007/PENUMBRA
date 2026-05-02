import asyncio
import zmq
import zmq.asyncio
from app.services.privacy_engine import calculate_privacy_score
from app.core.bitcoin_rpc import async_get_transaction as get_transaction, extract_addresses

async def start_zmq_listener(monitored_addresses: set, notify_callback):

    context = zmq.asyncio.Context()
    socket = context.socket(zmq.SUB)
    socket.connect("tcp://127.0.0.1:28332")
    socket.setsockopt(zmq.SUBSCRIBE, b"hashtx")

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