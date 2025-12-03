// App.jsx
import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import cardPool from './cards.json';

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4時間
const STORAGE_KEY_LAST_TIME = 'freeGachaLastTime';
const LONG_PRESS_MS = 500; // カード長押し判定(ms)

// スワイプで切り替えるパック定義（今は見た目だけ・中身は同じガチャ）
const PACKS = [
  {
    id: 'hokkori',
    name: 'ほっこりパック',
    subtitle: '4時間に1回 無料開封',
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

// レアリティ判定（確率）
function rollRarity() {
  const r = Math.random();
  if (r < 0.05) return 'SSR'; // 5%
  if (r < 0.05 + 0.15) return 'SR'; // 15%
  return 'R'; // 80%
}

// レアリティごとにランダムで1枚
function getRandomCardByRarity(rarity) {
  const candidates = cardPool.filter((c) => c.rarity === rarity);
  if (!candidates.length) return null;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

// 残り時間の表示フォーマット
function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function App() {
  const [lastGachaTime, setLastGachaTime] = useState(null);
  const [cooldownLabel, setCooldownLabel] = useState('準備完了！');
  const [buttonDisabled, setButtonDisabled] = useState(false);

  // ガチャ結果表示用：{ id, data, visible }
  const [cards, setCards] = useState([]);
  const [resultInfoText, setResultInfoText] =
    useState('まだほっこりカードを引いていません。');

  const [isOpening, setIsOpening] = useState(false);
  const [packShaking, setPackShaking] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // ページ切替: 'gacha' or 'manage'
  const [page, setPage] = useState('gacha');

  // 長押しでカード拡大
  const [expandedCard, setExpandedCard] = useState(null);
  const pressTimerRef = useRef(null);

  // パックカルーセル
  const [activePackIndex, setActivePackIndex] = useState(0);
  const touchStartXRef = useRef(null);
  const activePack = PACKS[activePackIndex];

  // 初回のみ：localStorage から前回ガチャ時刻を復元
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY_LAST_TIME);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) {
        setLastGachaTime(parsed);
      }
    }
  }, []);

  // クールタイム表示とボタン制御
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

  // トースト表示
  const showToast = (message) => {
    setToastMsg(message);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 1800);
  };

  // カードタップ時（将来SNS投稿につなぐ想定）
  const handleCardClick = (cardData) => {
    console.log('選択されたカード:', cardData);
    showToast('このカードの気持ちをタイムラインに投稿できます（将来実装予定）');
  };

  // 長押し開始
  const handlePressStart = (cardData) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }
    pressTimerRef.current = window.setTimeout(() => {
      setExpandedCard(cardData);
      pressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  // 長押し終了（キャンセル）
  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // パック説明（中央パックをタップ）
  const handlePackClick = () => {
    showToast(`${activePack.name}：4時間に1回、無料で5枚開封できます！`);
  };

  // パックを前後に切り替え
  const changePack = (delta) => {
    setActivePackIndex((prev) => {
      const len = PACKS.length;
      return (prev + delta + len) % len;
    });
  };

  // カルーセルのスワイプ開始
  const handleCarouselTouchStart = (e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  // カルーセルのスワイプ終了
  const handleCarouselTouchEnd = (e) => {
    if (touchStartXRef.current == null) return;
    const endX =
      e.changedTouches && e.changedTouches.length > 0
        ? e.changedTouches[0].clientX
        : touchStartXRef.current;
    const dx = endX - touchStartXRef.current;
    const threshold = 40; // スワイプ判定
    if (dx > threshold) {
      changePack(-1); // 右スワイプで前のパック
    } else if (dx < -threshold) {
      changePack(1); // 左スワイプで次のパック
    }
    touchStartXRef.current = null;
  };

  // 無料ガチャを引く
  const handleGacha = () => {
    const now = Date.now();

    // クールタイムチェック
    if (lastGachaTime != null) {
      const elapsed = now - lastGachaTime;
      const remain = COOLDOWN_MS - elapsed;
      if (remain > 0) {
        showToast('まだクールタイム中です。少し待ってね。');
        return;
      }
    }

    // 演出開始
    setIsOpening(true);
    setPackShaking(true);
    setButtonDisabled(true);
    setCards([]);

    const COUNT = 5;
    const rarities = [];
    for (let i = 0; i < COUNT; i++) {
      rarities.push(rollRarity());
    }
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

      // 5枚を順に「めくる」
      newCards.forEach((_, idx) => {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((card, i) =>
              i === idx ? { ...card, visible: true } : card
            )
          );
        }, 200 + idx * 120);
      });

      // 結果集計
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
        infoText.push(
          '今回はすべてRでした。また誰かをほっこりさせに行こう。'
        );
      }
      setResultInfoText(infoText.join(' ／ '));

      if (ssrCount > 0) {
        showToast(`SSR ${ssrCount}枚！特別なほっこりが届きました。`);
      } else if (srCount > 0) {
        showToast(`SR ${srCount}枚！次は伝説級のほっこりを狙おう。`);
      } else {
        showToast('また4時間後のほっこりパックに期待！');
      }

      // クールタイム開始
      setLastGachaTime(now);
      window.localStorage.setItem(STORAGE_KEY_LAST_TIME, String(now));
    }, animationDuration);
  };

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
            <div className='title'>ほっこりカードガチャ</div>
            <div className='subtitle'>
              社員同士の「ありがとう」「おつかれさま」を集める
              4時間に1回の無料ガチャ
            </div>
          </div>

          <div className='header-right'>
            {page === 'gacha' && (
              <div className='cooldown'>
                次の無料開封まで: <strong>{cooldownLabel}</strong>
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
            </div>
          </div>
        </header>

        {/* ページ切り替え */}
        {page === 'gacha' ? (
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
                          if (isCenter) {
                            handlePackClick();
                          } else {
                            setActivePackIndex(idx);
                          }
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
                <div className='pack-hint'>左右にスワイプしてパックを切り替え</div>
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
                      <div className={`card-rarity-tag ${rarityLabelClass}`}>
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
        ) : (
          <CardManagePage onBack={() => setPage('gacha')} />
        )}

        {/* 長押しで開くカード拡大モーダル */}
        {expandedCard && (
          <div
            className='card-modal-backdrop'
            onClick={() => setExpandedCard(null)}
          >
            <div
              className='card-modal'
              onClick={(e) => e.stopPropagation()}
            >
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
                  <p className='card-modal-message'>{expandedCard.message}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * カード管理ページ（一覧のみ・将来作成機能を追加予定）
 */
function CardManagePage({ onBack }) {
  return (
    <div className='manage-page'>
      <div className='manage-header'>
        <h2 className='manage-title'>ほっこりカード管理（β / 将来実装予定）</h2>
        <p className='manage-desc'>
          現在はカード一覧を確認するだけの簡易ページです。
          <br />
          将来的に「新しいカードの作成・編集・削除」「カテゴリ別の管理」などを
          ここから行える想定です。
        </p>
      </div>

      <div className='manage-section'>
        <h3 className='manage-section-title'>カード一覧（cards.json）</h3>
        <div className='manage-card-list'>
          {cardPool.map((card) => (
            <div key={card.id} className='manage-card'>
              {card.image && (
                <div className='manage-card-image'>
                  <img src={card.image} alt={card.name} />
                </div>
              )}
              <div className='manage-card-content'>
                <div className='manage-card-name'>{card.name}</div>
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

      <div className='manage-section'>
        <h3 className='manage-section-title'>新しいカードを作成（準備中）</h3>
        <p className='manage-desc-small'>
          ここに「カード名・レアリティ・カテゴリ・メッセージ・画像」などを入力するフォームを
          将来的に実装予定です。
        </p>
        <div className='manage-form-placeholder'>
          <div className='placeholder-row' />
          <div className='placeholder-row' />
          <div className='placeholder-row short' />
          <button className='btn-sub' disabled>
            作成機能はまだ利用できません
          </button>
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