# Участие в QuestMaster (плагин Vencord)

**Языки:** [English](CONTRIBUTING.md) · [Русский](CONTRIBUTING.ru.md)

Спасибо за интерес к проекту!

## Автор / мейнтейнер

- Discord: **nandak070** (`1219803151180370021`)
- GitHub: [nanda070](https://github.com/nanda070)
- Сайт: [cheterin.online](https://cheterin.online)

## Как внести вклад

### Issues

1. Проверьте существующие issues
2. Создайте issue с понятным описанием
3. Укажите версию Discord, ОС и сборку Vencord
4. Шаги воспроизведения

### Pull Request

1. Fork
2. Ветка: `git checkout -b feature/amazing-feature`
3. Правки в `questMaster/`
4. Протестируйте в локальном `Vencord/src/userplugins/questMaster`
5. Commit → push → PR

### Стиль

- TypeScript в стиле Vencord
- Устойчивые webpack-finders (`mods.ts`)
- Комментарии к неочевидным внутренностям Discord
- Тесты перед отправкой

### Чеклист тестов

1. Плагин виден во вкладке Plugins
2. Toolbox → Open QuestMaster работает
3. Изменённые типы квестов завершаются
4. Stop откатывает патчи сторов
5. Achievement на desktop через native helpers

## Локальная настройка

1. Клонируйте репозиторий
2. Скопируйте `questMaster` → `Vencord/src/userplugins/questMaster`
3. Rebuild Vencord, перезапустите Discord
4. Включите плагин и тестируйте

## Вопросы?

Issue или связь с **nandak070** в Discord / GitHub.
