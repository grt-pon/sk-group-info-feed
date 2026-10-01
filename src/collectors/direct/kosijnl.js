import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";
import { loginToKosijnl } from "../../lib/kosijnlAuth.js";

export const SOURCE_ID = "kosijnl";
export const SOURCE_NAME = "古紙ジャーナル";
const LATEST_URL = "https://kosijnl.co.jp/latest";
const ARTICLE_URL = (id) => `https://kosijnl.co.jp/backnumber/${id}.html`;

/**
 * 「YYYY年M月D日」形式の日付をISO文字列に変換する。
 * @param {string} text
 * @returns {string | null}
 */
function parseJapaneseDate(text) {
  const m = text && text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
}

/**
 * <br>をスペースに変えてから.text()するヘルパー。見出しがfont/br混じりのHTMLのため。
 * @param {cheerio.Cheerio<any>} $el
 */
function cleanText($, $el) {
  const $clone = $el.clone();
  $clone.find("br").replaceWith(" ");
  return $clone.text().replace(/\s+/g, " ").trim();
}

/**
 * ログイン済みのCookieで「最新号」ページを取得し、今号の記事一覧(リード記事+新着記事)を返す。
 * @param {string} cookie
 * @returns {Promise<Array<{ id: string, title: string, publishedAt: string | null }>>}
 */
async function fetchLatestIssueArticles(cookie) {
  const res = await fetch(LATEST_URL, { headers: { Cookie: cookie } });
  if (!res.ok) {
    throw new Error(`古紙ジャーナル「最新号」ページの取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];

  // リード記事(ページ自体の記事)。postid-XXXXX がbodyクラスに入っている。
  const bodyClass = $("body").attr("class") || "";
  const leadIdMatch = bodyClass.match(/postid-(\d+)/);
  if (leadIdMatch) {
    const title = cleanText($, $("h1#title").first());
    const publishedAt = parseJapaneseDate($(".meta-info .mata-date").first().text());
    if (title) {
      items.push({ id: leadIdMatch[1], title, publishedAt });
    }
  }

  // 「新着記事」セクションの各記事。div.meta-info の直後に div.link-cover > a[href] が続く構造。
  $("#arrival-article").nextAll("div.link-cover").each((_, linkCover) => {
    const $linkCover = $(linkCover);
    const $a = $linkCover.find("a").first();
    const href = $a.attr("href");
    const idMatch = href && href.match(/backnumber\/(\d+)\.html/);
    if (!idMatch) return;
    const title = cleanText($, $a.find("h3.key-icon").first());
    const publishedAt = parseJapaneseDate($linkCover.prev("div.meta-info").find(".mata-date").text());
    if (title) {
      items.push({ id: idMatch[1], title, publishedAt });
    }
  });

  return items;
}

/**
 * ログイン済みのCookieで記事本文(有料会員限定部分)を取得する。
 * @param {string} id
 * @param {string} cookie
 * @returns {Promise<string | null>}
 */
async function fetchArticleBody(id, cookie) {
  const res = await fetch(ARTICLE_URL(id), { headers: { Cookie: cookie } });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);
  const text = $("#post-contents").text().replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * 古紙ジャーナル(有料会員サイト)にログインし、今号の記事を取り込みパイプラインに渡す。
 * 元記事はログインしないと読めないため、ここで生成する要約だけで内容が伝わることを重視する
 * (全文はcopyright上の理由から保存しない。ingestItem/Claude要約の既存方針と同じ)。
 */
export async function collectKosijnl() {
  const cookie = await loginToKosijnl();
  const issueArticles = await fetchLatestIssueArticles(cookie);

  const results = [];
  for (const article of issueArticles) {
    const body = await fetchArticleBody(article.id, cookie);
    const result = await ingestItem({
      title: article.title,
      rawText: body ? `${article.title}\n\n${body}` : article.title,
      sourceUrl: ARTICLE_URL(article.id),
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      isPrimarySource: false,
      publishedAt: article.publishedAt
    });
    results.push({ title: article.title, ...result });
  }
  return results;
}
