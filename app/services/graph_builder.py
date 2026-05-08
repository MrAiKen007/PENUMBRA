import asyncio
import logging
from typing import Optional

import httpx

from app.config import settings
from app.models.graph import (
    NodeType, NodeRisk, GraphNode, GraphEdge,
    ClusterInfo, GraphData
)
from app.core.bitcoin_rpc import async_rpc_cliente

logger = logging.getLogger(__name__)


# Entidades hardcoded (fallback)
KNOWN_ENTITIES: dict[str, dict] = {
    "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": {"name": "Binance Cold Wallet", "risk": NodeRisk.HIGH},
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": {"name": "Binance Hot Wallet", "risk": NodeRisk.HIGH},
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": {
        "name": "Coinbase",
        "risk": NodeRisk.HIGH,
    },
    "1CK6KHY6MHgYvmRQ4PAafKYDrg1ejbH1cE": {"name": "BitcoinFog (mixer)", "risk": NodeRisk.CRITICAL},
}

EXCHANGE_PREFIXES = ["1NDy", "34xp", "3Cbq", "bc1qm4"]

# Cache de entidades da DB
_user_entities_cache: dict[str, dict] = {}
_cache_loaded = False


async def _load_user_entities() -> dict[str, dict]:
    """Carrega entidades do usuário da base de dados."""
    global _user_entities_cache, _cache_loaded

    if _cache_loaded:
        return _user_entities_cache

    try:
        from app.db import get_db, get_all_entities
        async for db in get_db():
            entities = await get_all_entities(db, limit=10000)
            _user_entities_cache = {
                e.address: {
                    "name": e.name,
                    "risk": _risk_from_string(e.risk_level),  # Bug 3 fix: "medium" -> CAUTION
                    "type": e.entity_type,
                    "source": e.source,
                }
                for e in entities
            }
            _cache_loaded = True
            logger.info(f"Loaded {len(_user_entities_cache)} user entities from DB")
            return _user_entities_cache
    except Exception as e:
        logger.warning(f"Could not load user entities from DB: {e}")
        _cache_loaded = True  # Don't retry on error
        return {}


def _risk_from_string(risk_str: str) -> NodeRisk:
    """Converte string de risco para enum."""
    mapping = {
        "safe": NodeRisk.SAFE,
        "caution": NodeRisk.CAUTION,
        "medium": NodeRisk.CAUTION,
        "high": NodeRisk.HIGH,
        "critical": NodeRisk.CRITICAL,
    }
    return mapping.get(risk_str.lower(), NodeRisk.HIGH)


def _resolve_entity(address: str) -> Optional[dict]:
    """Resolve entidade para um endereço (hardcoded + cache da DB)."""
    # Primeiro verifica hardcoded
    if address in KNOWN_ENTITIES:
        return KNOWN_ENTITIES[address]

    # Depois verifica cache de entidades do usuário
    if address in _user_entities_cache:
        entity = _user_entities_cache[address]
        return {
            "name": entity["name"],
            "risk": entity["risk"],
        }

    # Fallback para prefixos conhecidos
    for prefix in EXCHANGE_PREFIXES:
        if address.startswith(prefix):
            return {"name": "Exchange conhecida", "risk": NodeRisk.HIGH}

    return None


async def _resolve_entity_async(address: str) -> Optional[dict]:
    """Versão assíncrona que garante carregamento da DB."""
    await _load_user_entities()
    return _resolve_entity(address)


def invalidate_entity_cache():
    """Invalida o cache de entidades (chamar após criar/atualizar entidade)."""
    global _cache_loaded, _user_entities_cache
    _cache_loaded = False
    _user_entities_cache = {}


async def _mempool_get(path: str) -> dict | list:
    url = f"{settings.MEMPOOL_API_URL}{path}"
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


async def fetch_transaction(txid: str) -> dict:
    # Prioritize mempool API if available (avoids txindex issues)
    if not settings.USE_BITCOIN_CORE:
        return await _fetch_tx_via_api(txid)
    
    # Try mempool first even when Core is enabled (more reliable for historical txs)
    try:
        return await _fetch_tx_via_api(txid)
    except Exception as api_err:
        logger.debug(f"mempool API failed for {txid[:20]}..., trying Core: {api_err}")
        # Fallback to Core for wallet transactions
        return await _fetch_tx_via_rpc(txid)


async def _fetch_tx_via_rpc(txid: str) -> dict:
    from app.services.wallet_service import WalletManager
    
    raw = None
    wallet_name = WalletManager.get_current_wallet()
    
    # Try getrawtransaction first (for any tx in blockchain with txindex)
    try:
        raw = await async_rpc_cliente("getrawtransaction", [txid, True])
    except Exception as e:
        logger.debug(f"getrawtransaction failed for {txid[:20]}...: {e}")
        # Fallback to gettransaction (for wallet transactions)
        if wallet_name:
            try:
                wallet_tx = await async_rpc_cliente("gettransaction", [txid], wallet=wallet_name)
                logger.info(f"Using gettransaction for {txid[:20]}... (wallet tx)")
                # Convert wallet tx format to raw tx format
                raw = {
                    "txid": txid,
                    "vin": [],  # Will be empty - wallet tx doesn't have full input details
                    "vout": [],
                    "confirmations": wallet_tx.get("confirmations", 0),
                    "blockheight": wallet_tx.get("blockheight"),
                    "hex": wallet_tx.get("hex", "")
                }
                # Try to decode the hex to get vin/vout
                if raw["hex"]:
                    try:
                        decoded = await async_rpc_cliente("decoderawtransaction", [raw["hex"]])
                        raw["vin"] = decoded.get("vin", [])
                        raw["vout"] = decoded.get("vout", [])
                    except Exception as decode_err:
                        logger.warning(f"Failed to decode raw tx: {decode_err}")
            except Exception as wallet_err:
                logger.debug(f"gettransaction also failed: {wallet_err}")
                raise e  # Re-raise original error
        else:
            raise e

    async def resolve_input(inp: dict) -> dict:
        if "coinbase" in inp:
            return {**inp, "prevout": {"scriptpubkey_address": "COINBASE", "value": 0}}

        prev_txid = inp.get("txid", "")
        prev_vout = inp.get("vout", 0)

        try:
            utxo = await async_rpc_cliente("gettxout", [prev_txid, prev_vout, True])
            if utxo:
                address = utxo.get("scriptPubKey", {}).get("address", "unknown")
                value_btc = utxo.get("value", 0)
                return {
                    **inp,
                    "prevout": {
                        "scriptpubkey_address": address,
                        "value": int(value_btc * 1e8),
                    }
                }
        except Exception:
            pass

        try:
            # Only try getrawtransaction if we know it might work (txindex or mempool)
            prev_tx = await async_rpc_cliente("getrawtransaction", [prev_txid, True])
            prev_output = prev_tx["vout"][prev_vout]
            address = prev_output.get("scriptPubKey", {}).get("address", "unknown")
            value_sats = int(prev_output.get("value", 0) * 1e8)
            return {
                **inp,
                "prevout": {
                    "scriptpubkey_address": address,
                    "value": value_sats,
                }
            }
        except Exception:
            # Silently return unknown - txindex not enabled or tx not in mempool
            # This is expected behavior without txindex
            return {
                **inp,
                "prevout": {"scriptpubkey_address": "unknown", "value": 0}
            }

    resolved_inputs = await asyncio.gather(*[resolve_input(inp) for inp in raw["vin"]])

    normalized_outputs = []
    for out in raw["vout"]:
        address = out.get("scriptPubKey", {}).get("address", "unknown")
        value_sats = int(out.get("value", 0) * 1e8)
        normalized_outputs.append({
            "scriptpubkey_address": address,
            "value": value_sats,
        })

    return {
        "txid": txid,
        "vin": resolved_inputs,
        "vout": normalized_outputs,
        "status": {
            "confirmed": raw.get("confirmations", 0) > 0,
            "block_height": raw.get("blockheight"),
        }
    }


async def _fetch_tx_via_api(txid: str) -> dict:
    return await _mempool_get(f"/tx/{txid}")


async def _fetch_address_via_core(address: str) -> list[dict]:
    
    transactions = []
    
    try:
        
        from app.services.wallet_service import WalletManager
        current_wallet = WalletManager.get_current_wallet()
        logger.info(f"[_fetch_address_via_core] Current wallet: {current_wallet}, searching for address: {address}")
        
        if current_wallet:
          
            try:
                logger.info(f"[_fetch_address_via_core] Calling listreceivedbyaddress...")
                received = await async_rpc_cliente(
                    "listreceivedbyaddress", 
                    [0, True, True], 
                    wallet=current_wallet
                )
                logger.info(f"[_fetch_address_via_core] listreceivedbyaddress returned {len(received)} addresses")
                
                # Log all received addresses for debugging
                for r in received:
                    logger.info(f"[_fetch_address_via_core] Received addr: {r.get('address')}, txids: {len(r.get('txids', []))}")
            
                addr_info = next((r for r in received if r.get("address") == address), None)
                if addr_info:
                    logger.info(f"[_fetch_address_via_core] Found address in received list with {len(addr_info.get('txids', []))} txids")
                    
                    for txid in addr_info.get("txids", []):
                        try:
                            logger.info(f"[_fetch_address_via_core] Fetching tx detail for {txid[:20]}...")
                            tx_detail = await fetch_transaction(txid)
                            transactions.append(tx_detail)
                            logger.info(f"[_fetch_address_via_core] Successfully fetched tx {txid[:20]}...")
                        except Exception as e:
                            logger.warning(f"[_fetch_address_via_core] Failed to fetch tx {txid}: {e}")
                    logger.info(f"[_fetch_address_via_core] Returning {len(transactions)} transactions from received list")
                    return transactions
                else:
                    logger.debug(f"[_fetch_address_via_core] Address {address[:30]}... not found in received list (expected for external addresses)")
            except Exception as e:
                logger.error(f"[_fetch_address_via_core] listreceivedbyaddress failed: {e}")
            
           
            try:
                logger.info(f"[_fetch_address_via_core] Trying listtransactions fallback...")
                wallet_txs = await async_rpc_cliente("listtransactions", ["*", 1000, 0, True], wallet=current_wallet)
                logger.info(f"[_fetch_address_via_core] listtransactions returned {len(wallet_txs)} txs")
                
                logger.info(f"[_fetch_address_via_core] Checking {len(wallet_txs)} transactions for address {address[:30]}...")
                for tx in wallet_txs:
                    tx_addr = tx.get("address")
                    txid = tx.get("txid")
                    if not txid:
                        continue
                    # Check if this tx involves the target address
                    involves_address = False
                    if tx_addr == address:
                        logger.info(f"[_fetch_address_via_core] Found matching tx_addr: {tx_addr[:30]}...")
                        involves_address = True
                    else:
                        # Check details to see if address appears anywhere
                        try:
                            tx_detail = await fetch_transaction(txid)
                            # Check inputs
                            for inp in tx_detail.get("vin", []):
                                inp_addr = inp.get("prevout", {}).get("scriptpubkey_address")
                                if inp_addr == address:
                                    logger.info(f"[_fetch_address_via_core] Found address in input of {txid[:20]}...")
                                    involves_address = True
                                    break
                            # Check outputs
                            if not involves_address:
                                for out in tx_detail.get("vout", []):
                                    out_addr = out.get("scriptpubkey_address")
                                    if out_addr == address:
                                        logger.info(f"[_fetch_address_via_core] Found address in output of {txid[:20]}...")
                                        involves_address = True
                                        break
                            if involves_address and tx_detail not in transactions:
                                transactions.append(tx_detail)
                                logger.info(f"[_fetch_address_via_core] Added tx from listtransactions: {txid[:20]}...")
                        except Exception as e:
                            logger.debug(f"Could not check tx details: {e}")
                
                if transactions:
                    logger.info(f"[_fetch_address_via_core] Returning {len(transactions)} transactions from listtransactions")
                    return transactions
            except Exception as e:
                logger.error(f"[_fetch_address_via_core] listtransactions failed: {e}")
            
            # Fallback 3: Use scantxoutset to scan UTXO set (works for any address, not just wallet)
            try:
                logger.info(f"[_fetch_address_via_core] Trying scantxoutset fallback for {address[:30]}...")
                scan_result = await async_rpc_cliente("scantxoutset", ["start", [f"addr({address})"]])
                
                if scan_result and scan_result.get("success"):
                    unspents = scan_result.get("unspents", [])
                    logger.info(f"[_fetch_address_via_core] scantxoutset found {len(unspents)} UTXOs")
                    
                    for utxo in unspents:
                        txid = utxo.get("txid")
                        if txid:
                            try:
                                tx_detail = await fetch_transaction(txid)
                                if tx_detail not in transactions:
                                    transactions.append(tx_detail)
                                    logger.info(f"[_fetch_address_via_core] Added tx from scantxoutset: {txid[:20]}...")
                            except Exception as e:
                                logger.debug(f"Could not fetch tx from scantxoutset: {e}")
                    
                    if transactions:
                        logger.info(f"[_fetch_address_via_core] Returning {len(transactions)} transactions from scantxoutset")
                        return transactions
                else:
                    logger.warning(f"[_fetch_address_via_core] scantxoutset failed or returned no results")
            except Exception as e:
                logger.debug(f"[_fetch_address_via_core] scantxoutset not available or failed: {e}")
        else:
            logger.warning(f"[_fetch_address_via_core] No current wallet set!")
            
            # Even without wallet, try scantxoutset as last resort
            try:
                logger.info(f"[_fetch_address_via_core] Trying scantxoutset without wallet...")
                scan_result = await async_rpc_cliente("scantxoutset", ["start", [f"addr({address})"]])
                
                if scan_result and scan_result.get("success"):
                    unspents = scan_result.get("unspents", [])
                    logger.info(f"[_fetch_address_via_core] scantxoutset found {len(unspents)} UTXOs (no wallet)")
                    
                    for utxo in unspents:
                        txid = utxo.get("txid")
                        if txid:
                            try:
                                tx_detail = await fetch_transaction(txid)
                                if tx_detail not in transactions:
                                    transactions.append(tx_detail)
                            except Exception as e:
                                logger.debug(f"Could not fetch tx: {e}")
                    
                    if transactions:
                        logger.info(f"[_fetch_address_via_core] Returning {len(transactions)} from scantxoutset (no wallet)")
                        return transactions
            except Exception as e:
                logger.debug(f"scantxoutset without wallet failed: {e}")
            
    except Exception as e:
        logger.error(f"[_fetch_address_via_core] Could not fetch from Bitcoin Core: {e}")
    
    logger.warning(f"[_fetch_address_via_core] Returning {len(transactions)} transactions (empty or fallback)")
    return transactions


def _is_regtest_address(address: str) -> bool:
    """Detecta se endereço é regtest (bcrt1, m, n, 2)"""
    return address.startswith("bcrt1") or address.startswith("m") or address.startswith("n") or address.startswith("2")


async def fetch_address_transactions(address: str) -> list[dict]:
    logger.info(f"Fetching transactions for address: {address[:30]}...")
    logger.info(f"USE_BITCOIN_CORE={settings.USE_BITCOIN_CORE}, RPC_USER={settings.BITCOIN_RPC_USER}, RPC_PASS={'***' if settings.BITCOIN_RPC_PASSWORD else 'EMPTY'}")

    # Detect regtest address - mempool API doesn't work with regtest
    is_regtest = _is_regtest_address(address)
    if is_regtest:
        logger.info(f"Regtest address detected: {address[:30]}... - using Bitcoin Core only")

    # Try Bitcoin Core first
    if settings.USE_BITCOIN_CORE or is_regtest:
        try:
            core_txs = await _fetch_address_via_core(address)
            logger.info(f"Bitcoin Core returned {len(core_txs)} transactions for {address[:30]}...")
            if core_txs:
                return core_txs
        except Exception as e:
            logger.debug(f"Bitcoin Core fetch failed: {e}")

    # Fallback to mempool API (skip for regtest)
    if is_regtest:
        logger.warning(f"No transactions found for regtest address {address[:30]}... via Core")
        return []

    try:
        mempool_txs = await _mempool_get(f"/address/{address}/txs")
        logger.info(f"Mempool API returned {len(mempool_txs)} transactions for {address[:30]}...")
        return mempool_txs
    except Exception as e:
        logger.error(f"Erro ao buscar txs de {address}: {e}")
        return []


def apply_cioh(transactions: list[dict]) -> list[ClusterInfo]:
    clusters: list[ClusterInfo] = []

    for tx in transactions:
        inputs = tx.get("vin", [])
        if len(inputs) <= 1:
            continue

        input_addresses = []
        for inp in inputs:
            addr = inp.get("prevout", {}).get("scriptpubkey_address", "")
            if addr and addr not in ["COINBASE", "unknown"]:
                input_addresses.append(addr)

        if len(input_addresses) <= 1:
            continue

        cluster = ClusterInfo(
            cluster_id=f"cluster_{tx['txid'][:8]}",
            addresses=list(set(input_addresses)),
            confidence=0.85,
            reason=(
                f"Aparecem juntos como inputs na transacção {tx['txid'][:16]}... "
                f"Por CIOH, provavelmente pertencem à mesma carteira."
            )
        )
        clusters.append(cluster)

    return clusters


def detect_change_output(tx: dict, input_addresses: list[str]) -> Optional[str]:
    input_addr_set = set(input_addresses)

    for out in tx.get("vout", []):
        addr = out.get("scriptpubkey_address", "")
        if addr in input_addr_set:
            return addr

    return None


def detect_peeling_chain(transactions: list[dict], target_address: str) -> list[str]:
    chain: list[str] = []

    for tx in transactions:
        inputs = tx.get("vin", [])
        outputs = tx.get("vout", [])

        is_sender = any(
            inp.get("prevout", {}).get("scriptpubkey_address") == target_address
            for inp in inputs
        )

        if not is_sender:
            continue

        if len(outputs) == 2:
            values = [(out.get("value", 0), out.get("scriptpubkey_address", "")) for out in outputs]
            values.sort(reverse=True)

            largest_addr = values[0][1]
            if largest_addr != target_address:
                chain.append(tx["txid"])

    return chain


class GraphBuilder:
    def __init__(
        self,
        watched_address: str,
        max_depth: int = 2,
        max_nodes: int = 100,
    ):
        self.watched_address = watched_address
        self.max_depth = max_depth
        self.max_nodes = max_nodes

        self._nodes: dict[str, GraphNode] = {}
        self._edges: list[GraphEdge] = []
        self._visited_txids: set[str] = set()
        self._visited_addresses: set[str] = set()
        self._warnings: list[str] = []
        self._address_relationships: dict[tuple[str, str], dict] = {}
        # Endereços que interagiram diretamente com o endereço vigiado
        # (candidatos a revisão humana: podem ser KYC, exchange, mixer...)
        self._direct_counterparties: set[str] = set()

    async def build(self) -> GraphData:
        logger.info(
            f"Construindo grafo para {self.watched_address} "
            f"(depth={self.max_depth}, max_nodes={self.max_nodes})"
        )

        # Carrega entidades do usuário da DB primeiro
        await _load_user_entities()

        self._add_address_node(self.watched_address, is_watched=True)
        logger.info(f"Nó inicial adicionado. Total de nós: {len(self._nodes)}")

        await self._expand_address(self.watched_address, current_depth=0)
        logger.info(f"Expansão completa. Total de nós: {len(self._nodes)}, edges: {len(self._edges)}")

        # Após construção: enfileirar endereços desconhecidos para revisão humana
        await self._queue_counterparties_for_review()

        all_transactions = await self._collect_all_transactions()
        clusters = apply_cioh(all_transactions)

        peeling = detect_peeling_chain(all_transactions, self.watched_address)
        if peeling:
            self._warnings.append(
                f"Peeling chain detectada em {len(peeling)} transacção(ões). "
                f"O padrão de envio facilita o rastreio dos teus fundos."
            )

        # Populate relationships in nodes
        self._populate_node_relationships()
        
        # Create address-to-address edges for relationships
        address_edges = self._create_relationship_edges()
        
        stats = self._calculate_stats(clusters)
        # Add relationship stats
        stats["relationships"] = len(self._address_relationships)
        stats["address_to_address_edges"] = len(address_edges)

        logger.info(
            f"Grafo construído: {len(self._nodes)} nós, "
            f"{len(self._edges)} arestas tx, {len(address_edges)} arestas rel, "
            f"{len(clusters)} clusters, {len(self._address_relationships)} relações"
        )
        
        # Combine transaction edges with relationship edges
        all_edges = self._edges + address_edges

        # Detectar se a análise é inconclusiva (necessita input manual)
        needs_manual_input = False
        manual_input_reason = None

        if stats.get("total_transactions", 0) == 0:
            needs_manual_input = True
            manual_input_reason = "no_transactions"
            self._warnings.append(
                "Nenhuma transação encontrada para este endereço. "
                "Verifica se o endereço está correto ou adiciona informação manual."
            )
        elif stats.get("related_addresses", 0) == 0 and not clusters:
            needs_manual_input = True
            manual_input_reason = "no_patterns"
            self._warnings.append(
                "Nenhum padrão ou endereço relacionado detetado. "
                "O sistema não conseguiu analisar automaticamente. "
                "Considera adicionar este endereço como entidade conhecida."
            )

        return GraphData(
            nodes=list(self._nodes.values()),
            edges=all_edges,
            clusters=clusters,
            depth_reached=self.max_depth,
            warnings=self._warnings,
            stats=stats,
            needs_manual_input=needs_manual_input,
            manual_input_reason=manual_input_reason,
        )

    def _populate_node_relationships(self) -> None:
        """Populate relationship data and connected addresses in each node"""
        from app.models.graph import ConnectedAddressInfo
        
        for key, rel in self._address_relationships.items():
            addr1, addr2 = rel["addresses"]
            
            # Add relationship to both nodes (backward compatible)
            for addr in [addr1, addr2]:
                if addr in self._nodes:
                    other_addr = addr2 if addr == addr1 else addr1
                    
                    # Determine direction from this node's perspective
                    if addr == self.watched_address:
                        direction = rel["direction"]
                    else:
                        # Reverse direction for the other address
                        direction = "incoming" if rel["direction"] == "outgoing" else "outgoing" if rel["direction"] == "incoming" else rel["direction"]
                    
                    relationship_data = {
                        "peer_address": other_addr,
                        "type": rel["relationship_type"],
                        "confidence": rel["confidence"],
                        "shared_transactions": rel["shared_transactions"],
                        "total_value_sats": rel["total_value_transferred"],
                        "direction": direction,
                        "heuristics": rel["heuristics"],
                    }
                    self._nodes[addr].relationships.append(relationship_data)
                    self._nodes[addr].transaction_count += len(rel["shared_transactions"])
                    self._nodes[addr].total_volume_sats += rel["total_value_transferred"]
                    
                    # Build detailed transaction list
                    transactions = []
                    for txid in rel["shared_transactions"]:
                        tx_info = {
                            "txid": txid,
                            "value_sats": rel.get("tx_values", {}).get(txid, 0),
                            "timestamp": rel.get("tx_timestamps", {}).get(txid),
                            "is_cioh": "cioh" in rel["heuristics"]
                        }
                        transactions.append(tx_info)
                    
                    # Check if connected address is a known entity
                    entity = _resolve_entity(other_addr)
                    is_known_entity = entity is not None
                    entity_name = entity.get("name") if entity else None
                    
                    # Create connected address info
                    connected_info = ConnectedAddressInfo(
                        address=other_addr,
                        relationship_type=rel["relationship_type"],
                        confidence=rel["confidence"],
                        transactions=transactions,
                        total_value_sats=rel["total_value_transferred"],
                        direction=direction,
                        heuristics=rel["heuristics"],
                        is_known_entity=is_known_entity,
                        entity_name=entity_name,
                        first_seen=rel.get("first_seen"),
                        last_seen=rel.get("last_seen")
                    )
                    self._nodes[addr].connected_addresses.append(connected_info)

    def _create_relationship_edges(self) -> list[GraphEdge]:
        """Create direct address-to-address edges for strong relationships"""
        edges = []
        for key, rel in self._address_relationships.items():
            addr1, addr2 = rel["addresses"]
            
            # Only create direct edge for strong relationships (>0.5 confidence)
            if rel["confidence"] >= 0.5:
                edge = GraphEdge(
                    source=addr1,
                    target=addr2,
                    value_sats=rel["total_value_transferred"],
                    txid=rel["shared_transactions"][0] if rel["shared_transactions"] else "",
                    is_cioh="cioh" in rel["heuristics"],
                    confidence=rel["confidence"],
                    relationship_type=rel["relationship_type"],
                    details={
                        "shared_tx_count": len(rel["shared_transactions"]),
                        "direction": rel["direction"],
                        "heuristics": rel["heuristics"],
                    }
                )
                edges.append(edge)
        return edges

    async def _expand_address(self, address: str, current_depth: int) -> None:
        if current_depth >= self.max_depth:
            logger.debug(f"Max depth reached for {address[:20]}...")
            return
        if address in self._visited_addresses:
            logger.debug(f"Address already visited: {address[:20]}...")
            return
        if len(self._nodes) >= self.max_nodes:
            self._warnings.append(
                f"Grafo limitado a {self.max_nodes} nós para performance. "
                f"A rede real é mais extensa."
            )
            return

        self._visited_addresses.add(address)
        logger.info(f"Expanding address: {address[:30]}... at depth {current_depth}")

        transactions = await fetch_address_transactions(address)
        logger.info(f"Found {len(transactions)} transactions for {address[:30]}...")

        for tx in transactions:
            txid = tx.get("txid", "")
            if txid in self._visited_txids:
                continue
            if len(self._nodes) >= self.max_nodes:
                break

            self._visited_txids.add(txid)
            await self._process_transaction(tx, current_depth)

    async def _process_transaction(self, tx: dict, current_depth: int) -> None:
        txid = tx.get("txid", "")

        try:
            tx_detail = await fetch_transaction(txid)
        except Exception as e:
            logger.warning(f"Não consegui buscar detalhes de {txid[:16]}...: {e}")
            return

        inputs = tx_detail.get("vin", [])
        outputs = tx_detail.get("vout", [])

        total_value = sum(out.get("value", 0) for out in outputs)

        tx_node_id = f"tx:{txid}"
        if tx_node_id not in self._nodes:
            self._nodes[tx_node_id] = GraphNode(
                id=tx_node_id,
                type=NodeType.TRANSACTION,
                label=f"TX {txid[:8]}...",
                risk=NodeRisk.SAFE,
                value_sats=total_value,
                metadata={
                    "txid": txid,
                    "confirmed": tx_detail.get("status", {}).get("confirmed", False),
                    "block_height": tx_detail.get("status", {}).get("block_height"),
                    "n_inputs": len(inputs),
                    "n_outputs": len(outputs),
                }
            )

        input_addresses = []
        for inp in inputs:
            prevout = inp.get("prevout", {})
            addr = prevout.get("scriptpubkey_address", "")
            value = prevout.get("value", 0)

            if not addr or addr in ["COINBASE", "unknown"]:
                continue

            input_addresses.append(addr)
            self._add_address_node(addr)

            self._edges.append(GraphEdge(
                source=addr,
                target=tx_node_id,
                value_sats=value,
                txid=txid,
                label=f"{value / 1e8:.8f} BTC",
            ))

        for out in outputs:
            addr = out.get("scriptpubkey_address", "")
            value = out.get("value", 0)

            if not addr:
                continue

            self._add_address_node(addr)

            self._edges.append(GraphEdge(
                source=tx_node_id,
                target=addr,
                value_sats=value,
                txid=txid,
                label=f"{value / 1e8:.8f} BTC",
            ))
            
            # Track relationship between input addresses and this output
            for inp_addr in input_addresses:
                self._track_relationship(inp_addr, addr, txid, value, "transaction")

        output_addresses = [
            out.get("scriptpubkey_address", "")
            for out in outputs
        ]
        
        # Track CIOH relationships (addresses appearing together as inputs)
        if len(input_addresses) > 1:
            for i, addr1 in enumerate(input_addresses):
                for addr2 in input_addresses[i+1:]:
                    self._track_relationship(addr1, addr2, txid, total_value, "cioh")
                    # Mark this relationship with CIOH heuristic
                    key = tuple(sorted([addr1, addr2]))
                    if key in self._address_relationships:
                        if "cioh" not in self._address_relationships[key]["heuristics"]:
                            self._address_relationships[key]["heuristics"].append("cioh")
                            self._address_relationships[key]["relationship_type"] = "cluster"
                            # Increase confidence for CIOH
                            self._address_relationships[key]["confidence"] = min(1.0, 0.7 + (len(self._address_relationships[key]["shared_transactions"]) * 0.1))
        
        reused = set(input_addresses) & set(output_addresses)
        if reused:
            for addr in reused:
                if addr in self._nodes:
                    self._nodes[addr].risk = NodeRisk.HIGH
                    if addr == self.watched_address:
                        self._warnings.append(
                            f"Reutilizaste o endereço {addr[:16]}... nesta transacção. "
                            f"Isso liga directamente o pagamento e o troco ao mesmo utilizador."
                        )

        # Rastreia contrapartes diretas do endereço vigiado para revisão humana
        all_tx_addresses = set(input_addresses) | set(
            out.get("scriptpubkey_address", "") for out in tx_detail.get("vout", []) if out.get("scriptpubkey_address")
        )
        if self.watched_address in all_tx_addresses:
            for addr in all_tx_addresses:
                if addr and addr != self.watched_address and addr not in ["COINBASE", "unknown"]:
                    self._direct_counterparties.add(addr)

        if len(input_addresses) > 1:
            has_watched = self.watched_address in input_addresses
            if has_watched:
                others = [a for a in input_addresses if a != self.watched_address]
                if others:
                    self._warnings.append(
                        f"Na transacção {txid[:16]}..., o teu endereço foi combinado "
                        f"com {len(others)} outro(s) endereço(s). "
                        f"Por CIOH, todos são agora ligados a ti."
                    )
                    for edge in self._edges:
                        if edge.txid == txid and edge.target == tx_node_id:
                            edge.is_cioh = True

        if current_depth + 1 < self.max_depth:
            new_addresses = set(input_addresses + output_addresses) - self._visited_addresses
            tasks = [
                self._expand_address(addr, current_depth + 1)
                for addr in list(new_addresses)[:5]
            ]
            if tasks:
                await asyncio.gather(*tasks)

    def _add_address_node(self, address: str, is_watched: bool = False, cluster_id: str = None, cluster_confidence: float = None) -> None:
        if address in self._nodes:
            if is_watched:
                self._nodes[address].is_watched = True
            return

        entity = _resolve_entity(address)
        risk = NodeRisk.SAFE
        entity_name = None
        node_type = NodeType.ADDRESS

        if entity:
            entity_name = entity["name"]
            risk = entity["risk"]
            node_type = NodeType.ENTITY
            self._warnings.append(
                f"O endereço {address[:16]}... está ligado a '{entity_name}'. "
                f"Isto pode ligar a tua identidade a esta transacção."
            )

        label = (
            entity_name
            if entity_name
            else f"{address[:6]}...{address[-4:]}"
        )

        self._nodes[address] = GraphNode(
            id=address,
            type=node_type,
            label=label,
            risk=risk,
            is_watched=is_watched,
            entity_name=entity_name,
            cluster_id=cluster_id,
            cluster_confidence=cluster_confidence,
            metadata={"full_address": address},
            relationships=[],
            transaction_count=0,
            total_volume_sats=0,
        )

    def _track_relationship(self, from_addr: str, to_addr: str, txid: str, value_sats: int, relationship_type: str = "transaction", timestamp: str = None) -> None:
        """Track relationship between two addresses with detailed transaction info"""
        key = tuple(sorted([from_addr, to_addr]))
        
        if key not in self._address_relationships:
            self._address_relationships[key] = {
                "addresses": [from_addr, to_addr],
                "shared_transactions": [],
                "total_value_transferred": 0,
                "relationship_type": relationship_type,
                "confidence": 0.0,
                "heuristics": [],
                "direction": "unknown",
                "tx_values": {},  # Track value per transaction
                "tx_timestamps": {},  # Track timestamp per transaction
                "first_seen": None,
                "last_seen": None
            }
        
        rel = self._address_relationships[key]
        if txid not in rel["shared_transactions"]:
            rel["shared_transactions"].append(txid)
            rel["tx_values"][txid] = value_sats
            if timestamp:
                rel["tx_timestamps"][txid] = timestamp
                # Update first/last seen
                if rel["first_seen"] is None or timestamp < rel["first_seen"]:
                    rel["first_seen"] = timestamp
                if rel["last_seen"] is None or timestamp > rel["last_seen"]:
                    rel["last_seen"] = timestamp
        
        rel["total_value_transferred"] += value_sats
        
        # Calculate confidence based on number of shared transactions
        rel["confidence"] = min(1.0, 0.3 + (len(rel["shared_transactions"]) * 0.1))
        
        # Determine direction
        if from_addr == self.watched_address:
            rel["direction"] = "outgoing"
        elif to_addr == self.watched_address:
            rel["direction"] = "incoming"
        else:
            rel["direction"] = "indirect"

    async def _queue_counterparties_for_review(self) -> None:
        """
        Enfileira para revisão humana os endereços desconhecidos que interagiram
        diretamente com o endereço vigiado.
        Só enfileira se o endereço NÃO estiver já identificado como entidade.
        """
        if not self._direct_counterparties:
            return

        try:
            from app.db import get_db, queue_address_for_review, get_entity
            unknown = [
                addr for addr in self._direct_counterparties
                if addr not in KNOWN_ENTITIES and addr not in _user_entities_cache
            ]
            if not unknown:
                return

            logger.info(f"Enfileirando {len(unknown)} endereços para revisão humana")
            async for db in get_db():
                for addr in unknown:
                    # Verifica se já existe na DB como entidade conhecida
                    existing_entity = await get_entity(db, addr)
                    if existing_entity:
                        continue

                    # Tenta sugerir tipo automaticamente
                    suggested_type = None
                    suggested_reason = None
                    for prefix in EXCHANGE_PREFIXES:
                        if addr.startswith(prefix):
                            suggested_type = "exchange"
                            suggested_reason = f"Prefixo '{prefix}' associado a exchanges conhecidas"
                            break

                    # Contexto: txids que ligam este endereço ao watched
                    related_txids = [
                        e.txid for e in self._edges
                        if (e.source == addr or e.target == addr)
                        and e.txid
                    ][:10]

                    await queue_address_for_review(
                        db=db,
                        address=addr,
                        detection_source="graph_builder",
                        context={
                            "watched_address": self.watched_address,
                            "related_txids": related_txids,
                            "node_type": self._nodes.get(addr, {}) and
                                         self._nodes[addr].type.value if addr in self._nodes else "unknown",
                        },
                        suggested_type=suggested_type,
                        suggested_reason=suggested_reason,
                    )
                break  # só precisa de uma iteração
        except Exception as e:
            logger.warning(f"Não foi possível enfileirar endereços para revisão: {e}")

    async def _collect_all_transactions(self) -> list[dict]:
        tasks = [fetch_transaction(txid) for txid in list(self._visited_txids)[:50]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, dict)]

    def _calculate_stats(self, clusters: list[ClusterInfo]) -> dict:
        address_nodes = [n for n in self._nodes.values() if n.type == NodeType.ADDRESS]
        entity_nodes = [n for n in self._nodes.values() if n.type == NodeType.ENTITY]
        high_risk = [n for n in self._nodes.values() if n.risk in [NodeRisk.HIGH, NodeRisk.CRITICAL]]
        cioh_edges = [e for e in self._edges if e.is_cioh]

        return {
            "total_nodes": len(self._nodes),
            "total_edges": len(self._edges),
            "address_count": len(address_nodes),
            "transaction_count": len(self._visited_txids),
            "entity_count": len(entity_nodes),
            "cluster_count": len(clusters),
            "high_risk_nodes": len(high_risk),
            "cioh_inferences": len(cioh_edges),
            "linked_addresses": sum(len(c.addresses) for c in clusters),
            "warning_count": len(self._warnings),
        }


async def build_traceability_graph(
    address: str,
    depth: int = 2,
    max_nodes: int = 100,
) -> GraphData:
    depth = max(1, min(depth, 3))
    max_nodes = max(10, min(max_nodes, 200))

    builder = GraphBuilder(
        watched_address=address,
        max_depth=depth,
        max_nodes=max_nodes,
    )

    return await builder.build()
