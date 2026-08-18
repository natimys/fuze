# Yandex metadata: public-beta legal gate

Status: reviewed 2026-08-19. Release disposition: **residual risk accepted for
source-only distribution and user-operated, non-commercial deployments**.

This record is a product release decision, not legal advice. It covers only
Yandex Music metadata; YouTube-derived audio and Spotify metadata are separate
gates.

## Behavior reviewed

Fuze uses the unofficial `yandex-music` Python client with a token supplied by
the deployer. It searches Yandex Music and retrieves a selected track's title,
artist, album, year, duration, cover URL, and Yandex track ID. Search results are
shown in Fuze and cached temporarily. Metadata for an acquired track is stored
in Fuze's database and can be displayed later; the cover remains a Yandex-hosted
URL. Fuze does not fetch or stream audio from Yandex Music. It uses the metadata
to search YouTube for a corresponding recording.

Relevant implementation:

- `src/backend/integrations/yandex.py`
- `src/backend/modules/tracks/providers.py` (`YandexProvider`)
- `src/backend/modules/tracks/service.py` (`search`, `acquire`, and
  `_resolve_youtube_url`)

## Requirements understood

The Yandex Music Terms reviewed 2026-08-19 state that the service, its
materials, player, and database are for personal, non-commercial use within the
technical capabilities provided by the service. They prohibit copying,
reproduction, adaptation, distribution, making available, and other use of
those items without Yandex's agreement, and reserve Yandex's right to impose or
change technical, legal, and organizational limits.

The incorporated Yandex Services User Agreement says Yandex may prohibit
automated access. It treats text, graphics, databases, music, and other service
content as protected subject matter and permits their use only through the
functionality offered by the relevant service unless the rightsholder has given
prior permission or the law or service-specific terms provide an exception.

No official Yandex Music API terms or other express permission were identified
that authorize Fuze's current use of the consumer service endpoints to retrieve
and present catalog metadata in a separate application. A deployer's
subscription or access token is not treated as that permission. Whether an
individual metadata field is independently protectable does not remove the
separate contractual and database-use risk associated with systematic access
to the service.

Sources:

- [Yandex Music Terms of Use](https://yandex.ru/legal/music_termsofuse/),
  especially clauses 2.6-2.8
- [Yandex Services User Agreement](https://yandex.ru/legal/rules/), especially
  clauses 3.1, 5.2, and 6.1-6.2

## Project distribution principle and decision

The project owner defines Fuze as a self-hosted open-source project: the project
distributes source code and container images, does not operate a hosted catalog
or metadata service, and does not itself supply a Yandex account or token.
A deployer must provide their own token and is responsible for the way their
installation accesses and uses Yandex Music.

On that limited basis, the project owner accepts the residual risk of shipping
the optional Yandex integration in source code and container images. The gate
does not record that the integration is authorized by Yandex, and it does not
grant deployers any permission. Operators must limit use to personal,
non-commercial deployments, comply with applicable Yandex terms and law, stop
using the integration if they lack permission, and accept that Yandex may
restrict or terminate access.

## Limits of this decision

This decision applies only while the project follows the distribution principle
above and while the integration remains deployer-configured and optional. It
must be re-opened before the project operates a hosted Fuze instance, supplies
shared Yandex credentials, offers catalog data to third parties, monetizes the
integration, bulk-exports or aggregates Yandex metadata, proxies or stores
Yandex cover images, or retrieves Yandex audio.

Re-open this gate if the integration, deployment model, applicable permissions,
or Yandex terms change, or if Yandex publishes official API terms covering this
use.
