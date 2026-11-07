# Official relay metadata only. Windows PowerShell 5.1; never exports auth to parent process.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Web.Extensions
$script:json=[System.Web.Script.Serialization.JavaScriptSerializer]::new()
$script:json.MaxJsonLength=1048576
$script:json.RecursionLimit=64
function Read-Json([string]$text){return ,$script:json.DeserializeObject($text)}
function Clean([object]$v,[int]$n=160){if($v -isnot [string]){return ''};$s=$v -replace '[\x00-\x1f\x7f]',' ';return $s.Substring(0,[Math]::Min($s.Length,$n))}
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
$script:retryAfterMs=0
try {
 $taskRaw=[PebbleAgReadOnlyCredential]::Read();if(-not $taskRaw){throw 'AUTH_UNAVAILABLE'}
 $taskAuth=Read-Json $taskRaw;$taskToken=$taskAuth.token
 if($taskToken.access_token -isnot [string] -or -not $taskToken.access_token.StartsWith('ya29.')){throw 'AUTH_UNSUPPORTED'}
 if(-not $taskToken.expiry -or [DateTimeOffset]::Parse($taskToken.expiry) -le [DateTimeOffset]::UtcNow){throw 'AUTH_EXPIRED'}
 $sha=[Security.Cryptography.SHA256]::Create();try{$identity=if($taskAuth.id_token_email){[string]$taskAuth.id_token_email}else{[string]$taskToken.access_token};$accountKey=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity)))).Replace('-','').Substring(0,20)}finally{$sha.Dispose()}
 $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false;$taskClient=[Net.Http.HttpClient]::new($handler)
 $taskClient.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$taskToken.access_token)
 function Invoke-ReadRpc([ValidateSet('ListInstances','ProxyCommand')][string]$method,$body){
  if($method -eq 'ProxyCommand' -and ($body.Count -ne 3 -or $body[0] -notin $script:allowedIds -or $body[1] -ne '/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories' -or $body[2] -ne 'e30=')){throw 'METHOD_NOT_ALLOWED'}
  $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,('https://antigravity.google.com/$rpc/devtools_jetski_boq_api_proto.ApiService/'+$method))
  $request.Content=[Net.Http.StringContent]::new((ConvertTo-Json -InputObject $body -Compress -Depth 5),[Text.Encoding]::UTF8,'application/json+protobuf')
  $cancel=[Threading.CancellationTokenSource]::new(8000);$response=$null;$stream=$null;$memory=[IO.MemoryStream]::new()
  try{
   $response=$taskClient.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cancel.Token).GetAwaiter().GetResult()
   if(-not $response.IsSuccessStatusCode){if([int]$response.StatusCode -eq 429){$after=$response.Headers.RetryAfter;$delay=60000;if($null -ne $after.Delta){$delay=[Math]::Max($delay,$after.Delta.TotalMilliseconds)}elseif($null -ne $after.Date){$delay=[Math]::Max($delay,($after.Date-[DateTimeOffset]::UtcNow).TotalMilliseconds)};$script:retryAfterMs=$delay};throw ('REMOTE_HTTP_'+[int]$response.StatusCode)}
   if($response.Content.Headers.ContentLength -gt 1048576){throw 'RESPONSE_LIMIT'}
   $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();$buffer=[byte[]]::new(8192)
   while(($n=$stream.ReadAsync($buffer,0,$buffer.Length,$cancel.Token).GetAwaiter().GetResult()) -gt 0){if($memory.Length+$n -gt 1048576){throw 'RESPONSE_LIMIT'};$memory.Write($buffer,0,$n)}
   return ,(Read-Json ([Text.Encoding]::UTF8.GetString($memory.ToArray())))
  }finally{if($null -ne $stream){$stream.Dispose()};if($null -ne $response){$response.Dispose()};$request.Dispose();$cancel.Dispose();$memory.Dispose()}
 }
 $list=Invoke-ReadRpc 'ListInstances' @();if($list -isnot [array]){throw 'UNSUPPORTED_SCHEMA'}
 $instances=@();if($list.Count -gt 0){foreach($i in @($list[0])){if($i -isnot [array] -or $i.Count -lt 3 -or $i[0] -notmatch '^[A-Za-z0-9_-]{1,160}$'){throw 'UNSUPPORTED_INSTANCE_SCHEMA'};$instances+=@{id=$i[0];name=(Clean $i[1][0] 100);online=($i[2] -eq 1)}}}
 $instances=@($instances|Where-Object {$_.name -notlike ([Environment]::MachineName.ToLowerInvariant()+'-*')});$script:allowedIds=@($instances|ForEach-Object {$_.id});$hosts=@();$partial=$instances.Count -gt 5;$watch=[Diagnostics.Stopwatch]::StartNew()
 foreach($h in $instances|Select-Object -First 5){$rows=@();$errorCode='';$state='ready'
  if(-not $h.online){$state='offline';$errorCode='HOST_OFFLINE'}elseif($watch.ElapsedMilliseconds -gt 40000 -or $script:retryAfterMs -gt 0){$state='error';$errorCode='SCAN_DEFERRED'}else{try{
   $reply=Invoke-ReadRpc 'ProxyCommand' @($h.id,'/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories','e30=')
   if($reply -isnot [array] -or $reply[0] -isnot [string]){throw 'UNSUPPORTED_PAYLOAD'}
   $data=Read-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($reply[0])));$summaries=$data.trajectorySummaries
   if($data -is [System.Collections.IDictionary] -and $data.Count -eq 0){$summaries=@{}}
   if($summaries -isnot [System.Collections.IDictionary]){throw 'UNSUPPORTED_TASK_SCHEMA'}
   if($summaries.Count -gt 100){$partial=$true}
   foreach($key in @($summaries.Keys)|Select-Object -First 100){$v=$summaries[$key];$id=if($v.trajectoryId){$v.trajectoryId}else{$key};if($id -notmatch '^[A-Za-z0-9_-]{1,128}$'){$partial=$true;continue}
    $status=switch($v.status){'CASCADE_RUN_STATUS_RUNNING'{'running'}'CASCADE_RUN_STATUS_IDLE'{'idle'}default{'unknown'}}
    $project='';if($v.workspaces -is [array] -and $v.workspaces.Count){$project=Clean $v.workspaces[0].workspaceFolderAbsoluteUri 512}
    $rows+=@{id=$id;title=(Clean $v.summary);status=$status;project=$project;lastEvent=(Clean $v.lastUserInputTime 80)}
   }
  }catch{$state='error';$errorCode=$_.Exception.Message;if($errorCode -notmatch '^[A-Z_0-9]{1,80}$'){$errorCode='HOST_QUERY_FAILED'}}}
  if($errorCode){$partial=$true};$hosts+=@{id=$h.id;name=$h.name;online=$h.online;state=$state;error=$errorCode;checkedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();rows=@($rows)}
 }
 @{accountKey=$accountKey;hosts=@($hosts);partial=$partial;retryAfterMs=$script:retryAfterMs;error=''}|ConvertTo-Json -Depth 8 -Compress
}catch{$reason=$_.Exception.Message;if($reason -notmatch '^[A-Z_0-9]{1,80}$'){$reason='REMOTE_QUERY_FAILED'};@{hosts=@();error=$reason;retryAfterMs=$script:retryAfterMs}|ConvertTo-Json -Compress}
finally{if($null -ne $taskClient){$taskClient.Dispose()};$taskRaw=$null;$taskAuth=$null;$taskToken=$null}
