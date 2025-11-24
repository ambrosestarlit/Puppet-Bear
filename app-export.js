/**
 * ⭐ Starlit Puppet Editor v1.12.0
 * 書き出し機能 - WebM/連番PNG対応
 * - ローカル処理（サーバー不要）
 * - マーカーによる書き出し範囲指定
 * - 音声エンコード対応
 */

// ===== 書き出しグローバル変数 =====
let exportMarkers = {
    start: null,  // 開始フレーム（null = 0フレーム）
    end: null     // 終了フレーム（null = 自動検出）
};

let isExporting = false;
let exportProgress = 0;

// ===== マーカー管理 =====

// 書き出し範囲の開始フレームを設定
function setExportStartMarker(frame) {
    exportMarkers.start = frame !== null ? Math.max(0, Math.floor(frame)) : null;
    updateExportMarkersDisplay();
    updateTimeline();
}

// 書き出し範囲の終了フレームを設定
function setExportEndMarker(frame) {
    exportMarkers.end = frame !== null ? Math.max(0, Math.floor(frame)) : null;
    updateExportMarkersDisplay();
    updateTimeline();
}

// 現在のフレーム位置に開始マーカーを設定
function setStartMarkerAtCurrentFrame() {
    const currentFrame = Math.floor(currentTime * projectFPS);
    setExportStartMarker(currentFrame);
}

// 現在のフレーム位置に終了マーカーを設定
function setEndMarkerAtCurrentFrame() {
    const currentFrame = Math.floor(currentTime * projectFPS);
    setExportEndMarker(currentFrame);
}

// マーカーをクリア
function clearExportMarkers() {
    exportMarkers.start = null;
    exportMarkers.end = null;
    updateExportMarkersDisplay();
    updateTimeline();
}

// 書き出し範囲を取得
function getExportRange() {
    const startFrame = exportMarkers.start !== null ? exportMarkers.start : 0;
    let endFrame = exportMarkers.end;
    
    // 終了マーカーがない場合は自動検出
    if (endFrame === null) {
        endFrame = getLastObjectFrame();
    }
    
    // 開始が終了より大きい場合は入れ替え
    if (startFrame > endFrame) {
        return { start: endFrame, end: startFrame };
    }
    
    return { start: startFrame, end: endFrame };
}

// 最後のオブジェクトがあるフレームを取得
function getLastObjectFrame() {
    let maxFrame = 30; // デフォルト最低30フレーム（1秒）
    
    layers.forEach(layer => {
        // キーフレームをチェック
        if (layer.keyframes) {
            layer.keyframes.forEach(kf => {
                if (kf.frame > maxFrame) maxFrame = kf.frame;
            });
        }
        
        // 揺れモーションキーフレームをチェック
        if (layer.bounceParams && layer.bounceParams.keyframes) {
            layer.bounceParams.keyframes.forEach(kf => {
                if (kf.frame > maxFrame) maxFrame = kf.frame;
            });
        }
        
        // パペットピンキーフレームをチェック
        if (layer.puppetPins) {
            layer.puppetPins.forEach(pin => {
                if (pin.keyframes) {
                    pin.keyframes.forEach(kf => {
                        if (kf.frame > maxFrame) maxFrame = kf.frame;
                    });
                }
            });
        }
        
        // 音声クリップをチェック
        if (layer.type === 'audio' && layer.audioClips) {
            layer.audioClips.forEach(clip => {
                const clipEndFrame = clip.startFrame + Math.ceil(clip.duration * projectFPS);
                if (clipEndFrame > maxFrame) maxFrame = clipEndFrame;
            });
        }
    });
    
    return maxFrame;
}

// マーカー表示を更新
function updateExportMarkersDisplay() {
    const markerInfo = document.getElementById('export-marker-info');
    if (!markerInfo) return;
    
    const range = getExportRange();
    const duration = (range.end - range.start) / projectFPS;
    
    let startText = exportMarkers.start !== null ? `${exportMarkers.start}f` : '0f (自動)';
    let endText = exportMarkers.end !== null ? `${exportMarkers.end}f` : `${range.end}f (自動)`;
    
    markerInfo.innerHTML = `
        <span style="color: #4CAF50;">▶ ${startText}</span>
        <span style="margin: 0 8px;">～</span>
        <span style="color: #f44336;">◼ ${endText}</span>
        <span style="margin-left: 12px; color: var(--biscuit);">(${duration.toFixed(2)}秒 / ${range.end - range.start}フレーム)</span>
    `;
}

// タイムラインにマーカーを描画
function renderExportMarkers() {
    const timelineContent = document.getElementById('timeline-content');
    if (!timelineContent) return;
    
    // 既存のマーカーを削除
    const existingMarkers = timelineContent.querySelectorAll('.export-marker');
    existingMarkers.forEach(m => m.remove());
    
    const range = getExportRange();
    const pixelsPerFrame = typeof timelinePixelsPerFrame !== 'undefined' ? timelinePixelsPerFrame : 20;
    
    // 開始マーカー
    const startMarker = document.createElement('div');
    startMarker.className = 'export-marker export-marker-start';
    startMarker.style.cssText = `
        position: absolute;
        left: ${range.start * pixelsPerFrame}px;
        top: 0;
        width: 3px;
        height: 100%;
        background: linear-gradient(to bottom, #4CAF50, rgba(76, 175, 80, 0.3));
        z-index: 50;
        pointer-events: none;
    `;
    
    const startHandle = document.createElement('div');
    startHandle.style.cssText = `
        position: absolute;
        top: 0;
        left: -8px;
        width: 20px;
        height: 20px;
        background: #4CAF50;
        border-radius: 0 0 4px 4px;
        cursor: ew-resize;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: white;
        font-weight: bold;
    `;
    startHandle.textContent = '▶';
    startHandle.title = '開始マーカー（ドラッグで移動）';
    startHandle.addEventListener('mousedown', (e) => startMarkerDrag(e, 'start'));
    startMarker.appendChild(startHandle);
    timelineContent.appendChild(startMarker);
    
    // 終了マーカー
    const endMarker = document.createElement('div');
    endMarker.className = 'export-marker export-marker-end';
    endMarker.style.cssText = `
        position: absolute;
        left: ${range.end * pixelsPerFrame}px;
        top: 0;
        width: 3px;
        height: 100%;
        background: linear-gradient(to bottom, #f44336, rgba(244, 67, 54, 0.3));
        z-index: 50;
        pointer-events: none;
    `;
    
    const endHandle = document.createElement('div');
    endHandle.style.cssText = `
        position: absolute;
        top: 0;
        left: -8px;
        width: 20px;
        height: 20px;
        background: #f44336;
        border-radius: 0 0 4px 4px;
        cursor: ew-resize;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: white;
        font-weight: bold;
    `;
    endHandle.textContent = '◼';
    endHandle.title = '終了マーカー（ドラッグで移動）';
    endHandle.addEventListener('mousedown', (e) => startMarkerDrag(e, 'end'));
    endMarker.appendChild(endHandle);
    timelineContent.appendChild(endMarker);
    
    // 範囲ハイライト
    const highlight = document.createElement('div');
    highlight.className = 'export-marker export-range-highlight';
    highlight.style.cssText = `
        position: absolute;
        left: ${range.start * pixelsPerFrame}px;
        top: 0;
        width: ${(range.end - range.start) * pixelsPerFrame}px;
        height: 100%;
        background: rgba(255, 193, 7, 0.1);
        border-left: none;
        border-right: none;
        z-index: 45;
        pointer-events: none;
    `;
    timelineContent.appendChild(highlight);
}

// マーカードラッグ処理
let isDraggingMarker = false;
let draggingMarkerType = null;

function startMarkerDrag(e, type) {
    e.stopPropagation();
    isDraggingMarker = true;
    draggingMarkerType = type;
    
    document.addEventListener('mousemove', handleMarkerDrag);
    document.addEventListener('mouseup', handleMarkerDragEnd);
}

function handleMarkerDrag(e) {
    if (!isDraggingMarker) return;
    
    const timeline = document.getElementById('timeline');
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left + timeline.scrollLeft;
    const pixelsPerFrame = typeof timelinePixelsPerFrame !== 'undefined' ? timelinePixelsPerFrame : 20;
    const frame = Math.max(0, Math.floor(x / pixelsPerFrame));
    
    if (draggingMarkerType === 'start') {
        setExportStartMarker(frame);
    } else {
        setExportEndMarker(frame);
    }
}

function handleMarkerDragEnd() {
    isDraggingMarker = false;
    draggingMarkerType = null;
    
    document.removeEventListener('mousemove', handleMarkerDrag);
    document.removeEventListener('mouseup', handleMarkerDragEnd);
}

// ===== 書き出しダイアログ =====

function showExportDialog() {
    // 既存のダイアログを削除
    const existingDialog = document.getElementById('export-dialog');
    if (existingDialog) existingDialog.remove();
    
    const range = getExportRange();
    const duration = (range.end - range.start) / projectFPS;
    const frameCount = range.end - range.start;
    
    const dialog = document.createElement('div');
    dialog.id = 'export-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    dialog.innerHTML = `
        <div style="
            background: linear-gradient(135deg, var(--chocolate-dark), var(--chocolate-medium));
            border: 3px solid var(--biscuit-dark);
            border-radius: 16px;
            padding: 24px;
            width: 450px;
            max-width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        ">
            <h2 style="color: var(--biscuit-light); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                📤 書き出し設定
            </h2>
            
            <!-- 書き出し範囲 -->
            <div style="
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            ">
                <h4 style="color: var(--biscuit-medium); margin-bottom: 12px;">📍 書き出し範囲</h4>
                <div id="export-marker-info" style="font-size: 13px; margin-bottom: 12px;"></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="setStartMarkerAtCurrentFrame()" class="export-btn-small">
                        ▶ 現在位置を開始
                    </button>
                    <button onclick="setEndMarkerAtCurrentFrame()" class="export-btn-small">
                        ◼ 現在位置を終了
                    </button>
                    <button onclick="clearExportMarkers()" class="export-btn-small" style="background: #666;">
                        🗑️ マーカークリア
                    </button>
                </div>
                <div style="margin-top: 12px; display: flex; gap: 12px;">
                    <label style="font-size: 12px; color: var(--biscuit);">
                        開始: <input type="number" id="export-start-frame" value="${range.start}" min="0" 
                            style="width: 60px; padding: 4px; background: var(--bg-dark); border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;"
                            onchange="setExportStartMarker(parseInt(this.value))">f
                    </label>
                    <label style="font-size: 12px; color: var(--biscuit);">
                        終了: <input type="number" id="export-end-frame" value="${range.end}" min="0"
                            style="width: 60px; padding: 4px; background: var(--bg-dark); border: 1px solid var(--border-color); color: var(--text-light); border-radius: 4px;"
                            onchange="setExportEndMarker(parseInt(this.value))">f
                    </label>
                </div>
            </div>
            
            <!-- 書き出し形式選択 -->
            <div style="
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            ">
                <h4 style="color: var(--biscuit-medium); margin-bottom: 12px;">📁 書き出し形式</h4>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="radio" name="export-format" value="webm" checked style="cursor: pointer;">
                        <span style="font-size: 14px;">🎬 WebM (動画)</span>
                        <span style="font-size: 11px; color: #888;">- 透過対応・軽量</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="radio" name="export-format" value="png" style="cursor: pointer;">
                        <span style="font-size: 14px;">🖼️ 連番PNG (ZIP)</span>
                        <span style="font-size: 11px; color: #888;">- 高品質・透過</span>
                    </label>
                </div>
            </div>
            
            <!-- オプション -->
            <div style="
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            ">
                <h4 style="color: var(--biscuit-medium); margin-bottom: 12px;">⚙️ オプション</h4>
                
                <div style="margin-bottom: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 8px;">
                        <input type="checkbox" id="export-include-audio" checked style="cursor: pointer;">
                        <span style="font-size: 13px;">🔊 音声を含める</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 8px;">
                        <input type="checkbox" id="export-transparent" style="cursor: pointer;">
                        <span style="font-size: 13px;">🔲 背景を透過</span>
                        <span style="font-size: 11px; color: #888;">(WebM/PNG のみ)</span>
                    </label>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 6px; color: var(--biscuit);">
                        解像度:
                    </label>
                    <select id="export-resolution" style="
                        width: 100%;
                        padding: 8px;
                        background: var(--bg-dark);
                        border: 2px solid var(--border-color);
                        color: var(--text-light);
                        border-radius: 4px;
                        cursor: pointer;
                    ">
                        <option value="1920x1080">1920×1080 (Full HD)</option>
                        <option value="1280x720">1280×720 (HD)</option>
                        <option value="960x540">960×540 (Half HD)</option>
                        <option value="640x360">640×360 (SD)</option>
                        <option value="original">キャンバスサイズ (${canvas.width}×${canvas.height})</option>
                    </select>
                </div>
                
                <div id="video-quality-option">
                    <label style="font-size: 12px; display: block; margin-bottom: 6px; color: var(--biscuit);">
                        ビットレート: <span id="export-bitrate-value">8</span> Mbps
                    </label>
                    <input type="range" id="export-bitrate" min="1" max="20" value="8" 
                        style="width: 100%;"
                        oninput="document.getElementById('export-bitrate-value').textContent = this.value">
                </div>
            </div>
            
            <!-- プログレスバー（書き出し中に表示） -->
            <div id="export-progress-container" style="display: none; margin-bottom: 16px;">
                <div style="
                    background: var(--bg-dark);
                    border-radius: 8px;
                    height: 24px;
                    overflow: hidden;
                    border: 2px solid var(--border-color);
                ">
                    <div id="export-progress-bar" style="
                        width: 0%;
                        height: 100%;
                        background: linear-gradient(90deg, var(--accent-gold), var(--accent-orange));
                        transition: width 0.1s;
                    "></div>
                </div>
                <div id="export-progress-text" style="
                    text-align: center;
                    margin-top: 8px;
                    font-size: 12px;
                    color: var(--biscuit);
                ">準備中...</div>
            </div>
            
            <!-- ボタン -->
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button onclick="closeExportDialog()" class="export-btn" style="background: #666;">
                    キャンセル
                </button>
                <button onclick="startExport()" id="export-start-btn" class="export-btn" style="
                    background: linear-gradient(135deg, var(--accent-gold), var(--accent-orange));
                    color: var(--chocolate-dark);
                ">
                    📤 書き出し開始
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // マーカー情報を更新
    updateExportMarkersDisplay();
    
    // 形式変更時の処理
    document.querySelectorAll('input[name="export-format"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const format = document.querySelector('input[name="export-format"]:checked').value;
            const videoQualityOption = document.getElementById('video-quality-option');
            const audioOption = document.getElementById('export-include-audio');
            const transparentOption = document.getElementById('export-transparent');
            
            if (format === 'png') {
                videoQualityOption.style.display = 'none';
                audioOption.disabled = true;
                audioOption.checked = false;
            } else {
                videoQualityOption.style.display = 'block';
                audioOption.disabled = false;
            }
            
            // WebM/PNGは透過対応
            transparentOption.disabled = false;
        });
    });
    
    // 初期状態を設定
    document.querySelector('input[name="export-format"]:checked').dispatchEvent(new Event('change'));
}

function closeExportDialog() {
    const dialog = document.getElementById('export-dialog');
    if (dialog) dialog.remove();
}

// ===== 書き出し処理 =====

async function startExport() {
    if (isExporting) return;
    
    const format = document.querySelector('input[name="export-format"]:checked').value;
    const includeAudio = document.getElementById('export-include-audio').checked;
    const transparent = document.getElementById('export-transparent').checked;
    const resolution = document.getElementById('export-resolution').value;
    const bitrate = parseInt(document.getElementById('export-bitrate').value) * 1000000;
    
    // 解像度をパース
    let exportWidth, exportHeight;
    if (resolution === 'original') {
        exportWidth = canvas.width;
        exportHeight = canvas.height;
    } else {
        const [w, h] = resolution.split('x').map(Number);
        exportWidth = w;
        exportHeight = h;
    }
    
    isExporting = true;
    
    // UIを更新
    const progressContainer = document.getElementById('export-progress-container');
    const startBtn = document.getElementById('export-start-btn');
    progressContainer.style.display = 'block';
    startBtn.disabled = true;
    startBtn.textContent = '書き出し中...';
    
    try {
        if (format === 'png') {
            await exportPngSequence(exportWidth, exportHeight, transparent);
        } else {
            await exportVideo(format, exportWidth, exportHeight, includeAudio, transparent, bitrate);
        }
    } catch (error) {
        console.error('書き出しエラー:', error);
        alert('書き出し中にエラーが発生しました: ' + error.message);
    } finally {
        isExporting = false;
        startBtn.disabled = false;
        startBtn.textContent = '📤 書き出し開始';
        progressContainer.style.display = 'none';
    }
}

// ===== 連番PNG書き出し =====

async function exportPngSequence(width, height, transparent) {
    const range = getExportRange();
    const totalFrames = range.end - range.start;
    
    updateExportProgress(0, '連番PNG生成中...');
    
    // 一時キャンバスを作成
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // JSZipを動的にロード
    if (typeof JSZip === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }
    
    const zip = new JSZip();
    const folder = zip.folder('frames');
    
    // 元の状態を保存
    const originalTime = currentTime;
    const originalPlaying = isPlaying;
    if (isPlaying) {
        togglePlayback();
    }
    
    try {
        for (let i = 0; i <= totalFrames; i++) {
            const frame = range.start + i;
            currentTime = frame / projectFPS;
            
            // キーフレーム補間を適用
            if (typeof applyKeyframeInterpolation === 'function') {
                applyKeyframeInterpolation();
            }
            
            // フレームをレンダリング
            renderFrameToCanvas(tempCanvas, tempCtx, transparent);
            
            // PNGとして保存
            const dataUrl = tempCanvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];
            const fileName = `frame_${String(i).padStart(5, '0')}.png`;
            folder.file(fileName, base64Data, { base64: true });
            
            updateExportProgress((i / totalFrames) * 100, `フレーム ${i + 1} / ${totalFrames + 1}`);
            
            // UIの応答性を維持
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        updateExportProgress(95, 'ZIPファイル生成中...');
        
        // ZIPを生成してダウンロード
        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, `animation_${Date.now()}.zip`);
        
        updateExportProgress(100, '完了！');
        
    } finally {
        // 元の状態に戻す
        currentTime = originalTime;
        if (typeof applyKeyframeInterpolation === 'function') {
            applyKeyframeInterpolation();
        }
        render();
    }
}

// ===== 動画書き出し =====

async function exportVideo(format, width, height, includeAudio, transparent, bitrate) {
    // WebM書き出し（MediaRecorder使用）
    await exportWebM(width, height, includeAudio, transparent, bitrate);
}

// ===== WebM書き出し（MediaRecorder使用） =====

// サポートされているmimeTypeを検出
function getSupportedMimeType(preferTransparent) {
    // 優先順位順にmimeTypeを試す
    const mimeTypes = preferTransparent ? [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
    ] : [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm',
        'video/mp4',
    ];
    
    for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            console.log('✅ Supported mimeType:', mimeType);
            return mimeType;
        }
    }
    
    return null;
}

async function exportWebM(width, height, includeAudio, transparent, bitrate) {
    const range = getExportRange();
    const totalFrames = range.end - range.start;
    
    updateExportProgress(0, 'WebM生成準備中...');
    
    // 一時キャンバスを作成
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // MediaRecorderのサポートを確認（柔軟に検出）
    const mimeType = getSupportedMimeType(transparent);
    if (!mimeType) {
        throw new Error('このブラウザは動画書き出しをサポートしていません。連番PNGをお使いください。');
    }
    
    // 透過が必要だがvp9がサポートされていない場合の警告
    if (transparent && !mimeType.includes('vp9')) {
        console.warn('⚠️ VP9がサポートされていないため、透過出力が正しく動作しない可能性があります');
    }
    
    // キャンバスからストリームを取得
    const stream = tempCanvas.captureStream(projectFPS);
    
    // 音声トラックを追加（音声を含める場合）
    let audioDestination = null;
    if (includeAudio && audioContext) {
        audioDestination = audioContext.createMediaStreamDestination();
        masterGainNode.connect(audioDestination);
        const audioTracks = audioDestination.stream.getAudioTracks();
        if (audioTracks.length > 0) {
            stream.addTrack(audioTracks[0]);
        }
    }
    
    // MediaRecorderを設定
    const recorderOptions = { videoBitsPerSecond: bitrate };
    // mimeTypeを設定（サポートされている場合のみ）
    if (mimeType) {
        recorderOptions.mimeType = mimeType;
    }
    
    const recorder = new MediaRecorder(stream, recorderOptions);
    
    const chunks = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            chunks.push(e.data);
        }
    };
    
    // 元の状態を保存
    const originalTime = currentTime;
    const originalPlaying = isPlaying;
    if (isPlaying) {
        togglePlayback();
    }
    
    return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
            try {
                updateExportProgress(95, 'ファイル生成中...');
                
                // Blobを作成（mimeTypeに応じた拡張子）
                const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
                const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
                downloadBlob(blob, `animation_${Date.now()}.${extension}`);
                
                updateExportProgress(100, '完了！');
                
                // 元の状態に戻す
                currentTime = originalTime;
                if (typeof applyKeyframeInterpolation === 'function') {
                    applyKeyframeInterpolation();
                }
                render();
                
                // 音声接続を解除
                if (audioDestination) {
                    masterGainNode.disconnect(audioDestination);
                }
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        
        recorder.onerror = (e) => {
            reject(new Error('録画エラー: ' + e.error));
        };
        
        // 録画開始
        recorder.start();
        
        // フレームごとにレンダリング
        let frameIndex = 0;
        const frameInterval = 1000 / projectFPS;
        
        const renderNextFrame = async () => {
            if (frameIndex > totalFrames) {
                recorder.stop();
                return;
            }
            
            const frame = range.start + frameIndex;
            currentTime = frame / projectFPS;
            
            // キーフレーム補間を適用
            if (typeof applyKeyframeInterpolation === 'function') {
                applyKeyframeInterpolation();
            }
            
            // フレームをレンダリング
            renderFrameToCanvas(tempCanvas, tempCtx, transparent);
            
            updateExportProgress((frameIndex / totalFrames) * 90, `フレーム ${frameIndex + 1} / ${totalFrames + 1}`);
            
            frameIndex++;
            
            // 次のフレームをスケジュール
            setTimeout(renderNextFrame, frameInterval);
        };
        
        // 音声再生を開始（音声を含める場合）
        if (includeAudio) {
            currentTime = range.start / projectFPS;
            startAudioPlayback(currentTime);
        }
        
        renderNextFrame();
    });
}

// ===== ユーティリティ関数 =====

// フレームを一時キャンバスにレンダリング
function renderFrameToCanvas(tempCanvas, tempCtx, transparent) {
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    if (!transparent) {
        tempCtx.fillStyle = '#2a2a2a';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
    
    // メインキャンバスの内容をコピー
    render(); // メインキャンバスを更新
    
    // スケーリングしてコピー
    const scaleX = tempCanvas.width / canvas.width;
    const scaleY = tempCanvas.height / canvas.height;
    const scale = Math.min(scaleX, scaleY);
    
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;
    const offsetX = (tempCanvas.width - drawWidth) / 2;
    const offsetY = (tempCanvas.height - drawHeight) / 2;
    
    if (transparent) {
        // 透過の場合、背景なしでキャンバスをコピー
        // メインキャンバスを一時的に透過で再レンダリング
        const originalFillStyle = ctx.fillStyle;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 背景を描画せずにレイヤーのみ描画
        renderLayersOnly();
        tempCtx.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);
        // 元に戻す
        render();
    } else {
        tempCtx.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);
    }
}

// レイヤーのみを描画（背景なし）
function renderLayersOnly() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const localTime = currentTime;
    
    layers.forEach(layer => {
        if (!layer.visible) return;
        
        if (layer.type === 'folder') {
            if (layer.windSwayEnabled) {
                drawFolderWithWindSway(layer, localTime);
            }
            return;
        }
        
        const parent = layers.find(l => l.id === layer.parentLayerId);
        if (parent && parent.type === 'folder' && parent.windSwayEnabled) {
            return;
        }
        
        if (layer.type === 'lipsync') {
            drawLipSyncLayer(layer, localTime);
            return;
        }
        
        if (layer.type === 'blink') {
            drawBlinkLayer(layer, localTime);
            return;
        }
        
        if (layer.type === 'bounce') {
            drawBounceLayer(layer, localTime);
            return;
        }
        
        if (layer.type === 'puppet') {
            drawPuppetLayer(layer, localTime);
            return;
        }
        
        if (layer.type === 'audio') {
            return;
        }
        
        // 通常のレイヤー描画
        if (layer.img) {
            ctx.save();
            ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
            ctx.globalCompositeOperation = layer.blendMode || 'source-over';
            
            applyParentTransform(layer);
            ctx.translate(layer.x, layer.y);
            
            const anchorOffsetX = layer.anchorX * layer.width;
            const anchorOffsetY = layer.anchorY * layer.height;
            
            ctx.translate(anchorOffsetX - layer.width / 2, anchorOffsetY - layer.height / 2);
            ctx.rotate(layer.rotation * Math.PI / 180);
            ctx.scale(layer.scale, layer.scale);
            
            ctx.drawImage(layer.img, -anchorOffsetX, -anchorOffsetY, layer.width, layer.height);
            ctx.restore();
        }
    });
}

// プログレス更新
function updateExportProgress(percent, text) {
    const progressBar = document.getElementById('export-progress-bar');
    const progressText = document.getElementById('export-progress-text');
    
    if (progressBar) {
        progressBar.style.width = percent + '%';
    }
    if (progressText) {
        progressText.textContent = text;
    }
}

// スクリプトを動的にロード
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Blobをダウンロード
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== ループ再生機能 =====

let loopPlayback = false;

function setLoopPlayback(enabled) {
    loopPlayback = enabled;
    
    // チェックボックスの状態を同期
    const checkbox = document.getElementById('loop-playback-checkbox');
    if (checkbox && checkbox.checked !== enabled) {
        checkbox.checked = enabled;
    }
}

// ループ再生のチェック（animationLoopから呼び出される）
function checkLoopPlayback() {
    if (!loopPlayback) return false;
    
    const range = getExportRange();
    const currentFrame = Math.floor(currentTime * projectFPS);
    
    // 終了フレームを超えたら先頭に戻る
    if (currentFrame >= range.end) {
        currentTime = range.start / projectFPS;
        
        // 音声も先頭から再開
        if (typeof stopAudioPlayback === 'function') {
            stopAudioPlayback();
        }
        if (typeof startAudioPlayback === 'function') {
            startAudioPlayback(currentTime);
        }
        
        return true;
    }
    
    return false;
}

// 書き出しUIのCSS追加用
function addExportStyles() {
    if (document.getElementById('export-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'export-styles';
    style.textContent = `
        .export-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            transition: all 0.2s;
        }
        
        .export-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .export-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .export-btn-small {
            padding: 6px 12px;
            background: var(--chocolate-light);
            color: var(--biscuit-light);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        }
        
        .export-btn-small:hover {
            background: var(--biscuit-dark);
        }
    `;
    document.head.appendChild(style);
}

// 初期化時にスタイルを追加
addExportStyles();
