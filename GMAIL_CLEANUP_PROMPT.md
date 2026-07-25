# Gmail Auto Cleanup - 実行ガイド

## 概要
このスクリプトは Gmail の自動クリーンアップを行います。
古いメールの削除、ラベル付け、スレッド処理などを自動化します。

## ファイル構成
- `gmail_auto_cleanup.py` - メイン処理スクリプト
- `bulk_process_threads.py` - バルク処理用スクリプト
- `process_all_pages.py` - ページネーション処理
- `gmail_processing_log.txt` - 処理ログ

## 実行方法

```bash
python3 gmail_auto_cleanup.py
```

## 必要な環境変数
- `GMAIL_CREDENTIALS_PATH` - Gmail API認証情報のパス
- `GMAIL_TOKEN_PATH` - Gmail APIトークンのパス

## 処理内容
1. Gmail API に接続
2. 指定条件でメールを検索
3. バルク処理で削除/ラベル付け
4. ログに記録

## 注意事項
- 実行前に必ずバックアップを取ってください
- ドライランモードで確認することをお勧めします

---

更新日時: 2026-07-25
