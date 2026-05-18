# Reddit Media Downloader

A Manifest V3 Google Chrome extension to download the highest-resolution media from Reddit posts.

**Made by MikePinku**

## Features

- One-click download from the extension toolbar icon on Reddit pages
- Supports `reddit.com` and `old.reddit.com`
- Downloads high-resolution images, GIFs, and videos
- If multiple media files exist in the post, downloads all available best candidates

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   - `/home/runner/work/reddit-media-downloader/reddit-media-downloader`

## Usage

1. Open a Reddit post page on `reddit.com` or `old.reddit.com`
2. Click the **Reddit Media Downloader** extension icon in the toolbar
3. The extension downloads detected highest-resolution media automatically

## Permissions

- `activeTab`: allows running extraction on the current Reddit tab
- `scripting`: injects the extraction function into the current page
- `downloads`: saves media files to the Downloads folder
- Host permissions:
  - `https://*.reddit.com/*`
  - `https://*.redd.it/*`

## Output Naming

Downloaded files are saved under:

- `reddit-media/<sanitized_post_title>_<post_id>.<ext>`
- If multiple media items are downloaded:
  - `reddit-media/<sanitized_post_title>_<post_id>_1.<ext>`
  - `reddit-media/<sanitized_post_title>_<post_id>_2.<ext>`
