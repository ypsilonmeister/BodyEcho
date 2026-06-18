# Body Image Mirror (ボディイメージ・ミラー)

身体感覚（固有受容覚）の認識や力加減に難しさを抱える児童を支援するための、AR骨格トラッキングを活用したデジタルミラーアプリケーション。

現実のカメラ映像から不要なノイズを完全に削ぎ落とし、単色背景上に関節と骨格の連動という「構造」のみを抽象化して描画することで、脳の視覚的処理負荷を軽減し、自身の身体境界線や運動軌跡を直感的にマッピング・マインドマップ化できるよう設計されています。

---

## ✨ 主な機能 (Core Features)

* **完全な抽象化と余白**: カメラの生映像は一切描画せず、広い黒の背景の中に骨格の線だけを浮かび上がらせます。
* **ネオンカラー・テーマ**: 右半身（シアン）と左半身（マゼンタ）で骨格を明確に色分け。体幹交差などの認識を容易にします（テーマは 4 種類から選択可能）。
* **オートキャリブレーション**: カメラ画角内に全身（または上半身）が 3 秒間収まると、自動的にスケルトン描画をアクティブ化。
* **ジェスチャーリセット (バンザイ)**: カメラから離れた状態で「両手をあたまの上に上げる（Yのポーズ）」を 1.5 秒間維持すると、システムを自動リセットできます（完全ハンズフリー設計）。
* **運動軌跡（トレイル）エフェクト**: 手首・足首に動的な残像エフェクト（DNA螺旋を模した微細な浮遊パーティクル付き）を描画し、運動のスピードと空間軌道を視覚化。
* **Web Audio API シンセサイザー**: ローカルでリアルタイムに効果音（キャリブレーション開始・成功、リセット音）を自動生成。
* **空気と余白の重視**: 操作パネルやフローティングボタンは、マウス操作がない状態が 4 秒間続くと自動的にフェードアウトし、余計なノイズを排除します。

---

## 🛠️ 技術スタック (Technical Stack)

* **推論エンジン**: Google MediaPipe Tasks Vision (PoseLandmarker / WebAssembly)
* **UI フレームワーク**: React + TypeScript + Vite
* **描画エンジン**: HTML5 `<canvas>` API (2D Context) with Retina/DPR Scaling
* **スタイリング**: Vanilla CSS (CSS Variables + Glassmorphism)
* **音声出力**: Web Audio API (ローカルシンセサイザー)

---

## 🚀 ローカルでの開発手順 (Local Development)

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 開発サーバーの起動
```bash
npm run dev
```

### 3. プロダクションビルド
```bash
npm run build
```

---

## 🌐 GitHub Pages へのデプロイ手順 (GitHub Pages Deployment)

本プロジェクトには、GitHub Actions を使用して GitHub Pages へ自動デプロイするワークフローが統合されています。

### 1. リモートリポジトリの追加とプッシュ
GitHub上で新規リポジトリ（名前: `BodyEcho`）を作成し、以下のコマンドを実行してコミットをプッシュします。

```bash
# 既存のローカルコミットをプッシュする場合
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/BodyEcho.git
git branch -M main
git push -u origin main
```

### 2. GitHub リポジトリでの設定
リポジトリの作成後、以下の設定を行います。

1. GitHub リポジトリの **Settings** タブを開きます。
2. 左メニューの **Pages** を選択します。
3. **Build and deployment** セクションの **Source** を `Deploy from a branch` から **`GitHub Actions`** に変更します。

これで、`main`（または `master`）ブランチにコードをプッシュするたびに、GitHub Actions が自動的にビルドを行い、GitHub Pages 上に最新版をホストします。
