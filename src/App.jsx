// App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import boardSamplePosts from './boardPosts.json';

/**
 * Hoccoo Quest (Demo)
 * - Gacha: one pull => 5 quests, with a short "演出" (animation) before revealing
 * - Completion: auto-detected from bulletin board posts (match target + keywords)
 * - No point history (only total points per user)
 * - Reroll: (1) "もう一度ガチャを引く" → 掲示板の投稿フォームへ誘導（ランチ投稿で引き直し）
 *           (2) post "ランチ（引き直し）" with someone => reroll 5
 * - Storage: localStorage only (demo)
 */

const APP_TITLE = 'Hoccoo Quest';
const PASSWORD = 'Suwarika';
const QUEST_HAND_SIZE = 5;

// localStorage keys
const LS_AUTH = 'hq_auth_v2';
const LS_PEOPLE = 'hq_people_v2';
const LS_POSTS = 'hq_posts_v2';
const LS_POINTS = 'hq_points_v2';
const LS_ACTIVE_QUESTS = 'hq_active_quests_v2';
const LS_SEEDED = 'hq_seeded_v2';

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
function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function normalize(s) {
  return (s || '').toString().trim().toLowerCase();
}
function includesAny(text, candidates) {
  const t = normalize(text);
  return candidates.some((c) => t.includes(normalize(c)));
}

// ----- People -----
const DEFAULT_PEOPLE = [
  { id: 'p_sales_1', dept: '営業', name: '佐藤' },
  { id: 'p_dev_1', dept: '開発', name: '田中' },
  { id: 'p_hr_1', dept: '人事', name: '鈴木' },
  { id: 'p_cs_1', dept: 'CS', name: '高橋' },
  { id: 'p_mfg_1', dept: '製造', name: '伊藤' },
];

// ----- Quest generation (AI-like templates) -----
const ACTIONS = [
  {
    key: 'greet',
    label: 'すれ違い',
    base: 4,
    keywords: ['挨拶', '会釈', '声かけ', '一言'],
    templates: [
      '【{dept}】{name}さんと、すれ違いに一言だけ交わしてみる',
      '【{dept}】{name}さんと、会釈＋一言してみる',
    ],
  },
  {
    key: 'same_space',
    label: '同じ空間',
    base: 6,
    keywords: ['一緒に', '近く', '同じ', '少し'],
    templates: [
      '【{dept}】{name}さんと、同じ空間に少しだけ居てみる',
      '【{dept}】{name}さんと、近くで少しだけ過ごしてみる',
    ],
  },
  {
    key: 'drink',
    label: '飲み物',
    base: 9,
    keywords: ['自販機', '飲み物', 'お茶', 'コーヒー'],
    templates: [
      '【{dept}】{name}さんと、飲み物を取りに行くタイミングを合わせてみる',
      '【{dept}】{name}さんと、飲み物の時間を少し重ねてみる',
    ],
  },
  {
    key: 'lunch',
    label: 'ランチ',
    base: 13,
    keywords: ['ランチ', '昼', 'ご飯'],
    templates: [
      '【{dept}】{name}さんと、ランチのタイミングを合わせてみる',
      '【{dept}】{name}さんと、同じ時間帯に昼休憩を取ってみる',
    ],
  },
  {
    key: 'overlap',
    label: '時間の重なり',
    base: 15,
    keywords: ['一緒に', '少し', 'タイミング'],
    templates: [
      '【{dept}】{name}さんと、何も決めずに少し時間を重ねてみる',
      '【{dept}】{name}さんと、数分だけ行動を重ねてみる',
    ],
  },
];

function actionByKey(key) {
  return ACTIONS.find((a) => a.key === key) || ACTIONS[0];
}

function buildQuest(people) {
  const target = pick(people);
  const action = pick(ACTIONS);
  const text = pick(action.templates)
    .replace('{dept}', target.dept)
    .replace('{name}', target.name);
  const bonus = Math.random() < 0.25 ? 3 : Math.random() < 0.08 ? 6 : 0;
  const points = action.base + bonus;
  return {
    id: uid('q'),
    createdAt: nowISO(),
    targetPersonId: target.id,
    targetDept: target.dept,
    targetName: target.name,
    actionKey: action.key,
    actionLabel: action.label,
    points,
    text,
    status: 'active',
  };
}
function buildQuestHand(people, n = QUEST_HAND_SIZE) {
  return Array.from({ length: n }, () => buildQuest(people));
}

// ----- Post → quest logic -----
function postCompletesQuest({ post, quest }) {
  if (!post || !quest || quest.status !== 'active') return false;
  if (!post.withWhomPersonId) return false;
  if (post.withWhomPersonId !== quest.targetPersonId) return false;

  const action = actionByKey(quest.actionKey);

  if (post.type === 'complete') {
    if (includesAny(post.body, action.keywords)) return true;
    return includesAny(post.body, ['達成', '完了', 'できた', 'やった', 'クリア']);
  }
  return includesAny(post.body, action.keywords);
}
function isLunchReroll(post) {
  return post?.type === 'lunch' && !!post.withWhomPersonId;
}

// ----- seed sample data -----
function seedIfNeeded() {
  const seeded = loadLS(LS_SEEDED, false);
  if (seeded) return;

  const people = loadLS(LS_PEOPLE, null);
  if (!people || !Array.isArray(people) || people.length === 0) {
    saveLS(LS_PEOPLE, DEFAULT_PEOPLE);
  }

  const samplePosts = (Array.isArray(boardSamplePosts) ? boardSamplePosts : []).map((p) => ({
    id: uid('post'),
    createdAt: nowISO(),
    author: p.author || 'demo',
    type: p.type || 'chat',
    withWhomPersonId: p.withWhomPersonId || '',
    withWhomLabel: p.withWhomLabel || '',
    body: p.body || '',
    imageUrl: p.imageUrl || '',
  }));

  const existingPosts = loadLS(LS_POSTS, []);
  if (!Array.isArray(existingPosts) || existingPosts.length === 0) {
    saveLS(LS_POSTS, samplePosts);
  }

  saveLS(LS_POINTS, loadLS(LS_POINTS, {}));
  saveLS(LS_ACTIVE_QUESTS, loadLS(LS_ACTIVE_QUESTS, {}));
  saveLS(LS_SEEDED, true);
}

function postTypeLabel(type) {
  switch (type) {
    case 'complete':
      return '達成報告';
    case 'lunch':
      return 'ランチ';
    case 'share':
      return 'できごと共有';
    case 'chat':
    default:
      return '雑談';
  }
}
function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}/${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return '';
  }
}

// ----- UI -----
const TABS = [
  { key: 'gacha', label: 'ガチャ' },
  { key: 'board', label: '掲示板' },
  { key: 'rank', label: 'ランキング' },
];

export default function App() {
  // seed
  useEffect(() => seedIfNeeded(), []);

  // auth
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [auth, setAuth] = useState(() => loadLS(LS_AUTH, { isAuthed: false, user: '' }));

  // app data
  const [tab, setTab] = useState('gacha');
  const [people, setPeople] = useState(() => loadLS(LS_PEOPLE, DEFAULT_PEOPLE));
  const [posts, setPosts] = useState(() => loadLS(LS_POSTS, []));
  const [pointsByUser, setPointsByUser] = useState(() => loadLS(LS_POINTS, {}));
  const [activeQuestsByUser, setActiveQuestsByUser] = useState(() => loadLS(LS_ACTIVE_QUESTS, {}));

  // gacha演出
  const [isRolling, setIsRolling] = useState(false);
  const [rollText, setRollText] = useState('ガチャ準備中…');

  // admin secret
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);

  // board composer
  const [postType, setPostType] = useState('chat');
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [withWhom, setWithWhom] = useState('');
  const [postBody, setPostBody] = useState('');

  // completion report screen
  const [lastReport, setLastReport] = useState(null);

  // admin people add
  const [newDept, setNewDept] = useState('');
  const [newName, setNewName] = useState('');

  // derived
  const currentUser = auth?.user || '';
  const isAuthenticated = !!auth?.isAuthed;

  const DEMO_EMPLOYEE_NAMES = [
    'たなかさん',
    'さとぴー',
    '営業の佐藤',
    'デザイン係Y',
    'もっちー',
    'H.R.すずき',
    '開発たろう',
    'きむ兄',
    'いとう先輩',
    'CSみさき',
  ];

  const leaderboard = useMemo(() => {
    const real = Object.entries(pointsByUser || {})
      .map(([u, p]) => ({ user: u, points: Number(p || 0), isDemo: false }))
      .sort((a, b) => b.points - a.points);

    const demoEmployees = DEMO_EMPLOYEE_NAMES.map((name, i) => ({
      user: name,
      points: 120 - i * 7,
      isDemo: true,
    }));

    const merged = [...real];
    for (const d of demoEmployees) {
      if (!merged.find((r) => r.user === d.user)) merged.push(d);
      if (merged.length >= 10) break;
    }
    return merged.slice(0, 10);
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
    return p ? `${p.dept} ${p.name}` : '';
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

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    ensureHand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUser, people]);

  function runGachaAnimationThen(fnAfter) {
    setIsRolling(true);
    const lines = ['ガチャ起動…', '候補を生成中…', 'マッチング中…', '完成！'];
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
    if (!u) return alert('ユーザー名を入力してください');
    if (loginPass !== PASSWORD) return alert('パスワードが違います');
    setAuth({ isAuthed: true, user: u });
    setTab('gacha');
    setLoginPass('');
  }

  function logout() {
    setAuth({ isAuthed: false, user: '' });
    setLoginName('');
    setLoginPass('');
    setIsAdminOpen(false);
  }

  // 管理者シークレット（5回でON/OFF）
  function secretAdminClick() {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => (clickCountRef.current = 0), 2000);

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setIsAdminOpen((v) => !v);
      setTab('board');
    }
  }

  // ガチャ→掲示板→投稿フォーム（達成報告テンプレ）
  function startQuestReportFromCard(q) {
    if (!q) return;
    const action = actionByKey(q.actionKey);
    const kw = action?.keywords?.[0] ? action.keywords[0] : '達成';
    setPostType('complete');
    setWithWhom(q.targetPersonId || '');
    setPostBody(`【達成報告】${q.text}\n${kw}できました！`);
    setTab('board');
    setIsComposerOpen(true);
  }

  // ★ここが今回の追加：もう一度引く → 投稿フォームへ（ランチ＝引き直し投稿）
  function goToRerollPost() {
    setPostType('lunch');
    setWithWhom('');
    setPostBody('【ランチ（引き直し）】誰かと一緒に過ごしました！\n（相手を選ぶと引き直しが発動します）');
    setTab('board');
    setIsComposerOpen(true);
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
    if (!body) return alert('投稿内容を入力してください');

    const withId = withWhom || '';
    const post = {
      id: uid('post'),
      createdAt: nowISO(),
      author: currentUser,
      type: postType,
      withWhomPersonId: withId || null,
      withWhomLabel: withId ? personLabel(withId) : '',
      body,
    };

    setPosts((prev) => [post, ...(prev || [])]);

    // ランチ（引き直し）：相手が選ばれている場合のみ発動
    if (isLunchReroll(post)) {
      runGachaAnimationThen(() => setHand(buildQuestHand(people, QUEST_HAND_SIZE)));
    }

    // クエスト達成チェック
    const hand = getHand().filter((q) => q?.status === 'active');
    const hit = hand.find((q) => postCompletesQuest({ post, quest: q }));

    if (hit) {
      addPoints(hit.points);

      const remaining = hand.filter((q) => q.id !== hit.id);
      const next = [...remaining, buildQuest(people)];
      setHand(next);

      setLastReport({
        quest: hit,
        post: {
          ...post,
          withWhomLabel: post.withWhomPersonId ? personLabel(post.withWhomPersonId) : '',
        },
      });
      setTab('report');
    }

    setIsComposerOpen(false);
    setPostBody('');
    setWithWhom('');
    setPostType('chat');
  }

  function addPerson(e) {
    e.preventDefault();
    const dept = newDept.trim();
    const name = newName.trim();
    if (!dept || !name) return alert('部署と名前を入力してください');
    setPeople((prev) => [{ id: uid('p'), dept, name }, ...(prev || [])]);
    setNewDept('');
    setNewName('');
  }

  function removePerson(pid) {
    if (!confirm('この人物を削除しますか？')) return;
    setPeople((prev) => (prev || []).filter((p) => p.id !== pid));
  }

  // ---- render ----
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
              <input
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="例)Taro"
              />
            </label>
            <label className="hq-field">
              <span>パスワード</span>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Suwarika"
              />
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
              <li>「もう一度引く」は掲示板へ移動 →「ランチ（引き直し）」投稿で5枚全部を引き直し</li>
            </ul>
          </div>

          <div className="hq-loginhint">※ デモ用：ユーザー名は任意（ランキングに表示されます）</div>
        </div>
      </div>
    );
  }

  const myPoints = Number(pointsByUser[currentUser] || 0);
  const hand = getHand().filter((q) => q?.status === 'active');

  return (
    <div className="hq-root">
      <div className="hq-card">
        <header className="hq-topbar">
          <div className="hq-brand">
            <h1
              className="hq-title hq-title--small"
              onClick={secretAdminClick}
              role="button"
              tabIndex={0}
            >
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
            <button
              key={t.key}
              className={`hq-tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'gacha' && (
          <section className="hq-panel">
            <div className="hq-panel__title">ガチャ</div>

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
              <div className="hq-empty">まだクエストがありません。下のボタンでガチャを引いてください。</div>
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

                    <div
                      className="hq-gachabottom"
                      style={{
                        justifyContent: 'flex-start',
                        borderTop: 'none',
                        paddingTop: 12,
                        marginTop: 10,
                      }}
                    >
                      <button className="hq-btn hq-btn--primary" onClick={() => startQuestReportFromCard(q)}>
                        掲示板で達成報告
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="hq-gachabottom">
              {/* ★ここを変更：再ガチャではなく投稿フォームへ */}
              <button className="hq-btn" onClick={goToRerollPost} disabled={isRolling}>
                もう一度ガチャを引く
              </button>

              {/* 通常の5枚ガチャ（初回や通常更新用） */}
              <button className="hq-btn hq-btn--primary" onClick={gachaPull} disabled={isRolling}>
                ガチャを引く（5枚）
              </button>
            </div>
          </section>
        )}

        {tab === 'report' && (
          <section className="hq-panel">
            <div className="hq-panel__title">達成報告</div>

            {!lastReport ? (
              <div className="hq-empty">まだ達成報告はありません。</div>
            ) : (
              <div className="hq-report">
                <div className="hq-report__top">
                  <div className="hq-report__check">✓</div>
                  <div>
                    <div className="hq-report__title">クエスト達成を報告しました！</div>
                    <div className="hq-smallnote">
                      ここが「達成報告された画面」のイメージです（この内容が掲示板にも投稿されています）。
                    </div>
                  </div>
                </div>

                <div className="hq-post" style={{ marginTop: 12 }}>
                  <div className="hq-post__head">
                    <div className="hq-post__author">{lastReport.post.author}</div>
                    <div className="hq-post__meta">
                      <span className="hq-tag hq-tag--complete">完了報告</span>
                      <span className="hq-tag hq-tag--who">一緒に：{lastReport.post.withWhomLabel || '—'}</span>
                      <span className="hq-time">{fmtTime(lastReport.post.createdAt)}</span>
                    </div>
                  </div>
                  <div className="hq-post__body">{lastReport.post.body}</div>
                </div>

                <div className="hq-report__bottom">
                  <div className="hq-report__reward">+{lastReport.quest.points}pt を獲得！</div>
                  <div className="hq-row">
                    <button className="hq-btn hq-btn--primary" onClick={() => setTab('gacha')}>
                      次のクエストへ
                    </button>
                    <button className="hq-btn" onClick={() => setTab('board')}>
                      掲示板で見る
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'board' && (
          <section className="hq-panel">
            <div
              className="hq-panel__title hq-panel__title--clickable"
              onClick={secretAdminClick}
              title="（タイトルを5回クリックで管理者表示）"
            >
              社内掲示板
            </div>

            <div className="hq-postlist">
              {(posts || []).length === 0 ? (
                <div className="hq-empty">まだ投稿がありません。</div>
              ) : (
                [...posts]
                  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                  .map((p) => (
                    <div className="hq-post" key={p.id}>
                      <div className="hq-post__meta">
                        <div className="hq-post__type">{postTypeLabel(p.type)}</div>
                        <div className="hq-post__who">{p.withWhomLabel ? `with ${p.withWhomLabel}` : ''}</div>
                        <div className="hq-post__time">{fmtTime(p.createdAt)}</div>
                      </div>
                      <div className="hq-post__body">{p.body}</div>
                      {p.imageUrl ? (
                        <div className="hq-post__imgwrap">
                          <img className="hq-post__img" src={p.imageUrl} alt="" />
                        </div>
                      ) : null}
                    </div>
                  ))
              )}
            </div>

            <button className="hq-fab" onClick={() => setIsComposerOpen(true)} aria-label="投稿する">
              ＋
            </button>

            {isComposerOpen && (
              <div className="hq-modal" role="dialog" aria-modal="true">
                <div className="hq-modal__backdrop" onClick={() => setIsComposerOpen(false)} />
                <div className="hq-modal__sheet">
                  <div className="hq-modal__head">
                    <div className="hq-modal__title">投稿する</div>
                    <button className="hq-iconbtn" onClick={() => setIsComposerOpen(false)} aria-label="閉じる">
                      ×
                    </button>
                  </div>

                  {isAdminOpen && (
                    <div className="hq-admin">
                      <div className="hq-admin__title">管理者：人物リスト編集</div>

                      <form className="hq-admin__form" onSubmit={addPerson}>
                        <input
                          className="hq-input"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="名前"
                        />
                        <input
                          className="hq-input"
                          value={newDept}
                          onChange={(e) => setNewDept(e.target.value)}
                          placeholder="部署"
                        />
                        <button className="hq-btn hq-btn--primary" type="submit">
                          追加
                        </button>
                      </form>

                      <div className="hq-admin__list">
                        {(people || []).map((p) => (
                          <div className="hq-admin__row" key={p.id}>
                            <div className="hq-admin__pill">{p.dept}</div>
                            <div className="hq-admin__name">{p.name}</div>
                            <button className="hq-btn hq-btn--danger" onClick={() => removePerson(p.id)} type="button">
                              削除
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <form className="hq-boardform" onSubmit={submitPost}>
                    <div className="hq-row">
                      <label className="hq-field">
                        <span>投稿タイプ</span>
                        <select value={postType} onChange={(e) => setPostType(e.target.value)}>
                          <option value="chat">雑談</option>
                          <option value="share">できごと共有</option>
                          <option value="lunch">ランチ（引き直し）</option>
                          <option value="complete">達成報告</option>
                        </select>
                      </label>

                      <label className="hq-field">
                        <span>相手（任意）</span>
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
                        placeholder="例）30秒だけ雑談できた / 自販機でジュース買いました / など"
                        rows={4}
                      />
                    </label>

                    <div className="hq-row">
                      <button className="hq-btn hq-btn--primary" type="submit" disabled={isRolling}>
                        投稿
                      </button>
                      <button className="hq-btn" type="button" onClick={() => setIsComposerOpen(false)}>
                        キャンセル
                      </button>
                    </div>

                    <div className="hq-smallnote">
                      ・「ランチ（引き直し）」は<strong>5枚全部を引き直し</strong>（投稿に相手が必要）
                      <br />
                      ・「達成報告」は<strong>クエスト達成判定</strong>に使われます
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'rank' && (
          <section className="hq-panel">
            <div className="hq-panel__title">ポイントランキング</div>
            {leaderboard.length === 0 ? (
              <div className="hq-empty">まだポイントがありません。</div>
            ) : (
              <div className="hq-rank">
                {leaderboard.map((r, idx) => (
                  <div key={r.user} className={`hq-rankrow ${r.user === currentUser ? 'is-me' : ''}`}>
                    <div className="hq-rankno">{idx + 1}</div>
                    <div className="hq-rankuser">{r.user}</div>
                    <div className="hq-rankpts">{r.points} pt</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}