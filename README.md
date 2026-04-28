# Райн-ровер Telegram Mini App

Python backend + чистый HTML/CSS/JS frontend для Telegram Mini App.

Бот: `https://t.me/RaianRoverYandex_bot`  
Mini App URL: `https://www.adolanna.ru`

## Что внутри

```text
app.py                    # HTTP server + Telegram Bot API long polling
.env.example              # пример переменных без секретов
deploy/nginx.conf         # nginx reverse proxy для домена
deploy/ryan-rover.service # systemd unit
scripts/deploy-vps.sh     # установка/обновление на Ubuntu VPS
web/index.html            # HTML
web/styles.css            # CSS
web/app.js                # JS flow: welcome -> start -> loading -> result
public/assets/            # ассеты из Figma
```

Проект не требует Node.js, npm, pip и Docker. Нужен только Python 3.10+.

## Быстрый деплой на ВМ

```bash
curl -fsSL https://raw.githubusercontent.com/ObamaObama444/-_-/codex/deploy-bot-test/scripts/deploy-vps.sh -o /tmp/deploy-vps.sh
sudo BOT_TOKEN="telegram-bot-token" bash /tmp/deploy-vps.sh
```

Проверка на самой ВМ:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

Ожидаемо:

```json
{"ok": true, "service": "ryan-rover-miniapp", "bot": true}
```

## Обновление на ВМ

```bash
cd /opt/ryan-rover
sudo BRANCH=codex/deploy-bot-test BOT_TOKEN="telegram-bot-token" bash scripts/deploy-vps.sh
```

Скрипт ставит `git`, `nginx`, `python3`, создает `/etc/ryan-rover/ryan-rover.env`, устанавливает `systemd` сервис и nginx proxy для `adolanna.ru` / `www.adolanna.ru`.

HTTPS включается после того, как DNS домена указывает на сервер:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d adolanna.ru -d www.adolanna.ru
curl https://www.adolanna.ru/health
```

Логи бота: `journalctl -u ryan-rover -f`

## Как проверить в Telegram

1. Открой `https://t.me/RaianRoverYandex_bot`.
2. Напиши `/start`.
3. Нажми кнопку `Открыть Райн-ровер`.
4. Если меню Telegram уже обновилось, можно открыть Mini App через кнопку меню бота.
