#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: $0 <mission_id> <base_url> <robot_token> <rtsp_url>" >&2
  exit 2
fi

MISSION_ID="$1"
BASE_URL="$2"
ROBOT_TOKEN="$3"
RTSP_URL="$4"

ROS_CONTAINER="${ROS_CONTAINER:-ros}"
ROVER_REPO="${ROVER_REPO:-$HOME/rover-88}"
MISSION_SCRIPT_HOST="${MISSION_SCRIPT_HOST:-$ROVER_REPO/проезд/drive_scan_classify_mission.py}"
MISSION_POINTS_HOST="${MISSION_POINTS_HOST:-$ROVER_REPO/проезд/sticker_points.yaml}"
MISSION_DWELL_SEC="${MISSION_DWELL_SEC:-5.0}"
MISSION_MIN_FRAME_COUNT="${MISSION_MIN_FRAME_COUNT:-4}"
MISSION_FFMPEG_TIMEOUT_SEC="${MISSION_FFMPEG_TIMEOUT_SEC:-45}"
MISSION_PREPARE_LOCALIZATION="${MISSION_PREPARE_LOCALIZATION:-1}"
MISSION_MAP_FILE="${MISSION_MAP_FILE:-/root/maps/labyrint.yaml}"
MISSION_START_X="${MISSION_START_X:--1.123}"
MISSION_START_Y="${MISSION_START_Y:-2.226}"
MISSION_START_QZ="${MISSION_START_QZ:-0.0}"
MISSION_START_QW="${MISSION_START_QW:-1.0}"

if [ -d "$ROVER_REPO/.git" ]; then
  git -C "$ROVER_REPO" pull --ff-only origin main || echo "warning: could not update $ROVER_REPO" >&2
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$ROS_CONTAINER"; then
  echo "ROS container '$ROS_CONTAINER' is not running" >&2
  exit 1
fi

docker exec "$ROS_CONTAINER" mkdir -p /src/scripts /src/maps
docker cp "$MISSION_SCRIPT_HOST" "$ROS_CONTAINER:/src/scripts/drive_scan_classify_mission.py"
docker cp "$MISSION_POINTS_HOST" "$ROS_CONTAINER:/src/maps/sticker_points.yaml"
docker exec "$ROS_CONTAINER" chmod +x /src/scripts/drive_scan_classify_mission.py
docker exec "$ROS_CONTAINER" bash -lc \
  "grep -q '111.88.243.193 www.adolanna.ru adolanna.ru' /etc/hosts || echo '111.88.243.193 www.adolanna.ru adolanna.ru' >> /etc/hosts"

if [ "$MISSION_PREPARE_LOCALIZATION" != "0" ]; then
  docker exec "$ROS_CONTAINER" bash -ic \
    "/root/prep_route.sh '$MISSION_MAP_FILE' '$MISSION_START_X' '$MISSION_START_Y' '$MISSION_START_QZ' '$MISSION_START_QW'"
fi

docker exec \
  -e MISSION_ID="$MISSION_ID" \
  -e MINIAPP_BASE_URL="$BASE_URL" \
  -e ROBOT_PUSH_TOKEN="$ROBOT_TOKEN" \
  -e ROBOT_RTSP_URL="$RTSP_URL" \
  -e MISSION_DWELL_SEC="$MISSION_DWELL_SEC" \
  -e MISSION_MIN_FRAME_COUNT="$MISSION_MIN_FRAME_COUNT" \
  -e MISSION_FFMPEG_TIMEOUT_SEC="$MISSION_FFMPEG_TIMEOUT_SEC" \
  "$ROS_CONTAINER" \
  bash -ic "python3 /src/scripts/drive_scan_classify_mission.py"
