from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, JSON, Index
from sqlalchemy.sql import func
from app.db.database import Base


class CachedUTXO(Base):

    __tablename__ = "cached_utxos"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    txid = Column(String(64), nullable=False, index=True)
    vout = Column(Integer, nullable=False)
    address = Column(String(100), nullable=True, index=True)
    amount = Column(Float, nullable=False)
    confirmations = Column(Integer, default=0)
    script_pub_key = Column(String(200), nullable=True)
    label = Column(String(100), nullable=True)
    is_kyc = Column(Boolean, default=False)
    privacy_score = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    __table_args__ = (
        Index('idx_utxo_txid_vout', 'txid', 'vout', unique=True),
    )


class Alert(Base):

    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_type = Column(String(50), nullable=False, index=True)
    severity = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    suggestion = Column(Text, nullable=True)
    
    
    txid = Column(String(64), nullable=True, index=True)
    address = Column(String(100), nullable=True, index=True)
    extra_data = Column(JSON, nullable=True)
    
    is_read = Column(Boolean, default=False)
    is_acknowledged = Column(Boolean, default=False)
    dismissed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (
        Index('idx_alerts_unread', 'is_read', 'created_at'),
    )


class UserConfig(Base):

    __tablename__ = "user_configs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    value_type = Column(String(20), default="string")
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class PrivacyScoreHistory(Base):

    __tablename__ = "privacy_score_history"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    overall_score = Column(Integer, nullable=False)
    utxo_count = Column(Integer, nullable=False)
    breakdown = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())


class AddressLabel(Base):

    __tablename__ = "address_labels"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    address = Column(String(100), unique=True, nullable=False, index=True)
    label = Column(String(100), nullable=False)
    color = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())