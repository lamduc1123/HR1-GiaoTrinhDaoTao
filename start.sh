#!/usr/bin/env bash
PORT=8000
echo "Đang khởi động local server tại http://localhost:${PORT}"
python3 -m http.server ${PORT}
