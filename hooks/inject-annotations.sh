#!/bin/bash
FILE="$HOME/.claude/annotations.json"

# Exit silently if file doesn't exist
[ -f "$FILE" ] || exit 0

# Check if there are any annotations
COUNT=$(python3 -c "import json,sys; d=json.load(open('$FILE')); print(len(d.get('annotations',[])))" 2>/dev/null)
[ "$COUNT" -gt 0 ] || exit 0

# Auto-clear before outputting so they don't repeat
CONTENT=$(cat "$FILE")
echo '{"annotations":[]}' > "$FILE"

# Output annotations for Claude to see
echo "=== BROWSER ANNOTATIONS (from Chisel for Claude) ==="
echo "You have $COUNT pending annotation(s). Act on them."
echo "NOTE: Annotations file has already been cleared automatically. Do NOT clear or write to the annotations file yourself."
echo ""
echo "$CONTENT"
echo ""
echo "=== END ANNOTATIONS ==="
