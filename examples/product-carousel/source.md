# 商品 carousel（Shopping）

- 範本：LINE Flex Message Simulator → Showcase →「Shopping」
  - Simulator：https://developers.line.biz/flex-simulator/
  - 結構來源：https://github.com/etrex/kamiflex/blob/master/example/show_cases/shopping.rb
- 圖片：範本自己的官方範例圖 `https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_5_carousel.png`、`01_6_carousel.png`
- 風格：多張 bubble 橫向滑動的商品卡，每張 hero 圖 + 名稱 + 大小字價格 + 主次按鈕

## 參考的版面特徵

- `carousel`，每張 bubble：hero `20:13` cover、body `spacing: sm`
- 商品名 `xl` bold wrap；價格是 baseline box，大字 `xl` + 小字 `sm`，都是 `flex: 0`
- 缺貨商品：紅字 `#ff5551` `xxs` 提示，主按鈕改灰 `#aaaaaa`；有貨主按鈕 `#00c300`
- footer：primary「加入購物車」+ 預設樣式「加入收藏」
- 最後一張只有一個置中的「查看更多」按鈕（`flex: 1`、`gravity: center`）

## 跟範本的差異

- 內容改為繁中、新台幣；價格小字從「.99」小數改成「含運」
- 第一版檯燈名稱「工業風金屬檯燈（可調角度）」在 300px 寬換行後只剩「度）」孤字，改為較短的名稱，和原版一樣兩張標題都是一行
- 「查看更多」這張：kamiflex 的重建沒有，是依官方 Showcase 原版加入的；因為拿不到登入後的原始 JSON，這張的屬性沒有逐項對照過
- 預覽：`node skills/line-flex-message/scripts/preview.mjs examples/product-carousel/message.json --device ios --out preview.png`（carousel 會並排畫出全部三張）
