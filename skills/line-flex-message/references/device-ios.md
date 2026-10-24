# iOS 實機量測（2026-10-24）

- 裝置：iPhone，1290×2796 截圖（430pt 寬、3x），LINE iOS，深色模式，iOS 文字大小與 LINE 字體大小皆為預設
- 訊息：`tests/device/calibration.json`（1 則 carousel，6 張卡），推送到測試帳號
- 量測：原始碼 repo 的 `tools/measure-device.py`（以 200px 紅色尺規換算；尺規量得 600×60 裝置像素 → **1 CSS px = 1 pt**）

## 與 Simulator 一致

- bubble 寬：mega 在 430pt 螢幕上 = 300（80% = 344，被 300 上限截住）；body `paddingAll: lg` 後內容寬 276
- `spacing: md` = 8px、box `width: 150px` = 150px
- text 不換行時尾端 `…`；`wrap: true` 中英混排換行；無空白長字串在字中斷開
- 結尾 `\n` 會多出一個空行

## 單張 bubble 寬度（`tests/device/single-bubble.json`）

| 單張 bubble | 實機 | Simulator |
|---|---|---|
| mega | 299.3，從頭像右側 x=44 起 | 300 |
| giga | 414，左右各 8px，整列滿版（不讓出頭像） | 416（左右各 7px） |

`--device ios` 把 giga 左右邊距設為 8px。

## 與 Simulator 不同

### 行高（影響所有文字高度）

單行文字 box 高度：

| size | font px | 實機行高 | 實機 / font | Simulator（1.4） |
|---|---|---|---|---|
| xs | 11 | 16.0 | 1.45 | 15.4 |
| sm | 14 | 17.0 | 1.21 | 19.6 |
| md | 16 | 19.7 | 1.23 | 22.4 |
| lg | 19 | 23.0 | 1.21 | 26.6 |
| xl | 22 | 26.3 | 1.20 | 30.8 |
| xxl | 29 | 35.0 | 1.21 | 40.6 |

模型：**行高 ≈ max(1.2 × font, 16px)**（誤差 ≤ 0.5px）。多行 md 文字的行距實測 19.2px。Simulator 的 1.4 讓每行高出約 15%，文字越多，整張卡越高。

### `maxLines`（C2，md、`wrap: true`）

| maxLines | 實機行數 | 高度 |
|---|---|---|
| 0（未設） | 4（全文） | 77.0 |
| 1 | 1 + `…` | 19.7 |
| 2 | 2 + `…` | 38.3 |
| 3 | 3 + `…` | 57.7 |

= 標準 line-clamp：顯示 N 行，最後一行尾端 `…`。

### `lineSpacing`（C3，sm、2 行）

| lineSpacing | box 高 | 第 2 行起點 |
|---|---|---|
| 未設 | 34.0 | 19.3 |
| 6px | 40.0 | 25.3 |
| 12px | 46.0 | 31.3 |
| 20px | 54.0 | 39.3 |

= 只在行與行之間多加 `lineSpacing`，首行上方、末行下方不加（與官方文件一致）。高度 = N × 行高 + (N−1) × lineSpacing。

### `adjustMode: shrink-to-fit`（C4，xl、box 150px）

| 文字 | box 高 | 墨水高 | 推算字級 |
|---|---|---|---|
| 短（1 字） | 26.7 | 17.7 | 22（不放大） |
| 中等長度文字（6 字） | 26.3 | 19.0 | 22（放得下，不縮） |
| 12 字 | 26.7 | 10.7 | ≈ 12.5（150 / 12） |
| 23 字 | 26.3 | 5.3 | ≈ 6.5（150 / 23） |

= 字級縮到剛好放進寬度；**box 高度維持原字級的行高**，縮小後的文字垂直置中。只縮不放。

### `scaling`（C5，iOS 文字大小最小 / 預設 / 最大各一張）

iOS「設定 → 顯示與亮度 → 文字大小」最小 / 預設 / 最大時，`scaling: true` 元件相對 `scaling` 關閉者的墨水尺寸：

| 元件 | 最小 | 預設 | 最大 |
|---|---|---|---|
| text（md） | ×0.82 | ×1.00 | ×1.33 |
| icon（md） | ×0.80 | ×1.00 | ×1.36 |
| button 文字 | ×0.79 | ×0.98 | ×1.33 |

= iOS Dynamic Type 的 body 字級比例（xS 14 / L 17 預設 / xxxL 23 → 0.82 / 1 / 1.35）。`scaling` 關閉的元件三種設定下完全不變；button 高度固定 52px 不跟著放大；文字列的行高隨放大後的字級增加（最大時 19.7 → 26.7）。中間檔位（S/M/XL/XXL）與輔助使用的更大字級未量測，renderer 依 Dynamic Type 表推算（15/16/19/21）。

## Renderer `--device ios`

`scripts/render.mjs` 依上面五項實作：行高 `max(1.2em, 16px)`（含空行）、`maxLines` → line-clamp、`lineSpacing` → 加寬行盒再把首末各半個間距收回、`shrink-to-fit` → 載入字型後逐步縮字、固定行盒高度、`scaling` → 依 `--text-size` 乘上 Dynamic Type 比例（在 shrink-to-fit 之前套用）。`npm run check-device` 比對 22 個 box（高度 ±1px、行數一致）與 C5 三種文字大小下 18 個量測項（墨水高 ±1px、寬 ±1.5px），全部通過（Simulator 模式同樣的 box 差 3–51px）。
