#!/usr/bin/env python3
import json
import os
import subprocess
import time
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "https://www.adolanna.ru"
DEFAULT_POLL_TIMEOUT_SEC = 25
DEFAULT_REQUEST_TIMEOUT_SEC = 35
DEFAULT_RETRY_SLEEP_SEC = 3
DEFAULT_MISSION_COMMAND = (
    'docker exec '
    '-e MISSION_ID="{mission_id}" '
    '-e MINIAPP_BASE_URL="{base_url}" '
    '-e ROBOT_PUSH_TOKEN="{robot_token}" '
    '-e ROBOT_RTSP_URL="{rtsp_url}" '
    'ros bash -ic "python3 /src/scripts/drive_scan_classify_mission.py"'
)


def env_int(name, default):
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def post_json(url, token, payload, timeout_sec):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Robot-Token": token,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data if isinstance(data, dict) else {}


def build_command(template, mission_id, base_url, robot_token, rtsp_url):
    return template.format(
        mission_id=mission_id,
        base_url=base_url,
        robot_token=robot_token,
        rtsp_url=rtsp_url,
    )


def notify_failed(complete_url, robot_token, mission_id, error, timeout_sec):
    try:
        post_json(
            complete_url,
            robot_token,
            {
                "mission_id": mission_id,
                "status": "failed",
                "error": error,
            },
            timeout_sec,
        )
    except Exception as notify_error:
        print(f"failed to notify mission error: {notify_error}", flush=True)


def main():
    base_url = os.getenv("MINIAPP_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    next_url = os.getenv("MINIAPP_MISSION_NEXT_URL", f"{base_url}/api/robot/mission/next")
    complete_url = os.getenv("MINIAPP_MISSION_COMPLETE_URL", f"{base_url}/api/robot/mission/complete")
    robot_token = os.getenv("ROBOT_PUSH_TOKEN")
    rtsp_url = os.getenv("ROBOT_RTSP_URL", "rtsp://172.18.0.2:8554/cam")
    command_template = os.getenv("ROBOT_MISSION_COMMAND", DEFAULT_MISSION_COMMAND)
    poll_timeout_sec = env_int("ROBOT_MISSION_POLL_TIMEOUT_SEC", DEFAULT_POLL_TIMEOUT_SEC)
    request_timeout_sec = env_int("ROBOT_MISSION_REQUEST_TIMEOUT_SEC", DEFAULT_REQUEST_TIMEOUT_SEC)
    retry_sleep_sec = env_int("ROBOT_MISSION_RETRY_SLEEP_SEC", DEFAULT_RETRY_SLEEP_SEC)

    if not robot_token:
        raise RuntimeError("ROBOT_PUSH_TOKEN is required")

    print(f"mission agent polling {next_url}", flush=True)
    while True:
        try:
            job = post_json(
                next_url,
                robot_token,
                {"timeout_sec": poll_timeout_sec},
                timeout_sec=max(request_timeout_sec, poll_timeout_sec + 5),
            )
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            print(f"poll failed: {error}", flush=True)
            time.sleep(retry_sleep_sec)
            continue

        if not job.get("ok"):
            print(f"bad poll response: {job}", flush=True)
            time.sleep(retry_sleep_sec)
            continue
        if job.get("idle"):
            continue

        mission_id = job.get("mission_id")
        if not isinstance(mission_id, str) or not mission_id:
            print(f"mission response without mission_id: {job}", flush=True)
            time.sleep(retry_sleep_sec)
            continue

        command = build_command(command_template, mission_id, base_url, robot_token, rtsp_url)
        print(f"mission {mission_id} started", flush=True)
        completed = subprocess.run(command, shell=True, text=True, capture_output=True, check=False)

        if completed.stdout:
            print(completed.stdout[-4000:], flush=True)
        if completed.stderr:
            print(completed.stderr[-4000:], flush=True)

        if completed.returncode != 0:
            error = (completed.stderr or completed.stdout or f"mission command exited {completed.returncode}")[-1000:]
            notify_failed(complete_url, robot_token, mission_id, error, request_timeout_sec)
            print(f"mission {mission_id} failed: {completed.returncode}", flush=True)
            continue

        print(f"mission {mission_id} command finished", flush=True)


if __name__ == "__main__":
    main()
