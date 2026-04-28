import os
import time
import urllib.parse
import urllib.request


DEFAULT_CAMERA_URL = "http://127.0.0.1:8889/cam/"
DEFAULT_ENDPOINT = "https://www.adolanna.ru/api/robot/frame"
DEFAULT_INTERVAL_SEC = 2
DEFAULT_TIMEOUT_SEC = 8
DEFAULT_MAX_FRAME_BYTES = 3_500_000


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default

    try:
        return int(value)
    except ValueError:
        return default


def fetch_first_jpeg(camera_url: str, timeout_sec: int, max_bytes: int) -> bytes:
    request = urllib.request.Request(
        camera_url,
        headers={
            "User-Agent": "ryan-rover-frame-pusher/1.0",
            "Accept": "image/jpeg,image/*,multipart/x-mixed-replace,text/html",
        },
        method="GET",
    )

    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        content_type = (response.headers.get("Content-Type") or "").lower()
        if content_type.startswith("image/"):
            image = response.read(max_bytes + 1)
            if len(image) > max_bytes:
                raise ValueError("Camera image is too large")
            return image

        if "text/html" in content_type:
            html = response.read(64_000).decode("utf-8", errors="ignore")
            stream_url = extract_stream_url_from_html(html, base_url=camera_url)
            if not stream_url:
                raise ValueError("Could not find stream URL in camera HTML page")
            return fetch_first_jpeg(stream_url, timeout_sec=timeout_sec, max_bytes=max_bytes)

        return read_first_jpeg_frame(response, max_bytes=max_bytes)


def extract_stream_url_from_html(html: str, base_url: str) -> str | None:
    lower = html.lower()
    for marker in ('src="', "src='"):
        index = lower.find(marker)
        if index == -1:
            continue

        start = index + len(marker)
        quote = marker[-1]
        end = html.find(quote, start)
        if end != -1:
            return urllib.parse.urljoin(base_url, html[start:end])

    return None


def read_first_jpeg_frame(response: object, max_bytes: int) -> bytes:
    buffer = bytearray()
    chunk_size = 4096

    while len(buffer) <= max_bytes:
        chunk = response.read(chunk_size)
        if not chunk:
            break

        buffer.extend(chunk)
        start = buffer.find(b"\xff\xd8")
        if start == -1:
            if len(buffer) > 128_000:
                del buffer[:-4]
            continue

        end = buffer.find(b"\xff\xd9", start + 2)
        if end != -1:
            return bytes(buffer[start : end + 2])

        if start > 0:
            del buffer[:start]

    raise ValueError("Could not parse JPEG frame from stream")


def upload_frame(endpoint: str, robot_token: str, frame: bytes, timeout_sec: int) -> None:
    request = urllib.request.Request(
        endpoint,
        data=frame,
        headers={
            "Content-Type": "image/jpeg",
            "X-Robot-Token": robot_token,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        response.read()


def main() -> None:
    camera_url = os.getenv("ROBOT_CAMERA_URL", DEFAULT_CAMERA_URL)
    endpoint = os.getenv("MINIAPP_FRAME_ENDPOINT", DEFAULT_ENDPOINT)
    robot_token = os.getenv("ROBOT_PUSH_TOKEN")
    interval_sec = max(1, env_int("ROBOT_PUSH_INTERVAL_SEC", DEFAULT_INTERVAL_SEC))
    timeout_sec = max(2, env_int("ROBOT_CAMERA_TIMEOUT_SEC", DEFAULT_TIMEOUT_SEC))
    max_bytes = max(300_000, env_int("ROBOT_MAX_FRAME_BYTES", DEFAULT_MAX_FRAME_BYTES))

    if not robot_token:
        raise SystemExit("ROBOT_PUSH_TOKEN is required")

    while True:
        try:
            frame = fetch_first_jpeg(camera_url, timeout_sec=timeout_sec, max_bytes=max_bytes)
            upload_frame(endpoint, robot_token=robot_token, frame=frame, timeout_sec=timeout_sec)
            print(f"uploaded {len(frame)} bytes to {endpoint}", flush=True)
        except Exception as error:
            print(f"upload failed: {error}", flush=True)

        time.sleep(interval_sec)


if __name__ == "__main__":
    main()
