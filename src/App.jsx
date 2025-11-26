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
    useState('まだガチャを引いていません。');

  const [isOpening, setIsOpening] = useState(false);
  const [packShaking, setPackShaking] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

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
      infoText.push(`${COUNT}枚開封しました。`);
      if (ssrCount > 0) infoText.push(`SSR: ${ssrCount}枚`);
      if (srCount > 0) infoText.push(`SR: ${srCount}枚`);
      if (ssrCount === 0 && srCount === 0) infoText.push(`すべてRでした…。`);
      setResultInfoText(infoText.join(' ／ '));

      if (ssrCount > 0) {
        showToast(`SSR ${ssrCount}枚出ました！`);
      } else if (srCount > 0) {
        showToast(`SR ${srCount}枚！ 次こそSSR…！`);
      } else {
        showToast('また4時間後のパックに期待！');
      }

      // クールタイム開始
      setLastGachaTime(now);
      window.localStorage.setItem(STORAGE_KEY_LAST_TIME, String(now));
    }, animationDuration);
  };

  const handlePackClick = () => {
    showToast('4時間に1回、無料で5枚開封できます！');
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
          <div className='overlay-sub'>パックを振ってカードを整えています</div>
        </div>

        {/* ヘッダー */}
        <header className='app-header'>
          <div className='title-block'>
            <div className='title'>FREE STAR PACK</div>
            <div className='subtitle'>
              4時間に1回 引ける ポケポケ風無料ガチャ
            </div>
          </div>
          <div className='cooldown'>
            次の無料まで: <strong>{cooldownLabel}</strong>
          </div>
        </header>

        <div className='layout'>
          {/* 左：パック & ボタン */}
          <div className='left-panel'>
            <div className='pack-area'>
              <div
                className={`pack ${packShaking ? 'shake' : ''}`}
                onClick={handlePackClick}
              >
                <div className='pack-label'>FREE PACK</div>
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
                無料ガチャを引く（1回5枚）
              </button>
            </div>

            <div className='odds-text'>
              ★★★★(SSR): 5% ／ ★★★(SR): 15% ／ ★★(R): 80%
              <br />
              1回の開封でカード5枚排出
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
                    className={`card ${rarityClass} ${c.visible ? 'show' : ''}`}
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
                    </div>
                    <div className='card-footer'>
                      <span>{c.data.type}</span>
                      <span>{c.data.series}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
