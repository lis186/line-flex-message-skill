# 漸層主視覺儀表板（Vertical Bar Graph）

- 範本：LINE Developers 官方文章〈Mastering Flex Messages, part 1〉的「Vertical Bar Graph」
  - https://developers.line.biz/en/tips/2026/04/30/flex-message-usage-1/
- 風格：`giga` 寬卡、125° 漸層 header、統計卡、純 box 畫的直條圖、雙按鈕 footer；不用圖片

## 參考的版面特徵

- header `background.type: linearGradient`、`angle: 125deg`；小標、`lg` 標題、兩個圓角 chip
- body `#FCFCFC`，上方兩張 `flex: 1` 統計卡（`cornerRadius: 12px`）
- 圖表卡：`borderWidth: 1px` 白卡；`alignItems: flex-end`、`height: 124px` 的 horizontal box，七根 14px 寬、`cornerRadius: 7px` 的 0° 漸層直條；最高值那根換色並加粗數字與標籤
- footer：secondary + primary 按鈕，`styles.footer.separator: true`

## 跟範本的差異

- 主題從「用電量」改為「每週步行距離」，配色由綠色系改為靛藍漸層 + 橘色最高值
- 直條高度依資料等比計算（最高值 = 84px，和原版最高那根一樣）
- 原版有兩處在 iOS 預覽中被截斷：圖表標題「Weekly Usage Graph …」和兩個按鈕標籤。這裡改用較短的中文標籤，並讓標題列兩側 `flex: 0`，三處都完整顯示
