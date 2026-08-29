"""add private playlists and ordered items

Revision ID: 9e7c1a4d5b20
Revises: 6b2d4f8c9a11
"""

import sqlalchemy as sa
from alembic import op

revision = "9e7c1a4d5b20"
down_revision = "6b2d4f8c9a11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "playlists",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_playlists_owner_id", "playlists", ["owner_id"])

    op.create_table(
        "playlist_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("playlist_id", sa.BigInteger(), nullable=False),
        sa.Column("track_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "playlist_id",
            "position",
            name="uq_playlist_items_playlist_position",
        ),
    )
    op.create_index("ix_playlist_items_playlist_id", "playlist_items", ["playlist_id"])
    op.create_index("ix_playlist_items_track_id", "playlist_items", ["track_id"])


def downgrade() -> None:
    op.drop_index("ix_playlist_items_track_id", table_name="playlist_items")
    op.drop_index("ix_playlist_items_playlist_id", table_name="playlist_items")
    op.drop_table("playlist_items")
    op.drop_index("ix_playlists_owner_id", table_name="playlists")
    op.drop_table("playlists")
