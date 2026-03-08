param(
    [Parameter(Mandatory=$true)]
    [string]$PptxPath,
    
    [Parameter(Mandatory=$true)]
    [string]$OutputDir
)

# Resolve to absolute paths
$PptxPath = (Resolve-Path $PptxPath).Path
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
$OutputDir = (Resolve-Path $OutputDir).Path

$ppt = $null
$presentation = $null

try {
    $ppt = New-Object -ComObject PowerPoint.Application
    # Don't show window
    $ppt.WindowState = 2  # ppWindowMinimized

    # Open presentation (ReadOnly, no window)
    $presentation = $ppt.Presentations.Open($PptxPath, $true, $false, $false)

    $slideCount = $presentation.Slides.Count
    $width = $presentation.PageSetup.SlideWidth  # in points (1 point = 1/72 inch)
    $height = $presentation.PageSetup.SlideHeight

    # Export each slide as PNG at 1920px width for high quality
    foreach ($slide in $presentation.Slides) {
        $slideNum = $slide.SlideNumber
        $outFile = Join-Path $OutputDir "slide_$slideNum.png"
        # Export at 1920 width (height auto-calculated to maintain ratio)
        $slide.Export($outFile, "PNG", 1920, [int](1920 * $height / $width))
    }

    # Output JSON result
    $result = @{
        slideCount = $slideCount
        slideWidth = [int]$width
        slideHeight = [int]$height
    } | ConvertTo-Json -Compress

    Write-Output $result

} catch {
    Write-Error "PowerPoint export failed: $_"
    exit 1
} finally {
    if ($presentation) {
        $presentation.Close()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
    }
    if ($ppt) {
        $ppt.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
