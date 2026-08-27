"""add durable track download state

Revision ID: 6b2d4f8c9a11
Revises: 1f3a9c7e2d10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "6b2d4f8c9a11"
down_revision = "1f3a9c7e2d10"
branch_labels = None
depends_on = None

download_status = postgresql.ENUM(
    "NOT_REQUESTED",
    "QUEUED",
    "DOWNLOADING",
    "READY",
    "FAILED",
    name="trackdownloadstatus",
    create_type=False,
)


def upgrade() -> None:
    postgresql.ENUM(
        "NOT_REQUESTED",
        "QUEUED",
        "DOWNLOADING",
        "READY",
        "FAILED",
        name="trackdownloadstatus",
    ).create(op.get_bind(), checkfirst=True)
    op.add_column(
        "tracks",
        sa.Column(
            "download_status",
            download_status,
            server_default="NOT_REQUESTED",
            nullable=False,
        ),
    )
    op.add_column(
        "tracks",
        sa.Column(
            "download_attempts", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column("tracks", sa.Column("download_error_code", sa.String(64)))
    op.add_column("tracks", sa.Column("download_error_message", sa.String(512)))
    op.add_column("tracks", sa.Column("download_task_id", sa.String(64)))
    op.add_column("tracks", sa.Column("download_requested_at", sa.DateTime()))
    op.add_column("tracks", sa.Column("download_started_at", sa.DateTime()))
    op.add_column("tracks", sa.Column("download_finished_at", sa.DateTime()))
    op.add_column("tracks", sa.Column("download_lease_expires_at", sa.DateTime()))
    op.execute(
        "UPDATE tracks SET download_status = 'READY' WHERE storage_key IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("tracks", "download_lease_expires_at")
    op.drop_column("tracks", "download_finished_at")
    op.drop_column("tracks", "download_started_at")
    op.drop_column("tracks", "download_requested_at")
    op.drop_column("tracks", "download_task_id")
    op.drop_column("tracks", "download_error_message")
    op.drop_column("tracks", "download_error_code")
    op.drop_column("tracks", "download_attempts")
    op.drop_column("tracks", "download_status")
    download_status.drop(op.get_bind(), checkfirst=True)
