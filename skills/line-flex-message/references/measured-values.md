# Flex Message 渲染數值對照表（Simulator 實測，2026-10-24）

## 來源

Flex Message Simulator 的預覽把 Flex JSON 轉成 DOM + class，樣式全部來自 LINE CDN 上的公開 CSS：

```
https://static.line-scdn.net/line_flexible_msg/188b38e2f32/css/sp/main.css
```

- 路徑中的 `sp` = smartphone；同目錄的 `pc/main.css` 已確認**與 Flex 無關**（一般 PC 網頁的 reset + 960px 版型，沒有任何 Flex class）
- `188b38e2f32` 是版本 hash，LINE 改版時會變。原始碼 repo 的 `npm run check-css` 會檢查 CDN 上的檔案是否改變，`--diff <新網址>` 會列出 renderer 相關規則的差異
- 下表數值讀自該 CSS（等同 DevTools 看到的 computed style）；class 名稱與 JSON 的對應見 `render-mapping.md`

## 全域

- `body`：`font-size: 16px; line-height: 1.4; color: #444`
- 字型：`-apple-system, BlinkMacSystemFont, Helvetica, Roboto, sans-serif` → **字型依 OS 而異**，像素比對必須固定 OS / 字型
- 所有元件 `box-sizing: border-box`

## Bubble 寬度（`size`）

寬度依容器寬而定（與官方文件一致）：

- **單張 bubble**：`min(容器寬, max-width)`；giga 另在左右各留 7px（`.LyGi .T1 { margin: 0 7px }`），所以 375px 寬時是 361px
- **carousel 內的 bubble**：`min(80% × 容器寬, max-width)`（`.LySlider .lyItem { width: 80% }`）
- iPhone（430pt）實測兩種都成立：carousel mega = 300；單張 mega = 299.3（從頭像右側 x=44 起）；單張 giga = 414，左右各 8px（Simulator 為 7px），且不讓出頭像位置、整列滿版

| size | class | max-width | 圓角 |
|---|---|---|---|
| nano | `LyNa` | 120px | 10px |
| micro | `LyMi` | 160px | 10px |
| deca | `LyDe` | 220px | 10px |
| hecto | `LyHe` | 241px | 10px |
| kilo | `LyKi` | 260px | 10px |
| mega（預設） | `LyMe` | 300px | 17px |
| giga | `LyGi` | 500px | 5px（另有左右 margin 7px） |

Carousel（`LySlider`）：第一個 bubble 左 margin 7px，之後每個 9px，最後補 7px 寬的尾端空白。

## Block 預設 padding（依 bubble size）

| block | mega / giga | kilo | deca / hecto | micro / nano |
|---|---|---|---|---|
| header | 20px | 13px | 11px 14px 13px | 10px |
| body | 20px（top 19px） | 13px | 11px 14px 13px | 10px |
| body（有 footer 時的 bottom） | 10px | 17px | 17px | （未覆寫，10px） |
| footer | 10px | 10px | 10px | 10px |

## 間距 keyword（spacing / margin / padding / offset 共用）

| keyword | none | xs | sm | md | lg | xl | xxl |
|---|---|---|---|---|---|---|---|
| px | 0 | 2 | 4 | 8 | 12 | 16 | 20 |

- `spacing`：vertical box 用 `margin-top`，horizontal box 用 `margin-left`（RTL 時改 `margin-right`），第一個子元件為 0
- `margin`：`!important`，因此會覆蓋 spacing
- offset（`ExT*`/`ExB*`/`ExL*`/`ExR*`）用 `top/bottom/left/right`
- `position: absolute`（`ExAbs`）會強制 `margin: 0`

## 文字 / icon / span 大小（`size`）

| keyword | xxs | xs | sm | md | lg | xl | xxl | 3xl | 4xl | 5xl |
|---|---|---|---|---|---|---|---|---|---|---|
| font-size px | 11 | 13 | 14 | 16 | 19 | 22 | 29 | 35 | 48 | 74 |

- 行高繼承 body：1.4
- text 預設 `white-space: nowrap; text-overflow: ellipsis`；`wrap: true`（`ExWrap`）→ `white-space: normal; word-wrap: break-word`
- 空字串 text 高度 `1.4em`
- icon 為 `1em × 1em`；`aspectRatio` 2:1 → 2em 寬，3:1 → 3em 寬
- weight bold → `font-weight: bold`

## Image 大小（`size`）

| keyword | xxs | xs | sm | md | lg | xl | xxl | 3xl | 4xl | 5xl | full |
|---|---|---|---|---|---|---|---|---|---|---|---|
| width px | 40 | 60 | 80 | 100 | 120 | 140 | 160 | 180 | 200 | 220 | 100% |

- 高度用 `padding-bottom` 百分比維持比例。內建比例：1:1、1.51:1、1.91:1、20:13（預設，65%）、4:3、16:9、2:1、3:1、3:4、9:16、1:2、1:3；其他比例推測為 inline style
- `aspectMode` cover / fit → `background-size: cover / contain`

## Button

| 屬性 | 值 |
|---|---|
| 高度 | md（預設）52px；sm 40px |
| padding | 0 16px |
| 圓角 | 8px |
| font-size | 16px |
| primary | 背景 `#17c950`、文字 `#ffffff` |
| secondary | 背景 `#dcdfe5`、文字 `#111111` |
| link（預設） | 文字 `#42659a`、無背景 |

## Separator

- 顏色 `#d4d6da`
- 1px border + `scale(0.5)` → **實際上是 0.5px 的細線**

## Box

- `cornerRadius`：none 0 / xs 2 / sm 4 / md 8 / lg 12 / xl 16 / xxl 20（px）
- `borderWidth`：none 0 / light 0.5 / normal 1 / medium 2 / semi-bold 3 / bold 4（px）
- 預設 `overflow: hidden; position: relative`
- flex class：`fl0`–`fl3`；其他 flex 值以 inline style 輸出（觀察到 `flex-grow: 5`）

## 尚未取得（需要 JS 轉換邏輯或實測）

- `flex` 值 > 3、px / % 值、linearGradient、`maxLines`、`lineSpacing`、video、`adjustMode`、`scaling` 的輸出方式（推測為 inline style）
- Simulator 預覽與手機 app 原生渲染的差距
