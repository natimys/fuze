"""Add database-backed instance settings and encrypted provider secrets.

Revision ID: c7e2a9d4f601
Revises: 31a6f8c4d2e7
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c7e2a9d4f601"
down_revision = "31a6f8c4d2e7"
branch_labels = None
depends_on = None


DEFAULT_SETTINGS = {
    "instance_name": "Fuze",
    "auth": {"mode": "password", "registration": False},
    "features": {"playback": True},
    "providers": {
        "youtube": True,
        "yandex": False,
        "spotify": False,
        "spotify_market": "US",
    },
}


def upgrade() -> None:
    op.create_table(
        "instance_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_instance_settings_singleton"),
        sa.CheckConstraint("version >= 1", name="ck_instance_settings_version"),
    )
    op.create_table(
        "instance_secrets",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("name"),
    )
    op.create_table(
        "instance_settings_audit",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("diff", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_instance_settings_audit_config_version",
        "instance_settings_audit",
        ["config_version"],
    )
    settings_table = sa.table(
        "instance_settings",
        sa.column("id", sa.Integer()),
        sa.column("version", sa.Integer()),
        sa.column("settings", postgresql.JSONB()),
    )
    op.bulk_insert(settings_table, [{"id": 1, "version": 1, "settings": DEFAULT_SETTINGS}])


def downgrade() -> None:
    op.drop_index("ix_instance_settings_audit_config_version", table_name="instance_settings_audit")
    op.drop_table("instance_settings_audit")
    op.drop_table("instance_secrets")
    op.drop_table("instance_settings")
