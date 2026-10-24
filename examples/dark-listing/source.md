# 深色主視覺物件卡（Real Estate）

- 範本：LINE Flex Message Simulator → Showcase →「Real Estate」
  - Simulator：https://developers.line.biz/flex-simulator/
  - 結構來源：https://github.com/etrex/kamiflex/blob/master/example/show_cases/real_estate.rb
- 圖片：範本自己的官方範例圖 `https://scdn.line-apps.com/n/channel_devcenter/img/flexsnapshot/clip/clip4.jpg`、`clip5.jpg`、`clip6.jpg`
- 風格：header 放照片拼貼（左一大、右兩小）、深藍灰 body、半透明白色說明塊、浮在照片上的紅色膠囊標籤

## 參考的版面特徵

- header `paddingAll: 0px`；horizontal box 裡左圖 `150:196`、右側 vertical box 兩張 `150:98`，剛好拼成同高
- 紅色 `#EC3D44` 膠囊：`position: absolute`、`offsetStart/Top: 18px`、`cornerRadius: 100px`
- body `#464F69`；標題白色 `xl` bold、副標 `#ffffffcc`
- 說明塊 `#ffffff1A` 半透明白底、`cornerRadius: 2px`，字色 `#ffffffde`

## 跟範本的差異

- 內容改為繁中虛構物件「青田街日式老宅」
- 膠囊文字從「NEW」改為「新上架」，三個中文字在原版 48px 寬會貼齊邊緣，寬度改為 56px
- 原版說明塊外多包了一層 vertical box，文字還帶 `margin: lg`；這裡拿掉外層，視覺上的差別只有說明文字上方少了 12px 留白
