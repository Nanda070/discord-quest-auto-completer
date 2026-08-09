# Contributing to QuestMaster (Vencord Plugin)

**Languages:** [English](CONTRIBUTING.md) · [Русский](CONTRIBUTING.ru.md)

Thanks for contributing!

## Author / Maintainer

- Discord: **nandak070** (`1219803151180370021`)
- GitHub: [nanda070](https://github.com/nanda070)
- Website: [cheterin.online](https://cheterin.online)

## How to Contribute

### Reporting Issues

1. Check existing issues
2. Open a new issue with a clear title and description
3. Include Discord version, OS, and Vencord build info
4. Steps to reproduce

### Pull Requests

1. Fork the repository
2. Branch: `git checkout -b feature/amazing-feature`
3. Edit files under `questMaster/`
4. Test inside a local Vencord `src/userplugins/questMaster` install
5. Commit, push, open a PR

### Code Style

- TypeScript (match Vencord conventions)
- Keep webpack finders resilient (`mods.ts`)
- Comment non-obvious Discord internals
- Test before submitting

### Testing checklist

1. Plugin loads in Vencord Plugins tab
2. Toolbox → Open QuestMaster works
3. Quest types you changed still complete
4. Stop restores RunningGameStore / stream patches
5. Achievement path works on desktop (native helpers)

## Local setup

1. Clone this repo
2. Copy `questMaster` → `Vencord/src/userplugins/questMaster`
3. Rebuild Vencord, restart Discord
4. Enable the plugin and test

## Questions?

Open an issue or contact **nandak070** on Discord / GitHub.
