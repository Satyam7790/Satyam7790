
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "Satyam7790";
const TOKEN = process.env.GH_TOKEN;

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function githubFetch(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error ${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}

// Fetch all repositories owned by the user.
async function getRepositories() {
  const repositories = [];

  for (let page = 1; ; page++) {
    const batch = await githubFetch(
      `https://api.github.com/users/${USERNAME}/repos?type=owner&per_page=100&page=${page}`
    );

    repositories.push(...batch);

    if (batch.length < 100) break;
  }

  // Exclude forks and archived repositories.
  return repositories.filter(
    (repo) => !repo.fork && !repo.archived
  );
}

// Fetch language bytes from every repository.
async function getLanguageStats(repositories) {
  const totals = {};

  for (let i = 0; i < repositories.length; i += 5) {
    const batch = repositories.slice(i, i + 5);

    const results = await Promise.all(
      batch.map((repo) => githubFetch(repo.languages_url))
    );

    for (const languages of results) {
      for (const [language, bytes] of Object.entries(languages)) {
        totals[language] = (totals[language] || 0) + bytes;
      }
    }
  }

  const totalBytes = Object.values(totals).reduce(
    (sum, bytes) => sum + bytes,
    0
  );

  return Object.entries(totals)
    .map(([name, bytes]) => ({
      name,
      percentage: (bytes / totalBytes) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

const colors = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  HTML: "#e34c26",
  CSS: "#563d7c",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Go: "#00ADD8",
  Rust: "#dea584",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Shell: "#89e051",
};

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

// Generate the SVG image.
function generateSVG(languages, repositoryCount) {
  const width = 760;
  const rowHeight = 30;
  const height = Math.max(280, 110 + languages.length * rowHeight);

  const cx = 190;
  const cy = height / 2 + 15;
  const radius = Math.min(130, (height - 110) / 2);

  const extraColors = [
    "#58a6ff",
    "#f778ba",
    "#3fb950",
    "#d29922",
    "#a371f7",
    "#39c5cf",
    "#ff7b72",
    "#8b949e",
  ];

  let currentAngle = -Math.PI / 2;

  // Generate pie chart slices
  const slices = languages.map((language, index) => {
    const startAngle = currentAngle;

    currentAngle += (language.percentage / 100) * Math.PI * 2;

    const endAngle = currentAngle;

    const color =
      colors[language.name] ||
      extraColors[index % extraColors.length];

    // Handle a single-language repository collection
    if (languages.length === 1) {
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`;
    }

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);

    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return `
      <path
        d="
          M ${cx} ${cy}
          L ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          Z
        "
        fill="${color}"
        stroke="#0d1117"
        stroke-width="2"
      />
    `;
  }).join("");

  // Generate the language legend
  const legendStartY =
    cy - ((languages.length - 1) * rowHeight) / 2;

  const legend = languages.map((language, index) => {
    const y = legendStartY + index * rowHeight;

    const color =
      colors[language.name] ||
      extraColors[index % extraColors.length];

    return `
      <circle cx="385" cy="${y - 5}" r="6" fill="${color}"/>

      <text
        x="402"
        y="${y}"
        fill="#e6edf3"
        font-size="16"
        font-weight="600"
        font-family="Arial, sans-serif"
      >
        ${escapeXml(language.name)}
      </text>

      <text
        x="730"
        y="${y}"
        fill="#c9d1d9"
        font-size="16"
        text-anchor="end"
        font-family="Arial, sans-serif"
      >
        ${language.percentage.toFixed(1)}%
      </text>
    `;
  }).join("");

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <rect
        width="100%"
        height="100%"
        rx="16"
        fill="#0d1117"
      />

      ${slices}
      ${legend}
    </svg>
  `;
}


async function main() {
  console.log(`Fetching repositories for ${USERNAME}...`);

  const repositories = await getRepositories();

  console.log(`Found ${repositories.length} repositories.`);

  const languages = await getLanguageStats(repositories);

  if (languages.length === 0) {
    throw new Error("No language statistics were found.");
  }

  const svg = generateSVG(languages, repositories.length);

  const outputPath = path.resolve(
    "assets"
  );

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, svg.trim());

  console.log("Language statistics generated successfully.");

  console.table(languages);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
