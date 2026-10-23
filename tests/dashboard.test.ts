import assert from "node:assert/strict";
import test from "node:test";
import { chicagoDay, donutArcs, money, recentDays, runningTotal, seriesFrom, windowSum } from "../lib/dashboard-math.ts";

test("chicago days and money stay stable", () => {
  assert.equal(chicagoDay("2026-10-22T03:30:00.000Z"), "2026-10-21");
  assert.equal(chicagoDay("2026-10-22T18:00:00.000Z"), "2026-10-22");
  assert.equal(money(1900), "$19");
  assert.equal(money(1950), "$19.50");
  const days = recentDays(30, new Date("2026-10-22T18:00:00.000Z"));
  assert.equal(days.length, 30);
  assert.equal(days.at(-1), "2026-10-22");
});

test("series and donuts use the visible window", () => {
  const days = ["2026-10-20", "2026-10-21", "2026-10-22"];
  const points = seriesFrom(days, [
    { at: "2026-10-22T18:00:00.000Z" },
    { at: "2026-10-22T19:00:00.000Z", amount: 5 },
    { at: "2026-10-01T18:00:00.000Z" },
  ]);
  assert.deepEqual(points.map((point) => point.value), [0, 0, 2]);
  assert.equal(windowSum(points, 2), 2);
  assert.deepEqual(runningTotal(points).map((point) => point.value), [0, 0, 2]);
  const paid = seriesFrom(days, [{ at: "2026-10-21T18:00:00.000Z", amount: 2500 }], true);
  assert.equal(paid[1].value, 2500);
  const geometry = donutArcs([1, 3]);
  assert.equal(geometry.total, 4);
  assert.ok(Math.abs(geometry.arcs[0].length * 4 - geometry.circumference) < 0.001);
  assert.equal(donutArcs([0, 0]).arcs[0].length, 0);
});
