#!/usr/bin/env bash
# Ask LINE's official validator whether it would accept Flex Messages. Nothing is sent to any user.
# Usage: validate.sh <file.json | file.jsonl> [out.json]
#   Each JSON record may be a Flex container (bubble/carousel), a flex message ({type:"flex",...}),
#   or a request body ({messages:[...]}).
# Token (a TEST channel's access token; never printed, never written to the out file), first found wins:
#   1. LINE_VALIDATE_TOKEN
#   2. 1Password: op read "${LINE_VALIDATE_OP_REF:-op://Dev/line-validate/credential}" (only if `op` is installed)
#   3. macOS keychain: security find-generic-password -s line-validate -w
#   LINE_VALIDATE_NO_STORE=1 skips 2 and 3.
# Exit: 0 valid (or skipped: no token), 1 LINE rejected a message (400 with a LINE error object, or 413),
#       2 could not validate (any other answer, a body that is not exactly LINE's, curl failure, unwritable out file).
#       With several records, 2 outranks 1.
# Needs bash, curl, jq and node.
# Docs: https://developers.line.biz/en/reference/messaging-api/#validate-message-objects-of-push-message
set -euo pipefail
# The token passes through variables below; never trace them, even under `bash -x`.
{ set +x; } 2>/dev/null
in="${1:?usage: validate.sh <file.json|file.jsonl> [out.json]}"
out="${2:-}"
# Never leave a previous run's verdict behind: every early exit below (skipped, bad base, not JSON …) writes
# nothing, so a stale file would look like this run's result. Only regular files (not /dev/null).
if [[ -n $out && -f $out ]]; then rm -f "$out"; fi
base="${LINE_VALIDATE_BASE:-https://api.line.me}"
# The token goes wherever base points, so only LINE itself or a loopback test server is allowed.
if [[ $base != https://api.line.me && ! $base =~ ^http://127\.0\.0\.1:[0-9]+$ ]]; then
  echo "valid=error reason=LINE_VALIDATE_BASE must be https://api.line.me or http://127.0.0.1:<port>"; exit 2
fi

# Only LINE over https, or plain http to the loopback test server.
proto="=https"; [[ $base == https://* ]] || proto="=http"

token="${LINE_VALIDATE_TOKEN:-}"
if [[ -z $token && ${LINE_VALIDATE_NO_STORE:-} != 1 ]]; then
  if command -v op >/dev/null; then
    token=$(op read "${LINE_VALIDATE_OP_REF:-op://Dev/line-validate/credential}" 2>/dev/null) || token=""
  fi
  if [[ -z $token ]] && command -v security >/dev/null; then
    token=$(security find-generic-password -s line-validate -w 2>/dev/null) || token=""
  fi
fi
if [[ -z $token ]]; then
  if [[ ${LINE_VALIDATE_REQUIRED:-} == 1 ]]; then
    echo "valid=error reason=LINE_VALIDATE_TOKEN not set (LINE_VALIDATE_REQUIRED=1)"; exit 2
  fi
  echo "valid=skipped reason=LINE_VALIDATE_TOKEN not set; LINE acceptance NOT verified"; exit 0
fi

# Fail before calling LINE if the out file cannot be written (exit 1 must only mean "LINE rejected").
if [[ -n $out ]]; then
  : 2>/dev/null > "$out" || { echo "valid=error reason=cannot write $out"; exit 2; }
  # That probe left an empty file; drop it so an exit before the final write leaves nothing behind.
  if [[ -f $out ]]; then rm -f "$out"; fi
fi
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
jq -c '.' "$in" > "$tmp/records" 2>/dev/null || { echo "valid=error reason=$in is not JSON"; exit 2; }
n=$(wc -l < "$tmp/records" | tr -d ' ')
[[ $n -gt 0 ]] || { echo "valid=error reason=$in has no message"; exit 2; }

worst=0; i=0
: > "$tmp/results"
while IFS= read -r rec; do
  i=$((i + 1)); tag=""; [[ $n -gt 1 ]] && tag="[$i] "
  # Wrap a bare container or a single flex message into a request body.
  if ! jq -ce '
      if (.messages | type) == "array" then {messages}
      elif .type == "flex" then {messages: [.]}
      elif .type == "bubble" or .type == "carousel" then {messages: [{type: "flex", altText: "flex", contents: .}]}
      else error end' <<<"$rec" > "$tmp/req" 2>/dev/null; then
    echo "${tag}valid=error reason=record is not a flex container, flex message, or {messages:[...]}"; worst=2; continue
  fi
  # Header via process substitution keeps the token out of argv (ps) and out of any file. -q (first) ignores
  # ~/.curlrc, which could otherwise trace the header to disk, disable TLS checks or add a proxy.
  rc=0
  http=$(curl -q -sS --proto "$proto" --max-time 10 -o "$tmp/resp" -w '%{http_code}' -X POST "$base/v2/bot/message/validate/push" \
    -H 'Content-Type: application/json' \
    -H @<(printf 'Authorization: Bearer %s\n' "$token") \
    --data-binary @"$tmp/req" 2>"$tmp/err") || rc=$?
  # The whole body must be exactly one JSON value ("{}BROKEN", "{} {}", "{}<NUL>…" are not LINE's answer).
  # Strict JSON.parse, not jq: jq stops reading at a NUL byte and would accept "{}<NUL>BROKEN".
  body=$(node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))))' "$tmp/resp" 2>/dev/null || true)
  [[ -n $body ]] || body=null
  # A LINE error response is an object whose `message` is a string.
  is_obj=$(jq -r 'type == "object" and (.message | type) == "string"' <<<"$body")
  jq -nc --argjson i "$i" --arg http "$http" --argjson rc "$rc" --argjson body "$body" \
    '{index: $i, http: $http, curl_exit: $rc, body: $body}' >> "$tmp/results"
  reason=""; [[ $is_obj == true ]] && reason=$(jq -r '.message' <<<"$body")
  if [[ $rc != 0 ]]; then
    # No connection (000), or an answer whose body never fully arrived: LINE's verdict was not received.
    echo "${tag}valid=error http=$http curl_exit=$rc $(head -1 "$tmp/err")"; worst=2
  elif [[ $http == 200 ]]; then
    if [[ $body == '{}' ]]; then echo "${tag}valid=yes"
    else echo "${tag}valid=error http=200 reason=expected {} from LINE"; worst=2; fi
  elif [[ $http == 413 ]]; then
    echo "${tag}valid=no http=413 request larger than LINE's 2MB limit ${reason}"
    if (( worst < 1 )); then worst=1; fi
  elif [[ $http == 400 && $is_obj == true ]]; then
    echo "${tag}valid=no http=400 ${reason}"
    if jq -e '(.details // []) | type == "array" and length > 0' <<<"$body" >/dev/null; then
      jq -r '.details[] | "  ✗ \(.property? // "?"): \(.message? // "")"' <<<"$body"
    else
      echo "  (LINE gave no per-field details)"
    fi
    if (( worst < 1 )); then worst=1; fi
  elif [[ $http == 400 ]]; then
    echo "${tag}valid=error http=400 reason=response is not a LINE error object"; worst=2
  else
    echo "${tag}valid=error http=$http ${reason}"; worst=2
    # `security add-generic-password -w` typed at its prompt silently keeps only 128 characters.
    if [[ $http == 401 && ${#token} == 128 ]]; then
      echo "  hint: token is exactly 128 chars; it was probably truncated when stored; re-store it from the clipboard with:"
      echo "  printf 'add-generic-password -U -s line-validate -a %s -w %s\\n' \"\$USER\" \"\$(pbpaste)\" | security -i"
    fi
  fi
done < "$tmp/records"
[[ -z $out ]] || jq -s '.' "$tmp/results" > "$out"
exit "$worst"
