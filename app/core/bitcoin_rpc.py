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
        json=payload,
        timeout=10.0
    )
    response = r.json()
    if 'error' in response and response['error'] is not None:
        raise Exception(f"RPC Error: {response['error']}")
    return response['result']

async def async_rpc_cliente(method: str, params: list = []) -> dict:
    credentials = base64.b64encode(
        f'{settings.BITCOIN_RPC_USER}:{settings.BITCOIN_RPC_PASSWORD}'.encode()).decode()
    payload = {
        "jsonrpc": "1.0",
        "id": "penumbra",
        "method": method,
        "params": params
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f'http://127.0.0.1:{settings.BITCOIN_RPC_PORT}',
            headers={'Authorization': f'Basic {credentials}'},
            json=payload,
            timeout=10.0
        )
        response = r.json()
        if 'error' in response and response['error'] is not None:
            raise Exception(f"RPC Error: {response['error']}")
        return response['result']

def scan_utxo(address: str) -> list:
    return rpc_cliente("scantxoutset", ["start", [f"addr({address})"]])["unspents"]

def get_transaction(txid: str) -> dict:
    return rpc_cliente("getrawtransaction", [txid, True])

async def async_get_transaction(txid: str) -> dict:
    return await async_rpc_cliente("getrawtransaction", [txid, True])

def extract_addresses(tx: dict) -> set:
    addresses = set()
    for vout in tx.get('vout', []):
        spk = vout.get('scriptPubKey', {})
        if 'address' in spk:
            addresses.add(spk['address'])
        elif 'addresses' in spk:
            addresses.update(spk['addresses'])
    
    for vin in tx.get('vin', []):
        if 'address' in vin:
            addresses.add(vin['address'])

        prevout = vin.get('prevout', {})
        if 'scriptPubKey' in prevout:
            spk = prevout['scriptPubKey']
            if 'address' in spk:
                addresses.add(spk['address'])
    return addresses

def get_raw_mempool() -> list:
    return rpc_cliente("getrawmempool")

def build_psbt(inputs: list, outputs: dict) -> str:
    return rpc_cliente("createpsbt", [inputs, outputs])

def broadcast_transaction(signed_psbt: str) -> str:
    return rpc_cliente("sendrawtransaction", [signed_psbt])