# 入場券（Ticket-Style Message）

- 範本：LINE Developers 官方文章〈Mastering Flex Messages, part 1〉的「Ticket-Style Message」
  - https://developers.line.biz/en/tips/2026/04/30/flex-message-usage-1/
- 風格：米白底上的粗框票卡、兩側半圓缺口、灰底資訊塊、黑底 QR 動作區；不用圖片

## 參考的版面特徵

- body 底色 `#FDFBF6`；票卡 `borderWidth: 2px`、`#1F2937`、`cornerRadius: 14px`
- 頂列「ENTRY PASS / 票號」、`xl` bold 標題、`xs` 副標
- `#F1F5F9` 圓角資訊塊：上排 3:2 兩塊（日期／入口）、下排一塊（區域）
- `#94A3B8` separator 後接報到時間列
- `#111111` 圓角動作區（uri action），兩行置中白字
- 兩個 `position: absolute` 的 24px 圓形（`offsetStart/End: -12px`），用和背景同色填滿做出票券缺口

## 跟範本的差異

- 內容改為繁中虛構活動「秋日爵士音樂節 2026」（原版活動名是 LINE 角色品牌，已拿掉）
- 頂列和報到時間列：原版兩個 text 都是預設 `flex: 1`，`justifyContent: space-between` 不起作用，票號會停在中間（用預覽畫原版 JSON 時看得到）。這裡把兩個 text 改成 `flex: 0`，讓票號真的靠右
- 缺口位置：原版 `offsetTop: 170px` 是依英文標題換兩行的高度算的。中文標題只有一行，170px 會落在「區域」塊中間，所以改成 `204px`，讓缺口對齊 separator（撕線位置）。這個值是從預覽 PNG 量出來的，內容高度一變就要重新調
- 拿掉原版 `styles.footer`（沒有 footer，原本就不會顯示）
