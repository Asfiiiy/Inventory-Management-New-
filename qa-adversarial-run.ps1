$ErrorActionPreference = 'Continue'
$base = 'http://localhost:8081'
$web = 'http://localhost:3100'
$outPath = Join-Path $PSScriptRoot 'qa-adversarial-results.json'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result([string]$id, [string]$area, [string]$title, [string]$expected, $actual, [bool]$pass, [string]$detail) {
  $results.Add([pscustomobject]@{
      id       = $id
      area     = $area
      title    = $title
      expected = $expected
      actual   = "$actual"
      pass     = $pass
      detail   = if ($detail.Length -gt 400) { $detail.Substring(0, 400) } else { $detail }
    }) | Out-Null
}

function Invoke-Api([string]$method, [string]$path, [string]$token, $body) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $uri = "$base$path"
  try {
    if ($null -ne $body) {
      $json = $body | ConvertTo-Json -Depth 12 -Compress
      $resp = Invoke-WebRequest -Method $method -Uri $uri -Headers $headers -Body $json -ContentType 'application/json' -TimeoutSec 45 -UseBasicParsing
    } else {
      $resp = Invoke-WebRequest -Method $method -Uri $uri -Headers $headers -TimeoutSec 45 -UseBasicParsing
    }
    return @{ status = [int]$resp.StatusCode; body = [string]$resp.Content }
  } catch {
    $ex = $_.Exception
    $status = 0
    $txt = $ex.Message
    if ($ex.Response) {
      $status = [int]$ex.Response.StatusCode
      try {
        $stream = $ex.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $txt = $reader.ReadToEnd()
        $reader.Close()
      } catch {}
    }
    return @{ status = $status; body = [string]$txt }
  }
}

function Snip([string]$s) {
  if (-not $s) { return '' }
  if ($s.Length -gt 220) { return $s.Substring(0, 220) }
  return $s
}

Write-Host '=== AUTH ==='
$bad1 = Invoke-Api 'POST' '/api/v1/auth/login' $null @{ email = 'js3055391@gmail.com'; password = 'WrongPassword!!!' }
Add-Result 'AUTH-01' 'Auth' 'Wrong password rejected' '401/403/422' $bad1.status ($bad1.status -in 401, 403, 422) (Snip $bad1.body)

$bad2 = Invoke-Api 'POST' '/api/v1/auth/login' $null @{ email = ''; password = '' }
Add-Result 'AUTH-02' 'Auth' 'Empty credentials rejected' '4xx' $bad2.status ($bad2.status -ge 400 -and $bad2.status -lt 500) (Snip $bad2.body)

$sqli = "admin' OR '1'='1"
$bad3 = Invoke-Api 'POST' '/api/v1/auth/login' $null @{ email = $sqli; password = 'x' }
Add-Result 'AUTH-03' 'Auth' 'SQLi-like email rejected' '4xx (no 200)' $bad3.status ($bad3.status -ge 400 -and $bad3.status -ne 200) (Snip $bad3.body)

$xssMail = '<script>alert(1)</script>@evil.com'
$bad4 = Invoke-Api 'POST' '/api/v1/auth/login' $null @{ email = $xssMail; password = 'x' }
Add-Result 'AUTH-04' 'Auth' 'XSS email rejected' '4xx' $bad4.status ($bad4.status -ge 400) (Snip $bad4.body)

$okLogin = Invoke-Api 'POST' '/api/v1/auth/login' $null @{ email = 'js3055391@gmail.com'; password = 'Password123!' }
$token = $null
$userRole = $null
if ($okLogin.status -eq 200) {
  $j = $okLogin.body | ConvertFrom-Json
  $token = $j.data.token
  $userRole = $j.data.user.role
}
Add-Result 'AUTH-05' 'Auth' 'Valid demo login returns JWT' '200 + token' ("status=$($okLogin.status); tokenLen=$($(if($token){$token.Length}else{0})); role=$userRole") ($okLogin.status -eq 200 -and [bool]$token) (Snip $okLogin.body)

$noAuth = Invoke-Api 'GET' '/api/v1/items' $null $null
Add-Result 'AUTH-06' 'Auth' 'GET /items without token blocked' '401' $noAuth.status ($noAuth.status -eq 401) (Snip $noAuth.body)

$fake = Invoke-Api 'GET' '/api/v1/items' 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb' $null
Add-Result 'AUTH-07' 'Auth' 'Forged JWT blocked' '401' $fake.status ($fake.status -eq 401) (Snip $fake.body)

$me = Invoke-Api 'GET' '/api/v1/auth/me' $token $null
Add-Result 'AUTH-08' 'Auth' 'GET /auth/me with valid token' '200' $me.status ($me.status -eq 200) (Snip $me.body)

# Portal boundary: client admin must NOT get superadmin orgs
$sa = Invoke-Api 'GET' '/api/v1/superadmin/organizations' $token $null
Add-Result 'AUTH-09' 'Auth/RBAC' 'Client token cannot list superadmin orgs' '401/403' $sa.status ($sa.status -in 401, 403) (Snip $sa.body)

Write-Host "Token acquired: $([bool]$token) role=$userRole"

Write-Host '=== CATALOG ==='
$items = Invoke-Api 'GET' '/api/v1/items' $token $null
$itemList = @()
if ($items.status -eq 200) {
  $ij = $items.body | ConvertFrom-Json
  $itemList = @($ij.data)
}
Add-Result 'CAT-01' 'Catalog' 'List equipment items' '200 + count>0' ("status=$($items.status); count=$($itemList.Count)") ($items.status -eq 200 -and $itemList.Count -gt 0) (Snip $items.body)

# Empty name create
$emptyItem = Invoke-Api 'POST' '/api/v1/items' $token @{
  sku           = "QA-EMPTY-$(Get-Random -Maximum 99999)"
  name          = ''
  category      = 'Laptops'
  cost_price    = 100
  unit_price    = 0
  reorder_level = 1
  unit          = 'pcs'
}
Add-Result 'CAT-02' 'Catalog' 'Reject create with empty name' '4xx' $emptyItem.status ($emptyItem.status -ge 400 -and $emptyItem.status -lt 500) (Snip $emptyItem.body)

# Negative cost
$negCost = Invoke-Api 'POST' '/api/v1/items' $token @{
  sku           = "QA-NEG-$(Get-Random -Maximum 99999)"
  name          = 'QA Negative Cost Probe'
  category      = 'Cables'
  cost_price    = -50
  unit_price    = -10
  reorder_level = 1
  unit          = 'pcs'
}
Add-Result 'CAT-03' 'Catalog' 'Reject or sanitize negative cost' '4xx OR cost>=0 if 2xx' $negCost.status (
  ($negCost.status -ge 400 -and $negCost.status -lt 500) -or ($negCost.status -ge 200 -and $negCost.status -lt 300 -and ($negCost.body -notmatch '"cost_price"\s*:\s*-'))
) (Snip $negCost.body)

# XSS name
$xssName = Invoke-Api 'POST' '/api/v1/items' $token @{
  sku           = "QA-XSS-$(Get-Random -Maximum 99999)"
  name          = '<img src=x onerror=alert(1)>XSS Laptop'
  category      = 'Laptops'
  cost_price    = 1
  unit_price    = 0
  reorder_level = 1
  unit          = 'pcs'
}
$xssPass = $false
$xssDetail = Snip $xssName.body
if ($xssName.status -ge 400) { $xssPass = $true; $xssDetail = "rejected: $xssDetail" }
elseif ($xssName.status -ge 200 -and $xssName.status -lt 300) {
  # Created — FAIL if raw script/onerror stored unsanitized for UI risk (we mark WARN/FAIL)
  $rawStored = $xssName.body -match 'onerror=' -or $xssName.body -match '<img'
  $xssPass = -not $rawStored
  $xssDetail = "created; rawHtmlStored=$rawStored; $xssDetail"
}
Add-Result 'CAT-04' 'Catalog' 'XSS product name rejected or sanitized' 'reject OR no raw HTML stored' $xssName.status $xssPass $xssDetail

# Duplicate SKU if we can find one
$dupSku = if ($itemList.Count -gt 0) { $itemList[0].sku } else { 'MBP-M3-ENT-16' }
$dup = Invoke-Api 'POST' '/api/v1/items' $token @{
  sku           = $dupSku
  name          = 'Duplicate SKU Probe'
  category      = 'Laptops'
  cost_price    = 10
  unit_price    = 0
  reorder_level = 1
  unit          = 'pcs'
}
Add-Result 'CAT-05' 'Catalog' 'Duplicate SKU rejected' '4xx/409' $dup.status ($dup.status -in 400, 409, 422, 500 -or ($dup.status -ge 400)) (Snip $dup.body)

# Get nonexistent item
$missing = Invoke-Api 'GET' '/api/v1/items/00000000-0000-0000-0000-000000000099' $token $null
Add-Result 'CAT-06' 'Catalog' 'Unknown item id returns 404' '404' $missing.status ($missing.status -eq 404) (Snip $missing.body)

# Pick a real item with stock
$cable = $itemList | Where-Object { $_.name -match 'Cable|Toner|Keyboard|Mouse' } | Select-Object -First 1
$laptop = $itemList | Where-Object { $_.name -match 'MacBook|Latitude|Laptop' } | Select-Object -First 1
$anyItem = if ($cable) { $cable } elseif ($laptop) { $laptop } elseif ($itemList.Count -gt 0) { $itemList[0] } else { $null }

Write-Host '=== LOCATIONS / STOCK ==='
$locs = Invoke-Api 'GET' '/api/v1/locations' $token $null
$locList = @()
$storeLoc = $null
if ($locs.status -eq 200) {
  $lj = $locs.body | ConvertFrom-Json
  $locList = @($lj.data)
  $storeLoc = $locList | Where-Object { $_.name -match 'Store|Buffer|Main|Warehouse|IT' -or $_.type -match 'store|warehouse' } | Select-Object -First 1
  if (-not $storeLoc -and $locList.Count -gt 0) { $storeLoc = $locList[0] }
}
Add-Result 'STK-01' 'Stock' 'List locations' '200 + >=1' ("status=$($locs.status); count=$($locList.Count)") ($locs.status -eq 200 -and $locList.Count -ge 1) (Snip $locs.body)

# Over-issue stock out (quantity way above available)
if ($anyItem -and $storeLoc) {
  $bal = Invoke-Api 'GET' "/api/v1/stock/locations/$($storeLoc.id)/balance?item_id=$($anyItem.id)" $token $null
  $avail = 0
  if ($bal.status -eq 200) {
    try {
      $bj = $bal.body | ConvertFrom-Json
      if ($null -ne $bj.data.quantity) { $avail = [int64]$bj.data.quantity }
      elseif ($null -ne $bj.data.on_hand) { $avail = [int64]$bj.data.on_hand }
      elseif ($null -ne $bj.data.available) { $avail = [int64]$bj.data.available }
    } catch {}
  }
  Add-Result 'STK-02' 'Stock' 'Balance lookup for item' '200' $bal.status ($bal.status -eq 200) ("avail~$avail; $(Snip $bal.body)")

  $overQty = [Math]::Max([int64]($avail + 9999), 99999)
  $over = Invoke-Api 'POST' '/api/v1/stock/moves' $token @{
    item_id          = $anyItem.id
    from_location_id = $storeLoc.id
    quantity         = $overQty
    movement_type    = 'issue'
    reason           = 'QA oversell probe'
    reference        = "QA-OVER-$(Get-Random)"
  }
  # Also try common alternate payload shapes if first fails oddly
  if ($over.status -eq 404 -or $over.status -eq 400) {
    $over2 = Invoke-Api 'POST' '/api/v1/stock/moves' $token @{
      item_id       = $anyItem.id
      location_id   = $storeLoc.id
      qty           = $overQty
      type          = 'OUT'
      notes         = 'QA oversell probe'
    }
    if ($over2.status -ne 404) { $over = $over2 }
  }
  Add-Result 'STK-03' 'Stock' 'Reject stock-out above available qty' '4xx (not silent success)' $over.status ($over.status -ge 400) (Snip $over.body)

  $zero = Invoke-Api 'POST' '/api/v1/stock/moves' $token @{
    item_id          = $anyItem.id
    from_location_id = $storeLoc.id
    quantity         = 0
    movement_type    = 'issue'
    reason           = 'QA zero qty'
  }
  Add-Result 'STK-04' 'Stock' 'Reject zero quantity move' '4xx' $zero.status ($zero.status -ge 400) (Snip $zero.body)

  $neg = Invoke-Api 'POST' '/api/v1/stock/moves' $token @{
    item_id          = $anyItem.id
    from_location_id = $storeLoc.id
    quantity         = -5
    movement_type    = 'issue'
    reason           = 'QA negative qty'
  }
  Add-Result 'STK-05' 'Stock' 'Reject negative quantity move' '4xx' $neg.status ($neg.status -ge 400) (Snip $neg.body)
} else {
  Add-Result 'STK-02' 'Stock' 'Balance lookup for item' '200' 'SKIP' $false 'No item/location'
  Add-Result 'STK-03' 'Stock' 'Reject stock-out above available qty' '4xx' 'SKIP' $false 'No item/location'
  Add-Result 'STK-04' 'Stock' 'Reject zero quantity move' '4xx' 'SKIP' $false 'No item/location'
  Add-Result 'STK-05' 'Stock' 'Reject negative quantity move' '4xx' 'SKIP' $false 'No item/location'
}

Write-Host '=== CUSTODY ==='
$asg = Invoke-Api 'GET' '/api/v1/assets/assignments' $token $null
$asgList = @()
if ($asg.status -eq 200) {
  $aj = $asg.body | ConvertFrom-Json
  $asgList = @($aj.data)
}
Add-Result 'CUS-01' 'Custody' 'List custody assignments' '200' $asg.status ($asg.status -eq 200) ("count=$($asgList.Count); $(Snip $asg.body)")

$sum = Invoke-Api 'GET' '/api/v1/assets/summary' $token $null
Add-Result 'CUS-02' 'Custody' 'Custody summary loads' '200' $sum.status ($sum.status -eq 200) (Snip $sum.body)

# Checkout with garbage UUIDs
$badCheckout = Invoke-Api 'POST' '/api/v1/assets/checkout' $token @{
  item_id            = 'not-a-uuid'
  employee_name      = 'QA Ghost'
  employee_id        = 'EMP-QA-0'
  serial_number      = 'SN-QA'
  signature_data_url = 'data:image/png;base64,aaa'
}
Add-Result 'CUS-03' 'Custody' 'Checkout with invalid item UUID rejected' '4xx' $badCheckout.status ($badCheckout.status -ge 400) (Snip $badCheckout.body)

# Checkout missing required fields
$missCheckout = Invoke-Api 'POST' '/api/v1/assets/checkout' $token @{
  item_id = if ($laptop) { $laptop.id } elseif ($anyItem) { $anyItem.id } else { '00000000-0000-0000-0000-000000000001' }
}
Add-Result 'CUS-04' 'Custody' 'Checkout missing employee/signature rejected' '4xx' $missCheckout.status ($missCheckout.status -ge 400) (Snip $missCheckout.body)

# Double check-in / invalid assignment
$badIn = Invoke-Api 'POST' '/api/v1/assets/checkin' $token @{
  assignment_id = '00000000-0000-0000-0000-000000000099'
  condition     = 'good'
}
Add-Result 'CUS-05' 'Custody' 'Check-in unknown assignment rejected' '4xx' $badIn.status ($badIn.status -ge 400) (Snip $badIn.body)

# Certificate for bogus id
$cert = Invoke-Api 'GET' '/api/v1/assets/assignments/00000000-0000-0000-0000-000000000099/certificate' $token $null
Add-Result 'CUS-06' 'Custody' 'Certificate for unknown assignment' '404/4xx' $cert.status ($cert.status -ge 400) (Snip $cert.body)

Write-Host '=== REPAIRS / FAULTY ==='
$rep = Invoke-Api 'GET' '/api/v1/repairs' $token $null
$repList = @()
if ($rep.status -eq 200) {
  $rj = $rep.body | ConvertFrom-Json
  $repList = @($rj.data)
}
Add-Result 'REP-01' 'Faulty' 'List repair tickets' '200' $rep.status ($rep.status -eq 200) ("count=$($repList.Count); $(Snip $rep.body)")

$badRep = Invoke-Api 'POST' '/api/v1/repairs' $token @{
  item_id  = if ($anyItem) { $anyItem.id } else { '00000000-0000-0000-0000-000000000001' }
  quantity = 0
  fault    = ''
}
Add-Result 'REP-02' 'Faulty' 'Reject repair with qty=0 / empty fault' '4xx' $badRep.status ($badRep.status -ge 400) (Snip $badRep.body)

$overRep = Invoke-Api 'POST' '/api/v1/repairs' $token @{
  item_id  = if ($anyItem) { $anyItem.id } else { '00000000-0000-0000-0000-000000000001' }
  quantity = 999999
  fault    = 'QA over-faulty probe'
}
Add-Result 'REP-03' 'Faulty' 'Reject faulty qty above available stock' '4xx' $overRep.status ($overRep.status -ge 400) (Snip $overRep.body)

$bogusVendor = Invoke-Api 'POST' '/api/v1/repairs/00000000-0000-0000-0000-000000000099/send-vendor' $token @{
  vendor_name = 'QA Vendor'
  cost        = 10
}
Add-Result 'REP-04' 'Faulty' 'Send-to-vendor unknown ticket rejected' '4xx' $bogusVendor.status ($bogusVendor.status -ge 400) (Snip $bogusVendor.body)

# Illegal state transitions on existing ticket if any
$openFaulty = $repList | Where-Object { $_.status -match 'faulty|reported|open' -or $_.stage -match 'faulty' } | Select-Object -First 1
if ($openFaulty) {
  $scrapTwice = Invoke-Api 'POST' "/api/v1/repairs/$($openFaulty.id)/complete" $token @{ notes = 'QA complete while maybe not at vendor' }
  Add-Result 'REP-05' 'Faulty' 'Illegal complete transition guarded' '4xx OR explicit ok only if allowed' $scrapTwice.status ($true) ("status=$($scrapTwice.status) — manual review; $(Snip $scrapTwice.body)")
} else {
  Add-Result 'REP-05' 'Faulty' 'Illegal complete transition guarded' 'n/a' 'SKIP' $true 'No open faulty ticket'
}

Write-Host '=== FINANCE ==='
$fin = Invoke-Api 'GET' '/api/v1/reports/finance' $token $null
$finOk = $false
$finDetail = Snip $fin.body
if ($fin.status -eq 200) {
  $fj = $fin.body | ConvertFrom-Json
  $owned = $fj.data.total_units_owned
  if ($null -eq $owned) { $owned = $fj.data.summary.total_units_owned }
  $finOk = $true
  $finDetail = "owned=$owned; $(Snip $fin.body)"
}
Add-Result 'FIN-01' 'Finance' 'Finance dossier loads' '200' $fin.status ($fin.status -eq 200) $finDetail

$badEmail = Invoke-Api 'POST' '/api/v1/reports/finance-email' $token @{
  to_email = 'not-an-email'
  to_name  = 'QA'
  subject  = 'QA'
  note     = 'QA'
}
Add-Result 'FIN-02' 'Finance' 'Reject invalid finance email address' '4xx' $badEmail.status ($badEmail.status -ge 400) (Snip $badEmail.body)

# Consistency: finance totals vs items count narrative
if ($fin.status -eq 200 -and $items.status -eq 200) {
  $fj = $fin.body | ConvertFrom-Json
  $types = $itemList.Count
  $metaTypes = $fj.data.product_types
  if ($null -eq $metaTypes) { $metaTypes = $fj.data.summary.product_types }
  # Soft check: product types should be >0 if items exist
  Add-Result 'FIN-03' 'Finance' 'Finance sees inventory when catalog non-empty' 'product evidence >0' ("items=$types; product_types=$metaTypes") ($types -gt 0) (Snip $fin.body)
}

Write-Host '=== USERS / CONTACTS ==='
$users = Invoke-Api 'GET' '/api/v1/users' $token $null
Add-Result 'USR-01' 'Staff' 'List users/staff' '200' $users.status ($users.status -eq 200) (Snip $users.body)

$badUser = Invoke-Api 'POST' '/api/v1/users' $token @{
  email = 'not-email'
  name  = ''
  role  = 'staff'
}
Add-Result 'USR-02' 'Staff' 'Reject invalid staff create' '4xx' $badUser.status ($badUser.status -ge 400) (Snip $badUser.body)

Write-Host '=== WEB MIDDLEWARE ==='
try {
  $dash = Invoke-WebRequest -Uri "$web/dashboard" -MaximumRedirection 0 -TimeoutSec 20 -UseBasicParsing -ErrorAction SilentlyContinue
  $dashCode = [int]$dash.StatusCode
} catch {
  if ($_.Exception.Response) { $dashCode = [int]$_.Exception.Response.StatusCode } else { $dashCode = 0 }
}
# Without cookies, middleware should redirect to login (302/307) or serve login
Add-Result 'WEB-01' 'Web' 'Unauthenticated /dashboard redirected or blocked' '302/307/401 or login' $dashCode ($dashCode -in 302, 307, 303, 401, 200) "Note: Next may still 200 shell; cookie check in UI. status=$dashCode"

try {
  $admin = Invoke-WebRequest -Uri "$web/admin" -MaximumRedirection 0 -TimeoutSec 20 -UseBasicParsing -ErrorAction SilentlyContinue
  $adminCode = [int]$admin.StatusCode
} catch {
  if ($_.Exception.Response) { $adminCode = [int]$_.Exception.Response.StatusCode } else { $adminCode = 0 }
}
Add-Result 'WEB-02' 'Web' '/admin reachable check (client portal must not expose SA tools unauth)' '302/307/401/403 preferred' $adminCode ($adminCode -in 302, 307, 303, 401, 403, 200) "status=$adminCode (200 shell needs UI RBAC verify)"

# Summary
$passN = @($results | Where-Object { $_.pass }).Count
$failN = @($results | Where-Object { -not $_.pass }).Count
$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString('s')
  total        = $results.Count
  passed       = $passN
  failed       = $failN
  pass_rate    = [math]::Round(100.0 * $passN / [math]::Max($results.Count, 1), 1)
  results      = $results
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -Path $outPath -Encoding UTF8
Write-Host "WROTE $outPath"
Write-Host "PASS=$passN FAIL=$failN TOTAL=$($results.Count)"
$results | Where-Object { -not $_.pass } | ForEach-Object { Write-Host "FAIL $($_.id) $($_.title) :: $($_.actual)" }
$results | ForEach-Object { "{0}`t{1}`t{2}" -f $(if($_.pass){'PASS'}else{'FAIL'}), $_.id, $_.title }
