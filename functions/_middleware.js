// 全リクエストの手前で動く認証ゲート。社外の人が入れないようにしつつ、
// 社内の人は一度合言葉を入れれば(Cookieが残る限り)以後は聞かれない方式にする。
// Cloudflare Access(メール認証等)より摩擦が少なく、今回の目的には合っていると判断した。
const COOKIE_NAME = "sk_site_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1年

async function computeToken(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("sk-group-info-feed-access"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function loginPage(errorMessage) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SKグループ 情報フィード</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f9f9fa; font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .box { background: white; padding: 32px; border-radius: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 300px; }
  h1 { font-size: 15px; margin: 0 0 18px; color: #333; }
  input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 14px; box-sizing: border-box; }
  button { width: 100%; padding: 10px; background: #4642A0; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 14px; }
  .err { color: #c0392b; font-size: 12.5px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="box">
    <h1>SKグループ情報フィード</h1>
    ${errorMessage ? `<div class="err">${errorMessage}</div>` : ""}
    <form method="POST" action="/__auth">
      <input type="password" name="password" placeholder="合言葉" autofocus required>
      <button type="submit">入る</button>
    </form>
  </div>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!env.SITE_PASSWORD) {
    // 合言葉が未設定の間は誤ってロックアウトしないよう、ゲートを素通りさせる。
    return next();
  }

  const expectedToken = await computeToken(env.SITE_PASSWORD);

  if (url.pathname === "/__auth" && request.method === "POST") {
    const form = await request.formData();
    const password = form.get("password");
    if (password === env.SITE_PASSWORD) {
      const headers = new Headers({ Location: "/" });
      headers.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${expectedToken}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
      );
      return new Response(null, { status: 302, headers });
    }
    return new Response(loginPage("合言葉が正しくありません"), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  if (getCookie(request, COOKIE_NAME) === expectedToken) {
    return next();
  }

  return new Response(loginPage(), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
