import json

from app.models.audit_log import AuditLog


def add_audit_log(db, admin_user_id, action, entity_type, entity_id=None, details=None):
    log = AuditLog(
        admin_user_id=admin_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=json.dumps(details or {}, ensure_ascii=False)
    )
    db.add(log)
    return log
