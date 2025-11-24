/**
 * ⭐ Starlit Puppet Editor v1.12.0
 * アニメーション・再生機能（音声同期対応・ループ再生対応）
 */

// ===== 再生/停止 =====
function togglePlayback() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('play-btn');
    
    if (isPlaying) {
        btn.textContent = '⏸️ 停止';
        lastFrameTime = performance.now();
        
        // 音声再生を開始
        if (typeof syncAudioWithPlayback === 'function') {
            syncAudioWithPlayback(true, currentTime);
        }
        
        animationFrameId = requestAnimationFrame(animationLoop);
    } else {
        btn.textContent = '▶️ 再生';
        
        // 音声再生を停止
        if (typeof syncAudioWithPlayback === 'function') {
            syncAudioWithPlayback(false, currentTime);
        }
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
}

// ===== 停止（先頭に戻る） =====
function stopPlayback() {
    // 再生中なら停止
    if (isPlaying) {
        isPlaying = false;
        const btn = document.getElementById('play-btn');
        btn.textContent = '▶️ 再生';
        
        // 音声再生を停止
        if (typeof syncAudioWithPlayback === 'function') {
            syncAudioWithPlayback(false, currentTime);
        }
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
    
    // 先頭に戻す
    currentTime = 0;
    
    // キーフレーム補間を適用
    if (typeof applyKeyframeInterpolation === 'function') {
        applyKeyframeInterpolation();
    }
    
    // タイムラインを更新
    if (typeof updatePlayhead === 'function') {
        updatePlayhead();
    }
    
    render();
}

// ===== アニメーションループ =====
function animationLoop(timestamp) {
    if (!isPlaying) return;
    
    const deltaTime = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;
    
    currentTime += deltaTime;
    
    // ループ再生チェック
    if (typeof checkLoopPlayback === 'function') {
        checkLoopPlayback();
    }
    
    // キーフレーム補間を適用
    if (typeof applyKeyframeInterpolation === 'function') {
        applyKeyframeInterpolation();
    }
    
    // タイムラインを更新
    if (typeof updatePlayhead === 'function') {
        updatePlayhead();
    }
    
    render();
    
    animationFrameId = requestAnimationFrame(animationLoop);
}
