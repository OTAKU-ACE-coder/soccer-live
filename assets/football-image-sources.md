# Football image sources

The club badge manifest covers all 516 teams in football-catalog.json. Most images are cached ESPN team badges. Newport County uses its official club website SVG. Catalunya Women uses the regional flag where the provider supplies no federation badge.

- ESPN club images: https://a.espncdn.com/i/teamlogos/soccer/150/{team-id}.png
- Newport County: https://www.newport-county.co.uk/themes/custom/newport/files/newport-county-crest.svg
- Catalunya flag: https://commons.wikimedia.org/wiki/File:Flag_of_Catalonia.svg
- Player portrait catalog: https://www.footylogos.com/ (existing verified name-to-image index)

Run node scripts/cache-club-badges.mjs to refresh missing club images, and node scripts/cache-player-portraits.mjs to refresh the selected local player portraits. Existing local badge overrides are retained. Recovered portrait files ending in -portrait are from TheSportsDB or Wikipedia/Wikimedia Commons. Wikipedia source URLs are recorded in assets/players/photo-sources.json. Photo recovery matches the player name and birth date; club matching is used when a birth date is unavailable. TheSportsDB requests are queued and spaced to reduce repeated requests.

- Additional player and club media: https://www.thesportsdb.com/
- Free Wikimedia photo metadata: https://www.mediawiki.org/wiki/API:Pageimages

Unavailable player photos display initials rather than another person's face.
