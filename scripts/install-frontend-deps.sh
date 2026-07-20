#!/bin/bash

echo "========================================"
echo "  Installing Frontend Dependencies"
echo "========================================"
echo ""

cd frontend

echo "Installing core dependencies..."
npm install --save \
  react@^18.2.0 \
  react-dom@^18.2.0 \
  react-router-dom@^6.20.0 \
  axios@^1.6.2 \
  antd@^5.12.0 \
  @ant-design/icons@^5.2.6 \
  chart.js@^4.4.0 \
  react-chartjs-2@^5.2.0 \
  dayjs@^1.11.10 \
  react-big-calendar@^1.8.5 \
  recharts@^2.10.3 \
  react-to-print@^2.15.1 \
  @supabase/supabase-js@^2.39.0 \
  xlsx@^0.18.5

echo ""
echo "Installing dev dependencies..."
npm install --save-dev \
  react-scripts@5.0.1 \
  electron@^28.0.0 \
  electron-builder@^24.9.1 \
  concurrently@^8.2.2 \
  wait-on@^7.2.0 \
  electron-is-dev@^2.0.0

echo ""
echo "========================================"
echo "  Installation completed!"
echo "========================================"
echo ""