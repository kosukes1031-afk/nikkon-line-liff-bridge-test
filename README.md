# nikkon-line-liff-bridge-test

PoC 専用の LIFF 認証ブリッジです。

- 本番ブリッジ・本番LINE・本番GASとは分離しています。
- このリポジトリには、GSS ID、Messaging APIアクセストークン、チャネルシークレット、参加者情報を保存しません。
- LIFF ID と検証用GAS WebアプリURLは公開識別子であり秘密情報ではありません。遷移先はコード内のPoC GAS WebアプリURLに固定し、`gas=`による切替はできません。
- 旧bridgeが保存した `gas=` が固定PoC URLと完全一致する場合だけ互換入力として受け付け、宛先へは引き継ぎません。それ以外の `gas=` はquery・`liff.state`・保存領域のいずれから来ても、LINE認証前に拒否します。黙って既定値へ切り替えません。
- 通常クエリと `liff.state` 内のクエリを安全に統合し、許可済みの画面ルートだけを検証用GASへ渡します。

ルート解析テスト: `node --test tests/route-params.test.mjs`

PoC-only LIFF bridge for LINE reception management. No secrets.
