import asyncio
import logging
from datetime import datetime
from app.websocket.manager import manager
from app.services.alert_engine import scan_for_alerts, analyze_transaction
from app.models.alerts import Alert, AlertSeverity

logger = logging.getLogger(__name__)


async def broadcast_alert(alert: Alert):
    message = {
        "type": "alert",
        "data": {
            "id": alert.id,
            "type": alert.type.value,
            "severity": alert.severity.value,
            "title": alert.title,
            "message": alert.message,
            "suggestion": alert.suggestion,
            "timestamp": alert.timestamp.isoformat(),
            "txid": alert.txid,
            "address": alert.address,
        }
    }
    await manager.broadcast(message)
    logger.info(f"Alerta broadcast: {alert.title}")


async def broadcast_system_message(message: str, level: str = "info"):
    msg = {
        "type": "system",
        "data": {
            "message": message,
            "level": level,
            "timestamp": datetime.now().isoformat(),
        }
    }
    await manager.broadcast(msg)


async def start_alert_monitoring(interval_seconds: int = 60):
    logger.info(f"Iniciando monitor de alertas (intervalo: {interval_seconds}s)")
    
    while True:
        try:
            await broadcast_system_message("A verificar alertas...", "debug")
            
            alerts = await scan_for_alerts()
            
            for alert in alerts:
                if not alert.acknowledged:
                    await broadcast_alert(alert)
            
            if alerts:
                logger.info(f"{len(alerts)} alertas encontrados e enviados")
            
            await asyncio.sleep(interval_seconds)
            
        except Exception as e:
            logger.error(f"Erro no monitor de alertas: {e}")
            await asyncio.sleep(interval_seconds)


async def process_new_transaction(txid: str):
    logger.info(f"Processando nova transação: {txid}")
    
    try:
        alerts = await analyze_transaction(txid)
        
        for alert in alerts:
            await broadcast_alert(alert)
        
        if alerts:
            logger.info(f"{len(alerts)} alertas gerados para tx {txid[:16]}...")
            
    except Exception as e:
        logger.error(f"Erro ao processar transação {txid}: {e}")


async def notify_transaction_received(txid: str, address: str, amount_btc: float):
    message = {
        "type": "transaction_received",
        "data": {
            "txid": txid,
            "address": address,
            "amount_btc": amount_btc,
            "timestamp": datetime.now().isoformat(),
        }
    }
    await manager.broadcast(message)