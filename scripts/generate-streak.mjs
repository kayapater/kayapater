import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const GRAPHQL_URL = "https://api.github.com/graphql";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseUtcDate(date) {
  return new Date(`${date}T00:00:00Z`);
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatDate(date, currentDate) {
  const value = parseUtcDate(date);
  const current = parseUtcDate(currentDate);
  const options = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };

  if (value.getUTCFullYear() !== current.getUTCFullYear()) {
    options.year = "numeric";
  }

  return new Intl.DateTimeFormat("en-US", options).format(value);
}

export function formatRange(streak, currentDate) {
  const start = formatDate(streak.start, currentDate);
  const end = formatDate(streak.end, currentDate);
  return start === end ? start : `${start} - ${end}`;
}

export function calculateStats(contributions, currentDate) {
  const today = parseUtcDate(currentDate);
  const counts = new Map();

  for (const contribution of contributions) {
    if (
      typeof contribution?.date !== "string" ||
      !Number.isInteger(contribution?.contributionCount) ||
      contribution.contributionCount < 0
    ) {
      throw new TypeError("Invalid contribution entry.");
    }

    if (parseUtcDate(contribution.date) <= today) {
      counts.set(contribution.date, contribution.contributionCount);
    }
  }

  const dates = [...counts.keys()].sort();
  const firstDate = dates[0] ?? currentDate;
  let totalContributions = 0;
  let active = { start: currentDate, end: currentDate, length: 0 };
  let longest = { start: currentDate, end: currentDate, length: 0 };

  for (
    let date = parseUtcDate(firstDate);
    date <= today;
    date = addUtcDays(date, 1)
  ) {
    const dateKey = toDateKey(date);
    const count = counts.get(dateKey) ?? 0;
    totalContributions += count;

    if (count > 0) {
      if (active.length === 0) {
        active.start = dateKey;
      }
      active.end = dateKey;
      active.length += 1;

      if (active.length > longest.length) {
        longest = { ...active };
      }
    } else if (dateKey !== currentDate) {
      active = { start: currentDate, end: currentDate, length: 0 };
    }
  }

  return {
    totalContributions,
    currentStreak: active,
    longestStreak: longest,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderSvg(stats, accountCreatedDate, currentDate) {
  const totalRange = `${formatDate(accountCreatedDate, currentDate)} - Present`;
  const currentRange = formatRange(stats.currentStreak, currentDate);
  const longestRange = formatRange(stats.longestStreak, currentDate);

  return `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'
                style='isolation: isolate' viewBox='0 0 495 195' width='495px' height='195px' direction='ltr'>
        <style>
            @keyframes currstreak {
                0% { font-size: 3px; opacity: 0.2; }
                80% { font-size: 34px; opacity: 1; }
                100% { font-size: 28px; opacity: 1; }
            }
            @keyframes fadein {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
        </style>
        <defs>
            <clipPath id='outer_rectangle'>
                <rect width='495' height='195' rx='4.5'/>
            </clipPath>
            <mask id='mask_out_ring_behind_fire'>
                <rect width='495' height='195' fill='white'/>
                <ellipse id='mask-ellipse' cx='247.5' cy='32' rx='13' ry='18' fill='black'/>
            </mask>
        </defs>
        <g clip-path='url(#outer_rectangle)'>
            <g style='isolation: isolate'>
                <rect stroke='#E4E2E2' fill='#151515' rx='4.5' x='0.5' y='0.5' width='494' height='194'/>
            </g>
            <g style='isolation: isolate'>
                <line x1='165' y1='28' x2='165' y2='170' vector-effect='non-scaling-stroke' stroke-width='1' stroke='#E4E2E2' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>
                <line x1='330' y1='28' x2='330' y2='170' vector-effect='non-scaling-stroke' stroke-width='1' stroke='#E4E2E2' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>
            </g>
            <g style='isolation: isolate'>
                <!-- Total Contributions big number -->
                <g transform='translate(82.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#FEFEFE' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.6s'>${escapeXml(stats.totalContributions)}</text>
                </g>
                <!-- Total Contributions label -->
                <g transform='translate(82.5, 84)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#FEFEFE' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.7s'>Total Contributions</text>
                </g>
                <!-- Total Contributions range -->
                <g transform='translate(82.5, 114)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#9E9E9E' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.8s'>${escapeXml(totalRange)}</text>
                </g>
            </g>
            <g style='isolation: isolate'>
                <!-- Current Streak label -->
                <g transform='translate(247.5, 108)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#FB8C00' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>Current Streak</text>
                </g>
                <!-- Current Streak range -->
                <g transform='translate(247.5, 145)'>
                    <text x='0' y='21' stroke-width='0' text-anchor='middle' fill='#9E9E9E' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>${escapeXml(currentRange)}</text>
                </g>
                <!-- Ring around number -->
                <g mask='url(#mask_out_ring_behind_fire)'>
                    <circle cx='247.5' cy='71' r='40' fill='none' stroke='#FB8C00' stroke-width='5' style='opacity: 0; animation: fadein 0.5s linear forwards 0.4s'></circle>
                </g>
                <!-- Fire icon -->
                <g transform='translate(247.5, 19.5)' stroke-opacity='0' style='opacity: 0; animation: fadein 0.5s linear forwards 0.6s'>
                    <path d='M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z' fill='none'/>
                    <path d='M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z' fill='#FB8C00' stroke-opacity='0'/>
                </g>
                <!-- Current Streak big number -->
                <g transform='translate(247.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#FEFEFE' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='animation: currstreak 0.6s linear forwards'>${escapeXml(stats.currentStreak.length)}</text>
                </g>
            </g>
            <g style='isolation: isolate'>
                <!-- Longest Streak big number -->
                <g transform='translate(412.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#FEFEFE' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.2s'>${escapeXml(stats.longestStreak.length)}</text>
                </g>
                <!-- Longest Streak label -->
                <g transform='translate(412.5, 84)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#FEFEFE' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.3s'>Longest Streak</text>
                </g>
                <!-- Longest Streak range -->
                <g transform='translate(412.5, 114)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='#9E9E9E' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.4s'>${escapeXml(longestRange)}</text>
                </g>
            </g>
        </g>
    </svg>
`;
}

async function requestContributionYear(user, year, token, now) {
  const currentYear = now.getUTCFullYear();
  const from = `${year}-01-01T00:00:00Z`;
  const to =
    year === currentYear ? now.toISOString() : `${year}-12-31T23:59:59Z`;
  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        createdAt
        contributionsCollection(from: $from, to: $to) {
          contributionYears
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "kayapater-profile-streak-generator",
    },
    body: JSON.stringify({
      query,
      variables: { login: user, from, to },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(
      `GitHub GraphQL error: ${payload.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  if (!payload.data?.user) {
    throw new Error(`GitHub user "${user}" was not found.`);
  }

  return payload.data.user;
}

export async function fetchContributionData(user, token, now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const current = await requestContributionYear(user, currentYear, token, now);
  const accountCreatedDate = current.createdAt.slice(0, 10);
  const firstYear = new Date(current.createdAt).getUTCFullYear();
  const years = [];

  for (let year = firstYear; year <= currentYear; year += 1) {
    years.push(year);
  }

  const previousYears = await Promise.all(
    years
      .filter((year) => year !== currentYear)
      .map((year) => requestContributionYear(user, year, token, now)),
  );
  const yearlyData = [...previousYears, current];
  const contributions = yearlyData.flatMap((data) =>
    data.contributionsCollection.contributionCalendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        contributionCount: day.contributionCount,
      })),
    ),
  );

  return { accountCreatedDate, contributions };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--user" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}.`);
      }
      values[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!values.user || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(values.user)) {
    throw new Error("A valid GitHub username is required via --user.");
  }
  if (!values.output) {
    throw new Error("An output path is required via --output.");
  }

  return values;
}

async function writeAtomically(outputPath, contents) {
  const absolutePath = resolve(outputPath);
  const temporaryPath = `${absolutePath}.tmp`;
  await mkdir(dirname(absolutePath), { recursive: true });

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function main(args = process.argv.slice(2)) {
  const { user, output } = parseArguments(args);
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required.");
  }

  const now = new Date();
  const currentDate = toDateKey(now);
  const { accountCreatedDate, contributions } = await fetchContributionData(
    user,
    token,
    now,
  );
  const stats = calculateStats(contributions, currentDate);
  const svg = renderSvg(stats, accountCreatedDate, currentDate);
  await writeAtomically(output, svg);

  console.log(
    `Updated ${output}: ${stats.totalContributions} contributions, ` +
      `${stats.currentStreak.length} current streak, ` +
      `${stats.longestStreak.length} longest streak.`,
  );
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
