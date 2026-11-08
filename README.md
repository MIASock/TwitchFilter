# Twitch Category Filter

A browser extension for Chrome, Edge and Brave that adds your filter's numbers to Twitch's browse page.

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

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick this repo's `extension` folder.
3. Open the extension's **Details**, then **Extension options**, enter the Client ID and Secret, and click **Save and test**.

**3. Open [twitch.tv/directory](https://www.twitch.tv/directory).** The filter bar appears above the categories, set to German to start with.

## How it works

Twitch's API has no filtered category counts, but it can list every live stream in a language. The extension reads that list and adds it up per category, then matches the totals to the cards using the category ID in each card's box art URL. Matching by ID keeps working when Twitch translates category names.

Results are reused for 3 minutes and refreshed every 5 minutes while the browse page is open and visible.

The Client ID, Client Secret and access token stay in the extension's local storage, which only the extension's own background and options page can read. The part that runs on twitch.tv can't read them. Your filter settings are kept in the browser's synced storage, so they follow you to other browsers signed in to the same account.

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
