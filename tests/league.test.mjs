import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLeagueState,
  calculateMatchGames,
  buildScheduleState,
  parseCsv,
  parseMatchLine,
  rowsToEntries,
  rowsToScheduleEntries
} from "../src/league.js";

test("parses either match direction and keeps the same winner", () => {
  assert.equal(parseMatchLine("Бородай - Омельяненко 6:3 6:4").winner.fullName, "Бородай Олександра");
  assert.equal(parseMatchLine("Омельяненко - Бородай 3:6 4:6").winner.fullName, "Бородай Олександра");
});

test("parses deciding tie-break as a match set", () => {
  const match = parseMatchLine("Антощенко - Литвиненко 6:7 6:2 10:8");
  assert.equal(match.winner.fullName, "Антощенко Тетяна");
  assert.equal(match.setsA, 2);
  assert.equal(match.setsB, 1);
});

test("counts match tie-break as one game for ranking tie-breakers", () => {
  const match = parseMatchLine("Гончаренко - Омельяненко 6:0 4:6 10:7");
  assert.deepEqual(calculateMatchGames(match.sets), { a: 11, b: 6 });
});

test("flags unknown players and incomplete scores", () => {
  assert.equal(parseMatchLine("Невідома - Бородай 6:3 6:4").ok, false);
  assert.equal(parseMatchLine("Бородай - Омельяненко").ok, false);
});

test("builds ranking from screenshot review data", async () => {
  const csv = await readFile(new URL("../data/screenshot-matches-review.csv", import.meta.url), "utf8");
  const entries = rowsToEntries(parseCsv(csv));
  const state = buildLeagueState(entries);

  assert.equal(state.matches.length, 20);
  assert.equal(state.issues.length, 0);
  assert.equal(state.stats.leader.player.fullName, "Антощенко Тетяна");
  assert.equal(state.stats.leader.points, 6);
  const honcharenko = state.ranking.find((item) => item.player.fullName === "Гончаренко Анелія");
  const omelianenko = state.ranking.find((item) => item.player.fullName === "Омельяненко Анна");
  assert.equal(honcharenko.gameDiff, 15);
  assert.equal(omelianenko.gameDiff, 15);
  assert.equal(honcharenko.position, omelianenko.position);
});

test("reports duplicate pair and uses latest result", () => {
  const state = buildLeagueState([
    { line: "Бородай - Омельяненко 6:3 6:4", sourceRow: 2 },
    { line: "Омельяненко - Бородай 6:1 6:1", sourceRow: 3 }
  ]);

  assert.equal(state.matches.length, 1);
  assert.equal(state.issues.length, 1);
  assert.equal(state.matches[0].winner.fullName, "Омельяненко Анна");
});

test("builds schedule from June calendar data", async () => {
  const csv = await readFile(new URL("../data/schedule-june-2026.csv", import.meta.url), "utf8");
  const entries = rowsToScheduleEntries(parseCsv(csv));
  const state = buildScheduleState(entries, new Date(2026, 5, 12, 12, 0));

  assert.equal(state.matches.length, 21);
  assert.equal(state.issues.length, 0);
  assert.equal(state.next.date, "13.06.2026");
  assert.equal(state.next.time, "09:00");
  assert.equal(state.next.playerA.fullName, "Стрижак Олена");
  assert.equal(state.next.playerB.fullName, "Рубець Юлія");
});

test("marks past schedule matches separately from today and upcoming", async () => {
  const csv = await readFile(new URL("../data/schedule-june-2026.csv", import.meta.url), "utf8");
  const entries = rowsToScheduleEntries(parseCsv(csv));
  const state = buildScheduleState(entries, new Date(2026, 5, 13, 8, 0));
  const visibleMatches = state.matches.filter((match) => match.status !== "past");

  assert.equal(state.matches.length, 21);
  assert.equal(visibleMatches.length, 12);
  assert.equal(visibleMatches[0].status, "today");
  assert.equal(visibleMatches[0].date, "13.06.2026");
  assert.equal(visibleMatches.some((match) => match.status === "past"), false);
});

test("reads structured Google Sheet match export with title row", () => {
  const rows = parseCsv(`Tennis League — Журнал матчів
Дата додавання,Гравчиня 1,Гравчиня 2,Рахунок,Переможниця,Програвша,Сети гравчині 1,Сети гравчині 2
2026-06-12,Бородай Олександра,Омельяненко Анна,6:3 6:4,Бородай Олександра,Омельяненко Анна,2,0
`);
  const entries = rowsToEntries(rows);
  const state = buildLeagueState(entries);

  assert.equal(entries[0].line, "Бородай Олександра - Омельяненко Анна 6:3 6:4");
  assert.equal(state.matches.length, 1);
  assert.equal(state.matches[0].winner.fullName, "Бородай Олександра");
});
