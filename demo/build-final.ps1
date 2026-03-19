Set-Location "C:\Users\favcr\.openclaw\workspace\synthesis-agent\demo"

# Build dashboard clip from screenshots (each shown ~3 seconds with crossfade)
$dashFilter = "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=2.5:d=0.5[d0];[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5[d1];[2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5[d2];[3:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5[d3];[4:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5[d4];[5:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5[d5];[6:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=2.5:d=0.5[d6];[d0][d1][d2][d3][d4][d5][d6]concat=n=7:v=1:a=0[out]"

Write-Host "Building dashboard clip..."
& ffmpeg -y `
  -loop 1 -t 3 -i dash01.jpg `
  -loop 1 -t 3 -i dash02.jpg `
  -loop 1 -t 3 -i dash03.jpg `
  -loop 1 -t 3 -i dash04.jpg `
  -loop 1 -t 3 -i dash05.jpg `
  -loop 1 -t 3 -i dash06.jpg `
  -loop 1 -t 3 -i dash07.jpg `
  -filter_complex $dashFilter `
  -map "[out]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 `
  dashboard-clip.mp4

Write-Host "Concatenating slides + dashboard..."
# Create concat list
@"
file 'darksol-demo.mp4'
file 'dashboard-clip.mp4'
"@ | Out-File -Encoding ascii concat.txt

& ffmpeg -y -f concat -safe 0 -i concat.txt -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 darksol-full-demo.mp4

$size = [math]::Round((Get-Item darksol-full-demo.mp4).Length / 1MB, 2)
Write-Host "Done! darksol-full-demo.mp4 ($size MB)"
