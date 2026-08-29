$ErrorActionPreference = 'Stop'
$resPath = Join-Path $PSScriptRoot "..\android\app\src\main\res"

function Create-Folder($dir) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Create-Folder (Join-Path $resPath "drawable")
Create-Folder (Join-Path $resPath "mipmap-anydpi-v26")

$bgXml = @'
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#3D5AFE"
        android:pathData="M0,0h108v108H0z"/>
</vector>
'@
[System.IO.File]::WriteAllText((Join-Path $resPath "drawable/ic_launcher_background.xml"), $bgXml, [System.Text.Encoding]::UTF8)

$fgXml = @'
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M30,30h48v48H30z"/>
</vector>
'@
[System.IO.File]::WriteAllText((Join-Path $resPath "drawable/ic_launcher_foreground.xml"), $fgXml, [System.Text.Encoding]::UTF8)

$adaptiveXml = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
'@
[System.IO.File]::WriteAllText((Join-Path $resPath "mipmap-anydpi-v26/ic_launcher.xml"), $adaptiveXml, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $resPath "mipmap-anydpi-v26/ic_launcher_round.xml"), $adaptiveXml, [System.Text.Encoding]::UTF8)

Add-Type -AssemblyName System.Drawing

$densities = @(
    @{ Name = "mipmap-mdpi"; Size = 48 },
    @{ Name = "mipmap-hdpi"; Size = 72 },
    @{ Name = "mipmap-xhdpi"; Size = 96 },
    @{ Name = "mipmap-xxhdpi"; Size = 144 },
    @{ Name = "mipmap-xxxhdpi"; Size = 192 }
)

foreach ($d in $densities) {
    $dir = Join-Path $resPath $d.Name
    Create-Folder $dir
    
    $size = $d.Size
    $targets = @("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png")
    
    foreach ($t in $targets) {
        $targetPath = Join-Path $dir $t
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::FromArgb(255, 61, 90, 254))
        $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose()
        $bmp.Dispose()
    }
}
Write-Output "[SUCCESS] All Android icons and XML resources created successfully."
