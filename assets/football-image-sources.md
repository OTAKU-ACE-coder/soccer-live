# Football image sources

## Current player portraits

The app prioritizes real photographs currently published by official club and league sites. The player directory links to publisher-hosted photos. A small set of cropped or optimized thumbnails and selected backups is kept in assets/players/current/. Source URLs, publishers and check dates are recorded in assets/players/current/sources.json. Some roster photographs are framed as head-and-shoulders thumbnails without changing faces.

The old FootyLogos full-body pipeline, legacy body thumbnails and CSS enlargement effects have been removed. Update current-player-portraits.json with a verified publisher URL and record its source in assets/players/current/sources.json. Optional backups are listed in portrait-fallbacks.json.

Additional identity-checked photographic sources are listed in assets/players/photo-sources.json. Wikipedia archive photographs remain available for retired players where appropriate. No generated or illustrated player faces are used.

The UEFA fallback uses unique ESPN FC and UEFA identifiers from Wikidata ([P3681](https://www.wikidata.org/wiki/Property:P3681), [P2276](https://www.wikidata.org/wiki/Property:P2276)). Soccer Live tries the matching player’s official club and national-team photo URLs when its usual sources are missing. Photo availability varies by competition and season.

## Club badges

The badge manifest covers every team in football-catalog.json and additional discovered clubs. Most images are cached ESPN badges. Newport County uses its official SVG, and Catalunya Women uses the regional flag where a federation badge is unavailable.

- ESPN: https://a.espncdn.com/i/teamlogos/soccer/150/{team-id}.png
- Newport County: https://www.newport-county.co.uk/themes/custom/newport/files/newport-county-crest.svg
- Catalunya flag: https://commons.wikimedia.org/wiki/File:Flag_of_Catalonia.svg

Run node scripts/cache-club-badges.mjs to refresh missing badges. Existing overrides are retained. Unavailable photos remain unavailable; they are not replaced with a different person's face.
