"""
名前ピッカー（ランダム並び替え・ランダム指名）
------------------------------------------------
・このサーバーは HTML / CSS / JavaScript を配るだけです。
・名簿ファイルの読み込み、欠席者の指定、並び替え、指名は
  すべて「受講者や講師のブラウザの中」で行います。
・名前（個人情報）はサーバーに送信されず、保存もされません。
  （Content-Security-Policy の connect-src 'none' で
    ブラウザからの通信そのものを禁止しています）
"""
import time

from flask import Flask, render_template

app = Flask(__name__)

# CSS / JS 更新時にブラウザのキャッシュを確実に切り替えるための番号
ASSET_VERSION = str(int(time.time()))

CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'none'",      # fetch / XHR などの外部通信を一切禁止
    "form-action 'none'",      # フォーム送信も禁止
    "frame-ancestors 'none'",
    "base-uri 'none'",
])


@app.after_request
def add_security_headers(response):
    response.headers["Content-Security-Policy"] = CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.route("/")
def index():
    return render_template("index.html", v=ASSET_VERSION)


@app.route("/healthz")
def healthz():
    """デプロイ後の動作確認用"""
    return "ok"


if __name__ == "__main__":
    # PyCharm から実行したとき（開発用）
    app.run(host="127.0.0.1", port=5011, debug=True)
