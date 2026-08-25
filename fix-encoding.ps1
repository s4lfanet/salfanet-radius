$files = @(
    "e:\salfanet-radius\frontend\src\app\customer\page.tsx",
    "e:\salfanet-radius\frontend\src\app\admin\auth\two-factor\page.tsx",
    "e:\salfanet-radius\frontend\src\app\admin\pppoe\users\new\page.tsx"
)
foreach ($filePath in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    # Check for BOM
    $hasBOM = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    if ($hasBOM) {
        # Remove BOM
        $newBytes = $bytes[3..($bytes.Length - 1)]
        [System.IO.File]::WriteAllBytes($filePath, $newBytes)
        Write-Output "Removed BOM: $filePath"
    }
    # Re-read and check for invalid UTF-8
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    try {
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        $reencoded = [System.Text.Encoding]::UTF8.GetBytes($content)
        if ($reencoded.Length -ne $bytes.Length) {
            Write-Output "Still has encoding issue: $filePath ($($bytes.Length) -> $($reencoded.Length))"
        } else {
            Write-Output "OK: $filePath"
        }
    } catch {
        Write-Output "ERROR reading: $filePath"
    }
}
