<div align="center">

# QuestMaster

**Vencord userplugin** — auto-complete Discord Quests with an in-app dashboard.

[English](../README.md) · [Русский](../README.ru.md)

[![Vencord](https://img.shields.io/badge/drop_into-src/userplugins-5865F2?style=flat-square&logo=discord&logoColor=white)](https://docs.vencord.dev/)
[![v2.0.0](https://img.shields.io/badge/v2.0.0-111827?style=flat-square)](constants.ts)

</div>

---

## Install

```bash
# 1. Vencord from source → https://docs.vencord.dev/installing/
# 2. Copy this folder:
cp -r questMaster  Vencord/src/userplugins/questMaster

# 3. Rebuild & restart Discord
cd Vencord && pnpm build
```

Then: **Settings → Vencord → Plugins → QuestMaster**  
Open via **Toolbox → Open QuestMaster** (or Auto-start).

---

## Files

| File | Role |
|:-----|:-----|
| `index.tsx` | Plugin entry, settings, toolbox action |
| `engine.ts` | Dashboard + quest automation |
| `mods.ts` | Webpack stores + RestAPI |
| `native.ts` | File logging + CSP-free `discordsays` |
| `settings.ts` | Settings schema |
| `constants.ts` | Name, version, author, icons |
| `styles.css` | Dashboard styles |

---

## Author

**nandak070** · Discord `1219803151180370021` · [GitHub](https://github.com/nanda070) · [cheterin.online](https://cheterin.online)

---

> [!WARNING]
> Educational use only. May violate [Discord ToS](https://discord.com/terms). Use at your own risk.
