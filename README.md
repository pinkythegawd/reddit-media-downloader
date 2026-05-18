# Reddit Media Downloader

A Chrome Manifest V3 extension for downloading Reddit media in high quality from:

- Current post media (images, GIFs, videos)
- Reddit galleries (auto-detected)
- Media links found in comments (batch download)

Works on:

- `https://www.reddit.com/*`
- `https://old.reddit.com/*`

## Features

- **Batch download from comments**: scans the current post comments for media URLs and downloads all supported media.
- **Quality selection**: choose `original`, `high`, `medium`, or `low` before downloading (defaults to `original`).
- **Auto-detect galleries**: detects Reddit gallery posts and includes all gallery items.
- **Download progress UI**: shows multi-item progress (`completed / total`) and per-item status.
- **Keyboard shortcuts**:
  - `Alt+Shift+D` → download current post media
  - `Alt+Shift+A` → download all media (post + gallery + comments)
  - Customize shortcuts in `chrome://extensions/shortcuts`.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder:
   - `/home/runner/work/reddit-media-downloader/reddit-media-downloader`

## Usage

1. Open a Reddit post page on `reddit.com` or `old.reddit.com`.
2. Click the extension icon.
3. Select desired quality (`original` by default).
4. Choose:
   - **Download current post media**
   - **Download all media** (includes comments and gallery items)
5. Watch progress in the popup status list.

## Permissions (Manifest V3)

- `activeTab`, `tabs`: access active Reddit tab and communicate with page content script.
- `downloads`: save media files.
- `storage`: remember preferred quality.
- Host permissions limited to Reddit domains:
  - `reddit.com`
  - `www.reddit.com`
  - `old.reddit.com`
