"""add youtube track source

Revision ID: 8d471b49f2ac
Revises: bfda0abe3a31
"""
from alembic import op

revision = "8d471b49f2ac"
down_revision = "bfda0abe3a31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE tracksource ADD VALUE IF NOT EXISTS 'YOUTUBE'")


def downgrade() -> None:
    op.execute("DELETE FROM tracks WHERE source = 'YOUTUBE'")
    op.execute("ALTER TYPE tracksource RENAME TO tracksource_old")
    op.execute("CREATE TYPE tracksource AS ENUM ('YANDEX', 'SPOTIFY')")
    op.execute("ALTER TABLE tracks ALTER COLUMN source TYPE tracksource USING source::text::tracksource")
    op.execute("DROP TYPE tracksource_old")
