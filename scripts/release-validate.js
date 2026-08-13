#!/usr/bin/env node

// Local, non-deploying release validation. This intentionally runs only the
// existing isolated server tests and the client production build. It never
// starts the application, background services, or external integrations.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPORT = path.join(REPO_ROOT, 'quality-reports', 'release-report.json');
const OUTPUT_LIMIT = 6000;

const SETUP_FAILURE_PATTERNS = [
  /command not found/i,
  /not recognized as an internal or external command/i,
  /cannot find module/i,
  /module_not_found/i,
  /could not determine executable to run/i,
  /no such file or directory/i,
];

function tail(value, limit = OUTPUT_LIMIT) {
  const text = String(value || '').trim();
  return text.length <= limit ? text : `…${text.slice(-limit)}`;
}

function classifyExecution({ toolExists, error, status, signal, stdout, stderr }) {
  if (!toolExists) {
    return {
      status: 'unknown',
      classification: 'setup_failure',
      summary: 'Required local dependency/tool is not installed.',
    };
  }
  if (error) {
    return {
      status: 'unknown',
      classification: 'setup_failure',
      summary: `Validation step could not start: ${error.message}`,
    };
  }
  if (status === 0) {
    return { status: 'pass', classification: 'validated', summary: 'Step passed.' };
  }

  const output = `${stdout || ''}\n${stderr || ''}`;
  if (SETUP_FAILURE_PATTERNS.some((pattern) => pattern.test(output))) {
    return {
      status: 'unknown',
      classification: 'setup_failure',
      summary: 'Step could not be evaluated because a local dependency/tool is missing.',
    };
  }
  return {
    status: 'fail',
    classification: 'application_regression',
    summary: signal
      ? `Step terminated by signal ${signal}.`
      : `Step failed with exit code ${status}.`,
  };
}

function aggregateSteps(steps) {
  const failed = steps.find((step) => step.status === 'fail');
  if (failed) {
    return {
      status: 'fail',
      failedStep: failed.id,
      decision: 'Do not release until the failing test/build step is resolved.',
    };
  }
  const unknown = steps.find((step) => step.status === 'unknown');
  if (unknown) {
    return {
      status: 'unknown',
      failedStep: null,
      setupStep: unknown.id,
      decision: 'Release readiness is unknown; complete local setup and rerun validation.',
    };
  }
  const degraded = steps.find((step) => step.status === 'degraded');
  if (degraded) {
    return {
      status: 'degraded',
      failedStep: null,
      decision: 'Review degraded checks before making the human release decision.',
    };
  }
  return {
    status: 'pass',
    failedStep: null,
    decision: 'Automated local validation passed; release remains a human decision.',
  };
}

function runStep(definition, runner = spawnSync) {
  const started = Date.now();
  const toolPath = path.join(REPO_ROOT, definition.requiredTool);
  const toolExists = fs.existsSync(toolPath);
  let result = { status: null, signal: null, stdout: '', stderr: '', error: null };

  if (toolExists) {
    result = runner(definition.command, definition.args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...(definition.env || {}) },
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  const classification = classifyExecution({ toolExists, ...result });
  return {
    id: definition.id,
    name: definition.name,
    command: [definition.command, ...definition.args].join(' '),
    requiredTool: definition.requiredTool,
    ...classification,
    exitCode: result.status,
    signal: result.signal || null,
    durationMs: Date.now() - started,
    output: tail(`${result.stdout || ''}\n${result.stderr || ''}`),
  };
}

function printStep(step) {
  const label = step.status.toUpperCase().padEnd(8);
  console.log(`[${label}] ${step.name} (${step.durationMs} ms)`);
  console.log(`           ${step.summary}`);
  if (step.status !== 'pass' && step.output) console.log(`\n${step.output}\n`);
}

function reportPath() {
  return path.resolve(process.env.RELEASE_REPORT_PATH || DEFAULT_REPORT);
}

function main() {
  const startedAt = new Date();
  const definitions = [
    {
      id: 'server-tests',
      name: 'Isolated server test suite',
      command: 'npm',
      args: ['test', '--prefix', 'server'],
      requiredTool: 'server/node_modules/.bin/vitest',
    },
    {
      id: 'client-build',
      name: 'Client production build',
      command: 'npm',
      args: ['run', 'build', '--prefix', 'client'],
      requiredTool: 'client/node_modules/.bin/vite',
      env: { NODE_ENV: 'production' },
    },
  ];

  console.log('Production Hub — Local Release Validation');
  console.log('No deploy, push, production-data access, scheduler, or external-service call is performed.\n');

  const steps = definitions.map((definition) => {
    const step = runStep(definition);
    printStep(step);
    return step;
  });
  const overall = aggregateSteps(steps);
  const finishedAt = new Date();
  const destination = reportPath();
  const report = {
    schemaVersion: 1,
    kind: 'local-release-validation',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    overallStatus: overall.status,
    failedStep: overall.failedStep,
    setupStep: overall.setupStep || null,
    decision: overall.decision,
    context: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      workingDirectory: REPO_ROOT,
    },
    steps,
  };

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
  fs.renameSync(temporary, destination);

  console.log(`Overall: ${overall.status.toUpperCase()}`);
  console.log(overall.decision);
  console.log(`JSON report: ${destination}`);

  process.exitCode = overall.status === 'fail' ? 1 : 0;
}

if (require.main === module) main();

module.exports = { aggregateSteps, classifyExecution, runStep, tail };
