param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath 'C:\github2\gamer_room').Path.TrimEnd('\')
$archive = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$index = Get-Content -LiteralPath (Join-Path $archive 'index.json') -Raw | ConvertFrom-Json
$verification = Get-Content -LiteralPath (Join-Path $archive 'archive-verification.json') -Raw | ConvertFrom-Json
$dependencies = Get-Content -LiteralPath (Join-Path $archive 'v28-dependency-verification.json') -Raw | ConvertFrom-Json
if (-not $verification.passed -or $verification.standard_views_verified -ne 224 -or -not $dependencies.passed) { throw 'Archive verification has not passed.' }
$v28 = Join-Path $workspace 'tripo-retexture-v28-body-surface\avatar-body-surface-v28.blend'
$expectedV28 = '7D367B71384F170433CA55550BA50B4F48AF87BF8E01A1C4AAA0B37DF227AC21'
if ((Get-FileHash -LiteralPath $v28 -Algorithm SHA256).Hash -ne $expectedV28) { throw 'V28 hash mismatch.' }
$inventory = Get-Content -LiteralPath (Join-Path $workspace 'web\.tmp\avatar-iteration\deletion-inventory.json') -Raw | ConvertFrom-Json
$expected = @{}
foreach ($f in $inventory) { $expected[$f.path.Replace('/','\')] = [long]$f.bytes }
$targets = @()
$fileCount = 0
foreach ($v in ($index.versions | Where-Object version -le 27)) {
    $path = (Resolve-Path -LiteralPath (Join-Path $workspace $v.source_directory)).Path.TrimEnd('\')
    if ([System.IO.Path]::GetDirectoryName($path) -ne $workspace) { throw "Outside expected workspace: $path" }
    if ((Split-Path -Leaf $path) -notmatch '^tripo-retexture-v([1-9]|1\d|2[0-7])(?:-|$)') { throw "Not an old-version directory: $path" }
    $rootItem = Get-Item -LiteralPath $path -Force
    if ($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Reparse point root: $path" }
    $items = @(Get-ChildItem -LiteralPath $path -Recurse -Force)
    if (@($items | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }).Count) { throw "Reparse point inside $path" }
    $files = @($items | Where-Object { -not $_.PSIsContainer })
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($workspace.Length + 1)
        if (-not $expected.ContainsKey($rel) -or $expected[$rel] -ne $f.Length) { throw "File changed since inventory: $rel" }
    }
    $targets += [pscustomobject]@{ path=$path; version=$v.version; files=$files.Count; bytes=($files | Measure-Object Length -Sum).Sum }
    $fileCount += $files.Count
}
if ($targets.Count -ne 27 -or $fileCount -ne $inventory.Count) { throw 'Deletion scope differs from the verified inventory.' }
$oldBackup = (Resolve-Path -LiteralPath (Join-Path $workspace 'tripo-retexture-v28-body-surface\source\avatar-v27-before-body-review.blend')).Path
if ([System.IO.Path]::GetDirectoryName($oldBackup) -ne (Join-Path $workspace 'tripo-retexture-v28-body-surface\source')) { throw 'Unexpected backup location.' }
if ((Get-FileHash -LiteralPath $oldBackup -Algorithm SHA256).Hash -ne '17DB8096C238796DBA32324C7624AA0C99B8CC2B71356E178A16D7C3E1D13599') { throw 'V27 backup hash mismatch.' }
$backupBytes = (Get-Item -LiteralPath $oldBackup).Length
$targets | Select-Object version,path,files,@{Name='GB';Expression={[math]::Round($_.bytes/1e9,3)}} | Format-Table -AutoSize
Write-Output ("Additional verified V27 backup: $oldBackup")
if (-not $Apply) { Write-Output 'PLAN ONLY: no files removed.'; exit 0 }
foreach ($target in $targets) {
    Remove-Item -LiteralPath $target.path -Recurse -Force
    if (Test-Path -LiteralPath $target.path) { throw "Failed to remove $($target.path)" }
}
Remove-Item -LiteralPath $oldBackup -Force
if ((Get-FileHash -LiteralPath $v28 -Algorithm SHA256).Hash -ne $expectedV28) { throw 'V28 changed during cleanup.' }
$report = [ordered]@{ date='2026-10-26'; old_versions_removed=27; files_removed=$fileCount+1; bytes_removed=($targets | Measure-Object bytes -Sum).Sum+$backupBytes; v28_sha256=$expectedV28.ToLowerInvariant(); original_previews_retained=$verification.original_previews_verified; old_version_previews_retained=$verification.old_version_previews_verified; standard_views_retained=224; directories=@($targets | ForEach-Object { [ordered]@{name=(Split-Path -Leaf $_.path); files=$_.files; bytes=$_.bytes} }); old_v27_backup_removed=$true }
[System.IO.File]::WriteAllText((Join-Path $archive 'cleanup-report.json'),($report | ConvertTo-Json -Depth 5),[System.Text.UTF8Encoding]::new($false))
Write-Output ('REMOVED '+$report.files_removed+' files; '+[math]::Round($report.bytes_removed/1e9,3)+' GB. V28 preserved.')
