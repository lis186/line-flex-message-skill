# Flex JSON → HTML 轉換規則（Simulator 黑箱探測，2026-10-24）

## 來源

Flex Message Simulator 把 Flex JSON 轉成 HTML，樣式來自 LINE CDN 上的公開 CSS（`static.line-scdn.net/line_flexible_msg/<hash>/css/sp/main.css`），另有一段動態 `<style>` 放 bubble 寬度與顏色 class。

以下規則是比對 Simulator 對 292 個單一屬性案例（每個案例只變一個屬性）與 8 個組合案例的 HTML 輸出整理而來，案例與對照資料在原始碼 repo 的 `tests/`。

## 容器

| JSON | HTML |
|---|---|
| bubble | `<div class="Ly{Na,Mi,De,He,Ki,Me,Gi}"><div class="T1 fxLTR" dir="ltr">…` |
| `direction: rtl` | `T1 fxRTL`、`dir="rtl"` |
| header / hero / body / footer | `t1Header` / `t1Hero` / `t1Body` / `t1Footer`，裡面直接放該 block 的根元件 |
| 有 footer 時 | body 加 `ExHasFooter` |
| `styles.<block>.backgroundColor` | block div 加顏色 class |
| `styles.<block>.separator: true` | 在該 block **前面**插入 `<div class="MdSep">`（可帶 `separatorColor` 的顏色 class） |
| carousel | `<div class="LySlider"><div class="lyInner"><div class="lyItem Ly{size}">…T1…` |
| video（hero） | Simulator 不播放影片，**渲染 `altContent`**（image 或 box，照一般元件規則），不是 `previewUrl` |

動態 `<style>`：`.LyXx { width: 100%; max-width: <N>px; min-width: 0; }`（N 同 measured-values.md）

## 顏色

所有顏色都不寫 inline，而是產生 `fxC<N>` class，規則放在 head `<style>`，例如 `.fxC1 { color: #123456 !important; }`。

- 顏色值一律**轉小寫**後輸出；`#RRGGBBAA`（含透明度）原樣保留，不轉 `rgba()`
- **同一組（CSS 屬性, 小寫後的值）共用同一個 class**（`#AA0000` 與 `#aa0000` 共用）：例如三個 text 都用 `#aa0000` → 都是同一個 `fxC3`；header 與 body 的背景都用 `#111111` → 共用 `fxC0`
- 編號順序：先處理 bubble 的 `styles`（依 header → hero → body → footer，每個 block 先 backgroundColor 再 separatorColor），再依 DOM 順序處理元件
- carousel：編號在各 bubble 之間連續（不重新從 0 開始）

| 屬性 | 掛在哪 | CSS |
|---|---|---|
| text / span `color` | 元件 div / span | `color` |
| box `backgroundColor`、block style `backgroundColor` | box div / block div | `background-color` |
| box `borderColor` | box div（另加 `ExBd`） | `border-color` |
| separator `color` | separator div | `border-color` |
| button `color`（primary / secondary） | `<a>` | `background-color` |
| button `color`（link） | `<a>` 內的 `<div>` | `color` |
| image `backgroundColor` | `<span>` | `background-color` |

## 共用屬性（text / box / image / button / icon / separator）

| 屬性 | keyword | px / % |
|---|---|---|
| `margin` | `ExMgn{T\|L}{None,Xs,Sm,Md,Lg,Xl,XXl}`（vertical 父層用 T、horizontal / baseline 父層用 L） | inline `margin-top` / `margin-left` |
| `flex` 0–3 | `fl0`–`fl3` | — |
| `flex` ≥ 4 | inline `-webkit-box-flex:N; flex-grow:N;` | — |
| `position: absolute` | `ExAbs`（relative 不輸出） | — |
| `offsetTop/Bottom/Start/End` | `ExT*` / `ExB*` / `ExL*` / `ExR*` | inline `top` / `bottom` / `left` / `right` |
| `gravity` center / bottom | `grvC` / `grvB`（top 不輸出；box 不接受 gravity → 400） | — |

`direction: rtl` 時 start / end 對調成 right / left：horizontal 父層的 margin 變 `ExMgnR*` / `margin-right`、`paddingStart` 變 `ExPadR*` / `padding-right`、`offsetStart` 變 `ExR*` / `right`（end 則相反）。

## Box

| 屬性 | 輸出 |
|---|---|
| `layout` | vertical `vr`；horizontal `hr`；baseline `hr bl` |
| `spacing` keyword | `spc{Xs..XXl}`（none 不輸出） |
| `spacing` px | 第 2 個以後的子元件 inline `margin-left`（RTL 為 `margin-right`）/ `margin-top`；子元件自己有 `margin` 時以子元件為準（已用樣本確認） |
| `paddingAll` / `Top` / `Bottom` / `Start` / `End` | `ExPad{A,T,B,L,R}{None..XXl}`；px / % → inline `padding*`（Start→left、End→right） |
| `borderWidth` | `ExBdrWdt{None,Lgh,Nml,Mdm,Sbd,Bld}`；px → inline |
| `cornerRadius` | `ExBdrRad{None..XXl}`；px → inline |
| `width` / `maxWidth` / `maxHeight` | inline |
| `height` / `width` | inline。沿父層主軸方向的固定尺寸（vertical 父層的 `height`、horizontal 父層的 `width`）會**強制變成 `fl0`，即使有設 `flex` 也一樣** |
| `justifyContent` | `itms-jfc{S,C,E,SB,SA,SE}` |
| `alignItems` | `itms-alg{S,C,E}` |
| `background.linearGradient` | inline `background:linear-gradient(<angle>, <start> 0%, [<center> <pos>,] <end> 100%)` |

## Text

| 屬性 | 輸出 |
|---|---|
| 結構 | `<div class="MdTxt"><p>文字</p></div>` |
| `size` | `Ex{XXs,Xs,Sm,Md,Lg,Xl,XXl,3Xl,4Xl,5Xl}`；px → inline `font-size` |
| `align` | center `ExAlgC`、end `ExAlgE`（start 不輸出） |
| `weight` | `ExWR` / `ExWB` |
| `style` | `ExFntStyNml` / `ExFntStyIt` |
| `decoration` | `ExTxtDecNone` / `ExTxtDecUl` / `ExTxtDecLt` |
| `wrap: true` | `ExWrap` |
| 換行 `\n` | 每一行各自一個 `<p>`；span 裡的換行則原樣留在 `<span>` 內 |
| 同時有 `text` 和 `contents` | 只輸出 span，`text` 被忽略 |
| `contents`（span） | `<p><span class="MdSpn …">`，span 的 size / weight / style / decoration / color 同 text 規則 |

## Image

| 屬性 | 輸出 |
|---|---|
| 結構 | `<div class="MdImg"><div><a style="padding-bottom:P%"><span style="background-image:url('…')">` |
| `size` | `Ex{XXs..5Xl}` / `ExFull`；px / % → 內層 div inline `width` |
| `aspectRatio` W:H | inline `padding-bottom: H/W×100%`（小數截到 3 位，例如 7:5 → `71.428%`）；預設 1:1 |
| `aspectMode` | `ExFit`（預設）/ `ExCover` |
| `align` | start `algS`、end `algE` |

## Button

| 屬性 | 輸出 |
|---|---|
| 結構 | `<div class="MdBtn"><a><div>label</div></a></div>` |
| `style` | primary `ExBtn1`、secondary `ExBtn2`、link `ExBtnL`（預設） |
| `height: sm` | `ExSm` |

## Icon / Separator / Filler

- icon：`<div class="MdIco fl0 Ex{size}"><div><span style="background-image:…; width:Nem;">`；aspectRatio 2:1、3:1 → `width:2em` / `3em`；在 baseline 父層，margin 用 `ExMgnL*`
- separator：`<div class="fl0 MdSep">`
- filler：`<div class="mdBxFiller fl{N}">`

## 不影響 HTML 的屬性

- `action`（bubble、hero、box、text、image、button，含 uri / postback / message）完全不改變輸出；button 的 label 照常顯示
- 父層交叉軸方向的固定尺寸（horizontal 父層的 `height`、vertical 父層的 `width`）只輸出 inline 尺寸，**不會**加 `fl0`，也不會蓋掉 `flex`

## 其他已確認

- horizontal box 裡的 separator 同樣是 `fl0 MdSep`（直線由 CSS 處理），margin 用 `ExMgnL*` / `margin-left`
- 漸層有 `centerColor` 但沒給 `centerPosition` → 中間點 50%
- px 可以有小數（`12.5px`、`2.5px`），原樣輸出

## 驗證時發現的限制

- text 的 `text` 不可為空字串 → 400 `must be non-empty text`

## Simulator 忽略的屬性（輸出完全沒有變化）

這些屬性在 Simulator 預覽中**不會生效**，但在實機上會：

- text：`maxLines`、`lineSpacing`、`adjustMode`、`scaling`
- button：`adjustMode`、`scaling`
- icon：`scaling`
- image：`animated`
- video：只顯示成圖片

→ 自製 renderer 若要比 Simulator 更接近實機，這些屬性要另外實作，並用實機截圖校正。
