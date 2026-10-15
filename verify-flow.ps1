# Verification Flow Script for Phase 4 & 5

Write-Host "======================================================================"
Write-Host "1. Docker Compose Up"
Write-Host "======================================================================"
try {
  docker compose up -d
} catch {
  Write-Host $_
}

Write-Host "`n======================================================================"
Write-Host "2. Login as coordinator1 (Amber Heart Institute - H3)"
Write-Host "======================================================================"
'{"email":"coordinator1@bloodstock.local","password":"CoordPass123!"}' | Set-Content -Path "login.json" -NoNewline
$loginRaw = curl.exe -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d "@login.json"
Remove-Item -Path "login.json" -Force -ErrorAction SilentlyContinue
Write-Host $loginRaw

$loginJson = $loginRaw | ConvertFrom-Json
$token = $loginJson.accessToken

Write-Host "`n======================================================================"
Write-Host "3. Create Seeded-Style CRITICAL Request at Amber Heart (H3)"
Write-Host "======================================================================"
'{"hospitalId":"H3","component":"PLATELETS","group":"O-","unitsNeeded":1,"neededBy":"2026-10-15T10:00:00.000Z","urgency":"CRITICAL","clinicalContext":"Acute microvascular surgical hemorrhage post-cardiac bypass"}' | Set-Content -Path "req.json" -NoNewline
$createRaw = curl.exe -s -X POST http://localhost:3001/api/v1/requests -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@req.json"
Remove-Item -Path "req.json" -Force -ErrorAction SilentlyContinue
Write-Host $createRaw

$createJson = $createRaw | ConvertFrom-Json
$requestId = $createJson.id
Write-Host "`nCreated Request ID: $requestId"

Write-Host "`n======================================================================"
Write-Host "4. POST /requests/$requestId/recommendations (Optimizer Active)"
Write-Host "======================================================================"
$recRaw = curl.exe -s -X POST "http://localhost:3001/api/v1/requests/$requestId/recommendations" -H "Authorization: Bearer $token"
Write-Host $recRaw

Write-Host "`n======================================================================"
Write-Host "5. Docker Compose Stop Optimizer"
Write-Host "======================================================================"
try {
  docker compose stop optimizer
} catch {
  Write-Host $_
}

# Stop local optimizer process on port 8000 to simulate container shutdown
$pids = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $pids) {
  Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
Write-Host "Optimizer service offline."

Write-Host "`n======================================================================"
Write-Host "6. POST /requests/$requestId/recommendations (Fallback Baseline)"
Write-Host "======================================================================"
$fallbackRaw = curl.exe -s -X POST "http://localhost:3001/api/v1/requests/$requestId/recommendations" -H "Authorization: Bearer $token"
Write-Host $fallbackRaw

Write-Host "`n======================================================================"
Write-Host "7. Docker Compose Start Optimizer"
Write-Host "======================================================================"
try {
  docker compose start optimizer
} catch {
  Write-Host $_
}

# Restart local optimizer daemon
Start-Process -FilePath "python" -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -WorkingDirectory "e:\Inventery_Project\optimizer"
Start-Sleep -Seconds 3
Write-Host "Optimizer service restarted and online."
