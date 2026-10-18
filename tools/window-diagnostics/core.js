export const LOG_LIMIT = 8_000_000;
export const OUTPUT_LIMIT = 4_000_000;
export function appendBounded(buffer, chunk, limit = LOG_LIMIT) {
  const combined = buffer + chunk;
  const dropped = Math.max(0, combined.length - limit);
  return { text: combined.slice(dropped), dropped };
}
export function validPackage(value) {
  return /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value);
}
export const COMMANDS = {
  state: ['date "+%Y-%m-%dT%H:%M:%S%z"', 'dumpsys input', 'dumpsys window windows', 'dumpsys activity activities', 'dumpsys display'],
  device: ['date "+%Y-%m-%dT%H:%M:%S%z"', 'getprop ro.product.model', 'getprop ro.build.version.release', 'getprop ro.build.fingerprint', 'settings get secure default_input_method', 'dumpsys webviewupdate'],
  anr: ['dumpsys dropbox --print data_app_anr'],
};
export function clues(text) {
  const result = [];
  if (/Input dispatching timed out|ANR in |am_anr/i.test(text)) result.push('发现 ANR / 输入超时关键词：请核对窗口 ID 与原始时间，不能据此推定根因。');
  if (/FreeFormInput/.test(text)) result.push('发现 FreeFormInput：检查具体错误或耗时；没有此标签也不代表注入正常。');
  if (/no focused window|does not have a focused window|Focus leaving|focus.*false/i.test(text)) result.push('发现焦点线索：短暂切换不等于持续焦点缺失。');
  if (/"main".*(?:prio|tid)|DALVIK THREADS|Cmd line:/.test(text)) result.push('发现线程报告特征：需要关联同一 PID 的完整线程栈。');
  return result.length ? result.join('\n') : '暂未在保留片段中命中关键特征；这不排除 ANR。';
}
