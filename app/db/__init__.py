from app.db.database import (
    engine,
    AsyncSessionLocal,
    Base,
    init_db,
    get_db,
)

from app.db.models import (
    CachedUTXO,
    Alert,
    UserConfig,
    PrivacyScoreHistory,
    AddressLabel,
)

from app.db.crud import (

    create_or_update_utxo,
    get_utxo,
    get_all_utxos,
    delete_utxo,
    create_alert,
    get_alerts,
    mark_alert_read,
    acknowledge_alert,
    get_config,
    set_config,
    save_privacy_score,
    get_privacy_score_history,
    set_address_label,
    get_address_label,
)

__all__ = [
    "engine",
    "AsyncSessionLocal",
    "Base",
    "init_db",
    "get_db",
    "CachedUTXO",
    "Alert",
    "UserConfig",
    "PrivacyScoreHistory",
    "AddressLabel",
    "create_or_update_utxo",
    "get_utxo",
    "get_all_utxos",
    "delete_utxo",
    "create_alert",
    "get_alerts",
    "mark_alert_read",
    "acknowledge_alert",
    "get_config",
    "set_config",
    "save_privacy_score",
    "get_privacy_score_history",
    "set_address_label",
    "get_address_label",
]
