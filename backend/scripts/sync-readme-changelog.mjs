import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const changelogPath = resolve(root, 'CHANGELOG.md');
const readmePath = resolve(root, 'README.md');

const startMarker = '<!-- AUTO-CHANGELOG:START -->';
const endMarker = '<!-- AUTO-CHANGELOG:END -->';
const maxEntries = 5;

function extractEntries(changelogText) {
  const rawSections = changelogText
    .split('\n## [')
    .slice(1)
    .map((part) => `## [${part}`)
    .map((section) => section.split('\n---\n')[0].trim())
    .filter(Boolean);

  return rawSections.slice(0, maxEntries).map((section) => {
    const lines = section.split('\n');
    const header = (lines[0] || '').trim();
    const body = lines.slice(1).join('\n').trim();

    const headingMatch = header.match(/^## \[([^\]]+)\]\s*[—-]\s*(.+)$/);
    const heading = headingMatch
      ? `### v${headingMatch[1]} — ${headingMatch[2]}`
      : header.replace(/^##\s*/, '### ');

    return `${heading}\n\n${body}`.trim();
  });
}

function updateReadme(readmeText, renderedEntries) {
  const block = `${startMarker}\n\n${renderedEntries}\n\n${endMarker}`;
  const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);

  if (!pattern.test(readmeText)) {
    throw new Error('README marker block not found. Add AUTO-CHANGELOG markers first.');
  }

  return readmeText.replace(pattern, block);
}

const changelogText = readFileSync(changelogPath, 'utf8');
const readmeText = readFileSync(readmePath, 'utf8');

const entries = extractEntries(changelogText);
if (entries.length === 0) {
  throw new Error('No version entries found in CHANGELOG.md');
}

const rendered = entries.join('\n\n');
const nextReadme = updateReadme(readmeText, rendered);

if (nextReadme !== readmeText) {
  writeFileSync(readmePath, nextReadme, 'utf8');
  console.log('README.md updated from CHANGELOG.md');
} else {
  console.log('README.md already up to date');
}
