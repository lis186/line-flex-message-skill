# LINE Flex Message 官方文件調查（2026-10-24）

## 1. 官方文件清單

| 文件 | URL（皆有 `.md` 版本，可直接給 agent 讀） | 用途 |
|---|---|---|
| Messaging API reference — Flex Message | https://developers.line.biz/en/reference/messaging-api/#flex-message | 所有屬性、enum、限制的權威定義 |
| Flex Message elements | https://developers.line.biz/en/docs/messaging-api/flex-message-elements/index.html.md | 容器 / block / 元件概念 |
| Flex Message layout | https://developers.line.biz/en/docs/messaging-api/flex-message-layout/index.html.md | flex、spacing、offset 等排版規則（含 CSS 對應） |
| Create a Flex Message including a video | https://developers.line.biz/en/docs/messaging-api/create-flex-message-including-video/index.html.md | video 元件 |
| Flex Message Simulator 教學 | https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/index.html.md | Simulator 操作 |
| line-openapi `messaging-api.yml` | https://github.com/line/line-openapi （Apache-2.0，最後 commit 2026-09-29） | 機器可讀 schema，`Flex*` 定義在約 4413–5100 行 |
| LINE Developers Agreement | https://terms2.line.me/LINE_Developers_Agreement?lang=en | 授權限制 |
| 全站索引 | https://developers.line.biz/llms.txt | agent 用的文件索引 |

## 2. 驗證：Validate API

- 端點：`POST https://api.line.me/v2/bot/message/validate/{reply|push|multicast|narrowcast|broadcast}`
- Body：`{"messages":[...]}`，只驗證 `messages`，不會發送
- 成功：`200 {}`；失敗：`400 {"message": "...", "details": [{"message": "...", "property": "messages[0]..."}]}`
- Rate limit：2,000 req/s
- 需要 channel access token

## 3. 硬限制（可本地 lint）

- `altText` ≤ 1500 字元
- bubble JSON ≤ 30 KB；carousel JSON ≤ 50 KB；carousel ≤ 12 bubbles
- carousel 內所有 bubble 的 `size` 必須相同
- 一次 request ≤ 5 messages；request body ≤ 2 MB
- bubble `size`：`nano | micro | deca | hecto | kilo | mega(預設) | giga`
- 第一個 block 子元件不可 `position: absolute`
- icon 只能放在 baseline box
- baseline box 子元件不可用 `gravity`、`offsetBottom`

## 4. 官方明確給出的排版規則（renderer 可直接實作）

flex → CSS 對應（layout 文件原文）：

| box 方向 | `flex: 0` | `flex: X` |
|---|---|---|
| horizontal（預設 flex=1） | `flex: 0 0 auto` | `flex: X 0 0` |
| vertical（預設 flex=0） | `flex: 0 0 auto` | `flex: X 0 auto` |

- `justifyContent` 只在所有子元件 `flex: 0` 時生效
- horizontal box 子元件設 `width` → flex 變 0
- 子元件 `margin` 覆蓋父層 `spacing`
- `maxWidth`/`maxHeight` 在計算值較大時覆蓋 `width`/`height`
- 方向性 padding 覆蓋 `paddingAll`
- `align` 預設 center；`gravity` 預設 top
- absolute 子元件不影響父層尺寸，超出父層部分不顯示
- 依 JSON 順序繪製，後者在上
- linearGradient：0° = 由下往上，順時針
- text 預設單行加 `…` 截斷；`wrap: true` 換行；`lineSpacing` 不加在首行上方、末行下方

## 5. 官方「沒有」給的資訊（必須靠觀察取得）

這是做像素級 renderer 的關鍵缺口：

- 所有 keyword 對應的 px 值：`spacing`/`margin`/`padding`/`offset`（none–xxl）、text/icon/span `size`（xxs–5xl）、image `size`（xxs–5xl、full）
- 各 bubble size 的寬度（nano…giga）
- 預設字型、行高、text `maxLines` 細節
- button 各 style 的高度、圓角、padding
- 圓角 keyword、border width keyword 的 px 值

官方也明說會因環境而異：
- bubble 寬度依裝置螢幕而定
- 未指定 offset 的位置可能依裝置而異
- `adjustMode: shrink-to-fit` 是 best-effort，某些平台可能無效
- 結尾換行字元的渲染依裝置而異
- `scaling: true` 會跟隨使用者的 LINE 字體大小設定

→ 結論：**沒有單一的「官方像素真相」**，renderer 必須選定一個參考環境（Simulator 或特定裝置 + 字體設定）。

## 6. 版本相依功能

| 功能 | iOS/Android | PC |
|---|---|---|
| box `maxWidth`/`maxHeight`、text `lineSpacing`、video | 11.22.0+ | 7.7.0+ |
| bubble `deca`/`hecto`（舊版顯示為 kilo）、`scaling` | 13.6.0+ | 7.17.0+ |

## 7. 官方工具現況

- **Flex Message Simulator**：https://developers.line.biz/flex-simulator/ ，需登入 LINE Developers。可 Import JSON → Apply 預覽。文件沒有說預覽與 app 可能不同，也沒有提到裝置尺寸選項；實測差異見 `device-ios.md`。
- **LINE Bot Designer**：桌面版，2022-01-18 停止開發，官方建議改用 Simulator。
- **line-openapi schema**：結構正確但寬鬆，例如 text `size` 是 `string`（px 字串不檢查格式），沒有 KB 限制。只能當第一層 lint，不能取代 Validate API。

## 8. 授權（LINE Developers Agreement）

- §1.1：「Platform」= LINE SDK + API。§1.2：包含 developers site 上提供的 SDK 與 API。
- §4.3：禁止對 SDK 或 Platform 任何部分 copy（備份除外）、modify、redistribute、decompile、reverse engineer、disassemble。
- 本 skill 不包含 LINE 的程式碼或樣式表：renderer 是獨立實作，規則來自觀察 Simulator 的輸出（等同在瀏覽器 DevTools 檢視），樣式表在預覽時才從 LINE 的公開 CDN 下載、只快取在本機。

## 9. Validate API 實測行為（2026-10-24）

- 合法 bubble → `200`，`valid=yes`
- 不合法 → `400`，`message: "A message (messages[0]) in the request body is invalid"`
- **一次只回報第一個錯誤**：同時有 `size: "huge"` 和缺 `url` 的 image，只回報 `/body/contents/0/size`。修正後要再驗一次才會看到下一個錯誤
- Flex 內部錯誤的 `property` 是相對於 `contents` 的 JSON Pointer（例如 `/size`、`/body/contents/0/size`），不是 `messages[0].contents...`
- `maxLines` 等 Simulator 會忽略的屬性，Validate API 照樣接受
- 權杖：long-lived channel access token 為 172 字元。用 `security add-generic-password -w` 的互動提示輸入會被截成 128 字元 → 401
