@echo off
echo.
echo ====================================================
echo   AI Video Generator - Windows Setup
echo ====================================================
echo.

echo [1/3] Checking Python...
python --version 2>nul
if errorlevel 1 (
    echo ERROR: Python not found.
    echo Download from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install!
    pause
    exit /b 1
)

echo [2/3] Installing gTTS (free unlimited TTS)...
python -m pip install gtts
echo.

echo [3/3] Checking FFmpeg...
ffmpeg -version 2>nul
if errorlevel 1 (
    echo.
    echo FFmpeg NOT found. Install it:
    echo.
    echo Option A - winget (Windows 10/11^):
    echo   winget install Gyan.FFmpeg
    echo.
    echo Option B - Manual:
    echo   1. Go to: https://github.com/BtbN/FFmpeg-Builds/releases
    echo   2. Download: ffmpeg-master-latest-win64-gpl.zip
    echo   3. Extract to C:\ffmpeg\
    echo   4. Add C:\ffmpeg\bin to your System PATH
    echo   5. Restart this terminal
    echo.
) else (
    echo FFmpeg is installed!
)

echo.
echo [4/4] Creating .env.local...
node scripts/setup.js

echo.
echo ====================================================
echo   Setup complete! Next steps:
echo   1. Open .env.local and add your API keys
echo   2. Run: npm run dev
echo   3. Open: http://localhost:3000
echo ====================================================
pause
