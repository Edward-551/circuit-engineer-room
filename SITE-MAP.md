# my-site 整理メモ

このZIPは、GitHub Pagesにそのまま配置できるように `.git` フォルダを除外した整理版です。

## 公開ページ

- `index.html`：トップページ
- `tools.html`：ツール一覧
- `articles.html`：記事一覧

## ツール

- `tool-resistor.html` + `tool-resistor.js`：抵抗ネットワーク計算ツール
- `tool-llc.html` + `llc-tool.css` + `llc-tool.js`：LLC設計ツール
- `tool-transformer.html`：トランス設計ツール（HTML内に計算JSを含む）

## 記事

- `article-001.html`：抵抗計算をExcelではなくWebツール化した理由
- `article-002.html`：抵抗ネットワーク計算で見落としやすいポイント
- `article-003.html`：LLCのFHAを式変形から理解する

## 共通ファイル

- `style.css`：基本デザイン・共通レイアウト
- `script.js`：年表示、ヘッダー影、準備中リンク処理
- `README.md`：GitHub用メモ

## 今回の整理内容

- `.git` フォルダを除外して配布用ZIPを軽量化
- 既存リンクの参照先を確認
- 外部JSの構文チェック
- `tool-transformer.html` の余分な `</script>` を削除
- `article-003.html` のヘッダー表記を `回路エンジニアの部屋` に統一

## 注意

LLC設計ツールは `llc-tool.css` を単独で使う構成です。動いていた版を優先して、今回は共通CSSへの統合はしていません。
