/**
 * ⭐ Starlit Puppet Editor v1.11.0
 * 音声レイヤー機能 - 複数音声クリップ対応
 * - 音声レイヤーに複数のmp3/wavファイルを配置可能
 * - 各クリップの開始フレーム設定
 * - ボリューム調整
 * - 波形表示
 * - 再生同期
 */

// ===== 音声グローバル変数 =====
let audioContext = null;
let masterGainNode = null;
let activeAudioSources = []; // 再生中の音声ソース

// ===== AudioContext初期化 =====
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGainNode = audioContext.createGain();
        masterGainNode.connect(audioContext.destination);
    }
    return audioContext;
}

// ===== 音声レイヤー作成 =====
function createAudioLayer() {
    const layer = {
        id: nextLayerId++,
        type: 'audio',
        name: '🎵 音声',
        visible: true,
        
        // 音声クリップ配列
        audioClips: [],
        
        // マスターボリューム
        volume: 1.0,
        
        // 親レイヤー（通常は使わないが互換性のため）
        parentLayerId: null
    };
    
    layers.push(layer);
    updateLayerList();
    selectLayer(layer.id, false);
    render();
    
    // 音声追加ダイアログを開く
    addAudioClipToLayer(layer.id);
}

// ===== 音声クリップ追加 =====
function addAudioClipToLayer(layerId) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'audio') return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/mp3,audio/wav,audio/mpeg,audio/x-wav,.mp3,.wav';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        
        for (const file of files) {
            await loadAudioClip(layer, file);
        }
        
        updateLayerList();
        updateTimeline();
        updatePropertiesPanel();
        
        // 履歴を保存
        if (typeof saveHistory === 'function') {
            saveHistory();
        }
    };
    
    input.click();
}

// ===== 音声ファイル読み込み =====
async function loadAudioClip(layer, file) {
    initAudioContext();
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                
                // 波形データを生成
                const waveformData = generateWaveformData(audioBuffer, 200);
                
                // 最後のクリップの終了位置から開始（または0）
                let startFrame = 0;
                if (layer.audioClips.length > 0) {
                    const lastClip = layer.audioClips[layer.audioClips.length - 1];
                    startFrame = lastClip.startFrame + Math.ceil(lastClip.duration * projectFPS) + 5;
                }
                
                const clip = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    audioBuffer: audioBuffer,
                    arrayBuffer: arrayBuffer.slice(0), // 保存用のコピー
                    duration: audioBuffer.duration,
                    startFrame: startFrame,
                    volume: 1.0,
                    waveformData: waveformData
                };
                
                layer.audioClips.push(clip);
                resolve(clip);
            } catch (error) {
                console.error('音声デコードエラー:', error);
                alert('音声ファイルの読み込みに失敗しました: ' + file.name);
                reject(error);
            }
        };
        
        reader.onerror = () => {
            console.error('ファイル読み込みエラー');
            reject(new Error('ファイル読み込みエラー'));
        };
        
        reader.readAsArrayBuffer(file);
    });
}

// ===== 波形データ生成 =====
function generateWaveformData(audioBuffer, samples) {
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const waveform = [];
    
    for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        let sum = 0;
        
        for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j] || 0);
        }
        
        waveform.push(sum / blockSize);
    }
    
    // 正規化
    const max = Math.max(...waveform, 0.01);
    return waveform.map(v => v / max);
}

// ===== 音声再生開始 =====
function startAudioPlayback(startTime) {
    stopAudioPlayback();
    initAudioContext();
    
    // AudioContextが一時停止している場合は再開
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const audioLayers = layers.filter(l => l.type === 'audio' && l.visible);
    
    audioLayers.forEach(layer => {
        layer.audioClips.forEach(clip => {
            const clipStartTime = clip.startFrame / projectFPS;
            const clipEndTime = clipStartTime + clip.duration;
            
            // 現在の再生位置がクリップの範囲内かどうか
            if (startTime < clipEndTime) {
                const source = audioContext.createBufferSource();
                source.buffer = clip.audioBuffer;
                
                // 個別のゲインノード
                const gainNode = audioContext.createGain();
                gainNode.gain.value = clip.volume * layer.volume;
                
                source.connect(gainNode);
                gainNode.connect(masterGainNode);
                
                // 開始オフセットと遅延を計算
                let offset = 0;
                let delay = 0;
                
                if (startTime > clipStartTime) {
                    // すでにクリップの途中から
                    offset = startTime - clipStartTime;
                } else {
                    // まだクリップが始まっていない
                    delay = clipStartTime - startTime;
                }
                
                source.start(audioContext.currentTime + delay, offset);
                
                activeAudioSources.push({
                    source: source,
                    gainNode: gainNode,
                    clip: clip,
                    layer: layer
                });
            }
        });
    });
}

// ===== 音声再生停止 =====
function stopAudioPlayback() {
    activeAudioSources.forEach(item => {
        try {
            item.source.stop();
        } catch (e) {
            // すでに停止している場合は無視
        }
    });
    activeAudioSources = [];
}

// ===== 音声クリップ削除 =====
function deleteAudioClip(layerId, clipId) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'audio') return;
    
    const index = layer.audioClips.findIndex(c => c.id === clipId);
    if (index !== -1) {
        layer.audioClips.splice(index, 1);
        updateTimeline();
        updatePropertiesPanel();
    }
}

// ===== 音声クリップの開始フレーム変更 =====
function setAudioClipStartFrame(layerId, clipId, startFrame) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'audio') return;
    
    const clip = layer.audioClips.find(c => c.id === clipId);
    if (clip) {
        clip.startFrame = Math.max(0, startFrame);
        updateTimeline();
    }
}

// ===== 音声クリップのボリューム変更 =====
function setAudioClipVolume(layerId, clipId, volume) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'audio') return;
    
    const clip = layer.audioClips.find(c => c.id === clipId);
    if (clip) {
        clip.volume = Math.max(0, Math.min(2, volume));
        
        // 再生中の場合はリアルタイム更新
        const activeSource = activeAudioSources.find(s => s.clip.id === clipId);
        if (activeSource) {
            activeSource.gainNode.gain.value = clip.volume * layer.volume;
        }
    }
}

// ===== 音声レイヤーのマスターボリューム変更 =====
function setAudioLayerVolume(layerId, volume) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'audio') return;
    
    layer.volume = Math.max(0, Math.min(2, volume));
    
    // 再生中の場合はリアルタイム更新
    activeAudioSources.forEach(item => {
        if (item.layer.id === layerId) {
            item.gainNode.gain.value = item.clip.volume * layer.volume;
        }
    });
}

// ===== タイムライン用：音声クリップ描画 =====
function renderAudioClipOnTimeline(layer, clip, y) {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent) return;
    
    const clipElement = document.createElement('div');
    clipElement.className = 'audio-clip';
    clipElement.dataset.clipId = clip.id;
    clipElement.dataset.layerId = layer.id;
    
    const startX = clip.startFrame * 20;
    const width = Math.max(clip.duration * projectFPS * 20, 40);
    
    clipElement.style.cssText = `
        position: absolute;
        left: ${startX}px;
        top: ${y + 5}px;
        width: ${width}px;
        height: 30px;
        background: linear-gradient(135deg, #1db954, #1ed760);
        border: 2px solid #1db954;
        border-radius: 4px;
        cursor: move;
        z-index: 5;
        overflow: hidden;
        display: flex;
        align-items: center;
    `;
    
    // 波形キャンバス
    const waveformCanvas = document.createElement('canvas');
    waveformCanvas.width = width;
    waveformCanvas.height = 30;
    waveformCanvas.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none;';
    
    const wctx = waveformCanvas.getContext('2d');
    drawWaveform(wctx, clip.waveformData, width, 30);
    
    clipElement.appendChild(waveformCanvas);
    
    // クリップ名
    const nameLabel = document.createElement('div');
    nameLabel.style.cssText = `
        position: relative;
        z-index: 1;
        padding: 0 8px;
        font-size: 10px;
        color: white;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    `;
    nameLabel.textContent = clip.name;
    clipElement.appendChild(nameLabel);
    
    // ドラッグ処理
    clipElement.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            startAudioClipDrag(e, layer.id, clip.id);
        }
    });
    
    // 右クリックメニュー
    clipElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showAudioClipContextMenu(e, layer.id, clip.id);
    });
    
    timelineContent.appendChild(clipElement);
}

// ===== 波形描画 =====
function drawWaveform(ctx, waveformData, width, height) {
    if (!waveformData || waveformData.length === 0) return;
    
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    
    waveformData.forEach((value, i) => {
        const barHeight = value * height * 0.8;
        const x = i * barWidth;
        
        ctx.fillRect(x, centerY - barHeight / 2, barWidth - 1, barHeight);
    });
}

// ===== 音声クリップドラッグ =====
let isDraggingAudioClip = false;
let draggingAudioClipData = null;

function startAudioClipDrag(e, layerId, clipId) {
    e.stopPropagation();
    
    isDraggingAudioClip = true;
    draggingAudioClipData = {
        layerId: layerId,
        clipId: clipId,
        startX: e.clientX,
        startFrame: layers.find(l => l.id === layerId)?.audioClips.find(c => c.id === clipId)?.startFrame || 0
    };
    
    document.addEventListener('mousemove', handleAudioClipDrag);
    document.addEventListener('mouseup', handleAudioClipDragEnd);
}

function handleAudioClipDrag(e) {
    if (!isDraggingAudioClip || !draggingAudioClipData) return;
    
    const deltaX = e.clientX - draggingAudioClipData.startX;
    const deltaFrame = Math.round(deltaX / 20);
    const newStartFrame = Math.max(0, draggingAudioClipData.startFrame + deltaFrame);
    
    setAudioClipStartFrame(
        draggingAudioClipData.layerId,
        draggingAudioClipData.clipId,
        newStartFrame
    );
}

function handleAudioClipDragEnd() {
    isDraggingAudioClip = false;
    draggingAudioClipData = null;
    
    document.removeEventListener('mousemove', handleAudioClipDrag);
    document.removeEventListener('mouseup', handleAudioClipDragEnd);
    
    updatePropertiesPanel();
}

// ===== コンテキストメニュー =====
function showAudioClipContextMenu(e, layerId, clipId) {
    // 既存のメニューを削除
    const existingMenu = document.querySelector('.audio-clip-context-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'audio-clip-context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY}px;
        background: var(--chocolate-dark);
        border: 2px solid var(--border-color);
        border-radius: 8px;
        padding: 8px 0;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    
    const deleteBtn = document.createElement('div');
    deleteBtn.textContent = '🗑️ 削除';
    deleteBtn.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        color: var(--biscuit-light);
        font-size: 13px;
    `;
    deleteBtn.onmouseenter = () => deleteBtn.style.background = 'var(--chocolate-medium)';
    deleteBtn.onmouseleave = () => deleteBtn.style.background = 'transparent';
    deleteBtn.onclick = () => {
        deleteAudioClip(layerId, clipId);
        menu.remove();
    };
    
    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);
    
    // クリックで閉じる
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

// ===== 音声プロパティUI生成 =====
function generateAudioPropertiesUI(layer) {
    let html = `
        <div class="property-group">
            <h4>🎵 音声レイヤー</h4>
            
            <div style="margin-bottom: 12px;">
                <label style="font-size: 12px; display: block; margin-bottom: 6px;">
                    マスターボリューム: <span id="audioMasterVolume">${Math.round(layer.volume * 100)}</span>%
                </label>
                <input type="range" class="property-slider" value="${layer.volume * 100}" 
                    min="0" max="200" step="1"
                    oninput="document.getElementById('audioMasterVolume').textContent = this.value; setAudioLayerVolume(${layer.id}, parseFloat(this.value) / 100)">
            </div>
            
            <button onclick="addAudioClipToLayer(${layer.id})" 
                style="width: 100%; padding: 10px; background: linear-gradient(135deg, #1db954, #1ed760); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-bottom: 12px;">
                ➕ 音声クリップを追加
            </button>
        </div>
    `;
    
    // 各クリップのプロパティ
    if (layer.audioClips && layer.audioClips.length > 0) {
        layer.audioClips.forEach((clip, index) => {
            const durationStr = clip.duration.toFixed(2);
            const endFrame = clip.startFrame + Math.ceil(clip.duration * projectFPS);
            
            html += `
                <div class="property-group" style="background: linear-gradient(135deg, #1a3d1a, #2d5a2d);">
                    <h4 style="display: flex; justify-content: space-between; align-items: center;">
                        <span>🎶 ${clip.name}</span>
                        <button onclick="deleteAudioClip(${layer.id}, ${clip.id})" 
                            style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            🗑️
                        </button>
                    </h4>
                    
                    <div style="font-size: 11px; color: #8fbc8f; margin-bottom: 8px;">
                        長さ: ${durationStr}秒 (${Math.ceil(clip.duration * projectFPS)}フレーム)
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">
                            開始フレーム: <span id="audioClipStart${index}">${clip.startFrame}</span>
                        </label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="range" class="property-slider" style="flex: 1;" value="${clip.startFrame}" 
                                min="0" max="300" step="1"
                                oninput="document.getElementById('audioClipStart${index}').textContent = this.value; setAudioClipStartFrame(${layer.id}, ${clip.id}, parseInt(this.value))">
                            <input type="number" style="width: 70px;" value="${clip.startFrame}" min="0"
                                onchange="setAudioClipStartFrame(${layer.id}, ${clip.id}, parseInt(this.value)); updatePropertiesPanel()">
                        </div>
                        <div style="font-size: 10px; color: #6b8e6b; margin-top: 4px;">
                            終了: ${endFrame}フレーム (${(endFrame / projectFPS).toFixed(2)}秒)
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">
                            ボリューム: <span id="audioClipVol${index}">${Math.round(clip.volume * 100)}</span>%
                        </label>
                        <input type="range" class="property-slider" value="${clip.volume * 100}" 
                            min="0" max="200" step="1"
                            oninput="document.getElementById('audioClipVol${index}').textContent = this.value; setAudioClipVolume(${layer.id}, ${clip.id}, parseFloat(this.value) / 100)">
                    </div>
                </div>
            `;
        });
    } else {
        html += `
            <div style="text-align: center; padding: 20px; color: var(--biscuit); font-size: 12px;">
                音声クリップがありません<br>
                上のボタンから追加してください
            </div>
        `;
    }
    
    return html;
}

// ===== 再生時の音声同期（app-animation.jsから呼び出し） =====
function syncAudioWithPlayback(playing, time) {
    if (playing) {
        startAudioPlayback(time);
    } else {
        stopAudioPlayback();
    }
}
