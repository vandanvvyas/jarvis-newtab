# JARVIS New Tab (Chrome extension)

Iron Man / J.A.R.V.I.S. themed Material You new tab.

## Install
1. Unzip this folder.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and pick the `jarvis-newtab` folder.
4. Open a new tab.

## Features
- Live clock + date inside an animated arc-reactor HUD; click it for a voice greeting.
- Interactive particle background (reacts to the cursor, click for sparks).
- To-do list: type + Enter, click text to edit, tick circle to cross out.
- Daily protocol: "Fill attendance" and "Enter DR data" alerts at 14:45. Notifications are
  persistent and repeat every 5 min until each item is marked complete (from the
  notification button or the new tab card). Time/interval changeable in Settings.
- 4 glass tabs: Gmail, Claude, Attendance Portal, WhatsApp (open in an in-page glass panel,
  Ctrl/Shift+click or the ↗ button opens a full tab).

## Notes
- Allow Chrome notifications in your OS settings (and turn off Focus/Do Not Disturb at 2:45 PM).
- Some sites may refuse to sign in inside a frame; use ↗ to open them as a normal tab, or
  set "Open sites in → New browser tab" in Settings.

## WhatsApp deadlines (v3.1)
1. Open https://web.whatsapp.com in Chrome and open your "Message yourself" chat. Keep that tab open (pinned is fine).
2. Send yourself a message containing the word "deadline", e.g. `Submit NAAC report deadline 28 Oct 5pm`.
3. It is added to the Task Queue with a due badge. On the due date it also appears in Daily Protocol, and at the due time (11:55 PM if no time was given) a persistent alert repeats until you tick it. Ticking it in either place clears it from both.
You can also type a task containing "deadline" straight into the Task Queue.
Dates understood: today, tomorrow, friday, next monday, in 3 days, 28 Oct, 28/10, 28/10/2026, 5pm, 17:30, noon, EOD. No date = today.

## Cloud sync between profiles (optional, v4)
Off by default — the extension works fully on its own. To share data between e.g. personal and work Chrome profiles:
1. On github.com: Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token. Tick ONLY the **gist** scope. Copy the token.
2. In the extension: gear icon → Cloud sync → paste the token (and, optionally, a passphrase that encrypts the data) → Save.
3. Repeat in the other profile with the SAME token and passphrase. It finds the private Gist automatically.
Synced: tasks/deadlines, links, settings, daily attendance/DR ticks. Checked about every minute and shortly after each change.
