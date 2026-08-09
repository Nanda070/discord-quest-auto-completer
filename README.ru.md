# QuestMaster — Автозавершение квестов Discord (плагин Vencord)

**Языки:** [English](README.md) · [Русский](README.ru.md)

<p align="center">
  <b>Плагин Vencord для автозавершения квестов Discord с панелью внутри клиента</b><br>
  <sub>Видео · Игры · Стримы · Активности · Достижения</sub>
</p>

## Автор

| | |
|---|---|
| Discord | **nandak070** (`1219803151180370021`) |
| GitHub | [nanda070](https://github.com/nanda070) |
| Сайт | [cheterin.online](https://cheterin.online) |

## Отказ от ответственности

> Только для образовательных целей. Автоматизация может нарушать [Условия Discord](https://discord.com/terms). **На свой риск.**

## Установка (userplugin)

1. Соберите [Vencord из исходников](https://docs.vencord.dev/installing/)
2. Скопируйте папку `questMaster` в:
   ```
   Vencord/src/userplugins/questMaster
   ```
3. Пересоберите Vencord и перезапустите Discord
4. Включите **QuestMaster**: **Settings → Vencord → Plugins**
5. Откройте через **Vencord Toolbox → Open QuestMaster**  
   (или включите **Auto-start** в настройках плагина)

> С плагином вставка в DevTools не нужна.

## Консольный скрипт (`quest_completer.js`)

Без Vencord можно использовать оригинальный скрипт для консоли.

### Когда использовать
- Нет Vencord / нельзя собрать из исходников
- Разовый запуск без установки плагина

### Как пользоваться
1. Откройте **Discord Desktop** (или веб) → **Discover → Quests**
2. Примите нужные квесты
3. Откройте **Developer Tools** (`Ctrl+Shift+I` на Windows, `Cmd+Option+I` на Mac)
4. Вкладка **Console**
5. Введите `allow pasting` и нажмите Enter
6. Вставьте содержимое [`quest_completer.js`](quest_completer.js) и нажмите Enter
7. Появится панель QuestMaster — выберите квесты и нажмите **START**

> Скрыть/показать UI: `>` или `Shift+.`. **STOP** — корректная остановка.

### Сравнение
| | Плагин Vencord (`questMaster/`) | Консольный скрипт (`quest_completer.js`) |
|---|---|---|
| Установка | Копия в Vencord + rebuild | Вставка в DevTools каждый раз |
| Achievements | Native helpers (лучше на desktop) | Может нужен relay / упрётся в CSP |
| Сессия | Пока плагин включён | Пропадает после перезагрузки Discord |

## Возможности

| Функция | Описание |
|---------|----------|
| Поиск квестов | Список с фильтрами |
| Video / Game / Stream / Activity | Те же методы автоматизации |
| Achievement bypass | Native-запросы к discordsays (без CSP на desktop) |
| Панель | Перетаскиваемый UI с прогрессом |
| Auto-enroll / Auto-claim | В настройках плагина |
| Лимиты API | Очередь + backoff |
| Чистый stop | Откат патчей сторов |

## Настройки

| Опция | По умолчанию | Описание |
|-------|--------------|----------|
| Auto-enroll | Вкл | Принимать квесты перед запуском |
| Auto-claim | Выкл | Автоклейм наград |
| Sound | Выкл | Звук при завершении |
| Random delay | Выкл | Паузы 1–30 мин |
| Hide activity | Выкл | Скрыть фейковый Rich Presence |
| Auto-start | Выкл | Открывать UI при включении плагина |

## Типы квестов

| Тип | Метод | Примечание |
|-----|-------|-----------|
| `WATCH_VIDEO` | спуф video-progress | ~2–4 мин |
| `PLAY_ON_DESKTOP` | фейковый процесс + heartbeat | Desktop |
| `STREAM_ON_DESKTOP` | спуф stream metadata | Desktop |
| `PLAY_ACTIVITY` | heartbeat в голосе | Нужен voice-канал |
| `ACHIEVEMENT_IN_ACTIVITY` | OAuth + native proxy | Desktop Vencord |

## Структура

```
discord-quest-auto-completer/
├── questMaster/                 # плагин Vencord ← в src/userplugins/
│   ├── index.tsx
│   ├── engine.ts
│   ├── mods.ts
│   ├── native.ts
│   ├── settings.ts
│   ├── constants.ts
│   ├── styles.css
│   └── README.md
├── quest_completer.js           # консольный вариант — вставить в DevTools
├── README.md / README.ru.md
└── …
```

## Проблемы

| Проблема | Решение |
|----------|---------|
| Плагина нет | Проверьте путь и rebuild |
| Modules not found | Discord обновился — правьте `mods.ts` |
| Achievement не работает | Нужен Discord Desktop + Vencord |
| Rate limited | Подождите или перезагрузите |
| CAPTCHA | Пройдите вручную в Discord |
| Вставка в консоль запрещена | Сначала введите `allow pasting` |
| Панель не появляется (скрипт) | Перезагрузите Discord, подождите и вставьте снова |

## Участие

[CONTRIBUTING.md](CONTRIBUTING.md) / [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md).

## Лицензия

Документация репозитория — MIT где применимо; код плагина — **GPL-3.0-or-later** (Vencord). См. заголовки файлов и [LICENSE](LICENSE).

## Благодарности

Основано на идее консольного QuestMaster. Плагин Vencord поддерживает **nandak070**.
