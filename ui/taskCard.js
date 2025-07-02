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
  if (typeof text !== 'string') {return '';}
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
 * 通知表示（UI feedback）
 */
function showNotification(message, type = 'info') {
  try {
    // ARIA Live Region での読み上げ
    const priority = type === 'error' ? 'assertive' : 'polite';
    announceToScreenReader(message, priority);

    // 既存の通知があれば削除
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', priority);
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      z-index: 2000;
      font-weight: 500;
      color: white;
      max-width: 300px;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateX(100%);
    `;

    // タイプ別の背景色
    const colors = {
      success: 'var(--success)',
      error: 'var(--accent)',
      info: 'var(--info)',
      warning: 'var(--warning)'
    };
    notification.style.background = colors[type] || colors.info;

    document.body.appendChild(notification);

    // アニメーション表示
    requestAnimationFrame(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    });

    // 3秒後に自動削除
    setTimeout(() => {
      notification.style.opacity = '0';
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
          <h3 class="task-title" onclick="editTaskTitle('${effectiveId}')">${escapeHtml(task.title)}</h3>
          <div class="task-actions">
            <button class="task-action-btn" onclick="toggleTaskCompletion('${effectiveId}')" 
                    title="${task.completed ? '未完了に戻す' : '完了にする'}"
                    aria-label="${task.completed ? '未完了に戻す' : '完了にする'}">
              ${task.completed ? '↺' : '✓'}
            </button>
            <button class="task-action-btn delete-btn" onclick="confirmDeleteTask('${effectiveId}')" 
                    title="削除" aria-label="タスクを削除">✕</button>
          </div>
        </div>
        <div class="task-time-container">
          <div class="task-time" onclick="editTaskTime('${effectiveId}')" 
               datetime="${task.startTime}/${task.endTime}"
               title="クリックして時刻を編集">${task.getTimeString()}</div>
        </div>
        <div class="task-resize-handle" title="ドラッグしてサイズ変更"></div>
      </div>
    `;

    /* ❹ ドラッグ & リサイズ機能の有効化 */
    enableDragAndResize(card);

    /* ❺ 基本的なARIA属性 */
    setTaskCardARIA(card, task);

    /* ❻ 右クリックメニューの設定 - DOM追加後に実行 */
    setTimeout(() => {
      setupContextMenu(card, task);
    }, 0);

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
 * ドラッグ&リサイズ機能の有効化
 * @param {HTMLElement} card - タスクカード要素
 */
export function enableDragAndResize(card) {
  let isDragging = false;
  let isResizing = false;
  let startY = 0;
  let startTop = 0;
  let startHeight = 0;

  // ドラッグ開始ハンドラー
  function onDown(e) {
    e.preventDefault();

    const rect = card.getBoundingClientRect();
    startY = e.clientY || e.touches[0].clientY;
    startTop = parseInt(card.dataset.currentTop || card.style.top || getComputedTop(card)) || 0;
    startHeight = parseInt(card.style.height) || 60;

    // リサイズハンドルがクリックされた場合
    if (e.target.classList.contains('task-resize-handle')) {
      isResizing = true;
      card.style.cursor = 'ns-resize';
    } else {
      isDragging = true;
      card.style.cursor = 'grabbing';
      card.style.transform = 'scale(1.02)';
      card.style.zIndex = '200';
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  // ドラッグ中の処理
  function onMove(e) {
    if (!isDragging && !isResizing) {return;}

    e.preventDefault();
    const currentY = e.clientY || e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (isDragging) {
      // 位置変更（15分単位にスナップ）- transform最適化
      const newTop = snap15(startTop + deltaY);
      const clampedTop = Math.max(0, Math.min(1380, newTop)); // 0-23時の範囲内
      card.style.transform = `translateY(${clampedTop}px)`;
      card.dataset.currentTop = clampedTop; // 後で参照用

    } else if (isResizing) {
      // サイズ変更（15分単位にスナップ）
      const newHeight = snap15(startHeight + deltaY);
      const minHeight = 15; // 最小15分
      const maxHeight = 1440 - startTop; // 現在位置から24時まで
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      card.style.height = clampedHeight + 'px';
    }
  }

  // ドラッグ終了の処理
  function onUp() {
    if (isDragging || isResizing) {
      const taskId = card.dataset.taskId;
      const newTop = parseInt(card.dataset.currentTop || card.style.top);
      const newHeight = parseInt(card.style.height);

      // 新しい時刻を計算
      const newStartTime = minutesToTimeString(newTop);
      const newEndTime = minutesToTimeString(newTop + newHeight);

      // タスクデータを更新
      updateTaskFromCard(taskId, {
        startTime: newStartTime,
        endTime: newEndTime
      });

      // 50ms後にレーン再計算（パフォーマンス考慮）
      setTimeout(() => {
        recalculateAllLanes();
        // 画面を再描画（仮想スクロール対応）
        if (typeof window.renderTasks === 'function') {
          window.renderTasks();
        }
      }, 50);

      // 視覚的フィードバックをリセット
      card.style.cursor = '';
      card.style.transform = '';
      card.style.zIndex = '100';
    }

    isDragging = false;
    isResizing = false;

    // イベントリスナーを削除
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }

  // イベントリスナーの登録
  card.addEventListener('mousedown', onDown);
  card.addEventListener('touchstart', onDown, { passive: false });
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
    const appState = window.AppState;
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) {return;}

    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    const titleElement = card.querySelector('.task-title');

    // すでに編集中の場合は何もしない
    if (titleElement.querySelector('input')) {return;}

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
        updateTaskFromCard(taskId, { title: newTitle });
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
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });

  } catch (error) {
    console.error('タイトル編集エラー:', error);
    showNotification('タイトル編集に失敗しました', 'error');
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
  console.log('📋 コンテキストメニュー表示試行:', { x, y, taskId });
  
  const contextMenu = document.getElementById('context-menu');
  if (!contextMenu) {
    console.error('❌ context-menu要素が見つかりません');
    return;
  }

  console.log('✅ context-menu要素発見:', contextMenu);

  // 既存のメニューを非表示
  hideContextMenu();

  // 画面境界での調整
  const menuWidth = 180;
  const menuHeight = 160;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

  // メニュー位置とデータを設定
  contextMenu.style.left = adjustedX + 'px';
  contextMenu.style.top = adjustedY + 'px';
  contextMenu.dataset.taskId = taskId;
  contextMenu.style.display = 'block';

  console.log('📍 メニュー位置設定:', { left: adjustedX, top: adjustedY, display: contextMenu.style.display });

  // メニュー項目にイベントリスナーを設定
  setupContextMenuActions(contextMenu, taskId);

  // 外部クリックで閉じるイベント
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('keydown', handleContextMenuKeydown);
  }, 0);
}

/**
 * コンテキストメニューの非表示
 */
function hideContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  if (contextMenu) {
    contextMenu.style.display = 'none';
    contextMenu.dataset.taskId = '';
  }

  // イベントリスナーを削除
  document.removeEventListener('click', hideContextMenu);
  document.removeEventListener('keydown', handleContextMenuKeydown);
}

/**
 * コンテキストメニューのアクション設定
 * @param {HTMLElement} menu - メニュー要素
 * @param {string} taskId - タスクID
 */
function setupContextMenuActions(menu, taskId) {
  const items = menu.querySelectorAll('.context-menu-item[data-action]');
  console.log('🔧 メニューアクション設定:', items.length, 'アイテム見つかりました');
  
  // 既存のイベントリスナーを削除
  const newClonedItems = [];
  items.forEach(item => {
    console.log('📝 アイテム:', item.dataset.action, item.textContent.trim());
    const clonedItem = item.cloneNode(true);
    item.parentNode.replaceChild(clonedItem, item);
    newClonedItems.push(clonedItem);
  });

  // 新しいイベントリスナーを追加
  newClonedItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      console.log('🎯 メニューアクション実行:', action, taskId);
      executeContextAction(action, taskId);
      hideContextMenu();
    });
  });
  
  console.log('✅ メニューアクション設定完了:', newClonedItems.length, 'アイテム');
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
 * 確認付きタスク削除
 * @param {string} taskId - 削除するタスクID
 */
function deleteTaskWithConfirmation(taskId) {
  try {
    const appState = window.AppState;
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) {return;}

    const confirmed = confirm(`「${task.title}」を削除しますか？\n\nこの操作は元に戻せません。`);
    if (!confirmed) {return;}

    // タスクを削除
    const taskIndex = appState.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      appState.tasks.splice(taskIndex, 1);
      saveToStorage();
      recalculateAllLanes();

      // DOMからカードを削除
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      if (card) {
        card.remove();
      }

      showNotification('タスクを削除しました', 'success');
    }

  } catch (error) {
    console.error('タスク削除エラー:', error);
    showNotification('タスクの削除に失敗しました', 'error');
  }
}

/**
 * コンテキストメニューのキーボード操作
 * @param {KeyboardEvent} e - キーボードイベント
 */
function handleContextMenuKeydown(e) {
  if (e.key === 'Escape') {
    hideContextMenu();
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

  // フォーカスを設定
  setTimeout(() => {
    inputField.focus();
    inputField.select();
  }, 100);

  // コールバック関数を保存
  window._inlineInputCallback = onConfirm;

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