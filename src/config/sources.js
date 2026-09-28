// 情報源の登録台帳。「情報源ごとに収集の仕組みを1つ作り、出てきたものを後からカテゴリ分けする」方針に基づく。
//
// type: "direct"  = URLが決まっている定点観測(統計・法令ページ)。差分チェックで新着を検知する
//       "keyword" = ニュース的な内容。Tavilyでのキーワード監視で新着を発見する
// isPrimarySource: 一次情報(官公庁・団体の公式発表)かどうか
// status: "active" | "hold"(保留) | "excluded"(対象外)

export const SOURCES = [
  {
    id: "prpc",
    name: "古紙再生促進センター",
    url: "http://www.prpc.or.jp/",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "monthly",
    status: "active"
  },
  {
    id: "meti",
    name: "経済産業省(資源循環経済小委員会)",
    url: "https://www.meti.go.jp/shingikai/sankoshin/sangyo_gijutsu/resource_circulation/index.html",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "daily", // 開催は不定期のため、日次で見に行き差分があれば拾う
    status: "active",
    note: "経産省サイトはUser-Agent未設定だと403になるため、ブラウザ相当のUser-Agentを付与して取得している。古紙・パルプの案内ページ(paper_consumergoods)は更新されない静的ページだったため、審議会ページに切り替えた。"
  },
  {
    id: "mof-trade",
    name: "財務省貿易統計(税関)",
    url: "https://www.customs.go.jp/toukei/",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "monthly",
    status: "hold",
    note: "対象HSコードの特定と、単純なページ取得では数値に辿り着けない検索システムへの対応方法が未確定のため保留。"
  },
  {
    id: "jpa",
    name: "日本製紙連合会",
    url: "https://www.jpa.gr.jp/",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "monthly",
    status: "active"
  },
  {
    id: "zengenren",
    name: "全国製紙原料商工組合連合会",
    url: "https://zengenren.com/",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "monthly",
    status: "hold",
    note: "公開ページ(トップ・「業界情報・広告」)を確認したが、自社発信の「お知らせ一覧」が存在しない。実質的な情報は「会員専用ページ」の先にある可能性があり、ログインが必要なら利用規約の確認が必要なため保留。"
  },
  {
    id: "kantoshoso",
    name: "関東製紙原料直納商工組合",
    url: "http://www.kantoushoso.com/market/transition.html",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "monthly",
    status: "active"
  },
  {
    id: "junkan-keizai-shimbun",
    name: "循環経済新聞",
    url: "https://www.nippo.co.jp/jk/",
    type: "digest-trace", // ダイジェストを手がかりに一次情報を検索して辿る特殊収集。辿れない場合は不採用
    isPrimarySource: false,
    checkFrequency: "weekly", // 毎週月曜発行
    status: "active",
    note: "トップページの「▼最新号▼」は<np-list>というカスタム要素がhttps://www.nippo.co.jp/json/news-paper/jk{年}.jsonを裏で取得して表示しているだけと判明し、ヘッドレスブラウザなしで直接取得できる。ダイジェストの文章(sentence)自体は使わず、見出し・発信元組織名を手がかりに一次情報をTavilyで検索し、Claudeで内容が一致するか検証したうえで採用する。"
  },
  {
    id: "koshi-journal",
    name: "古紙ジャーナル",
    url: "https://kosijnl.co.jp/",
    type: "keyword",
    isPrimarySource: false,
    checkFrequency: "daily",
    status: "hold",
    note: "社内で有料購読契約あり。KJ online利用規約 第9条(部署外共有禁止)・第12条(無断転載禁止)により、全社配信での利用は古紙ジャーナル社への確認が完了するまで保留。"
  },
  {
    id: "shigen-shinpou",
    name: "資源新報",
    url: "http://www.shigenshinpou.com/",
    type: "keyword",
    isPrimarySource: false,
    checkFrequency: "daily",
    status: "excluded",
    note: "サイトの更新が確認できず、最新情報が取得できないため対象外。"
  },
  {
    id: "env-recycle",
    name: "環境省(資源循環関連報道発表)",
    url: "https://www.env.go.jp/press/recycle/index.html",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "daily",
    status: "active",
    note: "「資源循環」カテゴリに絞られた報道発表一覧。更新頻度が高く、絞り込み不要でそのまま使える。"
  },
  {
    id: "miyagi-pref",
    name: "宮城県",
    url: "https://www.pref.miyagi.jp/release/index.html",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "daily",
    status: "active",
    note: "県庁全体のお知らせ一覧で部署別の絞り込みができないため、タイトルのキーワードフィルタ(isRelevantTopic)を通してから取り込む。"
  },
  {
    id: "sendai-city",
    name: "仙台市",
    url: "https://www.city.sendai.jp/shise/koho/kisha/",
    type: "direct",
    isPrimarySource: true,
    checkFrequency: "daily",
    status: "active",
    note: "市役所全体の記者発表資料(当月分ページ)で部署別の絞り込みができないため、タイトルのキーワードフィルタを通してから取り込む。"
  },
  {
    id: "nikkei-local-tohoku",
    name: "日本経済新聞(地域面・東北)",
    url: "https://www.nikkei.com/local/tohoku/",
    type: "digest-trace",
    isPrimarySource: false,
    checkFrequency: "daily",
    status: "active",
    note: "見出しは無料で見えるが本文は有料会員限定。関連しそうな見出しだけキーワードフィルタで拾い、見出しを手がかりに一次情報(プレスリリース等)をTavily+Claudeの検証付きで検索する。プレスリリースの方が先に出て報道が後追いすることがあるため検索期間は365日と長め。"
  },
  {
    id: "general-keyword-watch",
    name: "一般キーワード監視(Tavily)",
    url: null,
    type: "keyword",
    isPrimarySource: false,
    checkFrequency: "daily",
    status: "active",
    note: "「古紙」関連のキーワードで広く監視し、登録済み情報源以外からの一次・二次情報も拾う。"
  }
];

export function getActiveSources() {
  return SOURCES.filter((s) => s.status === "active");
}
