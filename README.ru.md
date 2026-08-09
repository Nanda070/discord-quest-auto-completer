<div align="center">

# QuestMaster

**Автозавершение квестов Discord — прямо в клиенте.**

[English](README.md) · [Русский](README.ru.md)

[![Vencord](https://img.shields.io/badge/Vencord-userplugin-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://docs.vencord.dev/)
[![Version](https://img.shields.io/badge/v2.0.0-111827?style=for-the-badge)](questMaster/constants.ts)
[![License](https://img.shields.io/badge/MIT-0A0A0A?style=for-the-badge)](LICENSE)
[![Desktop](https://img.shields.io/badge/Discord-Desktop-23A559?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/download)

видео · игры · стримы · активности · достижения

<sub>автор <b>Nanda</b> · <a href="https://cheterin.online">cheterin.online</a></sub>

</div>

---

> [!WARNING]
> **Только для обучения.** Автоматизация квестов может нарушать [Условия Discord](https://discord.com/terms). Ответственность за использование — на вас.

---

## Зачем QuestMaster

Живая панель: принимает квесты, гоняет прогресс и закрывает их — не выходя из Discord.

| | |
|:--|:--|
| **UI в клиенте** | Перетаскиваемая панель, прогресс, фильтры, логи |
| **Под Vencord** | Скопировал в `userplugins`, собрал, включил — без DevTools |
| **Типы квестов** | Видео, игра, стрим, активность, достижения |
| **Desktop-путь** | Native-хелперы для achievements (мимо CSP) |
| **Гибкие настройки** | Auto-enroll, auto-claim, параллельность, лог в файл |
| **Чистый stop** | Откатывает патчи сторов Discord |

---

## Установка — плагин Vencord

Рекомендуемый способ. Лучше всего на **Discord Desktop**.

```text
1  Соберите Vencord из исходников
   → https://docs.vencord.dev/installing/

2  Скопируйте папку
   questMaster/  →  Vencord/src/userplugins/questMaster/

3  Пересоберите и перезапустите Discord
   pnpm build

4  Включите QuestMaster
   Settings → Vencord → Plugins

5  Откройте панель
   Vencord Toolbox → Open QuestMaster
   (или оставьте Auto-start)
```

Вставка в консоль не нужна.

---

<details>
<summary><b>Запасной вариант — консольный скрипт</b> <code>quest_completer.js</code></summary>

Если Vencord недоступен. Вставлять заново после каждой перезагрузки Discord.

1. Discord → **Discover → Quests**, примите нужные квесты  
2. DevTools → **Console** (`Ctrl+Shift+I` / `Cmd+Option+I`)  
3. Введите `allow pasting` → Enter  
4. Вставьте [`quest_completer.js`](quest_completer.js) → Enter  
5. Выберите квесты → **START**

| | Плагин | Консоль |
|:--|:--|:--|
| Установка | Один раз + rebuild | Каждый сеанс |
| Achievements | Native helpers | Часто режет CSP |
| После reload | Остаётся | Пропадает |

Скрыть UI: `>` или `Shift+.`. Остановка — **STOP**.

</details>

---

## Настройки

| Опция | По умолч. | Что делает |
|:------|:---------:|:-----------|
| Auto-start | Вкл | Открывать панель при загрузке плагина |
| Auto-enroll | Вкл | Принимать квесты перед запуском |
| Auto-claim | Выкл | Автоматически забирать награды |
| File logging | Вкл | Писать в `Documents/QuestMaster/questmaster.log` |
| Concurrent games | 1 | Параллельные game / stream / activity |
| Concurrent videos | 3 | Параллельные video-квесты |
| Sound | Выкл | Звук при завершении |
| Random delay | Выкл | Пауза 1–30 мин между циклами |
| Hide activity | Выкл | Скрыть фейковый Rich Presence |

---

## Типы квестов

| Тип | Как работает | Нужно |
|:----|:-------------|:------|
| `WATCH_VIDEO` | Спуф `video-progress` | — |
| `PLAY_ON_DESKTOP` | Фейковый процесс + heartbeat стора | Desktop |
| `STREAM_ON_DESKTOP` | Спуф stream metadata | Desktop + стрим кому-то |
| `PLAY_ACTIVITY` | Heartbeat в голосовом | Voice-канал |
| `ACHIEVEMENT_IN_ACTIVITY` | OAuth + native `discordsays` | Desktop Vencord |

---

## Структура

```text
discord-quest-auto-completer/
├── questMaster/           ← плагин Vencord
│   ├── index.tsx
│   ├── engine.ts
│   ├── mods.ts
│   ├── native.ts
│   ├── settings.ts
│   ├── constants.ts
│   └── styles.css
├── quest_completer.js     консольный fallback
├── README.md / README.ru.md
├── SECURITY.md / SECURITY.ru.md
└── LICENSE
```

---

## Проблемы

| Симптом | Что сделать |
|:--------|:------------|
| Плагина нет в списке | Путь `src/userplugins/questMaster` → rebuild → рестарт |
| Modules missing | Discord обновился — проверьте `mods.ts` |
| Achievement не идёт | Нужен **Desktop** + Vencord |
| API 404 / HTML-страницы | Обновите QuestMaster |
| Rate limited | Подождите или перезагрузите Discord |
| CAPTCHA при клейме | Пройдите в UI Discord |
| Консоль блокирует вставку | Сначала `allow pasting` |
| Нет панели (скрипт) | Reload Discord → подождите → вставьте снова |

---

## Связь

| | |
|:--|:--|
| Discord | **nandak070** (`1219803151180370021`) |
| GitHub | [nanda070](https://github.com/nanda070) |
| Сайт | [cheterin.online](https://cheterin.online) |

---

## Безопасность

Уязвимости — только приватно: [SECURITY.ru.md](SECURITY.ru.md).

---

## Лицензия

[MIT](LICENSE) для репозитория. Код в `questMaster/` также с заголовками **GPL-3.0-or-later** (совместимость с Vencord).

---

<div align="center">
<sub>Для тех, кто хочет закрыть квесты — а не жить в Discover.</sub><br>
<strong>Nanda</strong> · <a href="https://github.com/nanda070">GitHub</a> · <a href="https://cheterin.online">cheterin.online</a>
</div>
