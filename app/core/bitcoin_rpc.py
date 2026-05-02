import httpx
import base64
from app.config import settings

def rpc_cliente(method: str, params: list = []) -> dict:
    credentials = base64.b64encode(
        f'{settings.BITCOIN_RPC_USER}:{settings.BITCOIN_RPC_PASSWORD}'.encode()).decode()
    payload = {
        "jsonrpc": "1.0",
        "id": "penumbra",
        "method": method,
        "params": params
    }

    r = httpx.post(
        f'http://127.0.0.1:{settings.BITCOIN_RPC_PORT}',
        headers={'Authorization': f'Basic {credentials}'},
        json=payload
    )
    response = r.json()
    if 'error' in response and response['error'] is not None:
        raise Exception(f"RPC Error: {response['error']}")
    return response['result']

# Analisar o mempool para obter informações sobre as transações pendentes
def scan_utxo(address: str) -> list:
    return rpc_cliente("scantxoutset", ["start", [f"addr({address})"]])["unspents"]

# Obter detalhes de uma transação específica usando seu ID
def get_transaction(txid: str) -> dict:
    return rpc_cliente("getrawtransaction", [txid, True])

# Obter o mempool para verificar as transações pendentes
def get_raw_mempool() -> list:
    return rpc_cliente("getrawmempool")

#  Construir uma PSBT (Partially Signed Bitcoin Transaction) a partir de entradas e saídas
def build_psbt(inputs: list, outputs: dict) -> str:
    return rpc_cliente("createpsbt", [inputs, outputs])

#  Assinar uma PSBT usando as chaves privadas disponíveis no nó Bitcoin Core
def broadcast_transaction(signed_psbt: str) -> str:
    return rpc_cliente("sendrawtransaction", [signed_psbt])