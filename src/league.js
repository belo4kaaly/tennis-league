export const players = [
  { id: "honcharenko", fullName: "Гончаренко Анелія", surname: "Гончаренко", shortLabel: "А. Гончаренко" },
  { id: "taran", fullName: "Таран Мар'яна", surname: "Таран", shortLabel: "М. Таран" },
  { id: "rubets", fullName: "Рубець Юлія", surname: "Рубець", shortLabel: "Ю. Рубець" },
  { id: "stryzhak", fullName: "Стрижак Олена", surname: "Стрижак", shortLabel: "О. Стрижак" },
  { id: "sarycheva", fullName: "Саричева Оксана", surname: "Саричева", shortLabel: "О. Саричева" },
  { id: "antoshchenko", fullName: "Антощенко Тетяна", surname: "Антощенко", shortLabel: "Т. Антощенко" },
  { id: "lenets", fullName: "Ленець Наталія", surname: "Ленець", shortLabel: "Н. Ленець" },
  { id: "trotsak", fullName: "Троцак Аліна", surname: "Троцак", shortLabel: "А. Троцак" },
  { id: "borodai", fullName: "Бородай Олександра", surname: "Бородай", shortLabel: "О. Бородай" },
  { id: "lytvynenko", fullName: "Литвиненко Олена", surname: "Литвиненко", shortLabel: "О. Литвиненко" },
  { id: "bobliakh", fullName: "Боблях Аліна", surname: "Боблях", shortLabel: "А. Боблях" },
  { id: "karpets", fullName: "Карпець Марія", surname: "Карпець", shortLabel: "М. Карпець" },
  { id: "omelianenko", fullName: "Омельяненко Анна", surname: "Омельяненко", shortLabel: "А. Омельяненко" }
];

const totalPairCount = players.length * (players.length - 1) / 2;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function rowsToEntries(rows) {
  if (!rows.length) return [];
  const headerRowIndex = findMatchHeaderRow(rows);
  const headers = rows[headerRowIndex].map((header) => normalizeText(header));
  const matchColumn = findExactHeader(headers, ["матч", "гра", "match"]);
  const scoreColumn = findHeader(headers, ["рахунок", "результат", "score"]);
  const playerAColumn = findHeader(headers, ["гравчиня 1", "player 1", "player a"]);
  const playerBColumn = findHeader(headers, ["гравчиня 2", "player 2", "player b"]);
  const timestampColumn = findHeader(headers, ["timestamp", "позначка", "дата", "час"]);
  const noteColumn = findHeader(headers, ["примітка", "note"]);

  return rows.slice(headerRowIndex + 1)
    .map((row, index) => ({
      line: buildMatchLine(row, { matchColumn, playerAColumn, playerBColumn, scoreColumn }),
      timestamp: timestampColumn === undefined ? "" : row[timestampColumn]?.trim() ?? "",
      note: noteColumn === undefined ? "" : row[noteColumn]?.trim() ?? "",
      sourceRow: headerRowIndex + index + 2
    }))
    .filter((entry) => entry.line);
}

export function rowsToScheduleEntries(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => normalizeText(header));
  const dateColumn = findHeader(headers, ["дата", "date"]) ?? 0;
  const dayColumn = findHeader(headers, ["день", "day"]);
  const timeColumn = findHeader(headers, ["час", "time"]) ?? 1;
  const playerAColumn = findHeader(headers, ["гравчиня 1", "player 1", "player a"]) ?? 2;
  const playerBColumn = findHeader(headers, ["гравчиня 2", "player 2", "player b"]) ?? 3;
  const noteColumn = findHeader(headers, ["примітка", "note"]);

  return rows.slice(1)
    .map((row, index) => ({
      date: row[dateColumn]?.trim() ?? "",
      day: dayColumn === undefined ? "" : row[dayColumn]?.trim() ?? "",
      time: row[timeColumn]?.trim() ?? "",
      playerA: row[playerAColumn]?.trim() ?? "",
      playerB: row[playerBColumn]?.trim() ?? "",
      note: noteColumn === undefined ? "" : row[noteColumn]?.trim() ?? "",
      sourceRow: index + 2
    }))
    .filter((entry) => entry.date || entry.time || entry.playerA || entry.playerB);
}

export function buildScheduleState(entries, now = new Date()) {
  const issues = [];
  const matches = entries.map((entry) => {
    const playerA = resolvePlayer(entry.playerA);
    const playerB = resolvePlayer(entry.playerB);
    const startsAt = parseScheduleDate(entry.date, entry.time);

    if (!playerA || !playerB) {
      issues.push(`Невідома гравчиня в розкладі, рядок ${entry.sourceRow}.`);
    }

    if (!startsAt) {
      issues.push(`Не можу прочитати дату/час у розкладі, рядок ${entry.sourceRow}.`);
    }

    return {
      ...entry,
      playerA,
      playerB,
      startsAt,
      status: getScheduleStatus(startsAt, now)
    };
  }).filter((match) => match.playerA && match.playerB && match.startsAt)
    .sort((left, right) => left.startsAt - right.startsAt);

  const next = matches.find((match) => match.status !== "past") ?? null;

  return { matches, issues, next };
}

export function parseMatchLine(line, sourceRow = null) {
  const scoreMatches = [...line.matchAll(/\b(\d{1,2})\s*[:\-]\s*(\d{1,2})\b/g)];
  if (!scoreMatches.length) {
    return { ok: false, message: `Немає рахунку: "${line}"`, sourceRow };
  }

  const firstScoreIndex = scoreMatches[0].index ?? 0;
  const namesPart = line.slice(0, firstScoreIndex).trim().replace(/[–—]/g, "-");
  const namePieces = namesPart.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);

  if (namePieces.length !== 2) {
    return { ok: false, message: `Не можу розділити гравчинь: "${line}"`, sourceRow };
  }

  const playerA = resolvePlayer(namePieces[0]);
  const playerB = resolvePlayer(namePieces[1]);

  if (!playerA || !playerB) {
    return { ok: false, message: `Невідома гравчиня в рядку: "${line}"`, sourceRow };
  }

  if (playerA.id === playerB.id) {
    return { ok: false, message: `Гравчиня не може грати сама з собою: "${line}"`, sourceRow };
  }

  const sets = scoreMatches.map((match) => ({
    a: Number(match[1]),
    b: Number(match[2])
  }));

  const setsA = sets.filter((set) => set.a > set.b).length;
  const setsB = sets.filter((set) => set.b > set.a).length;

  if (setsA === setsB) {
    return { ok: false, message: `Не можу визначити переможницю за сетами: "${line}"`, sourceRow };
  }

  const winner = setsA > setsB ? playerA : playerB;
  const loser = setsA > setsB ? playerB : playerA;

  return {
    ok: true,
    line,
    sourceRow,
    playerA,
    playerB,
    sets,
    setsA,
    setsB,
    winner,
    loser,
    pairKey: pairKey(playerA.id, playerB.id)
  };
}

export function buildLeagueState(entries) {
  const issues = [];
  const parsed = entries.map((entry) => {
    const result = parseMatchLine(entry.line, entry.sourceRow);
    return result.ok ? { ...result, timestamp: entry.timestamp, note: entry.note } : result;
  });

  const valid = [];
  const latestByPair = new Map();

  parsed.forEach((match) => {
    if (!match.ok) {
      issues.push(match.message);
      return;
    }

    if (latestByPair.has(match.pairKey)) {
      const previous = latestByPair.get(match.pairKey);
      issues.push(
        `Дубль матчу ${previous.playerA.surname} - ${previous.playerB.surname}; у рейтингу використано останній запис.`
      );
    }

    latestByPair.set(match.pairKey, match);
  });

  latestByPair.forEach((match) => valid.push(match));

  const stats = new Map(players.map((player) => [player.id, {
    player,
    played: 0,
    points: 0,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0
  }]));

  valid.forEach((match) => {
    const statA = stats.get(match.playerA.id);
    const statB = stats.get(match.playerB.id);
    statA.played += 1;
    statB.played += 1;
    statA.setsWon += match.setsA;
    statA.setsLost += match.setsB;
    statB.setsWon += match.setsB;
    statB.setsLost += match.setsA;
    stats.get(match.winner.id).points += 1;
    stats.get(match.winner.id).wins += 1;
    stats.get(match.loser.id).losses += 1;
  });

  const ranking = [...stats.values()]
    .sort((left, right) => right.points - left.points || right.played - left.played || left.player.surname.localeCompare(right.player.surname, "uk"));

  let previousPoints = null;
  let currentPosition = 0;
  ranking.forEach((item, index) => {
    if (item.points !== previousPoints) {
      currentPosition = index + 1;
      previousPoints = item.points;
    }
    item.position = currentPosition;
  });

  const matrix = new Map();
  valid.forEach((match) => {
    matrix.set(`${match.playerA.id}:${match.playerB.id}`, {
      match,
      result: match.winner.id === match.playerA.id ? "win" : "loss",
      score: formatSets(match.sets, "a")
    });
    matrix.set(`${match.playerB.id}:${match.playerA.id}`, {
      match,
      result: match.winner.id === match.playerB.id ? "win" : "loss",
      score: formatSets(match.sets, "b")
    });
  });

  const tieGroups = ranking.reduce((groups, item) => {
    const key = String(item.points);
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});

  return {
    players,
    matches: valid,
    ranking,
    matrix,
    issues,
    stats: {
      played: valid.length,
      remaining: totalPairCount - valid.length,
      players: players.length,
      totalSets: valid.reduce((sum, match) => sum + match.sets.length, 0),
      straightSetMatches: valid.filter((match) => match.sets.length === 2).length,
      leader: ranking[0],
      hasTies: Object.values(tieGroups).some((group) => group.length > 1)
    }
  };
}

export function formatSets(sets, perspective = "a") {
  return sets
    .map((set) => perspective === "a" ? `${set.a}:${set.b}` : `${set.b}:${set.a}`)
    .join(" ");
}

export function pairKey(firstId, secondId) {
  return [firstId, secondId].sort().join("__");
}

function resolvePlayer(input) {
  const normalized = normalizeText(input);
  const exactSurname = players.find((player) => normalizeText(player.surname) === normalized);
  if (exactSurname) return exactSurname;

  const exactFull = players.find((player) => normalizeText(player.fullName) === normalized);
  if (exactFull) return exactFull;

  const containsSurname = players.filter((player) => normalized.includes(normalizeText(player.surname)));
  if (containsSurname.length === 1) return containsSurname[0];

  const playerContainsInput = players.filter((player) => normalizeText(player.fullName).includes(normalized));
  return playerContainsInput.length === 1 ? playerContainsInput[0] : null;
}

function findHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(normalizeText(candidate)))) >= 0
    ? headers.findIndex((header) => candidates.some((candidate) => header.includes(normalizeText(candidate))))
    : undefined;
}

function findMatchHeaderRow(rows) {
  const foundIndex = rows.findIndex((row) => {
    const headers = row.map((header) => normalizeText(header));
    const hasLineColumn = findExactHeader(headers, ["матч", "гра", "match"]) !== undefined;
    const hasStructuredColumns = findHeader(headers, ["гравчиня 1", "player 1", "player a"]) !== undefined
      && findHeader(headers, ["гравчиня 2", "player 2", "player b"]) !== undefined
      && findHeader(headers, ["рахунок", "результат", "score"]) !== undefined;

    return hasLineColumn || hasStructuredColumns;
  });

  return foundIndex === -1 ? 0 : foundIndex;
}

function findExactHeader(headers, candidates) {
  const normalizedCandidates = candidates.map((candidate) => normalizeText(candidate));
  const index = headers.findIndex((header) => normalizedCandidates.includes(header));
  return index === -1 ? undefined : index;
}

function buildMatchLine(row, columns) {
  if (columns.matchColumn !== undefined) {
    return row[columns.matchColumn]?.trim() ?? "";
  }

  const playerA = row[columns.playerAColumn]?.trim() ?? "";
  const playerB = row[columns.playerBColumn]?.trim() ?? "";
  const score = row[columns.scoreColumn]?.trim() ?? "";

  if (!playerA || !playerB || !score) return "";
  return `${playerA} - ${playerB} ${score}`;
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function parseScheduleDate(date, time) {
  const dateMatch = String(date).trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  const timeMatch = String(time).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : 2026;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  return new Date(year, month, day, hour, minute);
}

function getScheduleStatus(startsAt, now) {
  if (!startsAt) return "unknown";
  if (startsAt < now) return "past";

  const sameDay = startsAt.getFullYear() === now.getFullYear()
    && startsAt.getMonth() === now.getMonth()
    && startsAt.getDate() === now.getDate();

  if (sameDay) return "today";
  return "upcoming";
}
