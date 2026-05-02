import asyncio
import logging
import zmq.asyncio
from app.config import settings
from app.websocket.alerts import process_new_transaction, notify_transaction_received
from app.core.bitcoin_rpc import async_rpc_cliente

logger = logging.getLogger(__name__)


class ZMQListener:
    def __init__(self):
        self.context = None
        self.socket = None
        self.running = False
        self.monitored_addresses = set()

    async def start(self):
        if not settings.BITCOIN_ZMQ_HOST:
            logger.warning("ZMQ não configurado. Alertas em tempo real desativados.")
            return

        self.context = zmq.asyncio.Context()
        self.socket = self.context.socket(zmq.SUB)
        
        zmq_url = settings.BITCOIN_ZMQ_URL
        self.socket.connect(zmq_url)
        self.socket.setsockopt_string(zmq.SUBSCRIBE, "rawtx")
        self.socket.setsockopt_string(zmq.SUBSCRIBE, "hashblock")
        
        self.running = True
        logger.info(f"ZMQ listener iniciado em {zmq_url}")
        
        try:
            while self.running:
                try:
                    topic, body, seq = await self.socket.recv_multipart()
                    topic = topic.decode("utf-8")
                    
                    if topic == "rawtx":
                        await self._handle_rawtx(body)
                    elif topic == "hashblock":
                        await self._handle_new_block(body)
                        
                except Exception as e:
                    logger.error(f"Erro ao processar mensagem ZMQ: {e}")
                    await asyncio.sleep(1)
                    
        except asyncio.CancelledError:
            logger.info("ZMQ listener cancelado")
        finally:
            self.stop()

    async def _handle_rawtx(self, raw_tx_hex: bytes):
        try:
            tx_hex = raw_tx_hex.hex()
            
            tx = await async_rpc_cliente("decoderawtransaction", [tx_hex])
            txid = tx.get("txid")
            
            if not txid:
                return
            
            logger.debug(f"Nova transação recebida via ZMQ: {txid}")
            
            await process_new_transaction(txid)
            
            for vout in tx.get("vout", []):
                script_pub_key = vout.get("scriptPubKey", {})
                address = script_pub_key.get("address", "")
                
                if address and address in self.monitored_addresses:
                    amount_btc = vout.get("value", 0)
                    await notify_transaction_received(txid, address, amount_btc)
                    logger.info(f"Pagamento recebido: {amount_btc} BTC em {address[:16]}...")
                    
        except Exception as e:
            logger.error(f"Erro ao processar rawtx: {e}")

    async def _handle_new_block(self, block_hash: bytes):
        try:
            block_hash_hex = block_hash.hex()
            logger.info(f"Novo bloco: {block_hash_hex[:16]}...")
        except Exception as e:
            logger.error(f"Erro ao processar novo bloco: {e}")

    def add_monitored_address(self, address: str):
        self.monitored_addresses.add(address)
        logger.info(f"Endereço monitorado: {address[:16]}...")

    def remove_monitored_address(self, address: str):
        self.monitored_addresses.discard(address)

    def stop(self):
        self.running = False
        if self.socket:
            self.socket.close()
        if self.context:
            self.context.term()
        logger.info("ZMQ listener parado")


zmq_listener = ZMQListener()


async def start_zmq_listener():
    await zmq_listener.start()


def stop_zmq_listener():
    zmq_listener.stop()
