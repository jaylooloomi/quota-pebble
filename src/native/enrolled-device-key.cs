// Existing user-authorized keys only. No creation, private export, deletion or pairing changes.
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
class EnrolledDeviceKey {
  [DllImport("ncrypt.dll", CharSet=CharSet.Unicode)] static extern int NCryptOpenStorageProvider(out IntPtr provider,string name,int flags);
  [DllImport("ncrypt.dll", CharSet=CharSet.Unicode)] static extern int NCryptGetProperty(IntPtr handle,string property,byte[] output,int size,out int result,int flags);
  [DllImport("ncrypt.dll")] static extern int NCryptFreeObject(IntPtr handle);
  static void HardwareProvider() {
    IntPtr h=IntPtr.Zero;
    try { Require(NCryptOpenStorageProvider(out h,"Microsoft Platform Crypto Provider",0)==0);var b=new byte[4];int size;Require(NCryptGetProperty(h,"Impl Type",b,4,out size,0)==0&&size==4&&(BitConverter.ToInt32(b,0)&1)!=0); }
    finally { if(h!=IntPtr.Zero)NCryptFreeObject(h); }
  }
  static string Str(Dictionary<string,object> d,string k) { object v; return d.TryGetValue(k,out v)?v as string:null; }
  static void Require(bool ok) { if(!ok)throw new Exception(); }
  static int Main() {
    try {
      var input=new StringBuilder(); int c;
      while((c=Console.In.Read())!=-1) { Require(input.Length<32768); input.Append((char)c); }
      var json=new JavaScriptSerializer { MaxJsonLength=32768, RecursionLimit=10 };
      var r=json.Deserialize<Dictionary<string,object>>(input.ToString());
      string id=Str(r,"keyId"),protection=Str(r,"protectionClass"),action=Str(r,"action");
      bool tpm=protection=="hardware_tpm";
      Require(tpm||protection=="os_protected_nonextractable");
      Require(id!=null&&Regex.IsMatch(id,"\\Adk_"+(tpm?"tpm":"osn")+"_[A-Za-z0-9_-]{43}\\z"));
      Require(action=="public"||action=="sign");
      var provider=tpm?new CngProvider("Microsoft Platform Crypto Provider"):CngProvider.MicrosoftSoftwareKeyStorageProvider;
      if(tpm)HardwareProvider();
      using(var key=CngKey.Open("OpenAI Codex device key "+id,provider,CngKeyOpenOptions.Silent)) {
        Require(key.ExportPolicy==CngExportPolicies.None&&key.KeySize==256&&key.AlgorithmGroup==CngAlgorithmGroup.ECDsa);
        object result;
        if(action=="public") {
          result=new { keyId=id,publicBlobBase64=Convert.ToBase64String(key.Export(CngKeyBlobFormat.EccPublicBlob)),algorithm="ecdsa_p256_sha256",protectionClass=protection,exportPolicy=(int)key.ExportPolicy };
        } else {
          byte[] payload=Convert.FromBase64String(Str(r,"payloadBase64")??""); Require(payload.Length>0&&payload.Length<=16384);
          var doc=json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(payload));
          Require(Str(doc,"domain")=="codex-device-key-sign-payload/v1");
          var p=doc["payload"] as Dictionary<string,object>; Require(p!=null&&Str(p,"targetOrigin")=="https://chatgpt.com");
          string type=Str(p,"type"),target=Str(p,"targetPath"),audience=Str(p,"audience");
          Require((type=="remoteControlClientEnrollment"&&target=="/backend-api/codex/remote/control/client/refresh/finish"&&audience=="remote_control_client_enrollment")||(type=="remoteControlClientConnection"&&target=="/backend-api/codex/remote/control/client"&&audience=="remote_control_client_websocket"));
          using(var ecdsa=new ECDsaCng(key)) { result=new { signatureP1363Base64=Convert.ToBase64String(ecdsa.SignData(payload,HashAlgorithmName.SHA256)) }; }
        }
        Console.WriteLine(json.Serialize(result)); return 0;
      }
    } catch { Console.Error.WriteLine("Pebble CNG operation failed"); return 1; }
  }
}
