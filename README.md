# QuestMaster — Discord Quest Auto Completer (Vencord Plugin)

**Languages:** [English](README.md) · [Русский](README.ru.md)

<p align="center">
  <b>Vencord plugin that auto-completes Discord quests with an in-app dashboard</b><br>
  <sub>Video · Game · Stream · Activity · Achievements</sub>
</p>

## Author

| | |
|---|---|
| Discord | **nandak070** (`1219803151180370021`) |
| GitHub | [nanda070](https://github.com/nanda070) |
| Website | [cheterin.online](https://cheterin.online) |

## Disclaimer

> Educational purposes only. Automation may violate [Discord Terms of Service](https://discord.com/terms). **Use at your own risk.**

## Install (Vencord userplugin)

1. Install / build [Vencord from source](https://docs.vencord.dev/installing/)
2. Copy the `questMaster` folder into:
   ```
   Vencord/src/userplugins/questMaster
   ```
3. Rebuild Vencord and restart Discord
4. Enable **QuestMaster** under **Settings → Vencord → Plugins**
5. Open it from **Vencord Toolbox → Open QuestMaster**  
   (or turn on **Auto-start** in the plugin settings)

> With the plugin, no DevTools paste is required.

## Console script (`quest_completer.js`)

If you do not use Vencord, you can still run the original console script.

### When to use it
- No Vencord / cannot build from source
- Quick one-off run without installing a plugin

### How to use
1. Open **Discord Desktop** (or web) and go to **Discover → Quests**
2. Accept the quests you want
3. Open **Developer Tools** (`Ctrl+Shift+I` on Windows, `Cmd+Option+I` on Mac)
4. Open the **Console** tab
5. Type `allow pasting` and press Enter
6. Paste the full contents of [`quest_completer.js`](quest_completer.js) and press Enter
7. The QuestMaster dashboard appears — select quests and click **START**

> Hide/show UI: `>` or `Shift+.`. Click **STOP** for a clean shutdown.

### Notes
| | Vencord plugin (`questMaster/`) | Console script (`quest_completer.js`) |
|---|---|---|
| Install | Copy into Vencord + rebuild | Paste into DevTools each session |
| Achievements | Native helpers (best on desktop) | May need relay / may hit CSP |
| Persistence | Stays until you disable the plugin | Lost on Discord reload |

## Features

| Feature | Description |
|---------|-------------|
| Smart quest detection | Lists available quests with filters |
| Video / Game / Stream / Activity | Same automation methods as before |
| Achievement bypass | Native `discordsays` helpers (no CSP block on desktop) |
| Dashboard | Draggable UI with live progress |
| Auto-enroll / Auto-claim | Configurable in plugin settings |
| Rate-limit handling | Queue + exponential backoff |
| Clean shutdown | Restores patched Discord stores on stop |

## Settings

| Option | Default | Description |
|--------|---------|-------------|
| Auto-enroll | On | Accept quests before running |
| Auto-claim | Off | Claim rewards automatically |
| Sound on completion | Off | Audio cue |
| Random delay | Off | 1–30 min gaps between cycles |
| Hide activity | Off | Hide spoofed Rich Presence |
| Auto-start | Off | Open UI when the plugin enables |

## Quest Types

| Type | Method | Notes |
|------|--------|-------|
| `WATCH_VIDEO` | video-progress spoof | ~2–4 min |
| `PLAY_ON_DESKTOP` | fake process + heartbeat | Desktop |
| `STREAM_ON_DESKTOP` | stream metadata spoof | Desktop |
| `PLAY_ACTIVITY` | voice heartbeat | Needs a voice channel |
| `ACHIEVEMENT_IN_ACTIVITY` | OAuth + native proxy | Desktop Vencord |

## Project Structure

```
discord-quest-auto-completer/
├── questMaster/                 # Vencord userplugin ← copy to src/userplugins/
│   ├── index.tsx
│   ├── engine.ts
│   ├── mods.ts
│   ├── native.ts
│   ├── settings.ts
│   ├── constants.ts
│   ├── styles.css
│   └── README.md
├── quest_completer.js           # Console fallback — paste into DevTools
├── README.md / README.ru.md
├── CODE_OF_CONDUCT.md(.ru.md)
├── CONTRIBUTING.md(.ru.md)
├── SECURITY.md(.ru.md)
└── LICENSE
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Plugin missing | Confirm path `src/userplugins/questMaster` and rebuild |
| Modules not found | Discord updated — update finders in `mods.ts` |
| Achievement fails | Needs Discord **Desktop** + Vencord (native helpers) |
| Rate limited | Wait or reload Discord |
| CAPTCHA on claim | Complete captcha manually in Discord UI |
| Console paste blocked | Type `allow pasting` in the Console first |
| Dashboard missing (script) | Reload Discord, wait a few seconds, paste again |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) / [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md).

## License

MIT for repository docs where applicable; plugin sources use **GPL-3.0-or-later** (Vencord). See file headers and [LICENSE](LICENSE).

## Credits

Based on the original QuestMaster console script concept. Maintained as a Vencord plugin by **nandak070**.
