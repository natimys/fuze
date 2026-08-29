"""add auth sessions and harden users

Revision ID: 1f3a9c7e2d10
Revises: 8d471b49f2ac
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "1f3a9c7e2d10"
down_revision = "8d471b49f2ac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM users
                GROUP BY lower(btrim(email))
                HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION 'Cannot normalize users.email: case-insensitive duplicates exist';
            END IF;
        END $$
        """
    )
    op.execute("UPDATE users SET email = lower(btrim(email))")
    op.alter_column("users", "email", type_=sa.String(length=320))
    op.alter_column("users", "name", type_=sa.String(length=100))

    op.create_table(
        "auth_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("refresh_jti_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["replaced_by"], ["auth_sessions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index(
        "ix_auth_sessions_refresh_jti_hash",
        "auth_sessions",
        ["refresh_jti_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_refresh_jti_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.alter_column("users", "name", type_=sa.String(length=50))
    op.alter_column("users", "email", type_=sa.String())
