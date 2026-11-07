# Requires PowerShell 7. Research only: official relay, existing auth, metadata only.
param([switch]$Live,[switch]$SelfTest,[ValidatePattern('^[A-Za-z0-9-]{1,100}$')][string]$HostName='',[ValidateLength(0,160)][string]$TaskTitle='')
$ErrorActionPreference='Stop'
function Clean-Text($value,[int]$limit=160){if($value -isnot [string]){return ''};return ($value -replace '[\x00-\x1f\x7f]',' ').Substring(0,[Math]::Min($limit,$value.Length))}
function Read-InstanceMetadata($data){
 if($data -isnot [array]){throw 'UNSUPPORTED_SCHEMA'};if($data.Count -eq 0 -or $null -eq $data[0]){return ,@()}
 $rows=@();foreach($v in @($data[0])){if($v -isnot [array] -or $v.Count -lt 3 -or $v[0] -isnot [string] -or $v[0] -notmatch '^[A-Za-z0-9_-]{1,160}$'){throw 'UNSUPPORTED_INSTANCE_SCHEMA'}
  $rows+=@{id=$v[0];name=(Clean-Text $v[1][0] 100);status=[int]$v[2];version=(Clean-Text $v[1][1] 40)}
 };return ,$rows
}
function Read-TaskMetadata($summary,[string]$title){
 if($null -eq $summary -or $summary -is [string] -or $summary -is [array]){throw 'UNSUPPORTED_TASK_SCHEMA'}
 $rows=@();$properties=@($summary.PSObject.Properties);foreach($p in $properties|Select-Object -First 100){$v=$p.Value;$status=switch($v.status){'CASCADE_RUN_STATUS_RUNNING'{'running'}'CASCADE_RUN_STATUS_IDLE'{'idle'}default{'unknown'}}
  $rows+=@{title=(Clean-Text $v.summary);status=$status}
 };return @{count=$rows.Count;partial=($properties.Count -gt 100);counts=@{running=@($rows|Where-Object status -eq 'running').Count;idle=@($rows|Where-Object status -eq 'idle').Count;unknown=@($rows|Where-Object status -eq 'unknown').Count};target=@($rows|Where-Object title -eq $title)}
}
if($SelfTest){
 $list=ConvertFrom-Json -InputObject '[[["fixture-host",["Work PC","2.29.0-v2"],1]]]' -NoEnumerate
 $instances=Read-InstanceMetadata $list;if($instances.Count -ne 1 -or $instances[0].name -ne 'Work PC'){throw 'INSTANCE_TEST_FAILED'}
 $summary=ConvertFrom-Json '{"a":{"summary":"Test","status":"CASCADE_RUN_STATUS_RUNNING","prompt":"PRIVATE_SECRET"},"b":{"summary":"Other","status":"CASCADE_RUN_STATUS_IDLE"},"c":{"summary":"Future","status":"FUTURE"}}'
 $result=Read-TaskMetadata $summary 'Test';if($result.count -ne 3 -or $result.counts.running -ne 1 -or $result.counts.unknown -ne 1 -or ($result|ConvertTo-Json -Depth 5) -match 'PRIVATE_SECRET'){throw 'TASK_TEST_FAILED'}
 try{Read-InstanceMetadata 'bad';throw 'TEST_FAILED'}catch{if($_.Exception.Message -ne 'UNSUPPORTED_SCHEMA'){throw}}
 'PASS: instance metadata, task states, unsupported schema and content redaction; no credentials or network used.';exit
}
if(-not $Live){throw 'Pass -Live to read existing authorized remote metadata, or -SelfTest for offline validation.'}
if(-not $HostName){throw 'HostName is required for -Live; use the known computer hostname.'}
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public class PebbleAgReadOnlyCredential {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Cred { public int Flags,Type; public string TargetName,Comment; public long LastWritten; public int Size; public IntPtr Blob; public int Persist,Count;public IntPtr Attr;public string Alias,User; }
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ReadNative(string target,int type,int flags,out IntPtr value);
 [DllImport("advapi32.dll")] static extern void CredFree(IntPtr value);
 public static string Read(){IntPtr p;if(!ReadNative("gemini:antigravity",1,0,out p))return null;try{var c=(Cred)Marshal.PtrToStructure(p,typeof(Cred));if(c.Size>131072)return null;var b=new byte[c.Size];Marshal.Copy(c.Blob,b,0,c.Size);var u=Encoding.UTF8.GetString(b);return u.TrimStart().StartsWith("{")?u:Encoding.Unicode.GetString(b);}finally{CredFree(p);}}
}
"@
$taskClient=$null
try {
 $taskRaw=[PebbleAgReadOnlyCredential]::Read();if(-not $taskRaw){throw 'AUTH_UNAVAILABLE'}
 $taskAuth=ConvertFrom-Json -InputObject $taskRaw;$taskToken=$taskAuth.token
 if($taskToken.access_token -isnot [string] -or -not $taskToken.access_token.StartsWith('ya29.')){throw 'AUTH_UNSUPPORTED'}
 if(-not $taskToken.expiry -or [DateTimeOffset]::Parse($taskToken.expiry) -le [DateTimeOffset]::UtcNow){throw 'AUTH_EXPIRED'}
 $taskHandler=[Net.Http.HttpClientHandler]::new();$taskHandler.AllowAutoRedirect=$false
 $taskClient=[Net.Http.HttpClient]::new($taskHandler);$taskClient.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$taskToken.access_token)
 function Invoke-ReadRpc([ValidateSet('ListInstances','ProxyCommand')][string]$method,$body){
  if($method -eq 'ProxyCommand' -and ($body.Count -ne 3 -or $body[0] -notin $script:taskAllowedIds -or $body[1] -ne '/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories' -or $body[2] -ne 'e30=')){throw 'METHOD_NOT_ALLOWED'}
  $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,('https://antigravity.google.com/$rpc/devtools_jetski_boq_api_proto.ApiService/'+$method))
  $request.Content=[Net.Http.StringContent]::new((ConvertTo-Json -InputObject $body -Compress -Depth 5),[Text.Encoding]::UTF8,'application/json+protobuf')
  $cancel=[Threading.CancellationTokenSource]::new(20000);$response=$null;$stream=$null;$memory=[IO.MemoryStream]::new()
  try{
   $response=$taskClient.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cancel.Token).GetAwaiter().GetResult()
   if(-not $response.IsSuccessStatusCode){throw ('REMOTE_HTTP_'+[int]$response.StatusCode)}
   if($response.Content.Headers.ContentLength -gt 1048576){throw 'RESPONSE_LIMIT'}
   $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();$buffer=[byte[]]::new(8192)
   while(($n=$stream.ReadAsync($buffer,0,$buffer.Length,$cancel.Token).GetAwaiter().GetResult()) -gt 0){if($memory.Length+$n -gt 1048576){throw 'RESPONSE_LIMIT'};$memory.Write($buffer,0,$n)}
   $decoded=ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString($memory.ToArray())) -NoEnumerate
   return ,$decoded
  }finally{if($null -ne $stream){$stream.Dispose()};if($null -ne $response){$response.Dispose()};$request.Dispose();$cancel.Dispose();$memory.Dispose()}
 }
 $taskInstances=Read-InstanceMetadata (Invoke-ReadRpc 'ListInstances' @())
 $script:taskAllowedIds=@($taskInstances|ForEach-Object {$_.id})
 $taskMatches=@($taskInstances|Where-Object {$_.name -like ($HostName.ToLowerInvariant()+'-*')})
 if($taskMatches.Count -ne 1){throw 'HOST_NOT_UNIQUELY_FOUND'}
 $taskHost=$taskMatches[0];if($taskHost.status -ne 1){throw 'HOST_NOT_CONNECTED'}
 $taskReply=Invoke-ReadRpc 'ProxyCommand' @($taskHost.id,'/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories','e30=')
 if($taskReply[0] -isnot [string] -or $taskReply[0].Length -gt 1398104){throw 'UNSUPPORTED_PAYLOAD'}
 $taskData=ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($taskReply[0])))
 $taskReport=Read-TaskMetadata $taskData.trajectorySummaries $TaskTitle
 @{checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');source='official-antigravity-relay';host=$taskHost.name;hostConnected=$true;tasks=$taskReport;cliStarted=$false;hooksUsed=$false;privateReceiverStarted=$false;credentialsModified=$false}|ConvertTo-Json -Depth 6
}catch{
 $reason=$_.Exception.Message;if($reason -notmatch '^[A-Z_0-9]{1,80}$'){$reason='READ_ONLY_PROBE_FAILED'}
 @{checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');error=$reason;cliStarted=$false;hooksUsed=$false;credentialsModified=$false}|ConvertTo-Json -Compress
 exit 1
}finally{if($null -ne $taskClient){$taskClient.Dispose()};$taskRaw=$null;$taskAuth=$null;$taskToken=$null}
