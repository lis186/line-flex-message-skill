# 餐廳／店家卡（Restaurant）

- 範本：LINE Flex Message Simulator → Showcase →「Restaurant」
  - Simulator：https://developers.line.biz/flex-simulator/
  - 結構來源：https://github.com/etrex/kamiflex/blob/master/example/show_cases/restaurant.rb
- 圖片：範本自己的官方範例圖 `https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png`，星星 `review_gold_star_28.png` / `review_gray_star_28.png`
- 風格：滿版 hero 照片 + 星等 + 標籤式資訊列 + link 按鈕

## 參考的版面特徵

- hero：`size: full`、`aspectRatio: 20:13`、`aspectMode: cover`，可點
- 店名 `xl` bold；星等是 baseline box 裡 4 金 1 灰的 `icon`（`sm`）+ 灰色分數 `flex: 0`
- 「地點／時間」兩列：baseline box，標籤 `flex: 1` 灰色、內容 `flex: 5` wrap
- footer：兩個 `style: link`、`height: sm` 的按鈕，`spacing: sm`、`flex: 0`，最後一個小間隔

## 跟範本的差異

- 內容改為繁中虛構店家「巷口咖啡館」；地址較長，刻意讓它換成兩行，測 wrap
- 按鈕改為 `tel:` 與網站連結
- 原版 footer 最後用的是已淘汰的 `spacer`（size `sm`）；這裡改成空的 vertical box 加 `margin: sm`，視覺上同樣留出底部空白
