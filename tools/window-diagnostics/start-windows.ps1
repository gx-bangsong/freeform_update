# Local static server for Windows PowerShell 5.1+. No installation or admin rights.
# Only listens on IPv4 loopback. Does not execute commands received over HTTP.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (Test-Path (Join-Path $root 'package.json')) { $root = Join-Path $root 'dist' }
$root = [IO.Path]::GetFullPath($root)
if (-not (Test-Path (Join-Path $root 'index.html'))) {
    throw 'Page missing. Extract the entire ZIP before starting.'
}
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$url = "http://localhost:$port/"
Write-Host 'FreeForm USB Lab - local only'
Write-Host "Open in desktop Chrome or Edge: $url"
Write-Host 'Keep this window open. Close it or press Ctrl+C to stop.'
try { Start-Process $url } catch { Write-Host 'Please open the address above manually.' }
try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $null
        $reader = $null
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 3000
            $stream.WriteTimeout = 10000
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $request = $reader.ReadLine()
            if (-not $request) { continue }
            $headerSize = $request.Length
            do {
                $line = $reader.ReadLine()
                if ($null -ne $line) { $headerSize += $line.Length }
                if ($headerSize -gt 16384) { throw 'Request headers too large.' }
            } while ($line)
            $parts = $request.Split(' ')
            $status = '404 Not Found'
            $type = 'text/plain; charset=utf-8'
            $body = [Text.Encoding]::UTF8.GetBytes('Not found')
            if ($parts.Length -ge 2 -and $parts[0] -eq 'GET') {
                $path = [Uri]::UnescapeDataString(($parts[1] -split '\?', 2)[0])
                if ($path -eq '/') { $path = '/index.html' }
                # Serve only the built page and its assets, never launcher source files.
                if ($path -eq '/index.html' -or $path -match '^/assets/[A-Za-z0-9_.-]+\.(js|css)$') {
                    $file = Join-Path $root $path.TrimStart('/')
                    if (Test-Path -LiteralPath $file -PathType Leaf) {
                        $body = [IO.File]::ReadAllBytes($file)
                        $status = '200 OK'
                        switch ([IO.Path]::GetExtension($file)) {
                            '.html' { $type = 'text/html; charset=utf-8' }
                            '.js' { $type = 'text/javascript; charset=utf-8' }
                            '.css' { $type = 'text/css; charset=utf-8' }
                        }
                    }
                }
            } else {
                $status = '405 Method Not Allowed'
                $body = [Text.Encoding]::UTF8.GetBytes('Only GET is supported')
            }
            $header = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`n`r`n"
            $bytes = [Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        } catch {
            Write-Host ('Request ended: ' + $_.Exception.Message)
        } finally {
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
