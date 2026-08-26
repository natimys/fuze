# Fuze

Русский | [English](README.md)

Fuze — самостоятельный музыкальный плеер, который объединяет музыку из YouTube,
Яндекс Музыки и Spotify в одной медиатеке.

Приложение работает в Docker-контейнерах. Настройки хранятся в PostgreSQL,
фоновые задачи выполняются через Redis, а загруженные треки — в
S3-совместимом хранилище.

## Установка

Нужен Linux-сервер с Docker Engine и плагином Docker Compose. Git, Python,
Node.js и `uv` на сервере не требуются.

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh | sudo bash
```

Установщик предложит два режима:

- **Локальная сеть** — HTTP на порту 3000 по умолчанию. Не выставляйте этот
  режим напрямую в интернет.
- **Публичный HTTPS** — Caddy настроит HTTPS для доменов приложения и хранилища.
  Порты 80 и 443 должны быть свободны.

По умолчанию Fuze устанавливается в `/opt/fuze`. После запуска настройки сервера
доступны по адресу `/player/admin-settings`, а личные настройки пользователя —
по адресу `/player/settings`.

## Обновление

Fuze не обновляется автоматически. Чтобы установить последнюю стабильную
версию, выполните:

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --update
```

Для установки конкретного релиза добавьте `--version vX.Y.Z`. Перед обновлением
установщик создаёт резервную копию. Если новая версия не запустится, он вернёт
предыдущую.

## Резервные копии

По умолчанию Fuze хранит семь ежедневных резервных копий PostgreSQL. Чтобы
создать копию вручную:

```bash
cd /opt/fuze
sudo docker compose run --rm backup backup daily
```

Восстановление выполняется через установщик:

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --restore /opt/fuze/backups/fuze-daily-TIMESTAMP.tar.gz
```

Храните вне сервера и архив `.tar.gz`, и файл `.sha256`. В резервной копии есть
ключи и данные доступа, поэтому защищайте её как секрет. Загруженные треки в
архив не входят: при необходимости Fuze скачает их заново.

Сценарии восстановления и диагностики описаны в
[инструкции по эксплуатации](docs/operations/runbooks.md).

## Разработка

Понадобятся Python 3.12, `uv`, Node.js 22 и Docker Compose.

```bash
cp .env.example .env
cp .env.test.example .env.test
uv sync
docker compose up -d --build
```

Веб-интерфейс будет доступен по адресу `http://localhost:3000`, API — по адресу
`http://localhost:8000`.

Запуск проверок:

```bash
docker compose --profile test up -d db-test
uv run pytest
uv run ruff check .

cd src/frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Для разработки фронтенда запустите `npm run dev` из каталога `src/frontend`.
Vite использует порт 3000 и проксирует `/api` на `API_PROXY_TARGET` (по умолчанию
`http://127.0.0.1:8000`).

## Полезные команды

```bash
cd /opt/fuze
sudo docker compose ps
sudo docker compose logs -f backend worker
sudo docker compose restart backend
```

Команды для восстановления доступа администратора:

```bash
sudo docker compose run --rm backend fuze rescue bootstrap-admin
sudo docker compose run --rm backend fuze rescue reset-admin-password EMAIL
sudo docker compose run --rm backend fuze rescue promote-user EMAIL
sudo docker compose exec backend fuze rescue doctor
```

## Лицензия

[MIT](LICENSE)
