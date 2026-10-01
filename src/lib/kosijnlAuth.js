import "dotenv/config";

const LOGIN_URL = "https://kosijnl.co.jp/kosijnl_wp/wp-login.php";

/**
 * 古紙ジャーナル(有料会員サイト)にログインし、以降のfetchで使うCookieヘッダ文字列を返す。
 * 標準的なWordPressログイン(wp-login.php への log/pwd POST)で、ヘッドレスブラウザは不要。
 * @returns {Promise<string>} "wordpress_logged_in_xxx=...; wordpress_sec_xxx=...\" のようなCookieヘッダ値
 */
export async function loginToKosijnl() {
  const username = process.env.KOSIJNL_USERNAME;
  const password = process.env.KOSIJNL_PASSWORD;
  if (!username || !password) {
    throw new Error("KOSIJNL_USERNAME / KOSIJNL_PASSWORD が設定されていません。.env を設定してください。");
  }

  const body = new URLSearchParams({
    log: username,
    pwd: password,
    "wp-submit": "ログイン",
    redirect_to: "https://kosijnl.co.jp/latest"
  });

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual"
  });

  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const loginCookies = setCookies.filter((c) => c.startsWith("wordpress_logged_in_") || c.startsWith("wordpress_sec_"));
  if (loginCookies.length === 0) {
    throw new Error("古紙ジャーナルへのログインに失敗しました(認証情報を確認してください)。");
  }

  return loginCookies.map((c) => c.split(";")[0]).join("; ");
}
