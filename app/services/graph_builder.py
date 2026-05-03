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


def _resolve_entity(address: str) -> Optional[dict]:
    if address in KNOWN_ENTITIES:
        return KNOWN_ENTITIES[address]

    for prefix in EXCHANGE_PREFIXES:
        if address.startswith(prefix):
            return {"name": "Exchange conhecida", "risk": NodeRisk.HIGH}

    return None


async def _mempool_get(path: str) -> dict | list:
    url = f"{settings.MEMPOOL_API_URL}{path}"
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


async def fetch_transaction(txid: str) -> dict:
    if settings.USE_BITCOIN_CORE:
        return await _fetch_tx_via_rpc(txid)
    else:
        return await _fetch_tx_via_api(txid)


async def _fetch_tx_via_rpc(txid: str) -> dict:
    raw = await async_rpc_cliente("getrawtransaction", [txid, True])

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
        except Exception as e:
            logger.warning(f"Não consegui resolver input {prev_txid}:{prev_vout} — {e}")
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
        
        if current_wallet:
          
            try:
                received = await async_rpc_cliente(
                    "listreceivedbyaddress", 
                    [0, True, True], 
                    wallet=current_wallet
                )
            
                addr_info = next((r for r in received if r.get("address") == address), None)
                if addr_info:
                    
                    for txid in addr_info.get("txids", []):
                        try:
                            tx_detail = await fetch_transaction(txid)
                            transactions.append(tx_detail)
                        except Exception:
                            pass
                    return transactions
            except Exception:
                pass
            
           
            try:
                since = await async_rpc_cliente("listsinceblock", ["0000000000000000000000000000000000000000000000000000000000000000"], wallet=current_wallet)
                for tx in since.get("transactions", []):
                    if tx.get("address") == address or address in str(tx.get("address", "")):
                        try:
                            tx_detail = await fetch_transaction(tx["txid"])
                            if tx_detail not in transactions:
                                transactions.append(tx_detail)
                        except Exception:
                            pass
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"Could not fetch from Bitcoin Core: {e}")
    
    return transactions


async def fetch_address_transactions(address: str) -> list[dict]:
    # Try Bitcoin Core first
    if settings.USE_BITCOIN_CORE:
        try:
            core_txs = await _fetch_address_via_core(address)
            if core_txs:
                return core_txs
        except Exception as e:
            logger.debug(f"Bitcoin Core fetch failed: {e}")
    
    # Fallback to mempool API
    try:
        return await _mempool_get(f"/address/{address}/txs")
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

    async def build(self) -> GraphData:
        logger.info(
            f"Construindo grafo para {self.watched_address} "
            f"(depth={self.max_depth}, max_nodes={self.max_nodes})"
        )

        self._add_address_node(self.watched_address, is_watched=True)
        await self._expand_address(self.watched_address, current_depth=0)

        all_transactions = await self._collect_all_transactions()
        clusters = apply_cioh(all_transactions)

        peeling = detect_peeling_chain(all_transactions, self.watched_address)
        if peeling:
            self._warnings.append(
                f"Peeling chain detectada em {len(peeling)} transacção(ões). "
                f"O padrão de envio facilita o rastreio dos teus fundos."
            )

        stats = self._calculate_stats(clusters)

        logger.info(
            f"Grafo construído: {len(self._nodes)} nós, "
            f"{len(self._edges)} arestas, {len(clusters)} clusters"
        )

        return GraphData(
            nodes=list(self._nodes.values()),
            edges=self._edges,
            clusters=clusters,
            depth_reached=self.max_depth,
            warnings=self._warnings,
            stats=stats,
        )

    async def _expand_address(self, address: str, current_depth: int) -> None:
        if current_depth >= self.max_depth:
            return
        if address in self._visited_addresses:
            return
        if len(self._nodes) >= self.max_nodes:
            self._warnings.append(
                f"Grafo limitado a {self.max_nodes} nós para performance. "
                f"A rede real é mais extensa."
            )
            return

        self._visited_addresses.add(address)

        transactions = await fetch_address_transactions(address)

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

        output_addresses = [
            out.get("scriptpubkey_address", "")
            for out in outputs
        ]
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

    def _add_address_node(self, address: str, is_watched: bool = False) -> None:
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
            metadata={"full_address": address},
        )

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
