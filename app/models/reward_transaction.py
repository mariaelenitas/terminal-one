from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from app.database import Base


class RewardTransaction(Base):
    __tablename__ = "reward_transactions"
    __table_args__ = (UniqueConstraint("order_id", name="uq_reward_order"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    miles = Column(Integer, nullable=False)
    reason = Column(String, nullable=False, default="Delivered order")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
