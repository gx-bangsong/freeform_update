import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { appendBounded, validPackage, COMMANDS, OUTPUT_LIMIT, clues } from './core.js';

const $ = id => document.getElementById(id);
const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
let adb, rawDevice, connecting = false, generation = 0, busy = false, capturing = false;
let capturePending = false;
let logProcess, session = emptySession(), dirty = false, liveDirty = false;
function metadata() {
  return Object.fromEntries(['version', 'package', 'mode', 'display', 'ime', 'notes'].map(id => [id, $(id).value.trim()]));
}
function emptySession() {
  return { schema: 'freeform-usb-lab/v1', createdAt: new Date().toISOString(), metadata: null, browser: navigator.userAgent,
    startedAt: null, stoppedAt: null, logcat: '', logcatStderr: '', receivedCharacters: 0, droppedCharacters: 0,
    markers: [], results: [], discardedResults: 0, events: [] };
}
function message(text, error = false) { $('message').textContent = text; document.body.classList.toggle('error', error); }
function event(text) { session.events.push({ time: new Date().toISOString(), text }); session.events = session.events.slice(-200); dirty = true; }
function ui() {
  $('connect').disabled = !!adb || connecting || !manager || !isSecureContext;
  $('disconnect').disabled = !adb && !connecting;
  $('start').disabled = !adb || capturePending || busy;
  $('stop').disabled = !capturing;
  $('mark').disabled = !adb || !capturing || busy;
  document.querySelectorAll('.diagnostic').forEach(b => b.disabled = !adb || busy);
  $('export').disabled = !dirty;
  $('export-text').disabled = !session.logcat;
  for (const id of ['version', 'package', 'mode', 'display', 'ime', 'notes']) $(id).disabled = capturing || busy;
  $('capture-state').textContent = capturing ? '正在采集' : session.startedAt ? '采集已结束' : '待开始';
  $('connection').textContent = adb ? 'USB 已连接' : connecting ? '等待授权' : '未连接';
  $('received').textContent = session.receivedCharacters.toLocaleString();
  $('dropped').textContent = session.droppedCharacters.toLocaleString();
  $('marks').textContent = session.markers.length;
  $('snapshots').textContent = session.results.length;
}
async function disconnect() {
  generation++;
  const current = adb, raw = rawDevice;
  adb = undefined; rawDevice = undefined; connecting = false;
  try { if (current) await current.close(); else if (raw?.opened) await raw.close(); }
  catch (e) { message(`断开时：${e.message}`, true); }
  if (capturing) { session.stoppedAt = new Date().toISOString(); event('设备断开，采集结束'); }
  capturing = false; ui();
}
$('connect').onclick = async () => {
  const token = ++generation;
  connecting = true; ui(); message('请选择手机，并在手机上确认 USB 调试授权。');
  let device;
  try {
    device = await manager.requestDevice();
    if (!device || token !== generation) return;
    rawDevice = device.raw;
    const connection = await device.connect();
    if (token !== generation) { await device.raw.close(); return; }
    const transport = await AdbDaemonTransport.authenticate({ serial: device.serial, connection,
      credentialStore: new AdbWebCredentialStore('FreeForm USB Lab') });
    if (token !== generation) { await transport.close(); return; }
    const current = new Adb(transport);
    if (!current.subprocess.shellProtocol) { await current.close(); throw new Error('设备不支持 ADB shell v2；本工具需要 Android 7+ 的标准 shell 协议。'); }
    adb = current;
    message(`已连接 ${device.name || 'Android'}。先开始采集，再在手机上复现。`);
    current.disconnected.then(() => lost(), error => lost(error));
    function lost(error) {
      if (adb !== current) return;
      adb = undefined; rawDevice = undefined;
      if (capturing) session.stoppedAt = new Date().toISOString();
      capturing = false;
      event(`USB 连接断开${error ? ': ' + error.message : ''}`);
      message('设备已断开。已收到的数据仍可导出。', true); ui();
    }
  } catch (e) {
    if (token === generation) message(`连接失败：${e.message}。检查手机授权、USB 驱动或 ADB 接口占用。`, true);
    try { if (device?.raw.opened) await device.raw.close(); } catch { /* Already detached. */ }
  } finally { if (token === generation) { connecting = false; ui(); } }
};
$('disconnect').onclick = disconnect;

async function readText(stream, onText) {
  const reader = stream.getReader(), decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      onText(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode(); if (tail) onText(tail);
  } finally { reader.releaseLock(); }
}
function appendLog(chunk) {
  const next = appendBounded(session.logcat, chunk);
  session.logcat = next.text; session.droppedCharacters += next.dropped;
  session.receivedCharacters += chunk.length;
  dirty = true; liveDirty = true;
}
$('start').onclick = async () => {
  if (!adb || busy || capturePending) return;
  if (dirty && !confirm('开始新一轮将清空当前内存记录。请先导出需要保留的数据，确定继续？')) return;
  session = emptySession(); session.metadata = metadata(); session.startedAt = new Date().toISOString();
  capturePending = true; capturing = true; dirty = true; liveDirty = true; ui();
  $('result').textContent = '本轮尚未抓取。'; $('task-status').textContent = '尚未抓取。';
  const client = adb;
  event('开始 logcat；包含设备已有缓冲区，不执行 logcat -c');
  try {
    logProcess = await client.subprocess.shellProtocol.spawn('logcat -b main -b system -b events -b crash -v threadtime');
    if (!capturing || adb !== client) { await logProcess.kill(); return; }
    const proc = logProcess;
    const [,, code] = await Promise.all([
      readText(proc.stdout, appendLog),
      readText(proc.stderr, text => { session.logcatStderr = appendBounded(session.logcatStderr, text, 64000).text; }),
      proc.exited,
    ]);
    event(`logcat 结束，退出码 ${code}`);
    if (session.logcatStderr) message(`logcat 提示：${session.logcatStderr.slice(-800)}`, true);
  } catch (e) { event(`logcat 中断：${e.message}`); message(`采集结束或失败：${e.message}。已有数据可导出。`, true); }
  finally { capturePending = false; capturing = false; logProcess = undefined; session.stoppedAt = new Date().toISOString(); liveDirty = true; ui(); }
};
$('stop').onclick = async () => {
  // Keep Start disabled until both stream readers have finished.
  $('stop').disabled = true;
  try { if (logProcess) await logProcess.kill(); else message('采集正在建立连接，请稍后再停止。'); }
  catch (e) { message(`停止失败：${e.message}；可断开 USB 结束。`, true); }
};
async function run(command) {
  const record = { command, startedAt: new Date().toISOString(), stdout: '', stderr: '', exitCode: null, truncated: false, timedOut: false };
  const abort = new AbortController();
  const timeout = setTimeout(() => { record.timedOut = true; abort.abort(); }, 45000);
  let process;
  try {
    process = await adb.subprocess.shellProtocol.spawn(command, abort.signal);
    function collect(key, chunk) {
      const room = Math.max(0, OUTPUT_LIMIT - record.stdout.length - record.stderr.length);
      record[key] += chunk.slice(0, room);
      if (chunk.length > room) record.truncated = true;
    }
    const [,, exitCode] = await Promise.all([readText(process.stdout, t => collect('stdout', t)), readText(process.stderr, t => collect('stderr', t)), process.exited]);
    record.exitCode = exitCode;
  } catch (e) { record.error = e.message; }
  finally {
    clearTimeout(timeout);
    if (process) { try { await process.kill(); } catch { /* Detached. */ } }
  }
  record.finishedAt = new Date().toISOString();
  session.results.push(record);
  if (session.results.length > 24) { session.results.shift(); session.discardedResults++; }
  dirty = true;
  $('result').textContent = `${command}\n退出码: ${record.exitCode ?? '无'} | 超时: ${record.timedOut} | 截断: ${record.truncated}\n${record.error || ''}\n${record.stderr}\n${record.stdout}`.slice(0, 60000);
  ui(); return record;
}
async function diagnostics(type) {
  if (!adb || busy) return;
  const pkg = session.metadata?.package || $('package').value.trim();
  if (type === 'device' && !validPackage(pkg)) { message('请输入有效的 Android 应用包名（仅字母、数字、下划线和点）。', true); return; }
  if (type === 'anr' && !confirm('DropBox 可能包含其他应用的 ANR 和敏感信息。仅本地读取，是否继续？')) return;
  busy = true; session.metadata ||= metadata(); ui();
  const client = adb;
  const commands = [...COMMANDS[type]];
  if (type === 'device') commands.push(`dumpsys package ${pkg}`);
  let failures = 0;
  try {
    for (const command of commands) {
      if (adb !== client) break;
      $('task-status').textContent = `正在执行：${command}`;
      const r = await run(command);
      if (r.error || r.exitCode !== 0 || r.timedOut || r.truncated || /permission denial|permission denied/i.test(r.stdout + r.stderr)) failures++;
    }
    $('task-status').textContent = `本组采集结束${!adb ? '（设备已断开）' : ''}；${failures} 条结果包含失败、拒绝、超时或截断。请检查导出中的全部结果。淘汰旧结果 ${session.discardedResults} 条。`;
  } catch (e) { $('task-status').textContent = `采集失败：${e.message}`; }
  finally { busy = false; ui(); }
}
document.querySelectorAll('.diagnostic').forEach(b => b.onclick = () => diagnostics(b.dataset.command));
$('mark').onclick = async () => {
  if (!adb || busy || !capturing) return;
  session.markers.push({ computerTime: new Date().toISOString(), note: '用户标记异常；下一组状态快照非原子操作' });
  dirty = true; ui(); await diagnostics('state');
};
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function name(ext) { return `freeform-usb-${session.createdAt.replace(/[:.]/g, '-')}.${ext}`; }
$('export').onclick = () => {
  if (!confirm('导出包含设备与应用日志，分享前请检查隐私。确定导出到电脑？')) return;
  download(name('json'), JSON.stringify({ ...session, exportedAt: new Date().toISOString(), stillCapturing: capturing }, null, 2), 'application/json');
};
$('export-text').onclick = () => {
  if (!confirm('导出的 logcat 可能包含隐私，确定继续？')) return;
  download(name('txt'), `# FreeForm USB Lab\n# ${JSON.stringify(session.metadata)}\n# startedAt(computer): ${session.startedAt}\n# droppedCharacters: ${session.droppedCharacters}\n# stderr: ${session.logcatStderr}\n${session.logcat}`, 'text/plain;charset=utf-8');
};
function renderLog() {
  const filter = $('filter').value.toLowerCase();
  // Bound display work independently of retained export data.
  const lines = session.logcat.slice(-200000).split('\n');
  $('live').textContent = lines.filter(line => !filter || line.toLowerCase().includes(filter)).slice(-120).join('\n') || '当前显示范围无匹配行。';
  $('live').scrollTop = $('live').scrollHeight;
  $('findings').textContent = clues(session.logcat.slice(-200000)) + (session.droppedCharacters ? '\n注意：保留区已滚动，早期证据被丢弃。请及时分轮导出。' : '');
}
$('filter').oninput = renderLog;
setInterval(() => { if (liveDirty) { liveDirty = false; renderLog(); ui(); } }, 500);
window.addEventListener('beforeunload', e => { if (dirty || connecting || adb) { e.preventDefault(); e.returnValue = ''; } });
$('commands').textContent = 'logcat -b main -b system -b events -b crash -v threadtime\n\n' + Object.entries(COMMANDS).map(([key, values]) => `${key}:\n${values.join('\n')}`).join('\n\n') + '\ndumpsys package <校验后的目标包名>';
message(!isSecureContext ? '当前不是安全上下文。请在 HTTPS 或电脑 localhost 打开。' : !manager ? '此浏览器不支持 WebUSB。请用电脑 Chrome / Edge。' : window.top !== window.self ? '请将预览在独立标签页打开，内嵌页面可能被 USB 权限策略阻止。' : '浏览器支持 WebUSB。连接手机后开始。', !manager || !isSecureContext);
ui();
