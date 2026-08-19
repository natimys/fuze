"""add access keys and nullable user credentials

Revision ID: 31a6f8c4d2e7
Revises: 9e7c1a4d5b20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "31a6f8c4d2e7"
down_revision = "9e7c1a4d5b20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(320), nullable=True)
    op.alter_column("users", "password", existing_type=sa.String(), nullable=True)
    op.create_table(
        "access_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_access_keys_user_id", "access_keys", ["user_id"])
    op.create_index("ix_access_keys_key_hash", "access_keys", ["key_hash"], unique=True)
    op.add_column("auth_sessions", sa.Column("access_key_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_auth_sessions_access_key_id", "auth_sessions", "access_keys", ["access_key_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_auth_sessions_access_key_id", "auth_sessions", ["access_key_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_access_key_id", table_name="auth_sessions")
    op.drop_constraint("fk_auth_sessions_access_key_id", "auth_sessions", type_="foreignkey")
    op.drop_column("auth_sessions", "access_key_id")
    op.drop_index("ix_access_keys_key_hash", table_name="access_keys")
    op.drop_index("ix_access_keys_user_id", table_name="access_keys")
    op.drop_table("access_keys")
    op.alter_column("users", "password", existing_type=sa.String(), nullable=False)
    op.alter_column("users", "email", existing_type=sa.String(320), nullable=False)
