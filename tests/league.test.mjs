import assert from "node:assert/strict";
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

test("builds ranking from inline match CSV", () => {
  const csv = `Timestamp,Матч,Примітка
Скрін,Антощенко - Таран 6:0 6:0,Потребує підтвердження зі скріну
Скрін,Бородай - Омельяненко 6:3 6:4,Потребує підтвердження зі скріну
Скрін,Гончаренко - Карпець 6:1 6:1,Потребує підтвердження зі скріну
`;
  const entries = rowsToEntries(parseCsv(csv));
  const state = buildLeagueState(entries);

  assert.equal(state.matches.length, 3);
  assert.equal(state.issues.length, 0);
  assert.equal(state.stats.leader.player.fullName, "Антощенко Тетяна");
  assert.equal(state.stats.leader.points, 1);
  assert.equal(state.stats.leader.gameDiff, 12);
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

test("builds schedule from inline calendar data", () => {
  const csv = `Дата,День,Час,Гравчиня 1,Гравчиня 2,Примітка
12.06.2026,п'ятниця,09:00,Омельяненко Анна,Боблях Аліна,Перенесено зі скріну
13.06.2026,субота,09:00,Стрижак Олена,Рубець Юлія,Перенесено зі скріну
14.06.2026,неділя,10:00,Троцак Аліна,Карпець Марія,Перенесено зі скріну
`;
  const entries = rowsToScheduleEntries(parseCsv(csv));
  const state = buildScheduleState(entries, new Date(2026, 5, 12, 12, 0));

  assert.equal(state.matches.length, 3);
  assert.equal(state.issues.length, 0);
  assert.equal(state.next.date, "13.06.2026");
  assert.equal(state.next.time, "09:00");
  assert.equal(state.next.playerA.fullName, "Стрижак Олена");
  assert.equal(state.next.playerB.fullName, "Рубець Юлія");
});

test("marks past schedule matches separately from today and upcoming", () => {
  const csv = `Дата,День,Час,Гравчиня 1,Гравчиня 2,Примітка
12.06.2026,п'ятниця,09:00,Омельяненко Анна,Боблях Аліна,Перенесено зі скріну
13.06.2026,субота,09:00,Стрижак Олена,Рубець Юлія,Перенесено зі скріну
14.06.2026,неділя,10:00,Троцак Аліна,Карпець Марія,Перенесено зі скріну
`;
  const entries = rowsToScheduleEntries(parseCsv(csv));
  const state = buildScheduleState(entries, new Date(2026, 5, 13, 8, 0));
  const visibleMatches = state.matches.filter((match) => match.status !== "past");

  assert.equal(state.matches.length, 3);
  assert.equal(visibleMatches.length, 2);
  assert.equal(visibleMatches[0].status, "today");
  assert.equal(visibleMatches[0].date, "13.06.2026");
  assert.equal(visibleMatches.some((match) => match.status === "past"), false);
});

test("reads live Google Sheet schedule export", () => {
  const rows = parseCsv(`Tennis League — Розклад матчів Дата,День,Час,Гравчиня 1,Гравчиня 2,Статус,Примітка
2026-06-22,понеділок,18:00,Антощенко Тетяна,Гончаренко Анелія,заплановано,Оновлено 22.06
2026-06-25,четвер,9:00,Антощенко Тетяна,Боблях Аліна,заплановано,Оновлено 22.06
`);
  const entries = rowsToScheduleEntries(rows);
  const state = buildScheduleState(entries, new Date(2026, 5, 22, 12, 0));

  assert.equal(state.matches.length, 2);
  assert.equal(state.issues.length, 0);
  assert.equal(state.next.date, "2026-06-22");
  assert.equal(state.next.time, "18:00");
  assert.equal(state.next.lifecycleStatus, "planned");
  assert.equal(state.next.note, "Оновлено 22.06");
  assert.equal(state.next.playerA.fullName, "Антощенко Тетяна");
  assert.equal(state.next.playerB.fullName, "Гончаренко Анелія");
});

test("hides inactive schedule statuses and keeps the latest active duplicate", () => {
  const rows = parseCsv(`Дата,День,Час,Гравчиня 1,Гравчиня 2,Статус,Примітка
2026-06-24,середа,19:00,Стрижак Олена,Саричева Оксана,перенесено,Стара дата
2026-06-26,п'ятниця,18:00,Стрижак Олена,Саричева Оксана,заплановано,Нова дата
2026-06-25,четвер,09:00,Антощенко Тетяна,Боблях Аліна,заплановано,Стара активна дата
2026-06-27,субота,09:00,Антощенко Тетяна,Боблях Аліна,заплановано,Нова активна дата
2026-06-27,субота,17:00,Бородай Олександра,Омельяненко Анна,зіграно,Результат внесено
`);
  const entries = rowsToScheduleEntries(rows);
  const state = buildScheduleState(entries, new Date(2026, 5, 24, 12, 0));

  assert.equal(state.matches.length, 2);
  assert.equal(state.issues.length, 1);
  assert.deepEqual(state.matches.map((match) => match.note), ["Нова дата", "Нова активна дата"]);
  assert.equal(state.matches.every((match) => match.lifecycleStatus === "planned"), true);
});

test("hides unknown schedule statuses instead of showing them as planned", () => {
  const rows = parseCsv(`Дата,День,Час,Гравчиня 1,Гравчиня 2,Статус,Примітка
2026-06-24,середа,19:00,Стрижак Олена,Саричева Оксана,пернесено,Помилка в статусі
2026-06-25,четвер,09:00,Антощенко Тетяна,Боблях Аліна,заплановано,Активний матч
`);
  const entries = rowsToScheduleEntries(rows);
  const state = buildScheduleState(entries, new Date(2026, 5, 24, 12, 0));

  assert.equal(state.matches.length, 1);
  assert.equal(state.issues.length, 1);
  assert.match(state.issues[0], /приховано з календаря/);
  assert.equal(state.matches[0].note, "Активний матч");
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
