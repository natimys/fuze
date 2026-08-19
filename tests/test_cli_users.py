from cli.commands import users


def test_create_db_engine_sets_connection_timeout(monkeypatch):
    captured = {}

    def fake_create_engine(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(users, "create_engine", fake_create_engine)
    monkeypatch.setattr(
        users,
        "_get_db_url",
        lambda host_override=None: f"postgresql+psycopg:///{host_override or 'default'}",
    )

    users._create_db_engine(host_override="db.example")

    assert captured == {
        "url": "postgresql+psycopg:///db.example",
        "kwargs": {"connect_args": {"connect_timeout": 5}},
    }
