@echo off
cd /d "f:\Claude code test"
node scripts/init-dashboard-data.js >/dev/null 2>&1
node dashboard/server.js
