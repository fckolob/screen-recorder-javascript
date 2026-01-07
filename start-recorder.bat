@echo off
set PORT=8000
echo Starting Screen Recorder Server on port %PORT%...
start "" "http://localhost:%PORT%"
python -m http.server %PORT%
