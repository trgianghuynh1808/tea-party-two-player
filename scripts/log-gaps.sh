#!/usr/bin/env bash
# Phân tích .agents/run.log để tìm chỗ tốn thời gian.
#
# Cách dùng:
#   scripts/log-gaps.sh            # lần chạy gần nhất (mỗi lần chạy = một khối "=== ...")
#   scripts/log-gaps.sh 3          # 3 lần chạy gần nhất
#   TOP=20 scripts/log-gaps.sh     # hiện 20 khoảng chờ lâu nhất thay vì 10
#
# Mỗi "khoảng chờ" = thời gian giữa một dòng log và dòng kế tiếp.
# Dòng đứng TRƯỚC khoảng chờ là việc đang diễn ra lúc đó:
#   - sau dòng "$ npx playwright test ..."  → thời gian chạy test
#   - sau dòng "$ npm run typecheck"        → thời gian typecheck
#   - sau dòng "← Edit ..." hoặc chữ thường → model đang suy nghĩ / sinh output

set -euo pipefail

LOG="${LOG:-.agents/run.log}"
RUNS="${1:-1}"
TOP="${TOP:-10}"

[[ -f "$LOG" ]] || { echo "Không thấy $LOG"; exit 1; }

# Lấy N khối "=== ..." cuối cùng
start_line=$(grep -n '^=== ' "$LOG" | tail -n "$RUNS" | head -n1 | cut -d: -f1)
[[ -n "$start_line" ]] || { echo "Log chưa có lần chạy nào."; exit 1; }

tail -n +"$start_line" "$LOG" | awk -v top="$TOP" '
  function flush_run() {
    if (run != "") {
      printf "%-60s %6ds  (%d dòng)\n", run, last_t, lines
    }
  }
  /^=== / {
    flush_run()
    run = substr($0, 5); sub(/ ===$/, "", run); prev_t = 0; prev_text = "(bắt đầu)"; last_t = 0; lines = 0
    next
  }
  /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] \+[0-9]+s │ / {
    t = $2; sub(/^\+/, "", t); sub(/s$/, "", t); t += 0
    text = $0; sub(/^[^│]*│ /, "", text)
    gap = t - prev_t
    if (gap > 0) {
      n++
      gaps[n] = gap
      desc[n] = sprintf("%s · %s", short(run), substr(prev_text, 1, 90))
    }
    prev_t = t; prev_text = text; last_t = t; lines++
  }
  function short(r,   a) { split(r, a, " · "); return a[2] }
  END {
    flush_run()
    print ""
    print "Các khoảng chờ lâu nhất (giây · lần chạy · việc đang diễn ra trước đó):"
    # sắp xếp giảm dần (n nhỏ nên selection sort là đủ)
    for (i = 1; i <= n && i <= top; i++) {
      m = i
      for (j = i + 1; j <= n; j++) if (gaps[j] > gaps[m]) m = j
      tg = gaps[i]; gaps[i] = gaps[m]; gaps[m] = tg
      td = desc[i]; desc[i] = desc[m]; desc[m] = td
      printf "  %5ds  %s\n", gaps[i], desc[i]
    }
  }
' | {
  echo "Thời gian từng lần chạy:"
  cat
}
