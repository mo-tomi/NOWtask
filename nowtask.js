// NowTask JavaScript - 段階2（基本機能実装）

// ===== ユーティリティ関数 =====
function getCurrentDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // "YYYY-MM-DD" 形式
}

// ===== データ構造定義 =====
let tasks = [];
let currentDate = getCurrentDateString(); // 現在表示中の日付
let draggedTask = null;
let dragOffset = { x: 0, y: 0 };

// タスクのデータ構造
class Task {
  constructor(id, title, startTime, endTime, priority = 'normal', date = null) {
    this.id = id || this.generateId();
    this.title = title;
    this.startTime = startTime; // "HH:MM" 形式
    this.endTime = endTime;     // "HH:MM" 形式
    this.priority = priority;   // 'normal', 'high', 'urgent'
    this.completed = false;
    this.date = date || getCurrentDateString(); // "YYYY-MM-DD" 形式
    this.createdAt = new Date().toISOString();
  }
  
  generateId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  // 時間を分に変換
  getStartMinutes() {
    const [hours, minutes] = this.startTime.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  getEndMinutes() {
    const [hours, minutes] = this.endTime.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  // タスクの長さ（分）
  getDurationMinutes() {
    let end = this.getEndMinutes();
    let start = this.getStartMinutes();
    
    // 日をまたぐ場合の処理
    if (end < start) {
      end += 24 * 60; // 翌日の分を追加
    }
    
    return end - start;
  }
  
  // 時間文字列を返す
  getTimeString() {
    return `${this.startTime}-${this.endTime}`;
  }
}

// ===== データ永続化機能 =====
function saveToStorage() {
  try {
    localStorage.setItem('nowtask_data', JSON.stringify(tasks));
    console.log('データを保存しました:', tasks.length + '件のタスク');
  } catch (error) {
    console.error('データ保存エラー:', error);
    alert('データの保存に失敗しました');
  }
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem('nowtask_data');
    if (data) {
      const parsed = JSON.parse(data);
      tasks = parsed.map(taskData => {
        const task = new Task();
        Object.assign(task, taskData);
        return task;
      });
      console.log('データを読み込みました:', tasks.length + '件のタスク');
    } else {
      // 初回起動時のダミーデータ
      initializeDummyData();
    }
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    initializeDummyData();
  }
}

function initializeDummyData() {
  const today = getCurrentDateString();
  tasks = [
    new Task(null, '夜勤', '17:00', '23:59', 'normal', today),
    new Task(null, '夜勤', '00:00', '09:00', 'normal', today), 
    new Task(null, '勉強', '10:00', '11:00', 'high', today),
    new Task(null, 'ゲーム', '13:30', '14:15', 'urgent', today)
  ];
  saveToStorage();
}

// ===== 日付管理機能 =====
function formatDateForDisplay(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function changeDate(newDate) {
  try {
    currentDate = newDate;
    renderTasks();
    updateStats();
    console.log('日付を変更しました:', currentDate);
  } catch (error) {
    console.error('日付変更エラー:', error);
  }
}

function navigateDate(direction) {
  try {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + direction);
    const newDateString = date.toISOString().split('T')[0];
    changeDate(newDateString);
  } catch (error) {
    console.error('日付ナビゲーションエラー:', error);
  }
}

function getCurrentTasksForDate() {
  return tasks.filter(task => task.date === currentDate);
}

// 日付選択ダイアログを表示
function showDatePicker() {
  try {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = currentDate;
    input.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      padding: 16px;
      border: 2px solid var(--primary);
      border-radius: 8px;
      background: white;
      box-shadow: var(--shadow-xl);
      font-size: 16px;
      font-family: inherit;
    `;
    
    // 背景オーバーレイ
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
      backdrop-filter: blur(4px);
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(input);
    input.focus();
    
    // 日付変更時の処理
    input.addEventListener('change', (e) => {
      const newDate = e.target.value;
      if (newDate && newDate !== currentDate) {
        changeDate(newDate);
        showNotification(`日付を${formatDateForDisplay(newDate)}に変更しました`, 'success');
      }
      cleanup();
    });
    
    // クリーンアップ関数
    const cleanup = () => {
      if (overlay.parentNode) overlay.remove();
      if (input.parentNode) input.remove();
    };
    
    // オーバーレイクリックまたはEscキーでキャンセル
    overlay.addEventListener('click', cleanup);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    });
    
    // 3秒後に自動閉鎖
    setTimeout(() => {
      if (input.parentNode) cleanup();
    }, 10000);
    
  } catch (error) {
    console.error('日付ピッカー表示エラー:', error);
  }
}

// ===== タスク管理機能 =====
function addTask(title, startTime, endTime, priority = 'normal') {
  try {
    if (!title || !startTime || !endTime) {
      throw new Error('必要な項目が入力されていません');
    }
    
    const newTask = new Task(null, title, startTime, endTime, priority, currentDate);
    tasks.push(newTask);
    saveToStorage();
    renderTasks();
    
    console.log('タスクを追加しました:', newTask);
    return newTask;
  } catch (error) {
    console.error('タスク追加エラー:', error);
    alert('タスクの追加に失敗しました: ' + error.message);
  }
}

function deleteTask(taskId) {
  try {
    const index = tasks.findIndex(task => task.id === taskId);
    if (index === -1) {
      throw new Error('タスクが見つかりません');
    }
    
    const deletedTask = tasks.splice(index, 1)[0];
    saveToStorage();
    renderTasks();
    
    console.log('タスクを削除しました:', deletedTask);
    return deletedTask;
  } catch (error) {
    console.error('タスク削除エラー:', error);
    alert('タスクの削除に失敗しました: ' + error.message);
  }
}

function updateTask(taskId, updates) {
  try {
    const task = tasks.find(task => task.id === taskId);
    if (!task) {
      throw new Error('タスクが見つかりません');
    }
    
    Object.assign(task, updates);
    saveToStorage();
    renderTasks();
    
    console.log('タスクを更新しました:', task);
    return task;
  } catch (error) {
    console.error('タスク更新エラー:', error);
    alert('タスクの更新に失敗しました: ' + error.message);
  }
}

function toggleTaskCompletion(taskId) {
  try {
    const task = tasks.find(task => task.id === taskId);
    if (!task) {
      throw new Error('タスクが見つかりません');
    }
    
    task.completed = !task.completed;
    saveToStorage();
    renderTasks();
    
    console.log('タスク完了状態を変更しました:', task);
    return task;
  } catch (error) {
    console.error('タスク完了状態変更エラー:', error);
    alert('タスクの状態変更に失敗しました: ' + error.message);
  }
}

// ===== UI レンダリング =====
function renderTasks() {
  try {
    const timeline = document.querySelector('.timeline-grid');
    if (!timeline) return;
    
    // 既存のタスクカードを削除（現在時刻ライン以外）
    const existingCards = timeline.querySelectorAll('.task-card');
    existingCards.forEach(card => card.remove());
    
    // 現在の日付のタスクのみをフィルタ
    const currentDateTasks = getCurrentTasksForDate();
    
    // フィルタを適用したタスクのみをレンダリング
    const filteredTasks = currentDateTasks.filter(task => activeFilters[task.priority]);
    
    filteredTasks.forEach(task => {
      const taskCard = createTaskCard(task);
      timeline.appendChild(taskCard);
    });
    
    console.log(`${currentDate}のタスクをレンダリングしました: ${filteredTasks.length}件表示中`);
  } catch (error) {
    console.error('タスクレンダリングエラー:', error);
  }
}

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = `task-card priority-${task.priority}`;
  card.dataset.taskId = task.id;
  card.setAttribute('role', 'gridcell');
  card.setAttribute('tabindex', '0');
  card.setAttribute('draggable', 'true');
  
  // 位置とサイズの計算
  const startMinutes = task.getStartMinutes();
  const durationMinutes = task.getDurationMinutes();
  
  card.style.top = startMinutes + 'px';
  card.style.height = durationMinutes + 'px';
  
  // カードの内容
  card.innerHTML = `
    <input 
      type="checkbox" 
      class="task-checkbox" 
      ${task.completed ? 'checked' : ''}
      onchange="toggleTaskCompletion('${task.id}')"
      aria-label="タスク完了チェック"
    >
    <h3 class="task-title ${task.completed ? 'completed' : ''}" 
        onclick="editTaskTitle('${task.id}')" 
        title="クリックして編集">${escapeHtml(task.title)}</h3>
    <div class="task-time-container">
      <time class="task-time" 
            onclick="editTaskTime('${task.id}')" 
            title="クリックして時間を編集"
            datetime="${task.startTime}/${task.endTime}">${task.getTimeString()}</time>
    </div>
    <div class="task-actions">
      <button class="task-delete-btn" onclick="confirmDeleteTask('${task.id}')" aria-label="タスクを削除">🗑️</button>
    </div>
  `;
  
  // アクセシビリティ
  card.setAttribute('aria-label', 
    `${task.title}タスク ${task.startTime}から${task.endTime}まで ${task.priority === 'high' ? '高優先度' : task.priority === 'urgent' ? '緊急' : ''}`
  );
  
  // ドラッグイベントの設定
  setupDragEvents(card);
  
  return card;
}

// HTMLエスケープ関数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== ドラッグ&ドロップ機能 =====
function setupDragEvents(card) {
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
  try {
    draggedTask = e.target;
    const rect = draggedTask.getBoundingClientRect();
    const timeline = document.querySelector('.timeline-grid').getBoundingClientRect();
    
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    draggedTask.style.opacity = '0.6';
    draggedTask.style.transform = 'rotate(2deg)';
    
    console.log('ドラッグ開始:', draggedTask.dataset.taskId);
  } catch (error) {
    console.error('ドラッグ開始エラー:', error);
  }
}

function handleDragEnd(e) {
  try {
    if (!draggedTask) return;
    
    draggedTask.style.opacity = '';
    draggedTask.style.transform = '';
    
    console.log('ドラッグ終了:', draggedTask.dataset.taskId);
    draggedTask = null;
  } catch (error) {
    console.error('ドラッグ終了エラー:', error);
  }
}

function initDrag() {
  try {
    const timeline = document.querySelector('.timeline-grid');
    if (!timeline) return;
    
    timeline.addEventListener('dragover', handleDragOver);
    timeline.addEventListener('drop', handleDrop);
    
    console.log('ドラッグ&ドロップを初期化しました');
  } catch (error) {
    console.error('ドラッグ初期化エラー:', error);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
  try {
    e.preventDefault();
    
    if (!draggedTask) return;
    
    const timeline = document.querySelector('.timeline-grid');
    const rect = timeline.getBoundingClientRect();
    const y = e.clientY - rect.top - dragOffset.y;
    
    // 新しい時刻を計算（1分=1px）
    const newStartMinutes = Math.max(0, Math.min(1439, Math.round(y)));
    const newStartHours = Math.floor(newStartMinutes / 60);
    const newStartMins = newStartMinutes % 60;
    const newStartTime = `${String(newStartHours).padStart(2, '0')}:${String(newStartMins).padStart(2, '0')}`;
    
    // タスクの長さを保持して終了時刻を計算
    const taskId = draggedTask.dataset.taskId;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const duration = task.getDurationMinutes();
    const newEndMinutes = (newStartMinutes + duration) % (24 * 60);
    const newEndHours = Math.floor(newEndMinutes / 60);
    const newEndMins = newEndMinutes % 60;
    const newEndTime = `${String(newEndHours).padStart(2, '0')}:${String(newEndMins).padStart(2, '0')}`;
    
    // タスクを更新
    updateTask(taskId, {
      startTime: newStartTime,
      endTime: newEndTime
    });
    
    console.log('タスクを移動しました:', newStartTime, '-', newEndTime);
  } catch (error) {
    console.error('ドロップエラー:', error);
  }
}

// ===== クイック追加機能 =====
function addQuickTask() {
  try {
    const input = document.getElementById('quick-input');
    const title = input ? input.value.trim() : '';
    
    if (!title) {
      alert('タスク名を入力してください');
      return;
    }
    
    // 現在時刻から1時間後のタスクとして追加
    const now = new Date();
    const startHours = String(now.getHours()).padStart(2, '0');
    const startMinutes = String(now.getMinutes()).padStart(2, '0');
    const endHours = String((now.getHours() + 1) % 24).padStart(2, '0');
    
    const startTime = `${startHours}:${startMinutes}`;
    const endTime = `${endHours}:${startMinutes}`;
    
    addTask(title, startTime, endTime, 'normal');
    
    // 入力フィールドをクリア
    if (input) {
      input.value = '';
      input.focus();
    }
    
    // 成功メッセージ
    showNotification(`タスク「${title}」を追加しました`, 'success');
    
  } catch (error) {
    console.error('クイック追加エラー:', error);
    alert('タスクの追加中にエラーが発生しました');
  }
}

// ===== インライン編集機能 =====
function editTaskTitle(taskId) {
  try {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    const titleElement = card.querySelector('.task-title');
    
    // すでに編集中の場合は何もしない
    if (titleElement.querySelector('input')) return;
    
    const currentTitle = task.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'inline-edit-input';
    input.style.cssText = `
      background: rgba(255, 255, 255, 0.95);
      border: 2px solid var(--primary);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
      width: 100%;
      box-sizing: border-box;
      margin: -2px 0;
    `;
    
    // 元のテキストを隠して入力フィールドを挿入
    titleElement.style.display = 'none';
    titleElement.parentNode.insertBefore(input, titleElement.nextSibling);
    input.focus();
    input.select();
    
    // 保存関数
    const saveEdit = () => {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== currentTitle) {
        updateTask(taskId, { title: newTitle });
        showNotification('タスク名を更新しました', 'success');
      }
      
      // 元に戻す
      titleElement.textContent = newTitle || currentTitle;
      titleElement.style.display = '';
      input.remove();
    };
    
    // キャンセル関数
    const cancelEdit = () => {
      titleElement.style.display = '';
      input.remove();
    };
    
    // イベントリスナー
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
    
    input.addEventListener('blur', saveEdit);
    
  } catch (error) {
    console.error('タイトル編集エラー:', error);
  }
}

function editTaskTime(taskId) {
  try {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    const timeContainer = card.querySelector('.task-time-container');
    const timeElement = card.querySelector('.task-time');
    
    // すでに編集中の場合は何もしない
    if (timeContainer.querySelector('input')) return;
    
    // 時間編集フォームを作成
    const editForm = document.createElement('div');
    editForm.className = 'time-edit-form';
    editForm.style.cssText = `
      display: flex;
      gap: 4px;
      align-items: center;
      background: rgba(255, 255, 255, 0.95);
      border: 2px solid var(--primary);
      border-radius: 4px;
      padding: 4px;
      margin: -2px 0;
    `;
    
    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.value = task.startTime;
    startInput.className = 'time-input';
    startInput.style.cssText = `
      border: none;
      background: transparent;
      font-family: inherit;
      font-size: 11px;
      width: 60px;
    `;
    
    const separator = document.createElement('span');
    separator.textContent = '-';
    separator.style.fontSize = '11px';
    
    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.value = task.endTime;
    endInput.className = 'time-input';
    endInput.style.cssText = `
      border: none;
      background: transparent;
      font-family: inherit;
      font-size: 11px;
      width: 60px;
    `;
    
    editForm.appendChild(startInput);
    editForm.appendChild(separator);
    editForm.appendChild(endInput);
    
    // 元の時間表示を隠して編集フォームを挿入
    timeElement.style.display = 'none';
    timeContainer.appendChild(editForm);
    startInput.focus();
    
    // 保存関数
    const saveTimeEdit = () => {
      const newStartTime = startInput.value;
      const newEndTime = endInput.value;
      
      // 時刻形式の検証
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
        showNotification('時刻の形式が正しくありません', 'error');
        return;
      }
      
      // 開始時刻が終了時刻より後でないかチェック
      const [startH, startM] = newStartTime.split(':').map(Number);
      const [endH, endM] = newEndTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      
      if (startMinutes >= endMinutes) {
        showNotification('開始時刻は終了時刻より前である必要があります', 'error');
        return;
      }
      
      // タスクを更新
      updateTask(taskId, {
        startTime: newStartTime,
        endTime: newEndTime
      });
      
      showNotification('時間を更新しました', 'success');
      
      // 元に戻す
      timeElement.style.display = '';
      editForm.remove();
    };
    
    // キャンセル関数
    const cancelTimeEdit = () => {
      timeElement.style.display = '';
      editForm.remove();
    };
    
    // イベントリスナー
    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTimeEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelTimeEdit();
      }
    };
    
    startInput.addEventListener('keydown', handleKeydown);
    endInput.addEventListener('keydown', handleKeydown);
    editForm.addEventListener('blur', (e) => {
      // フォーム内の要素にフォーカスが移った場合は保存しない
      if (!editForm.contains(e.relatedTarget)) {
        saveTimeEdit();
      }
    }, true);
    
  } catch (error) {
    console.error('時間編集エラー:', error);
  }
}

function confirmDeleteTask(taskId) {
  try {
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error('タスクが見つかりません');
    }
    
    if (confirm(`タスク「${task.title}」を削除しますか？`)) {
      deleteTask(taskId);
      showNotification('タスクを削除しました', 'info');
    }
  } catch (error) {
    console.error('タスク削除確認エラー:', error);
    alert('タスクの削除に失敗しました: ' + error.message);
  }
}

// ===== 通知システム =====
function showNotification(message, type = 'info') {
  try {
    // 既存の通知を削除
    const existing = document.querySelector('.notification');
    if (existing) {
      existing.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--accent)' : 'var(--info)'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      z-index: 2000;
      font-weight: 500;
      transition: all 0.3s ease;
      transform: translateX(100%);
    `;
    
    document.body.appendChild(notification);
    
    // アニメーション
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // 3秒後に自動削除
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 3000);
    
  } catch (error) {
    console.error('通知表示エラー:', error);
  }
}

// ===== 時計更新関数 =====
function updateClock() {
  try {
    const now = new Date();
    
    // 現在時刻のフォーマット
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    // メイン時計（表示中の日付と現在時刻）
    const displayDate = formatDateForDisplay(currentDate);
    const mainClockText = `${displayDate} ${hours}:${minutes}`;
    const mainClockElement = document.getElementById('main-clock');
    if (mainClockElement) {
      mainClockElement.textContent = mainClockText;
    }
    
    // ヘッダー右端の時計
    const headerClockText = `${hours}:${minutes}`;
    const headerClockElement = document.getElementById('header-clock');
    if (headerClockElement) {
      headerClockElement.textContent = headerClockText;
    }
  } catch (error) {
    console.error('時計更新エラー:', error);
  }
}

// ===== 現在時刻ライン更新関数 =====
function updateNowLine() {
  try {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const today = getCurrentDateString();
    
    // 現在時刻を分に変換（0:00からの経過分）
    const totalMinutes = hours * 60 + minutes;
    
    // 1分 = 1px で計算
    const topPosition = totalMinutes;
    
    // 現在時刻ラインの位置を更新
    const nowLine = document.getElementById('now-line');
    if (nowLine) {
      // 今日のタスクを表示している場合のみ現在時刻ラインを表示
      if (currentDate === today) {
        nowLine.style.display = 'block';
        nowLine.style.top = topPosition + 'px';
      } else {
        nowLine.style.display = 'none';
      }
    }
    
    // 現在時刻の時刻ラベルを強調表示（今日のみ）
    if (currentDate === today) {
      updateCurrentHourLabel(hours);
    } else {
      // 他の日の場合は強調表示をクリア
      clearCurrentHourLabel();
    }
    
  } catch (error) {
    console.error('現在時刻ライン更新エラー:', error);
  }
}

function clearCurrentHourLabel() {
  try {
    const allTimeLabels = document.querySelectorAll('.time-label');
    allTimeLabels.forEach(label => {
      label.classList.remove('current-hour');
    });
  } catch (error) {
    console.error('時刻ラベルクリアエラー:', error);
  }
}

// 現在時刻の時刻ラベルを強調表示する関数
function updateCurrentHourLabel(currentHour) {
  try {
    // 全ての時刻ラベルから current-hour クラスを削除
    const allTimeLabels = document.querySelectorAll('.time-label');
    allTimeLabels.forEach(label => {
      label.classList.remove('current-hour');
    });
    
    // 現在時刻のラベルに current-hour クラスを追加
    const currentLabel = document.querySelector(`.time-label[data-hour="${currentHour}"]`);
    if (currentLabel) {
      currentLabel.classList.add('current-hour');
    }
  } catch (error) {
    console.error('時刻ラベル強調表示エラー:', error);
  }
}

// ===== パフォーマンス最適化された更新関数 =====
function optimizedUpdate() {
  requestAnimationFrame(() => {
    updateClock();
    updateNowLine();
  });
}

// ===== 初期化処理 =====
document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log('NowTask 段階2 - 基本機能実装 - 初期化開始');
    
    // データの読み込み
    loadFromStorage();
    
    // 初回の時計表示
    updateClock();
    updateNowLine();
    
    // タスクのレンダリング
    renderTasks();
    
    // ドラッグ&ドロップの初期化
    initDrag();
    
    // 1秒ごとに時計と現在時刻ラインを更新
    setInterval(optimizedUpdate, 1000);
    
    console.log('NowTask 段階2 - 基本機能実装 - 初期化完了');
    
    // 初回使用時のガイダンス
    if (tasks.length <= 4) { // ダミーデータのみの場合
      setTimeout(() => {
        showNotification('ドラッグでタスクを移動、✏️で編集、🗑️で削除できます', 'info');
      }, 1000);
    }
    
  } catch (error) {
    console.error('初期化エラー:', error);
    alert('アプリケーションの初期化に失敗しました');
  }
});

// エンターキーでクイック追加実行
document.addEventListener('DOMContentLoaded', function() {
  try {
    const quickInput = document.getElementById('quick-input');
    if (quickInput) {
      quickInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addQuickTask();
        }
      });
    }
  } catch (error) {
    console.error('クイック追加入力フィールド初期化エラー:', error);
  }
});

// ===== サイドバー機能 =====

// ===== 詳細タスク追加フォーム管理 =====

// フォームの表示/非表示を切り替え
function toggleCustomTaskForm() {
  const form = document.getElementById('custom-task-form');
  if (!form) return;
  
  if (form.style.display === 'none' || !form.style.display) {
    showCustomTaskForm();
  } else {
    hideCustomTaskForm();
  }
}

// フォームを表示
function showCustomTaskForm() {
  const form = document.getElementById('custom-task-form');
  if (!form) return;
  
  form.style.display = 'block';
  
  // 現在時刻をデフォルト値として設定
  const now = getCurrentTime();
  const oneHourLater = getOneHourLater(now);
  
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-start-time').value = now;
  document.getElementById('task-end-time').value = oneHourLater;
  
  // 通常優先度を選択
  const normalRadio = document.querySelector('input[name="task-priority"][value="normal"]');
  if (normalRadio) normalRadio.checked = true;
  
  // タスク名入力フィールドにフォーカス
  setTimeout(() => {
    const titleInput = document.getElementById('task-title-input');
    if (titleInput) titleInput.focus();
  }, 100);
}

// フォームを隠す
function hideCustomTaskForm() {
  const form = document.getElementById('custom-task-form');
  if (!form) return;
  
  // フェードアウトアニメーション
  form.style.animation = 'slideUp 0.3s ease-out forwards';
  
  setTimeout(() => {
    form.style.display = 'none';
    form.style.animation = '';
  }, 300);
}

// フェードアウトアニメーション用CSS（既に追加されていない場合）
const slideUpKeyframes = `
@keyframes slideUp {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
  }
}
`;

// スタイルシートにアニメーションを追加
if (!document.querySelector('#slideUpAnimation')) {
  const style = document.createElement('style');
  style.id = 'slideUpAnimation';
  style.textContent = slideUpKeyframes;
  document.head.appendChild(style);
}

// カスタムタスクを保存
function saveCustomTask() {
  try {
    // フォームの値を取得
    const title = document.getElementById('task-title-input').value.trim();
    const startTime = document.getElementById('task-start-time').value;
    const endTime = document.getElementById('task-end-time').value;
    const priorityElement = document.querySelector('input[name="task-priority"]:checked');
    
    // バリデーション
    if (!title) {
      showNotification('タスク名を入力してください', 'error');
      document.getElementById('task-title-input').focus();
      return;
    }
    
    if (!startTime) {
      showNotification('開始時刻を入力してください', 'error');
      document.getElementById('task-start-time').focus();
      return;
    }
    
    if (!endTime) {
      showNotification('終了時刻を入力してください', 'error');
      document.getElementById('task-end-time').focus();
      return;
    }
    
    // 時刻の妥当性チェック
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes >= endMinutes && endMinutes !== 0) {
      showNotification('終了時刻は開始時刻より後に設定してください', 'error');
      document.getElementById('task-end-time').focus();
      return;
    }
    
    const priority = priorityElement ? priorityElement.value : 'normal';
    
    // タスクを追加
    addTask(title, startTime, endTime, priority);
    
    // 成功通知
    showNotification(`タスク「${title}」を追加しました`, 'success');
    
    // フォームを隠す
    hideCustomTaskForm();
    
  } catch (error) {
    console.error('タスク保存エラー:', error);
    showNotification('タスクの追加に失敗しました', 'error');
  }
}

// Enterキーでの保存、Escapeキーでのキャンセル
document.addEventListener('keydown', function(e) {
  const form = document.getElementById('custom-task-form');
  if (!form || form.style.display === 'none') return;
  
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveCustomTask();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideCustomTaskForm();
  }
});

// 開始時刻が変更されたら、終了時刻を自動調整
document.addEventListener('DOMContentLoaded', function() {
  const startTimeInput = document.getElementById('task-start-time');
  const endTimeInput = document.getElementById('task-end-time');
  
  if (startTimeInput && endTimeInput) {
    startTimeInput.addEventListener('change', function() {
      const startTime = this.value;
      if (startTime) {
        const suggestedEndTime = getOneHourLater(startTime);
        endTimeInput.value = suggestedEndTime;
      }
    });
  }
});

// ===== 時刻選択機能 =====

// 選択された時刻を保存する変数
let selectedTimeMinutes = null;

// タイムライン選択機能の初期化
function initTimelineSelection() {
  console.log('タイムライン選択機能を初期化中...');
  
  const timeline = document.getElementById('timeline-grid');
  if (!timeline) {
    console.error('timeline-grid要素が見つかりません');
    return;
  }
  
  // 既存のイベントリスナーを削除（重複防止）
  timeline.removeEventListener('click', handleTimelineClick);
  
  // 新しいイベントリスナーを追加
  timeline.addEventListener('click', handleTimelineClick);
  
  console.log('タイムライン選択機能の初期化完了');
  
  // テスト用の暫定的な視覚的フィードバック
  timeline.style.cursor = 'crosshair';
  timeline.title = 'クリックして時刻を選択';
}

// タイムラインクリック処理
function handleTimelineClick(event) {
  console.log('タイムラインクリックが検出されました', event.target);
  
  // タスクカードや他の要素をクリックした場合は無視
  if (event.target.closest('.task-card') || 
      event.target.closest('.time-selector') || 
      event.target.closest('.now-line') ||
      event.target.closest('.task-edit-btn') ||
      event.target.closest('.task-delete-btn') ||
      event.target.closest('.task-checkbox')) {
    console.log('タスクカードまたは他の要素をクリックしたため無視');
    return;
  }
  
  const timeline = document.querySelector('.timeline-grid');
  if (!timeline) {
    console.error('timeline-gridが見つかりません');
    return;
  }
  
  const rect = timeline.getBoundingClientRect();
  console.log('Timeline rect:', rect);
  
  // timeline-grid内でのクリック位置を計算
  const y = event.clientY - rect.top;
  console.log('計算されたY座標:', y, 'clientY:', event.clientY, 'rect.top:', rect.top);
  
  // Y座標を分単位に変換（1px = 1分）
  const minutes = Math.round(y);
  console.log('計算された分数:', minutes);
  
  // 0-1439分の範囲内に制限
  if (minutes < 0 || minutes >= 1440) {
    console.log('分数が範囲外:', minutes);
    return;
  }
  
  // 時刻を設定
  setSelectedTime(minutes);
  
  // タイムライン選択のフィードバック効果
  showTimelineClickFeedback(event.clientX, event.clientY);
}

// タイムライン選択時の視覚的フィードバック
function showTimelineClickFeedback(x, y) {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 20px;
    height: 20px;
    background: var(--primary-500);
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    opacity: 0.8;
    pointer-events: none;
    z-index: 9999;
    animation: clickRipple 0.4s ease-out forwards;
  `;
  
  // CSS アニメーションをスタイルシートに追加（1回のみ）
  if (!document.querySelector('#clickRippleAnimation')) {
    const style = document.createElement('style');
    style.id = 'clickRippleAnimation';
    style.textContent = `
      @keyframes clickRipple {
        0% {
          transform: translate(-50%, -50%) scale(0);
          opacity: 0.8;
        }
        50% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.6;
        }
        100% {
          transform: translate(-50%, -50%) scale(2);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(feedback);
  
  // 0.4秒後に要素を削除
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.parentNode.removeChild(feedback);
    }
  }, 400);
}

// 選択時刻を設定
function setSelectedTime(minutes) {
  console.log('setSelectedTime関数が呼ばれました:', minutes);
  
  selectedTimeMinutes = minutes;
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  
  console.log('計算された時刻:', timeStr);
  
  // 時刻選択インジケーターを表示
  const selector = document.getElementById('time-selector');
  const selectorTime = document.getElementById('selector-time');
  
  console.log('セレクター要素:', selector, selectorTime);
  
  if (selector && selectorTime) {
    selector.style.display = 'block';
    selector.style.top = `${minutes}px`;
    selectorTime.textContent = timeStr;
    console.log('セレクターを表示しました:', minutes + 'px');
  } else {
    console.error('セレクター要素が見つかりません');
  }
  
  // サイドバーの選択状態を表示
  const status = document.getElementById('time-selection-status');
  const display = document.getElementById('selected-time-display');
  
  console.log('ステータス要素:', status, display);
  
  if (status && display) {
    status.style.display = 'block';
    display.textContent = timeStr;
    console.log('ステータス表示を更新しました');
  } else {
    console.error('ステータス要素が見つかりません');
  }
  
  console.log(`✓ 時刻選択完了: ${timeStr} (${minutes}分)`);
  
  // 成功通知を表示
  showNotification(`時刻選択: ${timeStr}`, 'info');
}

// 時刻選択をクリア
function clearTimeSelection() {
  selectedTimeMinutes = null;
  
  // インジケーターを非表示
  const selector = document.getElementById('time-selector');
  if (selector) {
    selector.style.display = 'none';
  }
  
  // サイドバーの状態を非表示
  const status = document.getElementById('time-selection-status');
  if (status) {
    status.style.display = 'none';
  }
  
  console.log('時刻選択をクリアしました');
}

// 選択時刻を取得（文字列形式）
function getSelectedTimeString() {
  if (selectedTimeMinutes === null) return null;
  
  const hours = Math.floor(selectedTimeMinutes / 60);
  const mins = selectedTimeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// ===== テンプレート機能 =====

// 夜勤テンプレートを追加
function addWorkShiftTemplate() {
  try {
    let startTime = '17:00';
    
    // 選択時刻がある場合はそれを使用
    if (selectedTimeMinutes !== null) {
      startTime = getSelectedTimeString();
    }
    
    const endTime = addHoursToTime(startTime, 16); // 16時間勤務
    const title = '夜勤';
    const priority = 'high';
    
    // タスクを追加
    addTask(title, startTime, endTime, priority);
    
    // 成功通知
    const timeInfo = selectedTimeMinutes !== null ? 
      `選択時刻から（${startTime}-${endTime}）` : 
      `デフォルト時刻で（${startTime}-${endTime}）`;
    showNotification(`夜勤タスク ${timeInfo} を追加しました`, 'success');
    
    // 選択をクリア
    clearTimeSelection();
    
    console.log('夜勤テンプレートを追加しました');
    
  } catch (error) {
    console.error('夜勤テンプレート追加エラー:', error);
    showNotification('夜勤テンプレートの追加に失敗しました', 'error');
  }
}

// 睡眠テンプレートを追加
function addSleepTemplate(hours) {
  try {
    let startTime;
    
    // 選択時刻がある場合はそれを使用
    if (selectedTimeMinutes !== null) {
      startTime = getSelectedTimeString();
    } else {
      // デフォルト就寝時間を設定（23:00）
      const defaultBedtime = '23:00';
      startTime = defaultBedtime;
      
      // 現在時刻をチェックして、適切な就寝時間を提案
      const now = new Date();
      const currentHour = now.getHours();
      
      // 夜中（0-6時）の場合は現在時刻をベースに
      if (currentHour >= 0 && currentHour <= 6) {
        startTime = getCurrentTime();
      }
      // 昼間（7-21時）の場合はデフォルト時刻を使用
      else if (currentHour >= 7 && currentHour <= 21) {
        startTime = defaultBedtime;
      }
      // 夜（22-23時）の場合は現在時刻を使用
      else {
        startTime = getCurrentTime();
      }
    }
    
    // 終了時刻を計算
    const endTime = addHoursToTime(startTime, hours);
    const title = `睡眠（${hours}時間）`;
    const priority = 'normal';
    
    // タスクを追加
    addTask(title, startTime, endTime, priority);
    
    // 成功通知
    const timeInfo = selectedTimeMinutes !== null ? 
      `選択時刻から（${hours}時間）` : 
      `${hours}時間`;
    showNotification(`睡眠タスク ${timeInfo} を追加しました`, 'success');
    
    // 選択をクリア
    clearTimeSelection();
    
    console.log(`睡眠テンプレート（${hours}時間）を追加しました:`, startTime, '-', endTime);
    
  } catch (error) {
    console.error('睡眠テンプレート追加エラー:', error);
    showNotification('睡眠テンプレートの追加に失敗しました', 'error');
  }
}

// 指定時間を指定時間数後に計算
function addHoursToTime(timeStr, hours) {
  try {
    const [baseHours, minutes] = timeStr.split(':').map(Number);
    let totalHours = baseHours + hours;
    
    // 24時間を超える場合の処理
    if (totalHours >= 24) {
      totalHours = totalHours % 24;
    }
    
    return `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
  } catch (error) {
    console.error('時刻計算エラー:', error);
    return '08:00'; // フォールバック
  }
}

// 時刻文字列から時間数を計算
function getHoursFromTime(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
  } catch (error) {
    return 0;
  }
}

// 時刻の妥当性をチェック
function isValidTimeRange(startTime, endTime) {
  const start = getHoursFromTime(startTime);
  const end = getHoursFromTime(endTime);
  
  // 日をまたぐ場合を考慮
  if (end < start) {
    return true; // 例：23:00-07:00
  }
  
  return end > start;
}

// 現在時刻を取得
function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 1時間後の時刻を取得
function getOneHourLater(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const laterHours = (hours + 1) % 24;
    return `${String(laterHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } catch {
    return '12:00';
  }
}

// 完了済みタスクを削除
function clearCompleted() {
  try {
    const currentDateTasks = getCurrentTasksForDate();
    const completedTasks = currentDateTasks.filter(task => task.completed);
    if (completedTasks.length === 0) {
      showNotification('完了済みのタスクはありません', 'info');
      return;
    }
    
    if (confirm(`${completedTasks.length}件の完了済みタスクを削除しますか？`)) {
      tasks = tasks.filter(task => !(task.date === currentDate && task.completed));
      saveToStorage();
      renderTasks();
      showNotification(`${completedTasks.length}件のタスクを削除しました`, 'success');
    }
  } catch (error) {
    console.error('完了済みタスク削除エラー:', error);
    alert('完了済みタスクの削除に失敗しました');
  }
}

// フィルタ状態管理
let activeFilters = {
  normal: true,
  high: true,
  urgent: true
};

// フィルタ切り替え
function toggleFilter(priority) {
  try {
    activeFilters[priority] = !activeFilters[priority];
    renderTasks();
    console.log('フィルタを切り替えました:', activeFilters);
  } catch (error) {
    console.error('フィルタ切り替えエラー:', error);
  }
}

// タスク統計の更新
function updateStats() {
  try {
    const currentDateTasks = getCurrentTasksForDate();
    const totalTasks = currentDateTasks.length;
    const completedTasks = currentDateTasks.filter(task => task.completed).length;
    const totalMinutes = currentDateTasks.reduce((sum, task) => sum + task.getDurationMinutes(), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
    
    // DOM要素の更新
    const totalTasksElement = document.getElementById('total-tasks');
    const completedTasksElement = document.getElementById('completed-tasks');
    const totalHoursElement = document.getElementById('total-hours');
    
    if (totalTasksElement) totalTasksElement.textContent = totalTasks;
    if (completedTasksElement) completedTasksElement.textContent = completedTasks;
    if (totalHoursElement) totalHoursElement.textContent = totalHours + 'h';
    
  } catch (error) {
    console.error('統計更新エラー:', error);
  }
}

// ===== レンダリング機能の拡張 =====

// フィルタを適用したタスクレンダリング
function renderTasks() {
  try {
    const timeline = document.querySelector('.timeline-grid');
    if (!timeline) return;
    
    // 既存のタスクカードを削除（現在時刻ライン以外）
    const existingCards = timeline.querySelectorAll('.task-card');
    existingCards.forEach(card => card.remove());
    
    // フィルタを適用したタスクのみをレンダリング
    const filteredTasks = tasks.filter(task => activeFilters[task.priority]);
    
    filteredTasks.forEach(task => {
      const taskCard = createTaskCard(task);
      timeline.appendChild(taskCard);
    });
    
    // 統計情報を更新
    updateStats();
    
    console.log('タスクをレンダリングしました:', filteredTasks.length + '件表示中');
  } catch (error) {
    console.error('タスクレンダリングエラー:', error);
  }
}

// ===== ツールチップ機能（削除） =====
// キーボードショートカットはプロジェクトルールにより実装禁止

// ===== 初期化の拡張 =====
document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log('NowTask 段階2 - 基本機能実装 - 初期化開始');
    
    // データの読み込み
    loadFromStorage();
    
    // 初回の時計表示
    updateClock();
    updateNowLine();
    
    // タスクのレンダリング
    renderTasks();
    
    // ドラッグ&ドロップの初期化
    initDrag();
    
    // タイムライン選択機能の初期化
    initTimelineSelection();
    
    // ツールチップの初期化は削除（キーボードショートカット禁止のため）
    
    // 1秒ごとに時計と現在時刻ラインを更新
    setInterval(optimizedUpdate, 1000);
    
    // 統計情報の初期化
    updateStats();
    
    console.log('NowTask 段階2 - 基本機能実装 - 初期化完了');
    
    // 初回使用時のガイダンス
    if (tasks.length <= 4) { // ダミーデータのみの場合
      setTimeout(() => {
        showNotification('✨ NowTaskへようこそ！タイムラインをクリックして時刻選択、ドラッグでタスク移動ができます', 'info');
      }, 1000);
    }
    
    // デバッグ用：タイムライン選択機能のテスト
    setTimeout(() => {
      console.log('📍 タイムライン選択機能テスト:');
      console.log('- タイムライン要素:', document.getElementById('timeline-grid'));
      console.log('- セレクター要素:', document.getElementById('time-selector'));
      console.log('- ステータス要素:', document.getElementById('time-selection-status'));
      console.log('- テスト: 12:00 (720分) に設定してみます...');
      
      // テスト用の時刻設定
      // setSelectedTime(720); // 12:00をテスト（コメントアウトしておく）
    }, 2000);
    
  } catch (error) {
    console.error('初期化エラー:', error);
    alert('アプリケーションの初期化に失敗しました');
  }
});

// ページアンロード時の保存
window.addEventListener('beforeunload', function() {
  saveToStorage();
});