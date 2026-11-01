# 名前ピッカー（namepicker）

名簿テキストファイルを読み込み、欠席者を除いて「ランダム並び替え」「ランダムに1名指名」を行うWebアプリです。

- 公開URL（想定）：`https://telcation.f5.si/namepicker/`
- アプリのポート：`5011`（nginx から `127.0.0.1:5011` へ転送）
- 名前はブラウザの中だけで処理し、**サーバーには送信・保存しません**

## 個人情報を扱わない仕組み

| しくみ | 内容 |
|---|---|
| ブラウザ内処理 | 読み込み・欠席指定・並び替え・指名はすべて JavaScript で実行 |
| 通信の禁止 | `Content-Security-Policy: connect-src 'none'` により、ページからの通信自体をブラウザが拒否 |
| 保存しない | localStorage 等も使わないため、再読み込み・タブを閉じると名簿は消える |
| ログに残らない | サーバーのアクセスログには `GET /` や `GET /static/app.js` しか記録されない |

## 名簿ファイルの書き方

```
# 1行に1名ずつ（# で始まる行と空行は無視）
青木 一郎
石川 花子
```

- 文字コードは UTF-8（BOM あり／なし）と Shift_JIS に対応
- CSV の場合は1列目を名前として扱います
- 実際の名簿は `names*.txt` という名前にしておくと `.gitignore` によりコミットされません

## ファイル構成

```
namepicker/
├─ app.py                     Flask（HTML/CSS/JS を配るだけ）
├─ requirements.txt
├─ templates/index.html
├─ static/style.css
├─ static/app.js              処理の本体（ブラウザ側）
├─ sample_names.txt           動作確認用のダミー名簿
├─ deploy/
│   ├─ namepicker.service     systemd 設定
│   ├─ nginx_namepicker.conf  nginx 追記内容
│   └─ sudoers_namepicker     再起動許可の設定
└─ .github/workflows/deploy.yml  自動デプロイ
```

---

## 1. PyCharm で動かす（ローカル）

Community 版・Professional 版のどちらでも動きます（Flask 専用の実行構成は使わず、通常の Python 実行構成にしてあるため）。

1. zip を展開し、「ファイル」→「開く」で `namepicker` フォルダを選ぶ（「プロジェクトを信頼」を選択）
2. 画面上部に「Python インタープリターが構成されていません」と出たら「インタープリターの構成」→「ローカルインタープリターを追加」→「Virtualenv 環境」→「新規」で、場所を `プロジェクトフォルダ/venv` にして作成
   （通知が出ない場合は「ファイル」→「設定」→「プロジェクト: namepicker」→「Python インタープリター」から設定）
3. 「requirements.txt の依存関係をインストール」の通知が出たら「インストール」（出ない場合はターミナルで `pip install -r requirements.txt`）
4. 右上の実行構成で「app（http://127.0.0.1:5011/）」を選んで ▶ 実行
5. ブラウザで `http://127.0.0.1:5011/` を開き、`sample_names.txt` を読み込んで確認

### GitHub リポジトリにする

1. 「VCS」→「バージョン管理統合を有効にする」→ Git
   （メニューにこの項目が無い場合は、ターミナルで `git init -b main` を実行）
2. 「Git」→「コミット」で全ファイルをコミット（`.github` と `.idea` の設定ファイルも含める）
3. 「Git」→「GitHub」→「GitHub でプロジェクトを共有」でリポジトリを作成・プッシュ

プッシュ時点で自動デプロイが動くので、先に 2章・3章の設定を済ませておくとエラーになりません。

## 2. サーバーの初回設定（1回だけ）

`deploy/` フォルダのファイルは自動デプロイでは転送されません（サーバーの設定ファイルなので、手作業で1回だけ置きます）。

### 2-1. 手元のPCからファイルを送る（PyCharm のターミナル）

```powershell
scp deploy\namepicker.service deploy\sudoers_namepicker deploy\nginx_namepicker.conf home:~/
```

`home` は SSH 設定（`~\.ssh\config`）の Host 名です。設定が無い場合は次のように指定します。

```powershell
scp -P <SSHポート> -i $HOME\.ssh\id_rsa_appuser deploy\namepicker.service deploy\sudoers_namepicker deploy\nginx_namepicker.conf appuser@telcation.f5.si:~/
```

### 2-2. サーバーで設定する（`ssh home` で接続）

```bash
# アプリ置き場
mkdir -p ~/apps/namepicker

# systemd
sudo cp ~/namepicker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable namepicker

# 再起動の許可（GitHub Actions 用）。visudo -c で書式を確認してから置く
sudo visudo -c -f ~/sudoers_namepicker \
  && sudo install -m 440 -o root -g root ~/sudoers_namepicker /etc/sudoers.d/namepicker

# nginx：既存サイト設定の server { listen 443 ssl; ... } の中に
#        ~/nginx_namepicker.conf の内容を貼り付ける
sudo nano /etc/nginx/sites-available/<telcation.f5.si の設定ファイル>
sudo nginx -t && sudo systemctl reload nginx

# 送ったファイルの片付け
rm ~/namepicker.service ~/sudoers_namepicker ~/nginx_namepicker.conf
```

初回デプロイが成功するまでは `systemctl start` はエラーになります（venv がまだ無いため）。

## 3. GitHub の設定

### デプロイ用の SSH 鍵（手元のPCで作成）

```bash
ssh-keygen -t ed25519 -f deploy_namepicker -N "" -C "github-actions-namepicker"
```

- `deploy_namepicker.pub` の中身をサーバーの `~appuser/.ssh/authorized_keys` に追記
- `ssh-keyscan -p <SSHポート> telcation.f5.si` の出力を控える

### リポジトリの Secrets

GitHub のリポジトリ →「Settings」→「Secrets and variables」→「Actions」→「New repository secret」

| 名前 | 値 |
|---|---|
| `SSH_HOST` | `telcation.f5.si` |
| `SSH_PORT` | ルーターで外部に開けている SSH ポート |
| `SSH_USER` | `appuser` |
| `SSH_PRIVATE_KEY` | `deploy_namepicker`（秘密鍵）の中身すべて |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan` の出力 |

## 4. PyCharm からデプロイ

1. 「Git」→「コミット」で変更をコミット
2. 「Git」→「プッシュ」で `main` ブランチへプッシュ
3. GitHub の「Actions」タブで「自宅サーバーへデプロイ（namepicker）」が緑になれば完了

## 注意点

- GitHub のサーバーから自宅へ SSH するため、SSH ポートを外部公開する必要があります。パスワード認証は無効にし、鍵認証のみにしてください。SSH を外部に開けたくない場合は、サーバーに **セルフホストランナー** を入れて `runs-on: self-hosted` に変える方法があります。
- 「ドキュメントフォルダを最初に開く」動作は Chrome / Edge かつ HTTPS のときだけ有効です。Firefox / Safari では通常のファイル選択画面になります。
