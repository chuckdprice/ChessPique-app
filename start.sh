#!/usr/bin/env bash
#
# Start the ChessNoteR PGN Converter app and open it in a browser.
#
#   ./start.sh          development server with hot reload (port 5173)
#   ./start.sh --prod    build, then serve the production bundle (port 4173)
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

usage() {
  cat <<'EOF'
Start the ChessNoteR PGN Converter.

Usage:
  ./start.sh          Development server with hot reload (http://localhost:5173)
  ./start.sh --prod   Build, then serve the production bundle (http://localhost:4173)
  ./start.sh --help   Show this message

Press Ctrl+C to stop the server.
EOF
}

mode="dev"
case "${1:-}" in
  "") ;;
  --prod) mode="prod" ;;
  --help | -h)
    usage
    exit 0
    ;;
  *)
    echo "start.sh: unknown option '$1'" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "start.sh: Node.js is not installed." >&2
  echo "Install Node 20 or newer from https://nodejs.org, then run this script again." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

if [ "$mode" = "prod" ]; then
  port=4173
  echo "Building the production bundle..."
  npm run build
else
  port=5173
fi

url="http://localhost:$port"

# Give the server a moment to bind, then open the browser. Vite picks the next
# free port if this one is taken, so the tab may need a manual nudge in that case.
open_browser() {
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url"
  fi
}
open_browser >/dev/null 2>&1 &

echo "Starting the app at $url — press Ctrl+C to stop."

if [ "$mode" = "prod" ]; then
  exec npm run preview
else
  exec npm run dev
fi
