/**
 * 🐻 Puppet Bear v1.13.0
 * アンドゥ/リドゥ機能モジュール
 */

// ===== 履歴管理 =====
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// 画像データURLキャッシュ（imgオブジェクト→DataURL）
const imageDataUrlCache = new Map();

// ===== 画像のDataURLを取得（キャッシュ対応） =====
function getImageDataUrl(img) {
    if (!img) return null;
    
    // キャッシュにあればそれを返す
    if (imageDataUrlCache.has(img.src)) {
        return imageDataUrlCache.get(img.src);
    }
    
    // Canvasに描画してDataURLを生成
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || img.width;
        tempCanvas.height = img.naturalHeight || img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        const dataUrl = tempCanvas.toDataURL('image/png');
        
        // キャッシュに保存
        imageDataUrlCache.set(img.src, dataUrl);
        
        return dataUrl;
    } catch (e) {
        console.warn('画像のDataURL取得に失敗:', e);
        return img.src; // フォールバック
    }
}

// ===== レイヤーをシリアライズ =====
function serializeLayer(layer) {
    const serialized = {
        id: layer.id,
        type: layer.type,
        name: layer.name,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        scale: layer.scale,
        opacity: layer.opacity,
        anchorX: layer.anchorX,
        anchorY: layer.anchorY,
        visible: layer.visible,
        blendMode: layer.blendMode,
        parentLayerId: layer.parentLayerId,
        keyframes: layer.keyframes ? JSON.parse(JSON.stringify(layer.keyframes)) : []
    };
    
    // 画像を持つレイヤーの場合
    if (layer.img) {
        serialized.imgDataUrl = getImageDataUrl(layer.img);
    }
    
    // 連番画像を持つレイヤー（口パク・まばたき）
    if (layer.images && layer.images.length > 0) {
        serialized.imagesDataUrls = layer.images.map(img => getImageDataUrl(img));
    }
    
    // タイプ別の追加プロパティ
    switch (layer.type) {
        case 'folder':
            serialized.collapsed = layer.collapsed;
            serialized.childrenIds = layer.childrenIds ? [...layer.childrenIds] : [];
            break;
            
        case 'lipsync':
            serialized.frameCount = layer.frameCount;
            serialized.currentImageIndex = layer.currentImageIndex;
            serialized.mouthOpenThreshold = layer.mouthOpenThreshold;
            serialized.sensitivity = layer.sensitivity;
            break;
            
        case 'blink':
            serialized.frameCount = layer.frameCount;
            serialized.currentImageIndex = layer.currentImageIndex;
            serialized.blinkInterval = layer.blinkInterval;
            serialized.blinkDuration = layer.blinkDuration;
            serialized.lastBlinkTime = layer.lastBlinkTime;
            break;
            
        case 'bounce':
            serialized.bounceParams = layer.bounceParams ? JSON.parse(JSON.stringify(layer.bounceParams)) : null;
            serialized.bounceKeyframes = layer.bounceKeyframes ? JSON.parse(JSON.stringify(layer.bounceKeyframes)) : [];
            break;
            
        case 'puppet':
            serialized.handleAnchors = layer.handleAnchors ? JSON.parse(JSON.stringify(layer.handleAnchors)) : [];
            serialized.fixedPins = layer.fixedPins ? JSON.parse(JSON.stringify(layer.fixedPins)) : [];
            serialized.puppetStrength = layer.puppetStrength;
            serialized.puppetSmoothness = layer.puppetSmoothness;
            serialized.meshDensity = layer.meshDensity;
            break;
            
        case 'audio':
            serialized.audioClips = layer.audioClips ? layer.audioClips.map(clip => ({
                id: clip.id,
                name: clip.name,
                startFrame: clip.startFrame,
                duration: clip.duration,
                volume: clip.volume,
                // audioDataUrlは大きすぎる可能性があるため、URLを保持
                audioUrl: clip.audioUrl || null
            })) : [];
            break;
    }
    
    // 風揺れ
    if (layer.windSwayEnabled !== undefined) {
        serialized.windSwayEnabled = layer.windSwayEnabled;
        serialized.windSwayParams = layer.windSwayParams ? JSON.parse(JSON.stringify(layer.windSwayParams)) : null;
    }
    
    // 色抜きクリッピング
    if (layer.colorClipping) {
        serialized.colorClipping = JSON.parse(JSON.stringify(layer.colorClipping));
    }
    
    return serialized;
}

// ===== 履歴を保存 =====
function saveHistory() {
    console.log('💾 saveHistory開始: レイヤー数=', layers.length);
    
    // 現在の状態をシリアライズ
    const state = {
        layers: layers.map(layer => serializeLayer(layer)),
        nextLayerId: nextLayerId,
        currentFrame: typeof currentFrame !== 'undefined' ? currentFrame : 0,
        selectedLayerIds: [...selectedLayerIds]
    };
    
    const stateJson = JSON.stringify(state);
    
    // 現在位置以降の履歴を削除
    history = history.slice(0, historyIndex + 1);
    
    // 新しい状態を追加
    history.push(stateJson);
    historyIndex++;
    
    // 最大数を超えたら古いものを削除
    if (history.length > MAX_HISTORY) {
        history.shift();
        historyIndex--;
    }
    
    console.log('💾 saveHistory完了: historyIndex=', historyIndex, '/ history.length=', history.length);
    
    // ボタンの状態を更新
    updateUndoRedoButtons();
}

// ===== 元に戻す =====
function undo() {
    if (historyIndex > 0) {
        console.log('↩️ Undo: historyIndex', historyIndex, '→', historyIndex - 1);
        historyIndex--;
        loadHistory();
    } else {
        console.log('↩️ Undo: これ以上戻れません');
    }
}

// ===== やり直し =====
function redo() {
    if (historyIndex < history.length - 1) {
        console.log('↪️ Redo: historyIndex', historyIndex, '→', historyIndex + 1);
        historyIndex++;
        loadHistory();
    } else {
        console.log('↪️ Redo: これ以上進めません');
    }
}

// ===== 履歴から復元 =====
async function loadHistory() {
    const state = JSON.parse(history[historyIndex]);
    
    console.log('🔄 loadHistory開始: レイヤー数=', state.layers.length);
    
    // レイヤーを復元
    const restoredLayers = await Promise.all(state.layers.map(async (layerData) => {
        const layer = { ...layerData };
        
        // 画像の復元
        if (layerData.imgDataUrl) {
            layer.img = await loadImageFromDataUrl(layerData.imgDataUrl);
            delete layer.imgDataUrl;
        }
        
        // 連番画像の復元（口パク・まばたき）
        if (layerData.imagesDataUrls && layerData.imagesDataUrls.length > 0) {
            layer.images = await Promise.all(
                layerData.imagesDataUrls.map(url => loadImageFromDataUrl(url))
            );
            delete layer.imagesDataUrls;
        }
        
        // 音声レイヤーの復元
        if (layer.type === 'audio' && layerData.audioClips) {
            layer.audioClips = layerData.audioClips.map(clipData => {
                const clip = { ...clipData };
                // 音声要素は再生成が必要
                if (clip.audioUrl) {
                    clip.audio = new Audio(clip.audioUrl);
                }
                return clip;
            });
        }
        
        return layer;
    }));
    
    // グローバル変数を更新
    layers = restoredLayers;
    nextLayerId = state.nextLayerId;
    selectedLayerIds = state.selectedLayerIds || [];
    
    // フレームを復元
    if (typeof setCurrentFrame === 'function' && state.currentFrame !== undefined) {
        setCurrentFrame(state.currentFrame);
    }
    
    // UIを更新
    updateLayerList();
    if (typeof updatePropertiesPanel === 'function') {
        updatePropertiesPanel();
    }
    if (typeof updateTimeline === 'function') {
        updateTimeline();
    }
    if (typeof applyKeyframeInterpolation === 'function') {
        applyKeyframeInterpolation();
    }
    render();
    
    // ボタンの状態を更新
    updateUndoRedoButtons();
    
    console.log('🔄 loadHistory完了');
}

// ===== DataURLから画像を読み込み =====
function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.error('画像の復元に失敗');
            resolve(null);
        };
        img.src = dataUrl;
    });
}

// ===== Undo/Redoボタンの状態更新 =====
function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) {
        undoBtn.disabled = historyIndex <= 0;
        undoBtn.style.opacity = historyIndex <= 0 ? '0.5' : '1';
    }
    if (redoBtn) {
        redoBtn.disabled = historyIndex >= history.length - 1;
        redoBtn.style.opacity = historyIndex >= history.length - 1 ? '0.5' : '1';
    }
}

// ===== キーボードショートカット =====
function initHistoryShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z: 元に戻す
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Y または Ctrl+Shift+Z: やり直し
        if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
            e.preventDefault();
            redo();
        }
    });
    
    console.log('⌨️ Undo/Redoショートカット初期化完了');
}

// ===== 初期状態を保存 =====
function initHistory() {
    // 履歴をクリア
    history = [];
    historyIndex = -1;
    
    // 初期状態を保存
    saveHistory();
    
    // ショートカットを初期化
    initHistoryShortcuts();
    
    console.log('📚 履歴システム初期化完了');
}

// ===== 操作後に履歴を保存するためのラッパー =====
// 主要な操作の後に saveHistory() を呼び出す必要がある
// 例: レイヤー追加後、キーフレーム追加後、プロパティ変更後など
