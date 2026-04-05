/**
 * PROJECT SNAPSHOT WATCHER
 * ========================
 * Run: node snapshot-watcher.js
 * 
 * On every file save, rebuilds PROJECT_SNAPSHOT.md with:
 *   - File tree
 *   - Full source code (all tracked extensions)
 *   - DB schema (SQL migration files)
 *   - UI component list
 *
 * Requirements: npm install chokidar
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─── CONFIG ────────────────────────────────────────────────────────────────

const CONFIG = {
  // Root of your project (change this to your project path)
  projectRoot: process.cwd(),

  // Output snapshot file (placed in project root)
  outputFile: "PROJECT_SNAPSHOT.md",

  // File extensions to include as source code
  sourceExtensions: [
    ".js", ".ts", ".jsx", ".tsx",   // JavaScript / TypeScript
    ".php",                          // PHP
    ".py",                           // Python
    ".vue", ".svelte",               // Frontend frameworks
    ".css", ".scss", ".sass",        // Styles
    ".html", ".htm",                 // HTML
    ".json",                         // Config / package files
    ".env", ".env.example",          // Environment
    ".yaml", ".yml",                 // Config files
    ".sql",                          // DB migrations / schemas
    ".prisma", ".graphql",           // ORM / GraphQL schemas
    ".md",                           // Markdown docs (optional)
  ],

  // Folders to completely ignore
  ignoreFolders: [
    "node_modules",
    ".git",
    "vendor",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "storage",
    "cache",
    ".cache",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
  ],

  // Specific files to ignore (exact filenames)
  ignoreFiles: [
    "PROJECT_SNAPSHOT.md",
    "package-lock.json",
    "yarn.lock",
    "composer.lock",
    ".DS_Store",
  ],

  // Max file size to include (bytes). Larger files are skipped.
  maxFileSizeBytes: 100 * 1024, // 100 KB

  // DB schema detection: file patterns that contain schema info
  dbSchemaPatterns: [
    /migration/i,
    /schema\.sql/i,
    /schema\.prisma/i,
    /\d{4}_\d{2}_\d{2}/,   // timestamp migrations
    /_migration\./i,
    /create_table/i,
  ],

  // UI component detection: folders/file patterns
  uiComponentPatterns: [
    /components\//i,
    /views\//i,
    /pages\//i,
    /layouts\//i,
    /widgets\//i,
  ],
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

function shouldIgnore(filePath) {
  const relative = path.relative(CONFIG.projectRoot, filePath);
  const parts = relative.split(path.sep);

  // Ignore if any parent folder is in ignoreFolders
  for (const part of parts) {
    if (CONFIG.ignoreFolders.includes(part)) return true;
  }

  // Ignore specific filenames
  const basename = path.basename(filePath);
  if (CONFIG.ignoreFiles.includes(basename)) return true;

  return false;
}

function shouldInclude(filePath) {
  if (shouldIgnore(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Include .env files (no extension match needed)
  if (basename.startsWith(".env")) return true;

  return CONFIG.sourceExtensions.includes(ext);
}

function getAllFiles(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!CONFIG.ignoreFolders.includes(entry.name)) {
        getAllFiles(fullPath, results);
      }
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function buildFileTree(dir, prefix = "", isRoot = true) {
  let output = isRoot ? `${path.basename(dir)}/\n` : "";
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !CONFIG.ignoreFolders.includes(e.name) && !CONFIG.ignoreFiles.includes(e.name))
      .sort((a, b) => {
        // Dirs first, then files
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return output;
  }

  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = prefix + (isLast ? "    " : "│   ");

    if (entry.isDirectory()) {
      output += `${prefix}${connector}${entry.name}/\n`;
      output += buildFileTree(path.join(dir, entry.name), childPrefix, false);
    } else {
      output += `${prefix}${connector}${entry.name}\n`;
    }
  });

  return output;
}

function getLanguage(ext) {
  const map = {
    ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".php": "php", ".py": "python",
    ".vue": "vue", ".svelte": "svelte",
    ".css": "css", ".scss": "scss", ".sass": "sass",
    ".html": "html", ".htm": "html",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".sql": "sql", ".prisma": "prisma",
    ".graphql": "graphql", ".md": "markdown",
    ".env": "bash", ".sh": "bash",
  };
  return map[ext] || "";
}

// ─── SNAPSHOT BUILDER ────────────────────────────────────────────────────────

function buildSnapshot() {
  const timestamp = new Date().toLocaleString();
  const allFiles = getAllFiles(CONFIG.projectRoot).filter(shouldInclude);

  const dbFiles = [];
  const uiFiles = [];
  const sourceFiles = [];

  for (const f of allFiles) {
    const rel = path.relative(CONFIG.projectRoot, f);
    const isDB = CONFIG.dbSchemaPatterns.some(p => p.test(rel));
    const isUI = CONFIG.uiComponentPatterns.some(p => p.test(rel));

    if (isDB) dbFiles.push(f);
    else if (isUI) uiFiles.push(f);
    else sourceFiles.push(f);
  }

  let out = "";

  // ── Header
  out += `# Project Snapshot\n`;
  out += `> Generated: ${timestamp}  \n`;
  out += `> Root: \`${CONFIG.projectRoot}\`  \n`;
  out += `> Files included: ${allFiles.length}\n\n`;
  out += `---\n\n`;

  // ── File Tree
  out += `## File Tree\n\n`;
  out += "```\n";
  out += buildFileTree(CONFIG.projectRoot);
  out += "```\n\n";
  out += `---\n\n`;

  // ── DB Schema
  out += `## Database Schema\n\n`;
  if (dbFiles.length === 0) {
    out += `_No migration or schema files detected._\n\n`;
  } else {
    for (const f of dbFiles) {
      const rel = path.relative(CONFIG.projectRoot, f);
      const ext = path.extname(f).toLowerCase();
      const lang = getLanguage(ext);
      const stat = fs.statSync(f);

      out += `### \`${rel}\`\n\n`;

      if (stat.size > CONFIG.maxFileSizeBytes) {
        out += `_File too large to include (${Math.round(stat.size / 1024)} KB)._\n\n`;
        continue;
      }

      try {
        const content = fs.readFileSync(f, "utf8");
        out += `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
      } catch {
        out += `_Could not read file._\n\n`;
      }
    }
  }
  out += `---\n\n`;

  // ── UI Components
  out += `## UI Components\n\n`;
  if (uiFiles.length === 0) {
    out += `_No UI component files detected._\n\n`;
  } else {
    for (const f of uiFiles) {
      const rel = path.relative(CONFIG.projectRoot, f);
      const ext = path.extname(f).toLowerCase();
      const lang = getLanguage(ext);
      const stat = fs.statSync(f);

      out += `### \`${rel}\`\n\n`;

      if (stat.size > CONFIG.maxFileSizeBytes) {
        out += `_File too large (${Math.round(stat.size / 1024)} KB)._\n\n`;
        continue;
      }

      try {
        const content = fs.readFileSync(f, "utf8");
        out += `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
      } catch {
        out += `_Could not read file._\n\n`;
      }
    }
  }
  out += `---\n\n`;

  // ── Source Code
  out += `## Source Code\n\n`;
  if (sourceFiles.length === 0) {
    out += `_No source files detected._\n\n`;
  } else {
    for (const f of sourceFiles) {
      const rel = path.relative(CONFIG.projectRoot, f);
      const ext = path.extname(f).toLowerCase();
      const lang = getLanguage(ext);
      const stat = fs.statSync(f);

      out += `### \`${rel}\`\n\n`;

      if (stat.size > CONFIG.maxFileSizeBytes) {
        out += `_File too large (${Math.round(stat.size / 1024)} KB)._\n\n`;
        continue;
      }

      try {
        const content = fs.readFileSync(f, "utf8");
        out += `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
      } catch {
        out += `_Could not read file._\n\n`;
      }
    }
  }

  // ── Write output
  const outputPath = path.join(CONFIG.projectRoot, CONFIG.outputFile);
  fs.writeFileSync(outputPath, out, "utf8");

  const sizeKB = Math.round(Buffer.byteLength(out, "utf8") / 1024);
  console.log(`[${new Date().toLocaleTimeString()}] ✓ Snapshot updated → ${CONFIG.outputFile} (${sizeKB} KB, ${allFiles.length} files)`);
}

// ─── WATCHER ─────────────────────────────────────────────────────────────────

// Check if chokidar is installed
let chokidar;
try {
  chokidar = require("chokidar");
} catch {
  console.error("\n⚠  'chokidar' is not installed. Run:\n\n    npm install chokidar\n\nThen restart this script.\n");
  process.exit(1);
}

console.log(`\n🔍 Project Snapshot Watcher`);
console.log(`   Root : ${CONFIG.projectRoot}`);
console.log(`   Output: ${CONFIG.outputFile}`);
console.log(`   Watching for changes...\n`);

// Build once immediately on start
buildSnapshot();

let debounceTimer = null;

const watcher = chokidar.watch(CONFIG.projectRoot, {
  ignored: [
    /(^|[\/\\])\../,                        // dotfiles
    ...CONFIG.ignoreFolders.map(f => `**/${f}/**`),
    `**/${CONFIG.outputFile}`,
  ],
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
});

function onFileChange(filePath) {
  // Only react to tracked file types
  if (!shouldInclude(filePath) && !shouldIgnore(filePath)) return;
  if (shouldIgnore(filePath)) return;

  // Debounce: wait 500ms after last change before rebuilding
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    buildSnapshot();
  }, 500);
}

watcher
  .on("add", onFileChange)
  .on("change", onFileChange)
  .on("unlink", onFileChange);

process.on("SIGINT", () => {
  console.log("\n\nWatcher stopped.");
  watcher.close();
  process.exit(0);
});
