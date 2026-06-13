import { buildLeagueState, buildScheduleState, parseCsv, players, rowsToEntries, rowsToScheduleEntries } from "./league.js?v=20260613-2";

const config = window.TENNIS_LEAGUE_CONFIG ?? {};

const elements = {
  setupNotice: document.querySelector("#setup-notice"),
  lastUpdated: document.querySelector("#last-updated"),
  statPlayed: document.querySelector("#stat-played"),
  statRemaining: document.querySelector("#stat-remaining"),
  statPlayers: document.querySelector("#stat-players"),
  statSets: document.querySelector("#stat-sets"),
  statTotalSets: document.querySelector("#stat-total-sets"),
  statAvgSets: document.querySelector("#stat-avg-sets"),
  statStraight: document.querySelector("#stat-straight"),
  leaderName: document.querySelector("#leader-name"),
  leaderRecord: document.querySelector("#leader-record"),
  leaderSets: document.querySelector("#leader-sets"),
  leaderBadge: document.querySelector("#leader-badge"),
  rankingBody: document.querySelector("#ranking-body"),
  recentMatches: document.querySelector("#recent-matches"),
  scheduleCount: document.querySelector("#schedule-count"),
  scheduleNext: document.querySelector("#schedule-next"),
  scheduleList: document.querySelector("#schedule-list"),
  matrixTable: document.querySelector("#matrix-table"),
  issuesPanel: document.querySelector("#issues-panel"),
  issueList: document.querySelector("#issue-list"),
  loadingOverlay: document.querySelector("#loading-overlay"),
  navToggle: document.querySelector("#nav-toggle"),
  topbar: document.querySelector("#primary-nav"),
  refreshButton: document.querySelector("#refresh-button"),
  appHeader: document.querySelector(".app-header"),
  scrollTop: document.querySelector("#scroll-top")
};

const REFRESH_INTERVAL_MS = 60000;
let isRefreshing = false;

init();

function init() {
  setupNavToggle();
  setupScrollSpy();
  setupRefreshButton();
  setupScrollTop();

  loadAndRender();
  window.setInterval(() => loadAndRender(), REFRESH_INTERVAL_MS);
}

async function loadAndRender({ manual = false } = {}) {
  if (isRefreshing) return;
  isRefreshing = true;
  elements.appHeader?.classList.add("is-refreshing");

  try {
    const [{ entries, source, loadedAt, issue }, scheduleResult] = await Promise.all([
      loadEntries(),
      loadScheduleEntries()
    ]);
    const state = buildLeagueState(entries);
    if (issue) state.issues.unshift(issue);

    const schedule = buildScheduleState(scheduleResult.entries);
    schedule.issues.forEach((scheduleIssue) => state.issues.push(scheduleIssue));
    if (scheduleResult.issue) state.issues.push(scheduleResult.issue);

    renderSummary(state, source, loadedAt);
    renderRanking(state);
    renderRecentMatches(state.matches);
    renderSchedule(schedule);
    renderMatrix(state);
    renderIssues(state.issues);
    if (!manual) restoreHashTarget();
  } finally {
    isRefreshing = false;
    hideLoadingOverlay();
    elements.appHeader?.classList.remove("is-refreshing");
  }
}

function hideLoadingOverlay() {
  if (!elements.loadingOverlay || elements.loadingOverlay.classList.contains("is-hidden")) return;
  elements.loadingOverlay.classList.add("is-hidden");
  window.setTimeout(() => elements.loadingOverlay?.setAttribute("hidden", ""), 450);
}

function setupNavToggle() {
  if (!elements.navToggle || !elements.topbar) return;

  const close = () => {
    elements.topbar.classList.remove("is-open");
    elements.navToggle.setAttribute("aria-expanded", "false");
  };

  elements.navToggle.addEventListener("click", () => {
    const open = elements.topbar.classList.toggle("is-open");
    elements.navToggle.setAttribute("aria-expanded", String(open));
  });

  elements.topbar.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
}

function setupRefreshButton() {
  elements.refreshButton?.addEventListener("click", () => loadAndRender({ manual: true }));
}

function setupScrollTop() {
  const button = elements.scrollTop;
  if (!button) return;

  const toggle = () => {
    const visible = window.scrollY > 480;
    button.hidden = !visible;
    button.classList.toggle("is-visible", visible);
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", toggle, { passive: true });
  toggle();
}

function setupScrollSpy() {
  const links = [...(elements.topbar?.querySelectorAll("a") ?? [])];
  if (!links.length || !("IntersectionObserver" in window)) return;

  const targets = links
    .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
    .filter((pair) => pair.section);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const match = targets.find((pair) => pair.section === entry.target);
      if (!match) return;
      links.forEach((link) => link.classList.toggle("is-active", link === match.link));
    });
  }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

  targets.forEach((pair) => observer.observe(pair.section));
}

async function loadEntries() {
  const primaryCsv = config.csvUrl?.trim();
  const demoCsv = config.demoCsvUrl?.trim();
  let fallbackIssue = "";

  if (primaryCsv) {
    try {
      const entries = await fetchEntries(primaryCsv);
      return { entries, source: "live", loadedAt: new Date() };
    } catch (error) {
      fallbackIssue = `Live CSV матчів недоступний, показую fallback-дані: ${error.message}`;
      if (!config.useDemoDataWhenCsvMissing || !demoCsv) {
        return {
          entries: [],
          source: "error",
          loadedAt: new Date(),
          issue: `Не вдалося завантажити CSV: ${error.message}`
        };
      }
    }
  }

  if (demoCsv && config.useDemoDataWhenCsvMissing) {
    const entries = await fetchEntries(demoCsv);
    return { entries, source: "demo", loadedAt: new Date(), issue: fallbackIssue };
  }

  return { entries: [], source: "empty", loadedAt: new Date() };
}

async function fetchEntries(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const text = await response.text();
  return rowsToEntries(parseCsv(text));
}

async function loadScheduleEntries() {
  const primaryCsv = config.scheduleCsvUrl?.trim();
  const demoCsv = config.demoScheduleCsvUrl?.trim();

  if (primaryCsv) {
    try {
      const entries = await fetchScheduleEntries(primaryCsv);
      return { entries };
    } catch (error) {
      if (!config.useDemoDataWhenCsvMissing || !demoCsv) {
        return {
          entries: [],
          issue: `Не вдалося завантажити CSV розкладу: ${error.message}`
        };
      }
    }
  }

  if (demoCsv && config.useDemoDataWhenCsvMissing) {
    return { entries: await fetchScheduleEntries(demoCsv) };
  }

  return { entries: [] };
}

async function fetchScheduleEntries(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const text = await response.text();
  return rowsToScheduleEntries(parseCsv(text));
}

function renderSummary(state, source, loadedAt) {
  elements.statPlayed.textContent = state.stats.played;
  elements.statRemaining.textContent = Math.max(state.stats.remaining, 0);
  elements.statPlayers.textContent = state.stats.players;
  elements.statSets.textContent = state.stats.totalSets;
  elements.statTotalSets.textContent = state.stats.totalSets;
  elements.statAvgSets.textContent = state.stats.played ? (state.stats.totalSets / state.stats.played).toFixed(1) : "0.0";
  elements.statStraight.textContent = state.stats.played
    ? `${Math.round((state.stats.straightSetMatches / state.stats.played) * 100)}%`
    : "0%";

  const leader = state.stats.leader;
  if (leader) {
    const winRate = leader.played ? Math.round((leader.wins / leader.played) * 100) : 0;
    elements.leaderName.textContent = leader.player.fullName;
    elements.leaderRecord.textContent = `${leader.wins} перемоги • ${leader.losses} поразок`;
    elements.leaderSets.textContent = `${leader.setsWon} виграних сетів`;
    elements.leaderBadge.textContent = `${winRate}% перемог`;
  }

  elements.lastUpdated.textContent = `Оновлено ${loadedAt.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  elements.setupNotice.hidden = source === "live";
}

function renderRanking(state) {
  elements.rankingBody.replaceChildren(...state.ranking.map((item, index) => {
    const row = document.createElement("tr");
    row.style.setProperty("--row-index", index);
    row.dataset.position = String(item.position);

    const positionCell = document.createElement("td");
    positionCell.innerHTML = `<span class="position-badge">${item.position}</span>`;

    const playerCell = document.createElement("td");
    const cell = document.createElement("div");
    cell.className = "player-cell";
    cell.appendChild(createAvatar(item.player));
    const text = document.createElement("div");
    text.className = "player-cell__text";
    text.innerHTML = `
      <strong>${item.player.fullName}</strong>
      <span>${item.wins} перемог • ${item.losses} поразок</span>
    `;
    cell.appendChild(text);
    playerCell.appendChild(cell);

    const playedCell = document.createElement("td");
    playedCell.textContent = item.played;

    const gameDiffCell = document.createElement("td");
    gameDiffCell.textContent = `${item.gameDiff > 0 ? "+" : ""}${item.gameDiff}`;
    gameDiffCell.title = `Гейми: ${item.gamesWon}:${item.gamesLost}`;

    const pointsCell = document.createElement("td");
    pointsCell.innerHTML = `<strong>${item.points}</strong>`;

    row.append(positionCell, playerCell, playedCell, gameDiffCell, pointsCell);
    return row;
  }));
}

function playerInitials(player) {
  const parts = String(player.fullName).trim().split(/\s+/);
  const surnameInitial = parts[0]?.[0] ?? "";
  const nameInitial = parts[1]?.[0] ?? "";
  return (surnameInitial + nameInitial).toUpperCase();
}

function avatarHue(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = id.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function createAvatar(player) {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.setProperty("--avatar-hue", avatarHue(player.id));
  avatar.textContent = playerInitials(player);
  avatar.setAttribute("aria-hidden", "true");
  return avatar;
}

function renderRecentMatches(matches) {
  const sorted = [...matches].reverse().slice(0, 6);

  if (!sorted.length) {
    elements.recentMatches.innerHTML = `<p class="empty-state">Матчі ще не додані.</p>`;
    return;
  }

  elements.recentMatches.replaceChildren(...sorted.map((match, index) => {
    const card = document.createElement("article");
    card.className = "match-card";
    card.style.setProperty("--row-index", index);

    const info = document.createElement("div");
    info.className = "match-card__info";
    const players = document.createElement("strong");
    players.textContent = `${match.playerA.surname} — ${match.playerB.surname}`;
    const date = document.createElement("span");
    date.textContent = match.timestamp || "Без дати";
    info.append(players, date);

    const score = document.createElement("div");
    score.className = "match-card__score";
    score.textContent = match.line.match(/\d{1,2}\s*[:\-]\s*\d{1,2}.*/)?.[0] ?? "";

    const winner = document.createElement("span");
    winner.className = "winner-pill";
    winner.append(createAvatar(match.winner), document.createTextNode(match.winner.surname));

    card.append(info, score, winner);
    return card;
  }));
}

function renderSchedule(schedule) {
  elements.scheduleCount.textContent = `${schedule.matches.length} ${declineMatch(schedule.matches.length)}`;
  elements.scheduleNext.textContent = schedule.next
    ? `Наступний: ${formatScheduleDate(schedule.next)} о ${schedule.next.time}`
    : "Усі матчі розкладу позаду";

  if (!schedule.matches.length) {
    elements.scheduleList.innerHTML = `<p class="empty-state">Розклад ще не доданий.</p>`;
    return;
  }

  const grouped = groupScheduleByDate(schedule.matches);
  elements.scheduleList.replaceChildren(...grouped.map((group) => {
    const card = document.createElement("article");
    card.className = `schedule-day schedule-day--${group.status}`;

    const matches = group.matches.map((match) => `
      <li class="schedule-match schedule-match--${match.status}">
        <time>${match.time}</time>
        <span>${match.playerA.fullName}</span>
        <i>—</i>
        <span>${match.playerB.fullName}</span>
      </li>
    `).join("");

    card.innerHTML = `
      <div class="schedule-day__date">
        <strong>${group.dayNumber}</strong>
        <span>${group.monthLabel}</span>
      </div>
      <div class="schedule-day__body">
        <div class="schedule-day__header">
          <h3>${group.weekday}</h3>
          <span>${group.statusLabel}</span>
        </div>
        <ul>${matches}</ul>
      </div>
    `;
    return card;
  }));
}

function groupScheduleByDate(matches) {
  const groups = new Map();
  matches.forEach((match) => {
    const key = match.startsAt.toISOString().slice(0, 10);
    if (!groups.has(key)) {
      groups.set(key, {
        date: match.startsAt,
        dayNumber: String(match.startsAt.getDate()).padStart(2, "0"),
        monthLabel: match.startsAt.toLocaleDateString("uk-UA", { month: "short" }).replace(".", ""),
        weekday: match.day || match.startsAt.toLocaleDateString("uk-UA", { weekday: "long" }),
        matches: []
      });
    }
    groups.get(key).matches.push(match);
  });

  return [...groups.values()].map((group) => {
    const hasToday = group.matches.some((match) => match.status === "today");
    const hasUpcoming = group.matches.some((match) => match.status === "upcoming");
    const status = hasToday ? "today" : hasUpcoming ? "upcoming" : "past";
    const statusLabel = {
      today: "Сьогодні",
      upcoming: "Заплановано",
      past: "Зіграно / минуло"
    }[status];

    return { ...group, status, statusLabel };
  });
}

function formatScheduleDate(match) {
  return match.startsAt.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "short"
  });
}

function declineMatch(count) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return "матч";
  if ([2, 3, 4].includes(last) && ![12, 13, 14].includes(lastTwo)) return "матчі";
  return "матчів";
}

function renderMatrix(state) {
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));

  players.forEach((player) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.innerHTML = `<span>${player.shortLabel}</span>`;
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  players.forEach((rowPlayer) => {
    const row = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.scope = "row";
    rowHeader.textContent = rowPlayer.shortLabel;
    row.appendChild(rowHeader);

    players.forEach((columnPlayer) => {
      const cell = document.createElement("td");

      if (rowPlayer.id === columnPlayer.id) {
        cell.className = "matrix-cell matrix-cell--self";
        cell.setAttribute("aria-label", `${rowPlayer.fullName}: діагональ`);
        cell.textContent = "—";
      } else {
        const result = state.matrix.get(`${rowPlayer.id}:${columnPlayer.id}`);
        if (result) {
          cell.className = `matrix-cell matrix-cell--${result.result}`;
          cell.appendChild(createScoreStack(result.score));
          cell.setAttribute("aria-label", `${rowPlayer.fullName} проти ${columnPlayer.fullName}: ${result.score}`);
        } else {
          cell.className = "matrix-cell matrix-cell--empty";
          cell.setAttribute("aria-label", `${rowPlayer.fullName} проти ${columnPlayer.fullName}: матч ще не зіграний`);
        }
      }

      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  elements.matrixTable.replaceChildren(thead, tbody);
}

function createScoreStack(score) {
  const stack = document.createElement("div");
  stack.className = "score-stack";
  score.split(" ").forEach((set) => {
    const item = document.createElement("span");
    item.textContent = set;
    stack.appendChild(item);
  });
  return stack;
}

function renderIssues(issues) {
  elements.issuesPanel.hidden = issues.length === 0;
  elements.issueList.replaceChildren(...issues.map((issue) => {
    const item = document.createElement("li");
    item.textContent = issue;
    return item;
  }));
}

function restoreHashTarget() {
  const hash = window.location.hash;
  if (!hash) return;

  window.requestAnimationFrame(() => {
    if (hash === "#overview" || hash === "#top") {
      window.scrollTo({ top: 0 });
      return;
    }

    const target = document.querySelector(hash);
    if (!target) return;

    const headerHeight = document.querySelector(".app-header")?.getBoundingClientRect().height ?? 0;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
    window.scrollTo({ top: Math.max(0, top) });
  });
}
