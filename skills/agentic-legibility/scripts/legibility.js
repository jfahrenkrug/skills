#!/usr/bin/env node
// GENERATED FILE — do not edit.
// Source: packages/legibility/src/
// Rebuild: cd packages/legibility && npm run build
import path from "node:path";
import { promises } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const IGNORED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".hg",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".pytest_cache",
  ".svn",
  ".turbo",
  ".venv",
  ".yarn",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor"
]);
const DOC_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".txt"]);
const MAX_TEXT_SIZE = 25e4;
function toPosix(value) {
  return value.split(path.sep).join("/");
}
function rel(root, absolutePath) {
  return toPosix(path.relative(root, absolutePath));
}
function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
}
function globToRegExp(pattern) {
  let result = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      result += ".*";
      index += 1;
    } else if (char === "*") {
      result += "[^/]*";
    } else if (char === "?") {
      result += ".";
    } else {
      result += escapeRegex(char);
    }
  }
  return new RegExp(`^${result}$`, "u");
}
function matchesExclude(relpath, patterns) {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => {
    const trimmed = pattern.replace(/\/+$/gu, "");
    if (relpath === pattern || relpath.startsWith(`${trimmed}/`)) {
      return true;
    }
    return globToRegExp(pattern).test(relpath);
  });
}
async function readText(filePath) {
  try {
    const stat = await promises.stat(filePath);
    if (stat.size > MAX_TEXT_SIZE) {
      return "";
    }
    return await promises.readFile(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}
async function isDirectory(targetPath) {
  try {
    return (await promises.stat(targetPath)).isDirectory();
  } catch (_error) {
    return false;
  }
}
async function readDirEntries(targetPath) {
  try {
    return await promises.readdir(targetPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
}
async function walkRepo(root, excludes = []) {
  const excludePatterns = excludes.map((pattern) => pattern.trim().replace(/^\/+|\/+$/gu, "")).filter(Boolean);
  const stack = [root];
  const results = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = await readDirEntries(current);
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relpath = rel(root, absolutePath);
      if (matchesExclude(relpath, excludePatterns)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          stack.push(absolutePath);
        }
      } else {
        results.push(relpath);
      }
    }
  }
  return results;
}
function findFiles(paths, ...patterns) {
  return paths.filter((relpath) => {
    const basename = path.posix.basename(relpath);
    return patterns.some((pattern) => {
      const matcher = globToRegExp(pattern);
      return matcher.test(basename) || matcher.test(relpath);
    });
  });
}
async function readCandidates(paths, root, patterns) {
  const selected = {};
  for (const relpath of findFiles(paths, ...patterns)) {
    selected[relpath] = await readText(path.join(root, relpath));
  }
  return selected;
}
const PATTERNS$c = ["package.json"];
function parsePackageScripts(text) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return /* @__PURE__ */ new Set();
    const scripts = parsed.scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      return /* @__PURE__ */ new Set();
    }
    return new Set(Object.keys(scripts).map((name) => String(name).trim()));
  } catch (_error) {
    return /* @__PURE__ */ new Set();
  }
}
const javascriptAdapter = {
  id: "javascript",
  displayName: "JavaScript / Node.js",
  patterns: PATTERNS$c,
  detect(files) {
    return files.some((f) => f.toLowerCase().endsWith("package.json"));
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$c);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parsePackageScripts(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$b = ["Makefile", "makefile"];
function parseMakeTargets(text) {
  const targets = /* @__PURE__ */ new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith("	") || line.startsWith(" ")) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/u);
    if (match && !match[1].startsWith(".")) {
      targets.add(match[1]);
    }
  }
  return targets;
}
const makeAdapter = {
  id: "make",
  displayName: "GNU Make",
  patterns: PATTERNS$b,
  detect(files) {
    return files.some((f) => {
      const base = f.split("/").pop()?.toLowerCase();
      return base === "makefile";
    });
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$b);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseMakeTargets(text);
      for (const n of parsed) names.add(n);
      sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$a = ["justfile", "Justfile"];
function parseJustTargets(text) {
  const targets = /* @__PURE__ */ new Set();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/u);
    if (match) targets.add(match[1]);
  }
  return targets;
}
const justAdapter = {
  id: "just",
  displayName: "just",
  patterns: PATTERNS$a,
  detect(files) {
    return files.some((f) => {
      const base = f.split("/").pop()?.toLowerCase();
      return base === "justfile";
    });
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$a);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseJustTargets(text);
      for (const n of parsed) names.add(n);
      sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$9 = ["Taskfile.yml", "Taskfile.yaml"];
function parseTaskfileTargets(text) {
  const targets = /* @__PURE__ */ new Set();
  let inTasks = false;
  for (const line of text.split(/\r?\n/u)) {
    if (/^tasks:\s*$/u.test(line)) {
      inTasks = true;
      continue;
    }
    if (inTasks && /^[A-Za-z]/u.test(line)) break;
    if (!inTasks) continue;
    const match = line.match(/^\s{2,}([A-Za-z0-9_.-]+):\s*$/u);
    if (match) targets.add(match[1]);
  }
  return targets;
}
const taskfileAdapter = {
  id: "task",
  displayName: "Task (go-task)",
  patterns: PATTERNS$9,
  detect(files) {
    return files.some((f) => {
      const base = f.split("/").pop()?.toLowerCase();
      return base === "taskfile.yml" || base === "taskfile.yaml";
    });
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$9);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseTaskfileTargets(text);
      for (const n of parsed) names.add(n);
      sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$8 = [".cargo/config.toml", ".cargo/config"];
function parseCargoAliases(text) {
  const targets = /* @__PURE__ */ new Set();
  let inAlias = false;
  for (const line of text.split(/\r?\n/u)) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    if (/^\[[^\]]+\]\s*$/u.test(stripped)) {
      inAlias = stripped.toLowerCase() === "[alias]";
      continue;
    }
    if (!inAlias) continue;
    const match = stripped.match(/^([A-Za-z0-9_.:-]+)\s*=/u);
    if (match) targets.add(match[1]);
  }
  return targets;
}
const rustAdapter = {
  id: "cargo",
  displayName: "Rust / Cargo",
  patterns: PATTERNS$8,
  detect(files) {
    return files.some((f) => f.toLowerCase().endsWith(".cargo/config.toml") || f.toLowerCase().endsWith(".cargo/config"));
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$8);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseCargoAliases(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$7 = ["pyproject.toml", "setup.py", "tox.ini"];
const SCRIPT_TABLE_PATTERNS = [
  /^\[project\.scripts\]\s*$/u,
  /^\[tool\.poetry\.scripts\]\s*$/u,
  /^\[tool\.pdm\.scripts\]\s*$/u,
  /^\[tool\.hatch\.envs\.[^\]]+\.scripts\]\s*$/u
];
function isTableHeader(line) {
  return /^\[[^\]]+\]\s*$/u.test(line);
}
function matchesScriptTable(line) {
  return SCRIPT_TABLE_PATTERNS.some((rx) => rx.test(line));
}
function parsePythonScripts(text) {
  const names = /* @__PURE__ */ new Set();
  let inScriptTable = false;
  for (const raw of text.split(/\r?\n/u)) {
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    if (isTableHeader(stripped)) {
      inScriptTable = matchesScriptTable(stripped);
      continue;
    }
    if (!inScriptTable) continue;
    const match = stripped.match(/^([A-Za-z0-9_.:-]+)\s*=/u);
    if (match) names.add(match[1]);
  }
  return names;
}
function parseToxEnvlist(text) {
  const envs = /* @__PURE__ */ new Set();
  const lines = text.split(/\r?\n/u);
  let inTox = false;
  let collecting = false;
  let buffer = "";
  function flush() {
    if (buffer) {
      for (const name of splitEnvlist(buffer)) envs.add(name);
      buffer = "";
    }
    collecting = false;
  }
  for (const raw of lines) {
    const stripped = raw.trim();
    if (/^\[[^\]]+\]\s*$/u.test(stripped)) {
      flush();
      inTox = stripped === "[tox]";
      continue;
    }
    if (!inTox) continue;
    if (!collecting) {
      const match = raw.match(/^\s*envlist\s*=\s*(.*)$/u);
      if (match) {
        buffer = match[1].trim();
        collecting = true;
      }
      continue;
    }
    if (stripped === "") continue;
    if (raw[0] === " " || raw[0] === "	") {
      buffer += " " + stripped;
      continue;
    }
    flush();
    if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/u.test(raw)) continue;
  }
  flush();
  return envs;
}
function splitEnvlist(raw) {
  return raw.split(/[\s,]+/u).map((s) => s.trim()).filter((s) => s.length > 0 && !s.startsWith("#"));
}
const pythonAdapter = {
  id: "python",
  displayName: "Python",
  patterns: PATTERNS$7,
  detect(files) {
    return files.some((f) => {
      const base = f.split("/").pop()?.toLowerCase();
      return base === "pyproject.toml" || base === "setup.py" || base === "tox.ini";
    });
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$7);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const base = relpath.split("/").pop()?.toLowerCase();
      let parsed = /* @__PURE__ */ new Set();
      if (base === "pyproject.toml") {
        parsed = parsePythonScripts(text);
      } else if (base === "tox.ini") {
        const envs = parseToxEnvlist(text);
        for (const env of envs) parsed.add(`tox:${env}`);
      }
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$6 = ["build.gradle", "build.gradle.kts"];
const GROOVY_TASK = /(?:^|\n)\s*task\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*[{(<]/gu;
const KOTLIN_REGISTER = /tasks\.register(?:<[^>]+>)?\s*\(\s*["']([^"']+)["']/gu;
const KOTLIN_CREATE = /tasks\.create(?:<[^>]+>)?\s*\(\s*["']([^"']+)["']/gu;
const KOTLIN_REGISTERING = /val\s+([A-Za-z_][A-Za-z0-9_]*)\s+by\s+tasks\.(?:registering|creating)/gu;
function parseGradleTasks(text) {
  const names = /* @__PURE__ */ new Set();
  for (const regex of [GROOVY_TASK, KOTLIN_REGISTER, KOTLIN_CREATE, KOTLIN_REGISTERING]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      names.add(match[1]);
    }
  }
  return names;
}
const gradleAdapter = {
  id: "gradle",
  displayName: "Gradle",
  patterns: PATTERNS$6,
  detect(files) {
    return files.some((f) => {
      const base = f.split("/").pop()?.toLowerCase();
      return base === "build.gradle" || base === "build.gradle.kts";
    });
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$6);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseGradleTasks(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$5 = ["pom.xml"];
const PROFILE_ID = /<profile>[\s\S]*?<id>\s*([A-Za-z0-9_.:-]+)\s*<\/id>/gu;
const GOAL = /<goal>\s*([A-Za-z0-9_.:-]+)\s*<\/goal>/gu;
function parseMavenGoals(text) {
  const names = /* @__PURE__ */ new Set();
  for (const regex of [PROFILE_ID, GOAL]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      names.add(match[1]);
    }
  }
  return names;
}
const mavenAdapter = {
  id: "maven",
  displayName: "Maven",
  patterns: PATTERNS$5,
  detect(files) {
    return files.some((f) => f.split("/").pop()?.toLowerCase() === "pom.xml");
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$5);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseMavenGoals(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$4 = ["*.csproj", "*.fsproj", "*.vbproj"];
const TARGET = /<Target\s+[^>]*\bName\s*=\s*"([^"]+)"/gu;
function parseMsbuildTargets(text) {
  const names = /* @__PURE__ */ new Set();
  TARGET.lastIndex = 0;
  let match;
  while ((match = TARGET.exec(text)) !== null) {
    names.add(match[1]);
  }
  return names;
}
function isProjectFile(path2) {
  const base = path2.split("/").pop()?.toLowerCase() ?? "";
  return base.endsWith(".csproj") || base.endsWith(".fsproj") || base.endsWith(".vbproj");
}
const dotnetAdapter = {
  id: "dotnet",
  displayName: ".NET / MSBuild",
  patterns: PATTERNS$4,
  detect(files) {
    return files.some(isProjectFile);
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$4);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseMsbuildTargets(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$3 = ["CMakeLists.txt"];
const CUSTOM_TARGET = /\badd_custom_target\s*\(\s*([A-Za-z_][A-Za-z0-9_.-]*)/gu;
const EXECUTABLE = /\badd_executable\s*\(\s*([A-Za-z_][A-Za-z0-9_.-]*)/gu;
const LIBRARY = /\badd_library\s*\(\s*([A-Za-z_][A-Za-z0-9_.-]*)/gu;
function parseCmakeTargets(text) {
  const names = /* @__PURE__ */ new Set();
  for (const regex of [CUSTOM_TARGET, EXECUTABLE, LIBRARY]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      names.add(match[1]);
    }
  }
  return names;
}
const cmakeAdapter = {
  id: "cmake",
  displayName: "CMake",
  patterns: PATTERNS$3,
  detect(files) {
    return files.some((f) => f.split("/").pop()?.toLowerCase() === "cmakelists.txt");
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$3);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseCmakeTargets(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$2 = ["composer.json"];
function parseComposerScripts(text) {
  const names = /* @__PURE__ */ new Set();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return names;
  }
  if (!data || typeof data !== "object") return names;
  const scripts = data.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return names;
  for (const key of Object.keys(scripts)) {
    names.add(key);
  }
  return names;
}
const composerAdapter = {
  id: "composer",
  displayName: "Composer",
  patterns: PATTERNS$2,
  detect(files) {
    return files.some((f) => f.split("/").pop()?.toLowerCase() === "composer.json");
  },
  async collectTaskSurface(root, files) {
    const candidates = await readCandidates(files, root, PATTERNS$2);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseComposerScripts(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS$1 = ["Rakefile", "rakefile", "Rakefile.rb", "**/*.rake"];
const NAMESPACE_OPEN = /^\s*namespace\s+:([A-Za-z_][A-Za-z0-9_]*)\s+do\b/u;
const NAMESPACE_OPEN_STR = /^\s*namespace\s+["']([A-Za-z_][A-Za-z0-9_]*)["']\s+do\b/u;
const TASK_SYM = /^\s*task\s+:([A-Za-z_][A-Za-z0-9_]*)\b/u;
const TASK_STR = /^\s*task\s+["']([A-Za-z_][A-Za-z0-9_]*)["']/u;
const BLOCK_END = /^\s*end\b/u;
const BLOCK_OPEN = /\bdo\b(\s*\|[^|]*\|)?\s*$|\{\s*(?:\|[^|]*\|)?\s*$/u;
function parseRakefile(text) {
  const names = /* @__PURE__ */ new Set();
  const stack = [];
  function currentPrefix() {
    const parts = stack.filter((f) => f.kind === "ns").map((f) => f.name);
    return parts.length > 0 ? parts.join(":") + ":" : "";
  }
  const lines = text.split(/\r?\n/u);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/u, "");
    const trimmed = line.trim();
    if (!trimmed) continue;
    const nsMatch = line.match(NAMESPACE_OPEN) ?? line.match(NAMESPACE_OPEN_STR);
    if (nsMatch) {
      stack.push({ kind: "ns", name: nsMatch[1] });
      continue;
    }
    const taskMatch = line.match(TASK_SYM) ?? line.match(TASK_STR);
    if (taskMatch) {
      names.add(currentPrefix() + taskMatch[1]);
      if (BLOCK_OPEN.test(line)) {
        stack.push({ kind: "other" });
      }
      continue;
    }
    if (BLOCK_END.test(line)) {
      if (stack.length > 0) stack.pop();
      continue;
    }
    if (BLOCK_OPEN.test(line)) {
      stack.push({ kind: "other" });
      continue;
    }
  }
  return names;
}
function isRakeFile(relpath) {
  const base = relpath.split("/").pop() ?? "";
  const lower = base.toLowerCase();
  if (lower === "rakefile" || lower === "rakefile.rb") return true;
  return lower.endsWith(".rake");
}
const rakeAdapter = {
  id: "rake",
  displayName: "rake",
  patterns: PATTERNS$1,
  detect(files) {
    return files.some(isRakeFile);
  },
  async collectTaskSurface(root, files) {
    const rakeFiles = files.filter(isRakeFile);
    const candidates = await readCandidates(rakeFiles, root, rakeFiles);
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseRakefile(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const PATTERNS = [
  "**/xcshareddata/xcschemes/*.xcscheme",
  "Fastfile",
  "fastlane/Fastfile"
];
const LANE = /^\s*lane\s+:([A-Za-z_][A-Za-z0-9_]*)\s+do\b/u;
function parseFastfileLanes(text) {
  const names = /* @__PURE__ */ new Set();
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, "");
    const match = line.match(LANE);
    if (match) names.add(match[1]);
  }
  return names;
}
function parseXcodeSchemeFilenames(files) {
  const names = /* @__PURE__ */ new Set();
  for (const f of files) {
    if (!f.includes("/xcshareddata/xcschemes/")) continue;
    const base = f.split("/").pop() ?? "";
    if (!base.toLowerCase().endsWith(".xcscheme")) continue;
    const stem = base.slice(0, -".xcscheme".length);
    if (stem) names.add(stem);
  }
  return names;
}
function isFastfile(relpath) {
  const base = relpath.split("/").pop()?.toLowerCase() ?? "";
  return base === "fastfile";
}
function isScheme(relpath) {
  return relpath.includes("/xcshareddata/xcschemes/") && relpath.toLowerCase().endsWith(".xcscheme");
}
const xcodeAdapter = {
  id: "xcode",
  displayName: "Xcode",
  patterns: PATTERNS,
  detect(files) {
    return files.some((f) => isFastfile(f) || isScheme(f) || f.includes(".xcodeproj/"));
  },
  async collectTaskSurface(root, files) {
    const names = /* @__PURE__ */ new Set();
    const sourceFiles = /* @__PURE__ */ new Set();
    for (const scheme of parseXcodeSchemeFilenames(files)) {
      names.add(scheme);
    }
    for (const f of files) {
      if (isScheme(f)) sourceFiles.add(f);
    }
    const fastfiles = files.filter(isFastfile);
    const candidates = await readCandidates(fastfiles, root, fastfiles);
    for (const [relpath, text] of Object.entries(candidates)) {
      const parsed = parseFastfileLanes(text);
      for (const n of parsed) names.add(n);
      if (parsed.size > 0) sourceFiles.add(relpath);
    }
    return { names, sourceFiles };
  }
};
const ALL_ADAPTERS = [
  javascriptAdapter,
  makeAdapter,
  justAdapter,
  taskfileAdapter,
  rustAdapter,
  pythonAdapter,
  gradleAdapter,
  mavenAdapter,
  dotnetAdapter,
  cmakeAdapter,
  composerAdapter,
  rakeAdapter,
  xcodeAdapter
];
const TASK_FILE_PATTERNS = ALL_ADAPTERS.flatMap((a) => a.patterns);
const TASK_FILE_NAMES = /* @__PURE__ */ new Set([
  "makefile",
  "justfile",
  "taskfile.yml",
  "taskfile.yaml",
  "package.json",
  "pyproject.toml",
  "tox.ini",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
  "cmakelists.txt",
  "composer.json",
  "rakefile",
  "rakefile.rb",
  "fastfile"
]);
const MANIFEST_FILE_NAMES = /* @__PURE__ */ new Set([
  "build.gradle",
  "build.gradle.kts",
  "cargo.toml",
  "cmakelists.txt",
  "composer.json",
  "fastfile",
  "gemfile",
  "go.mod",
  "mix.exs",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "rakefile",
  "requirements.txt",
  "setup.py",
  "tox.ini"
]);
async function collectAllTaskSurfaces(root, files) {
  const task_surface = /* @__PURE__ */ new Set();
  const task_surface_files = /* @__PURE__ */ new Set();
  for (const adapter of ALL_ADAPTERS) {
    const result = await adapter.collectTaskSurface(root, files);
    for (const n of result.names) task_surface.add(n);
    for (const f of result.sourceFiles) task_surface_files.add(f);
  }
  const entrypoint_files = findFiles(files, ...TASK_FILE_PATTERNS);
  return { task_surface, task_surface_files, entrypoint_files };
}
async function collectTaskSurfaceByRunner(root, files) {
  const result = {};
  for (const adapter of ALL_ADAPTERS) {
    const surface = await adapter.collectTaskSurface(root, files);
    result[adapter.id] = surface.names;
  }
  return result;
}
function categorizeTaskSurface(taskSurface) {
  const categories = /* @__PURE__ */ new Map();
  function add(category, name) {
    if (!categories.has(category)) categories.set(category, /* @__PURE__ */ new Set());
    categories.get(category).add(name);
  }
  for (const name of Array.from(taskSurface).sort()) {
    const lower = name.toLowerCase();
    if (["setup", "bootstrap", "install", "init"].includes(lower) || /^(setup|bootstrap|install|init):/u.test(lower)) {
      add("setup", name);
    }
    if (["dev", "start", "serve", "tauri"].includes(lower) || /^(dev|start|serve):/u.test(lower)) {
      add("dev", name);
    }
    if (lower === "build" || /^(build|bundle|compile|package):/u.test(lower)) {
      add("build", name);
    }
    if (lower === "test" || lower.startsWith("test:") || ["integration", "e2e", "smoke"].includes(lower) || /^(integration|e2e|smoke):/u.test(lower)) {
      add("test", name);
    }
    if (["ci", "check"].includes(lower) || /^(ci|check):/u.test(lower)) {
      add("check", name);
    }
    if (["typecheck", "type-check"].includes(lower) || /^(typecheck|type-check):/u.test(lower)) {
      add("check", name);
    }
    if (lower === "standards" || lower.startsWith("standards:")) {
      add("lint", name);
      add("check", name);
    }
    if (lower === "lint" || lower.startsWith("lint:") || lower.endsWith(":lint") || lower.includes(":lint:")) {
      add("lint", name);
    }
    if (["eslint", "stylelint", "markdownlint", "commitlint", "rust:lint"].includes(lower)) {
      add("lint", name);
    }
    if (/^(eslint|stylelint|markdownlint|commitlint|rust:lint):/u.test(lower)) {
      add("lint", name);
    }
    if (/^(lint[-_])/u.test(lower) || lower.includes("clippy")) {
      add("lint", name);
    }
    if (/(^|[:_-])fmt($|[:_-])/u.test(lower)) {
      if (lower.includes("fix") || /^(fix[-_])/u.test(lower)) {
        add("format", name);
      } else {
        add("lint", name);
      }
    }
    if (["format", "fmt"].includes(lower) || /^(format|fmt):/u.test(lower)) {
      add("format", name);
    }
    if (lower.endsWith(":fix") || lower.includes(":fix:") || /^(fix[-_])/u.test(lower)) {
      add("format", name);
    }
  }
  return Object.fromEntries(Array.from(categories.entries(), ([category, names]) => {
    return [category, Array.from(names).sort()];
  }));
}
const MAX_EVIDENCE = 5;
const ROOT_SCOPE = ".";
const AGENT_DOC_NAMES = /* @__PURE__ */ new Set(["agents.md", "claude.md", "copilot-instructions.md"]);
const ROOT_AGENT_DOC_PATHS = /* @__PURE__ */ new Set(["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"]);
const CORE_DOC_NAMES = /* @__PURE__ */ new Set([
  "agents.md",
  "claude.md",
  "contributing.md",
  "copilot-instructions.md",
  "readme.md",
  "readme.mdx"
]);
const METRIC_NAMES = [
  "bootstrap_self_sufficiency",
  "task_entrypoints",
  "validation_harness",
  "lint_format_gates",
  "agent_repo_map",
  "structured_docs",
  "decision_records"
];
const ROOT_MAP_DOCS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md",
  "CONTRIBUTING.md",
  "README.md"
];
const GENERIC_NESTED_SCOPE_SEGMENTS = [
  /^docs?$/u,
  /^examples?$/u,
  /^demos?([_-].+)?$/u,
  /^benchmarks?$/u,
  /^tests?([_-].+)?$/u,
  /^tutorials?$/u,
  /^samples?$/u,
  /^fixtures?$/u,
  /^__tests__$/u,
  /^\.[a-z0-9_-]+$/u
];
function normalizeScope(root, scope) {
  const scopePath = path.resolve(root, scope);
  const relative = path.relative(root, scopePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Scope path must stay inside the repository root: ${scope}`);
  }
  const normalized = toPosix(relative);
  return normalized || ROOT_SCOPE;
}
function rootRoutesToScope(rootReadme, scope) {
  return rootReadme.includes(`${scope}/`) || rootReadme.includes(`\`${scope}\``) || rootReadme.includes(`cd ${scope}`);
}
function clipEvidence(items, limit = MAX_EVIDENCE) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      unique.push(item);
    }
  }
  return unique.slice(0, limit);
}
function metric(score, confidence, evidence, gaps, nextStep) {
  return {
    score,
    confidence,
    evidence: clipEvidence(evidence),
    gaps,
    next_step: nextStep
  };
}
function setDefault(map, key) {
  if (!map.has(key)) {
    map.set(key, /* @__PURE__ */ new Set());
  }
  return map.get(key);
}
function hasSignal(signals, prefix) {
  return Array.from(signals).some((signal) => signal.startsWith(prefix));
}
function scoreScopeSignals(signals) {
  let score = 0;
  if (hasSignal(signals, "agent_doc:")) score += 4;
  if (hasSignal(signals, "task_surface:")) score += 2;
  if (hasSignal(signals, "manifest:")) score += 2;
  if (hasSignal(signals, "scope_readme:")) score += 1;
  if (hasSignal(signals, "root_routes_here:")) score += 1;
  return score;
}
function isLikelyNestedUtilityScope(scope, signals) {
  if (hasSignal(signals, "agent_doc:") || hasSignal(signals, "root_routes_here:")) {
    return false;
  }
  const parts = scope.split("/");
  if (parts.length < 3) {
    return false;
  }
  return parts.slice(1).some((part) => {
    return GENERIC_NESTED_SCOPE_SEGMENTS.some((pattern) => pattern.test(part));
  });
}
async function collectContext(root, excludes) {
  const files = await walkRepo(root, excludes);
  const relpaths = new Set(files);
  const docs = files.filter((filePath) => {
    return DOC_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  });
  const docTexts = {};
  for (const relpath of docs) {
    const basename = path.posix.basename(relpath).toLowerCase();
    if (CORE_DOC_NAMES.has(basename) || relpath.startsWith("docs/")) {
      docTexts[relpath] = await readText(path.join(root, relpath));
    }
  }
  const surface = await collectAllTaskSurfaces(root, files);
  return {
    root,
    files,
    relpaths,
    doc_paths: docs,
    doc_texts: docTexts,
    task_surface: surface.task_surface,
    task_surface_files: surface.task_surface_files,
    entrypoint_files: surface.entrypoint_files
  };
}
function discoverScopes(ctx) {
  const relpaths = Array.from(ctx.relpaths).sort();
  const rootReadme = (ctx.doc_texts["README.md"] || ctx.doc_texts["README.mdx"] || "").toLowerCase();
  const signalsByScope = /* @__PURE__ */ new Map();
  for (const relpath of relpaths) {
    const parts = relpath.split("/");
    if (parts.length < 2) continue;
    const directScope = parts.slice(0, -1).join("/");
    const filename = parts[parts.length - 1].toLowerCase();
    if (AGENT_DOC_NAMES.has(filename)) {
      setDefault(signalsByScope, directScope).add(`agent_doc:${parts[parts.length - 1]}`);
    }
    if (filename === "readme.md") {
      setDefault(signalsByScope, directScope).add("scope_readme:README.md");
    }
    const signals = setDefault(signalsByScope, directScope);
    if (TASK_FILE_NAMES.has(filename) && ctx.task_surface_files.has(relpath)) {
      signals.add(`task_surface:${parts[parts.length - 1]}`);
    }
    if (MANIFEST_FILE_NAMES.has(filename)) {
      signals.add(`manifest:${parts[parts.length - 1]}`);
    }
    if (rootRoutesToScope(rootReadme, directScope)) {
      signals.add("root_routes_here:README.md");
    }
  }
  const candidates = [];
  for (const [scope, signals] of signalsByScope.entries()) {
    const score = scoreScopeSignals(signals);
    const strongSignal = hasSignal(signals, "agent_doc:") || hasSignal(signals, "task_surface:") || hasSignal(signals, "manifest:");
    if (score >= 3 && strongSignal && !isLikelyNestedUtilityScope(scope, signals)) {
      candidates.push({ path: scope, signals: Array.from(signals).sort(), score });
    }
  }
  return candidates.sort((left, right) => {
    return right.score - left.score || left.path.localeCompare(right.path);
  });
}
function chooseScope(ctx, explicitScope = void 0) {
  const discovered = discoverScopes(ctx);
  if (explicitScope) {
    return [explicitScope, discovered, "explicit"];
  }
  const topLevelAgentDoc = Array.from(ROOT_AGENT_DOC_PATHS).some((candidate) => {
    return ctx.relpaths.has(candidate);
  });
  const strongCandidates = discovered.filter((candidate) => candidate.score >= 5);
  if (strongCandidates.length === 1 && !topLevelAgentDoc) {
    return [strongCandidates[0].path, discovered, "auto_single_nested_scope"];
  }
  if (strongCandidates.length >= 2) {
    return [ROOT_SCOPE, discovered, "root_multiple_nested_scopes"];
  }
  return [ROOT_SCOPE, discovered, "root_default"];
}
async function scoreBootstrap(ctx) {
  const taskCategories = categorizeTaskSurface(ctx.task_surface);
  const declarative = Array.from(ctx.relpaths).filter((relpath) => {
    return [
      "devcontainer.json",
      ".devcontainer/devcontainer.json",
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
      "flake.nix",
      "shell.nix",
      "mise.toml",
      ".tool-versions",
      "Brewfile"
    ].includes(relpath) || relpath.startsWith(".devcontainer/");
  }).sort();
  const runtimePins = Array.from(ctx.relpaths).filter((relpath) => {
    return [
      ".python-version",
      ".nvmrc",
      ".node-version",
      ".ruby-version",
      ".java-version",
      "rust-toolchain.toml"
    ].includes(relpath);
  }).sort();
  const lockfiles = Array.from(ctx.relpaths).filter((relpath) => {
    return [
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "poetry.lock",
      "Pipfile.lock",
      "uv.lock",
      "Cargo.lock",
      "go.sum",
      "Gemfile.lock"
    ].includes(path.posix.basename(relpath));
  }).sort();
  const bootstrapCommands = Array.from(/* @__PURE__ */ new Set([
    ...taskCategories.setup || [],
    ...taskCategories.dev || []
  ])).sort();
  const categories = [declarative, runtimePins, lockfiles, bootstrapCommands].filter((group) => group.length > 0).length;
  const evidence = [
    ...declarative,
    ...runtimePins,
    ...lockfiles,
    ...bootstrapCommands.map((name) => `task:${name}`)
  ];
  if (declarative.length > 0 && bootstrapCommands.length > 0 && (runtimePins.length > 0 || lockfiles.length > 0)) {
    return metric(3, "high", evidence, "Little obvious setup debt from repo-visible signals.", "Keep one canonical bootstrap command and keep manifests pinned.");
  }
  if (categories >= 2) {
    return metric(2, "medium", evidence, "Setup is partly declared, but the repo does not advertise one clearly dominant bootstrap path.", "Add a canonical `setup` or `bootstrap` entrypoint and point docs at it.");
  }
  if (categories === 1) {
    return metric(1, "medium", evidence, "Some setup signals exist, but an agent still has to infer too much about the environment.", "Add declarative environment files or a single bootstrap command.");
  }
  return metric(0, "high", evidence, "No strong repo-visible bootstrap path was found.", "Declare the toolchain and local services in version control and expose a `setup` task.");
}
async function scoreTaskEntrypoints(ctx) {
  const taskCategories = categorizeTaskSurface(ctx.task_surface);
  const matchedCategories = ["setup", "dev", "build", "test", "lint", "format", "check"].filter((category) => {
    return (taskCategories[category] || []).length > 0;
  });
  const evidence = [
    ...ctx.entrypoint_files,
    ...["setup", "dev", "build", "test", "lint", "format", "check"].flatMap((category) => {
      return (taskCategories[category] || []).map((name) => `task:${name}`);
    })
  ];
  const hasSetup = Boolean((taskCategories.setup || []).length > 0 || (taskCategories.dev || []).length > 0);
  const hasValidation = Boolean((taskCategories.test || []).length > 0 || (taskCategories.lint || []).length > 0 || (taskCategories.check || []).length > 0);
  const hasBuild = Boolean((taskCategories.build || []).length > 0);
  if (matchedCategories.length >= 5 && hasSetup && hasValidation && hasBuild) {
    return metric(3, "high", evidence, "Common workflows appear to have stable entrypoints.", "Keep entrypoint names consistent across docs and CI.");
  }
  if (matchedCategories.length >= 3) {
    return metric(2, "high", evidence, "Several common tasks are exposed, but the task surface is not yet complete.", "Expose `setup`, `dev`, `test`, `lint`, and `build` through one canonical task layer.");
  }
  if (ctx.entrypoint_files.length > 0 || matchedCategories.length > 0) {
    return metric(1, "medium", evidence, "Some task entrypoints exist, but coverage is narrow or inconsistent.", "Add a single command surface such as `make`, `just`, `task`, or package scripts for routine work.");
  }
  return metric(0, "high", evidence, "No canonical task surface was detected.", "Add repo-level entrypoints for setup, validation, and build tasks.");
}
async function scoreValidationHarness(ctx) {
  const taskCategories = categorizeTaskSurface(ctx.task_surface);
  const testDirs = Array.from(ctx.relpaths).filter((relpath) => {
    return /(^|\/)(tests?|__tests__|spec|specs|integration|e2e|cypress|playwright|testdata|fixtures)(\/|$)/u.test(relpath);
  }).sort();
  const testConfigs = Array.from(ctx.relpaths).filter((relpath) => {
    const basename = path.posix.basename(relpath);
    return basename === "pytest.ini" || basename === "tox.ini" || /^jest\.config\./u.test(basename) || /^vitest\.config\./u.test(basename) || /^playwright\.config\./u.test(basename) || /^cypress\.config\./u.test(basename);
  }).sort();
  const testCommands = Array.from(/* @__PURE__ */ new Set([
    ...taskCategories.test || [],
    ...taskCategories.check || []
  ])).sort();
  const layered = testDirs.some((relpath) => {
    return ["integration", "e2e", "cypress", "playwright"].some((part) => relpath.includes(part));
  });
  const fixtures = testDirs.some((relpath) => {
    return ["fixtures", "testdata"].some((part) => relpath.includes(part));
  });
  const evidence = [
    ...testDirs,
    ...testConfigs,
    ...testCommands.map((name) => `task:${name}`)
  ];
  if ((testDirs.length > 0 || testConfigs.length > 0) && testCommands.length > 0 && (layered || fixtures)) {
    return metric(3, "high", evidence, "The repo appears to support more than one validation layer or reusable test state.", "Keep smoke or integration coverage aligned with the most common change types.");
  }
  if ((testDirs.length > 0 || testConfigs.length > 0) && testCommands.length > 0) {
    return metric(2, "high", evidence, "The repo has a credible local validation path for ordinary changes.", "Add smoke, integration, or e2e coverage for cross-cutting changes.");
  }
  if (testDirs.length > 0 || testConfigs.length > 0 || testCommands.length > 0) {
    return metric(1, "medium", evidence, "Some validation signals exist, but the harness looks narrow or hard to trust end-to-end.", "Add a canonical `test` or `check` command and keep tests in predictable locations.");
  }
  return metric(0, "high", evidence, "No meaningful local validation harness was detected.", "Add a basic test or smoke-test path that an agent can run after changes.");
}
async function scoreLintFormat(ctx) {
  const taskCategories = categorizeTaskSurface(ctx.task_surface);
  const lintFiles = Array.from(ctx.relpaths).filter((relpath) => {
    return (/* @__PURE__ */ new Set([
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.json",
      ".eslintrc.yml",
      ".eslintrc.yaml",
      "eslint.config.js",
      "eslint.config.cjs",
      "eslint.config.mjs",
      ".golangci.yml",
      ".golangci.yaml",
      ".markdownlint.json",
      ".markdownlint.yaml",
      ".markdownlint.yml",
      ".markdownlint-cli2.cjs",
      "ruff.toml",
      ".ruff.toml",
      ".stylelintrc",
      ".stylelintrc.js",
      ".stylelintrc.cjs",
      ".stylelintrc.json",
      ".stylelintrc.yml",
      ".stylelintrc.yaml",
      "stylelint.config.js",
      "stylelint.config.cjs",
      "commitlint.config.cjs"
    ])).has(path.posix.basename(relpath));
  }).sort();
  const formatFiles = Array.from(ctx.relpaths).filter((relpath) => {
    return (/* @__PURE__ */ new Set([
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yml",
      ".prettierrc.yaml",
      "prettier.config.js",
      "prettier.config.cjs",
      "rustfmt.toml",
      ".rustfmt.toml",
      ".editorconfig"
    ])).has(path.posix.basename(relpath));
  }).sort();
  if (ctx.relpaths.has("pyproject.toml")) {
    const pyprojectText = await readText(path.join(ctx.root, "pyproject.toml"));
    if (["[tool.ruff", "[tool.black", "[tool.isort"].some((token) => pyprojectText.includes(token))) {
      lintFiles.push("pyproject.toml");
    }
    if (["[tool.black", "[tool.ruff.format"].some((token) => pyprojectText.includes(token))) {
      formatFiles.push("pyproject.toml");
    }
  }
  const extra = [];
  if (ctx.relpaths.has(".pre-commit-config.yaml") || ctx.relpaths.has(".pre-commit-config.yml")) {
    extra.push(".pre-commit-config.yaml");
  }
  if (ctx.relpaths.has(".gitlab-ci.yml")) {
    extra.push(".gitlab-ci.yml");
  }
  const githubWorkflows = Array.from(ctx.relpaths).filter((relpath) => relpath.startsWith(".github/workflows/")).sort().slice(0, 2);
  extra.push(...githubWorkflows);
  const lintCommands = Array.from(/* @__PURE__ */ new Set([
    ...taskCategories.lint || [],
    ...taskCategories.check || []
  ])).sort();
  const formatCommands = [...taskCategories.format || []].sort();
  const evidence = [
    ...lintFiles,
    ...formatFiles,
    ...lintCommands.map((name) => `task:${name}`),
    ...formatCommands.map((name) => `task:${name}`),
    ...extra
  ];
  if (lintFiles.length > 0 && formatFiles.length > 0 && (lintCommands.length > 0 || formatCommands.length > 0) && extra.length > 0) {
    return metric(3, "high", evidence, "Static checks look integrated into the repository workflow.", "Keep lint and format commands stable and easy to run locally.");
  }
  if ((lintFiles.length > 0 || formatFiles.length > 0) && (lintCommands.length > 0 || formatCommands.length > 0)) {
    return metric(2, "high", evidence, "The repo has usable lint or format gates, but enforcement signals are still modest.", "Add both lint and format entrypoints and wire them into pre-commit or repo-local CI workflows.");
  }
  if (lintFiles.length > 0 || formatFiles.length > 0 || lintCommands.length > 0 || formatCommands.length > 0) {
    return metric(1, "medium", evidence, "Lint or format tooling exists, but the workflow is incomplete or weakly surfaced.", "Expose `lint` and `format` commands through the canonical task surface.");
  }
  return metric(0, "high", evidence, "No lint or format gates were detected.", "Add at least one linter and formatter with explicit repo-level commands.");
}
async function scoreAgentRepoMap(ctx) {
  const repoWideAgentDocs = Array.from(ROOT_AGENT_DOC_PATHS).filter((candidate) => ctx.relpaths.has(candidate)).sort();
  const rootSupportDocs = Array.from(ctx.relpaths).filter((relpath) => ["CONTRIBUTING.md", "README.md"].includes(relpath)).sort();
  const nestedAgentDocs = Array.from(ctx.relpaths).filter((relpath) => relpath.includes("/") && AGENT_DOC_NAMES.has(path.posix.basename(relpath).toLowerCase())).sort();
  const evidence = [
    ...repoWideAgentDocs,
    ...rootSupportDocs.slice(0, 2),
    ...nestedAgentDocs.slice(0, 2)
  ];
  let mapText = "";
  for (const candidate of ROOT_MAP_DOCS) {
    if (ctx.doc_texts[candidate]) {
      mapText = ctx.doc_texts[candidate];
      if (mapText) break;
    }
  }
  const cues = ["command", "setup", "docs", "architecture", "test", "constraint", "workflow"].filter((token) => mapText.toLowerCase().includes(token)).length;
  const hasAgentDoc = repoWideAgentDocs.length > 0;
  const hasNestedAgentDoc = nestedAgentDocs.length > 0;
  const rootText = ROOT_MAP_DOCS.map((candidate) => ctx.doc_texts[candidate] || "").join("\n").toLowerCase();
  const nestedGuidesAreSurfaced = nestedAgentDocs.some((nestedDoc) => {
    return rootText.includes(nestedDoc.toLowerCase()) || rootRoutesToScope(rootText, path.posix.dirname(nestedDoc).toLowerCase());
  });
  if (hasAgentDoc && cues >= 3) {
    return metric(3, "high", evidence, "The repo includes a repo-wide navigation aid for agents with actionable cues.", "Keep the repo map short and link outward to deeper docs instead of duplicating them.");
  }
  if (hasAgentDoc) {
    return metric(2, "medium", evidence, "A repo-wide agent guide exists, but it does not yet look like a crisp map of commands, docs, and constraints.", "Tighten the top-level agent guide so it indexes the primary commands, docs, architecture, and validation paths.");
  }
  if (hasNestedAgentDoc && nestedGuidesAreSurfaced) {
    return metric(2, "medium", evidence, "The repo routes some work through nested scopes with subtree-only agent guidance, but the root still lacks a single repo-wide map.", "Add a short top-level repo map that points to the nested scope guides and their primary commands.");
  }
  if (ctx.relpaths.has("README.md") && cues >= 2) {
    return metric(1, "medium", evidence, "The root docs provide some navigation help, but they do not clearly distinguish repo-wide guidance from subtree-specific workflows.", "Add an `AGENTS.md` or equivalent short index linking commands, docs, constraints, and nested scope guides.");
  }
  if (hasNestedAgentDoc) {
    return metric(1, "medium", evidence, "Nested agent guidance exists, but it is not surfaced clearly from the repository root.", "Link the nested scope guides from the root README or add a short top-level AGENTS.md.");
  }
  if (evidence.length > 0) {
    return metric(1, "medium", evidence, "Some onboarding docs exist, but the repo lacks a concise map optimized for agent navigation.", "Write a short repo map that points to setup, validation, and architecture docs.");
  }
  return metric(0, "high", evidence, "No obvious repo map or contributor guide was detected.", "Add `AGENTS.md` with the primary commands, docs, and navigation tips.");
}
async function scoreStructuredDocs(ctx) {
  const docCount = ctx.doc_paths.length;
  const docsDirFiles = [...ctx.doc_paths].filter((relpath) => relpath.startsWith("docs/")).sort();
  const docsSubdirs = new Set(docsDirFiles.map((relpath) => relpath.split("/")).filter((parts) => parts.length > 2).map((parts) => parts[1]));
  const indexFiles = docsDirFiles.filter((relpath) => {
    return ["readme.md", "index.md"].includes(path.posix.basename(relpath).toLowerCase());
  });
  let crossLinks = 0;
  for (const [relpath, text] of Object.entries(ctx.doc_texts)) {
    if (relpath.startsWith("docs/")) {
      const matches = text.match(/\[[^\]]+\]\((?!https?:\/\/)[^)]+\)/gu);
      crossLinks += matches ? matches.length : 0;
    }
  }
  const evidence = Array.from(/* @__PURE__ */ new Set([...indexFiles, ...docsDirFiles.slice(0, 3)])).sort();
  const hasDocsTree = docsDirFiles.length > 0;
  const hasDocsIndex = indexFiles.length > 0;
  const hasCrossLinks = crossLinks >= 3;
  const hasDepth = docsSubdirs.size > 0;
  if (hasDocsTree && hasDocsIndex && hasDepth && hasCrossLinks) {
    return metric(3, "high", evidence, "Documentation appears organized, indexed, and linked across topics.", "Preserve the index and keep new docs inside the same structure.");
  }
  if (hasDocsTree && hasDocsIndex && docsDirFiles.length >= 3) {
    return metric(2, "high", evidence, "The repo has an indexed docs tree, but it is still fairly shallow or only lightly cross-linked.", "Improve cross-links and add clearer sections for setup, architecture, and contributor flows.");
  }
  if (hasDocsTree && docsDirFiles.length >= 3) {
    return metric(1, "medium", evidence.length > 0 ? evidence : docsDirFiles.slice(0, 3), "The repo has a shallow docs tree, but it lacks a clear index or stronger cross-links.", "Add `docs/README.md` or `docs/index.md` and improve cross-links between the main setup, architecture, and contributor pages.");
  }
  if (hasDocsTree) {
    return metric(1, "medium", evidence.length > 0 ? evidence : docsDirFiles.slice(0, 3), "A docs directory exists, but it is still sparse or hard to navigate.", "Add `docs/README.md` or `docs/index.md` and improve cross-links as the docs tree grows.");
  }
  if (docCount >= 2) {
    return metric(1, "medium", evidence.length > 0 ? evidence : ctx.doc_paths.slice(0, 3).sort(), "Some documentation exists, but the structure is shallow or scattered.", "Group repo docs under `docs/` or add an index that links the important pages.");
  }
  return metric(0, "high", evidence, "Very little structured documentation was found.", "Add a `docs/` directory with an index page and a small set of core topics.");
}
function isDecisionRecordPath(relpath) {
  const lower = relpath.toLowerCase();
  return /(^|\/)(adr|adrs|decisions?)(\/|[-_])/u.test(lower) && /\.(md|mdx)$/u.test(lower);
}
function isCanonicalDecisionRecordPath(relpath) {
  const lower = relpath.toLowerCase();
  return lower.startsWith("docs/adr/") || lower.startsWith("docs/adrs/") || lower.startsWith("docs/decisions/");
}
async function scoreDecisionRecords(ctx) {
  const adrFiles = Array.from(ctx.relpaths).filter((relpath) => {
    return isDecisionRecordPath(relpath);
  }).sort();
  const canonicalAdrFiles = adrFiles.filter((relpath) => {
    return isCanonicalDecisionRecordPath(relpath);
  });
  let structured = 0;
  let supersession = 0;
  for (const relpath of adrFiles.slice(0, 10)) {
    const text = await readText(path.join(ctx.root, relpath));
    const lower = text.toLowerCase();
    if (lower.includes("context") && lower.includes("decision")) {
      structured += 1;
    }
    if (lower.includes("superseded by") || lower.includes("status")) {
      supersession += 1;
    }
  }
  if (canonicalAdrFiles.length >= 2 && structured >= 2 && supersession >= 1) {
    return metric(3, "high", canonicalAdrFiles, "The repo appears to keep structured, evolving decision records in version control.", "Keep ADR status and supersession links current as decisions change.");
  }
  if (canonicalAdrFiles.length >= 2) {
    return metric(2, "high", canonicalAdrFiles, "There is a dedicated decision-record trail, but it looks lightly structured.", "Standardize ADR headings such as Context, Decision, Consequences, and Status.");
  }
  if (canonicalAdrFiles.length > 0) {
    return metric(1, "medium", canonicalAdrFiles, "A decision-record artifact exists, but the practice looks narrow or inconsistent.", "Keep architecture decision records together under `docs/decisions/` or `docs/adr/` and use that folder consistently.");
  }
  if (adrFiles.length > 0) {
    return metric(1, "medium", adrFiles, "Decision-record artifacts exist, but they are scattered outside the main ADR trail.", "Move architecture decisions into `docs/decisions/` or `docs/adr/` and keep that folder authoritative.");
  }
  return metric(0, "high", adrFiles, "No decision-record artifacts were detected.", "Start recording major architecture and workflow decisions in ADRs.");
}
const METRIC_SCORERS = {
  bootstrap_self_sufficiency: scoreBootstrap,
  task_entrypoints: scoreTaskEntrypoints,
  validation_harness: scoreValidationHarness,
  lint_format_gates: scoreLintFormat,
  agent_repo_map: scoreAgentRepoMap,
  structured_docs: scoreStructuredDocs,
  decision_records: scoreDecisionRecords
};
function summarize(report) {
  const priorities = Object.entries(report.metrics).sort((left, right) => left[1].score - right[1].score || left[0].localeCompare(right[0]));
  report.quick_wins = priorities.slice(0, 3).map(([name, data]) => {
    return `${name}: ${data.next_step}`;
  });
}
function normalizeMetricNames(rawMetrics) {
  if (rawMetrics.length === 0) {
    return [...METRIC_NAMES];
  }
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of rawMetrics) {
    for (const token of item.split(",")) {
      const name = token.trim();
      if (!name) continue;
      if (!METRIC_NAMES.includes(name)) {
        throw new Error(`Unknown metric '${name}'. Valid metrics: ${METRIC_NAMES.join(", ")}`);
      }
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}
async function buildReport(root, excludes, selectedMetrics, scope) {
  const rootContext = await collectContext(root, excludes);
  const normalizedScope = scope ? normalizeScope(root, scope) : void 0;
  const [evaluatedScope, discoveredScopes, scopeSelection] = chooseScope(rootContext, normalizedScope);
  const targetRoot = evaluatedScope === ROOT_SCOPE ? root : path.resolve(root, evaluatedScope);
  const context = await collectContext(targetRoot, excludes);
  const metrics = {};
  for (const metricName of selectedMetrics) {
    metrics[metricName] = await METRIC_SCORERS[metricName](context);
  }
  const score = Object.values(metrics).reduce((total, data) => total + data.score, 0);
  const maxScore = selectedMetrics.length * 3;
  const scorePercentage = maxScore === 0 ? 0 : Math.round(score / maxScore * 100);
  const report = {
    repo: root,
    evaluated_scope: evaluatedScope,
    evaluated_root: targetRoot,
    discovered_scopes: discoveredScopes,
    scope_selection: scopeSelection,
    selected_metrics: selectedMetrics,
    available_metrics: [...METRIC_NAMES],
    score,
    max_score: maxScore,
    score_percentage: scorePercentage,
    metrics,
    notes: [
      "This score is limited to repo-visible evidence.",
      "Operational metrics such as CI reliability or debt tracking are intentionally excluded from the main score.",
      "Nested scopes may be auto-selected when the repository clearly routes work into one self-contained subsystem."
    ],
    quick_wins: []
  };
  summarize(report);
  return report;
}
function toMarkdown(report) {
  const lines = [
    "# Agentic Legibility Scorecard",
    "",
    `- Repository: \`${report.repo}\``,
    `- Evaluated scope: \`${report.evaluated_scope}\``,
    `- Score: **${report.score}/${report.max_score}** (${report.score_percentage}%)`,
    "",
    "## Scope Discovery",
    ""
  ];
  if (report.discovered_scopes.length > 0) {
    for (const scope of report.discovered_scopes) {
      const signals = scope.signals.map((item) => `\`${item}\``).join(", ");
      lines.push(`- \`${scope.path}\` (${scope.score}): ${signals}`);
    }
  } else {
    lines.push("- No nested scoring scopes discovered.");
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| Metric | Score | Confidence | Evidence | Gap | Next step |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const [name, data] of Object.entries(report.metrics)) {
    const evidence = data.evidence.length > 0 ? data.evidence.map((item) => `\`${item}\``).join("<br>") : "-";
    const gap = data.gaps.replaceAll("|", "\\|");
    const nextStep = data.next_step.replaceAll("|", "\\|");
    lines.push(`| \`${name}\` | ${data.score}/3 | ${data.confidence} | ${evidence} | ${gap} | ${nextStep} |`);
  }
  lines.push("");
  lines.push("## Quick Wins");
  lines.push("");
  for (const item of report.quick_wins) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }
  return lines.join("\n");
}
function parseCliArgs$1(argv) {
  const args = {
    repo: ".",
    format: "json",
    metrics: [],
    listMetrics: false,
    listScopes: false,
    scope: void 0,
    excludes: []
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      const value = argv[index + 1];
      if (value !== "json" && value !== "markdown") {
        throw new Error("--format requires either json or markdown");
      }
      args.format = value;
      index += 1;
    } else if (arg === "--metric") {
      const value = argv[index + 1];
      if (!value) throw new Error("--metric requires a value");
      args.metrics.push(value);
      index += 1;
    } else if (arg === "--list-metrics") {
      args.listMetrics = true;
    } else if (arg === "--list-scopes") {
      args.listScopes = true;
    } else if (arg === "--scope") {
      const value = argv[index + 1];
      if (!value) throw new Error("--scope requires a value");
      args.scope = value;
      index += 1;
    } else if (arg === "--exclude") {
      const value = argv[index + 1];
      if (!value) throw new Error("--exclude requires a value");
      args.excludes.push(value);
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    throw new Error("Only one repository path may be provided.");
  }
  if (positionals.length === 1) {
    args.repo = positionals[0];
  }
  return args;
}
async function runCli$1(argv = process.argv.slice(2)) {
  const args = parseCliArgs$1(argv);
  if (args.listMetrics) {
    process.stdout.write(`${METRIC_NAMES.join("\n")}
`);
    return;
  }
  const root = path.resolve(args.repo);
  if (!await isDirectory(root)) {
    throw new Error(`Repository path does not exist or is not a directory: ${root}`);
  }
  if (args.scope) {
    const normalizedScope = normalizeScope(root, args.scope);
    const scopePath = path.resolve(root, normalizedScope);
    if (!await isDirectory(scopePath)) {
      throw new Error(`Scope path does not exist or is not a directory: ${scopePath}`);
    }
  }
  if (args.listScopes) {
    const context = await collectContext(root, args.excludes);
    process.stdout.write(`${JSON.stringify(discoverScopes(context), null, 2)}
`);
    return;
  }
  const selectedMetrics = normalizeMetricNames(args.metrics);
  const report = await buildReport(root, args.excludes, selectedMetrics, args.scope);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  } else {
    process.stdout.write(`${toMarkdown(report)}
`);
  }
}
const SEVERITY_ERROR = "error";
const SEVERITY_WARNING = "warning";
function finding(severity, pathValue, message, remediation, line = null) {
  return {
    severity,
    path: pathValue,
    line,
    message,
    remediation
  };
}
function checkResult(name, findings, summary) {
  const hasError = findings.some((f) => f.severity === SEVERITY_ERROR);
  return {
    check: name,
    status: hasError ? "drift" : "ok",
    findings,
    summary
  };
}
function auditReport(repo, checks) {
  const results = Object.values(checks);
  const hasDrift = results.some((r) => r.status === "drift");
  return {
    repo,
    status: hasDrift ? "drift" : "ok",
    checks
  };
}
function formatJson(report) {
  return JSON.stringify(report, null, 2);
}
function renderFindingsList(findings) {
  if (findings.length === 0) {
    return ["_No findings._"];
  }
  const lines = [];
  for (const item of findings) {
    const location = item.line ? `${item.path}:${item.line}` : item.path;
    lines.push(`- **${item.severity.toUpperCase()}** \`${location}\` — ${item.message}`);
    if (item.remediation) {
      lines.push(`  - Fix: ${item.remediation}`);
    }
  }
  return lines;
}
function formatAuditMarkdown(report) {
  const lines = [
    "# Agentic Legibility Audit",
    "",
    `- Repository: \`${report.repo}\``,
    `- Status: **${report.status.toUpperCase()}**`,
    ""
  ];
  for (const [name, result] of Object.entries(report.checks)) {
    lines.push(`## ${name}`);
    lines.push("");
    lines.push(`Status: **${result.status.toUpperCase()}** — ${result.summary}`);
    lines.push("");
    lines.push(...renderFindingsList(result.findings));
    lines.push("");
  }
  return lines.join("\n");
}
function formatSingleCheckJson(result) {
  return JSON.stringify(result, null, 2);
}
function formatSingleCheckMarkdown(result) {
  const lines = [
    `# Check: ${result.check}`,
    "",
    `Status: **${result.status.toUpperCase()}** — ${result.summary}`,
    "",
    ...renderFindingsList(result.findings)
  ];
  return lines.join("\n");
}
const FENCE_OPEN = /^(\s*)(```+|~~~+)\s*([^\s`]*)\s*$/u;
function isClosingFence(line, marker) {
  const trimmed = line.trimEnd();
  return trimmed === marker || trimmed.startsWith(marker);
}
function toAnchor(headingText) {
  const withoutLinks = headingText.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1");
  const stripped = withoutLinks.replace(/[*_`]+/gu, "");
  const lowered = stripped.toLowerCase();
  const cleaned = lowered.replace(/[^\p{L}\p{N}\s\-_]/gu, "");
  const hyphenated = cleaned.replace(/\s+/gu, "-");
  return hyphenated.replace(/^-+|-+$/gu, "");
}
function stripInlineCode(line) {
  return line.replace(/`[^`\n]*`/gu, (match) => " ".repeat(match.length));
}
function parseMarkdown(text) {
  const lines = text.split(/\r?\n/u);
  const codeBlockRanges = [];
  const links = [];
  const headings = [];
  const referenceDefinitions = /* @__PURE__ */ new Map();
  const seenAnchors = /* @__PURE__ */ new Map();
  let inFence = false;
  let fenceStart = 0;
  let fenceMarker = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (inFence) {
      if (isClosingFence(line, fenceMarker)) {
        codeBlockRanges.push([fenceStart, lineNumber]);
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    const fenceMatch = line.match(FENCE_OPEN);
    if (fenceMatch) {
      inFence = true;
      fenceStart = lineNumber;
      fenceMarker = fenceMatch[2];
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/u);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const textContent = headingMatch[2];
      let anchor = toAnchor(textContent);
      if (anchor) {
        const seen = seenAnchors.get(anchor) || 0;
        if (seen > 0) {
          const suffixed = `${anchor}-${seen}`;
          seenAnchors.set(anchor, seen + 1);
          anchor = suffixed;
        } else {
          seenAnchors.set(anchor, 1);
        }
      }
      headings.push({ text: textContent, level, line: lineNumber, anchor });
      continue;
    }
    const refDefMatch = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+.*)?$/u);
    if (refDefMatch) {
      const label = refDefMatch[1].trim().toLowerCase();
      referenceDefinitions.set(label, refDefMatch[2]);
      continue;
    }
    const stripped = stripInlineCode(line);
    extractLineLinks(stripped, lineNumber, links);
  }
  return { links, headings, codeBlockRanges, referenceDefinitions };
}
function extractLineLinks(line, lineNumber, outLinks) {
  const inlineRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
  let match;
  while ((match = inlineRegex.exec(line)) !== null) {
    outLinks.push({
      href: match[2],
      text: match[1],
      line: lineNumber,
      kind: "inline"
    });
  }
  const fullReferenceRegex = /\[([^\]]+)\]\[([^\]]*)\]/gu;
  while ((match = fullReferenceRegex.exec(line)) !== null) {
    const text = match[1];
    const ref = match[2] || match[1];
    outLinks.push({
      href: `ref:${ref.toLowerCase()}`,
      text,
      line: lineNumber,
      kind: "reference"
    });
  }
}
function isExternalHref(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href);
}
function splitHref(href) {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) {
    return { target: href, anchor: null };
  }
  const target = href.slice(0, hashIndex);
  const anchor = href.slice(hashIndex + 1);
  return {
    target: target.length > 0 ? target : null,
    anchor: anchor.length > 0 ? anchor : null
  };
}
function resolveReference(link, referenceDefinitions) {
  if (link.kind !== "reference") {
    return link.href;
  }
  const label = link.href.replace(/^ref:/u, "");
  return referenceDefinitions.get(label) ?? null;
}
function extractCodeSnippets(text) {
  const lines = text.split(/\r?\n/u);
  const snippets = [];
  let inFence = false;
  let fenceMarker = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (inFence) {
      if (isClosingFence(line, fenceMarker)) {
        inFence = false;
        fenceMarker = "";
        continue;
      }
      snippets.push({ snippet: line, line: lineNumber });
      continue;
    }
    const fenceMatch = line.match(FENCE_OPEN);
    if (fenceMatch) {
      inFence = true;
      fenceMarker = fenceMatch[2];
      continue;
    }
    const inlineRegex = /`([^`\n]+)`/gu;
    let match;
    while ((match = inlineRegex.exec(line)) !== null) {
      snippets.push({ snippet: match[1], line: lineNumber });
    }
  }
  return snippets;
}
function extractInlineCodeSpans(text) {
  const lines = text.split(/\r?\n/u);
  const spans = [];
  let inFence = false;
  let fenceMarker = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (inFence) {
      if (isClosingFence(line, fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    const fenceMatch = line.match(FENCE_OPEN);
    if (fenceMatch) {
      inFence = true;
      fenceMarker = fenceMatch[2];
      continue;
    }
    const regex = /`([^`\n]+)`/gu;
    let match;
    while ((match = regex.exec(line)) !== null) {
      spans.push({ content: match[1], line: lineNumber });
    }
  }
  return spans;
}
const TASK_REFERENCE_PATTERNS = [
  { runner: "npm", regex: /(?:^|[\s&;|(])(?:npm|pnpm|yarn|bun)\s+run(?:-script)?\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "make", regex: /(?:^|[\s&;|(])make\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "just", regex: /(?:^|[\s&;|(])just\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "task", regex: /(?:^|[\s&;|(])task\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "cargo", regex: /(?:^|[\s&;|(])cargo\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "gradle", regex: /(?:^|[\s&;|(])(?:\.\/)?gradlew?\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "maven", regex: /(?:^|[\s&;|(])(?:mvn|mvnw|\.\/mvnw)\s+([A-Za-z0-9_.:-]+)/gu },
  { runner: "composer", regex: /(?:^|[\s&;|(])composer\s+(?:run(?:-script)?\s+)?([A-Za-z0-9_.:-]+)/gu },
  { runner: "rake", regex: /(?:^|[\s&;|(])(?:bundle\s+exec\s+)?rake\s+([A-Za-z0-9_.:-]+)/gu }
];
function isPlaceholderToken(token) {
  if (/^[A-Z]$/u.test(token)) return true;
  if (/^[A-Z][A-Z0-9_-]*$/u.test(token) && token.length <= 8) return true;
  return false;
}
const MAKE_BUILTINS = /* @__PURE__ */ new Set(["clean", "all", "install", "help"]);
const CARGO_BUILTINS = /* @__PURE__ */ new Set([
  "build",
  "check",
  "clean",
  "doc",
  "fetch",
  "fix",
  "generate-lockfile",
  "init",
  "install",
  "locate-project",
  "login",
  "logout",
  "metadata",
  "new",
  "owner",
  "package",
  "pkgid",
  "publish",
  "read-manifest",
  "remove",
  "run",
  "rustc",
  "rustdoc",
  "search",
  "test",
  "tree",
  "uninstall",
  "update",
  "vendor",
  "verify-project",
  "version",
  "yank",
  "clippy",
  "fmt",
  "miri",
  "audit",
  "expand",
  "bench"
]);
function extractTaskReferences(text) {
  const snippets = extractCodeSnippets(text);
  const references = [];
  for (const { snippet, line } of snippets) {
    for (const { runner, regex } of TASK_REFERENCE_PATTERNS) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(snippet)) !== null) {
        const token = match[1];
        if (isPlaceholderToken(token)) continue;
        if (runner === "make" && MAKE_BUILTINS.has(token)) continue;
        if (runner === "cargo" && CARGO_BUILTINS.has(token)) continue;
        references.push({
          runner,
          token,
          line,
          raw: match[0].trimStart()
        });
      }
    }
  }
  return references;
}
const REQUIRED_SECTIONS = [
  "Purpose / Big Picture",
  "Progress",
  "Surprises & Discoveries",
  "Decision Log",
  "Outcomes & Retrospective",
  "Context and Orientation",
  "Plan of Work",
  "Concrete Steps",
  "Validation and Acceptance",
  "Idempotence and Recovery",
  "Artifacts and Notes",
  "Interfaces and Dependencies"
];
const CHECKBOX_REGEX = /^\s*[*-]\s+\[([ xX])\]/u;
function normalizeHeading(text) {
  return text.trim().replace(/\s+/gu, " ").toLowerCase();
}
function parseExecPlan(text) {
  const { headings } = parseMarkdown(text);
  const presentHeadings = new Set(headings.map((h) => normalizeHeading(h.text)));
  const presentSections = /* @__PURE__ */ new Set();
  const missingSections = [];
  for (const name of REQUIRED_SECTIONS) {
    if (presentHeadings.has(normalizeHeading(name))) {
      presentSections.add(name);
    } else {
      missingSections.push(name);
    }
  }
  const progress = { total: 0, done: 0, remaining: 0 };
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(CHECKBOX_REGEX);
    if (!match) continue;
    progress.total += 1;
    if (match[1] === "x" || match[1] === "X") {
      progress.done += 1;
    } else {
      progress.remaining += 1;
    }
  }
  return {
    headings: headings.map((h) => h.text),
    presentSections,
    missingSections,
    progress
  };
}
const execFileAsync = promisify(execFile);
async function lastGitCommitTimestamp(root, relpath) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%ct", "--", relpath],
      { cwd: root }
    );
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}
async function lastActivityTimestamp(root, relpath) {
  const gitTimestamp = await lastGitCommitTimestamp(root, relpath);
  if (gitTimestamp !== null) return gitTimestamp;
  try {
    const stat = await promises.stat(path.join(root, relpath));
    return Math.floor(stat.mtimeMs / 1e3);
  } catch (_error) {
    return null;
  }
}
const REQUIRED_ARTIFACTS = [
  { path: "AGENTS.md", kind: "file", severity: SEVERITY_ERROR, remediation: "Create AGENTS.md at the repository root with a concise agent map." },
  { path: ".agents", kind: "dir", severity: SEVERITY_ERROR, remediation: "Create the `.agents/` directory for agent-facing infrastructure." },
  { path: ".agents/PLANS.md", kind: "file", severity: SEVERITY_ERROR, remediation: "Copy PLANS.md from the agentic-legibility skill to .agents/PLANS.md verbatim." },
  { path: "docs", kind: "dir", severity: SEVERITY_ERROR, remediation: "Create the `docs/` directory to hold progressive-disclosure documentation." },
  { path: "docs/exec-plans", kind: "dir", severity: SEVERITY_ERROR, remediation: "Create `docs/exec-plans/` to host active and completed ExecPlans." },
  { path: "docs/exec-plans/active", kind: "dir", severity: SEVERITY_WARNING, remediation: "Create `docs/exec-plans/active/` to hold in-progress plans." },
  { path: "docs/exec-plans/completed", kind: "dir", severity: SEVERITY_WARNING, remediation: "Create `docs/exec-plans/completed/` to hold finished plans." },
  { path: "CLAUDE.md", kind: "file", severity: SEVERITY_WARNING, remediation: "Create CLAUDE.md containing `@AGENTS.md` to route Claude Code to the agent map." }
];
async function pathExists(absolutePath, kind) {
  try {
    const stat = await promises.stat(absolutePath);
    return kind === "dir" ? stat.isDirectory() : stat.isFile();
  } catch (_error) {
    return false;
  }
}
async function checkArtifacts(root) {
  const findings = [];
  for (const artifact of REQUIRED_ARTIFACTS) {
    const absolutePath = path.join(root, artifact.path);
    const exists = await pathExists(absolutePath, artifact.kind);
    if (!exists) {
      findings.push(finding(
        artifact.severity,
        artifact.path,
        `Required legibility artifact missing (${artifact.kind}).`,
        artifact.remediation
      ));
    }
  }
  const errorCount = findings.filter((f) => f.severity === SEVERITY_ERROR).length;
  const warningCount = findings.filter((f) => f.severity === SEVERITY_WARNING).length;
  const summary = findings.length === 0 ? "All required legibility artifacts are present." : `${errorCount} missing required artifact${errorCount === 1 ? "" : "s"}${warningCount > 0 ? `, ${warningCount} recommended artifact${warningCount === 1 ? "" : "s"} missing` : ""}.`;
  return checkResult("artifacts", findings, summary);
}
const MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".mdx"]);
const LINK_ENTRY_FILES = ["README.md", "AGENTS.md", "CLAUDE.md"];
function isMarkdownFile(relpath) {
  const lower = relpath.toLowerCase();
  for (const ext of MARKDOWN_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}
function normalizeRelativeHref(href) {
  if (href.startsWith("./")) return href.slice(2);
  return href;
}
function resolveLinkTarget(fromRelpath, href) {
  const { target, anchor } = splitHref(href);
  if (target === null) {
    return { target: fromRelpath, anchor, originalHref: href };
  }
  const normalized = normalizeRelativeHref(target);
  const fromDir = fromRelpath.includes("/") ? fromRelpath.slice(0, fromRelpath.lastIndexOf("/")) : "";
  const joined = fromDir ? path.posix.join(fromDir, normalized) : normalized;
  const resolved = path.posix.normalize(joined);
  return { target: resolved, anchor, originalHref: href };
}
async function fileExistsInRepo(root, relpath) {
  try {
    const stat = await promises.stat(path.join(root, relpath));
    return stat.isFile();
  } catch (_error) {
    return false;
  }
}
function buildEntrySet(markdownPaths) {
  const entrySet = /* @__PURE__ */ new Set();
  for (const relpath of markdownPaths) {
    if (LINK_ENTRY_FILES.includes(relpath)) {
      entrySet.add(relpath);
      continue;
    }
    if (relpath === "docs/README.md" || relpath === "docs/index.md") {
      entrySet.add(relpath);
      continue;
    }
    const parts = relpath.split("/");
    if (parts.length === 3 && parts[0] === "docs" && (parts[2] === "README.md" || parts[2] === "index.md")) {
      entrySet.add(relpath);
    }
  }
  return entrySet;
}
async function checkLinks(root, options = {}) {
  const excludes = options.excludes || [];
  const files = await walkRepo(root, excludes);
  const markdownPaths = files.filter(isMarkdownFile).sort();
  const findings = [];
  const adjacency = /* @__PURE__ */ new Map();
  const parsedByFile = /* @__PURE__ */ new Map();
  for (const relpath of markdownPaths) {
    const text = await readText(path.join(root, relpath));
    parsedByFile.set(relpath, parseMarkdown(text));
    adjacency.set(relpath, /* @__PURE__ */ new Set());
  }
  for (const relpath of markdownPaths) {
    const parsed = parsedByFile.get(relpath);
    for (const link of parsed.links) {
      const resolvedHref = resolveReference(link, parsed.referenceDefinitions);
      if (resolvedHref === null) {
        findings.push(finding(
          SEVERITY_WARNING,
          relpath,
          `Unresolved reference link \`${link.text}\` (no definition in file).`,
          "Add a matching `[label]: url` definition or change the link.",
          link.line
        ));
        continue;
      }
      if (!resolvedHref || isExternalHref(resolvedHref)) continue;
      const resolved = resolveLinkTarget(relpath, resolvedHref);
      if (!resolved.target) continue;
      if (resolved.target.startsWith("..")) continue;
      const targetExists = await fileExistsInRepo(root, resolved.target);
      if (!targetExists) {
        findings.push(finding(
          SEVERITY_ERROR,
          relpath,
          `Broken link to \`${resolvedHref}\` (target not found).`,
          `Update the link or create the target file \`${resolved.target}\`.`,
          link.line
        ));
        continue;
      }
      if (resolved.anchor && isMarkdownFile(resolved.target)) {
        const targetParsed = parsedByFile.get(resolved.target) || parseMarkdown(await readText(path.join(root, resolved.target)));
        const anchors = new Set(targetParsed.headings.map((h) => h.anchor).filter(Boolean));
        if (!anchors.has(resolved.anchor)) {
          findings.push(finding(
            SEVERITY_WARNING,
            relpath,
            `Broken anchor \`#${resolved.anchor}\` in \`${resolved.target}\` (no matching heading).`,
            `Update the anchor to match a heading in \`${resolved.target}\` or add the heading.`,
            link.line
          ));
        }
      }
      if (isMarkdownFile(resolved.target) && adjacency.has(resolved.target)) {
        adjacency.get(relpath).add(resolved.target);
      }
    }
  }
  const entrySet = buildEntrySet(markdownPaths);
  const reachable = new Set(entrySet);
  const queue = Array.from(entrySet);
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  for (const relpath of markdownPaths) {
    if (!relpath.startsWith("docs/")) continue;
    if (reachable.has(relpath)) continue;
    findings.push(finding(
      SEVERITY_WARNING,
      relpath,
      "Orphaned documentation file (not reachable from any index).",
      "Link this file from docs/README.md or a parent-directory README, or delete it."
    ));
  }
  const brokenLinkCount = findings.filter((f) => f.message.startsWith("Broken link")).length;
  const brokenAnchorCount = findings.filter((f) => f.message.startsWith("Broken anchor")).length;
  const orphanCount = findings.filter((f) => f.message.startsWith("Orphaned")).length;
  const unresolvedRefCount = findings.filter((f) => f.message.startsWith("Unresolved reference")).length;
  const summary = findings.length === 0 ? "No broken links, anchors, or orphaned docs." : `${brokenLinkCount} broken link${brokenLinkCount === 1 ? "" : "s"}, ${brokenAnchorCount} broken anchor${brokenAnchorCount === 1 ? "" : "s"}, ${orphanCount} orphan doc${orphanCount === 1 ? "" : "s"}${unresolvedRefCount > 0 ? `, ${unresolvedRefCount} unresolved reference${unresolvedRefCount === 1 ? "" : "s"}` : ""}.`;
  return checkResult("links", findings, summary);
}
const RUNNER_LABEL = {
  javascript: "npm/pnpm/yarn/bun",
  make: "make",
  just: "just",
  task: "task",
  cargo: "cargo",
  python: "Python",
  gradle: "Gradle",
  maven: "Maven",
  dotnet: ".NET / MSBuild",
  cmake: "CMake",
  composer: "Composer",
  rake: "rake",
  xcode: "Xcode"
};
async function checkCommands(root, options = {}) {
  const excludes = options.excludes || [];
  const files = await walkRepo(root, excludes);
  const surfaceByRunner = await collectTaskSurfaceByRunner(root, files);
  const findings = [];
  const markdownPaths = files.filter(isMarkdownFile).sort();
  for (const relpath of markdownPaths) {
    const text = await readText(path.join(root, relpath));
    const references = extractTaskReferences(text);
    for (const ref of references) {
      const knownNames = surfaceByRunner[ref.runner];
      if (!knownNames) continue;
      if (knownNames.has(ref.token)) continue;
      findings.push(finding(
        SEVERITY_WARNING,
        relpath,
        `Doc references ${RUNNER_LABEL[ref.runner] ?? ref.runner} task \`${ref.token}\` but it is not defined in the task surface.`,
        `Define \`${ref.token}\` in the ${RUNNER_LABEL[ref.runner] ?? ref.runner} task file, or update the doc to name an existing task.`,
        ref.line
      ));
    }
  }
  const summary = findings.length === 0 ? "All documented task references resolve to the task surface." : `${findings.length} unresolved task reference${findings.length === 1 ? "" : "s"} in Markdown.`;
  return checkResult("commands", findings, summary);
}
const DEFAULT_STALE_THRESHOLD_DAYS = 30;
async function listExecPlans(root, kind) {
  const dir = path.join(root, "docs/exec-plans", kind);
  try {
    const entries = await promises.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")).map((entry) => path.posix.join("docs/exec-plans", kind, entry.name)).sort();
  } catch (_error) {
    return [];
  }
}
async function checkExecplans(root, options = {}) {
  const thresholdDays = options.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS;
  const findings = [];
  const now = Math.floor(Date.now() / 1e3);
  const thresholdSeconds = thresholdDays * 86400;
  const activePlans = await listExecPlans(root, "active");
  const completedPlans = await listExecPlans(root, "completed");
  for (const relpath of [...activePlans, ...completedPlans]) {
    const text = await readText(path.join(root, relpath));
    const parsed = parseExecPlan(text);
    for (const missing of parsed.missingSections) {
      findings.push(finding(
        SEVERITY_WARNING,
        relpath,
        `ExecPlan is missing required section \`${missing}\`.`,
        `Add a \`## ${missing}\` section per skills/agentic-legibility/PLANS.md.`
      ));
    }
  }
  for (const relpath of activePlans) {
    const text = await readText(path.join(root, relpath));
    const parsed = parseExecPlan(text);
    const timestamp = await lastActivityTimestamp(root, relpath);
    if (timestamp !== null && now - timestamp > thresholdSeconds) {
      const days = Math.floor((now - timestamp) / 86400);
      findings.push(finding(
        SEVERITY_WARNING,
        relpath,
        `Active ExecPlan has had no activity in ${days} days (threshold ${thresholdDays}).`,
        "Update the Progress and Outcomes sections, or move the plan to docs/exec-plans/completed/."
      ));
    }
    if (parsed.progress.total > 0 && parsed.progress.remaining === 0 && parsed.presentSections.has("Outcomes & Retrospective")) {
      const outcomesBodyPresent = text.split(/^##\s+Outcomes\s*&\s*Retrospective\s*$/mu)[1]?.replace(/^##\s.*$/msu, "")?.trim();
      if (!outcomesBodyPresent) {
        findings.push(finding(
          SEVERITY_WARNING,
          relpath,
          "Active ExecPlan has every progress checkbox completed but no Outcomes & Retrospective body.",
          "Fill in Outcomes & Retrospective, then move the plan to docs/exec-plans/completed/."
        ));
      }
    }
  }
  for (const relpath of completedPlans) {
    const text = await readText(path.join(root, relpath));
    const parsed = parseExecPlan(text);
    if (parsed.progress.remaining > 0) {
      findings.push(finding(
        SEVERITY_WARNING,
        relpath,
        `Completed ExecPlan still has ${parsed.progress.remaining} unchecked progress item${parsed.progress.remaining === 1 ? "" : "s"}.`,
        "Either finish the remaining items or move the plan back to docs/exec-plans/active/."
      ));
    }
  }
  const summary = findings.length === 0 ? `All ExecPlans healthy (${activePlans.length} active, ${completedPlans.length} completed).` : `${findings.length} ExecPlan finding${findings.length === 1 ? "" : "s"} across ${activePlans.length} active and ${completedPlans.length} completed plans.`;
  return checkResult("execplans", findings, summary);
}
const AGENT_DOC_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md"
];
function looksLikePath(content) {
  const trimmed = content.trim();
  if (!trimmed || /\s/u.test(trimmed)) return false;
  if (trimmed.startsWith("#")) return false;
  if (/^https?:\/\//iu.test(trimmed)) return false;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return false;
  if (trimmed.startsWith("/")) return false;
  if (!trimmed.includes("/")) return false;
  return true;
}
async function repoPathExists(root, relpath) {
  try {
    await promises.stat(path.join(root, relpath));
    return true;
  } catch (_error) {
    return false;
  }
}
async function checkAgentsMd(root, options = {}) {
  const excludes = options.excludes || [];
  const files = await walkRepo(root, excludes);
  const surfaceByRunner = await collectTaskSurfaceByRunner(root, files);
  const findings = [];
  const checkedDocs = [];
  for (const relpath of AGENT_DOC_CANDIDATES) {
    if (!await fileExistsInRepo(root, relpath)) continue;
    const text = await readText(path.join(root, relpath));
    if (!text) continue;
    checkedDocs.push(relpath);
    const parsed = parseMarkdown(text);
    for (const link of parsed.links) {
      const href = resolveReference(link, parsed.referenceDefinitions);
      if (!href || isExternalHref(href)) continue;
      const { target } = splitHref(href);
      if (!target) continue;
      const cleaned = target.startsWith("./") ? target.slice(2) : target;
      if (cleaned.startsWith("..")) continue;
      if (!await repoPathExists(root, cleaned)) {
        findings.push(finding(
          SEVERITY_ERROR,
          relpath,
          `Agent doc links to \`${href}\` but the target does not exist.`,
          `Update the link or create the target \`${cleaned}\`.`,
          link.line
        ));
      }
    }
    for (const span of extractInlineCodeSpans(text)) {
      if (!looksLikePath(span.content)) continue;
      const candidate = span.content.trim();
      if (candidate.startsWith("/") || candidate.startsWith("~")) continue;
      const normalized = candidate.startsWith("./") ? candidate.slice(2) : candidate;
      if (normalized.startsWith("..")) continue;
      if (!await repoPathExists(root, normalized)) {
        findings.push(finding(
          SEVERITY_ERROR,
          relpath,
          `Agent doc mentions \`${candidate}\` but the path does not exist.`,
          `Remove the reference or create \`${normalized}\`.`,
          span.line
        ));
      }
    }
    for (const ref of extractTaskReferences(text)) {
      const known = surfaceByRunner[ref.runner];
      if (!known) continue;
      if (known.has(ref.token)) continue;
      findings.push(finding(
        SEVERITY_ERROR,
        relpath,
        `Agent doc names ${RUNNER_LABEL[ref.runner] ?? ref.runner} task \`${ref.token}\` but it is not defined in the task surface.`,
        `Define \`${ref.token}\` in the ${RUNNER_LABEL[ref.runner] ?? ref.runner} task file or update the doc.`,
        ref.line
      ));
    }
  }
  let summary;
  if (checkedDocs.length === 0) {
    summary = "No agent docs found to audit.";
  } else if (findings.length === 0) {
    summary = `All paths and task commands in agent docs resolve (${checkedDocs.length} doc${checkedDocs.length === 1 ? "" : "s"} checked).`;
  } else {
    summary = `${findings.length} broken reference${findings.length === 1 ? "" : "s"} across ${checkedDocs.length} agent doc${checkedDocs.length === 1 ? "" : "s"}.`;
  }
  return checkResult("agents_md", findings, summary);
}
const AVAILABLE_CHECKS = {
  artifacts: checkArtifacts,
  links: checkLinks,
  commands: checkCommands,
  execplans: checkExecplans,
  agents_md: checkAgentsMd
};
async function runAudit(root, selectedChecks) {
  const results = {};
  const names = selectedChecks.length > 0 ? selectedChecks : Object.keys(AVAILABLE_CHECKS);
  for (const name of names) {
    const runner = AVAILABLE_CHECKS[name];
    if (!runner) {
      throw new Error(`Unknown check: ${name}. Valid checks: ${Object.keys(AVAILABLE_CHECKS).join(", ")}`);
    }
    results[name] = await runner(root);
  }
  return auditReport(root, results);
}
function parseCliArgs(argv) {
  const args = {
    repo: ".",
    format: "json",
    checks: [],
    runAll: false
  };
  const positionals = [];
  const checkFlags = new Set(Object.keys(AVAILABLE_CHECKS).map((name) => `--check-${name.replaceAll("_", "-")}`));
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      const value = argv[index + 1];
      if (value !== "json" && value !== "markdown") {
        throw new Error("--format requires either json or markdown");
      }
      args.format = value;
      index += 1;
    } else if (arg === "--check-all") {
      args.runAll = true;
    } else if (checkFlags.has(arg)) {
      const name = arg.replace(/^--check-/u, "").replaceAll("-", "_");
      args.checks.push(name);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    throw new Error("Only one repository path may be provided.");
  }
  if (positionals.length === 1) {
    args.repo = positionals[0];
  }
  if (!args.runAll && args.checks.length === 0) {
    throw new Error(`Specify at least one check flag, or use --check-all. Valid: ${Array.from(checkFlags).sort().join(", ")}, --check-all.`);
  }
  return args;
}
async function runCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const root = path.resolve(args.repo);
  if (!await isDirectory(root)) {
    throw new Error(`Repository path does not exist or is not a directory: ${root}`);
  }
  const checks = args.runAll ? Object.keys(AVAILABLE_CHECKS) : args.checks;
  const singleCheck = checks.length === 1 && !args.runAll;
  if (singleCheck) {
    const name = checks[0];
    const runner = AVAILABLE_CHECKS[name];
    const result = await runner(root);
    const output2 = args.format === "markdown" ? formatSingleCheckMarkdown(result) : formatSingleCheckJson(result);
    process.stdout.write(`${output2}
`);
    if (result.status === "drift") {
      process.exitCode = 1;
    }
    return;
  }
  const report = await runAudit(root, checks);
  const output = args.format === "markdown" ? formatAuditMarkdown(report) : formatJson(report);
  process.stdout.write(`${output}
`);
  if (report.status === "drift") {
    process.exitCode = 1;
  }
}
const USAGE = [
  "Usage: legibility <subcommand> [options]",
  "",
  "Subcommands:",
  "  score <path>             Produce the seven-dimension legibility report.",
  "  list-scopes <path>       List detected scopes in the repo.",
  "  list-metrics             List the available scoring metrics.",
  "  audit [flags] <path>     Run mechanical audit checks.",
  "",
  "Audit flags:",
  "  --check-artifacts        Verify required legibility artifacts exist.",
  "  --check-links            Find broken Markdown links, anchors, and orphan docs.",
  "  --check-commands         Flag doc references to tasks not in the task surface.",
  "  --check-execplans        Check ExecPlan sections, progress, and staleness.",
  "  --check-agents-md        Validate paths and commands in root agent docs.",
  "  --check-all              Run every audit check and emit an aggregate report.",
  "",
  "Shared flags:",
  "  --format json|markdown   Output format (default: json).",
  "",
  "Examples:",
  "  legibility score .",
  "  legibility audit --check-all --format markdown ."
].join("\n");
async function runDispatcher(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(`${USAGE}
`);
    return;
  }
  const subcommand = argv[0];
  const rest = argv.slice(1);
  switch (subcommand) {
    case "score":
      return await runCli$1(rest);
    case "list-scopes":
      return await runCli$1([...rest, "--list-scopes"]);
    case "list-metrics":
      return await runCli$1([...rest, "--list-metrics"]);
    case "audit":
      return await runCli(rest);
    default:
      throw new Error(`Unknown subcommand: ${subcommand}. Valid: score, list-scopes, list-metrics, audit.`);
  }
}
const invokedAsMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = new URL(`file://${path.resolve(entry)}`).href;
    return import.meta.url === entryUrl;
  } catch (_error) {
    return false;
  }
})();
if (invokedAsMain) {
  try {
    await runDispatcher();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}
`);
    process.exitCode = 2;
  }
}
export {
  runDispatcher
};
