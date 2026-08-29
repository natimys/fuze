# YouTube-derived audio: public-beta legal gate

Status: reviewed 2026-08-19. Release disposition: **residual risk accepted for
source-only distribution**.

This record is a product release decision, not legal advice. It covers only the
YouTube-derived audio path; Yandex and Spotify metadata are separate gates.

## Behavior reviewed

Fuze uses `yt-dlp` through `asyncyt` to fetch a YouTube video, extracts and
transcodes its audio to Opus, stores that copy in MinIO, and later streams it
from Fuze. The same pipeline is used both for a YouTube track selected directly
and for a YouTube match derived from another provider's metadata.

Relevant implementation:

- `src/backend/integrations/youtube.py` (`download_audio_to_file`)
- `src/backend/modules/tracks/service.py` (`TrackDownloadProcessor.process`)

## Requirements understood

The YouTube Terms of Service, dated 2023-12-15 and reviewed 2026-08-19, allow
content to be viewed or listened to for personal, non-commercial use and allow
use through the embeddable player. They prohibit downloading, reproducing,
altering, or otherwise using content except when the Service expressly
authorizes it or when YouTube and, where applicable, the relevant rights
holders give prior written permission. They also prohibit automated access
without prior written permission. The license granted to other YouTube users
applies only through Service features and does not authorize use independent of
the Service.

YouTube's official download guidance does not extend that authorization:
downloads of other users' videos are an offline YouTube/Premium feature, remain
encrypted, and are playable only inside YouTube. The guidance explicitly says
that other users' videos cannot be downloaded as ordinary files and that audio,
music, or MP3 files cannot be downloaded from the YouTube app.

Sources:

- [YouTube Terms of Service](https://www.youtube.com/static?template=terms),
  especially “Permissions and Restrictions” and “License to Other Users”
- [Download videos that you've uploaded](https://support.google.com/youtube/answer/56100?hl=en-GB-)
- [YouTube videos offline FAQs](https://support.google.com/youtube/answer/7381437?hl=en)

## Project distribution principle

The project owner defines Fuze as a self-hosted open-source project: the project
distributes source code and container images, does not provide a hosted media
product or service, does not sell access, and does not itself select, acquire,
store, or stream media for deployers. A person who deploys Fuze chooses how to
configure and use it and is responsible for obtaining any required permissions
and complying with applicable terms and law.

The project owner considers this separation to place source-only distribution
in a legally uncertain or “grey” allocation of responsibility and accepts the
remaining risk. On that explicitly accepted basis, this gate does not block
publication of the source code and container images.

## Limits of this decision

This is an internal risk-acceptance decision, not a conclusion that
non-commercial or source-only distribution creates a legal safe harbor. It
does not grant a deployer permission from YouTube or any rightsholder, and a
license disclaimer cannot remove obligations that applicable terms or law
place on the project owner, distributor, or deployer. Public availability of a
video, a YouTube Premium subscription, attribution, and absence of sales are
not treated as permission for the pipeline.

This decision applies only while the project follows the distribution principle
above. It must be re-opened before the project itself hosts a public Fuze media
instance, operates acquisition for third parties, distributes acquired audio,
sells or monetizes the service, or otherwise moves beyond source code and
container-image distribution.

Re-open this gate if the pipeline, deployment model, applicable permissions, or
YouTube terms change.
