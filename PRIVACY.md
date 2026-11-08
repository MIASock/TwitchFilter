# Privacy policy

Category Filter for Twitch is a browser extension that shows filtered viewer counts on Twitch's browse page. This policy explains what it stores, what it sends, and where. Last updated 8 November 2026.

## The short version

The extension collects nothing. It has no analytics, no tracking and no server of its own. The only service it talks to is Twitch.

## Connecting your Twitch account

To read Twitch's list of live streams, the extension needs you to connect your Twitch account to its Twitch app. The connection asks Twitch for no permissions: the extension can't see your follows, whispers or email, and can't post, follow or change anything on your behalf. It uses the connection only to read public data.

You can end the connection at any time with **Disconnect** in the extension's options, which also tells Twitch to cancel the token, or under **Connections** in your Twitch settings.

## What's stored in your browser

| Data | Where it's kept | Why |
| --- | --- | --- |
| Twitch access and refresh tokens for your connection | The extension's local storage in Chromium browsers, the extension's own database in Firefox | To make requests to Twitch and to renew access when it expires |
| Your Twitch user name and user ID | Same place | To show which account is connected |
| If you use your own Twitch app: its Client ID, Client Secret and app access token | Same place | To make requests with your app instead |
| Your filter settings: languages, tags, and whether to hide categories | Your browser's synced extension storage | To remember your filter |
| The latest scan result: category totals and top channels | The extension's session storage, cleared when the browser closes | To avoid scanning again when you reload the page |

Tokens, user name and credentials can only be read by the extension's own background and options page. The part of the extension that runs on twitch.tv can't read them.

If you've turned on sync in your browser, your browser syncs the filter settings to your other devices through your Google, Microsoft, Mozilla or other browser account, like any extension's synced settings. Tokens and credentials are never synced.

Removing the extension deletes everything it stored.

## What's sent, and to whom

The extension only sends requests to Twitch:

- **id.twitch.tv**, to connect, renew and check your connection: the extension's app ID, the one-time connection code, and your tokens. Twitch requires apps to check their tokens there regularly. Disconnecting sends the access token there to cancel it.
- **api.twitch.tv**, to read the list of live streams: the app ID, your access token, and the languages you filter by.
- If you use your own Twitch app, its Client ID and Client Secret go to id.twitch.tv to get an app access token.

These requests are covered by [Twitch's privacy notice](https://www.twitch.tv/p/legal/privacy-notice/). Like any app you connect, Twitch records that your account connected the extension's app.

When you install the extension in Firefox, Firefox lists "authentication information" as data it sends. That's these Twitch tokens going to Twitch, and nowhere else.

On twitch.tv, the extension reads the category cards on the browse page to put its counts next to them. It doesn't read or send anything else from the page.

## Changes

Changes to this policy are published in this file, and its history is in the project's repository.

## Contact

Questions about privacy are welcome as an issue on the [project's GitHub page](https://github.com/MIASock/TwitchFilter/issues).
