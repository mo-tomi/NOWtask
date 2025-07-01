// NowTask JavaScript - 段階1（UI表示のみ）

// 時計更新関数
function updateClock() {
  const now = new Date();
  
  // 日付と時刻のフォーマット
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  // メイン時計（ヘッダー中央）
  const mainClockText = `${year}-${month}-${day} ${hours}:${minutes}`;
  document.getElementById('main-clock').textContent = mainClockText;
  
  // ヘッダー右端の時計
  const headerClockText = `${hours}:${minutes}`;
  document.getElementById('header-clock').textContent = headerClockText;
}

// 現在時刻ライン更新関数
function updateNowLine() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // 現在時刻を分に変換（0:00からの経過分）
  const totalMinutes = hours * 60 + minutes;
  
  // 1分 = 1px で計算
  const topPosition = totalMinutes;
  
  // 現在時刻ラインの位置を更新
  const nowLine = document.getElementById('now-line');
  if (nowLine) {
    nowLine.style.top = topPosition + 'px';
  }
}

// クイック追加関数（段階1ではアラート表示のみ）
function addQuickTask() {
  // TODO: 段階2で実装
  alert('add');
}

// ドラッグ初期化関数（段階1では空関数）
function initDrag() {
  // TODO: 段階2で実装
}

// ローカルストレージ保存関数（段階1では空関数）
function saveToStorage() {
  // TODO: 段階2で実装
}

// ページ読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', function() {
  // 初回の時計表示
  updateClock();
  updateNowLine();
  
  // 1秒ごとに時計と現在時刻ラインを更新
  setInterval(function() {
    updateClock();
    updateNowLine();
  }, 1000);
  
  // ドラッグ機能の初期化（段階1では何もしない）
  initDrag();
  
  console.log('NowTask 段階1 - UI表示完了');
});

// エンターキーでクイック追加実行
document.addEventListener('DOMContentLoaded', function() {
  const quickInput = document.getElementById('quick-input');
  if (quickInput) {
    quickInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addQuickTask();
      }
    });
  }
});