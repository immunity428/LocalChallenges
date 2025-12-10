// App.jsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import './App.css';
import cardPool from './cards.json';

const COOLDOWN_MS = 10 * 1000; // 10s（本番では4hなどに変更）
const STORAGE_KEY_LAST_TIME = 'freeGachaLastTime';
const STORAGE_KEY_OWNED = 'hokkoriOwnedCards';
const STORAGE_KEY_REPLIES = 'hokkoriCardReplies';
const STORAGE_KEY_AUTH = 'hokkoriLoginAuth';

const LONG_PRESS_MS = 500;

// ログイン情報
const VALID_USER = 'User';
const VALID_PASSWORD = 'Suwarika';

// パック定義
const PACKS = [
  {
    id: 'hokkori',
    name: 'ほっこりパック',
    subtitle: '無料開封',
    themeClass: 'pack-theme-pink',
  },
  {
    id: 'cheer',
    name: 'チアアップパック',
    subtitle: 'ねぎらいメッセージ多め',
    themeClass: 'pack-theme-blue',
  },
  {
    id: 'welcome',
    name: 'ウェルカムパック',
    subtitle: '新メンバー歓迎カード',
    themeClass: 'pack-theme-green',
  },
];

// レアリティ判定
function rollRarity() {
  const r = Math.random();
  if (r < 0.05) return 'SSR';
  if (r < 0.05 + 0.15) return 'SR';
  return 'R';
}

// レアリティごとにランダム1枚
function getRandomCardByRarity(rarity) {
  const candidates = cardPool.filter((c) => c.rarity === rarity);
  if (!candidates.length) return null;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

// 残り時間表示
function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function App() {
  // ログイン状態
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [lastGachaTime, setLastGachaTime] = useState(null);
  const [cooldownLabel, setCooldownLabel] = useState('準備完了！');
  const [buttonDisabled, setButtonDisabled] = useState(false);

  // ガチャ結果表示用
  const [cards, setCards] = useState([]);
  const [resultInfoText, setResultInfoText] =
    useState('まだほっこりカードを引いていません。');

  const [isOpening, setIsOpening] = useState(false);
  const [packShaking, setPackShaking] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // page: 'gacha' | 'manage' | 'admin'
  const [page, setPage] = useState('gacha');

  // ページ切り替えアニメーション用
  const [pageAnimClass, setPageAnimClass] = useState('');

  // 長押し拡大用
  const [expandedCard, setExpandedCard] = useState(null);
  const pressTimerRef = useRef(null);

  // 返信モーダル用
  const [replyTargetCard, setReplyTargetCard] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [cardReplies, setCardReplies] = useState({}); // { [cardId]: [{ text, createdAt }, ...] }

  // パックカルーセル
  const [activePackIndex, setActivePackIndex] = useState(0);
  const touchStartXRef = useRef(null);
  const activePack = PACKS[activePackIndex];

  // 所持カード（[{ cardId, obtainedAt }]）
  const [ownedCards, setOwnedCards] = useState([]);

  // 秘密のクリック（タイトル5回でadmin）
  const [secretClicks, setSecretClicks] = useState(0);
  const secretTimerRef = useRef(null);

  // 初回：localStorage復元
  useEffect(() => {
    const storedAuth = window.localStorage.getItem(STORAGE_KEY_AUTH);
    if (storedAuth === '1') {
      setIsAuthenticated(true);
    }

    const stored = window.localStorage.getItem(STORAGE_KEY_LAST_TIME);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) setLastGachaTime(parsed);
    }

    const storedOwned = window.localStorage.getItem(STORAGE_KEY_OWNED);
    if (storedOwned) {
      try {
        const parsed = JSON.parse(storedOwned);
        if (Array.isArray(parsed)) setOwnedCards(parsed);
      } catch (e) {
        console.error('Failed to parse owned cards', e);
      }
    }

    const storedReplies = window.localStorage.getItem(STORAGE_KEY_REPLIES);
    if (storedReplies) {
      try {
        const parsed = JSON.parse(storedReplies);
        if (parsed && typeof parsed === 'object') {
          setCardReplies(parsed);
        }
      } catch (e) {
        console.error('Failed to parse card replies', e);
      }
    }
  }, []);

  // クールタイム管理
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (lastGachaTime == null) {
        setCooldownLabel('準備完了！');
        setButtonDisabled(false);
        return;
      }
      const elapsed = now - lastGachaTime;
      const remain = COOLDOWN_MS - elapsed;
      if (remain <= 0) {
        setCooldownLabel('準備完了！');
        setButtonDisabled(false);
      } else {
        setCooldownLabel(formatTime(remain));
        setButtonDisabled(true);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastGachaTime]);

  // ページが変わるたびにアニメーション用クラスを付ける
  useEffect(() => {
    setPageAnimClass('page-switch');
    const timer = setTimeout(() => {
      setPageAnimClass('');
    }, 320); // CSSの0.28s + 余裕
    return () => clearTimeout(timer);
  }, [page]);

  // トースト
  const showToast = (message) => {
    setToastMsg(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1800);
  };

  // 所持カード追加
  const addOwnedCards = (cardList) => {
    const now = Date.now();
    const newEntries = cardList
      .filter(Boolean)
      .map((card) => ({ cardId: card.id, obtainedAt: now }));
    if (newEntries.length === 0) return;

    setOwnedCards((prev) => {
      const updated = [...prev, ...newEntries];
      window.localStorage.setItem(STORAGE_KEY_OWNED, JSON.stringify(updated));
      return updated;
    });
  };

  // カードタップ → 返信モーダルを開く
  const handleCardClick = (cardData) => {
    setReplyTargetCard(cardData);
    setReplyText('');
  };

  // 返信保存
  const handleReplySubmit = () => {
    const text = replyText.trim();
    if (!text) {
      showToast('返信内容を入力してください');
      return;
    }
    if (!replyTargetCard) return;

    const cardId = replyTargetCard.id;
    const now = Date.now();

    setCardReplies((prev) => {
      const prevList = prev[cardId] || [];
      const nextList = [...prevList, { text, createdAt: now }];
      const next = { ...prev, [cardId]: nextList };
      window.localStorage.setItem(STORAGE_KEY_REPLIES, JSON.stringify(next));
      return next;
    });

    setReplyText('');
    showToast('返信を追加しました');
  };

  // 長押しで拡大表示
  const handlePressStart = (cardData) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      setExpandedCard(cardData);
      pressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // パック説明
  const handlePackClick = () => {
    showToast(`${activePack.name}：パックを開けてカードを手に入れよう！`);
  };

  // パック切替
  const changePack = (delta) => {
    setActivePackIndex((prev) => {
      const len = PACKS.length;
      return (prev + delta + len) % len;
    });
  };

  // カルーセルスワイプ
  const handleCarouselTouchStart = (e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleCarouselTouchEnd = (e) => {
    if (touchStartXRef.current == null) return;
    const endX =
      e.changedTouches && e.changedTouches.length > 0
        ? e.changedTouches[0].clientX
        : touchStartXRef.current;
    const dx = endX - touchStartXRef.current;
    const threshold = 40;
    if (dx > threshold) changePack(-1);
    else if (dx < -threshold) changePack(1);
    touchStartXRef.current = null;
  };

  // ガチャ
  const handleGacha = () => {
    const now = Date.now();

    if (lastGachaTime != null) {
      const elapsed = now - lastGachaTime;
      const remain = COOLDOWN_MS - elapsed;
      if (remain > 0) {
        showToast('まだクールタイム中です。少し待ってね。');
        return;
      }
    }

    setIsOpening(true);
    setPackShaking(true);
    setButtonDisabled(true);
    setCards([]);

    const COUNT = 5;
    const rarities = [];
    for (let i = 0; i < COUNT; i++) rarities.push(rollRarity());
    const cardList = rarities.map((rarity) => getRandomCardByRarity(rarity));

    const baseTime = Date.now();
    const newCards = cardList.map((c, idx) => ({
      id: `${baseTime}-${idx}`,
      data: c,
      visible: false,
    }));
    setCards(newCards);

    const animationDuration = 1300;

    setTimeout(() => {
      setIsOpening(false);
      setPackShaking(false);

      newCards.forEach((_, idx) => {
        setTimeout(
          () =>
            setCards((prev) =>
              prev.map((card, i) =>
                i === idx ? { ...card, visible: true } : card
              )
            ),
          200 + idx * 120
        );
      });

      let ssrCount = 0;
      let srCount = 0;
      cardList.forEach((card) => {
        if (!card) return;
        if (card.rarity === 'SSR') ssrCount++;
        else if (card.rarity === 'SR') srCount++;
      });

      const infoText = [];
      infoText.push(
        `${activePack.name}から ${COUNT}枚のほっこりカードを開封しました。`
      );
      if (ssrCount > 0) infoText.push(`SSR: ${ssrCount}枚`);
      if (srCount > 0) infoText.push(`SR: ${srCount}枚`);
      if (ssrCount === 0 && srCount === 0) {
        infoText.push('今回はすべてRでした。また誰かをほっこりさせに行こう。');
      }
      setResultInfoText(infoText.join(' ／ '));

      if (ssrCount > 0) {
        showToast(`SSR ${ssrCount}枚！特別なほっこりが届きました。`);
      } else if (srCount > 0) {
        showToast(`SR ${srCount}枚！次は伝説級のほっこりを狙おう。`);
      } else {
        showToast('次のパックに期待！');
      }

      // 所持カードに保存
      addOwnedCards(cardList);

      setLastGachaTime(now);
      window.localStorage.setItem(STORAGE_KEY_LAST_TIME, String(now));
    }, animationDuration);
  };

  // タイトル秘密クリック（2秒以内に5回）
  const handleSecretTitleClick = () => {
    if (!secretTimerRef.current) {
      secretTimerRef.current = setTimeout(() => {
        setSecretClicks(0);
        secretTimerRef.current = null;
      }, 2000);
    }
    setSecretClicks((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setPage('admin');
        setSecretClicks(0);
        if (secretTimerRef.current) {
          clearTimeout(secretTimerRef.current);
          secretTimerRef.current = null;
        }
        showToast('管理者ページを開きました');
      }
      return next;
    });
  };

  // ログイン処理
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (loginUser === VALID_USER && loginPassword === VALID_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError('');
      window.localStorage.setItem(STORAGE_KEY_AUTH, '1');
      showToast('ログインしました');
    } else {
      setLoginError('ユーザー名またはパスワードが違います');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    window.localStorage.removeItem(STORAGE_KEY_AUTH);
    showToast('ログアウトしました');
  };

  // ログインしていなければログイン画面だけ出す
  if (!isAuthenticated) {
    return (
      <div className='app-root'>
        <div className='app login-page'>
          <h1 className='login-title'>Hoccoo ログイン</h1>
          <p className='login-subtitle'>
            社内向けアプリのため、ログインが必要です。
          </p>
          <form className='login-form' onSubmit={handleLoginSubmit}>
            <label className='login-label'>
              ユーザー名
              <input
                type='text'
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className='login-input'
                placeholder='User'
              />
            </label>
            <label className='login-label'>
              パスワード
              <input
                type='password'
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className='login-input'
                placeholder='Passward'
              />
            </label>
            {loginError && <div className='login-error'>{loginError}</div>}
            <button type='submit' className='btn-main login-button'>
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className='app-root'>
      <div className='app'>
        {/* トースト */}
        <div className={`toast ${toastVisible ? 'show' : ''}`}>{toastMsg}</div>

        {/* 開封中オーバーレイ */}
        <div className={`overlay ${isOpening ? 'show' : ''}`}>
          <div className='overlay-text'>開封中…</div>
          <div className='loading-orbs'>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className='overlay-sub'>
            パックをふわふわ振って、ほっこりカードを整えています
          </div>
        </div>

        {/* ヘッダー */}
        <header className='app-header'>
          <div className='title-block'>
            <div className='title' onClick={handleSecretTitleClick}>
              Hoccoo
            </div>
            <div className='subtitle'>
              社員同士の「ありがとう」「おつかれさま」を集める ガチャ
            </div>
            {page === 'admin' && (
              <div className='admin-indicator'>管理者ビュー</div>
            )}
          </div>

          <div className='header-right'>
            {page === 'gacha' && (
              <div className='cooldown'>
                次の開封まで: <strong>{cooldownLabel}</strong>
              </div>
            )}
            <div className='nav-buttons'>
              <button
                className={`nav-tab ${page === 'gacha' ? 'active' : ''}`}
                onClick={() => setPage('gacha')}
              >
                ガチャ
              </button>
              <button
                className={`nav-tab ${page === 'manage' ? 'active' : ''}`}
                onClick={() => setPage('manage')}
              >
                カード管理
              </button>
              {/* admin へのタブは表示しない（隠し機能） */}
              <button className='nav-tab logout-tab' onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          </div>
        </header>

        {/* ページ切替（アニメーション付き） */}
        <div className={`page-container ${pageAnimClass}`}>
          {page === 'gacha' && (
            <div className='layout'>
              {/* 左：パック＆ボタン */}
              <div className='left-panel'>
                <div className='pack-area'>
                  <div
                    className='pack-carousel'
                    onTouchStart={handleCarouselTouchStart}
                    onTouchEnd={handleCarouselTouchEnd}
                  >
                    {PACKS.map((pack, idx) => {
                      const offset = idx - activePackIndex;
                      let posClass = 'pack-pos-hidden';
                      if (offset === 0) posClass = 'pack-pos-center';
                      else if (offset === -1 || offset === PACKS.length - 1)
                        posClass = 'pack-pos-left';
                      else if (offset === 1 || offset === -(PACKS.length - 1))
                        posClass = 'pack-pos-right';

                      const isCenter = offset === 0;

                      return (
                        <div
                          key={pack.id}
                          className={`pack-card ${posClass}`}
                          onClick={() => {
                            if (isCenter) handlePackClick();
                            else setActivePackIndex(idx);
                          }}
                        >
                          <div
                            className={`pack ${pack.themeClass} ${
                              packShaking && isCenter ? 'shake' : ''
                            }`}
                          >
                            <div className='pack-label'>{pack.name}</div>
                            <div className='pack-sub'>{pack.subtitle}</div>
                            <div className='pack-orb'></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className='pack-glow'></div>
                  <div className='pack-hint'>
                    左右にスワイプしてパックを切り替え
                  </div>
                </div>

                <div className='buttons'>
                  <button
                    className='btn-main'
                    onClick={handleGacha}
                    disabled={buttonDisabled || isOpening}
                  >
                    {activePack.name}を開封する（5枚）
                  </button>
                </div>

                <div className='odds-text'>
                  ★★★★(SSR): 5% ／ ★★★(SR): 15% ／ ★★(R): 80%
                  <br />
                  1回の開封でほっこりカード5枚排出
                </div>
              </div>

              {/* 右：開封結果 */}
              <div className='right-panel'>
                <div className='result-header'>
                  <div className='result-title'>開封結果</div>
                  <div className='result-info'>{resultInfoText}</div>
                </div>
                <div className='result-grid'>
                  {cards.map((c) => {
                    if (!c.data) return null;

                    const rarity = c.data.rarity;
                    const rarityClass =
                      rarity === 'SSR'
                        ? 'card-ssr'
                        : rarity === 'SR'
                        ? 'card-sr'
                        : 'card-r';

                    const rarityText =
                      rarity === 'SSR'
                        ? '★★★★ SSR'
                        : rarity === 'SR'
                        ? '★★★ SR'
                        : '★★ R';

                    const rarityLabelClass =
                      rarity === 'SSR'
                        ? 'rarity-ssr'
                        : rarity === 'SR'
                        ? 'rarity-sr'
                        : 'rarity-r';

                    return (
                      <div
                        key={c.id}
                        className={`card ${rarityClass} ${
                          c.visible ? 'show' : ''
                        }`}
                        onClick={() => handleCardClick(c.data)}
                        onMouseDown={() => handlePressStart(c.data)}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                        onTouchStart={() => handlePressStart(c.data)}
                        onTouchEnd={handlePressEnd}
                        onTouchCancel={handlePressEnd}
                      >
                        <div
                          className={`card-rarity-tag ${rarityLabelClass}`}
                        >
                          {rarityText}
                        </div>
                        <div className='card-name'>{c.data.name}</div>
                        <div className='card-body'>
                          {c.data.image && (
                            <img
                              src={c.data.image}
                              alt={c.data.name}
                              className='card-image'
                              draggable='false'
                            />
                          )}
                          {c.data.message && (
                            <p className='card-message'>{c.data.message}</p>
                          )}
                        </div>
                        <div className='card-footer'>
                          <span>{c.data.category || c.data.type}</span>
                          <span>{c.data.series}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {page === 'manage' && (
            <CardManagePage
              onBack={() => setPage('gacha')}
              ownedCards={ownedCards}
            />
          )}

          {page === 'admin' && (
            <AdminCardListPage onBack={() => setPage('gacha')} />
          )}
        </div>

        {/* 長押しモーダル（拡大表示） */}
        {expandedCard && (
          <div
            className='card-modal-backdrop'
            onClick={() => setExpandedCard(null)}
          >
            <div className='card-modal' onClick={(e) => e.stopPropagation()}>
              <div className='card-modal-header'>
                <span className='card-modal-title'>{expandedCard.name}</span>
                <button
                  className='card-modal-close'
                  onClick={() => setExpandedCard(null)}
                >
                  ×
                </button>
              </div>
              <div className='card-modal-body'>
                {expandedCard.image && (
                  <img
                    src={expandedCard.image}
                    alt={expandedCard.name}
                    className='card-modal-image'
                    draggable='false'
                  />
                )}
                <div className='card-modal-meta'>
                  <span
                    className={`manage-badge rarity-${expandedCard.rarity}`}
                  >
                    {expandedCard.rarity}
                  </span>
                  {expandedCard.category && (
                    <span className='manage-badge category'>
                      {expandedCard.category}
                    </span>
                  )}
                  <span className='manage-badge series'>
                    {expandedCard.series}
                  </span>
                </div>
                {expandedCard.message && (
                  <p className='card-modal-message'>
                    {expandedCard.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 返信モーダル */}
        {replyTargetCard && (
          <div
            className='card-modal-backdrop'
            onClick={() => setReplyTargetCard(null)}
          >
            <div className='card-modal' onClick={(e) => e.stopPropagation()}>
              <div className='card-modal-header'>
                <span className='card-modal-title'>
                  {replyTargetCard.name} への返信
                </span>
                <button
                  className='card-modal-close'
                  onClick={() => setReplyTargetCard(null)}
                >
                  ×
                </button>
              </div>
              <div className='card-modal-body'>
                {replyTargetCard.message && (
                  <p className='card-modal-message original-message'>
                    {replyTargetCard.message}
                  </p>
                )}

                <div className='reply-list'>
                  <div className='reply-list-title'>これまでの返信</div>
                  {(
                    cardReplies[replyTargetCard.id] || []
                  ).length === 0 ? (
                    <div className='reply-empty'>
                      まだ返信はありません。最初の一言を送ってみましょう。
                    </div>
                  ) : (
                    <ul className='reply-items'>
                      {cardReplies[replyTargetCard.id].map((r, idx) => (
                        <li key={idx} className='reply-item'>
                          <div className='reply-text'>{r.text}</div>
                          <div className='reply-meta'>
                            {new Date(r.createdAt).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className='reply-form'>
                  <textarea
                    className='reply-textarea'
                    placeholder='このカードをくれた人に、感謝やひとことを返してみましょう'
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button
                    className='btn-main reply-button'
                    type='button'
                    onClick={handleReplySubmit}
                  >
                    返信を追加
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * カード管理ページ（ユーザーの所持コレクション）
 */
function CardManagePage({ onBack, ownedCards }) {
  const summarized = useMemo(() => {
    const map = new Map();
    ownedCards.forEach(({ cardId, obtainedAt }) => {
      const current = map.get(cardId) || {
        cardId,
        count: 0,
        lastObtained: 0,
      };
      current.count += 1;
      if (obtainedAt > current.lastObtained) current.lastObtained = obtainedAt;
      map.set(cardId, current);
    });

    const result = [];
    map.forEach((v) => {
      const cardDef = cardPool.find((c) => c.id === v.cardId);
      if (!cardDef) return;
      result.push({ ...v, card: cardDef });
    });

    const rarityOrder = { SSR: 0, SR: 1, R: 2 };
    result.sort((a, b) => {
      const ra = rarityOrder[a.card.rarity] ?? 99;
      const rb = rarityOrder[b.card.rarity] ?? 99;
      if (ra !== rb) return ra - rb;
      return String(a.card.name).localeCompare(String(b.card.name), 'ja');
    });

    return result;
  }, [ownedCards]);

  return (
    <div className='manage-page'>
      <div className='manage-header'>
        <h2 className='manage-title'>ほっこりカードコレクション</h2>
        <p className='manage-desc'>
          これまでガチャで手に入れたカードの保管場所です。
          <br />
          同じカードを複数枚引いた場合は「所持枚数」としてカウントされます。
        </p>
      </div>

      <div className='manage-section'>
        <h3 className='manage-section-title'>所持カード一覧</h3>
        {summarized.length === 0 ? (
          <p className='manage-desc-small'>
            まだカードを所持していません。ガチャでカードを集めましょう！
          </p>
        ) : (
          <div className='manage-card-list'>
            {summarized.map(({ cardId, count, lastObtained, card }) => (
              <div key={cardId} className='manage-card'>
                {card.image && (
                  <div className='manage-card-image'>
                    <img src={card.image} alt={card.name} />
                  </div>
                )}
                <div className='manage-card-content'>
                  <div className='manage-card-name'>
                    {card.name}
                    <span className='manage-card-count'> × {count}</span>
                  </div>
                  <div className='manage-card-meta'>
                    <span className={`manage-badge rarity-${card.rarity}`}>
                      {card.rarity}
                    </span>
                    {card.category && (
                      <span className='manage-badge category'>
                        {card.category}
                      </span>
                    )}
                    <span className='manage-badge series'>{card.series}</span>
                  </div>
                  {card.message && (
                    <p className='manage-card-message'>{card.message}</p>
                  )}
                  <div className='manage-card-footnote'>
                    最終入手:{' '}
                    {new Date(lastObtained).toLocaleString('ja-JP', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className='manage-footer'>
        <button className='btn-sub' onClick={onBack}>
          ガチャ画面に戻る
        </button>
      </div>
    </div>
  );
}

/**
 * 管理者向け：全カード一覧（cards.json）
 * タイトル5回クリックで表示
 */
function AdminCardListPage({ onBack }) {
  return (
    <div className='manage-page'>
      <div className='manage-header'>
        <h2 className='manage-title'>管理者用カード一覧</h2>
        <p className='manage-desc'>
          cards.json に定義されている全ての排出対象カードの一覧です。
          <br />
          レアリティやカテゴリのバランス確認などに使用します。
        </p>
      </div>

      <div className='manage-section'>
        <h3 className='manage-section-title'>全カード（マスタ）</h3>
        <div className='manage-card-list'>
          {cardPool.map((card) => (
            <div key={card.id} className='manage-card'>
              {card.image && (
                <div className='manage-card-image'>
                  <img src={card.image} alt={card.name} />
                </div>
              )}
              <div className='manage-card-content'>
                <div className='manage-card-name'>
                  {card.name}
                  <span className='manage-card-count admin-id'>
                    （ID: {card.id}）
                  </span>
                </div>
                <div className='manage-card-meta'>
                  <span className={`manage-badge rarity-${card.rarity}`}>
                    {card.rarity}
                  </span>
                  {card.category && (
                    <span className='manage-badge category'>
                      {card.category}
                    </span>
                  )}
                  <span className='manage-badge series'>{card.series}</span>
                </div>
                {card.message && (
                  <p className='manage-card-message'>{card.message}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className='manage-footer'>
        <button className='btn-sub' onClick={onBack}>
          ガチャ画面に戻る
        </button>
      </div>
    </div>
  );
}

export default App;