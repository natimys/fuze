"""add playlist label and cover artwork

Revision ID: 2c8d9e0f1a2b
Revises: c7e2a9d4f601
"""
import sqlalchemy as sa
from alembic import op

revision = "2c8d9e0f1a2b"
down_revision = "c7e2a9d4f601"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("playlists", sa.Column("label_style", sa.String(24), server_default="aged", nullable=False))
    op.add_column("playlists", sa.Column("label_art", sa.Text(), nullable=True))
    op.add_column("playlists", sa.Column("cover_art", sa.Text(), nullable=True))

def downgrade() -> None:
    op.drop_column("playlists", "cover_art")
    op.drop_column("playlists", "label_art")
    op.drop_column("playlists", "label_style")
