# 🎓 OCS Role Checker & Portal Enhancer

A powerful, feature-packed Chrome Extension (Manifest V3) designed specifically for the **Office of Career Services (OCS) portal at IIT Hyderabad (IITH)**. 

It streamlines the campus placement and internship workflow by automatically tracking new job postings, managing priority target companies, highlighting urgent deadlines, and decluttering the portal interface.

---

## 🚀 Key Features

### 1. 📝 Companies Notepad (Floating & Draggable)
A dedicated, dual-column priority notepad docked right inside the portal:
- **Split Priority Lists**: Organised into **⭐ Top Companies** and **👍 Decent Companies** with independent and combined company counters.
- **Smart Auto-Numbering**:
  - Automatically prepends sequential priority numbers as you type (e.g. `1. Google`, `2. Uber`, `3. Tower Research`).
  - Pressing **Enter** automatically generates the next priority number.
  - Pressing **Enter** or **Backspace** on an empty bullet clears it cleanly to a blank line.
  - Deleting, inserting, or reordering companies automatically re-indexes the entire list in sequential priority order.
  - Accurately tracks cursor positions during typing so your flow is never interrupted.
- **Section Headers & Notes Support (`#`)**:
  - Any line starting with `#` (e.g., `# Dream Companies`, `# FinTech / HFT`, `# OA on Sunday`) is treated as a header or note.
  - **Not Numbered**: Headers never receive number prefixes.
  - **Not Counted**: Lines starting with `#` do not advance company priority numbers and are excluded from company counts on all badges and buttons.
- **Draggable & Dockable**: Drag by the header bar anywhere across your screen; double-click the header to quickly reset back to default bottom-right position.
- **Dynamic Corner & Edge Resizing**: Touch/drag any corner (e.g. top-left or bottom-right grips) or border to make the notepad larger or smaller. Your custom dimensions are automatically saved to `chrome.storage.local` and preserved across sessions. Double-click any resize handle to reset to default size.
- **Instant Auto-Save**: Seamlessly debounced saving to `chrome.storage.local` with real-time `Saving...` and `Saved ✓` visual indicators.

---

### 2. 🏢 Live Total Companies Badge
- **Live Pagination Detection**: Automatically detects the exact total company count directly from the portal's MUI DataGrid pagination (e.g., `1–50 of 138` $\rightarrow$ **🏢 Total: 138**).
- **Persistent Across Reloads**: Remembers the latest count so you always know the exact tally even before table renders.
- **Smooth Scroll Shortcut**: Clicking the badge smoothly scrolls your page straight to the job table and footer pagination.
- **Top & Bottom Shortcuts (`⬆` & `⬇`)**: Compact circular buttons at the right edge of the floating dock let you instantly glide to the very top or bottom of the page and table without manual scrolling.

---

### 3. 👁️ Hide & Declutter Roles
- **Row Hover Action**: Adds a sleek `Hide` button to every job row on hover. Hide companies or roles you are not eligible for or not interested in.
- **Floating Show/Hide Toggle**: Quick toggle in the bottom floating bar (`👁️ Show Hidden` / `🙈 Hide Hidden`):
  - **Hide Mode**: Hidden roles are completely removed from the DOM table view.
  - **Show Mode**: Hidden roles appear dimmed and grayscaled with a green `Unhide` button for easy restoration.

---

### 4. 🏷️ Inline Custom Tags & Notes
- **Add Notes to Any Job**: Click the `+ Note` badge on any role title cell to type custom notes (e.g., `OA 22nd Oct`, `Referral requested`, `Shortlisted`).
- **Persistent & Prominent**: Saved notes instantly transform into high-contrast gold badges (`#ffd700`) persisted by posting ID in local storage.
- **React-Safe Interaction**: Built to bypass MUI DataGrid cell-focus re-renders using optimized event propagation.

---

### 5. ⏳ Smart Deadline & Application Highlighting
- **Already Applied**: Automatically tags roles where you've registered with a distinct green badge (`YES` $\rightarrow$ `#d4edda`).
- **Urgent Deadlines (< 24 Hours)**: Highlighted in critical red (`#f8d7da`) so you never miss closing deadlines.
- **Upcoming Deadlines (< 72 Hours)**: Highlighted in warning amber/yellow (`#fff3cd`).
- **Expired Deadlines**: Subdued in neutral gray.

---

### 6. 🔓 Auto-Remove Restrictive Filters
- By default, the OCS portal frequently applies an `Eligibility = Yes` filter which can mistakenly hide newly added roles or roles with pending eligibility updates.
- The extension automatically detects and clears this filter upon page load to ensure you see all available opportunities.

---

### 7. 🔍 Scraper, New Role Detection & Notifications
- **Direct 1-Click Scan from Bottom Dock**: Hit `⚡ Scan Roles` right in the centered macOS dock without having to open the popup.
- **Live Progress Feedback**: Button updates in real-time (`🔄 Filters...`, `🔄 page 1...`, `🔄 Comparing...`) as virtual scroller pages are read.
- **Instant Result & Save**:
  - **No New Roles**: Flashes `✓ Up to date` in soft emerald green.
  - **New Roles Found**: Turns into a glowing `🎉 X New! (Save DB)` pill button. Click once to update your local database snapshot.
- **Automated VirtualScroller Scraper**: Transparently iterates through all pages and virtual DOM rows in the MUI DataGrid.
- **Smart Comparison Engine**: Normalizes role titles and company names to compare current portal listings with your saved database.
- **Desktop Notifications**: Triggers native Chrome alerts displaying newly added company names, job profiles, and CTC packages.

### 8. 📅 OA & PPT Google Calendar Sync
- **1-Click Dock Action (`📅 Sync OAs`)**: Reads your live Google Sheet OA & PPT schedule and cross-references it with all companies where you've marked **`Applied = YES`**.
- **Year 2026 Normalization**: Automatically converts all schedule dates to 2026 and sets appropriate Indian Standard Time (IST) slots.
- **Two Pre-configured Reminders**:
  - 🔔 **10 minutes before** the assessment begins.
  - 🔔 **1 day before** (24 hours alert) to prepare.
- **Zero Duplicates**: Keeps a synced registry in local storage so tapping `Sync OAs` only pulls and notifies you about newly added or updated tests.
- **Seamless Google Calendar Integration**: Generates an auto-importable `.ics` calendar bundle with reminders embedded, alongside direct 1-click Google Calendar web event creation buttons.

---

### 9. 📊 Standalone Database Dashboard
- Access `database/database.html` anytime to browse your full historical archive of scraped roles.
- Features real-time search across company names, role titles, and CTC details.

---

## 📂 Project Structure

```text
OCS_Portal/
├── manifest.json              # Chrome Extension Manifest (MV3)
├── background/
│   └── service-worker.js      # Background worker, scraper runner & notifications
├── content/
│   ├── ocs-scraper.js         # Virtual scroll & multi-page table scraper
│   └── ui-modifier.js         # Floating bar, notepad, tags, deadlines & DOM enhancements
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Dark mode styling for popup
│   └── popup.js               # Scan trigger, progress status & diff display
├── database/
│   ├── database.html          # Standalone offline roles viewer
│   ├── database.css           # Styling for database dashboard
│   └── database.js            # Live search & filtering logic
├── utils/
│   ├── comparison.js          # Role comparison & diff algorithm
│   └── normalization.js       # String normalizer for reliable matching
└── README.md                  # Documentation
```

---

## 🛠️ Installation Guide

Since this is an unpacked Chrome Extension:

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/HarshaVardhanPulavarthi/OCS_Portal_new_role_checker.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `OCS_Portal` root folder (containing `manifest.json`).
6. The extension is installed and ready to use! Pin it to your Chrome toolbar for quick access.

---

## 💡 How to Use

1. **Open the OCS Portal**: Navigate to your IITH OCS placement or internship portal dashboard.
2. **Bottom Floating Action Bar**:
   - View the live total count of companies via `🏢 Total: X`.
   - Click `📝 Notepad` to open your priority company lists.
   - Click `👁️ Show Hidden` to review any hidden roles.
3. **Using the Notepad**:
   - Type company names in preference order (numbers appear automatically).
   - Use `#` at the start of a line to create section headings or notes without numbering.
   - Drag the notepad anywhere on the screen by its header.
4. **Checking for New Roles**:
   - Click the extension icon in your Chrome toolbar.
   - Click **CHECK FOR NEW ROLES**. The scraper will automatically read all table pages.
   - If new roles are detected, review them in the popup and click **SAVE NEW DATABASE**.

---

## 🏷️ Version History
- **v2.0 (main)**: Current release featuring the interactive Companies Notepad (auto-numbering, `#` comments, draggable UI), Live Total count badge, deadline styling, inline notes, and enhanced MUI DataGrid observer.
- **v1.0 (v1 branch)**: Initial release with basic scraper and popup diff viewer.

---

## 🤝 Contributing & License
Maintained for the IIT Hyderabad student community. Contributions, suggestions, and bug reports are welcome!
