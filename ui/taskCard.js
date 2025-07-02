/**
 * タスクカードUI管理（Testing Trophy: Integration Level）
 * DOM操作とユーザーインタラクションの責務分離
 *
 * @author Kent C. Dodds Testing Trophy + t-wada推奨の単一責任
 */

import { timeStringToMinutes, minutesToTimeString, snap15, isValidTimeRange } from '../core/timeUtils.js';
import { recalculateAllLanes } from '../core/laneEngine.js';
import { saveToStorage, Task } from '../services/storage.js';
import { ensureVisibleDays, renderTasksToPanel } from './virtualScroll.js';

/**
 * HTML文字列エスケープ（セキュリティ対策）
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * ARIA Live Region での読み上げ機能
 */
function announceToScreenReader(message, priority = 'polite') {
  try {
    const ariaLive = document.getElementById('aria-live-region');
    if (ariaLive) {
      ariaLive.textContent = '';
      setTimeout(() => {
        ariaLive.textContent = message;
        ariaLive.setAttribute('aria-live', priority);
      }, 50);
    }
  } catch (error) {
    console.error('スクリーンリーダー読み上げエラー:', error);
  }
}

/**
 * 通知メッセージを表示（改善版）
 * @param {string} message - 表示するメッセージ
 * @param {string} type - 通知のタイプ ('success', 'error', 'info')
 * @param {number} duration - 表示時間（ミリ秒）
 */
export function showNotification(message, type = 'info', duration = 4000) {
  try {
    // 既存の通知を削除
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
      notification.classList.add('hiding');
      setTimeout(() => notification.remove(), 300);
    });

    // 新しい通知要素を作成
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // アイコンとメッセージを設定
    const icons = {
      success: '✓',
      error: '⚠',
      info: 'ℹ'
    };
    
    notification.innerHTML = `
      <span class="notification-icon">${icons[type] || icons.info}</span>
      <span class="notification-message">${escapeHtml(message)}</span>
    `;

    // DOM に追加
    document.body.appendChild(notification);

    // 指定時間後に自動削除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('hiding');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, duration);

    // 通知をクリックして手動削除
    notification.addEventListener('click', () => {
      notification.classList.add('hiding');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    });

    // アクセシビリティ：スクリーンリーダーに通知
    announceToScreenReader(message, type === 'error' ? 'assertive' : 'polite');

  } catch (error) {
    console.error('通知表示エラー:', error);
    // フォールバック：console.log で表示
    console.log(`${type.toUpperCase()}: ${message}`);
  }
}

/**
 * タスクカードの基本的なARIA属性設定
 */
function setTaskCardARIA(card, task) {
  try {
    card.setAttribute('role', 'gridcell');

    const priorityText = task.priority === 'high' ? '高優先度' :
                        task.priority === 'urgent' ? '緊急' : '通常';
    const statusText = task.completed ? '完了済み' : '未完了';
    const durationMinutes = task.getDurationMinutes();
    const durationText = `所要時間${durationMinutes}分`;

    const ariaLabel = `${task.title}、${task.startTime}から${task.endTime}まで、` +
                     `${priorityText}、${statusText}、${durationText}`;

    card.setAttribute('aria-label', ariaLabel);

  } catch (error) {
    console.error('タスクカードARIA設定エラー:', error);
  }
}

/**
 * タスクカード作成（メイン関数）
 * @param {Task} task - タスクオブジェクト
 * @param {HTMLElement} targetPanel - 描画対象のパネル（日付跨ぎ用）
 * @returns {HTMLElement} タスクカード要素
 */
export function createTaskCard(task, targetPanel = null) {
  try {
    if (!task) {
      throw new Error('Task object is required');
    }

    /* ❶ 日付跨ぎタスクの分割処理 */
    if (task.isOvernight()) {
      const { firstPart, secondPart } = task.splitIntoTwo();

      // 当日部分を現在パネルに描画
      const firstCard = createSingleTaskCard(firstPart, task.id);

      // 翌日部分を翌日パネルに再帰描画
      const nextDate = secondPart.date;
      let nextPanel = document.querySelector(`[data-date="${nextDate}"]`);

      if (!nextPanel) {
        // 翌日パネルが存在しない場合は動的に生成
        try {
          ensureVisibleDays(nextDate);
          nextPanel = document.querySelector(`[data-date="${nextDate}"]`);
        } catch (error) {
          console.warn('翌日パネル生成失敗:', nextDate, error);
        }
      }

      if (nextPanel) {
        const secondCard = createTaskCard(secondPart, nextPanel);
        const tasksContainer = nextPanel.querySelector('.tasks-container');
        if (tasksContainer) {
          tasksContainer.appendChild(secondCard);
        }
      } else {
        console.warn('翌日パネルが見つかりません:', nextDate);
      }

      return firstCard;
    }

    /* ❷ 通常タスクの処理 */
    return createSingleTaskCard(task, task.id);

  } catch (error) {
    console.error('タスクカード作成エラー:', error);
    return createErrorCard(error.message);
  }
}

/**
 * 単一タスクカード作成（分割処理から分離）
 * @param {Task} task - タスクオブジェクト
 * @param {string} parentId - 親タスクID（分割タスク用）
 * @returns {HTMLElement} タスクカード要素
 */
function createSingleTaskCard(task, parentId) {
  try {
    /* ❶ DOM要素の作成 */
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority}`;
    card.dataset.taskId = task.id;

    // 分割タスクの場合は親IDを属性に設定
    if (parentId !== task.id) {
      card.dataset.parentId = parentId;
      card.classList.add('overnight-part');
    }

    /* ❲ 位置とサイズの計算（transform最適化版） */
    const startMin = task.getStartMinutes();
    const endMin = task.getEndMinutes();
    const height = endMin - startMin;

    // transformベースの位置設定でリフロー削減
    card.style.transform = `translateY(${startMin}px)`;
    card.style.height = height + 'px';
    card.style.left = '0px';
    card.style.position = 'absolute';
    card.style.width = '100%';
    card.style.zIndex = '100';

    // GPU加速とレイアウト最適化
    card.style.willChange = 'transform';
    card.style.backfaceVisibility = 'hidden';
    card.style.contain = 'layout style paint';

    /* ❸ HTML内容の構築 */
    // 分割タスクの場合は親IDを使用してイベント処理
    const effectiveId = parentId !== task.id ? parentId : task.id;

    card.innerHTML = `
      <div class="task-content">
        <div class="task-header">
          <h3 class="task-title" onclick="editTaskTitle('${effectiveId}')" 
             data-tooltip="クリックして編集 (E)" data-tooltip-pos="top">${escapeHtml(task.title)}</h3>
          <div class="task-actions">
            <button class="task-action-btn" onclick="toggleTaskCompletion('${effectiveId}')" 
                    title="${task.completed ? '未完了に戻す' : '完了にする'}"
                    data-tooltip="${task.completed ? '未完了に戻す' : '完了にする'}"
                    aria-label="${task.completed ? '未完了に戻す' : '完了にする'}">
              ${task.completed ? '↺' : '✓'}
            </button>
            <button class="task-action-btn delete-btn" onclick="confirmDeleteTask('${effectiveId}')" 
                    title="削除" aria-label="タスクを削除"
                    data-tooltip="削除 (Del)" data-tooltip-pos="top">✕</button>
          </div>
        </div>
        <div class="task-time-container">
          <div class="task-time" onclick="editTaskTime('${effectiveId}')" 
               datetime="${task.startTime}/${task.endTime}"
               data-tooltip="時刻を編集"
               title="クリックして時刻を編集">${task.getTimeString()}</div>
        </div>
        <div class="task-resize-handle" 
             data-tooltip="ドラッグしてサイズ変更" 
             data-tooltip-pos="bottom"
             title="ドラッグしてサイズ変更"></div>
      </div>
    `;

    /* ❹ ドラッグ & リサイズ機能の有効化 */
    enableDragAndResize(card);

    /* ❺ マルチセレクト機能の追加 */
    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleTaskCardClick(e, task.id);
    });

    /* ❻ 右クリックメニューの設定 */
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, task.id);
    });

    /* ❼ 基本的なARIA属性 */
    setTaskCardARIA(card, task);

    /* ❽ 選択可能にする */
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-selected', 'false');

    /* ❽ 作成アニメーションを適用 */
    card.classList.add('creating');
    
    // アニメーション終了後にクラスを削除
    card.addEventListener('animationend', function onAnimationEnd(e) {
      if (e.animationName === 'task-create') {
        card.classList.remove('creating');
        card.removeEventListener('animationend', onAnimationEnd);
      }
    });

    return card;

  } catch (error) {
    console.error('単一タスクカード作成エラー:', error);
    return createErrorCard(error.message);
  }
}

/**
 * エラー用のカード作成
 */
function createErrorCard(errorMessage) {
  const errorCard = document.createElement('div');
  errorCard.className = 'task-card error-card';
  errorCard.innerHTML = `
    <div class="task-content">
      <div class="task-title">エラー</div>
      <div class="task-time">${escapeHtml(errorMessage)}</div>
    </div>
  `;
  errorCard.style.cssText = 'position: absolute; top: 0; height: 60px; background: #ffebee; border: 2px solid #f44336;';
  return errorCard;
}

/**
 * transform値からtop位置を計算
 */
function getComputedTop(card) {
  const transform = getComputedStyle(card).transform;
  if (transform && transform !== 'none') {
    const match = transform.match(/translateY\(([^)]+)px\)/);
    if (match) {
      return parseInt(match[1]);
    }
  }
  return 0;
}

/**
 * ドラッグ&リサイズ機能の有効化（クリック処理も統合）
 * @param {HTMLElement} card - タスクカード要素
 */
export function enableDragAndResize(card) {
  let isDragging = false;
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startHeight = 0;
  const DRAG_THRESHOLD = 5;

  function onDown(e) {
    // アクションボタンが押された場合は何もしない
    if (e.target.closest('.task-action-btn')) {
      return;
    }

    startX = e.clientX || e.touches[0].clientX;
    startY = e.clientY || e.touches[0].clientY;
    startTop = parseInt(card.style.top) || 0;
    startHeight = parseInt(card.style.height) || 60;
    card.dataset.currentTop = startTop;

    isDragging = false;
    isResizing = false;

    if (e.target.classList.contains('task-resize-handle')) {
      // リサイズ操作の準備
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function onMove(e) {
    const currentX = e.clientX || e.touches[0].clientX;
    const currentY = e.clientY || e.touches[0].clientY;

    if (!isDragging && (Math.abs(currentX - startX) > DRAG_THRESHOLD || Math.abs(currentY - startY) > DRAG_THRESHOLD)) {
      isDragging = true;
      e.preventDefault(); // ドラッグが開始されたらテキスト選択などを防ぐ

      if (e.target.classList.contains('task-resize-handle')) {
        isResizing = true;
        document.body.style.cursor = 'ns-resize';
        card.classList.add('resizing');
      } else {
        document.body.style.cursor = 'grabbing';
        card.classList.add('dragging');
      }
    }

    if (isDragging) {
      e.preventDefault();
      const deltaY = currentY - startY;

      if (isResizing) {
        // サイズ変更
        const newHeight = snap15(startHeight + deltaY);
        const minHeight = 15;
        const maxHeight = 1440 - startTop;
        card.style.height = `${Math.max(minHeight, Math.min(maxHeight, newHeight))}px`;
      } else {
        // 位置変更
        const newTop = snap15(startTop + deltaY);
        const clampedTop = Math.max(0, Math.min(1440 - startHeight, newTop));
        card.style.top = `${clampedTop}px`;
        card.dataset.currentTop = clampedTop;
      }
    }
  }

  function onUp(e) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);

    document.body.style.cursor = '';
    card.classList.remove('dragging', 'resizing');

    if (isDragging) {
      // ドラッグ・リサイズ完了処理
      const taskId = card.dataset.taskId;
      const newTop = parseInt(card.style.top);
      const newHeight = parseInt(card.style.height);
      const newStartTime = minutesToTimeString(newTop);
      const newEndTime = minutesToTimeString(newTop + newHeight);
      
      updateTaskFromCard(taskId, { startTime: newStartTime, endTime: newEndTime });
      showNotification(`時間変更: ${newStartTime} - ${newEndTime}`, 'success', 2000);
      setTimeout(() => {
        recalculateAllLanes();
        if (window.renderTasks) window.renderTasks();
      }, 50);
    } else {
      // クリック処理
      const taskId = card.dataset.taskId;
      if (e.shiftKey && window.lastSelectedTaskId) {
        selectTaskRange(window.lastSelectedTaskId, taskId);
      } else if (e.ctrlKey || e.metaKey) {
        window.toggleTaskSelection(taskId);
      } else {
        window.clearAllSelections();
        window.toggleTaskSelection(taskId);
      }
      window.lastSelectedTaskId = taskId;
    }

    isDragging = false;
    isResizing = false;
  }

  card.addEventListener('mousedown', onDown);
  card.addEventListener('touchstart', onDown, { passive: true });
}

/**
 * タスクデータの更新（AppStateとlocalStorage）
 */
function updateTaskFromCard(taskId, updates) {
  try {
    const appState = window.AppState;
    if (!appState || !appState.tasks) {return;}

    const taskIndex = appState.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {return;}

    const currentTask = appState.tasks[taskIndex];
    const updatedTask = currentTask.update(updates);

    // AppStateを更新
    appState.tasks[taskIndex] = updatedTask;

    // localStorage保存
    saveToStorage();

    // ARIAラベル更新
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    if (card) {
      setTaskCardARIA(card, updatedTask);

      // 時刻表示も更新
      const timeElement = card.querySelector('.task-time');
      if (timeElement) {
        timeElement.textContent = updatedTask.getTimeString();
        timeElement.setAttribute('datetime', `${updatedTask.startTime}/${updatedTask.endTime}`);
      }
    }

  } catch (error) {
    console.error('タスク更新エラー:', error);
    showNotification('タスクの更新に失敗しました', 'error');
  }
}

/**
 * タスクタイトルのインライン編集
 * @param {string} taskId - タスクID
 */
export function editTaskTitle(taskId) {
  try {
    const task = window.taskManager.getTask(taskId);
    if (!task) {
      console.warn(`タスクが見つかりません: ${taskId}`);
      return;
    }

    // 編集中のアニメーション効果
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    if (card) {
      card.classList.add('editing');
      setTimeout(() => card.classList.remove('editing'), 300);
    }

    // インライン入力を表示
    showInlineInput(
      'タスク名を編集',
      'タスク名を入力してください',
      task.title,
      (newTitle) => {
        if (newTitle && newTitle.trim() !== task.title) {
          // タスクタイトルを更新
          const updateResult = window.taskManager.updateTask(taskId, { title: newTitle.trim() });
          
          if (updateResult.success) {
            // DOM要素のタイトルを更新
            const titleElements = document.querySelectorAll(`[data-task-id="${taskId}"] .task-title, [data-parent-id="${taskId}"] .task-title`);
            titleElements.forEach(titleEl => {
              titleEl.textContent = newTitle.trim();
            });
            
            showNotification('タスク名を変更しました', 'success');
            announceToScreenReader(`タスク名を「${newTitle.trim()}」に変更しました`);
            
          } else {
            showNotification('タスク名の変更に失敗しました', 'error');
          }
        }
      }
    );

  } catch (error) {
    console.error('タスク名編集エラー:', error);
    showNotification('タスク名の編集でエラーが発生しました', 'error');
  }
}

/**
 * タスク時刻のインライン編集
 * @param {string} taskId - タスクID
 */
export function editTaskTime(taskId) {
  try {
    const appState = window.AppState;
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) {return;}

    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    const timeContainer = card.querySelector('.task-time-container');
    const timeElement = card.querySelector('.task-time');

    // すでに編集中の場合は何もしない
    if (timeContainer.querySelector('input')) {return;}

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

      if (!newStartTime || !newEndTime) {
        showNotification('開始時刻と終了時刻を入力してください', 'error');
        return;
      }

      if (!isValidTimeRange(newStartTime, newEndTime)) {
        showNotification('終了時刻は開始時刻より後に設定してください', 'error');
        return;
      }

      updateTaskFromCard(taskId, {
        startTime: newStartTime,
        endTime: newEndTime
      });

      // DOM上の表示も更新
      timeElement.textContent = `${newStartTime} – ${newEndTime}`;
      timeElement.setAttribute('datetime', `${newStartTime}/${newEndTime}`);
      timeElement.style.display = '';
      editForm.remove();

      // カードの位置とサイズも更新
      const newStartMin = timeStringToMinutes(newStartTime);
      const newEndMin = timeStringToMinutes(newEndTime);
      card.style.top = `${newStartMin}px`;
      card.style.height = `${newEndMin - newStartMin}px`;

      showNotification('時間を更新しました', 'success');

      // レーン再計算
      setTimeout(() => {
        recalculateAllLanes();
        if (typeof window.renderTasks === 'function') {
          window.renderTasks();
        }
      }, 50);
    };

    // キャンセル関数
    const cancelTimeEdit = () => {
      timeElement.style.display = '';
      editForm.remove();
    };

    // キーボードイベント処理
    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTimeEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelTimeEdit();
      } else if (e.key === 'Tab') {
        // Tabキーで次の入力フィールドに移動
        if (e.target === startInput) {
          e.preventDefault();
          endInput.focus();
        }
      }
    };

    startInput.addEventListener('keydown', handleKeydown);
    endInput.addEventListener('keydown', handleKeydown);
    startInput.addEventListener('blur', () => setTimeout(saveTimeEdit, 100));
    endInput.addEventListener('blur', () => setTimeout(saveTimeEdit, 100));

  } catch (error) {
    console.error('時刻編集エラー:', error);
    showNotification('時刻編集に失敗しました', 'error');
  }
}

/**
 * 右クリックメニューの設定
 * @param {HTMLElement} card - タスクカード要素
 * @param {Task} task - タスクオブジェクト
 */
function setupContextMenu(card, task) {
  // 右クリックイベントの設定
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    console.log('🖱️ 右クリック検出:', task.id, task.title);
    showContextMenu(e.clientX, e.clientY, task.id);
  });

  // 通常の左クリックでメニューを非表示
  card.addEventListener('click', hideContextMenu);
  
  console.log('📋 コンテキストメニュー設定完了:', task.id, task.title);
}

/**
 * コンテキストメニューの表示
 * @param {number} x - マウスX座標
 * @param {number} y - マウスY座標
 * @param {string} taskId - タスクID
 */
function showContextMenu(x, y, taskId) {
  const contextMenu = document.getElementById('context-menu');
  if (!contextMenu) return;

  hideContextMenu();

  const { innerWidth, innerHeight } = window;
  const menuRect = contextMenu.getBoundingClientRect();
  const adjustedX = Math.min(x, innerWidth - menuRect.width - 10);
  const adjustedY = Math.min(y, innerHeight - menuRect.height - 10);

  contextMenu.style.left = `${adjustedX}px`;
  contextMenu.style.top = `${adjustedY}px`;
  contextMenu.dataset.taskId = taskId;
  contextMenu.style.display = 'block';
  contextMenu.setAttribute('aria-hidden', 'false');
  
  setTimeout(() => contextMenu.focus(), 0); // For accessibility
}

/**
 * コンテキストメニューの非表示
 */
function hideContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  if (contextMenu && contextMenu.style.display !== 'none') {
    contextMenu.style.display = 'none';
    contextMenu.removeAttribute('data-task-id');
    contextMenu.setAttribute('aria-hidden', 'true');
  }
}

/**
 * コンテキストメニューのアクション設定 (初期化時に一度だけ実行)
 */
export function initializeContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  if (!contextMenu) return;

  contextMenu.setAttribute('tabindex', '-1');

  contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item[data-action]');
    if (item) {
      e.stopPropagation();
      const action = item.dataset.action;
      const taskId = contextMenu.dataset.taskId;
      if (action && taskId) {
        executeContextAction(action, taskId);
      }
      hideContextMenu();
    }
  });

  // Close on outside click or Escape key
  document.addEventListener('click', (e) => {
    if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  contextMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });
}

/**
 * コンテキストメニューアクションの実行
 * @param {string} action - アクション名
 * @param {string} taskId - タスクID
 */
function executeContextAction(action, taskId) {
  try {
    console.log('⚡ アクション実行開始:', action, taskId);
    
    switch (action) {
      case 'edit-title':
        console.log('✏️ タイトル編集開始');
        editTaskTitle(taskId);
        break;
      case 'edit-time':
        console.log('🕒 時間編集開始');
        editTaskTime(taskId);
        break;
      case 'edit-date':
        console.log('📅 日付編集開始');
        editTaskDate(taskId);
        break;
      case 'duplicate':
        console.log('📋 タスク複製開始');
        duplicateTask(taskId);
        break;
      case 'delete':
        console.log('🗑️ タスク削除開始');
        deleteTaskWithConfirmation(taskId);
        break;
      default:
        console.warn('❓ 未知のアクション:', action);
    }
    
    console.log('✅ アクション実行完了:', action);
  } catch (error) {
    console.error('❌ コンテキストアクション実行エラー:', error);
    showNotification('操作に失敗しました', 'error');
  }
}

/**
 * タスクの日付変更
 * @param {string} taskId - 変更するタスクID
 */
export function editTaskDate(taskId) {
  try {
    const appState = window.AppState;
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) {
      console.warn(`タスクが見つかりません: ${taskId}`);
      return;
    }

    // 現在の日付をデフォルト値として設定
    const currentDate = task.date;
    
    showInlineInput(
      '📅 新しい日付を入力してください',
      'YYYY-MM-DD形式で入力',
      currentDate,
      (newDate) => {
        if (!newDate || newDate === currentDate) {
          return;
        }

        // 日付の形式をチェック
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(newDate)) {
          showNotification('日付形式が正しくありません（YYYY-MM-DD）', 'error');
          return;
        }

        // 日付の有効性をチェック
        const dateObj = new Date(newDate);
        if (isNaN(dateObj.getTime())) {
          showNotification('有効な日付を入力してください', 'error');
          return;
        }

        // タスクの日付を更新
        const taskIndex = appState.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          const updatedTask = appState.tasks[taskIndex].update({ date: newDate });
          appState.tasks[taskIndex] = updatedTask;

          // データを保存
          saveToStorage();
          recalculateAllLanes();

          // 元の日付パネルからタスクカードを削除
          const oldCards = document.querySelectorAll(`[data-task-id="${taskId}"]`);
          oldCards.forEach(card => card.remove());

          // 新しい日付パネルにタスクを追加（存在する場合）
          const newDatePanel = document.querySelector(`[data-date="${newDate}"]`);
          if (newDatePanel) {
            const tasksContainer = newDatePanel.querySelector('.tasks-container');
            if (tasksContainer) {
              const newTaskCard = createTaskCard(updatedTask, newDatePanel);
              tasksContainer.appendChild(newTaskCard);
            }
          }

          // 成功通知
          showNotification(`📅 日付を${newDate}に変更しました`, 'success');

          // スクリーンリーダー通知
          announceToScreenReader(`タスク「${task.title}」の日付を${newDate}に変更しました`);
        }
      }
    );

  } catch (error) {
    console.error('タスク日付変更エラー:', error);
    showNotification('日付の変更に失敗しました', 'error');
  }
}

/**
 * タスクの複製
 * @param {string} taskId - 複製元のタスクID
 */
function duplicateTask(taskId) {
  try {
    const appState = window.AppState;
    const originalTask = appState.tasks.find(t => t.id === taskId);
    if (!originalTask) {return;}

    // 新しいタスクを作成（時刻を少しずらす）
    const startMinutes = timeStringToMinutes(originalTask.startTime) + 60; // 1時間後
    const endMinutes = timeStringToMinutes(originalTask.endTime) + 60;
    
    const newStartTime = minutesToTimeString(Math.min(startMinutes, 1440 - 60));
    const newEndTime = minutesToTimeString(Math.min(endMinutes, 1440));

    const duplicatedTask = new Task(
      null,
      originalTask.title + ' (コピー)',
      newStartTime,
      newEndTime,
      originalTask.priority,
      originalTask.date
    );

    appState.tasks.push(duplicatedTask);
    saveToStorage();
    recalculateAllLanes();

    // 該当日付パネルを再描画
    const dayPanel = document.querySelector(`[data-date="${originalTask.date}"]`);
    if (dayPanel) {
      renderTasksToPanel(originalTask.date, dayPanel);
    }

    showNotification('タスクを複製しました', 'success');

  } catch (error) {
    console.error('タスク複製エラー:', error);
    showNotification('タスクの複製に失敗しました', 'error');
  }
}

/**
 * 確認ダイアログ付きタスク削除（アニメーション対応）
 * @param {string} taskId - 削除するタスクID
 */
function deleteTaskWithConfirmation(taskId) {
  try {
    const task = window.taskManager.getTask(taskId);
    if (!task) {
      console.warn(`タスクが見つかりません: ${taskId}`);
      return;
    }

    // 削除確認モーダル
    showInlineInput(
      '⚠️ タスクを削除しますか？',
      'この操作は取り消せません',
      '',
      (confirmedValue) => {
        // 空文字列で確認された場合は削除実行
        if (confirmedValue === '') {
          deleteTaskWithAnimation(taskId);
        }
      }
    );

  } catch (error) {
    console.error('タスク削除エラー:', error);
    showNotification('タスクの削除に失敗しました', 'error');
  }
}

/**
 * アニメーション付きタスク削除
 * @param {string} taskId - 削除するタスクID
 */
function deleteTaskWithAnimation(taskId) {
  try {
    // DOM要素を取得
    const cards = document.querySelectorAll(`[data-task-id="${taskId}"], [data-parent-id="${taskId}"]`);
    
    if (cards.length === 0) {
      console.warn(`削除対象のカードが見つかりません: ${taskId}`);
      return;
    }

    // 削除アニメーションを開始
    cards.forEach(card => {
      card.classList.add('deleting');
    });

    // アニメーション完了後にDOM削除とデータ削除
    const firstCard = cards[0];
    firstCard.addEventListener('animationend', function onDeleteAnimationEnd(e) {
      if (e.animationName === 'task-delete') {
        // データから削除
        const deleteResult = window.taskManager.deleteTask(taskId);
        
        if (deleteResult.success) {
          // すべてのカードをDOMから削除
          cards.forEach(card => {
            if (card.parentNode) {
              card.remove();
            }
          });
          
          // 成功通知
          showNotification('タスクを削除しました', 'success');
          
          // スクリーンリーダー通知
          announceToScreenReader(`タスク「${deleteResult.task.title}」を削除しました`);
          
        } else {
          // 失敗時はアニメーションを戻す
          cards.forEach(card => {
            card.classList.remove('deleting');
          });
          showNotification('タスクの削除に失敗しました', 'error');
        }
        
        firstCard.removeEventListener('animationend', onDeleteAnimationEnd);
      }
    });

  } catch (error) {
    console.error('アニメーション付きタスク削除エラー:', error);
    showNotification('タスクの削除中にエラーが発生しました', 'error');
  }
}

/**
 * インライン入力モーダルの表示
 * @param {string} title - モーダルタイトル
 * @param {string} placeholder - 入力フィールドのプレースホルダー
 * @param {string} defaultValue - デフォルト値
 * @param {Function} onConfirm - 確定時のコールバック
 */
function showInlineInput(title, placeholder, defaultValue = '', onConfirm) {
  const overlay = document.getElementById('inline-input-overlay');
  const titleElement = document.getElementById('inline-input-title');
  const inputField = document.getElementById('inline-input-field');

  if (!overlay || !titleElement || !inputField) {return;}

  titleElement.textContent = title;
  inputField.placeholder = placeholder;
  inputField.value = defaultValue;
  overlay.style.display = 'flex';
  
  // アクセシビリティ属性を更新（フォーカス可能にする）
  overlay.setAttribute('aria-hidden', 'false');

  // フォーカスを設定
  setTimeout(() => {
    inputField.focus();
    inputField.select();
  }, 100);

  // コールバック関数を保存
  window._inlineInputCallback = onConfirm;

  // ボタンイベントを設定
  const confirmBtn = document.getElementById('inline-input-confirm');
  const cancelBtn = document.getElementById('inline-input-cancel');

  if (confirmBtn) {
    confirmBtn.onclick = confirmInlineInput;
  }
  if (cancelBtn) {
    cancelBtn.onclick = hideInlineInput;
  }

  // Enterキーで確定
  inputField.addEventListener('keydown', handleInlineInputKeydown);
}

/**
 * インライン入力の非表示
 */
function hideInlineInput() {
  const overlay = document.getElementById('inline-input-overlay');
  const inputField = document.getElementById('inline-input-field');

  if (overlay) {
    overlay.style.display = 'none';
    // アクセシビリティ属性を元に戻す
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (inputField) {
    inputField.removeEventListener('keydown', handleInlineInputKeydown);
  }

  window._inlineInputCallback = null;
}

/**
 * インライン入力の確定
 */
function confirmInlineInput() {
  const inputField = document.getElementById('inline-input-field');
  if (inputField && window._inlineInputCallback) {
    const value = inputField.value.trim();
    if (value) {
      window._inlineInputCallback(value);
    }
  }
  hideInlineInput();
}

/**
 * インライン入力のキーボード操作
 * @param {KeyboardEvent} e - キーボードイベント
 */
function handleInlineInputKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmInlineInput();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideInlineInput();
  }
}

// グローバル関数として公開
window.hideInlineInput = hideInlineInput;
window.confirmInlineInput = confirmInlineInput;
window.showInlineInput = showInlineInput;
window.showNotification = showNotification;

/**
 * Testing Trophy対応：タスクカードテストユーティリティ
 */
export const TaskCardTest = {
  /**
   * テスト用タスクカード作成
   */
  createTestCard: (overrides = {}) => {
    const testTask = new Task(
      'test-task',
      overrides.title || 'テストタスク',
      overrides.startTime || '09:00',
      overrides.endTime || '10:00',
      overrides.priority || 'normal'
    );

    return createTaskCard(testTask);
  },

  /**
   * DOM構造の検証
   */
  validateCardStructure: (card) => {
    const checks = {
      hasTaskContent: !!card.querySelector('.task-content'),
      hasTaskTitle: !!card.querySelector('.task-title'),
      hasTaskTime: !!card.querySelector('.task-time'),
      hasResizeHandle: !!card.querySelector('.task-resize-handle'),
      hasTaskActions: !!card.querySelector('.task-actions'),
      hasProperDataset: !!card.dataset.taskId,
      hasARIARole: card.getAttribute('role') === 'gridcell',
      hasARIALabel: !!card.getAttribute('aria-label')
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    return {
      passed: passedChecks === totalChecks,
      score: `${passedChecks}/${totalChecks}`,
      details: checks
    };
  },

  /**
   * ドラッグ&リサイズのシミュレーション
   */
  simulateDragResize: (card, action = 'drag', deltaY = 60) => {
    const taskId = card.dataset.taskId;
    const originalTop = parseInt(card.style.top) || 0;
    const originalHeight = parseInt(card.style.height) || 60;

    // マウスダウンイベントをシミュレート
    const target = action === 'resize' ?
      card.querySelector('.task-resize-handle') : card;

    const mouseDown = new MouseEvent('mousedown', {
      clientY: 100,
      bubbles: true
    });
    target.dispatchEvent(mouseDown);

    // マウス移動をシミュレート
    const mouseMove = new MouseEvent('mousemove', {
      clientY: 100 + deltaY,
      bubbles: true
    });
    document.dispatchEvent(mouseMove);

    // マウスアップをシミュレート
    const mouseUp = new MouseEvent('mouseup', {
      bubbles: true
    });
    document.dispatchEvent(mouseUp);

    return {
      taskId,
      action,
      originalTop,
      originalHeight,
      newTop: parseInt(card.style.top) || originalTop,
      newHeight: parseInt(card.style.height) || originalHeight,
      deltaY
    };
  }
};

/**
 * 範囲選択処理
 * @param {string} startTaskId - 開始タスクID
 * @param {string} endTaskId - 終了タスクID
 */
function selectTaskRange(startTaskId, endTaskId) {
  const taskCards = Array.from(document.querySelectorAll('.task-card')).sort((a, b) => {
    const getTopPosition = (card) => {
      const transform = card.style.transform;
      const match = transform.match(/translateY\((\d+)px\)/);
      return match ? parseInt(match[1]) : 0;
    };
    return getTopPosition(a) - getTopPosition(b);
  });

  const startIndex = taskCards.findIndex(card => card.dataset.taskId === startTaskId);
  const endIndex = taskCards.findIndex(card => card.dataset.taskId === endTaskId);

  if (startIndex === -1 || endIndex === -1) return;

  const minIndex = Math.min(startIndex, endIndex);
  const maxIndex = Math.max(startIndex, endIndex);

  for (let i = minIndex; i <= maxIndex; i++) {
    const taskId = taskCards[i].dataset.taskId;
    if (!window.selectedTasks.has(taskId)) {
      window.selectedTasks.add(taskId);
    }
  }

  window.updateTaskSelectionUI();
  window.updateSelectionCounter();
}