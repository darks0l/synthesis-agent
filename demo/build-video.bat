@echo off
cd /d "C:\Users\favcr\.openclaw\workspace\synthesis-agent\demo"

REM Build demo video from slide images
REM Each slide: 5 seconds, with 0.5s fade transitions
REM Output: 1920x1080 @ 30fps, H.264

ffmpeg -y ^
  -loop 1 -t 6 -i slide01.jpg ^
  -loop 1 -t 5 -i slide02.jpg ^
  -loop 1 -t 5 -i slide03.jpg ^
  -loop 1 -t 5 -i slide04.jpg ^
  -loop 1 -t 5 -i slide05.jpg ^
  -loop 1 -t 5 -i slide06.jpg ^
  -loop 1 -t 5 -i slide07.jpg ^
  -loop 1 -t 5 -i slide08.jpg ^
  -loop 1 -t 5 -i slide09.jpg ^
  -loop 1 -t 7 -i slide10.jpg ^
  -filter_complex ^
  "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=1,fade=t=out:st=5:d=1[v0]; ^
   [1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v1]; ^
   [2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v2]; ^
   [3:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v3]; ^
   [4:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v4]; ^
   [5:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v5]; ^
   [6:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v6]; ^
   [7:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v7]; ^
   [8:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4:d=1[v8]; ^
   [9:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=6:d=1[v9]; ^
   [v0][v1][v2][v3][v4][v5][v6][v7][v8][v9]concat=n=10:v=1:a=0[out]" ^
  -map "[out]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 ^
  darksol-demo.mp4

echo Done! Output: darksol-demo.mp4
