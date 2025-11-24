/**
 * ⭐ Starlit Puppet Editor v1.13.0
 * タッチ操作対応モジュール
 * - キャンバスでのタッチ操作
 * - タイムラインでのタッチ操作
 * - ピンチズーム
 * - マルチタッチ対応
 */

// ===== タッチ関連のグローバル変数 =====
let touchState = {
    isTouching: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    touchId: null,
    isPinching: false,
    pinchStartDistance: 0,
    pinchStartScale: 1
};

let touchTimelineState = {
    isTouching: false,
    startX: 0,
    touchId: null
};

// ===== タッチイベント初期化 =====
function initTouchEvents() {
    console.log('⭐ タッチイベント初期化...');
    
    // キャンバスのタッチイベント
    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleCanvasTouchEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleCanvasTouchEnd, { passive: false });
    }
    
    // タイムラインのタッチイベント
    const timeline = document.getElementById('timeline');
    if (timeline) {
        timeline.addEventListener('touchstart', handleTimelineTouchStart, { passive: false });
        timeline.addEventListener('touchmove', handleTimelineTouchMove, { passive: false });
        timeline.addEventListener('touchend', handleTimelineTouchEnd, { passive: false });
        timeline.addEventListener('touchcancel', handleTimelineTouchEnd, { passive: false });
    }
    
    // タイムラインコンテンツのタッチイベント
    const timelineContent = document.getElementById('timeline-content');
    if (timelineContent) {
        timelineContent.addEventListener('touchstart', handleTimelineContentTouchStart, { passive: false });
    }
    
    // スライダーのタッチ最適化
    optimizeSliders();
    
    // ダブルタップによるズームを防止
    preventDoubleTapZoom();
    
    console.log('⭐ タッチイベント初期化完了');
}

// ===== キャンバスタッチイベント =====
function handleCanvasTouchStart(e) {
    const touches = e.touches;
    
    // 2本指タッチ（ピンチズーム）
    if (touches.length === 2) {
        e.preventDefault();
        touchState.isPinching = true;
        touchState.pinchStartDistance = getTouchDistance(touches[0], touches[1]);
        
        // 現在選択中のレイヤーのスケールを保存
        if (selectedLayerIds.length === 1) {
            const layer = layers.find(l => l.id === selectedLayerIds[0]);
            if (layer) {
                touchState.pinchStartScale = layer.scale;
            }
        }
        return;
    }
    
    // 1本指タッチ
    if (touches.length === 1) {
        e.preventDefault();
        const touch = touches[0];
        
        touchState.isTouching = true;
        touchState.touchId = touch.identifier;
        
        const rect = canvas.getBoundingClientRect();
        const touchX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const touchY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        touchState.startX = touchX;
        touchState.startY = touchY;
        touchState.lastX = touchX;
        touchState.lastY = touchY;
        
        // アンカーポイント設定モード
        if (anchorPointPickMode && anchorPointClickHandler) {
            // マウスイベントをシミュレート
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            anchorPointClickHandler(fakeEvent);
            return;
        }
        
        // 揺れモーションレイヤーのアンカー設定モード
        if (typeof bounceAnchorClickMode !== 'undefined' && bounceAnchorClickMode) {
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            handleBounceAnchorClick(fakeEvent);
            return;
        }
        
        // 揺れモーション用ピンモード
        if (typeof bouncePinMode !== 'undefined' && bouncePinMode) {
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            addBouncePinToCanvas(fakeEvent);
            return;
        }
        
        // パペットハンドルアンカー設定モード
        if (typeof puppetHandleMode !== 'undefined' && puppetHandleMode) {
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            setPuppetHandleAnchor(fakeEvent);
            return;
        }
        
        // パペット中間ピン追加モード
        if (typeof puppetIntermediatePinMode !== 'undefined' && puppetIntermediatePinMode) {
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            addIntermediatePin(fakeEvent);
            return;
        }
        
        // パペット固定ピン追加モード
        if (typeof puppetFixedPinMode !== 'undefined' && puppetFixedPinMode) {
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            addFixedPin(fakeEvent);
            return;
        }
        
        // 風揺れピンモード
        if (typeof pinMode !== 'undefined' && pinMode) {
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            };
            addPinToCanvas(fakeEvent);
            return;
        }
        
        // ツール操作（回転・移動）
        if (selectedLayerIds.length === 1 && currentTool !== 'none') {
            const layer = layers.find(l => l.id === selectedLayerIds[0]);
            if (layer && isPointInLayer(touchX, touchY, layer)) {
                isDragging = true;
                dragStart = { x: touchX, y: touchY };
                
                if (currentTool === 'rotation') {
                    dragInitialValue.rotation = layer.rotation;
                } else if (currentTool === 'position') {
                    dragInitialValue.x = layer.x;
                    dragInitialValue.y = layer.y;
                }
            }
        }
    }
}

function handleCanvasTouchMove(e) {
    const touches = e.touches;
    
    // ピンチズーム
    if (touchState.isPinching && touches.length === 2) {
        e.preventDefault();
        const currentDistance = getTouchDistance(touches[0], touches[1]);
        const scaleFactor = currentDistance / touchState.pinchStartDistance;
        
        // 選択中のレイヤーのスケールを変更
        if (selectedLayerIds.length === 1) {
            const layer = layers.find(l => l.id === selectedLayerIds[0]);
            if (layer) {
                layer.scale = Math.max(0.1, Math.min(10, touchState.pinchStartScale * scaleFactor));
                render();
                updatePropertiesPanel();
            }
        }
        return;
    }
    
    // 1本指ドラッグ
    if (touchState.isTouching && touches.length === 1) {
        const touch = Array.from(touches).find(t => t.identifier === touchState.touchId);
        if (!touch) return;
        
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const touchX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const touchY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        // ツール操作
        if (isDragging && selectedLayerIds.length === 1) {
            const layer = layers.find(l => l.id === selectedLayerIds[0]);
            if (!layer) return;
            
            if (currentTool === 'rotation') {
                // 回転
                let anchorScreenX = layer.x;
                let anchorScreenY = layer.y;
                
                if (layer.type === 'folder') {
                    anchorScreenX += (layer.anchorOffsetX || 0);
                    anchorScreenY += (layer.anchorOffsetY || 0);
                }
                
                const startAngle = Math.atan2(dragStart.y - anchorScreenY, dragStart.x - anchorScreenX);
                const currentAngle = Math.atan2(touchY - anchorScreenY, touchX - anchorScreenX);
                const angleDelta = (currentAngle - startAngle) * 180 / Math.PI;
                
                layer.rotation = dragInitialValue.rotation + angleDelta;
                
            } else if (currentTool === 'position') {
                // 移動
                const dx = touchX - dragStart.x;
                const dy = touchY - dragStart.y;
                
                layer.x = dragInitialValue.x + dx;
                layer.y = dragInitialValue.y + dy;
            }
            
            render();
            updatePropertyValues(layer);
        }
        
        touchState.lastX = touchX;
        touchState.lastY = touchY;
    }
}

function handleCanvasTouchEnd(e) {
    // ピンチズーム終了
    if (touchState.isPinching) {
        touchState.isPinching = false;
        
        // キーフレーム自動挿入
        if (selectedLayerIds.length === 1) {
            const layer = layers.find(l => l.id === selectedLayerIds[0]);
            if (layer && typeof autoInsertKeyframe === 'function') {
                autoInsertKeyframe(layer.id, { scale: layer.scale });
            }
        }
    }
    
    // タッチ終了
    if (touchState.isTouching) {
        touchState.isTouching = false;
        touchState.touchId = null;
        
        // ドラッグ終了処理
        if (isDragging) {
            isDragging = false;
            
            // キーフレーム自動挿入
            if (selectedLayerIds.length === 1) {
                const layer = layers.find(l => l.id === selectedLayerIds[0]);
                if (layer && typeof autoInsertKeyframe === 'function') {
                    if (currentTool === 'rotation') {
                        autoInsertKeyframe(layer.id, { rotation: layer.rotation });
                    } else if (currentTool === 'position') {
                        autoInsertKeyframe(layer.id, { x: layer.x, y: layer.y });
                    }
                }
            }
            
            updatePropertiesPanel();
        }
    }
}

// ===== タイムラインタッチイベント =====
function handleTimelineTouchStart(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        
        touchTimelineState.isTouching = true;
        touchTimelineState.touchId = touch.identifier;
        touchTimelineState.startX = touch.clientX;
        
        // 再生ヘッドの位置を更新
        const timeline = document.getElementById('timeline');
        const rect = timeline.getBoundingClientRect();
        const scrollLeft = timeline.scrollLeft;
        const clickX = touch.clientX - rect.left + scrollLeft;
        
        // フレーム計算
        const pixelsPerFrame = typeof timelineZoom !== 'undefined' ? timelineZoom : 20;
        const frame = Math.round(clickX / pixelsPerFrame);
        
        if (typeof setCurrentFrame === 'function') {
            setCurrentFrame(Math.max(0, frame));
        }
    }
}

function handleTimelineTouchMove(e) {
    if (touchTimelineState.isTouching && e.touches.length === 1) {
        const touch = Array.from(e.touches).find(t => t.identifier === touchTimelineState.touchId);
        if (!touch) return;
        
        e.preventDefault();
        
        // 再生ヘッドの位置を更新
        const timeline = document.getElementById('timeline');
        const rect = timeline.getBoundingClientRect();
        const scrollLeft = timeline.scrollLeft;
        const clickX = touch.clientX - rect.left + scrollLeft;
        
        const pixelsPerFrame = typeof timelineZoom !== 'undefined' ? timelineZoom : 20;
        const frame = Math.round(clickX / pixelsPerFrame);
        
        if (typeof setCurrentFrame === 'function') {
            setCurrentFrame(Math.max(0, frame));
        }
    }
}

function handleTimelineTouchEnd(e) {
    touchTimelineState.isTouching = false;
    touchTimelineState.touchId = null;
}

// ===== タイムラインコンテンツ（キーフレーム）タッチイベント =====
function handleTimelineContentTouchStart(e) {
    // キーフレームのタッチを検出
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    
    if (target && target.classList.contains('keyframe')) {
        e.preventDefault();
        // キーフレームクリックをシミュレート
        target.click();
    }
}

// ===== ユーティリティ関数 =====
function getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMidpoint(touch1, touch2) {
    return {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
    };
}

// ===== スライダーのタッチ最適化 =====
function optimizeSliders() {
    // すべてのスライダーにタッチ操作を最適化
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        slider.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
        
        slider.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
    });
}

// ===== ダブルタップズーム防止 =====
function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}

// ===== PWA インストールプロンプト =====
let deferredInstallPrompt = null;

function initPWAInstall() {
    // beforeinstallpromptイベントをキャッチ
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('⭐ PWA: インストールプロンプト検出');
        e.preventDefault();
        deferredInstallPrompt = e;
        
        // インストールボタンを表示（必要に応じて）
        showInstallButton();
    });
    
    // インストール完了時
    window.addEventListener('appinstalled', (e) => {
        console.log('⭐ PWA: アプリがインストールされました');
        deferredInstallPrompt = null;
        hideInstallButton();
    });
}

function showInstallButton() {
    // 既存のボタンがなければ作成
    let installBtn = document.getElementById('pwa-install-btn');
    if (!installBtn) {
        installBtn = document.createElement('button');
        installBtn.id = 'pwa-install-btn';
        installBtn.className = 'btn-primary';
        installBtn.innerHTML = '📲 アプリ追加';
        installBtn.style.cssText = 'margin-left: 8px; background: linear-gradient(135deg, #4CAF50, #45a049);';
        installBtn.onclick = triggerInstallPrompt;
        
        const headerControls = document.querySelector('.header-controls');
        if (headerControls) {
            headerControls.appendChild(installBtn);
        }
    }
    installBtn.style.display = 'inline-block';
}

function hideInstallButton() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
}

async function triggerInstallPrompt() {
    if (!deferredInstallPrompt) {
        console.log('⭐ PWA: インストールプロンプトが利用できません');
        // iOSの場合はSafariの共有メニューから追加する手順を表示
        if (isIOSDevice()) {
            showIOSInstallInstructions();
        }
        return;
    }
    
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('⭐ PWA: ユーザーの選択:', outcome);
    deferredInstallPrompt = null;
}

function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function showIOSInstallInstructions() {
    const message = 'このアプリをホーム画面に追加するには：\n\n' +
                    '1. 画面下部の共有ボタン 📤 をタップ\n' +
                    '2.「ホーム画面に追加」をタップ\n' +
                    '3.「追加」をタップ';
    alert(message);
}

// ===== Service Worker 登録 =====
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then((registration) => {
                    console.log('⭐ Service Worker: 登録成功', registration.scope);
                })
                .catch((error) => {
                    console.error('⭐ Service Worker: 登録失敗', error);
                });
        });
    } else {
        console.log('⭐ Service Worker: このブラウザではサポートされていません');
    }
}

// ===== 初期化（DOMContentLoaded後に呼び出し） =====
function initTouchAndPWA() {
    initTouchEvents();
    initPWAInstall();
    registerServiceWorker();
    
    // タブレット向けの追加設定
    if (isTouchDevice()) {
        document.body.classList.add('touch-device');
        console.log('⭐ タッチデバイス検出');
    }
}

function isTouchDevice() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0);
}

// ページ読み込み時に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchAndPWA);
} else {
    // DOMContentLoadedが既に発火している場合
    setTimeout(initTouchAndPWA, 100);
}
