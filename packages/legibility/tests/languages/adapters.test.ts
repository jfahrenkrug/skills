import { describe, it, beforeAll, afterAll } from 'vitest';
import { expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parsePackageScripts, javascriptAdapter } from '../../src/languages/javascript.js';
import { parseMakeTargets, makeAdapter } from '../../src/languages/make.js';
import { parseJustTargets, justAdapter } from '../../src/languages/just.js';
import { parseTaskfileTargets, taskfileAdapter } from '../../src/languages/taskfile.js';
import { parseCargoAliases, rustAdapter } from '../../src/languages/rust.js';
import { parsePythonScripts, parseToxEnvlist, pythonAdapter } from '../../src/languages/python.js';
import { parseGradleTasks, gradleAdapter } from '../../src/languages/gradle.js';
import { parseMavenGoals, mavenAdapter } from '../../src/languages/maven.js';
import { parseMsbuildTargets, dotnetAdapter } from '../../src/languages/dotnet.js';
import { parseCmakeTargets, cmakeAdapter } from '../../src/languages/cmake.js';
import { parseComposerScripts, composerAdapter } from '../../src/languages/composer.js';
import { parseRakefile, rakeAdapter } from '../../src/languages/rake.js';
import { parseFastfileLanes, parseXcodeSchemeFilenames, xcodeAdapter } from '../../src/languages/xcode.js';
import { parseNxTargets, nxAdapter } from '../../src/languages/nx.js';
import { parseTurboTasks, turboAdapter } from '../../src/languages/turbo.js';
import { parseMiseTasks, miseAdapter } from '../../src/languages/mise.js';
import { deriveMixTaskName, mixAdapter } from '../../src/languages/mix.js';
import {
   ALL_ADAPTERS,
   MANIFEST_FILE_NAMES,
   TASK_FILE_PATTERNS,
   categorizeTaskSurface,
   collectAllTaskSurfaces,
} from '../../src/languages/index.js';

async function mkTempDir(): Promise<string> {
   return fs.mkdtemp(path.join(os.tmpdir(), 'al-lang-'));
}

async function rmDir(dir: string): Promise<void> {
   await fs.rm(dir, { recursive: true, force: true });
}

describe('constants', () => {
   it('MANIFEST_FILE_NAMES includes common manifest filenames', () => {
      expect(MANIFEST_FILE_NAMES.has('pyproject.toml')).toBe(true);
      expect(MANIFEST_FILE_NAMES.has('go.mod')).toBe(true);
      expect(MANIFEST_FILE_NAMES.has('gemfile')).toBe(true);
   });

   it('TASK_FILE_PATTERNS is non-empty', () => {
      expect(TASK_FILE_PATTERNS.length).toBeGreaterThan(0);
   });

   it('ALL_ADAPTERS contains all registered adapters', () => {
      expect(ALL_ADAPTERS.length).toBe(17);
      const ids = ALL_ADAPTERS.map((a) => a.id);
      expect(ids).toContain('javascript');
      expect(ids).toContain('make');
      expect(ids).toContain('just');
      expect(ids).toContain('task');
      expect(ids).toContain('cargo');
      expect(ids).toContain('python');
      expect(ids).toContain('gradle');
      expect(ids).toContain('maven');
      expect(ids).toContain('dotnet');
      expect(ids).toContain('cmake');
      expect(ids).toContain('composer');
      expect(ids).toContain('rake');
      expect(ids).toContain('xcode');
      expect(ids).toContain('nx');
      expect(ids).toContain('turbo');
      expect(ids).toContain('mise');
      expect(ids).toContain('mix');
   });
});

describe('parsePackageScripts', () => {
   it('extracts script names', () => {
      const text = JSON.stringify({ scripts: { build: 'x', test: 'y' } });
      const result = parsePackageScripts(text);
      expect(Array.from(result).sort()).toEqual([ 'build', 'test' ]);
   });

   it('returns empty set for malformed JSON', () => {
      expect(parsePackageScripts('not json').size).toBe(0);
   });

   it('returns empty set when scripts is absent or wrong type', () => {
      expect(parsePackageScripts('{}').size).toBe(0);
      expect(parsePackageScripts(JSON.stringify({ scripts: [] })).size).toBe(0);
      expect(parsePackageScripts(JSON.stringify({ scripts: 'oops' })).size).toBe(0);
   });
});

describe('parseMakeTargets', () => {
   it('extracts target names and skips indented lines', () => {
      const text = [
         'build:',
         '\tgcc -o out main.c',
         'test: build',
         '\t./out',
         '.PHONY: build test',
      ].join('\n');
      const result = parseMakeTargets(text);
      expect(result.has('build')).toBe(true);
      expect(result.has('test')).toBe(true);
      expect(result.has('.PHONY')).toBe(false);
   });
});

describe('parseJustTargets', () => {
   it('extracts recipe names', () => {
      const text = [ 'build:', '    cargo build', 'test:', '    cargo test' ].join('\n');
      const result = parseJustTargets(text);
      expect(Array.from(result).sort()).toEqual([ 'build', 'test' ]);
   });
});

describe('parseTaskfileTargets', () => {
   it('extracts task names from the tasks: section', () => {
      const text = [
         'version: 3',
         'tasks:',
         '  build:',
         '    cmds:',
         '      - echo build',
         '  test:',
         '    cmds:',
         '      - echo test',
         'vars: {}',
      ].join('\n');
      const result = parseTaskfileTargets(text);
      expect(result.has('build')).toBe(true);
      expect(result.has('test')).toBe(true);
   });
});

describe('parseCargoAliases', () => {
   it('extracts aliases from the [alias] section', () => {
      const text = [
         '[alias]',
         'b = "build"',
         't = "test"',
         '',
         '[build]',
         'target = "wasm32"',
      ].join('\n');
      const result = parseCargoAliases(text);
      expect(result.has('b')).toBe(true);
      expect(result.has('t')).toBe(true);
      expect(result.has('target')).toBe(false);
   });
});

describe('categorizeTaskSurface', () => {
   it('buckets standard commands into setup/dev/build/test/lint/format/check', () => {
      const surface = new Set([ 'setup', 'dev', 'build', 'test', 'lint', 'format', 'check' ]);
      const cats = categorizeTaskSurface(surface);
      expect(cats.setup).toEqual([ 'setup' ]);
      expect(cats.dev).toEqual([ 'dev' ]);
      expect(cats.build).toEqual([ 'build' ]);
      expect(cats.test).toEqual([ 'test' ]);
      expect(cats.lint).toEqual([ 'lint' ]);
      expect(cats.format).toEqual([ 'format' ]);
      expect(cats.check).toEqual([ 'check' ]);
   });

   it('handles colon-prefixed variants', () => {
      const surface = new Set([ 'test:unit', 'lint:eslint', 'format:rust' ]);
      const cats = categorizeTaskSurface(surface);
      expect(cats.test).toContain('test:unit');
      expect(cats.lint).toContain('lint:eslint');
      expect(cats.format).toContain('format:rust');
   });
});

describe('collectAllTaskSurfaces', () => {
   let tempDir: string;

   beforeAll(async () => {
      tempDir = await mkTempDir();
      await fs.writeFile(
         path.join(tempDir, 'package.json'),
         JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }),
      );
      await fs.writeFile(
         path.join(tempDir, 'Makefile'),
         [ 'build:', '\tgcc main.c', 'check:', '\tmake build' ].join('\n'),
      );
   });

   afterAll(async () => {
      await rmDir(tempDir);
   });

   it('merges commands from multiple task files', async () => {
      const files = [ 'package.json', 'Makefile' ];
      const result = await collectAllTaskSurfaces(tempDir, files);
      expect(result.task_surface.has('dev')).toBe(true);
      expect(result.task_surface.has('test')).toBe(true);
      expect(result.task_surface.has('build')).toBe(true);
      expect(result.task_surface.has('check')).toBe(true);
   });

   it('records which files contributed to the surface', async () => {
      const files = [ 'package.json', 'Makefile' ];
      const result = await collectAllTaskSurfaces(tempDir, files);
      expect(result.task_surface_files.has('package.json')).toBe(true);
      expect(result.task_surface_files.has('Makefile')).toBe(true);
   });
});

describe('adapter detect()', () => {
   it('javascriptAdapter detects package.json', () => {
      expect(javascriptAdapter.detect([ 'package.json', 'src/index.ts' ])).toBe(true);
      expect(javascriptAdapter.detect([ 'Cargo.toml', 'src/main.rs' ])).toBe(false);
   });

   it('makeAdapter detects Makefile', () => {
      expect(makeAdapter.detect([ 'Makefile', 'src/main.c' ])).toBe(true);
      expect(makeAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('justAdapter detects justfile', () => {
      expect(justAdapter.detect([ 'justfile', 'src/main.rs' ])).toBe(true);
      expect(justAdapter.detect([ 'Makefile' ])).toBe(false);
   });

   it('taskfileAdapter detects Taskfile.yml', () => {
      expect(taskfileAdapter.detect([ 'Taskfile.yml' ])).toBe(true);
      expect(taskfileAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('rustAdapter detects .cargo/config.toml', () => {
      expect(rustAdapter.detect([ '.cargo/config.toml', 'src/main.rs' ])).toBe(true);
      expect(rustAdapter.detect([ 'Cargo.toml' ])).toBe(false);
   });

   it('pythonAdapter detects pyproject.toml, setup.py, tox.ini', () => {
      expect(pythonAdapter.detect([ 'pyproject.toml' ])).toBe(true);
      expect(pythonAdapter.detect([ 'setup.py' ])).toBe(true);
      expect(pythonAdapter.detect([ 'tox.ini' ])).toBe(true);
      expect(pythonAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('gradleAdapter detects build.gradle and build.gradle.kts', () => {
      expect(gradleAdapter.detect([ 'build.gradle' ])).toBe(true);
      expect(gradleAdapter.detect([ 'build.gradle.kts' ])).toBe(true);
      expect(gradleAdapter.detect([ 'app/build.gradle.kts' ])).toBe(true);
      expect(gradleAdapter.detect([ 'pom.xml' ])).toBe(false);
   });

   it('mavenAdapter detects pom.xml', () => {
      expect(mavenAdapter.detect([ 'pom.xml' ])).toBe(true);
      expect(mavenAdapter.detect([ 'sub/pom.xml' ])).toBe(true);
      expect(mavenAdapter.detect([ 'build.gradle' ])).toBe(false);
   });

   it('dotnetAdapter detects MSBuild project files', () => {
      expect(dotnetAdapter.detect([ 'App.csproj' ])).toBe(true);
      expect(dotnetAdapter.detect([ 'lib/Foo.fsproj' ])).toBe(true);
      expect(dotnetAdapter.detect([ 'bar.vbproj' ])).toBe(true);
      expect(dotnetAdapter.detect([ 'pom.xml' ])).toBe(false);
   });

   it('cmakeAdapter detects CMakeLists.txt', () => {
      expect(cmakeAdapter.detect([ 'CMakeLists.txt' ])).toBe(true);
      expect(cmakeAdapter.detect([ 'src/CMakeLists.txt' ])).toBe(true);
      expect(cmakeAdapter.detect([ 'Makefile' ])).toBe(false);
   });

   it('composerAdapter detects composer.json', () => {
      expect(composerAdapter.detect([ 'composer.json' ])).toBe(true);
      expect(composerAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('rakeAdapter detects Rakefile and .rake files', () => {
      expect(rakeAdapter.detect([ 'Rakefile' ])).toBe(true);
      expect(rakeAdapter.detect([ 'lib/tasks/db.rake' ])).toBe(true);
      expect(rakeAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('xcodeAdapter detects xcscheme and Fastfile', () => {
      expect(xcodeAdapter.detect([ 'App.xcodeproj/xcshareddata/xcschemes/App.xcscheme' ])).toBe(true);
      expect(xcodeAdapter.detect([ 'fastlane/Fastfile' ])).toBe(true);
      expect(xcodeAdapter.detect([ 'App.xcodeproj/project.pbxproj' ])).toBe(true);
      expect(xcodeAdapter.detect([ 'package.json' ])).toBe(false);
   });
});

describe('parsePythonScripts', () => {
   it('extracts names from [project.scripts]', () => {
      const text = [
         '[project]',
         'name = "mypkg"',
         '',
         '[project.scripts]',
         'hello = "mypkg:main"',
         'goodbye = "mypkg:bye"',
      ].join('\n');
      const result = parsePythonScripts(text);
      expect(Array.from(result).sort()).toEqual([ 'goodbye', 'hello' ]);
   });

   it('extracts names from [tool.poetry.scripts]', () => {
      const text = [
         '[tool.poetry.scripts]',
         'serve = "myapp.cli:serve"',
         'migrate = "myapp.cli:migrate"',
      ].join('\n');
      const result = parsePythonScripts(text);
      expect(Array.from(result).sort()).toEqual([ 'migrate', 'serve' ]);
   });

   it('extracts names from [tool.pdm.scripts] and hatch envs', () => {
      const text = [
         '[tool.pdm.scripts]',
         'lint = "ruff check ."',
         '',
         '[tool.hatch.envs.default.scripts]',
         'test = "pytest"',
         '',
         '[tool.hatch.envs.docs.scripts]',
         'build = "mkdocs build"',
      ].join('\n');
      const result = parsePythonScripts(text);
      expect(result.has('lint')).toBe(true);
      expect(result.has('test')).toBe(true);
      expect(result.has('build')).toBe(true);
   });

   it('ignores keys outside scripts tables', () => {
      const text = [
         '[project]',
         'name = "mypkg"',
         'version = "0.1"',
      ].join('\n');
      expect(parsePythonScripts(text).size).toBe(0);
   });
});

describe('parseToxEnvlist', () => {
   it('extracts envs from single-line envlist', () => {
      const text = [
         '[tox]',
         'envlist = py310, py311, lint',
      ].join('\n');
      const result = parseToxEnvlist(text);
      expect(Array.from(result).sort()).toEqual([ 'lint', 'py310', 'py311' ]);
   });

   it('extracts envs from multi-line envlist with continuations', () => {
      const text = [
         '[tox]',
         'envlist =',
         '    py310',
         '    py311',
         '    docs',
         '',
         '[testenv]',
         'deps = pytest',
      ].join('\n');
      const result = parseToxEnvlist(text);
      expect(result.has('py310')).toBe(true);
      expect(result.has('py311')).toBe(true);
      expect(result.has('docs')).toBe(true);
   });

   it('returns empty set when no [tox] section exists', () => {
      expect(parseToxEnvlist('[testenv]\ndeps = pytest').size).toBe(0);
   });
});

describe('parseGradleTasks', () => {
   it('extracts Groovy task declarations', () => {
      const text = [
         'task hello {',
         '   doLast { println "hi" }',
         '}',
         'task compile(type: JavaCompile) {',
         '}',
      ].join('\n');
      const result = parseGradleTasks(text);
      expect(result.has('hello')).toBe(true);
      expect(result.has('compile')).toBe(true);
   });

   it('extracts Kotlin DSL tasks.register and tasks.create', () => {
      const text = [
         'tasks.register("buildDocs") {',
         '}',
         'tasks.register<Jar>("fatJar") {',
         '}',
         'tasks.create("legacy") {',
         '}',
      ].join('\n');
      const result = parseGradleTasks(text);
      expect(result.has('buildDocs')).toBe(true);
      expect(result.has('fatJar')).toBe(true);
      expect(result.has('legacy')).toBe(true);
   });

   it('extracts Kotlin DSL registering/creating delegates', () => {
      const text = [
         'val assemble by tasks.registering {',
         '}',
         'val clean by tasks.creating {',
         '}',
      ].join('\n');
      const result = parseGradleTasks(text);
      expect(result.has('assemble')).toBe(true);
      expect(result.has('clean')).toBe(true);
   });

   it('returns empty set for unrelated text', () => {
      expect(parseGradleTasks('plugins { id("java") }').size).toBe(0);
   });
});

describe('parseMavenGoals', () => {
   it('extracts profile ids', () => {
      const text = [
         '<project>',
         '  <profiles>',
         '    <profile><id>dev</id></profile>',
         '    <profile><id>prod</id></profile>',
         '  </profiles>',
         '</project>',
      ].join('\n');
      const result = parseMavenGoals(text);
      expect(result.has('dev')).toBe(true);
      expect(result.has('prod')).toBe(true);
   });

   it('extracts plugin goals', () => {
      const text = [
         '<execution>',
         '  <goals>',
         '    <goal>compile</goal>',
         '    <goal>test-compile</goal>',
         '  </goals>',
         '</execution>',
      ].join('\n');
      const result = parseMavenGoals(text);
      expect(result.has('compile')).toBe(true);
      expect(result.has('test-compile')).toBe(true);
   });

   it('returns empty set for a minimal pom', () => {
      expect(parseMavenGoals('<project><modelVersion>4.0.0</modelVersion></project>').size).toBe(0);
   });
});

describe('parseMsbuildTargets', () => {
   it('extracts Target Name attributes', () => {
      const text = [
         '<Project Sdk="Microsoft.NET.Sdk">',
         '  <Target Name="BeforeBuild">',
         '    <Message Text="hi" />',
         '  </Target>',
         '  <Target Name="Publish" DependsOnTargets="Build">',
         '  </Target>',
         '</Project>',
      ].join('\n');
      const result = parseMsbuildTargets(text);
      expect(result.has('BeforeBuild')).toBe(true);
      expect(result.has('Publish')).toBe(true);
   });

   it('returns empty set when there are no Target elements', () => {
      expect(parseMsbuildTargets('<Project Sdk="Microsoft.NET.Sdk" />').size).toBe(0);
   });
});

describe('parseCmakeTargets', () => {
   it('extracts add_custom_target, add_executable, add_library names', () => {
      const text = [
         'cmake_minimum_required(VERSION 3.10)',
         'project(foo)',
         'add_executable(hello main.cpp)',
         'add_library(util util.cpp)',
         'add_custom_target(docs COMMAND doxygen)',
      ].join('\n');
      const result = parseCmakeTargets(text);
      expect(result.has('hello')).toBe(true);
      expect(result.has('util')).toBe(true);
      expect(result.has('docs')).toBe(true);
   });

   it('returns empty set for a minimal project', () => {
      expect(parseCmakeTargets('project(foo)').size).toBe(0);
   });
});

describe('parseComposerScripts', () => {
   it('extracts composer script names', () => {
      const text = JSON.stringify({ scripts: { test: 'phpunit', lint: 'phpstan' } });
      const result = parseComposerScripts(text);
      expect(Array.from(result).sort()).toEqual([ 'lint', 'test' ]);
   });

   it('returns empty set for malformed or missing scripts', () => {
      expect(parseComposerScripts('not json').size).toBe(0);
      expect(parseComposerScripts('{}').size).toBe(0);
      expect(parseComposerScripts(JSON.stringify({ scripts: [] })).size).toBe(0);
   });
});

describe('parseRakefile', () => {
   it('extracts top-level tasks', () => {
      const text = [
         'task :default => [:test]',
         'task :test do',
         '  sh "rspec"',
         'end',
      ].join('\n');
      const result = parseRakefile(text);
      expect(result.has('default')).toBe(true);
      expect(result.has('test')).toBe(true);
   });

   it('joins namespace names with colons', () => {
      const text = [
         'namespace :db do',
         '  task :migrate do',
         '  end',
         '  task :rollback do',
         '  end',
         'end',
         'task :build do',
         'end',
      ].join('\n');
      const result = parseRakefile(text);
      expect(result.has('db:migrate')).toBe(true);
      expect(result.has('db:rollback')).toBe(true);
      expect(result.has('build')).toBe(true);
   });

   it('handles nested namespaces', () => {
      const text = [
         'namespace :assets do',
         '  namespace :precompile do',
         '    task :clean do',
         '    end',
         '  end',
         'end',
      ].join('\n');
      const result = parseRakefile(text);
      expect(result.has('assets:precompile:clean')).toBe(true);
   });

   it('keeps the namespace prefix across def/if/class blocks that close with end', () => {
      const text = [
         'namespace :db do',
         '  def helper',
         '    1',
         '  end',
         '',
         '  if ENV["CI"]',
         '    puts "ci"',
         '  end',
         '',
         '  task :migrate do',
         '  end',
         'end',
         '',
         'namespace :assets do',
         '  class Helper',
         '  end',
         '',
         '  task :clean do',
         '  end',
         'end',
      ].join('\n');
      const result = parseRakefile(text);
      expect(result.has('db:migrate')).toBe(true);
      expect(result.has('assets:clean')).toBe(true);
      expect(result.has('migrate')).toBe(false);
   });

   it('does not push a block for endless defs or one-line blocks', () => {
      const text = [
         'namespace :db do',
         '  def version = "1.0"',
         '  def check(x) = x.valid?',
         '  if ENV["CI"] then puts "ci" end',
         '  task :migrate do',
         '  end',
         'end',
      ].join('\n');
      const result = parseRakefile(text);
      expect(result.has('db:migrate')).toBe(true);
   });
});

describe('parseFastfileLanes', () => {
   it('extracts lane names', () => {
      const text = [
         'default_platform(:ios)',
         '',
         'platform :ios do',
         '  lane :beta do',
         '    build_app',
         '  end',
         '  lane :release do',
         '  end',
         'end',
      ].join('\n');
      const result = parseFastfileLanes(text);
      expect(result.has('beta')).toBe(true);
      expect(result.has('release')).toBe(true);
   });
});

describe('parseXcodeSchemeFilenames', () => {
   it('extracts scheme names from filenames', () => {
      const files = [
         'App.xcodeproj/xcshareddata/xcschemes/App.xcscheme',
         'App.xcodeproj/xcshareddata/xcschemes/AppTests.xcscheme',
         'README.md',
      ];
      const result = parseXcodeSchemeFilenames(files);
      expect(Array.from(result).sort()).toEqual([ 'App', 'AppTests' ]);
   });

   it('ignores files outside xcshareddata/xcschemes', () => {
      expect(parseXcodeSchemeFilenames([ 'src/foo.swift', 'pom.xml' ]).size).toBe(0);
   });
});

describe('parseNxTargets', () => {
   it('extracts target names from project.json', () => {
      const text = JSON.stringify({ targets: { build: { executor: 'x' }, test: {} } });
      const result = parseNxTargets(text);
      expect(Array.from(result).sort()).toEqual([ 'build', 'test' ]);
   });

   it('extracts targetDefaults keys from nx.json', () => {
      const text = JSON.stringify({ targetDefaults: { build: {}, lint: {} } });
      const result = parseNxTargets(text);
      expect(result.has('build')).toBe(true);
      expect(result.has('lint')).toBe(true);
   });

   it('returns empty set for malformed JSON', () => {
      expect(parseNxTargets('not json').size).toBe(0);
   });
});

describe('parseTurboTasks', () => {
   it('extracts pipeline keys (Turbo v1)', () => {
      const text = JSON.stringify({ pipeline: { build: {}, test: {} } });
      expect(Array.from(parseTurboTasks(text)).sort()).toEqual([ 'build', 'test' ]);
   });

   it('extracts tasks keys (Turbo v2)', () => {
      const text = JSON.stringify({ tasks: { lint: {}, 'app#build': {} } });
      const result = parseTurboTasks(text);
      expect(result.has('lint')).toBe(true);
      expect(result.has('app#build')).toBe(true);
      expect(result.has('build')).toBe(true);
   });

   it('returns empty set for malformed JSON', () => {
      expect(parseTurboTasks('not json').size).toBe(0);
   });
});

describe('parseMiseTasks', () => {
   it('extracts tasks defined as table headers', () => {
      const text = [
         '[tools]',
         'node = "20"',
         '',
         '[tasks.build]',
         'run = "tsc"',
         '',
         '[tasks.test]',
         'run = "vitest"',
      ].join('\n');
      const result = parseMiseTasks(text);
      expect(result.has('build')).toBe(true);
      expect(result.has('test')).toBe(true);
   });

   it('extracts tasks from inline [tasks] table form', () => {
      const text = [
         '[tasks]',
         'lint = "eslint ."',
         'fmt = "prettier --write ."',
         '',
         '[tools]',
         'node = "20"',
      ].join('\n');
      const result = parseMiseTasks(text);
      expect(result.has('lint')).toBe(true);
      expect(result.has('fmt')).toBe(true);
   });
});

describe('mixAdapter', () => {
   it('deriveMixTaskName takes the basename minus .ex', () => {
      expect(deriveMixTaskName('lib/mix/tasks/foo.ex')).toBe('foo');
      expect(deriveMixTaskName('lib/mix/tasks/my_task.ex')).toBe('my_task');
      expect(deriveMixTaskName('lib/foo.ex')).toBe('foo');
      expect(deriveMixTaskName('readme.md')).toBeNull();
   });

   it('collectTaskSurface returns built-ins plus discovered tasks when mix.exs exists', async () => {
      const files = [ 'mix.exs', 'lib/mix/tasks/release.ex', 'lib/mix/tasks/seed.ex' ];
      const result = await mixAdapter.collectTaskSurface('/tmp/ignored', files);
      expect(result.names.has('compile')).toBe(true);
      expect(result.names.has('test')).toBe(true);
      expect(result.names.has('seed')).toBe(true);
      expect(result.names.has('release')).toBe(true);
      expect(result.sourceFiles.has('mix.exs')).toBe(true);
   });

   it('returns empty surface when mix.exs is absent', async () => {
      const files = [ 'lib/mix/tasks/foo.ex' ];
      const result = await mixAdapter.collectTaskSurface('/tmp/ignored', files);
      expect(result.names.size).toBe(0);
   });
});

describe('new orchestrator adapter detect()', () => {
   it('nxAdapter detects nx.json and project.json', () => {
      expect(nxAdapter.detect([ 'nx.json' ])).toBe(true);
      expect(nxAdapter.detect([ 'apps/foo/project.json' ])).toBe(true);
      expect(nxAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('turboAdapter detects turbo.json', () => {
      expect(turboAdapter.detect([ 'turbo.json' ])).toBe(true);
      expect(turboAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('miseAdapter detects mise.toml and .mise.toml', () => {
      expect(miseAdapter.detect([ 'mise.toml' ])).toBe(true);
      expect(miseAdapter.detect([ '.mise.toml' ])).toBe(true);
      expect(miseAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('mixAdapter detects mix.exs', () => {
      expect(mixAdapter.detect([ 'mix.exs' ])).toBe(true);
      expect(mixAdapter.detect([ 'package.json' ])).toBe(false);
   });
});
