# Experimental Pebble-owned CNG keys only. No Codex key store access.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$key = $null
$ecdsa = $null
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $id = [string]$request.keyId
    if ($id -cnotmatch '^qp_osn_[a-f0-9-]{36}$') { throw 'Invalid Pebble key identifier' }
    $name = 'Quota Pebble device key ' + $id
    $provider = [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider
    if ($request.action -eq 'create') {
        if ([System.Security.Cryptography.CngKey]::Exists($name, $provider)) { throw 'Key already exists' }
        $parameters = New-Object System.Security.Cryptography.CngKeyCreationParameters
        $parameters.Provider = $provider
        $parameters.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
        $parameters.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Signing
        $key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256, $name, $parameters)
    } else {
        if ($request.action -notin @('public', 'sign', 'delete')) { throw 'Unsupported action' }
        $key = [System.Security.Cryptography.CngKey]::Open($name, $provider)
    }
    if ($key.ExportPolicy -ne [System.Security.Cryptography.CngExportPolicies]::None) { throw 'Unexpected export policy' }
    if ($request.action -eq 'delete') {
        $key.Delete()
        $result = @{ deleted = $true }
    } elseif ($request.action -eq 'sign') {
        $payload = [Convert]::FromBase64String([string]$request.payloadBase64)
        if ($payload.Length -lt 1 -or $payload.Length -gt 16384) { throw 'Invalid payload size' }
        $ecdsa = New-Object System.Security.Cryptography.ECDsaCng($key)
        $signature = $ecdsa.SignData($payload, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
        $result = @{ signatureP1363Base64 = [Convert]::ToBase64String($signature) }
    } else {
        $public = $key.Export([System.Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob)
        $result = @{ keyId = $id; publicBlobBase64 = [Convert]::ToBase64String($public); algorithm = 'ecdsa_p256_sha256'; protectionClass = 'os_protected_nonextractable'; exportPolicy = [int]$key.ExportPolicy }
    }
    $result | ConvertTo-Json -Compress
} catch {
    # Do not print input, payloads or detailed crypto error internals.
    [Console]::Error.WriteLine('Pebble CNG operation failed')
    exit 1
} finally {
    if ($null -ne $ecdsa) { $ecdsa.Dispose() }
    if ($null -ne $key) { $key.Dispose() }
}
