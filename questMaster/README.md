# QuestMaster — Vencord Plugin

**Languages:** [English](../README.md) · [Русский](../README.ru.md)

Auto-complete Discord Quests with an in-app dashboard. Drop this folder into Vencord `src/userplugins/`.

## Author

- Discord: **nandak070** (`1219803151180370021`)
- GitHub: [nanda070](https://github.com/nanda070)
- Website: [cheterin.online](https://cheterin.online)

## Install

1. Build [Vencord from source](https://docs.vencord.dev/installing/)
2. Copy this `questMaster` folder to `Vencord/src/userplugins/questMaster`
3. Rebuild Vencord (`pnpm build` / `npm run build`)
4. Restart Discord
5. Enable **QuestMaster** in Settings → Vencord → Plugins
6. Open via **Vencord Toolbox → Open QuestMaster** (or enable *Auto-start* in plugin settings)

## Files

| File | Purpose |
|------|---------|
| `index.tsx` | Plugin entry, settings, toolbox action |
| `engine.ts` | Dashboard UI + quest automation |
| `mods.ts` | Webpack store/API resolution |
| `native.ts` | CSP-free discordsays requests (desktop) |
| `settings.ts` | Plugin settings schema |
| `constants.ts` | Author, events, icons |
| `styles.css` | Dashboard styles |

## Disclaimer

Educational use only. Automation may violate [Discord ToS](https://discord.com/terms). Use at your own risk.
