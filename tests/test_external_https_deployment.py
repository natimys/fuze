from pathlib import Path


ROOT = Path(__file__).parents[1]
INSTALLER = (ROOT / "deploy" / "install.sh").read_text()
COMPOSE = (ROOT / "deploy" / "bundle" / "compose.yaml").read_text()
HTTPS_COMPOSE = (ROOT / "deploy" / "bundle" / "compose.https.yaml").read_text()
BACKUP = (ROOT / "deploy" / "bundle" / "deploy" / "backup.sh").read_text()


def test_installer_exposes_external_https_and_bind_address() -> None:
    assert "--mode local|https|external-https" in INSTALLER
    assert "--bind-address IPv4" in INSTALLER
    assert "BIND_ADDRESS=$BIND_ADDRESS" in INSTALLER
    assert 'valid_ipv4 "$BIND_ADDRESS"' in INSTALLER


def test_external_https_uses_production_application_settings() -> None:
    assert 'ENVIRONMENT=$([ "$MODE" = local ] && echo development || echo production)' in INSTALLER
    assert 'COOKIE_SECURE=$([ "$MODE" = local ] && echo false || echo true)' in INSTALLER
    assert "MINIO_EXTERNAL_SECURE=$([ \"$MODE\" = local ] && echo false || echo true)" in INSTALLER
    assert "https://%s" in INSTALLER


def test_base_compose_publishes_only_frontend_and_minio_on_configured_address() -> None:
    assert "${BIND_ADDRESS:-0.0.0.0}:${APP_PORT:-3000}:3000" in COMPOSE
    assert "${BIND_ADDRESS:-0.0.0.0}:${MEDIA_PORT:-9000}:9000" in COMPOSE
    for service in ("postgres", "redis", "backend"):
        block = COMPOSE.split(f"  {service}:", 1)[1].split("\n  ", 1)[0]
        assert "ports:" not in block
    assert "  caddy:" not in COMPOSE
    assert "  caddy:" in HTTPS_COMPOSE


def test_mode_specific_lifecycle_rules_are_present() -> None:
    assert '[ "$MODE" = external-https ] && ports="$APP_PORT $MEDIA_PORT"' in INSTALLER
    assert 'case "$uninstall_mode" in https|external-https)' in INSTALLER
    assert 'previous_mode" = https ] && [ "$MODE" = external-https' in INSTALLER
    assert 'rollback_files="$(compose_files_for_mode "$previous_mode")"' in INSTALLER
    assert 'restore_files="$(compose_files_for_mode "$restore_mode")"' in INSTALLER


def test_compatibility_files_remain_in_release_and_backup_bundles() -> None:
    assert (ROOT / "deploy" / "bundle" / "compose.https.yaml").is_file()
    assert (ROOT / "deploy" / "bundle" / "Caddyfile").is_file()
    assert "/source/compose.https.yaml" in COMPOSE
    assert "/source/Caddyfile" in COMPOSE
    assert "/source/compose.https.yaml" in BACKUP
    assert "/source/Caddyfile" in BACKUP
