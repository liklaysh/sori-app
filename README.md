# SORI App

Десктопный клиент SORI на базе Tauri v2, React, Vite, Zustand, Tailwind, Socket.io, LiveKit и Sonner.

SORI App — это пользовательский desktop-клиент. Админ-панель SORI остаётся доступной только через web-интерфейс сервера по админским учётным данным.

<p>
  Русский | <a href="./README.en.md">English</a>
</p>

Клиент подключается к существующему серверу SORI через bootstrap discovery:

```text
https://<domain>/.well-known/sori/client.json
```

Fallback endpoint:

```text
https://<domain>/client/bootstrap
```

## Разработка

```bash
npm install
npm run dev
```

Dev-shell Tauri:

```bash
npm run tauri:dev
```

Production web build:

```bash
npm run build
```

Native desktop builds подготовлены для будущих GitHub Actions runners. Для локальной frontend-разработки они не обязательны:

```bash
npm run tauri:build
```

Архитектурные заметки: [docs/CLIENT_ARCHITECTURE.md](docs/CLIENT_ARCHITECTURE.md).

Сборка и релизы: [docs/BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md).

Тестовые desktop-сборки:

1. Запушить ветку `sori-app-win`.
2. Открыть GitHub Actions.
3. Запустить **Windows Desktop Build** / **macOS Desktop Build** или дождаться запуска по push.
4. Скачать artifact `sori-app-windows-installer` или `sori-app-macos-dmg`.

Smoke checklist первого запуска: [docs/TESTING.md](docs/TESTING.md).
