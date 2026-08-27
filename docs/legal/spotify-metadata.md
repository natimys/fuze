# Spotify metadata: public-beta legal gate

Status: reviewed 2026-08-19. Release disposition: **requirements understood;
optional source distribution accepted subject to operator compliance**.

This record is a product release decision, not legal advice. It covers only
Spotify metadata. YouTube-derived audio and Yandex metadata have separate
decisions.

## Behavior reviewed

Spotify support is disabled by default. When an operator enables it and supplies
their own Spotify application client ID and secret, Fuze uses the official Web
API client-credentials flow to search for tracks. It receives up to ten results
with track, artist, album, year, duration, cover URL, Spotify ID, and Spotify
URL. Results are cached in Redis for 15 minutes by default and displayed in a
dedicated Spotify section.

Spotify results are discovery-only. Selecting one opens its Spotify URL; Fuze
does not acquire, queue, persist, download, or play Spotify audio or preview
clips. The backend rejects attempts to acquire a Spotify result.

Relevant implementation:

- `src/backend/integrations/spotify.py`
- `src/backend/modules/tracks/providers.py` (`SpotifyProvider` and search cache)
- `src/backend/modules/tracks/service.py` (`search` and `acquire`)
- `src/frontend/components/search/SearchModal.tsx`

## Requirements understood

The Spotify Developer Terms and Developer Policy reviewed 2026-08-19 make the
right to use the Spotify Platform conditional on continuing compliance. The
current integration is a Non-Streaming SDA with respect to Spotify. Its
credentials may be used only for its registered application and must not be
shared. Spotify Content includes metadata and cover art.

The terms prohibit indefinite storage and permit only storage strictly needed
to operate the application. Local caching of metadata and cover art must be
temporary and necessary for performance. Fuze therefore keeps Spotify search
data only in the expiring search cache and does not persist Spotify results as
tracks.

Displayed Spotify metadata and artwork must:

- be clearly attributed with the Spotify logo;
- link back to the applicable Spotify content;
- remain unmodified, with artwork uncropped and unobscured;
- not be offered as a standalone metadata or artwork product;
- not be used for downloads, stream ripping, data transfer to another service,
  analytics, profiling, or AI or machine-learning training.

Spotify's design rules for multi-provider products also require Spotify content
to occupy its own row or shelf rather than be interleaved with content from
similar services. Fuze's search UI now uses a separate attributed Spotify
section, the official monochrome full logo at no less than the specified
digital minimum width, per-result links, and an `OPEN SPOTIFY` continuation
link. Spotify results remain excluded from Fuze's acquisition pipeline.

Development-mode applications are intended for experimentation and personal
use and are subject to current account, user, rate, and quota limits. An
operator who needs broader access must independently qualify for and obtain
extended quota mode. Fuze distribution does not provide or imply that approval.

Sources:

- [Spotify Developer Terms](https://developer.spotify.com/terms), version 10,
  effective 2025-05-15
- [Spotify Developer Policy](https://developer.spotify.com/policy), effective
  2025-05-15
- [Spotify Design and Branding Guidelines](https://developer.spotify.com/documentation/design)
- [Spotify Web API quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)

## Project distribution principle and decision

The project distributes source code and container images. It does not provide a
hosted Spotify integration, Spotify credentials, Spotify metadata, or an
extended-quota approval. Each operator who enables the integration must
register and accurately describe their own Spotify developer application,
accept the applicable agreement, keep credentials secret, remain within the
mode and quota granted to that application, and ensure their deployment remains
compliant.

On that basis, the project owner accepts distribution of the optional,
disabled-by-default Spotify integration. This is not a representation that
Spotify has reviewed or approved Fuze. In particular, an operator must assess
the policy restriction on products integrated with streams or content from
another service in light of their deployment. The enforced external-only,
separate-shelf behavior reduces coupling but does not replace Spotify's written
approval where the agreement requires it.

## Limits of this decision

This decision applies only while Spotify remains disabled by default,
operator-credentialed, discovery-only, temporarily cached, separately
attributed, and linked back to Spotify.

Re-open this gate before enabling Spotify by default, operating shared or hosted
credentials, persisting or exporting Spotify Content, combining Spotify
metadata with another provider's acquisition or playback path, adding Spotify
streaming or previews, monetizing a use outside the policy, removing required
attribution or links, or changing the cache beyond temporary operational use.
Also re-open it if the implementation, deployment model, Spotify approval or
quota mode, or applicable Spotify terms and policies change.
