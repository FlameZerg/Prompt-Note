param([string]$Executable = 'src-tauri/target/release/Prompt Note.exe')
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $Executable).Path
# 按完整路径隔离本次验收，不把其他目录中的同名程序计入或结束。
function Get-TargetInstance {
    @(Get-Process | Where-Object { $_.Path -eq $target })
}
if (@(Get-TargetInstance).Count -ne 0) {
    throw '目标应用已经运行；为避免干扰现有实例，本次验收未启动任何进程。'
}
$first = $null
$second = $null
try {
    $first = Start-Process -FilePath $target -WindowStyle Hidden -PassThru
    if (!$first.WaitForInputIdle(30000)) { throw '首个应用未能及时进入窗口消息循环。' }
    $first.Refresh()
    if ($first.HasExited) { throw '首个应用启动失败。' }
    $second = Start-Process -FilePath $target -WindowStyle Hidden -PassThru
    if (!$second.WaitForExit(15000)) { throw '第二次启动未按单实例规则退出。' }
    if ($second.ExitCode -ne 0) { throw "第二次启动异常退出：$($second.ExitCode)" }
    $first.Refresh()
    if ($first.HasExited) { throw '原应用实例意外退出。' }
    $instances = @(Get-TargetInstance)
    if ($instances.Count -ne 1 -or $instances[0].Id -ne $first.Id) {
        throw '进程检查失败：应仅保留首个 Prompt Note 实例。'
    }
    Write-Output '原生单实例检查通过：重复启动退出，首个应用保持运行。'
} finally {
    # 仅清理本测试通过完整路径启动的进程，不按名称结束其他用户进程。
    foreach ($process in @($second, $first)) {
        if ($null -ne $process) {
            $process.Refresh()
            if (!$process.HasExited) { Stop-Process -Id $process.Id }
        }
    }
}
