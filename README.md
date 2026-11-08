# Category Filter for Twitch

See which games a language community is playing on Twitch right now.

Twitch's browse page counts every viewer worldwide. If you want to know what German, Polish or Japanese streamers are playing, the counts don't help: a category can show 294 viewers and still have no German streams at all. This browser extension adds a second count to every category card that includes only the streams matching your filter.

- **Filtered counts on every card**, next to Twitch's own: viewers and live channels that match your languages and tags.
- **Hide categories with no matches**, so the browse page lists only what your community is actually streaming.
- **Ranking**: every matching category, most viewers first, with its top channels one click away.

Works in Chrome, Edge, Brave and other Chromium browsers (version 111 or later), and in Firefox 140 or later.

Category Filter for Twitch is an independent project. It isn't made by, endorsed by or affiliated with Twitch.

## Installing

The extension isn't in the Chrome Web Store or on addons.mozilla.org yet. Until it is, install it from a release:

1. Download the zip for your browser from the [latest release](https://github.com/MIASock/TwitchFilter/releases/latest): `…-chrome.zip` for Chrome, Edge and Brave, `…-firefox.zip` for Firefox.
2. Load it:
   - **Chrome, Edge, Brave:** unzip it. Open `chrome://extensions` (`edge://extensions` in Edge), turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick the zip. Firefox removes temporary add-ons when it closes, so you'll have to load it again after a restart.

## Setting up

Twitch only shares its live stream list with registered apps. The extension has no server of its own, so you register a free Twitch app and the extension uses it straight from your browser. It takes about two minutes.

1. Make sure two-factor authentication is on for your Twitch account. The developer console requires it.
2. Open the [Twitch developer console](https://dev.twitch.tv/console/apps) and click **Register Your Application**.
3. Fill in the form:
   - **Name:** anything, as long as no one else on Twitch has used it.
   - **OAuth Redirect URLs:** `http://localhost`. The extension never uses it, but Twitch requires one.
   - **Category:** any.
   - **Client Type:** Confidential.
4. Open the app you just created, copy the **Client ID**, then click **New Secret** and copy the **Client Secret**.
5. Open the extension's options. The **Settings** button in the extension's filter bar on twitch.tv opens them, or go through your browser's extensions page. Paste both values and click **Save and test**.

## Using it

Open [twitch.tv/directory](https://www.twitch.tv/directory). A filter bar appears above the categories.

- **Languages** picks the stream languages to count. It starts with your browser's language, except English, which you choose yourself because it's by far the slowest to scan.
- **Tags** narrows the count to streams that carry at least one of the tags you list, separated by commas.
- **Hide categories with no matches** removes every category where nobody matches. It waits until a scan has finished, because only then is it certain a category has no matches.
- **Ranking** lists all matching categories, most viewers first. Open a category to see its matching channels. Clicking the count on a card jumps straight to that category in the list.
- **Refresh** scans again right away. Otherwise results refresh every 5 minutes while the page is open and in view.

## How it works

Twitch's API has no way to ask for a filtered count per category, but it can list every live stream in a language. The extension reads that list page by page, adds it up per category, and matches the totals to the cards using the category ID in each card's image address. Matching by ID keeps working when Twitch shows translated category names.

Each API request returns up to 100 streams, so a smaller language takes a handful of requests and finishes in seconds. Twitch allows an app 800 requests a minute. The extension pauses when it gets close to that, reuses a result for 3 minutes, shares one scan between open tabs, and doesn't start scans in background tabs.

## Privacy

The extension sends nothing to its developer or to anyone else besides Twitch. Your Client ID, Client Secret and access token stay in your browser, where the part of the extension that runs on twitch.tv can't read them. They're only ever sent to Twitch. The full [privacy policy](PRIVACY.md) explains what's stored and where it goes.

## Limits

- **The language is whatever the streamer picked.** A mislabelled stream counts under the language it's labelled with.
- **Very broad filters are cut off at 60,000 streams.** That only matters for English, or for a tag filter with no language, which has to go through all of Twitch. The filter bar tells you when it happens.
- **While hiding, the browse page loads up to about 1,000 categories.** If more categories match, the filter bar says how many aren't shown. Ranking always lists them, up to 300.
- **Twitch can change its page at any time.** The counts depend on how Twitch builds its category cards, and loading more cards while hiding uses an internal Twitch function. A Twitch redesign can break either until the extension is updated. If only the loading breaks, Ranking still lists everything.

## Development

You need [Node.js](https://nodejs.org) 22.2 or later.

```bash
npm ci
```

```bash
npm run check
```

`npm run check` runs everything CI runs: ESLint, the unit tests, the build, and Mozilla's add-on linter on the Firefox build. Each step also has its own script: `npm run lint`, `npm test`, `npm run build` and `npm run lint:firefox`.

To try your changes, load the `extension` folder unpacked in a Chromium browser, or run `npm run build` and load `dist/firefox/manifest.json` as a temporary add-on in Firefox.

| Path | What's in it |
| --- | --- |
| `extension/` | The extension itself, shared by both browsers. Its `manifest.json` is the Chromium manifest. |
| `extension/src/core.js` | Filtering, per-category totals, and matching cards to categories. No browser APIs, so the tests run it in Node. |
| `extension/src/helix.js` | Twitch API client: app token, paging, retries and rate limits. |
| `extension/src/background.js` | Holds the credentials and runs scans for the open tabs. |
| `extension/src/secrets.js` | Storage for the credentials that content scripts can't read. |
| `extension/src/content.js` | The filter bar, card counts, hiding and the Ranking panel on twitch.tv. |
| `extension/src/page.js` | Runs in Twitch's own page to ask it for more cards while hiding. |
| `scripts/build.js` | Builds `dist/chrome`, `dist/firefox` (with a Firefox manifest) and a zip of each. |
| `test/` | Unit tests for `core.js`, `helix.js` and the build. |

### Releasing

1. Raise `version` in both `extension/manifest.json` and `package.json`. The build fails if they differ.
2. Commit, then tag and push the tag:

   ```bash
   git tag v0.2.0
   ```

   ```bash
   git push origin v0.2.0
   ```

The Build workflow then runs all checks and publishes a GitHub release with both zips attached. Every other push and pull request runs the same checks and keeps the zips as a workflow artifact.

## License

[MIT](LICENSE)
