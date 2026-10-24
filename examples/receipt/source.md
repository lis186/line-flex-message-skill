# 收據（Receipt）

- 範本：LINE Flex Message Simulator → Showcase →「Receipt」
  - Simulator：https://developers.line.biz/flex-simulator/
  - 版面結構參考 etrex/kamiflex 對同一範本的重建：https://github.com/etrex/kamiflex/blob/master/example/show_cases/receipt.rb
- 風格：白底、純文字、密集的左右對齊明細，沒有圖片

## 參考的版面特徵

- 綠色小標（`#1DB446`, `sm`, bold）→ 店名 `xxl` bold → 灰色地址 `xs` wrap
- `#eaeaea` 的 separator，`margin: xxl`，把店名、品項、金額小計、交易序號分成四段
- 每列是 horizontal box：左側品名 `flex: 0`、右側金額 `align: end`，`spacing: sm`
- 最後一列交易序號用 `xs` + `#aaaaaa`
- `styles.footer.separator: true`（原版就有，沒有 footer 時不會顯示）

## 跟範本的差異

- 內容改為繁中、新台幣金額與虛構店家「晨光雜貨」（原版是 LINE 角色品牌店名，已拿掉）
- 小標改成「收據 RECEIPT」中英並列
- 結構、顏色、間距與原版一致
