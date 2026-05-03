from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.services.wallet_service import (
    create_wallet, load_wallet, unload_wallet, list_wallets,
    list_loaded_wallets, get_new_address, get_raw_change_address,
    get_wallet_info, get_balance, set_wallet_label,
    WalletManager
)

router = APIRouter(prefix="/wallet", tags=["wallet"])


class CreateWalletRequest(BaseModel):
    name: str
    passphrase: Optional[str] = None
    descriptors: bool = True


class LoadWalletRequest(BaseModel):
    name: str


class SetLabelRequest(BaseModel):
    address: str
    label: str


@router.post("/create")
async def api_create_wallet(request: CreateWalletRequest):

    try:
        result = create_wallet(
            wallet_name=request.name,
            passphrase=request.passphrase,
            descriptors=request.descriptors
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/list")
async def api_list_wallets():

    try:
        wallets = list_wallets()
        loaded = list_loaded_wallets()
        current = WalletManager.get_current_wallet()
        
        return {
            "wallets": wallets,
            "loaded": loaded,
            "current": current
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if any(x in error_msg for x in ["Connection refused", "ConnectError", "timed out"]):
            raise HTTPException(
                status_code=503, 
                detail="Bitcoin Core RPC unavailable. Check that Bitcoin Core is running and RPC settings are correct."
            )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/load")
async def api_load_wallet(request: LoadWalletRequest):
    try:
        result = load_wallet(request.name)
        return result
    except Exception as e:
        error_msg = str(e)
        # If wallet is already loaded, just set it as current
        if "already loaded" in error_msg.lower():
            WalletManager.set_current_wallet(request.name)
            return {
                "name": request.name,
                "warning": "Wallet was already loaded, set as current",
                "loaded": True
            }
        raise HTTPException(status_code=400, detail=error_msg)


@router.post("/unload")
async def api_unload_wallet(wallet_name: Optional[str] = None):

    try:
        result = unload_wallet(wallet_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/info")
async def api_wallet_info():
    current = WalletManager.get_current_wallet()
    if not current:
        return {"wallet": None, "loaded": False}
    try:
        info = get_wallet_info()
        info["wallet"] = current
        info["loaded"] = True
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/balance")
async def api_wallet_balance(min_conf: int = 1):
    current = WalletManager.get_current_wallet()
    if not current:
        return {"balance": 0, "currency": "BTC", "wallet": None}
    try:
        balance = get_balance(min_conf)
        return {"balance": balance, "currency": "BTC", "wallet": current}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/address/new")
async def api_new_address(label: Optional[str] = None, address_type: str = "bech32m"):

    try:
        address = get_new_address(label, address_type)
        return {
            "address": address,
            "label": label,
            "type": address_type
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/address/change")
async def api_change_address(address_type: str = "bech32m"):

    try:
        address = get_raw_change_address(address_type)
        return {
            "address": address,
            "type": address_type
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/label")
async def api_set_label(request: SetLabelRequest):

    try:
        success = set_wallet_label(request.address, request.label)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/current")
async def api_current_wallet():

    return {
        "wallet": WalletManager.get_current_wallet()
    }
