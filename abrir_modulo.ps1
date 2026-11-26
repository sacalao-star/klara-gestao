param([string]$rota)
$running = Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue
if (-not $running) {
  Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "backend\server.js" -WorkingDirectory "C:\Users\sacal\Downloads\Klara Gestão" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
Start-Process -FilePath "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--app=http://127.0.0.1:8787/$rota"
