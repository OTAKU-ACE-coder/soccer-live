# Football image sources

## Current player portraits

The app prioritizes real photographs currently published by official club and league sites. More than 1,100 official photos are cached under assets/players/current/. Source URLs, publishers and check dates are recorded in assets/players/current/sources.json. Some roster photographs are framed as head-and-shoulders thumbnails without changing faces.

The old FootyLogos full-body pipeline, legacy body thumbnails and CSS enlargement effects have been removed. Refresh source images with node scripts/cache-current-portraits.mjs; retain the source credits and verified player-ID mapping when refreshing.

Additional identity-checked photographic sources are listed in assets/players/photo-sources.json. Wikipedia archive photographs remain available for retired players where appropriate. No generated or illustrated player faces are used.

## Club badges

The badge manifest covers every team in football-catalog.json and additional discovered clubs. Most images are cached ESPN badges. Newport County uses its official SVG, and Catalunya Women uses the regional flag where a federation badge is unavailable.

- ESPN: https://a.espncdn.com/i/teamlogos/soccer/150/{team-id}.png
- Newport County: https://www.newport-county.co.uk/themes/custom/newport/files/newport-county-crest.svg
- Catalunya flag: https://commons.wikimedia.org/wiki/File:Flag_of_Catalonia.svg

Run node scripts/cache-club-badges.mjs to refresh missing badges. Existing overrides are retained. Unavailable photos remain unavailable; they are not replaced with a different person's face.
