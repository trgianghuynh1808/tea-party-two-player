# Cấu hình scripts/run-task.sh cho tea-party-two-players

# Model theo nhãn: [dễ] [vừa] [khó]
MODELS=(
  "opencode-go/deepseek-v4.1-flash"   # [dễ]
  "opencode-go/glm-5.3"               # [vừa] mặc định (bước không thuộc client/ hay server/, vd tests/)
  "opencode-go/glm-5.3"               # [khó] (shared/ hoặc cả 2 phía); kẹt nữa thì chuyển Claude
)

# [vừa] chọn model theo thư mục của file đầu tiên trong bước
MEDIUM_RULES=(
  "client/=opencode-go/glm-5.3"               # UI/Phaser: dùng model mạnh hơn
  "server/=opencode-go/deepseek-v4.1-flash"   # server: thử DeepSeek, fail thì leo lên GLM
  "tests/=opencode-go/deepseek-v4.1-flash"    # tests/: thử DeepSeek (rẻ), fail thì leo lên GLM
)

# Bước viết test chạy phiên OpenCode mới (không --continue): plan đã mô tả test từng bước nên không cần lịch sử phiên
FRESH_RULES=("tests/")

# Verify do Claude làm (gõ "verify" sau khi OpenCode xong) để tiết kiệm quota OpenCode
DEFAULT_VERIFY_AGENT="claude"
DEFAULT_VERIFY_MODEL="opencode-go/gemini-4-argon"   # chỉ dùng khi VERIFY_AGENT=opencode
DEFAULT_VERIFY_URL="http://localhost:5173/?test=1"
DEFAULT_CHECK_HINT="npm run typecheck"
DEFAULT_VERIFY_HINT="Game 2 người chơi: tính năng liên quan tới phòng/đồng bộ thì mở 2 session và cho cả 2 vào cùng phòng."

BATCH_MAX="${BATCH_MAX:-4}"
MAX_RUNS="${MAX_RUNS:-20}"
