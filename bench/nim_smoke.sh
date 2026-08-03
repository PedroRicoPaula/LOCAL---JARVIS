#!/usr/bin/env bash
# nim_smoke.sh — validate the NVIDIA Build free tier before depending on it.
#
# Checks, in order:
#   1. the key exists in macOS Keychain
#   2. the catalogue answers
#   3. chat completion works
#   4. strict JSON mode works        <- the router depends on this
#   5. streaming works               <- the TTS pipeline depends on this
#   6. rate limiting behaves as expected
#
# Store the key first (never in .zshrc, never in git):
#   security add-generic-password -a "$USER" -s jarvis-nim-key -w 'nvapi-...'
#
# Usage: bash bench/nim_smoke.sh

set -uo pipefail

BASE="https://integrate.api.nvidia.com/v1"
MODEL="${NIM_MODEL:-meta/llama-3.3-70b-instruct}"
pass=0; fail=0

ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; fail=$((fail+1)); }
note() { echo "    $1"; }

echo "NIM smoke test — model: $MODEL"
echo

# 1 ---------------------------------------------------------------- keychain
echo "[1] credential"
KEY="$(security find-generic-password -a "$USER" -s jarvis-nim-key -w 2>/dev/null)"
if [[ -z "${KEY:-}" ]]; then
  bad "key not found in Keychain under service 'jarvis-nim-key'"
  note "security add-generic-password -a \"\$USER\" -s jarvis-nim-key -w 'nvapi-...'"
  exit 1
fi
[[ "$KEY" == nvapi-* ]] && ok "key found, expected prefix" || bad "key found but prefix is not 'nvapi-'"

# 2 ---------------------------------------------------------------- catalogue
echo
echo "[2] catalogue reachable"
CODE=$(curl -s -o /tmp/nim_models.json -w '%{http_code}' \
  -H "Authorization: Bearer $KEY" "$BASE/models")
if [[ "$CODE" == "200" ]]; then
  N=$(grep -o '"id"' /tmp/nim_models.json | wc -l | tr -d ' ')
  ok "HTTP 200, $N models visible"
  grep -q "\"$MODEL\"" /tmp/nim_models.json \
    && ok "target model present in catalogue" \
    || bad "target model '$MODEL' not in catalogue — pick another via NIM_MODEL="
else
  bad "HTTP $CODE"
  note "401 = bad key · 403 = account not enabled · 000 = network"
  exit 1
fi

# 3 ---------------------------------------------------------------- chat
echo
echo "[3] chat completion"
T0=$(date +%s%N)
RESP=$(curl -s -X POST "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: ready\"}],\"max_tokens\":16,\"temperature\":0}")
MS=$(( ( $(date +%s%N) - T0 ) / 1000000 ))
if echo "$RESP" | grep -qi 'ready'; then
  ok "responded in ${MS}ms"
  (( MS > 2500 )) && note "slow — expect 80-150ms of EU->US latency plus inference"
else
  bad "unexpected response"
  note "$(echo "$RESP" | head -c 200)"
fi

# 4 ---------------------------------------------------------------- json mode
echo
echo "[4] strict JSON mode  (the router requires this)"
JRESP=$(curl -s -X POST "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Return JSON only: {\\\"lane\\\":\\\"reason\\\",\\\"confidence\\\":0.9}\"}],\"max_tokens\":64,\"temperature\":0,\"response_format\":{\"type\":\"json_object\"}}")
CONTENT=$(echo "$JRESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["choices"][0]["message"]["content"])' 2>/dev/null)
if [[ -n "$CONTENT" ]] && echo "$CONTENT" | python3 -c 'import sys,json;json.load(sys.stdin)' 2>/dev/null; then
  ok "returned parseable JSON"
else
  bad "JSON mode not usable with this model"
  note "the nim provider must fall back to prompt-enforced JSON + repair"
fi

# 5 ---------------------------------------------------------------- streaming
echo
echo "[5] streaming  (the TTS pipeline requires this)"
CHUNKS=$(curl -s -N -X POST "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Count from one to ten in words.\"}],\"max_tokens\":80,\"stream\":true}" \
  | grep -c '^data: ' || true)
(( CHUNKS > 3 )) && ok "$CHUNKS SSE chunks received" || bad "streaming returned $CHUNKS chunks"

# 6 ---------------------------------------------------------------- rate limit
echo
echo "[6] rate limit behaviour"
echo "    sending 12 rapid requests..."
LIMITED=0
for _ in $(seq 1 12); do
  C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/chat/completions" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":4}")
  [[ "$C" == "429" ]] && LIMITED=$((LIMITED+1))
done
if (( LIMITED == 0 )); then
  ok "12/12 accepted — headroom above the router's 30 RPM bucket"
else
  ok "$LIMITED/12 rate limited — expected; the provider must treat 429 as fallback, not error"
fi

# ------------------------------------------------------------------- summary
echo
echo "──────────────────────────────────────────────"
echo "  $pass passed, $fail failed"
if (( fail == 0 )); then
  echo "  NIM is usable as the 'reason' provider."
  echo "  Record the working model as ADR-002."
else
  echo "  Resolve failures before Phase 3."
fi
echo
echo "  Reminder: NVIDIA's free tier is for development, testing, research"
echo "  and evaluation. Personal use qualifies. Never wire this tier into"
echo "  anything customer-facing."
echo "──────────────────────────────────────────────"
exit $(( fail > 0 ))
