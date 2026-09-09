# nikkon-line-liff-bridge-test

PoC 専用の LIFF 認証ブリッジです。

- 本番ブリッジ・本番LINE・本番GASとは分離しています。
- このリポジトリには、GSS ID、Messaging APIアクセストークン、チャネルシークレット、参加者情報を保存しません。
- LIFF ID は公開識別子であり秘密情報ではありません。遷移先GAS URLは LIFF URL のクエリパラメータで検証時に渡します。
- 通常クエリと `liff.state` 内のクエリを安全に統合し、許可済みの画面ルートだけを検証用GASへ渡します。

ルート解析テスト: `node --test tests/route-params.test.mjs`

PoC-only LIFF bridge for LINE reception management. No secrets.
