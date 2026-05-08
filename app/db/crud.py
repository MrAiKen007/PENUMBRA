from typing import Optional, List
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from app.db.models import CachedUTXO, Alert, UserConfig, PrivacyScoreHistory, AddressLabel, AddressEntity, PendingAddressReview


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


# === AddressEntity CRUD ===

async def create_or_update_entity(
    db: AsyncSession,
    address: str,
    name: str,
    entity_type: str,
    risk_level: str = "medium",
    source: str = "user",
    notes: Optional[str] = None,
    confidence: float = 1.0
) -> AddressEntity:
    """Cria ou atualiza uma entidade conhecida."""
    result = await db.execute(select(AddressEntity).where(AddressEntity.address == address))
    entity = result.scalar_one_or_none()

    if entity:
        entity.name = name
        entity.entity_type = entity_type
        entity.risk_level = risk_level
        entity.source = source
        entity.notes = notes
        entity.confidence = confidence
        entity.updated_at = datetime.utcnow()
    else:
        entity = AddressEntity(
            address=address,
            name=name,
            entity_type=entity_type,
            risk_level=risk_level,
            source=source,
            notes=notes,
            confidence=confidence
        )
        db.add(entity)

    await db.flush()
    return entity


async def get_entity(db: AsyncSession, address: str) -> Optional[AddressEntity]:
    """Obtém entidade por endereço."""
    result = await db.execute(select(AddressEntity).where(AddressEntity.address == address))
    return result.scalar_one_or_none()


async def get_all_entities(
    db: AsyncSession,
    entity_type: Optional[str] = None,
    risk_level: Optional[str] = None,
    limit: int = 1000
) -> List[AddressEntity]:
    """Lista todas as entidades, com filtros opcionais."""
    query = select(AddressEntity)

    if entity_type:
        query = query.where(AddressEntity.entity_type == entity_type)
    if risk_level:
        query = query.where(AddressEntity.risk_level == risk_level)

    query = query.order_by(AddressEntity.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def delete_entity(db: AsyncSession, address: str) -> bool:
    """Remove uma entidade."""
    result = await db.execute(delete(AddressEntity).where(AddressEntity.address == address))
    await db.flush()
    return result.rowcount > 0


async def search_entities(db: AsyncSession, search_term: str, limit: int = 50) -> List[AddressEntity]:
    """Procura entidades por nome ou notas."""
    from sqlalchemy import or_
    query = select(AddressEntity).where(
        or_(
            AddressEntity.name.ilike(f"%{search_term}%"),
            AddressEntity.notes.ilike(f"%{search_term}%")
        )
    ).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


# === PendingAddressReview CRUD ===

async def queue_address_for_review(
    db: AsyncSession,
    address: str,
    detection_source: str = "graph_builder",
    context: Optional[dict] = None,
    suggested_type: Optional[str] = None,
    suggested_reason: Optional[str] = None,
) -> Optional[PendingAddressReview]:
    """
    Adiciona endereço à fila de revisão humana, apenas se ainda não existir
    (pending ou já revisado). Idempotente — nunca duplica.
    """
    result = await db.execute(
        select(PendingAddressReview).where(PendingAddressReview.address == address)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing  # já está na fila (qualquer estado)

    review = PendingAddressReview(
        address=address,
        status="pending",
        detection_source=detection_source,
        context=context or {},
        suggested_type=suggested_type,
        suggested_reason=suggested_reason,
    )
    db.add(review)
    await db.flush()
    return review


async def get_pending_reviews(
    db: AsyncSession,
    status: str = "pending",
    limit: int = 100,
) -> List[PendingAddressReview]:
    """Lista revisões por estado (pending | labeled | dismissed)."""
    query = (
        select(PendingAddressReview)
        .where(PendingAddressReview.status == status)
        .order_by(PendingAddressReview.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


async def get_pending_review(
    db: AsyncSession, address: str
) -> Optional[PendingAddressReview]:
    """Obtém revisão pendente por endereço."""
    result = await db.execute(
        select(PendingAddressReview).where(PendingAddressReview.address == address)
    )
    return result.scalar_one_or_none()


async def label_pending_review(
    db: AsyncSession,
    address: str,
    entity_type: str,
    name: str,
    risk_level: str,
    notes: Optional[str] = None,
) -> Optional[PendingAddressReview]:
    """
    Marca revisão como 'labeled' e guarda os dados fornecidos pelo utilizador.
    Devolve o registo atualizado ou None se não existir.
    """
    result = await db.execute(
        select(PendingAddressReview).where(PendingAddressReview.address == address)
    )
    review = result.scalar_one_or_none()
    if not review:
        return None

    review.status = "labeled"
    review.labeled_as_type = entity_type
    review.labeled_as_name = name
    review.labeled_as_risk = risk_level
    review.labeled_as_notes = notes
    review.reviewed_at = datetime.utcnow()
    await db.flush()
    return review


async def dismiss_pending_review(
    db: AsyncSession, address: str
) -> bool:
    """Descarta revisão sem classificar (o utilizador decidiu não rotular)."""
    result = await db.execute(
        update(PendingAddressReview)
        .where(PendingAddressReview.address == address)
        .values(status="dismissed", reviewed_at=datetime.utcnow())
    )
    await db.flush()
    return result.rowcount > 0


async def count_pending_reviews(db: AsyncSession) -> int:
    """Conta quantas revisões estão pendentes."""
    from sqlalchemy import func as sa_func
    result = await db.execute(
        select(sa_func.count()).select_from(PendingAddressReview)
        .where(PendingAddressReview.status == "pending")
    )
    return result.scalar() or 0
