# Read-only structural probe. Never read auth.json, keys, tokens or transcripts.
param([string]$CodexRoot)
$ErrorActionPreference = 'Stop'
if (-not $CodexRoot) {
  $CodexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' }
}
$report = [ordered]@{ schemaVersion = 1; check = 'codex-enrollment-structure'; stateReadable = $false; error = ''; remoteFieldNames = @(); enrollmentContainer = 'missing'; enrollmentCount = 0; enrollments = @() }
try {
  $statePath = Join-Path $CodexRoot '.codex-global-state.json'
  if ((Get-Item -LiteralPath $statePath).Length -gt 8388608) { throw 'STATE_TOO_LARGE' }
  $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  $report.stateReadable = $true
  $report.remoteFieldNames = @($state.PSObject.Properties.Name | Where-Object { $_ -match 'remote|enroll' } | Select-Object -First 40)
  $property = $state.PSObject.Properties['electron-remote-control-client-enrollments']
  if ($null -ne $property -and $null -ne $property.Value) {
    $container = $property.Value
    $report.enrollmentContainer = if ($container -is [Array]) { 'array' } elseif ($container -is [PSCustomObject]) { 'object' } else { 'unsupported' }
    $entries = if ($container -is [Array]) { @($container) } elseif ($container -is [PSCustomObject]) { @($container.PSObject.Properties | ForEach-Object { $_.Value }) } else { @() }
    $report.enrollmentCount = @($entries).Count
    $report.enrollments = @($entries | Select-Object -First 5 | ForEach-Object {
      [ordered]@{
        fieldNames = @($_.PSObject.Properties.Name | Select-Object -First 30)
        hasAccountUserId = ($_.accountUserId -is [string] -and $_.accountUserId.Length -gt 0)
        hasClientId = ($_.clientId -is [string] -and $_.clientId.Length -gt 0)
        expectedAlgorithm = ($_.algorithm -eq 'ecdsa_p256_sha256')
        expectedProtection = ($_.protectionClass -eq 'os_protected_nonextractable')
        expectedKeyIdFormat = ($_.keyId -is [string] -and $_.keyId -cmatch '^dk_osn_[A-Za-z0-9_-]{43}$')
        hasPublicKey = ($_.publicKeySpkiDerBase64 -is [string] -and $_.publicKeySpkiDerBase64.Length -gt 0)
      }
    })
  }
} catch {
  $report.error = if ($_.Exception.Message -eq 'STATE_TOO_LARGE') { 'STATE_TOO_LARGE' } else { 'STATE_READ_OR_PARSE_FAILED' }
}
$report | ConvertTo-Json -Depth 7
