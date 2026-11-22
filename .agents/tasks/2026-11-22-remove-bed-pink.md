# Task: Xoá giường chăn hồng (bed_pink)

Verify mode: none

## Mục tiêu
- Món nội thất `bed_pink` ("Giường chăn hồng") không còn trong catalog (không mua/đặt được nữa) và file ảnh của nó bị xoá.
- Các món khác không đổi.

## Quyết định đã chốt
- Xoá hẳn khỏi catalog; không thêm cơ chế hoàn tiền/migrate. Giường đã đặt trong shop đã lưu sẽ bị bỏ qua khi tải (`ShopStore` lọc kind không còn trong catalog) — đã báo người dùng.

## Ngữ cảnh
- `shared/src/decor.ts` dòng ~197-198:
  ```ts
  // bedroom-2-original.png
  bed(decor("bed_pink", "Giường chăn hồng", 140, "bedroom/bed_pink", 80, 40, 60, 0xe06666, "flip"), 0.24, 0.38),
  ```
  Các dòng khác dưới comment `// bedroom-2-original.png` (grandfather_clock, chest, stove) giữ nguyên.
- Ảnh: `client/public/assets/decor/bedroom/bed_pink.png`.
- `client/assets-src/tools/cut_bedroom.py` dòng ~58 có entry sinh ảnh này (nếu để lại, chạy lại script sẽ sinh lại file):
  `"bedroom/bed_pink.png": {"box": (46, 106, 167, 197), "h": 120, "drop_green": True, "erase": [(64, 100, 170, 119)]},  # window sill above`
- Không còn chỗ nào khác tham chiếu `bed_pink` trong `client/src`, `server/src`, `tests` (đã grep).

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → `DECORATION_CATALOG`: xoá dòng `bed(decor("bed_pink", ...), 0.24, 0.38),`; xoá file `client/public/assets/decor/bedroom/bed_pink.png` (`git rm`); xoá entry `"bedroom/bed_pink.png"` trong `client/assets-src/tools/cut_bedroom.py`. Chạy `npm run typecheck`.
- [x] 2. [khó] `tests/decor-catalog.spec.ts` (file mới, thuần Node, theo mẫu `tests/cooked-food-image.spec.ts`): viết T1. Chạy `npx playwright test tests/decor-catalog.spec.ts`.

## Test cases
- [x] T1. bed_pink đã bị xoá — `getDecorationDef("bed_pink")` là `undefined`, `DECORATION_CATALOG` không có kind `bed_pink`, và `existsSync("client/public/assets/decor/bedroom/bed_pink.png")` là false; `getDecorationDef("bed_red")` vẫn có (các giường khác còn) — tests/decor-catalog.spec.ts

## Trạng thái hiện tại
- Cả 2 bước plan đều xong. `bed_pink` đã xoá khỏi `DECORATION_CATALOG` (`shared/src/decor.ts`), ảnh `client/public/assets/decor/bedroom/bed_pink.png` đã `git rm`, entry trong `client/assets-src/tools/cut_bedroom.py` đã xoá. `tests/decor-catalog.spec.ts` (T1) đã viết và PASS. `npm run typecheck` PASS sau cả 2 bước.

## Test status
- Lần chạy cuối: `npx playwright test tests/decor-catalog.spec.ts` — 1 passed.
- Kết quả từng test:
  - T1: PASS (tests/decor-catalog.spec.ts)
- `npm run typecheck` sau bước 1 và bước 2: PASS.
- Fail chi tiết:

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
