$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $RootDir "dist"
$SetupPs1 = Join-Path $RootDir "SGCGEndpointIdentity-OnlineSetup.ps1"
$OutputExe = Join-Path $DistDir "SGCGEndpointIdentity-OnlineSetup.exe"
$StageDir = Join-Path $DistDir "online-exe-stage"
$SourceCs = Join-Path $StageDir "SGCGEndpointIdentityOnlineSetup.cs"

if (-not (Test-Path $SetupPs1)) {
    throw "Arquivo nao encontrado: $SetupPs1"
}

$CscCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$Csc = $CscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Csc) {
    throw "csc.exe nao encontrado. Instale .NET Framework 4.x ou gere o MSI com .NET SDK/WiX."
}

New-Item -Path $DistDir -ItemType Directory -Force | Out-Null
if (Test-Path $StageDir) {
    Remove-Item -Path $StageDir -Recurse -Force
}
New-Item -Path $StageDir -ItemType Directory -Force | Out-Null
if (Test-Path $OutputExe) {
    Remove-Item -Path $OutputExe -Force
}

$PayloadBytes = [System.IO.File]::ReadAllBytes($SetupPs1)
$PayloadBase64 = [Convert]::ToBase64String($PayloadBytes)

$source = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Security.Principal;

public class SGCGEndpointIdentityOnlineSetup
{
    private const string PayloadBase64 = "$PayloadBase64";

    private static bool IsAdministrator()
    {
        WindowsIdentity identity = WindowsIdentity.GetCurrent();
        WindowsPrincipal principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string WritePayload()
    {
        string stageDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "SGCGEndpointIdentitySetup");
        Directory.CreateDirectory(stageDir);
        string ps1 = Path.Combine(stageDir, "SGCGEndpointIdentity-OnlineSetup.ps1");
        File.WriteAllBytes(ps1, Convert.FromBase64String(PayloadBase64));
        return ps1;
    }

    public static int Main(string[] args)
    {
        try
        {
            if (!IsAdministrator())
            {
                ProcessStartInfo elevate = new ProcessStartInfo();
                elevate.FileName = Process.GetCurrentProcess().MainModule.FileName;
                elevate.UseShellExecute = true;
                elevate.Verb = "runas";
                Process.Start(elevate);
                return 0;
            }

            string ps1 = WritePayload();
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + ps1 + "\"";
            psi.UseShellExecute = false;
            Process p = Process.Start(psi);
            p.WaitForExit();
            return p.ExitCode;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }
}
"@

Set-Content -Path $SourceCs -Value $source -Encoding UTF8

Write-Host "Gerando $OutputExe ..."
& $Csc /nologo /target:exe /platform:anycpu /out:$OutputExe $SourceCs
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar o EXE com csc.exe. Codigo: $LASTEXITCODE"
}
if (-not (Test-Path $OutputExe)) {
    throw "Build concluiu sem gerar o EXE esperado."
}

Write-Host $OutputExe
