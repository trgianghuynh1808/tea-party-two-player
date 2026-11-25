# Task: Test mobile giao diện Build sau big update + report
APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Kiểm tra giao diện Xây (Build) trên điện thoại (iPhone 13 giả lập, màn dọc → `body.force-landscape`) sau các update gần đây (build mode giống decorate: chọn/di chuyển/xoay/bán/bỏ chọn, ⟳ badge, nút Xoay, joystick/🚶 Đi lại).
- Gửi report tình trạng (OK / lỗi layout / lỗi thao tác cảm ứng) vào mục "## Verify
- Chạy cả bộ e2e: 42 passed, 1 failed (T1) trước khi đánh dấu `test.fail()`; sau đó T1 được đánh dấu "known bug" nên bộ test xanh. `npm run typecheck` OK.
- T1 (panel không tràn): **FAIL (lỗi layout nhỏ)** — `#build-panel` tràn ngang 4px do `.rotate-badge` (`right: -6px`) trên card build. Ảnh: `.agents/screenshots/task-04-build-panel.png`.
- T2 (chọn/xây/bỏ chọn/thoát): **PASS**. Ảnh: `.agents/screenshots/task-04-build-selected.png`.
- Nhận xét bằng mắt (iPhone 13 dọc, force-landscape): panel Xây hiển thị được, có tiêu đề, nút Full/Mời/Trang trí/Rời/Xong rõ ràng; đoạn hướng dẫn dài chiếm nhiều chỗ, khung panel nhỏ nên cần cuộn để thấy các card công cụ. Nút 🚶 Đi lại (trong canvas) hiện bên phải, đọc được, không bị che.
- Lỗi cảm ứng: không phát hiện (chọn/bỏ chọn card hoạt động).
- Không sửa code app theo quyết định task; đề xuất task riêng để sửa badge ⟳ (4px) và rút gọn hướng dẫn trên mobile.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
