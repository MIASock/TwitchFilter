# Store listing

Images and text for the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). The screenshots were taken on twitch.tv with sample numbers.

## Images

| File | Size | Chrome Web Store | Edge Add-ons | Firefox Add-ons |
| --- | --- | --- | --- | --- |
| [`screenshot-1-counts.png`](screenshot-1-counts.png) | 1280×800 | Screenshot | Screenshot | Screenshot |
| [`screenshot-2-hide.png`](screenshot-2-hide.png) | 1280×800 | Screenshot | Screenshot | Screenshot |
| [`screenshot-3-ranking.png`](screenshot-3-ranking.png) | 1280×800 | Screenshot | Screenshot | Screenshot |
| [`screenshot-4-connect.png`](screenshot-4-connect.png) | 1280×800 | Screenshot | Screenshot | Screenshot |
| [`promo-small-440x280.png`](promo-small-440x280.png) | 440×280 | Small promo tile | Small promotional tile | – |
| [`promo-marquee-1400x560.png`](promo-marquee-1400x560.png) | 1400×560 | Marquee promo tile | Large promotional tile | – |
| [`logo-300x300.png`](logo-300x300.png) | 300×300 | – | Extension logo | – |
| [`../extension/icons/icon-128.png`](../extension/icons/icon-128.png) | 128×128 | Store icon | – | Taken from the add-on |

## Name

Category Filter for Twitch

## Summary

Chrome and Edge take this from the manifest's description (132 characters at most). Firefox has its own summary field (250 at most).

> Shows how many viewers each Twitch browse category has in your languages and tags, and can hide categories with no matches.

## Description

```text
Twitch's browse page counts every viewer worldwide. A category can show thousands of viewers and still have nobody streaming in your language. Category Filter for Twitch adds a second count to every category card, covering only the streams that match your filter.

FEATURES
• Filtered counts on every card: the viewers and live channels that match your languages and tags, next to Twitch's own count.
• Hide categories with no matches, so the browse page lists only what your community is actually streaming.
• Ranking: every matching category, most viewers first, with its top channels one click away.
• Every stream language Twitch supports, starting with your browser's language.
• Light on Twitch's API: results are reused for 3 minutes, shared between tabs, and background tabs don't start scans.

GETTING STARTED
1. After installing, the extension's settings open. Click "Connect with Twitch".
2. Check that the code on Twitch matches the one in the settings, and click Authorize.
3. Open twitch.tv/directory and pick a language or a tag in the filter bar above the categories.

Twitch only shares its list of live streams with apps a Twitch user has connected, which is why the extension asks you to connect once. The connection asks for no permissions: the extension can't see or change anything in your account, and only reads public data.

PRIVACY
No analytics, no tracking, no server of its own. The extension only ever talks to Twitch. Privacy policy: https://github.com/MIASock/TwitchFilter/blob/master/PRIVACY.md

Open source under the MIT license: https://github.com/MIASock/TwitchFilter

Category Filter for Twitch is an independent project and isn't affiliated with or endorsed by Twitch Interactive, Inc. "Twitch" is a trademark of Twitch Interactive, Inc.
```

## Category and links

| Field | Value |
| --- | --- |
| Category | Chrome: Entertainment. Edge: Entertainment. Firefox: Games & Entertainment. |
| Language | English |
| Homepage / website | https://github.com/MIASock/TwitchFilter |
| Support | https://github.com/MIASock/TwitchFilter/issues |
| Privacy policy | https://github.com/MIASock/TwitchFilter/blob/master/PRIVACY.md |
| License (Firefox) | MIT License |

## Chrome Web Store: privacy tab

**Single purpose**

> Shows filtered viewer counts on Twitch's browse page: for each category, how many viewers and live channels match the user's chosen stream languages and tags, with an option to hide categories that have none.

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's filter (languages, tags, hide option), their Twitch connection tokens, and the latest scan result so a reload doesn't scan again. |
| Host permission `https://api.twitch.tv/*` | Reads Twitch's list of live streams through the official Twitch API, which is where the filtered counts come from. |
| Host permission `https://id.twitch.tv/*` | Connects the user's Twitch account through Twitch's sign-in (device code flow), renews and validates the token as Twitch requires, and revokes it on disconnect. |
| Content script on `https://www.twitch.tv/*` | Adds the filter bar and the count on each category card to Twitch's browse page. Twitch is a single-page app, so the script runs on all its pages and acts only on the browse page. |

**Remote code:** No, I am not using remote code. All JavaScript is in the package.

**Data usage:** tick **Authentication information** (the Twitch access and refresh tokens, sent only to Twitch). Tick nothing else. Then tick all three certifications: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.

## Firefox Add-ons

- **Source code:** not needed. The package isn't minified, bundled or transpiled; it's the files in `extension/` as they are, plus the Firefox manifest changes made by `scripts/build.js`.
- **Data collection:** the manifest declares `authenticationInfo` as required, which Firefox shows in the install prompt.

## Notes for reviewers (all stores)

```text
To test: install, click "Connect with Twitch" on the settings page that opens, and approve the code on twitch.tv with any Twitch account. Then open https://www.twitch.tv/directory and pick a language (for example German) under "Languages" in the bar above the categories. Each category card then shows its matching viewers and live channels. "Ranking" lists all matching categories.

The extension only talks to api.twitch.tv and id.twitch.tv. The Twitch connection uses no scopes. The source is at https://github.com/MIASock/TwitchFilter.
```
