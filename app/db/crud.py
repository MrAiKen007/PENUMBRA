from typing import Optional, List
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from app.db.models import CachedUTXO, Alert, UserConfig, PrivacyScoreHistory, AddressLabel


async def create_or_update_utxo(db: AsyncSession, txid: str, vout: int, **kwargs) -> CachedUTXO:

    result = await db.execute(
        select(CachedUTXO).where(CachedUTXO.txid == txid, CachedUTXO.vout == vout)
    )
    utxo = result.scalar_one_or_none()
    
    if utxo:
        for key, value in kwargs.items():
            if hasattr(utxo, key):
                setattr(utxo, key, value)
        utxo.updated_at = datetime.utcnow()
    else:
        utxo = CachedUTXO(txid=txid, vout=vout, **kwargs)
        db.add(utxo)
    
    await db.flush()
    return utxo


async def get_utxo(db: AsyncSession, txid: str, vout: int) -> Optional[CachedUTXO]:

    result = await db.execute(
        select(CachedUTXO).where(CachedUTXO.txid == txid, CachedUTXO.vout == vout)
    )
    return result.scalar_one_or_none()


async def get_all_utxos(db: AsyncSession) -> List[CachedUTXO]:

    result = await db.execute(select(CachedUTXO))
    return result.scalars().all()


async def delete_utxo(db: AsyncSession, txid: str, vout: int) -> bool:

    result = await db.execute(
        delete(CachedUTXO).where(CachedUTXO.txid == txid, CachedUTXO.vout == vout)
    )
    await db.flush()
    return result.rowcount > 0



async def create_alert(
    db: AsyncSession,
    alert_type: str,
    severity: str,
    title: str,
    message: str,
    suggestion: Optional[str] = None,
    txid: Optional[str] = None,
    address: Optional[str] = None,
    metadata: Optional[dict] = None
) -> Alert:

    alert = Alert(
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        suggestion=suggestion,
        txid=txid,
        address=address,
        metadata=metadata
    )
    db.add(alert)
    await db.flush()
    return alert


async def get_alerts(
    db: AsyncSession,
    unread_only: bool = False,
    severity: Optional[str] = None,
    limit: int = 100
) -> List[Alert]:

    query = select(Alert).order_by(Alert.created_at.desc())
    
    if unread_only:
        query = query.where(Alert.is_read == False)
    if severity:
        query = query.where(Alert.severity == severity)
    
    query = query.limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def mark_alert_read(db: AsyncSession, alert_id: int, read: bool = True) -> bool:

    result = await db.execute(
        update(Alert)
        .where(Alert.id == alert_id)
        .values(is_read=read)
    )
    await db.flush()
    return result.rowcount > 0


async def acknowledge_alert(db: AsyncSession, alert_id: int) -> bool:

    result = await db.execute(
        update(Alert)
        .where(Alert.id == alert_id)
        .values(is_acknowledged=True, dismissed_at=datetime.utcnow())
    )
    await db.flush()
    return result.rowcount > 0



async def get_config(db: AsyncSession, key: str, default: Optional[str] = None) -> Optional[str]:

    result = await db.execute(select(UserConfig).where(UserConfig.key == key))
    config = result.scalar_one_or_none()
    return config.value if config else default


async def set_config(db: AsyncSession, key: str, value: str, value_type: str = "string") -> UserConfig:

    result = await db.execute(select(UserConfig).where(UserConfig.key == key))
    config = result.scalar_one_or_none()
    
    if config:
        config.value = value
        config.value_type = value_type
        config.updated_at = datetime.utcnow()
    else:
        config = UserConfig(key=key, value=value, value_type=value_type)
        db.add(config)
    
    await db.flush()
    return config


async def save_privacy_score(
    db: AsyncSession,
    overall_score: int,
    utxo_count: int,
    breakdown: Optional[dict] = None
) -> PrivacyScoreHistory:

    history = PrivacyScoreHistory(
        overall_score=overall_score,
        utxo_count=utxo_count,
        breakdown=breakdown
    )
    db.add(history)
    await db.flush()
    return history


async def get_privacy_score_history(db: AsyncSession, limit: int = 30) -> List[PrivacyScoreHistory]:

    result = await db.execute(
        select(PrivacyScoreHistory)
        .order_by(PrivacyScoreHistory.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def set_address_label(
    db: AsyncSession,
    address: str,
    label: str,
    color: Optional[str] = None,
    notes: Optional[str] = None
) -> AddressLabel:

    result = await db.execute(select(AddressLabel).where(AddressLabel.address == address))
    addr_label = result.scalar_one_or_none()
    
    if addr_label:
        addr_label.label = label
        if color:
            addr_label.color = color
        if notes:
            addr_label.notes = notes
    else:
        addr_label = AddressLabel(address=address, label=label, color=color, notes=notes)
        db.add(addr_label)
    
    await db.flush()
    return addr_label


async def get_address_label(db: AsyncSession, address: str) -> Optional[AddressLabel]:

    result = await db.execute(select(AddressLabel).where(AddressLabel.address == address))
    return result.scalar_one_or_none()
