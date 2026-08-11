#!/usr/bin/env node

/**
 * Remove console.log statements from production code
 * Usage: node scripts/remove-console-logs.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const PATTERNS = [
  /^\s*console\.log\([^)]*\);?\s*$/gm,
  /^\s*console\.debug\([^)]*\);?\s*$/gm,
];

const KEEP_PATTERNS = [
  /console\.error/,
  /console\.warn/,
  /console\.info/,
];

let filesModified = 0;
let linesRemoved = 0;

function shouldKeepLine(line) {
  return KEEP_PATTERNS.some(pattern => pattern.test(line));
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const newLines = [];
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Keep console.error, console.warn, console.info
    if (shouldKeepLine(line)) {
      newLines.push(line);
      continue;
    }

    // Remove console.log and console.debug
    let shouldRemove = false;
    for (const pattern of PATTERNS) {
      if (pattern.test(line)) {
        shouldRemove = true;
        removed++;
        break;
      }
    }

    if (!shouldRemove) {
      newLines.push(line);
    }
  }

  if (removed > 0) {
    const newContent = newLines.join('\n');
    
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, newContent, 'utf8');
    }
    
    filesModified++;
    linesRemoved += removed;
    console.log(`  ${DRY_RUN ? '[DRY-RUN] ' : ''}✅ ${path.relative(process.cwd(), filePath)}: ${removed} lines`);
  }
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!['node_modules', '.next', 'dist', 'build'].includes(file)) {
        scanDirectory(fullPath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      processFile(fullPath);
    }
  }
}

console.log('========================================');
console.log('Removing console.log statements');
console.log('========================================');
console.log('');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No files will be modified\n');
}

const srcDir = path.join(process.cwd(), 'src');
scanDirectory(srcDir);

console.log('');
console.log('========================================');
console.log('Summary');
console.log('========================================');
console.log(`Files modified: ${filesModified}`);
console.log(`Lines removed: ${linesRemoved}`);
console.log('');

if (DRY_RUN) {
  console.log('ℹ️  Run without --dry-run to apply changes');
} else {
  console.log('✅ Done!');
  console.log('');
  console.log('Note: console.error, console.warn, console.info are kept for logging');
}
