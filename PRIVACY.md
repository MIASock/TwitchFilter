# Privacy policy

Category Filter for Twitch is a browser extension that shows filtered viewer counts on Twitch's browse page. This policy explains what it stores, what it sends, and where. Last updated 8 November 2026.

## The short version

The extension collects nothing. It has no analytics, no tracking and no server of its own. The only service it talks to is Twitch, using the Twitch app you register yourself.

## What's stored in your browser

| Data | Where it's kept | Why |
| --- | --- | --- |
| Your Twitch app's Client ID and Client Secret | The extension's local storage in Chromium browsers, the extension's own database in Firefox | To ask Twitch for an access token |
| A Twitch app access token | Same place | To read the live stream list |
| Your filter settings: languages, tags, and whether to hide categories | Your browser's synced extension storage | To remember your filter |
| The latest scan result: category totals and top channels | The extension's session storage, cleared when the browser closes | To avoid scanning again when you reload the page |

The credentials and the token can only be read by the extension's own background and options page. The part of the extension that runs on twitch.tv can't read them.

If you've turned on sync in your browser, your browser syncs the filter settings to your other devices through your Google, Microsoft, Mozilla or other browser account, like any extension's synced settings. Your credentials are never synced.

Removing the extension deletes everything it stored.

## What's sent, and to whom

The extension only sends requests to Twitch:

- **id.twitch.tv:** your Client ID and Client Secret, to get an app access token.
- **api.twitch.tv:** your Client ID, the access token, and the languages you filter by, to read the list of live streams.

These requests are covered by [Twitch's privacy notice](https://www.twitch.tv/p/legal/privacy-notice/). The token is an app token: it identifies your registered app, not your Twitch account, and the extension never asks for access to your account.

On twitch.tv, the extension reads the category cards on the browse page to put its counts next to them. It doesn't read or send anything else from the page.

## Changes

Changes to this policy are published in this file, and its history is in the project's repository.

## Contact

Questions about privacy are welcome as an issue on the [project's GitHub page](https://github.com/MIASock/TwitchFilter/issues).
