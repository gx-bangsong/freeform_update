# ver18：触摸转发诊断版

## 已知信息与边界

Android 11 / 一加 7T Pro，ver16 已存在，点击小窗后触发目标应用
`Input dispatching timed out ... Waited 5001ms for MotionEvent`。
这不能仅凭 CPU 列表判定是应用主线程、ROM 冻结、多显示器焦点还是输入事件问题。
ver18 修正已确认的事件转发缺陷，但不宣称已定位或消除这次 ANR。

## 改动

- Android 10+ 小窗改为通过 AIDL 传递完整 MotionEvent 的副本，不再通过仅含 action/坐标的 Bean 重建。
- 保留同一手势的 downTime、事件时间、触点 ID、actionIndex、工具类型、压力及历史事件。
- 仅按缩放比例转换坐标，不修改原始系统事件；两进程各自回收自己的副本。
- 保留异步注入模式 0；不采用等待目标应用完成处理的注入模式。
- 无效显示 ID、缩放、服务断开、设置显示 ID 失败、注入拒绝和耗时 Binder 调用输出限流日志，tag 为 FreeFormInput。不打印触摸坐标。
- AIDL 新方法追加到接口末尾，保留旧事务编号；版本号递增以重建 Shizuku user service。

## 安装与复测

升级后建议重启手机（特别是启用了 Xposed 模块的设备），确认 Shizuku/Sui 正常运行，
不要保留旧版本小窗或旧 user service。先只开一个 Via 小窗，分别测试：

1. 不触摸停留 10 秒；再单击、连续单击、滑动、双指缩放、输入文字。
2. Via 全屏下执行相同操作；再用系统设置或计算器小窗对照。
3. 记录首次卡住的动作，比较 ver16/17/18，避免同时更改省电设置影响判断。

若仍然 ANR，请在复现前开始抓取完整日志，复现后获取 bugreport：

```sh
adb logcat -v threadtime > freeform-repro.txt
# 复现后 Ctrl+C；然后：
adb shell dumpsys input > freeform-input.txt
adb shell dumpsys activity activities > freeform-activities.txt
adb bugreport freeform-anr.zip
```

查找 FreeFormInput、InputDispatcher、ActivityManager、冻结/解冻相关记录，
以及 bugreport 中对应时间的 Via main 线程堆栈。输入/Activity 转储也有助于确认焦点和虚拟显示状态。
这些资料可能包含隐私，分享前先脱敏，不必上传完整 bugreport。

## 验证

GitHub Actions 执行 assembleDebug。`MotionEventTransformTest` 是 Android instrumentation
回归测试，覆盖 Parcelable 往返后的触点身份、动作索引、时间戳、坐标和原事件不变性，
需要设备/模拟器执行 `./gradlew connectedDebugAndroidTest`；现有构建工作流不会运行它。
