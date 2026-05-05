from typing import Optional, List, Dict, Any
from app.core.bitcoin_rpc import rpc_cliente, async_rpc_cliente
import asyncio


class WalletManager:
    
    _current_wallet: Optional[str] = None
    
    @classmethod
    def get_current_wallet(cls) -> Optional[str]:
        return cls._current_wallet
    
    @classmethod
    def set_current_wallet(cls, wallet_name: str) -> None:
        cls._current_wallet = wallet_name
    
    @classmethod
    def _get_wallet_rpc_params(cls) -> list:
        if cls._current_wallet:
            return [f"{cls._current_wallet}"]
        return []


def create_wallet(wallet_name: str, passphrase: Optional[str] = None, 
                  descriptors: bool = True) -> Dict[str, Any]:

    params = {
        "wallet_name": wallet_name,
        "descriptors": descriptors,
        "load_on_startup": True
    }
    
    if passphrase:
        params["passphrase"] = passphrase
        params["avoid_reuse"] = True
    
    result = rpc_cliente("createwallet", [wallet_name, False, True, passphrase or "", False, descriptors, True])
    
    return {
        "name": wallet_name,
        "warning": result.get("warning"),
        "descriptors": descriptors
    }


def list_wallets() -> List[Dict[str, Any]]:

    try:
        result = rpc_cliente("listwalletdir", [])
        wallets = []
        for wallet in result.get("wallets", []):
            wallets.append({
                "name": wallet.get("name"),
                "path": wallet.get("path")
            })
        return wallets
    except Exception as e:
        # Fallback: try listing loaded wallets
        loaded = list_loaded_wallets()
        return [{"name": name, "path": None} for name in loaded]


def list_loaded_wallets() -> List[str]:

    return rpc_cliente("listwallets", [])


def load_wallet(wallet_name: str) -> Dict[str, Any]:

    result = rpc_cliente("loadwallet", [wallet_name, True])
    

    WalletManager.set_current_wallet(wallet_name)
    
    return {
        "name": wallet_name,
        "warning": result.get("warning"),
        "loaded": True
    }


def unload_wallet(wallet_name: Optional[str] = None) -> Dict[str, Any]:

    target = wallet_name or WalletManager.get_current_wallet()
    if not target:
        raise ValueError("No wallet specified and no current wallet loaded")
    
    result = rpc_cliente("unloadwallet", [target])

    if target == WalletManager.get_current_wallet():
        WalletManager._current_wallet = None
    
    return {"name": target, "unloaded": True}


def get_new_address(label: Optional[str] = None, address_type: str = "bech32m") -> str:

    params = [label or ""]
    if address_type:
        params.append(address_type)
    
    return rpc_cliente("getnewaddress", params)


def get_raw_change_address(address_type: str = "bech32m") -> str:

    return rpc_cliente("getrawchangeaddress", [address_type])


def get_wallet_info() -> Dict[str, Any]:
    current_wallet = WalletManager.get_current_wallet()
    return rpc_cliente("getwalletinfo", [], wallet=current_wallet)


def set_wallet_label(address: str, label: str) -> bool:

    rpc_cliente("setlabel", [address, label])
    return True


def get_addresses_by_label(label: Optional[str] = None) -> Dict[str, Any]:

    params = []
    if label:
        params = [label]
    
    return rpc_cliente("getaddressesbylabel", params)


def list_received_by_address(min_conf: int = 1, include_empty: bool = True,
                             include_watch_only: bool = False) -> List[Dict[str, Any]]:
    current_wallet = WalletManager.get_current_wallet()
    return rpc_cliente("listreceivedbyaddress", [min_conf, include_empty, include_watch_only], wallet=current_wallet)


def list_transactions(count: int = 10, skip: int = 0, include_watch_only: bool = True) -> List[Dict[str, Any]]:
    """List wallet transactions."""
    current_wallet = WalletManager.get_current_wallet()
    return rpc_cliente("listtransactions", ["*", count, skip, include_watch_only], wallet=current_wallet)


def get_balance(min_conf: int = 1) -> float:
    current_wallet = WalletManager.get_current_wallet()
    return rpc_cliente("getbalance", ["*", min_conf], wallet=current_wallet)


async def async_create_wallet(wallet_name: str, passphrase: Optional[str] = None,
                               descriptors: bool = True) -> Dict[str, Any]:

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, create_wallet, wallet_name, passphrase, descriptors)


async def async_load_wallet(wallet_name: str) -> Dict[str, Any]:
    """Async version of load_wallet."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, load_wallet, wallet_name)


async def async_list_wallets() -> List[Dict[str, Any]]:

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, list_wallets)


async def async_get_new_address(label: Optional[str] = None, 
                               address_type: str = "bech32m") -> str:

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_new_address, label, address_type)


async def async_get_wallet_info() -> Dict[str, Any]:

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_wallet_info)
