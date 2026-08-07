import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  calculateStats,
  formatDate,
  formatRange,
  main,
  renderSvg,
} from "../scripts/generate-streak.mjs";

function contribution(date, contributionCount = 1) {
  return { date, contributionCount };
}

test("calculates total, current streak, and longest streak", () => {
  const stats = calculateStats(
    [
      contribution("2025-12-30", 3),
      contribution("2025-12-31", 2),
      contribution("2026-01-01", 4),
      contribution("2026-01-03", 5),
      contribution("2026-01-04", 6),
    ],
    "2026-01-04",
  );

  assert.equal(stats.totalContributions, 20);
  assert.deepEqual(stats.currentStreak, {
    start: "2026-01-03",
    end: "2026-01-04",
    length: 2,
  });
  assert.deepEqual(stats.longestStreak, {
    start: "2025-12-30",
    end: "2026-01-01",
    length: 3,
  });
});

test("keeps yesterday's streak when today has no contributions", () => {
  const stats = calculateStats(
    [
      contribution("2026-06-03", 1),
      contribution("2026-06-04", 1),
      contribution("2026-06-05", 0),
    ],
    "2026-06-05",
  );

  assert.equal(stats.currentStreak.length, 2);
  assert.equal(stats.currentStreak.end, "2026-06-04");
});

test("resets the current streak after a two-day gap", () => {
  const stats = calculateStats(
    [
      contribution("2026-06-01", 1),
      contribution("2026-06-02", 1),
      contribution("2026-06-05", 1),
    ],
    "2026-06-05",
  );

  assert.deepEqual(stats.currentStreak, {
    start: "2026-06-05",
    end: "2026-06-05",
    length: 1,
  });
  assert.equal(stats.longestStreak.length, 2);
});

test("handles empty contribution data", () => {
  const stats = calculateStats([], "2026-06-06");

  assert.equal(stats.totalContributions, 0);
  assert.equal(stats.currentStreak.length, 0);
  assert.equal(stats.longestStreak.length, 0);
});

test("matches the verified kayapater summary fixture", () => {
  const fixture = [
    contribution("2020-11-21", 1),
    contribution("2025-02-01", 20),
    contribution("2025-05-01", 21),
    contribution("2025-11-23", 1),
    contribution("2025-11-24", 1),
    contribution("2026-01-10", 20),
    contribution("2026-03-10", 26),
    contribution("2026-06-06", 2),
  ];
  const stats = calculateStats(fixture, "2026-06-06");

  assert.equal(stats.totalContributions, 92);
  assert.equal(stats.currentStreak.length, 1);
  assert.deepEqual(stats.longestStreak, {
    start: "2025-11-23",
    end: "2025-11-24",
    length: 2,
  });
});

test("formats current-year and historical dates like the existing card", () => {
  assert.equal(formatDate("2026-06-06", "2026-06-06"), "Jun 6");
  assert.equal(formatDate("2020-11-21", "2026-06-06"), "Nov 21, 2020");
  assert.equal(
    formatRange(
      { start: "2025-11-23", end: "2025-11-24", length: 2 },
      "2026-06-06",
    ),
    "Nov 23, 2025 - Nov 24, 2025",
  );
});

test("renders the expected dark 495x195 SVG card", () => {
  const svg = renderSvg(
    {
      totalContributions: 92,
      currentStreak: {
        start: "2026-06-06",
        end: "2026-06-06",
        length: 1,
      },
      longestStreak: {
        start: "2025-11-23",
        end: "2025-11-24",
        length: 2,
      },
    },
    "2020-11-21",
    "2026-06-06",
  );

  assert.match(svg, /^<svg[\s\S]*<\/svg>\s*$/);
  assert.match(svg, /viewBox='0 0 495 195'/);
  assert.match(svg, /fill='#151515'/);
  assert.match(svg, /stroke='#FB8C00'/);
  assert.match(svg, />Total Contributions</);
  assert.match(svg, />Current Streak</);
  assert.match(svg, />Longest Streak</);
  assert.match(svg, />92</);
  assert.match(svg, />1</);
  assert.match(svg, />2</);
});

test("does not overwrite the current card when GitHub returns an error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "streak-card-test-"));
  const output = join(directory, "streak.svg");
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  await writeFile(output, "existing card", "utf8");

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        errors: [{ message: "Temporary GitHub API failure" }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  process.env.GITHUB_TOKEN = "test-token";

  try {
    await assert.rejects(
      main(["--user", "kayapater", "--output", output]),
      /Temporary GitHub API failure/,
    );
    assert.equal(await readFile(output, "utf8"), "existing card");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
