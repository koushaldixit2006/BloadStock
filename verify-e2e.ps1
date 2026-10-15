# Complete End-to-End Verification Walkthrough for BloodStock Backend

Write-Host "======================================================================"
Write-Host "0. Reseed Database to Clean Deterministic Baseline"
Write-Host "======================================================================"
npx tsx api/scripts/seed.ts

Write-Host "`n======================================================================"
Write-Host "1. Docker Compose Up / Service Health"
Write-Host "======================================================================"
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker compose up -d
} else {
  Write-Host "Docker compose skipped (running native services)"
}
$apiHealth = curl.exe -s http://localhost:3001/health
Write-Host "API Health:" $apiHealth
$optHealth = curl.exe -s http://127.0.0.1:8000/health
Write-Host "Optimizer Health:" $optHealth

Write-Host "`n======================================================================"
Write-Host "2. Login as Coordinator (Amber Heart Institute - H3)"
Write-Host "======================================================================"
'{"email":"coordinator1@bloodstock.local","password":"CoordPass123!"}' | Set-Content -Path "login.json" -NoNewline
$loginRaw = curl.exe -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d "@login.json"
Remove-Item -Path "login.json" -Force -ErrorAction SilentlyContinue
Write-Host $loginRaw

$loginJson = $loginRaw | ConvertFrom-Json
$coordToken = $loginJson.accessToken

Write-Host "`n======================================================================"
Write-Host "3. Create CRITICAL O- Platelet Request at Amber Heart (H3)"
Write-Host "======================================================================"
'{"hospitalId":"H3","component":"PLATELETS","group":"O-","unitsNeeded":1,"neededBy":"2026-10-15T10:00:00.000Z","urgency":"CRITICAL","clinicalContext":"Acute microvascular bleeding post-coronary intervention"}' | Set-Content -Path "req.json" -NoNewline
$createRaw = curl.exe -s -X POST http://localhost:3001/api/v1/requests -H "Authorization: Bearer $coordToken" -H "Content-Type: application/json" -d "@req.json"
Remove-Item -Path "req.json" -Force -ErrorAction SilentlyContinue
Write-Host $createRaw

$createJson = $createRaw | ConvertFrom-Json
$requestId = $createJson.id
Write-Host "`nCreated Request ID: $requestId"

Write-Host "`n======================================================================"
Write-Host "4. POST /requests/$requestId/recommendations (Observe Infeasible Near & Feasible Far)"
Write-Host "======================================================================"
$recRaw = curl.exe -s -X POST "http://localhost:3001/api/v1/requests/$requestId/recommendations" -H "Authorization: Bearer $coordToken"
Write-Host $recRaw

$recJson = $recRaw | ConvertFrom-Json
$planId = $recJson.planId
Write-Host "`nComputed Plan ID: $planId"
Write-Host "Allocated Units:" ($recJson.assignments[0].allocatedUnitIds -join ", ")
Write-Host "Explanation:" $recJson.assignments[0].explanation

Write-Host "`n======================================================================"
Write-Host "5. POST /reservations/commit (Commit Plan with Idempotency Key)"
Write-Host "======================================================================"
"{`"planId`":`"$planId`",`"idempotencyKey`":`"e2e-key-001`"}" | Set-Content -Path "commit.json" -NoNewline
$commitRaw = curl.exe -s -X POST http://localhost:3001/api/v1/reservations/commit -H "Authorization: Bearer $coordToken" -H "Content-Type: application/json" -d "@commit.json"
Remove-Item -Path "commit.json" -Force -ErrorAction SilentlyContinue
Write-Host $commitRaw

Write-Host "`n======================================================================"
Write-Host "6. Try Committing Same Unit Again (Expect 409 Conflict)"
Write-Host "======================================================================"
"{`"planId`":`"$planId`",`"idempotencyKey`":`"e2e-key-002-collision`"}" | Set-Content -Path "commit_fail.json" -NoNewline
$conflictRaw = curl.exe -s -w "`nHTTP_STATUS:%{http_code}" -X POST http://localhost:3001/api/v1/reservations/commit -H "Authorization: Bearer $coordToken" -H "Content-Type: application/json" -d "@commit_fail.json"
Remove-Item -Path "commit_fail.json" -Force -ErrorAction SilentlyContinue
Write-Host $conflictRaw

Write-Host "`n======================================================================"
Write-Host "7. Login as Admin"
Write-Host "======================================================================"
'{"email":"admin@bloodstock.local","password":"AdminPass123!"}' | Set-Content -Path "admin_login.json" -NoNewline
$adminLoginRaw = curl.exe -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d "@admin_login.json"
Remove-Item -Path "admin_login.json" -Force -ErrorAction SilentlyContinue
Write-Host $adminLoginRaw

$adminLoginJson = $adminLoginRaw | ConvertFrom-Json
$adminToken = $adminLoginJson.accessToken

Write-Host "`n======================================================================"
Write-Host "8. POST /scenarios/transport-failure on Route H5 -> H3"
Write-Host "======================================================================"
'{"fromId":"H5","toId":"H3","down":true}' | Set-Content -Path "scenario.json" -NoNewline
$scenarioRaw = curl.exe -s -X POST http://localhost:3001/api/v1/scenarios/transport-failure -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" -d "@scenario.json"
Remove-Item -Path "scenario.json" -Force -ErrorAction SilentlyContinue
Write-Host $scenarioRaw

Write-Host "`n======================================================================"
Write-Host "9. GET /audit/verify (Valid Chain Before Tamper)"
Write-Host "======================================================================"
$verifyBefore = curl.exe -s http://localhost:3001/api/v1/audit/verify
Write-Host $verifyBefore

Write-Host "`n======================================================================"
Write-Host "10. Tamper One Audit Event in MongoDB -> /audit/verify Reports Broken Event"
Write-Host "======================================================================"
# Tamper seq: 1 in Mongo
node api/scripts/tamper.js
Start-Sleep -Seconds 1
$verifyTampered = curl.exe -s http://localhost:3001/api/v1/audit/verify
Write-Host "Tampered Verification Result:" $verifyTampered

# Restore seq: 1
node api/scripts/restore.js
Start-Sleep -Seconds 1
$verifyRestored = curl.exe -s http://localhost:3001/api/v1/audit/verify
Write-Host "Restored Verification Result:" $verifyRestored

Write-Host "`n======================================================================"
Write-Host "11. Stop Optimizer Container / Service -> Fallback Baseline Engaged"
Write-Host "======================================================================"
$optPids = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $optPids) {
  Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

$fallbackRaw = curl.exe -s -X POST "http://localhost:3001/api/v1/requests/R-104/recommendations" -H "Authorization: Bearer $coordToken"
Write-Host $fallbackRaw

# Restart optimizer daemon
Start-Process -FilePath "python" -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -WorkingDirectory "e:\Inventery_Project\optimizer"
Start-Sleep -Seconds 3

Write-Host "`n======================================================================"
Write-Host "E2E Walkthrough Completed Successfully!"
Write-Host "======================================================================"
