# Task: Đưa dòng tô/đĩa/ly xuống cuối công thức trong đơn nhà hàng

## Mục tiêu
Trong panel Đơn hàng (nhà hàng), dòng chỉ vật chứa (tô/đĩa/ly) hiện ở đầu nên dễ bị hiểu là bước đầu. Đưa xuống sau các bước làm.

## Quyết định đã chốt
- Chữ hiển thị: "<icon> Bày ra <tên vật chứa viết thường>" (vd "🍽️ Bày ra đĩa"), bỏ "Cầm … đi gom:".
- Chỉ đổi thứ tự + chữ + style nhẹ, không đổi logic game.

## Plan
- [ ] 1. [dễ] `client/src/ui/OrdersPanel.ts`, hàm `recipeSteps`: chuyển dòng `parts.append(span("part-into", ...))` xuống sau vòng `for (const part of dish.parts)` (trước `return parts`); đổi text thành `${CONTAINER_ICONS[dish.container]} Bày ra ${CONTAINERS[dish.container].label.toLowerCase()}`.
- [ ] 2. [dễ] `client/src/style.css`, rule `.order .part-into`: thêm `margin-top: 2px; padding-top: 3px; border-top: 1px dashed #d9cbb8;` để tách khỏi các bước.

## Trạng thái hiện tại
Chưa bắt đầu.

## Test status
- Lần chạy cuối:
- Fail:
- Ghi chú: `tests/` có thể chưa có spec; nếu Playwright báo "No tests found" thì chỉ dựa vào `npm run typecheck`.

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
