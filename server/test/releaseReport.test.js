const { aggregateSteps, classifyExecution, tail } = require('../../scripts/release-validate');

describe('local release report classification', () => {
  it('treats a missing tool as unknown setup rather than a regression', () => {
    expect(classifyExecution({ toolExists: false })).toEqual({
      status: 'unknown',
      classification: 'setup_failure',
      summary: 'Required local dependency/tool is not installed.',
    });
  });

  it('classifies a nonzero application test/build result as a regression', () => {
    expect(classifyExecution({
      toolExists: true,
      status: 1,
      stdout: 'AssertionError: expected fixture value',
      stderr: '',
    })).toMatchObject({ status: 'fail', classification: 'application_regression' });
  });

  it('classifies dependency resolution output as unknown setup', () => {
    expect(classifyExecution({
      toolExists: true,
      status: 1,
      stdout: '',
      stderr: "Error: Cannot find module 'vite'",
    })).toMatchObject({ status: 'unknown', classification: 'setup_failure' });
  });

  it('classifies a sandbox EPERM while opening the test listener as unknown setup', () => {
    expect(classifyExecution({
      toolExists: true,
      status: 1,
      stdout: '',
      stderr: 'Error: listen EPERM: operation not permitted 0.0.0.0',
    })).toMatchObject({ status: 'unknown', classification: 'setup_failure' });
  });

  it('does not hide a real assertion failure behind setup classification', () => {
    expect(classifyExecution({
      toolExists: true,
      status: 1,
      stdout: '',
      stderr: 'AssertionError: expected /api/artists to equal /api/team/artists',
    })).toMatchObject({ status: 'fail', classification: 'application_regression' });
  });

  it('aggregates fail before unknown, then degraded, while retaining the failed step', () => {
    expect(aggregateSteps([
      { id: 'server-tests', status: 'unknown' },
      { id: 'client-build', status: 'fail' },
    ])).toMatchObject({ status: 'fail', failedStep: 'client-build' });
    expect(aggregateSteps([{ id: 'client-build', status: 'unknown' }]))
      .toMatchObject({ status: 'unknown', setupStep: 'client-build', failedStep: null });
    expect(aggregateSteps([{ id: 'optional', status: 'degraded' }]))
      .toMatchObject({ status: 'degraded', failedStep: null });
    expect(aggregateSteps([{ id: 'server-tests', status: 'pass' }]))
      .toMatchObject({ status: 'pass', failedStep: null });
  });

  it('bounds captured command output in the JSON report', () => {
    expect(tail('a'.repeat(7000), 100)).toBe(`…${'a'.repeat(100)}`);
  });
});
