
// App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Hoccoo Quest (Demo)
 * - Gacha: one pull => 5 quests, with a short "演出" (animation) before revealing
 * - Completion: auto-detected from bulletin board posts (match target + keywords)
 * - No point history (only total points per user)
 * - Reroll: (1) button reroll in gacha (5枚)  (2) post "ランチ（引き直し）" with someone => reroll 5
 * - Storage: localStorage only (demo)
 */

const APP_TITLE = "Hoccoo Quest";
const PASSWORD = "Suwarika";
const QUEST_HAND_SIZE = 5;

// localStorage keys
const LS_AUTH = "hq_auth_v2";
const LS_PEOPLE = "hq_people_v2";
const LS_POSTS = "hq_posts_v2";
const LS_POINTS = "hq_points_v2";
const LS_ACTIVE_QUESTS = "hq_active_quests_v2";
const LS_SEEDED = "hq_seeded_v2";

// ----- helpers -----
const nowISO = () => new Date().toISOString();

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function loadLS(key, fallback) {
  return safeJsonParse(localStorage.getItem(key), fallback);
}
function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function formatJPDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}
function includesAny(text, candidates) {
  const t = normalize(text);
  return candidates.some((c) => t.includes(normalize(c)));
}

// ----- People -----
const DEFAULT_PEOPLE = [
  { id: "p_sales_1", dept: "営業", name: "佐藤" },
  { id: "p_dev_1", dept: "開発", name: "田中" },
  { id: "p_hr_1", dept: "人事", name: "鈴木" },
  { id: "p_cs_1", dept: "CS", name: "高橋" },
  { id: "p_mfg_1", dept: "製造", name: "伊藤" },
];

// ----- Quest generation (AI-like templates) -----
const ACTIONS = [
  {
    key: "drink",
    label: "ジュース",
    base: 5,
    keywords: ["ジュース", "自販機", "飲み物", "買った", "奢った", "差し入れ", "ドリンク"],
    templates: [
      "他部署の【{dept}】{name}さんに自販機でジュースを買ってみよう",
      "【{dept}】{name}さんに飲み物の差し入れをして一言ねぎらいを伝えよう",
    ],
  },
  {
    key: "lunch",
    label: "ランチ",
    base: 12,
    keywords: ["ランチ", "昼", "昼飯", "ご飯", "一緒に食べた", "定食", "食堂"],
    templates: [
      "他部署の【{dept}】{name}さんと一緒にランチに行ってみよう",
      "【{dept}】{name}さんをランチに誘って、最近の困りごとを1つ聞こう",
    ],
  },
  {
    key: "coffee",
    label: "コーヒー",
    base: 8,
    keywords: ["コーヒー", "カフェ", "お茶", "休憩", "一息", "飲んだ"],
    templates: [
      "他部署の【{dept}】{name}さんと10分だけコーヒーブレイクをしよう",
      "【{dept}】{name}さんと短い休憩を取り、最近嬉しかったことを共有しよう",
    ],
  },
  {
    key: "help",
    label: "助ける",
    base: 15,
    keywords: ["手伝", "助け", "対応", "レビュー", "相談", "解決", "サポート", "教えた"],
    templates: [
      "他部署の【{dept}】{name}さんの小さな困りごとを1つ手伝ってみよう",
      "【{dept}】{name}さんに「今、困ってることある？」と聞き、可能なら支援しよう",
    ],
  },
  {
    key: "chat",
    label: "雑談",
    base: 6,
    keywords: ["雑談", "話した", "会話", "あいさつ", "声かけ", "近況", "自己紹介"],
    templates: [
      "他部署の【{dept}】{name}さんに挨拶＋一言雑談してみよう（30秒でOK）",
      "【{dept}】{name}さんと短い会話をして、相手の業務を1つ学ぼう",
    ],
  },
];

function actionByKey(key) {
  return ACTIONS.find((a) => a.key === key) || ACTIONS[0];
}

function buildQuest(people) {
  const target = pick(people);
  const action = pick(ACTIONS);
  const text = pick(action.templates).replace("{dept}", target.dept).replace("{name}", target.name);
  const bonus = Math.random() < 0.25 ? 3 : Math.random() < 0.08 ? 6 : 0;
  const points = action.base + bonus;
  return {
    id: uid("q"),
    createdAt: nowISO(),
    targetPersonId: target.id,
    targetDept: target.dept,
    targetName: target.name,
    actionKey: action.key,
    actionLabel: action.label,
    points,
    text,
    status: "active",
  };
}
function buildQuestHand(people, n = QUEST_HAND_SIZE) {
  return Array.from({ length: n }, () => buildQuest(people));
}

// ----- Post → quest logic -----
function postCompletesQuest({ post, quest }) {
  if (!post || !quest || quest.status !== "active") return false;
  if (!post.withWhomPersonId) return false;
  if (post.withWhomPersonId !== quest.targetPersonId) return false;

  const action = actionByKey(quest.actionKey);

  if (post.type === "complete") {
    if (includesAny(post.body, action.keywords)) return true;
    return includesAny(post.body, ["達成", "完了", "できた", "やった", "クリア"]);
  }
  return includesAny(post.body, action.keywords);
}
function isLunchReroll(post) {
  return post?.type === "lunch" && !!post.withWhomPersonId;
}

// ----- seed sample data -----
function seedIfNeeded() {
  const seeded = loadLS(LS_SEEDED, false);
  if (seeded) return;

  const people = loadLS(LS_PEOPLE, null);
  if (!people || !Array.isArray(people) || people.length === 0) {
    saveLS(LS_PEOPLE, DEFAULT_PEOPLE);
  }

  const samplePosts = [
    {
      id: uid("post"),
      createdAt: nowISO(),
      author: "demo",
      type: "chat",
      withWhomPersonId: "p_sales_1",
      withWhomLabel: "営業 佐藤",
      body: "今日、営業の佐藤さんと挨拶ついでに軽く雑談しました。最近忙しそう…！",
    },
    {
      id: uid("post"),
      createdAt: nowISO(),
      author: "demo",
      type: "lunch",
      withWhomPersonId: "p_dev_1",
      withWhomLabel: "開発 田中",
      body: "開発の田中さんと食堂でランチ（引き直し用の投稿例）",
    },
    {
      id: uid("post"),
      createdAt: nowISO(),
      author: "demo",
      type: "complete",
      withWhomPersonId: "p_hr_1",
      withWhomLabel: "人事 鈴木",
      body: "人事の鈴木さんに飲み物の差し入れ（自販機ジュース）しました！達成！",
    },
  ];

  const existingPosts = loadLS(LS_POSTS, []);
  if (!Array.isArray(existingPosts) || existingPosts.length === 0) {
    saveLS(LS_POSTS, samplePosts);
  }

  saveLS(LS_POINTS, loadLS(LS_POINTS, {}));
  saveLS(LS_ACTIVE_QUESTS, loadLS(LS_ACTIVE_QUESTS, {}));
  saveLS(LS_SEEDED, true);
}

// ----- UI -----
const TABS = [
  { key: "gacha", label: "ガチャ" },
  { key: "board", label: "掲示板" },
  { key: "rank", label: "ランキング" },
];

export default function App() {
  // seed
  useEffect(() => seedIfNeeded(), []);

  // ---- hooks (ALL hooks must be before any conditional return) ----
  // auth
  const [loginName, setLoginName] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [auth, setAuth] = useState(() => loadLS(LS_AUTH, { isAuthed: false, user: "" }));

  // app data
  const [tab, setTab] = useState("gacha");
  const [people, setPeople] = useState(() => loadLS(LS_PEOPLE, DEFAULT_PEOPLE));
  const [posts, setPosts] = useState(() => loadLS(LS_POSTS, []));
  const [pointsByUser, setPointsByUser] = useState(() => loadLS(LS_POINTS, {}));
  const [activeQuestsByUser, setActiveQuestsByUser] = useState(() => loadLS(LS_ACTIVE_QUESTS, {}));

  // gacha演出
  const [isRolling, setIsRolling] = useState(false);
  const [rollText, setRollText] = useState("ガチャ準備中…");

  // admin secret
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);

  // board composer
  const [postType, setPostType] = useState("chat");
  const [withWhom, setWithWhom] = useState("");
  const [postBody, setPostBody] = useState("");

  // admin people add
  const [newDept, setNewDept] = useState("");
  const [newName, setNewName] = useState("");

  // derived
  const currentUser = auth?.user || "";
  const isAuthenticated = !!auth?.isAuthed;

  const leaderboard = useMemo(() => {
    const entries = Object.entries(pointsByUser || {})
      .map(([u, p]) => ({ user: u, points: Number(p || 0) }))
      .sort((a, b) => b.points - a.points || a.user.localeCompare(b.user, "ja"));
    return entries;
  }, [pointsByUser]);

  // persist
  useEffect(() => saveLS(LS_AUTH, auth), [auth]);
  useEffect(() => saveLS(LS_PEOPLE, people), [people]);
  useEffect(() => saveLS(LS_POSTS, posts), [posts]);
  useEffect(() => saveLS(LS_POINTS, pointsByUser), [pointsByUser]);
  useEffect(() => saveLS(LS_ACTIVE_QUESTS, activeQuestsByUser), [activeQuestsByUser]);

  // ---- helpers inside component ----
  function personLabel(pid) {
    const p = (people || []).find((x) => x.id === pid);
    return p ? `${p.dept} ${p.name}` : "";
  }

  function getHand() {
    const hand = activeQuestsByUser[currentUser];
    return Array.isArray(hand) ? hand : [];
  }

  function setHand(hand) {
    setActiveQuestsByUser((prev) => ({ ...(prev || {}), [currentUser]: hand }));
  }

  function addPoints(delta) {
    setPointsByUser((prev) => {
      const base = Number((prev || {})[currentUser] || 0);
      return { ...(prev || {}), [currentUser]: base + Number(delta || 0) };
    });
  }

  function ensureHand() {
    const hand = getHand();
    if (hand.length !== QUEST_HAND_SIZE) {
      setHand(buildQuestHand(people, QUEST_HAND_SIZE));
    }
  }

  // after login: ensure existing hand shape (but don't auto-roll animation)
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    ensureHand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUser, people]);

  function runGachaAnimationThen(fnAfter) {
    setIsRolling(true);
    const lines = ["ガチャ起動…", "候補を生成中…", "マッチング中…", "完成！"];
    let i = 0;
    setRollText(lines[i]);
    const t = setInterval(() => {
      i += 1;
      if (i < lines.length) setRollText(lines[i]);
    }, 350);

    setTimeout(() => {
      clearInterval(t);
      fnAfter?.();
      setIsRolling(false);
    }, 1300);
  }

  // ---- actions ----
  function handleLogin(e) {
    e.preventDefault();
    const u = loginName.trim();
    if (!u) return alert("ユーザー名を入力してください");
    if (loginPass !== PASSWORD) return alert("パスワードが違います");
    setAuth({ isAuthed: true, user: u });
    setTab("gacha");
    setLoginPass("");
  }

  function logout() {
    setAuth({ isAuthed: false, user: "" });
    setLoginName("");
    setLoginPass("");
    setIsAdminOpen(false);
  }

  function secretAdminClick() {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => (clickCountRef.current = 0), 2000);

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setIsAdminOpen((v) => !v);
      setTab("board");
    }
  }

  function gachaPull() {
    runGachaAnimationThen(() => {
      setHand(buildQuestHand(people, QUEST_HAND_SIZE));
    });
  }

  function submitPost(e) {
    e.preventDefault();
    if (!isAuthenticated) return;

    const body = postBody.trim();
    if (!body) return alert("投稿内容を入力してください");

    const withId = withWhom || "";
    const post = {
      id: uid("post"),
      createdAt: nowISO(),
      author: currentUser,
      type: postType, // chat | complete | lunch
      withWhomPersonId: withId || null,
      withWhomLabel: withId ? personLabel(withId) : "",
      body,
    };
    setPosts((prev) => [post, ...(prev || [])]);

    // reroll on lunch post
    if (isLunchReroll(post)) {
      // lunch reroll should also feel like gacha -> use animation
      runGachaAnimationThen(() => setHand(buildQuestHand(people, QUEST_HAND_SIZE)));
    }

    // auto completion check (hit one of 5)
    const hand = getHand().filter((q) => q?.status === "active");
    const hit = hand.find((q) => postCompletesQuest({ post, quest: q }));

    if (hit) {
      addPoints(hit.points);

      // replace completed quest with a new one (keep 5)
      const remaining = hand.filter((q) => q.id !== hit.id);
      const next = [...remaining, buildQuest(people)];
      setHand(next);
      setTab("gacha");
    }

    setPostBody("");
    setWithWhom("");
    setPostType("chat");
  }

  function addPerson(e) {
    e.preventDefault();
    const dept = newDept.trim();
    const name = newName.trim();
    if (!dept || !name) return alert("部署と名前を入力してください");
    setPeople((prev) => [{ id: uid("p"), dept, name }, ...(prev || [])]);
    setNewDept("");
    setNewName("");
  }

  function removePerson(pid) {
    if (!confirm("この人物を削除しますか？")) return;
    setPeople((prev) => (prev || []).filter((p) => p.id !== pid));
  }

  // ---- render (now safe to conditionally return) ----
  if (!isAuthenticated) {
    return (
      <div className="hq-root">
        <div className="hq-card">
          <h1 className="hq-title" onClick={secretAdminClick} role="button" tabIndex={0}>
            {APP_TITLE}
          </h1>
          <p className="hq-subtitle">掲示板投稿でクエストを達成して、部署を越えた会話を増やす。</p>

          <form className="hq-login" onSubmit={handleLogin}>
            <label className="hq-field">
              <span>ユーザー名</span>
              <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="例）T124041" />
            </label>
            <label className="hq-field">
              <span>パスワード</span>
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Suwarika" />
            </label>
            <button className="hq-btn hq-btn--primary" type="submit">
              ログイン
            </button>
          </form>

          <div className="hq-hint">
            <div className="hq-hint__title">使い方メモ</div>
            <ul>
              <li>ガチャを押す → 演出後に「5枚クエスト」が出る</li>
              <li>掲示板の投稿で自動判定 → 達成するとポイント加算＆クエスト1枚補充</li>
              <li>どれもしたくない時は「ランチ（引き直し）」投稿で5枚全部を引き直し</li>
            </ul>
          </div>

          <div className="hq-loginhint">※ デモ用：ユーザー名は任意（ランキングに表示されます）</div>
        </div>
      </div>
    );
  }

  const myPoints = Number(pointsByUser[currentUser] || 0);
  const hand = getHand().filter((q) => q?.status === "active");

  return (
    <div className="hq-root">
      <div className="hq-card">
        <header className="hq-topbar">
          <div className="hq-brand">
            <h1 className="hq-title hq-title--small" onClick={secretAdminClick} role="button" tabIndex={0}>
              {APP_TITLE}
            </h1>
            <div className="hq-userline">
              <span className="hq-chip">ログイン中：{currentUser}</span>
              <span className="hq-chip">合計ポイント：{myPoints}</span>
            </div>
          </div>
          <button className="hq-btn" onClick={logout}>
            ログアウト
          </button>
        </header>

        <nav className="hq-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`hq-tab ${tab === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "gacha" && (
          <section className="hq-panel">
            <div className="hq-panel__title">ガチャ（1回で5枚）</div>

            {isRolling ? (
              <div className="hq-rollstage" aria-live="polite">
                <div className="hq-rollpack">
                  <div className="hq-rollshine" />
                  <div className="hq-rolllabel">{rollText}</div>
                  <div className="hq-rolldots">
                    <span className="hq-dot" />
                    <span className="hq-dot" />
                    <span className="hq-dot" />
                  </div>
                </div>
              </div>
            ) : hand.length === 0 ? (
              <div className="hq-empty">
                まだクエストがありません。下のボタンでガチャを引いてください。
              </div>
            ) : (
              <div className="hq-qgrid">
                {hand.map((q) => (
                  <div key={q.id} className="hq-qcard">
                    <div className="hq-qmain">{q.text}</div>
                    <div className="hq-qmeta">
                      <span className="hq-badge">{q.actionLabel}</span>
                      <span className="hq-badge">+{q.points}pt</span>
                      <span className="hq-badge hq-badge--subtle">
                        対象：{q.targetDept} {q.targetName}
                      </span>
                    </div>
                    <div className="hq-qnote">※達成は「掲示板投稿」で自動判定（相手＋キーワード）</div>
                  </div>
                ))}
              </div>
            )}

            {/* bottom buttons */}
            <div className="hq-gachabottom">
              <button className="hq-btn" onClick={() => setTab("board")} disabled={isRolling}>
                掲示板で投稿して達成
              </button>
              <button className="hq-btn hq-btn--primary" onClick={gachaPull} disabled={isRolling}>
                ガチャを引く（5枚）
              </button>
            </div>
          </section>
        )}

        {tab === "board" && (
          <section className="hq-panel">
            <div className="hq-panel__title">社内掲示板</div>

            {isAdminOpen && (
              <div className="hq-admin">
                <div className="hq-admin__title">管理者：人物リスト編集（タイトル5回クリックで開閉）</div>

                <form className="hq-admin__form" onSubmit={addPerson}>
                  <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="部署（例：品質）" />
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名前（例：山本）" />
                  <button className="hq-btn hq-btn--primary" type="submit">
                    追加
                  </button>
                </form>

                <div className="hq-people">
                  {(people || []).map((p) => (
                    <div key={p.id} className="hq-personrow">
                      <span className="hq-personchip">
                        {p.dept} {p.name}
                      </span>
                      <button className="hq-btn hq-btn--danger" onClick={() => removePerson(p.id)}>
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form className="hq-postform" onSubmit={submitPost}>
              <div className="hq-row">
                <label className="hq-field">
                  <span>投稿タイプ</span>
                  <select value={postType} onChange={(e) => setPostType(e.target.value)}>
                    <option value="chat">雑談</option>
                    <option value="complete">完了報告（クエスト達成）</option>
                    <option value="lunch">ランチ（引き直し）</option>
                  </select>
                </label>

                <label className="hq-field">
                  <span>一緒に（クエスト判定のため推奨）</span>
                  <select value={withWhom} onChange={(e) => setWithWhom(e.target.value)}>
                    <option value="">未選択</option>
                    {(people || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.dept} {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="hq-field">
                <span>本文</span>
                <textarea
                  value={postBody}
                  onChange={(e) => setPostBody(e.target.value)}
                  placeholder="例）自販機でジュース買いました！/ ランチ行きました！/ 10分雑談できた など"
                  rows={4}
                />
              </label>

              <div className="hq-row">
                <button className="hq-btn hq-btn--primary" type="submit" disabled={isRolling}>
                  投稿
                </button>
                <div className="hq-smallnote">
                  ・達成は<strong>「相手」</strong>と<strong>キーワード</strong>で自動判定します。<br />
                  ・「ランチ（引き直し）」は<strong>5枚全部を引き直し</strong>します（ポイントは増えません）。
                </div>
              </div>
            </form>

            <div className="hq-postlist">
              {(posts || []).map((p) => (
                <article key={p.id} className="hq-post">
                  <div className="hq-post__head">
                    <div className="hq-post__author">{p.author}</div>
                    <div className="hq-post__meta">
                      <span className={`hq-tag hq-tag--${p.type}`}>{p.type === "chat" ? "雑談" : p.type === "complete" ? "完了報告" : "ランチ"}</span>
                      {p.withWhomLabel ? <span className="hq-tag hq-tag--who">with {p.withWhomLabel}</span> : null}
                      <span className="hq-time">{formatJPDate(p.createdAt)}</span>
                    </div>
                  </div>
                  <div className="hq-post__body">{p.body}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "rank" && (
          <section className="hq-panel">
            <div className="hq-panel__title">ポイントランキング</div>
            {leaderboard.length === 0 ? (
              <div className="hq-empty">まだポイントがありません。</div>
            ) : (
              <div className="hq-rank">
                {leaderboard.map((r, idx) => (
                  <div key={r.user} className={`hq-rankrow ${r.user === currentUser ? "is-me" : ""}`}>
                    <div className="hq-rankno">{idx + 1}</div>
                    <div className="hq-rankuser">{r.user}</div>
                    <div className="hq-rankpts">{r.points} pt</div>
                  </div>
                ))}
              </div>
            )}
            <div className="hq-smallnote">※デモではブラウザ内のローカル保存です。</div>
          </section>
        )}
      </div>
    </div>
  );
}
