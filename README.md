<div align="center">

# QuestMaster

**Auto-complete Discord Quests — inside Discord.**

[English](README.md) · [Русский](README.ru.md)

<br>

[![Vencord](https://img.shields.io/badge/Vencord-userplugin-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://docs.vencord.dev/)
[![Version](https://img.shields.io/badge/v2.0.0-111827?style=for-the-badge)](questMaster/constants.ts)
[![License](https://img.shields.io/badge/MIT-0A0A0A?style=for-the-badge)](LICENSE)
[![Desktop](https://img.shields.io/badge/Discord-Desktop-23A559?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/download)

<br>

video · game · stream · activity · achievements

<br>

<sub>
  by <a href="https://github.com/nanda070"><b>nandak070</b></a>
  · <a href="https://cheterin.online">cheterin.online</a>
  · Discord <code>1219803151180370021</code>
</sub>

</div>

---

> [!WARNING]
> **Educational use only.** Quest automation can violate the [Discord Terms of Service](https://discord.com/terms). You are solely responsible for how you use this software.

---

## Why QuestMaster

A live dashboard that enrolls, progresses, and finishes Discord quests without leaving the client.

| | |
|:--|:--|
| **In-app UI** | Draggable panel with live progress, filters, and logs |
| **Vencord-native** | Drop into `userplugins`, rebuild, enable — no DevTools paste |
| **Quest coverage** | Video, desktop game, stream, activity, achievements |
| **Safer desktop path** | Native helpers for achievement apps (no CSP wall) |
| **Configurable** | Auto-enroll, auto-claim, concurrency, file logging |
| **Clean exit** | Restores patched Discord stores when you stop |

---

## Install — Vencord plugin

Recommended path. Works best on **Discord Desktop**.

```text
1  Build Vencord from source
   → https://docs.vencord.dev/installing/

2  Copy this folder
   questMaster/  →  Vencord/src/userplugins/questMaster/

3  Rebuild & restart Discord
   pnpm build

4  Enable QuestMaster
   Settings → Vencord → Plugins

5  Open the dashboard
   Vencord Toolbox → Open QuestMaster
   (or leave Auto-start on)
```

That’s it — no console pasting required.

---

<details>
<summary><b>Fallback — console script</b> <code>quest_completer.js</code></summary>

<br>

Use when you can’t install Vencord. Paste once per Discord session.

1. Open Discord → **Discover → Quests** and accept the quests you want  
2. DevTools → **Console** (`Ctrl+Shift+I` / `Cmd+Option+I`)  
3. Type `allow pasting` → Enter  
4. Paste [`quest_completer.js`](quest_completer.js) → Enter  
5. Pick quests → **START**

| | Plugin | Console script |
|:--|:--|:--|
| Setup | Copy + rebuild once | Paste every session |
| Achievements | Native helpers | Often blocked by CSP |
| After reload | Still there | Gone |

Hide UI: `>` or `Shift+.`. Stop cleanly with **STOP**.

</details>

---

## Settings

| Setting | Default | What it does |
|:--------|:-------:|:-------------|
| Auto-start | On | Open dashboard when the plugin loads |
| Auto-enroll | On | Accept quests before running |
| Auto-claim | Off | Claim rewards automatically |
| File logging | On | Write to `Documents/QuestMaster/questmaster.log` |
| Concurrent games | 1 | Parallel game / stream / activity quests |
| Concurrent videos | 3 | Parallel video quests |
| Sound | Off | Cue on completion |
| Random delay | Off | 1–30 min gap between cycles |
| Hide activity | Off | Hide spoofed Rich Presence |

---

## Quest types

| Type | How it works | Needs |
|:-----|:-------------|:------|
| `WATCH_VIDEO` | Spoofs `video-progress` | — |
| `PLAY_ON_DESKTOP` | Fake running process + store heartbeats | Desktop |
| `STREAM_ON_DESKTOP` | Stream metadata spoof | Desktop + live stream to someone |
| `PLAY_ACTIVITY` | Voice-channel heartbeat | Voice channel |
| `ACHIEVEMENT_IN_ACTIVITY` | OAuth + native `discordsays` proxy | Desktop Vencord |

---

## Layout

```text
discord-quest-auto-completer/
├── questMaster/           ← Vencord userplugin
│   ├── index.tsx          entry, toolbox, settings
│   ├── engine.ts          dashboard + automation
│   ├── mods.ts            webpack / RestAPI
│   ├── native.ts          file log + discordsays
│   ├── settings.ts
│   ├── constants.ts
│   └── styles.css
├── quest_completer.js     console fallback
├── README.md / README.ru.md
├── SECURITY.md / SECURITY.ru.md
└── LICENSE
```

---

## Troubleshooting

| Symptom | Fix |
|:--------|:----|
| Plugin not listed | Path must be `src/userplugins/questMaster` → rebuild → restart |
| Modules missing | Discord updated — check finders in `mods.ts` |
| Achievement fails | Use **Desktop** Discord + Vencord (native helpers) |
| API 404 / HTML pages | Wrong HTTP client — update to latest QuestMaster |
| Rate limited | Wait, or reload Discord |
| CAPTCHA on claim | Solve it in Discord’s own UI |
| Console paste blocked | Type `allow pasting` first |
| No dashboard (script) | Reload Discord, wait a few seconds, paste again |

---

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

---

## License

[MIT](LICENSE) for this repository. Sources under `questMaster/` also carry **GPL-3.0-or-later** headers for Vencord compatibility.

---

<div align="center">

<sub>Built for people who want quests done — not a second job.</sub>

<br><br>

**nandak070** · [GitHub](https://github.com/nanda070) · [cheterin.online](https://cheterin.online)

</div>
