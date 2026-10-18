import test from 'node:test';
import assert from 'node:assert/strict';
import { appendBounded, validPackage, clues, COMMANDS } from './core.js';
test('bounded capture reports exact discarded characters', () => {
  assert.deepEqual(appendBounded('abc', 'def', 4), { text: 'cdef', dropped: 2 });
  assert.deepEqual(appendBounded('', 'abc', 4), { text: 'abc', dropped: 0 });
});
test('package names cannot inject shell commands', () => {
  for (const p of ['com.ichi2.anki', 'com.foo_app.dev']) assert.equal(validPackage(p), true);
  for (const p of ['com.foo;id', 'com.foo\nreboot', '$(id)', 'com.foo && id', '', '-a', 'com.foo/Bar']) assert.equal(validPackage(p), false);
});
test('clues explicitly distinguish observation from diagnosis', () => {
  assert.match(clues('Input dispatching timed out'), /不能据此推定根因/);
  assert.match(clues('normal text'), /不排除 ANR/);
  assert.match(clues('FreeFormInput'), /没有此标签也不代表注入正常/);
});
test('fixed commands do not clear logs or change settings', () => {
  assert.ok(COMMANDS.state.includes('dumpsys input'));
  assert.ok(COMMANDS.anr.includes('dumpsys dropbox --print data_app_anr'));
  for (const cmd of Object.values(COMMANDS).flat()) assert.doesNotMatch(cmd, /logcat -c|settings put|reboot|force-stop/);
});
