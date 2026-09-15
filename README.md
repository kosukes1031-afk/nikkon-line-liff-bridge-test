# nikkon-line-liff-bridge-test

PoC 専用の LIFF 認証ブリッジです。

- 本番ブリッジ・本番LINE・本番GASとは分離しています。
- このリポジトリには、GSS ID、Messaging APIアクセストークン、チャネルシークレット、参加者情報を保存しません。
- LIFF ID と検証用GAS WebアプリURLは公開識別子であり秘密情報ではありません。遷移先はPoC GASを既定値とし、必要な場合だけLIFF URLの検証済みクエリパラメータで上書きできます。
- 通常クエリと `liff.state` 内のクエリを安全に統合し、許可済みの画面ルートだけを検証用GASへ渡します。

ルート解析テスト: `node --test tests/route-params.test.mjs`

PoC-only LIFF bridge for LINE reception management. No secrets.
