# OCS Role Checker

A Chrome Extension that scrapes and checks for new roles on the OCS portal.

## Features
- **Check for New Roles**: Quickly scrape the portal to see if any new roles have been posted.
- **Save New Database**: Update the local storage with the latest roles so you can track what's new.
- **Manage Hidden Roles**: Hide roles you aren't interested in to declutter your view.
- **Notifications**: Get alerted when new roles are detected.

## Installation

Since this extension is loaded manually, follow these steps to install it in Google Chrome:

1. Download or clone this repository to your local machine:
   ```bash
   git clone https://github.com/HarshaVardhanPulavarthi/OCS_Portal_new_role_checker.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** by toggling the switch in the top right corner.
4. Click on the **"Load unpacked"** button in the top left.
5. Select the `OCS_Portal` folder where you cloned or extracted this repository.
6. The extension is now installed and will appear in your Chrome toolbar!

## Usage
1. Pin the extension to your toolbar for easy access.
2. Navigate to the OCS portal.
3. Click the extension icon to open the popup.
4. Use the provided buttons to check for roles, save databases, or manage hidden roles.

## Versions
- **v3.0 (beta)**: Added Google Calendar Sync integration for applied roles.
- **v2.0 (main)**: The current version with the latest UI modifications.
- **v1.0 (v1 branch)**: The initial version of the extension. You can access it via the `v1` branch or the GitHub Releases page.

## Calendar Sync (v3 Beta)

Version 3 introduces the ability to automatically sync PPT and OA schedules to your Google Calendar for companies you've applied to.

**Setup Instructions:**
1. Open [script.google.com](https://script.google.com/) and create a **New project**.
2. Copy the entire contents of `sheets/calendar_sync.js` from this repository and paste it into the editor (replace the default code).
3. Click **Deploy > New deployment** (or Manage deployments > New Version).
4. Set the **type** to **Web app**.
5. Set **Execute as** to **Me**.
6. Set **Who has access** to **Anyone**.
7. Click **Deploy** (authorize the application if prompted) and copy the **Web app URL**.
8. Open the OCS Role Checker extension popup. 
9. Paste your shared OCS Schedule Google Sheet URL into the first box.
10. Paste your Web app URL into the second box.
11. Run a scan to find your applied roles, then click **SYNC APPLIED TO CALENDAR**.

*Note: The sync script automatically skips duplicate events and fixes Google Sheets historical date parsing issues (forcing events into the current year).*
