<div align="center">

<img src="extension/icons/icon-128.png" width="96" height="96" alt="">

# Category Filter for Twitch

**See which games a language community is playing on Twitch right now.**

[![GitHub release](https://img.shields.io/github/v/release/MIASock/TwitchFilter?style=for-the-badge)](https://github.com/MIASock/TwitchFilter/releases/latest)
[![License](https://img.shields.io/github/license/MIASock/TwitchFilter?style=for-the-badge)](LICENSE)
[![Build status](https://img.shields.io/github/actions/workflow/status/MIASock/TwitchFilter/build.yml?branch=master&style=for-the-badge)](https://github.com/MIASock/TwitchFilter/actions/workflows/build.yml)
[![eslint code style](https://img.shields.io/badge/code_style-eslint-4b32c3?style=for-the-badge)](eslint.config.js)
[![Downloads](https://img.shields.io/github/downloads/MIASock/TwitchFilter/total?style=for-the-badge)](https://github.com/MIASock/TwitchFilter/releases)

[![Chrome 111+](https://img.shields.io/badge/Chrome-111%2B-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](#chrome-edge-and-brave)
[![Firefox 140+](https://img.shields.io/badge/Firefox-140%2B-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](#firefox)

</div>

Twitch's browse page counts every viewer worldwide. A category can show 294 viewers and still have no German streams at all. This browser extension adds a second count to every category card, covering only the streams that match your filter.

> [!IMPORTANT]
> **No affiliation**
>
> Category Filter for Twitch is an independent, unofficial project. It isn't made by, endorsed by or affiliated with Twitch Interactive, Inc. or Amazon.
>
> **Trademarks**
>
> "Twitch" and related names, marks and logos are trademarks of Twitch Interactive, Inc. The name is used only to say which site the extension works with.
>
> **Limitation of liability**
>
> The extension is provided "as is", without warranty of any kind, and you use it at your own risk. See the [license](LICENSE) for the full terms.

## Contents

- [Features](#features)
- [Download](#download)
  - [Chrome, Edge and Brave](#chrome-edge-and-brave)
  - [Firefox](#firefox)
- [Setup](#setup)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Privacy](#privacy)
- [Dev](#dev)
- [Build](#build)
- [Tests](#tests)
- [Release](#release)
- [License](#license)
- [FAQ](#faq)

## Features

- **Filtered counts on every card**, next to Twitch's own: the viewers and live channels that match your languages and tags.
- **Hide categories with no matches**, so the browse page lists only what your community is actually streaming.
- **Ranking**: every matching category, most viewers first, with its top channels one click away.
- **Your browser's language by default**, with every stream language Twitch supports to choose from.
- **Light on Twitch's API**: results are reused for 3 minutes, shared between tabs, and background tabs don't start scans.
- **No server, no tracking**: the extension talks to Twitch and nothing else.

## Download

The extension isn't in the Chrome Web Store or on addons.mozilla.org yet. Until it is, install it from the [latest release](https://github.com/MIASock/TwitchFilter/releases/latest).

### Chrome, Edge and Brave

1. Download `category-filter-for-twitch-<version>-chrome.zip` and unzip it.
2. Open `chrome://extensions` (`edge://extensions` in Edge) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

Any Chromium browser from version 111 works.

### Firefox

1. Download `category-filter-for-twitch-<version>-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on**.
3. Pick the zip.

Needs Firefox 140 or later. Firefox removes temporary add-ons when it closes, so you'll have to load it again after a restart.

## Setup

Twitch only shares its live stream list with registered apps. The extension has no server of its own, so you register a free Twitch app and the extension uses it straight from your browser. It takes about two minutes.

1. Turn on two-factor authentication for your Twitch account, if it isn't already. The developer console requires it.
2. Open the [Twitch developer console](https://dev.twitch.tv/console/apps) and click **Register Your Application**.
3. Fill in the form:
   - **Name:** anything nobody else on Twitch has used.
   - **OAuth Redirect URLs:** `http://localhost`. The extension never uses it, but Twitch requires one.
   - **Category:** any.
   - **Client Type:** Confidential.
4. Open the new app, copy the **Client ID**, then click **New Secret** and copy the **Client Secret**.
5. Open the extension's options: on twitch.tv, click **Settings** in the extension's filter bar, or go through your browser's extensions page. Paste both values and click **Save and test**.

## Usage

Open [twitch.tv/directory](https://www.twitch.tv/directory). The filter bar appears above the categories.

| Control | What it does |
| --- | --- |
| **Languages** | Picks the stream languages to count. |
| **Tags** | Counts only streams with at least one of these tags, separated by commas. |
| **Hide categories with no matches** | Removes every category where nobody matches, once a scan has finished. |
| **Ranking** | Lists all matching categories, most viewers first. Open one to see its channels. |
| **Refresh** | Scans again right away instead of waiting for the next refresh, which comes every 5 minutes. |
| **Settings** | Opens the extension's options, where your Twitch app details go. |

Click the count on any card to jump to that category in the Ranking.

## How it works

Twitch's API can't give a filtered count per category, but it can list every live stream in a language. The extension reads that list page by page and adds it up per category. It then matches the totals to the cards using the category ID in each card's image address, which keeps working when Twitch shows translated category names.

Each request returns up to 100 streams, so a smaller language takes a handful of requests and is done in seconds.

## Privacy

The extension sends nothing to its developer or to anyone besides Twitch. Your Client ID, Client Secret and access token stay in your browser, out of reach of the part of the extension that runs on twitch.tv, and are only ever sent to Twitch. The [privacy policy](PRIVACY.md) covers what's stored and where it goes.

## Dev

```bash
git clone https://github.com/MIASock/TwitchFilter
cd TwitchFilter
npm ci
```

Needs [Node.js](https://nodejs.org) 22.2 or later. To try a change, load the `extension` folder unpacked in a Chromium browser, or [build](#build) and load `dist/firefox/manifest.json` as a temporary add-on in Firefox.

| Path | What's in it |
| --- | --- |
| `extension/` | The extension, shared by both browsers. Its `manifest.json` is the Chromium manifest. |
| `extension/src/core.js` | Filtering, per-category totals, and matching cards to categories. No browser APIs, so it's tested in Node. |
| `extension/src/helix.js` | Twitch API client: app token, paging, retries and rate limits. |
| `extension/src/background.js` | Holds the credentials and runs scans for the open tabs. |
| `extension/src/secrets.js` | Credential storage that content scripts can't read. |
| `extension/src/content.js` | The filter bar, card counts, hiding and the Ranking on twitch.tv. |
| `extension/src/page.js` | Runs in Twitch's own page to ask it for more cards while hiding. |
| `scripts/build.js` | Builds both browsers' folders and zips. |

## Build

```bash
npm run build
```

Writes `dist/chrome` and `dist/firefox`, with a Firefox manifest, plus a zip of each, ready for the stores. The same source always gives byte-identical zips. The build stops if `package.json` and `extension/manifest.json` disagree on the version.

## Tests

```bash
npm test
```

Runs the unit tests for the filtering, the Twitch API client and the build, with Node's built-in test runner.

```bash
npm run check
```

Runs everything CI runs: ESLint, the tests, the build, and Mozilla's add-on linter on the Firefox build.

## Release

1. Raise `version` in both `extension/manifest.json` and `package.json`.
2. Commit, then tag the commit and push the tag:

```bash
git tag v0.2.0
```

```bash
git push origin v0.2.0
```

The [Build workflow](.github/workflows/build.yml) runs every check and publishes a GitHub release with both zips attached. Every other push and pull request runs the same checks and keeps the zips as a workflow artifact.

## License

MIT © [MIASock](https://github.com/MIASock)

## FAQ

### Why do I need my own Twitch app?

Twitch requires an app for every request to its API. A shared app would need a server to keep its secret, and every user's requests would count against one rate limit. With your own app, the extension needs no server and you get the full rate limit to yourself.

### Will this get me rate limited?

Twitch allows each app 800 requests a minute. A scan costs one request per 100 matching streams, and the extension pauses when it gets close to the limit. It also reuses a result for 3 minutes, shares one scan between all open tabs, and doesn't start scans in background tabs.

### Why does a stream count under the wrong language?

The language is whatever the streamer picked in their stream settings, so a mislabelled stream counts under the language it's labelled with.

### Why does the filter bar say some streams may be missing?

A scan stops at 60,000 streams. That only happens with English, or with a tag filter and no language, which has to go through all of Twitch. The small channels at the end of the list are the ones left out.

### Why aren't all matching categories shown while hiding?

While hiding, the browse page loads up to about 1,000 categories. If more categories match, the filter bar tells you how many aren't shown. Ranking always lists them all, up to 300.

### The counts disappeared after a Twitch update. What now?

The extension depends on how Twitch builds its category cards, and loading more cards while hiding uses an internal Twitch function. A Twitch redesign can break either until the extension is updated. If only the loading breaks, Ranking still lists everything. Please [open an issue](https://github.com/MIASock/TwitchFilter/issues) if you spot it first.
