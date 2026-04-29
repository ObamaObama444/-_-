const WELCOME_DURATION_MS = 2400;
const START_API_PATH = "/api/start";
const MISSION_STATUS_API_PATH = "/api/mission/status";
const MISSION_POLL_INTERVAL_MS = 2000;
const MISSION_MAX_WAIT_MS = 30 * 60 * 1000;
const MISSION_POINT_TOTAL = 8;

const screens = {
  welcome: document.querySelector('[data-screen="welcome"]'),
  start: document.querySelector('[data-screen="start"]'),
  loading: document.querySelector('[data-screen="loading"]'),
  result: document.querySelector('[data-screen="result"]'),
};
const missionStatusElement = document.querySelector("[data-mission-status]");
const resultStatusElement = document.querySelector("[data-result-status]");
const resultTargetElement = document.querySelector("[data-result-target]");
let started = false;
let missionStartedAt = 0;
let lastMissionStatus = null;

function setupTelegram() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return;
  }

  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor?.("#2f2f32");
  webApp.setBackgroundColor?.("#2f2f32");
}

function showScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.hidden = screenName !== name;
    element.classList.toggle("screen-enter", screenName === name);
  }
}

function formatCount(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return String(Math.max(0, Math.trunc(number))).padStart(2, "0");
}

function updateCounts(counts = {}) {
  document.querySelectorAll("[data-count]").forEach((element) => {
    const key = element.dataset.count;
    element.textContent = formatCount(counts[key]);
  });
}

function setText(element, value) {
  if (element) {
    element.textContent = value || "";
  }
}

function pointProgress(status = {}) {
  const points = Array.isArray(status.points) ? status.points.length : 0;
  return `${Math.min(points, MISSION_POINT_TOTAL)}/${MISSION_POINT_TOTAL}`;
}

function updateLoadingStatus(status = {}) {
  const state = status.status || "waiting";
  if (state === "waiting") {
    setText(missionStatusElement, "Ждём робота");
    return;
  }
  if (state === "assigned") {
    setText(missionStatusElement, "Робот принял маршрут");
    return;
  }
  if (state === "running") {
    setText(missionStatusElement, `Точек: ${pointProgress(status)}`);
    return;
  }
  if (state === "completed") {
    setText(missionStatusElement, "Маршрут завершён");
    return;
  }
  if (state === "failed") {
    setText(missionStatusElement, "Маршрут остановился");
    return;
  }
  setText(missionStatusElement, "Маршрут в работе");
}

function formatTarget(target) {
  if (!target || typeof target !== "object") {
    return "";
  }

  const className = target.class_name;
  const pointId = target.point?.id;
  if (!className || !pointId) {
    return "";
  }

  return `Финиш: ${className}, ${pointId}`;
}

function renderResult(status = {}) {
  if (!status.status || status.status === "running") {
    setText(resultStatusElement, "");
    setText(resultTargetElement, "");
    return;
  }

  const completed = status.status === "completed";
  setText(resultStatusElement, completed ? "Маршрут завершён" : "Маршрут остановился");
  setText(resultTargetElement, status.error || formatTarget(status.target));
}

async function startMission() {
  const webApp = window.Telegram?.WebApp;
  const payload = {
    initData: webApp?.initData ?? "",
  };

  const response = await fetch(START_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchMissionStatus(missionId) {
  const url = `${MISSION_STATUS_API_PATH}?mission_id=${encodeURIComponent(missionId)}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Status request failed: ${response.status}`);
  }
  return response.json();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollMissionUntilFinished(missionId) {
  while (Date.now() - missionStartedAt < MISSION_MAX_WAIT_MS) {
    const status = await fetchMissionStatus(missionId);
    lastMissionStatus = status;
    updateCounts(status.counts);
    updateLoadingStatus(status);

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    await wait(MISSION_POLL_INTERVAL_MS);
  }

  throw new Error("Mission timed out");
}

async function startAnalytics() {
  if (started) {
    return;
  }
  started = true;
  missionStartedAt = Date.now();
  lastMissionStatus = null;
  updateCounts();
  updateLoadingStatus({ status: "waiting", points: [] });
  renderResult({ status: "running" });

  showScreen("loading");

  try {
    const mission = await startMission();
    lastMissionStatus = mission;
    updateCounts(mission.counts);
    updateLoadingStatus(mission);
    const finished = await pollMissionUntilFinished(mission.mission_id);
    updateCounts(finished.counts);
    renderResult(finished);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(
      finished.status === "completed" ? "success" : "error",
    );
  } catch (error) {
    console.error("Failed to run rover mission:", error);
    updateCounts(lastMissionStatus?.counts);
    renderResult({
      status: "failed",
      counts: lastMissionStatus?.counts,
      error: "Не удалось запустить маршрут",
    });
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
  } finally {
    showScreen("result");
  }
}

setupTelegram();
window.setTimeout(() => showScreen("start"), WELCOME_DURATION_MS);
document.querySelector(".start-button").addEventListener("click", startAnalytics);
