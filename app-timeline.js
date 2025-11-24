/**
 * ⭐ Starlit Puppet Editor v1.12.0
 * タイムライン・キーフレーム機能（After Effectsスタイル）
 * - 音声レイヤー対応追加
 * - 書き出し範囲マーカー対応
 * - タイムラインズーム機能
 */

// ===== タイムライングローバル変数 =====
let projectFPS = 30; // デフォルト30fps
let selectedKeyframe = null; // 選択中のキーフレーム
let isDraggingKeyframe = false;
let keyframeDragStart = { x: 0, frame: 0 };
let expandedLayers = {}; // 展開されているレイヤー
let seekbarImage = null; // シークバークマ画像
let isSeekbarDragging = false; // シークバードラッグ中フラグ
let seekbarRenderScheduled = false; // シークバー描画スケジュール済みフラグ
let pendingSeekbarTime = 0; // 保留中のシークバー時間

// ===== タイムラインズーム =====
let timelinePixelsPerFrame = 20; // 1フレームあたりのピクセル数（デフォルト20px）
const TIMELINE_ZOOM_DEFAULT = 20;
const TIMELINE_ZOOM_MIN = 5;
const TIMELINE_ZOOM_MAX = 60;

// ズームレベルを設定
function setTimelineZoom(pixelsPerFrame) {
    timelinePixelsPerFrame = Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, pixelsPerFrame));
    
    // スライダーを同期
    const slider = document.getElementById('timeline-zoom-slider');
    if (slider && parseInt(slider.value) !== timelinePixelsPerFrame) {
        slider.value = timelinePixelsPerFrame;
    }
    
    // パーセント表示を更新
    const zoomValue = document.getElementById('zoom-value');
    if (zoomValue) {
        const percent = Math.round((timelinePixelsPerFrame / TIMELINE_ZOOM_DEFAULT) * 100);
        zoomValue.textContent = percent + '%';
    }
    
    // タイムラインを再描画
    updateTimeline();
}

// ズームイン/アウト（ボタン用）
function zoomTimeline(direction) {
    const step = 5;
    setTimelineZoom(timelinePixelsPerFrame + (direction * step));
}

// ズームをリセット
function resetTimelineZoom() {
    setTimelineZoom(TIMELINE_ZOOM_DEFAULT);
}

// ===== タイムライン初期化 =====
function initTimeline() {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent) return;
    
    // シークバー画像を読み込み
    seekbarImage = new Image();
    seekbarImage.src = 'seekbar-bear.png';
    
    // タイムライングリッドを作成
    createTimelineGrid();
    
    // タイムラインマウスダウンイベント（シークバードラッグ用）
    timelineContent.addEventListener('mousedown', handleTimelineMouseDown);
    
    // キーフレームドラッグイベント
    document.addEventListener('mousemove', handleKeyframeDrag);
    document.addEventListener('mouseup', handleKeyframeDragEnd);
    
    // キーボードイベント（Deleteキー）
    document.addEventListener('keydown', handleKeyframeDelete);
    
    // タイムラインスクロール同期（縦横両方）
    const timeline = document.getElementById('timeline');
    const timelineLayers = document.getElementById('timeline-layers');
    if (timeline && timelineLayers) {
        timeline.addEventListener('scroll', () => {
            timelineLayers.scrollTop = timeline.scrollTop;
            timelineLayers.scrollLeft = timeline.scrollLeft;
        });
        
        // 左側からのスクロールも同期
        timelineLayers.addEventListener('scroll', () => {
            timeline.scrollTop = timelineLayers.scrollTop;
            timeline.scrollLeft = timelineLayers.scrollLeft;
        });
    }
    
    updateTimeline();
}

// ===== タイムライングリッド作成 =====
function createTimelineGrid() {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent) return;
    
    // 既存のグリッドを削除
    const existingGrid = document.getElementById('timeline-grid');
    if (existingGrid) existingGrid.remove();
    
    const grid = document.createElement('div');
    grid.className = 'timeline-grid';
    grid.id = 'timeline-grid';
    
    // 最大フレーム数を計算（ズームレベルに応じて調整）
    const maxFrames = Math.max(300, Math.ceil(3000 / timelinePixelsPerFrame) * 10);
    
    // フレームマーカーを作成
    for (let i = 0; i <= maxFrames; i++) {
        const marker = document.createElement('div');
        marker.className = i % 10 === 0 ? 'frame-marker major' : 'frame-marker';
        marker.style.flex = `0 0 ${timelinePixelsPerFrame}px`;
        
        if (i % 10 === 0) {
            const number = document.createElement('span');
            number.className = 'frame-number';
            number.textContent = i;
            marker.appendChild(number);
        }
        
        grid.appendChild(marker);
    }
    
    // タイムラインコンテンツの幅を設定
    timelineContent.style.minWidth = (maxFrames * timelinePixelsPerFrame) + 'px';
    
    timelineContent.appendChild(grid);
}

// ===== タイムライン更新 =====
function updateTimeline() {
    const timelineLayers = document.getElementById('timeline-layers');
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineLayers || !timelineContent) return;
    
    // グリッドを再作成（ズーム変更対応）
    createTimelineGrid();
    
    // 既存のレイヤーアイテムとトラックを削除
    timelineLayers.innerHTML = '';
    const existingTracks = timelineContent.querySelectorAll('.layer-track, .property-track');
    const existingKeyframes = timelineContent.querySelectorAll('.keyframe');
    existingTracks.forEach(track => track.remove());
    existingKeyframes.forEach(kf => kf.remove());
    
    // レイヤーを逆順で表示（レイヤーリストと同じ順序）
    const rootLayers = layers.filter(l => !l.parentLayerId);
    let trackY = 0;
    
    for (let i = rootLayers.length - 1; i >= 0; i--) {
        trackY = renderTimelineLayer(rootLayers[i], trackY, 0);
    }
    
    // タイムラインの高さを調整
    timelineContent.style.height = Math.max(300, trackY) + 'px';
    
    // 再生ヘッドの位置を更新
    updatePlayhead();
    
    // 書き出しマーカーを描画
    if (typeof renderExportMarkers === 'function') {
        renderExportMarkers();
    }
}

// ===== タイムラインレイヤー描画（再帰的） =====
function renderTimelineLayer(layer, y, depth) {
    const timelineLayers = document.getElementById('timeline-layers');
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineLayers || !timelineContent) return y;
    
    // レイヤーアイコン
    let icon = '🖼️';
    if (layer.type === 'folder') icon = '📁';
    if (layer.type === 'lipsync') icon = '💬';
    if (layer.type === 'blink') icon = '👀';
    if (layer.type === 'bounce') icon = '🎈';
    if (layer.type === 'puppet') icon = '🎭';
    if (layer.type === 'audio') icon = '🎵';
    
    // レイヤーが展開されているか
    const isExpanded = expandedLayers[layer.id] || false;
    
    // レイヤーアイテム（左側）
    const layerItem = document.createElement('div');
    layerItem.className = 'timeline-layer-item' + (isExpanded ? ' expanded' : '');
    layerItem.style.paddingLeft = (depth * 20 + 8) + 'px';
    
    const toggle = document.createElement('span');
    toggle.className = 'layer-toggle';
    toggle.textContent = isExpanded ? '▼' : '▷';
    toggle.onclick = (e) => {
        e.stopPropagation();
        toggleLayerExpansion(layer.id);
    };
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'layer-icon';
    iconSpan.textContent = icon;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = layer.name;
    
    layerItem.appendChild(toggle);
    layerItem.appendChild(iconSpan);
    layerItem.appendChild(nameSpan);
    timelineLayers.appendChild(layerItem);
    
    // レイヤートラック（右側）
    const layerTrack = document.createElement('div');
    layerTrack.className = 'layer-track';
    layerTrack.style.top = y + 'px';
    timelineContent.appendChild(layerTrack);
    
    // キーフレームを描画（口パク・まばたき・揺れモーションレイヤーの場合）
    if ((layer.type === 'lipsync' || layer.type === 'blink') && layer.keyframes) {
        layer.keyframes.forEach((kf, kfIndex) => {
            renderKeyframe(layer, kfIndex, y + 20);
        });
    }
    
    // 揺れモーションレイヤーの場合は bounceParams.keyframes を使用
    if (layer.type === 'bounce' && layer.bounceParams && layer.bounceParams.keyframes) {
        layer.bounceParams.keyframes.forEach((kf, kfIndex) => {
            renderBounceKeyframe(layer, kfIndex, y + 20);
        });
    }
    
    // 音声レイヤーの場合は音声クリップを描画
    if (layer.type === 'audio' && layer.audioClips && typeof renderAudioClipOnTimeline === 'function') {
        layer.audioClips.forEach(clip => {
            renderAudioClipOnTimeline(layer, clip, y);
        });
    }
    
    y += 40;
    
    // プロパティを展開表示（音声レイヤー以外）
    if (isExpanded && layer.type !== 'audio' && (layer.type === 'image' || layer.type === 'lipsync' || layer.type === 'blink' || layer.type === 'bounce' || layer.type === 'puppet' || layer.type === 'folder')) {
        const properties = ['x', 'y', 'rotation', 'scale', 'opacity'];
        const propertyNames = {
            'x': 'X位置',
            'y': 'Y位置',
            'rotation': '回転',
            'scale': 'スケール',
            'opacity': '不透明度'
        };
        
        properties.forEach(prop => {
            // プロパティアイテム（左側）
            const propItem = document.createElement('div');
            propItem.className = 'timeline-property-item';
            propItem.textContent = propertyNames[prop];
            timelineLayers.appendChild(propItem);
            
            // プロパティトラック（右側）
            const propTrack = document.createElement('div');
            propTrack.className = 'property-track';
            propTrack.style.top = y + 'px';
            timelineContent.appendChild(propTrack);
            
            // キーフレームを描画
            if (layer.keyframes) {
                layer.keyframes.forEach((kf, kfIndex) => {
                    if (kf[prop] !== undefined) {
                        renderKeyframe(layer, kfIndex, y + 15, prop);
                    }
                });
            }
            
            y += 30;
        });
        
        // 揺れモーションレイヤーの場合は「弾み」と「揺れ」を追加
        if (layer.type === 'bounce') {
            // 弾み項目
            const bounceItem = document.createElement('div');
            bounceItem.className = 'timeline-property-item';
            bounceItem.textContent = '弾み';
            bounceItem.style.color = '#4A90E2';
            timelineLayers.appendChild(bounceItem);
            
            const bounceTrack = document.createElement('div');
            bounceTrack.className = 'property-track';
            bounceTrack.style.top = y + 'px';
            timelineContent.appendChild(bounceTrack);
            
            // 弾みキーフレームを描画（元の配列のインデックスを使用）
            if (layer.bounceParams && layer.bounceParams.keyframes) {
                layer.bounceParams.keyframes.forEach((kf, originalIndex) => {
                    if (kf.type === 'bounce') {
                        renderBounceKeyframeOnTrack(layer, originalIndex, y + 15, 'bounce');
                    }
                });
            }
            
            y += 30;
            
            // 揺れ項目
            const swayItem = document.createElement('div');
            swayItem.className = 'timeline-property-item';
            swayItem.textContent = '揺れ';
            swayItem.style.color = '#5BC0DE';
            timelineLayers.appendChild(swayItem);
            
            const swayTrack = document.createElement('div');
            swayTrack.className = 'property-track';
            swayTrack.style.top = y + 'px';
            timelineContent.appendChild(swayTrack);
            
            // 揺れキーフレームを描画（元の配列のインデックスを使用）
            if (layer.bounceParams && layer.bounceParams.keyframes) {
                layer.bounceParams.keyframes.forEach((kf, originalIndex) => {
                    if (kf.type === 'sway') {
                        renderBounceKeyframeOnTrack(layer, originalIndex, y + 15, 'sway');
                    }
                });
            }
            
            y += 30;
        }
        
        // パペットレイヤーの場合はピンのキーフレームを追加
        if (layer.type === 'puppet' && layer.puppetPins && layer.puppetPins.length > 0) {
            layer.puppetPins.forEach((pin, pinIndex) => {
                // ピン項目
                const pinItem = document.createElement('div');
                pinItem.className = 'timeline-property-item';
                pinItem.textContent = `📍 ピン${pinIndex + 1}`;
                pinItem.style.color = '#9370db';
                timelineLayers.appendChild(pinItem);
                
                const pinTrack = document.createElement('div');
                pinTrack.className = 'property-track';
                pinTrack.style.top = y + 'px';
                timelineContent.appendChild(pinTrack);
                
                // ピンのキーフレームを描画
                if (pin.keyframes) {
                    pin.keyframes.forEach((pkf, pkfIndex) => {
                        renderPuppetPinKeyframe(layer, pinIndex, pkfIndex, y + 15);
                    });
                }
                
                y += 30;
            });
        }
    }
    
    // 子レイヤーを描画
    if (layer.type === 'folder' && layer.expanded !== false) {
        const children = layers.filter(l => l.parentLayerId === layer.id);
        for (let i = children.length - 1; i >= 0; i--) {
            y = renderTimelineLayer(children[i], y, depth + 1);
        }
    }
    
    // 画像レイヤーの子も描画
    if (layer.type === 'image' || layer.type === 'lipsync' || layer.type === 'blink' || layer.type === 'bounce' || layer.type === 'puppet') {
        const children = layers.filter(l => l.parentLayerId === layer.id);
        for (let i = children.length - 1; i >= 0; i--) {
            y = renderTimelineLayer(children[i], y, depth + 1);
        }
    }
    
    return y;
}

// ===== キーフレーム描画 =====
function renderKeyframe(layer, kfIndex, y, property = null) {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent || !layer.keyframes || !layer.keyframes[kfIndex]) return;
    
    const kf = layer.keyframes[kfIndex];
    
    const keyframeEl = document.createElement('div');
    keyframeEl.className = 'keyframe';
    
    if (layer.type === 'lipsync') {
        keyframeEl.classList.add('lipsync');
    } else if (layer.type === 'blink') {
        keyframeEl.classList.add('blink');
    }
    
    if (selectedKeyframe && selectedKeyframe.layerId === layer.id && selectedKeyframe.index === kfIndex && selectedKeyframe.property === property) {
        keyframeEl.classList.add('selected');
    }
    
    const framePos = kf.frame * timelinePixelsPerFrame;
    keyframeEl.style.left = framePos + 'px';
    keyframeEl.style.top = y + 'px';
    keyframeEl.style.zIndex = '10';
    
    keyframeEl.dataset.layerId = layer.id;
    keyframeEl.dataset.keyframeIndex = kfIndex;
    if (property) {
        keyframeEl.dataset.property = property;
    }
    
    keyframeEl.addEventListener('mousedown', (e) => handleKeyframeMouseDown(e, layer.id, kfIndex, property));
    keyframeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectKeyframe(layer.id, kfIndex, property);
    });
    
    timelineContent.appendChild(keyframeEl);
}

// ===== 揺れモーション種別ごとのキーフレーム描画 =====
function renderBounceKeyframeOnTrack(layer, kfIndex, y, type) {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent || !layer.bounceParams || !layer.bounceParams.keyframes) return;
    
    // kfIndexは元の配列のインデックス
    const kf = layer.bounceParams.keyframes[kfIndex];
    if (!kf || kf.type !== type) return;
    
    const keyframeEl = document.createElement('div');
    keyframeEl.className = 'keyframe bounce';
    
    const framePos = kf.frame * timelinePixelsPerFrame;
    keyframeEl.style.left = framePos + 'px';
    keyframeEl.style.top = y + 'px';
    keyframeEl.style.zIndex = '10';
    
    // タイプによって色を変える
    if (type === 'sway') {
        keyframeEl.style.background = 'linear-gradient(135deg, #5BC0DE, #4A90E2)';
    } else {
        keyframeEl.style.background = 'linear-gradient(135deg, #4A90E2, #357ABD)';
    }
    
    keyframeEl.dataset.layerId = layer.id;
    keyframeEl.dataset.bounceKeyframeIndex = kfIndex;
    keyframeEl.dataset.bounceType = type;
    
    keyframeEl.addEventListener('mousedown', (e) => handleBounceKeyframeMouseDown(e, layer.id, kfIndex, type));
    keyframeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBounceKeyframe(layer.id, kfIndex, type);
    });
    
    timelineContent.appendChild(keyframeEl);
}

// ===== 揺れモーションキーフレーム描画 =====
function renderBounceKeyframe(layer, kfIndex, y) {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent || !layer.bounceParams || !layer.bounceParams.keyframes || !layer.bounceParams.keyframes[kfIndex]) return;
    
    const kf = layer.bounceParams.keyframes[kfIndex];
    
    const keyframeEl = document.createElement('div');
    keyframeEl.className = 'keyframe bounce';
    
    const framePos = kf.frame * timelinePixelsPerFrame;
    keyframeEl.style.left = framePos + 'px';
    keyframeEl.style.top = y + 'px';
    keyframeEl.style.zIndex = '10';
    
    // タイプによって色を変える
    if (kf.type === 'sway') {
        keyframeEl.style.background = 'linear-gradient(135deg, #00bfff, #1e90ff)';
    } else {
        keyframeEl.style.background = 'linear-gradient(135deg, #ffa500, #ff8c00)';
    }
    
    keyframeEl.dataset.layerId = layer.id;
    keyframeEl.dataset.bounceKeyframeIndex = kfIndex;
    
    keyframeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // キーフレームの時間に移動
        currentTime = kf.frame / projectFPS;
        updatePlayhead();
        if (typeof applyKeyframeInterpolation === 'function') {
            applyKeyframeInterpolation();
        }
        render();
    });
    
    timelineContent.appendChild(keyframeEl);
}

// ===== レイヤー展開/折りたたみ =====
function toggleLayerExpansion(layerId) {
    expandedLayers[layerId] = !expandedLayers[layerId];
    updateTimeline();
}

// ===== 再生ヘッド更新 =====
function updatePlayhead() {
    const playhead = document.getElementById('playhead');
    const frameDisplay = document.getElementById('current-frame-display');
    
    if (!playhead || !frameDisplay) return;
    
    const currentFrame = Math.floor(currentTime * projectFPS);
    const framePos = currentFrame * timelinePixelsPerFrame;
    
    // transitionなしで即座に更新
    playhead.style.left = framePos + 'px';
    frameDisplay.textContent = `${currentFrame}f (${currentTime.toFixed(2)}s)`;
    
    // シークバー画像が読み込まれていない場合は作成（初回のみ）
    let bearImg = playhead.querySelector('.playhead-bear');
    if (!bearImg && seekbarImage && seekbarImage.complete) {
        bearImg = document.createElement('img');
        bearImg.className = 'playhead-bear';
        bearImg.src = 'seekbar-bear.png';
        playhead.appendChild(bearImg);
    }
    
    // タイムラインを自動スクロール（再生中のみ）
    if (isPlaying) {
        const timeline = document.getElementById('timeline');
        if (timeline) {
            const scrollLeft = framePos - timeline.clientWidth / 2;
            timeline.scrollLeft = Math.max(0, scrollLeft);
        }
    }
}

// ===== タイムラインマウスダウン =====
function handleTimelineMouseDown(e) {
    if (e.target.classList.contains('keyframe')) return;
    
    const timeline = document.getElementById('timeline');
    const rect = timeline.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timeline.scrollLeft;
    const clickY = e.clientY - rect.top;
    
    // シークバー（くま）の範囲でクリック（上部40pxの範囲）
    const currentFrame = Math.floor(currentTime * projectFPS);
    const playheadX = currentFrame * timelinePixelsPerFrame;
    const hitArea = 25;
    
    if (clickY < 40 && Math.abs(clickX - playheadX) < hitArea) {
        // シークバードラッグ開始
        isSeekbarDragging = true;
        updateSeekbarPosition(e);
        return;
    }
    
    // 通常のタイムラインクリック（瞬時移動）
    const clickedFrame = Math.floor(clickX / timelinePixelsPerFrame);
    currentTime = clickedFrame / projectFPS;
    
    // キーフレーム補間を適用
    applyKeyframeInterpolation();
    
    updatePlayhead();
    render();
}

// ===== シークバー位置更新 =====
function updateSeekbarPosition(e) {
    const timeline = document.getElementById('timeline');
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left + timeline.scrollLeft;
    
    // マウス位置から直接currentTimeを計算（フレーム単位ではなく連続的に）
    const newTime = Math.max(0, x / timelinePixelsPerFrame) / projectFPS;
    pendingSeekbarTime = newTime;
    
    // requestAnimationFrameで描画をスケジュール（30fps程度に制限）
    if (!seekbarRenderScheduled) {
        seekbarRenderScheduled = true;
        requestAnimationFrame(() => {
            currentTime = pendingSeekbarTime;
            
            // キーフレーム補間を適用
            applyKeyframeInterpolation();
            
            updatePlayhead();
            render();
            
            seekbarRenderScheduled = false;
        });
    }
}

// ===== キーフレーム選択 =====
function selectKeyframe(layerId, keyframeIndex, property = null) {
    selectedKeyframe = { layerId, index: keyframeIndex, property };
    updateTimeline();
}

// ===== キーフレームマウスダウン =====
function handleKeyframeMouseDown(e, layerId, keyframeIndex, property = null) {
    e.stopPropagation();
    
    selectedKeyframe = { layerId, index: keyframeIndex, property };
    isDraggingKeyframe = true;
    
    const timeline = document.getElementById('timeline');
    const rect = timeline.getBoundingClientRect();
    keyframeDragStart.x = e.clientX;
    
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.keyframes && layer.keyframes[keyframeIndex]) {
        keyframeDragStart.frame = layer.keyframes[keyframeIndex].frame;
    }
    
    updateTimeline();
}

// ===== キーフレームドラッグ =====
function handleKeyframeDrag(e) {
    // シークバードラッグ中
    if (isSeekbarDragging) {
        updateSeekbarPosition(e);
        return;
    }
    
    // キーフレームドラッグ中
    if (!isDraggingKeyframe || !selectedKeyframe) return;
    
    const deltaX = e.clientX - keyframeDragStart.x;
    const deltaFrames = Math.round(deltaX / timelinePixelsPerFrame);
    const newFrame = Math.max(0, keyframeDragStart.frame + deltaFrames);
    
    const layer = layers.find(l => l.id === selectedKeyframe.layerId);
    if (layer && layer.keyframes && layer.keyframes[selectedKeyframe.index]) {
        layer.keyframes[selectedKeyframe.index].frame = newFrame;
        updateTimeline();
    }
}

// ===== キーフレームドラッグ終了 =====
function handleKeyframeDragEnd(e) {
    // シークバードラッグ終了
    if (isSeekbarDragging) {
        isSeekbarDragging = false;
        return;
    }
    
    // キーフレームドラッグ終了
    if (isDraggingKeyframe) {
        isDraggingKeyframe = false;
        updateTimeline();
        render();
    }
}

// ===== キーフレーム削除（Deleteキー） =====
function handleKeyframeDelete(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (!selectedKeyframe) return;
    
    // プロパティパネルの入力欄にフォーカスがある場合はスキップ
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
    }
    
    const layer = layers.find(l => l.id === selectedKeyframe.layerId);
    if (layer && layer.keyframes && layer.keyframes[selectedKeyframe.index]) {
        layer.keyframes.splice(selectedKeyframe.index, 1);
        selectedKeyframe = null;
        updateTimeline();
        updatePropertiesPanel();
        render();
    }
}

// ===== トランスフォーム変更時にキーフレーム自動挿入 =====
function autoInsertKeyframe(layerId, properties) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    // 口パク・まばたきレイヤーはキーフレーム自動挿入しない
    if (layer.type === 'lipsync' || layer.type === 'blink') return;
    
    const currentFrame = Math.floor(currentTime * projectFPS);
    
    // キーフレーム配列が存在しない場合は作成
    if (!layer.keyframes) {
        layer.keyframes = [];
    }
    
    // 既存のキーフレームを探す
    let existingKeyframe = layer.keyframes.find(kf => kf.frame === currentFrame);
    
    if (existingKeyframe) {
        // 既存のキーフレームを更新
        Object.assign(existingKeyframe, properties);
    } else {
        // 新しいキーフレームを挿入
        const newKeyframe = {
            frame: currentFrame,
            x: layer.x,
            y: layer.y,
            rotation: layer.rotation,
            scale: layer.scale,
            opacity: layer.opacity,
            ...properties
        };
        
        layer.keyframes.push(newKeyframe);
        layer.keyframes.sort((a, b) => a.frame - b.frame);
    }
    
    updateTimeline();
}

// ===== キーフレーム補間 =====
function applyKeyframeInterpolation() {
    const currentFrame = Math.floor(currentTime * projectFPS);
    
    layers.forEach(layer => {
        // 口パク・まばたきレイヤーは補間しない
        if (layer.type === 'lipsync' || layer.type === 'blink') return;
        
        if (!layer.keyframes || layer.keyframes.length === 0) return;
        
        // キーフレームが1つだけの場合
        if (layer.keyframes.length === 1) {
            const kf = layer.keyframes[0];
            if (kf.x !== undefined) layer.x = kf.x;
            if (kf.y !== undefined) layer.y = kf.y;
            if (kf.rotation !== undefined) layer.rotation = kf.rotation;
            if (kf.scale !== undefined) layer.scale = kf.scale;
            if (kf.opacity !== undefined) layer.opacity = kf.opacity;
            return;
        }
        
        // 現在のフレームに対応するキーフレームを探す
        let prevKeyframe = null;
        let nextKeyframe = null;
        
        for (let i = 0; i < layer.keyframes.length; i++) {
            const kf = layer.keyframes[i];
            
            if (kf.frame === currentFrame) {
                // 完全一致
                if (kf.x !== undefined) layer.x = kf.x;
                if (kf.y !== undefined) layer.y = kf.y;
                if (kf.rotation !== undefined) layer.rotation = kf.rotation;
                if (kf.scale !== undefined) layer.scale = kf.scale;
                if (kf.opacity !== undefined) layer.opacity = kf.opacity;
                return;
            } else if (kf.frame < currentFrame) {
                prevKeyframe = kf;
            } else if (kf.frame > currentFrame && !nextKeyframe) {
                nextKeyframe = kf;
                break;
            }
        }
        
        // 2つのキーフレーム間で補間
        if (prevKeyframe && nextKeyframe) {
            const t = (currentFrame - prevKeyframe.frame) / (nextKeyframe.frame - prevKeyframe.frame);
            
            if (prevKeyframe.x !== undefined && nextKeyframe.x !== undefined) {
                layer.x = prevKeyframe.x + (nextKeyframe.x - prevKeyframe.x) * t;
            }
            if (prevKeyframe.y !== undefined && nextKeyframe.y !== undefined) {
                layer.y = prevKeyframe.y + (nextKeyframe.y - prevKeyframe.y) * t;
            }
            if (prevKeyframe.rotation !== undefined && nextKeyframe.rotation !== undefined) {
                layer.rotation = prevKeyframe.rotation + (nextKeyframe.rotation - prevKeyframe.rotation) * t;
            }
            if (prevKeyframe.scale !== undefined && nextKeyframe.scale !== undefined) {
                layer.scale = prevKeyframe.scale + (nextKeyframe.scale - prevKeyframe.scale) * t;
            }
            if (prevKeyframe.opacity !== undefined && nextKeyframe.opacity !== undefined) {
                layer.opacity = prevKeyframe.opacity + (nextKeyframe.opacity - prevKeyframe.opacity) * t;
            }
        }
        // prevKeyframeのみ（最後のキーフレームより後）
        else if (prevKeyframe && !nextKeyframe) {
            if (prevKeyframe.x !== undefined) layer.x = prevKeyframe.x;
            if (prevKeyframe.y !== undefined) layer.y = prevKeyframe.y;
            if (prevKeyframe.rotation !== undefined) layer.rotation = prevKeyframe.rotation;
            if (prevKeyframe.scale !== undefined) layer.scale = prevKeyframe.scale;
            if (prevKeyframe.opacity !== undefined) layer.opacity = prevKeyframe.opacity;
        }
        // nextKeyframeのみ（最初のキーフレームより前）
        else if (!prevKeyframe && nextKeyframe) {
            if (nextKeyframe.x !== undefined) layer.x = nextKeyframe.x;
            if (nextKeyframe.y !== undefined) layer.y = nextKeyframe.y;
            if (nextKeyframe.rotation !== undefined) layer.rotation = nextKeyframe.rotation;
            if (nextKeyframe.scale !== undefined) layer.scale = nextKeyframe.scale;
            if (nextKeyframe.opacity !== undefined) layer.opacity = nextKeyframe.opacity;
        }
    });
}

// ===== FPS切り替え =====
function setProjectFPS(fps) {
    projectFPS = fps;
    
    // FPSボタンのアクティブ状態を更新
    document.querySelectorAll('.fps-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (fps === 24) {
        document.getElementById('fps-24').classList.add('active');
    } else {
        document.getElementById('fps-30').classList.add('active');
    }
    
    updatePlayhead();
    updateTimeline();
}

// ===== 揺れモーションキーフレーム選択 =====
let selectedBounceKeyframe = null;

function selectBounceKeyframe(layerId, kfIndex, type) {
    selectedBounceKeyframe = { layerId, index: kfIndex, type };
    updateTimeline();
    
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.bounceParams && layer.bounceParams.keyframes[kfIndex]) {
        const kf = layer.bounceParams.keyframes[kfIndex];
        currentTime = kf.frame / projectFPS;
        updatePlayhead();
        render();
    }
}

// ===== 揺れモーションキーフレームドラッグ =====
let isDraggingBounceKeyframe = false;
let bounceKeyframeDragStart = { x: 0, frame: 0 };

function handleBounceKeyframeMouseDown(e, layerId, kfIndex, type) {
    e.stopPropagation();
    isDraggingBounceKeyframe = true;
    selectedBounceKeyframe = { layerId, index: kfIndex, type };
    
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.bounceParams && layer.bounceParams.keyframes[kfIndex]) {
        bounceKeyframeDragStart.frame = layer.bounceParams.keyframes[kfIndex].frame;
        bounceKeyframeDragStart.x = e.clientX;
    }
}

// キーフレームドラッグ処理を拡張
document.addEventListener('mousemove', (e) => {
    if (isDraggingBounceKeyframe && selectedBounceKeyframe) {
        const deltaX = e.clientX - bounceKeyframeDragStart.x;
        const deltaFrame = Math.round(deltaX / timelinePixelsPerFrame);
        const newFrame = Math.max(0, bounceKeyframeDragStart.frame + deltaFrame);
        
        const layer = layers.find(l => l.id === selectedBounceKeyframe.layerId);
        if (layer && layer.bounceParams && layer.bounceParams.keyframes[selectedBounceKeyframe.index]) {
            layer.bounceParams.keyframes[selectedBounceKeyframe.index].frame = newFrame;
            updateTimeline();
        }
    }
});

document.addEventListener('mouseup', () => {
    if (isDraggingBounceKeyframe) {
        isDraggingBounceKeyframe = false;
        if (typeof updatePropertiesPanel === 'function') {
            updatePropertiesPanel();
        }
    }
});

// キーボードイベント（Deleteキー）を拡張
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedBounceKeyframe) {
        const layer = layers.find(l => l.id === selectedBounceKeyframe.layerId);
        if (layer && layer.bounceParams && layer.bounceParams.keyframes) {
            layer.bounceParams.keyframes.splice(selectedBounceKeyframe.index, 1);
            selectedBounceKeyframe = null;
            updateTimeline();
            if (typeof updatePropertiesPanel === 'function') {
                updatePropertiesPanel();
            }
            render();
        }
    }
});

// ===== パペットピンキーフレーム描画 =====
let selectedPuppetKeyframe = null;
let isDraggingPuppetKeyframe = false;
let puppetKeyframeDragStart = { x: 0, frame: 0 };

function renderPuppetPinKeyframe(layer, pinIndex, kfIndex, y) {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent || !layer.puppetPins || !layer.puppetPins[pinIndex]) return;
    
    const pin = layer.puppetPins[pinIndex];
    if (!pin.keyframes || !pin.keyframes[kfIndex]) return;
    
    const kf = pin.keyframes[kfIndex];
    const x = kf.frame * timelinePixelsPerFrame;
    
    const kfElement = document.createElement('div');
    kfElement.className = 'keyframe puppet-keyframe';
    kfElement.style.left = x + 'px';
    kfElement.style.top = y + 'px';
    kfElement.style.background = '#9370db';
    
    if (selectedPuppetKeyframe && 
        selectedPuppetKeyframe.layerId === layer.id && 
        selectedPuppetKeyframe.pinIndex === pinIndex && 
        selectedPuppetKeyframe.kfIndex === kfIndex) {
        kfElement.classList.add('selected');
    }
    
    kfElement.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        handlePuppetKeyframeMouseDown(e, layer.id, pinIndex, kfIndex);
    });
    
    timelineContent.appendChild(kfElement);
}

function handlePuppetKeyframeMouseDown(e, layerId, pinIndex, kfIndex) {
    e.stopPropagation();
    isDraggingPuppetKeyframe = true;
    selectedPuppetKeyframe = { layerId, pinIndex, kfIndex };
    
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.puppetPins && layer.puppetPins[pinIndex] && layer.puppetPins[pinIndex].keyframes[kfIndex]) {
        puppetKeyframeDragStart.frame = layer.puppetPins[pinIndex].keyframes[kfIndex].frame;
        puppetKeyframeDragStart.x = e.clientX;
    }
    
    updateTimeline();
}

// パペットキーフレームドラッグ処理
document.addEventListener('mousemove', (e) => {
    if (isDraggingPuppetKeyframe && selectedPuppetKeyframe) {
        const deltaX = e.clientX - puppetKeyframeDragStart.x;
        const deltaFrame = Math.round(deltaX / timelinePixelsPerFrame);
        const newFrame = Math.max(0, puppetKeyframeDragStart.frame + deltaFrame);
        
        const layer = layers.find(l => l.id === selectedPuppetKeyframe.layerId);
        if (layer && layer.puppetPins && layer.puppetPins[selectedPuppetKeyframe.pinIndex]) {
            const pin = layer.puppetPins[selectedPuppetKeyframe.pinIndex];
            if (pin.keyframes[selectedPuppetKeyframe.kfIndex]) {
                pin.keyframes[selectedPuppetKeyframe.kfIndex].frame = newFrame;
                pin.keyframes.sort((a, b) => a.frame - b.frame);
                updateTimeline();
            }
        }
    }
});

document.addEventListener('mouseup', () => {
    if (isDraggingPuppetKeyframe) {
        isDraggingPuppetKeyframe = false;
        if (typeof updatePropertiesPanel === 'function') {
            updatePropertiesPanel();
        }
    }
});

// パペットキーフレーム削除
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedPuppetKeyframe) {
        const layer = layers.find(l => l.id === selectedPuppetKeyframe.layerId);
        if (layer && layer.puppetPins && layer.puppetPins[selectedPuppetKeyframe.pinIndex]) {
            const pin = layer.puppetPins[selectedPuppetKeyframe.pinIndex];
            if (pin.keyframes && pin.keyframes.length > 1) {
                pin.keyframes.splice(selectedPuppetKeyframe.kfIndex, 1);
                selectedPuppetKeyframe = null;
                updateTimeline();
                if (typeof updatePropertiesPanel === 'function') {
                    updatePropertiesPanel();
                }
                render();
            }
        }
    }
});
