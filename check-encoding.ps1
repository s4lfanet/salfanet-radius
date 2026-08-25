$files = Get-ChildItem -Path "e:\salfanet-radius\frontend\src\app" -Recurse -Filter "*.tsx"
foreach ($file in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $hasBOM = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    if ($hasBOM) {
        Write-Output "BOM: $($file.FullName)"
    }
    # Check for invalid UTF-8 sequences
    try {
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        $reencoded = [System.Text.Encoding]::UTF8.GetBytes($content)
        if ($reencoded.Length -ne $bytes.Length) {
            Write-Output "ENCODING ISSUE: $($file.FullName)"
        }
    } catch {
        Write-Output "ERROR: $($file.FullName)"
    }
}
Write-Output "Done checking"
