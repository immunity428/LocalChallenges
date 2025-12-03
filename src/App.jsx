// App.jsx
import React, { useEffect, useState } from 'react';
import './App.css';
import cardPool from './cards.json';

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4時間
const STORAGE_KEY_LAST_TIME = 'freeGachaLastTime';

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

  // カード表示用：{ id, data, visible }
  const [cards, setCards] = useState([]);
  const [resultInfoText, setResultInfoText] =
    useState('まだほっこりカードを引いていません。');

  const [isOpening, setIsOpening] = useState(false);
  const [packShaking, setPackShaking] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // ページ切替用: 'gacha' or 'manage'
  const [page, setPage] = useState('gacha');

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

    // 即座に1回更新してから、1秒ごとに更新
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

  // カードクリック時（将来、社内SNS投稿につなぐ想定）
  const handleCardClick = (cardData) => {
    console.log('選択されたカード:', cardData);
    showToast('このカードの気持ちをタイムラインに投稿できます（将来実装予定）');
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

    // 一旦 visible: false でセットしておく
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

      // 5枚を順番に「めくる」
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
      infoText.push(`${COUNT}枚のほっこりカードを開封しました。`);
      if (ssrCount > 0) infoText.push(`SSR: ${ssrCount}枚`);
      if (srCount > 0) infoText.push(`SR: ${srCount}枚`);
      if (ssrCount === 0 && srCount === 0)
        infoText.push(`今回はすべてRでした。また誰かをほっこりさせに行こう。`);
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

  const handlePackClick = () => {
    showToast('4時間に1回、無料でほっこりカードが5枚引けます！');
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

        {/* ページ切替 */}
        {page === 'gacha' ? (
          <div className='layout'>
            {/* 左：パック & ボタン（スマホでは上側） */}
            <div className='left-panel'>
              <div className='pack-area'>
                <div
                  className={`pack ${packShaking ? 'shake' : ''}`}
                  onClick={handlePackClick}
                >
                  <div className='pack-label'>ほっこりパック</div>
                  <div className='pack-orb'></div>
                  <div className='pack-sub'>4時間に1回 無料開封</div>
                </div>
                <div className='pack-glow'></div>
              </div>

              <div className='buttons'>
                <button
                  className='btn-main'
                  onClick={handleGacha}
                  disabled={buttonDisabled || isOpening}
                >
                  無料でほっこりカードを引く（5枚）
                </button>
              </div>

              <div className='odds-text'>
                ★★★★(SSR): 5% ／ ★★★(SR): 15% ／ ★★(R): 80%
                <br />
                1回の開封でほっこりカード5枚排出
              </div>
            </div>

            {/* 右：結果表示 */}
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
                    >
                      <div className={`card-rarity-tag ${rarityLabelClass}`}>
                        {rarityText}
                      </div>
                      <div className='card-name'>{c.data.name}</div>
                      <div className='card-body'>
                        {/* 任意画像を JSON から読み込み */}
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
      </div>
    </div>
  );
}

/**
 * カード管理ページ（将来実装用のダミーページ）
 * - cards.json の内容を一覧表示
 * - 将来「カード作成フォーム」を載せる場所の枠だけ用意
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
          ここから行えるようにする想定です。
        </p>
      </div>

      <div className='manage-section'>
        <h3 className='manage-section-title'>カード一覧（cards.json）</h3>
        <div className='manage-card-list'>
          {cardPool.map((card) => (
            <div key={card.id} className='manage-card-item'>
              <div className='manage-card-main'>
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
              {card.image && (
                <div className='manage-card-thumb'>
                  <img src={card.image} alt={card.name} />
                </div>
              )}
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