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
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM tracks WHERE source = 'YOUTUBE') THEN
                RAISE EXCEPTION
                    'Cannot downgrade while YOUTUBE tracks exist; export or remove them explicitly first';
            END IF;
        END $$
        """
    )
    op.execute("ALTER TYPE tracksource RENAME TO tracksource_old")
    op.execute("CREATE TYPE tracksource AS ENUM ('YANDEX', 'SPOTIFY')")
    op.execute(
        "ALTER TABLE tracks ALTER COLUMN source TYPE tracksource USING source::text::tracksource"
    )
    op.execute("DROP TYPE tracksource_old")
