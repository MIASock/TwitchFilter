# Twitch Category Filter

A browser extension for Chrome, Edge, Brave and Firefox that adds your filter's numbers to Twitch's browse page.

- Each category card shows how many viewers and live streams match your filter, next to Twitch's global count.
- **Hide categories with no matches** removes categories where nobody matches.
- **Ranking** lists every matching category, most viewers first. Open one to see its matching channels, or click the number on a card to jump straight to that category.

Filters are stream language and stream tags. A stream has to match one of the chosen languages and carry at least one of the listed tags.

## Setup

**1. Register a Twitch app.** This is free, but Twitch requires two-factor authentication on your account.

1. Go to the [Twitch developer console](https://dev.twitch.tv/console/apps) and click **Register Your Application**.
2. Use any name, the OAuth redirect URL `http://localhost`, any category, and the client type **Confidential**.
3. Open the app, copy the **Client ID**, and click **New Secret** to get a **Client Secret**.

**2. Load the extension.**

In Chrome, Edge or Brave:

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick this repo's `extension` folder.
3. Open the extension's **Details**, then **Extension options**, enter the Client ID and Secret, and click **Save and test**.

In Firefox (version 140 or later):

1. Build the Firefox copy, which needs [Node.js](https://nodejs.org):

   ```bash
   npm run build:firefox
   ```

2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `dist/firefox/manifest.json`.
3. Open `about:addons`, click the extension's **…** menu, then **Options**, enter the Client ID and Secret, and click **Save and test**. The **Settings** button in the filter bar opens the same page.

Firefox removes temporary add-ons when it closes, so you'll repeat steps 2 and 3 after each restart. To install it for good, Mozilla has to sign it. That's free for add-ons you don't publish: create an account on [addons.mozilla.org](https://addons.mozilla.org/developers/), get API keys, and run `npx web-ext sign --channel=unlisted --source-dir=dist/firefox` with them. Firefox Developer Edition and Nightly can also run unsigned add-ons if you set `xpinstall.signatures.required` to `false` in `about:config`.

**3. Open [twitch.tv/directory](https://www.twitch.tv/directory).** The filter bar appears above the categories, set to German to start with.

## How it works

Twitch's API has no filtered category counts, but it can list every live stream in a language. The extension reads that list and adds it up per category, then matches the totals to the cards using the category ID in each card's box art URL. Matching by ID keeps working when Twitch translates category names.

Results are reused for 3 minutes and refreshed every 5 minutes while the browse page is open and visible.

The Client ID, Client Secret and access token are kept where only the extension's own background and options page can read them. The part that runs on twitch.tv can't. In Chrome, Edge and Brave that's the extension's local storage, locked to the extension. Firefox can't lock that storage, so there they go in the extension's own database instead. Your filter settings are kept in the browser's synced storage, so they follow you to other browsers signed in to the same account.

## Limits

- **Language is whatever the streamer selected,** so a mislabelled stream counts under that language.
- **Scan time depends on the filter.** Each 100 matching streams is one API request, so small languages finish quickly and English takes longer. A scan stops at 60,000 streams, and the bar says so if that happens. A tag filter with no language has to go through all of Twitch, so it's the slowest and most likely to hit that limit.
- **Hiding waits for the scan to finish,** because until then a category can't be confirmed as having no matches.
- **The browse page only loads about 1,000 cards while hiding.** The bar counts any matching categories that aren't shown, and Ranking always lists them, up to 300 rows.
- **Twitch can change its page.** The numbers rely on Twitch's card layout (`.game-card`), and loading more cards while hiding relies on an internal Twitch function. A redesign could break either until the extension is updated. If only the loading breaks, Ranking still lists everything.

## Tests

```bash
npm test
```
