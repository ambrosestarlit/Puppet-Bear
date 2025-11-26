/**
 * 🐻 Puppet Bear - プロジェクト保存/読み込み機能
 * 
 * 機能:
 * - プロジェクトをZIPファイルとして保存（JSON + 素材画像）
 * - ZIPファイルからプロジェクトを復元
 * - 口パク・まばたきレイヤーの連番画像も保存/復元
 * - 音声ファイルも保存/復元
 */

// ===== プロジェクト保存 =====
async function saveProject() {
    if (typeof JSZip === 'undefined') {
        alert('JSZipライブラリが読み込まれていません。ネットワーク接続を確認してください。');
        return;
    }
    
    // 進捗表示
    const progressOverlay = createProgressOverlay('プロジェクトを保存中...');
    document.body.appendChild(progressOverlay);
    
    try {
        const zip = new JSZip();
        const assetsFolder = zip.folder('assets');
        const audioFolder = zip.folder('audio');
        
        // レイヤーデータを準備（画像参照をファイル名に変換）
        const layerData = [];
        let assetIndex = 0;
        let audioIndex = 0;
        
        for (const layer of layers) {
            const layerCopy = { ...layer };
            
            // 画像レイヤーの場合
            if (layer.img) {
                const assetName = `asset_${assetIndex}_${sanitizeFilename(layer.name)}.png`;
                const imageData = await imageToBase64(layer.img);
                assetsFolder.file(assetName, imageData.split(',')[1], { base64: true });
                layerCopy.assetFile = assetName;
                delete layerCopy.img;
                assetIndex++;
            }
            
            // 口パク・まばたきレイヤーの連番画像
            if (layer.sequenceImages && layer.sequenceImages.length > 0) {
                const sequenceFiles = [];
                for (let i = 0; i < layer.sequenceImages.length; i++) {
                    const seqName = `asset_${assetIndex}_${sanitizeFilename(layer.name)}_seq${i.toString().padStart(3, '0')}.png`;
                    const imageData = await imageToBase64(layer.sequenceImages[i]);
                    assetsFolder.file(seqName, imageData.split(',')[1], { base64: true });
                    sequenceFiles.push(seqName);
                    assetIndex++;
                }
                layerCopy.sequenceFiles = sequenceFiles;
                delete layerCopy.sequenceImages;
            }
            
            // 音声レイヤーの音声データ
            if (layer.type === 'audio' && layer.audioClips) {
                const audioCopies = [];
                for (const clip of layer.audioClips) {
                    const clipCopy = { ...clip };
                    if (clip.audioBuffer) {
                        const audioName = `audio_${audioIndex}_${sanitizeFilename(clip.name || 'clip')}.wav`;
                        const wavData = audioBufferToWav(clip.audioBuffer);
                        audioFolder.file(audioName, wavData);
                        clipCopy.audioFile = audioName;
                        delete clipCopy.audioBuffer;
                        delete clipCopy.audioElement;
                        audioIndex++;
                    }
                    audioCopies.push(clipCopy);
                }
                layerCopy.audioClips = audioCopies;
            }
            
            layerData.push(layerCopy);
        }
        
        // プロジェクト設定
        const projectData = {
            version: '1.0.0',
            appVersion: 'Puppet Bear v1.15.0',
            createdAt: new Date().toISOString(),
            settings: {
                fps: projectFPS,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height
            },
            layers: layerData,
            nextLayerId: nextLayerId
        };
        
        // JSONを保存
        zip.file('project.json', JSON.stringify(projectData, null, 2));
        
        // ZIPを生成してダウンロード
        updateProgressOverlay(progressOverlay, 'ZIPファイルを生成中...');
        
        const content = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            updateProgressOverlay(progressOverlay, `圧縮中... ${Math.round(metadata.percent)}%`);
        });
        
        // ダウンロード
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `puppet-bear-project_${timestamp}.pbear`;
        
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        document.body.removeChild(progressOverlay);
        console.log('✅ プロジェクトを保存しました:', filename);
        
    } catch (error) {
        console.error('❌ プロジェクト保存エラー:', error);
        document.body.removeChild(progressOverlay);
        alert('プロジェクトの保存に失敗しました: ' + error.message);
    }
}

// ===== プロジェクト読み込みダイアログ =====
function loadProjectDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pbear,.zip';
    input.onchange = async (e) => {
        if (e.target.files[0]) {
            await loadProject(e.target.files[0]);
        }
    };
    input.click();
}

// ===== プロジェクト読み込み =====
async function loadProject(file) {
    if (typeof JSZip === 'undefined') {
        alert('JSZipライブラリが読み込まれていません。ネットワーク接続を確認してください。');
        return;
    }
    
    // 進捗表示
    const progressOverlay = createProgressOverlay('プロジェクトを読み込み中...');
    document.body.appendChild(progressOverlay);
    
    try {
        const zip = await JSZip.loadAsync(file);
        
        // project.jsonを読み込む
        const projectJson = await zip.file('project.json').async('string');
        const projectData = JSON.parse(projectJson);
        
        console.log('📦 プロジェクトデータ:', projectData);
        
        // 既存のレイヤーをクリア
        layers = [];
        selectedLayerIds = [];
        
        // 設定を復元
        if (projectData.settings) {
            projectFPS = projectData.settings.fps || 24;
            if (projectData.settings.canvasWidth) canvas.width = projectData.settings.canvasWidth;
            if (projectData.settings.canvasHeight) canvas.height = projectData.settings.canvasHeight;
            
            // FPSボタンの表示を更新
            document.getElementById('fps-24').classList.toggle('active', projectFPS === 24);
            document.getElementById('fps-30').classList.toggle('active', projectFPS === 30);
        }
        
        nextLayerId = projectData.nextLayerId || 1;
        
        // レイヤーを復元
        const totalLayers = projectData.layers.length;
        let loadedLayers = 0;
        
        for (const layerData of projectData.layers) {
            updateProgressOverlay(progressOverlay, `レイヤーを読み込み中... (${loadedLayers + 1}/${totalLayers})`);
            
            const layer = { ...layerData };
            
            // 画像を復元
            if (layerData.assetFile) {
                const imageFile = zip.file('assets/' + layerData.assetFile);
                if (imageFile) {
                    const imageData = await imageFile.async('base64');
                    layer.img = await base64ToImage('data:image/png;base64,' + imageData);
                }
                delete layer.assetFile;
            }
            
            // 連番画像を復元
            if (layerData.sequenceFiles && layerData.sequenceFiles.length > 0) {
                layer.sequenceImages = [];
                for (const seqFile of layerData.sequenceFiles) {
                    const imageFile = zip.file('assets/' + seqFile);
                    if (imageFile) {
                        const imageData = await imageFile.async('base64');
                        const img = await base64ToImage('data:image/png;base64,' + imageData);
                        layer.sequenceImages.push(img);
                    }
                }
                delete layer.sequenceFiles;
            }
            
            // 音声を復元
            if (layer.type === 'audio' && layerData.audioClips) {
                const restoredClips = [];
                for (const clipData of layerData.audioClips) {
                    const clip = { ...clipData };
                    if (clipData.audioFile) {
                        const audioFile = zip.file('audio/' + clipData.audioFile);
                        if (audioFile) {
                            const audioData = await audioFile.async('arraybuffer');
                            clip.audioBuffer = await decodeAudioData(audioData);
                        }
                        delete clip.audioFile;
                    }
                    restoredClips.push(clip);
                }
                layer.audioClips = restoredClips;
            }
            
            layers.push(layer);
            loadedLayers++;
        }
        
        // UI更新
        updateLayerList();
        updateTimeline();
        render();
        
        document.body.removeChild(progressOverlay);
        console.log('✅ プロジェクトを読み込みました');
        
    } catch (error) {
        console.error('❌ プロジェクト読み込みエラー:', error);
        document.body.removeChild(progressOverlay);
        alert('プロジェクトの読み込みに失敗しました: ' + error.message);
    }
}

// ===== ヘルパー関数 =====

// 画像をBase64に変換
function imageToBase64(img) {
    return new Promise((resolve) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });
        tempCtx.drawImage(img, 0, 0);
        resolve(tempCanvas.toDataURL('image/png'));
    });
}

// Base64から画像を復元
function base64ToImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

// ファイル名をサニタイズ
function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_').slice(0, 50);
}

// AudioBufferをWAVに変換
function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const samples = audioBuffer.length;
    const dataSize = samples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // WAVヘッダー
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // オーディオデータ
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }
    
    let offset = 44;
    for (let i = 0; i < samples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }
    
    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// 音声データをデコード
async function decodeAudioData(arrayBuffer) {
    // AudioContextを取得または作成
    let audioCtx;
    if (typeof globalAudioContext !== 'undefined' && globalAudioContext) {
        audioCtx = globalAudioContext;
    } else {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
}

// 進捗オーバーレイを作成
function createProgressOverlay(message) {
    const overlay = document.createElement('div');
    overlay.className = 'project-progress-overlay';
    overlay.innerHTML = `
        <div class="project-progress-dialog">
            <div class="project-progress-spinner"></div>
            <p class="project-progress-message">${message}</p>
        </div>
    `;
    return overlay;
}

// 進捗メッセージを更新
function updateProgressOverlay(overlay, message) {
    const msgEl = overlay.querySelector('.project-progress-message');
    if (msgEl) {
        msgEl.textContent = message;
    }
}

console.log('💾 プロジェクト保存/読み込み機能が読み込まれました');
