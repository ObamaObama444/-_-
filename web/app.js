const WELCOME_DURATION_MS = 2400;
const START_API_PATH = "/api/start";
const MISSION_STATUS_API_PATH = "/api/mission/status";
const MISSION_POLL_INTERVAL_MS = 2000;
const MISSION_MAX_WAIT_MS = 30 * 60 * 1000;

const screens = {
  welcome: document.querySelector('[data-screen="welcome"]'),
  start: document.querySelector('[data-screen="start"]'),
  loading: document.querySelector('[data-screen="loading"]'),
  result: document.querySelector('[data-screen="result"]'),
};
let started = false;
let missionStartedAt = 0;
let loadingLap = 1;

const loadingRider = document.querySelector(".loading-rider");
const analyticsTrail = document.querySelector(".analytics-trail");

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

function setTrailState(state) {
  analyticsTrail?.classList.remove("is-painting", "is-painted", "is-erasing");
  if (state) {
    analyticsTrail?.classList.add(state);
  }
}

function updateTrailForLap(lap) {
  if (lap === 3) {
    setTrailState("is-painting");
    return;
  }

  if (lap === 4) {
    setTrailState("is-erasing");
    return;
  }

  setTrailState(null);
}

function resetLoadingTrail() {
  loadingLap = 1;
  setTrailState(null);
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
    updateCounts(status.counts);

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
  updateCounts();
  resetLoadingTrail();

  showScreen("loading");

  try {
    const mission = await startMission();
    updateCounts(mission.counts);
    const finished = await pollMissionUntilFinished(mission.mission_id);
    updateCounts(finished.counts);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(
      finished.status === "completed" ? "success" : "error",
    );
  } catch (error) {
    console.error("Failed to run rover mission:", error);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
  } finally {
    showScreen("result");
  }
}

setupTelegram();
window.setTimeout(() => showScreen("start"), WELCOME_DURATION_MS);
document.querySelector(".start-button").addEventListener("click", startAnalytics);
loadingRider?.addEventListener("animationiteration", () => {
  loadingLap += 1;
  updateTrailForLap(loadingLap);
});
analyticsTrail?.addEventListener("animationend", (event) => {
  if (event.animationName === "trail-paint" && loadingLap === 3) {
    setTrailState("is-painted");
  }
});
