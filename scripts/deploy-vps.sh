#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ryan-rover}"
ENV_DIR="${ENV_DIR:-/etc/ryan-rover}"
REPO_URL="${REPO_URL:-https://github.com/ObamaObama444/-_-.git}"
BRANCH="${BRANCH:-codex/deploy-bot-test}"
DOMAIN="${DOMAIN:-adolanna.ru}"
WWW_DOMAIN="${WWW_DOMAIN:-www.adolanna.ru}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo BOT_TOKEN=... bash scripts/deploy-vps.sh" >&2
  exit 1
fi

if [[ -z "${BOT_TOKEN:-}" ]]; then
  echo "BOT_TOKEN is required" >&2
  exit 1
fi

apt-get update
apt-get install -y git nginx python3 ca-certificates

if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

install -d -m 0750 -o root -g www-data "${ENV_DIR}"
cat > "${ENV_DIR}/ryan-rover.env" <<ENV
BOT_TOKEN=${BOT_TOKEN}
WEBAPP_URL=https://${WWW_DOMAIN}
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=INFO
ENV
chmod 0640 "${ENV_DIR}/ryan-rover.env"
chown -R www-data:www-data "${APP_DIR}"

install -m 0644 "${APP_DIR}/deploy/ryan-rover.service" /etc/systemd/system/ryan-rover.service
install -m 0644 "${APP_DIR}/deploy/nginx.conf" /etc/nginx/sites-available/ryan-rover
sed -i "s/server_name .*/server_name ${DOMAIN} ${WWW_DOMAIN};/" /etc/nginx/sites-available/ryan-rover
ln -sf /etc/nginx/sites-available/ryan-rover /etc/nginx/sites-enabled/ryan-rover
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable ryan-rover
systemctl restart ryan-rover
systemctl reload nginx

systemctl --no-pager --full status ryan-rover
curl -fsS "http://127.0.0.1:3000/health"
echo
