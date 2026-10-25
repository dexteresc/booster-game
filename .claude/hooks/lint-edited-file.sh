#!/bin/sh
# PostToolUse hook: lint the JS file Claude just edited. Exit 2 feeds errors back to Claude.
file=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).tool_input.file_path ?? "")')
case "$file" in
  *.js) ;;
  *) exit 0 ;;
esac
cd "$CLAUDE_PROJECT_DIR" || exit 1
out=$(npx --no-install eslint "$file" 2>&1) || { echo "$out" >&2; exit 2; }
