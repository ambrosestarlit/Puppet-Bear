// ===== Wiggle振動エフェクト =====
// After Effects の wiggle(frequency, amplitude) 風の振動アニメーション

// シード付きランダム関数
function seededRandom(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}

// Wiggle値を計算（スムーズ補間）
function calculateWiggleValue(time, frequency, amplitude, seed) {
    if (amplitude === 0) return 0;
    
    // 時間をサンプリングポイントに変換
    const sampleTime = time * frequency;
    const sampleIndex = Math.floor(sampleTime);
    const t = sampleTime - sampleIndex;
    
    // 前後のランダム値を取得（-1〜1の範囲）
    const v0 = seededRandom(seed + sampleIndex) * 2 - 1;
    const v1 = seededRandom(seed + sampleIndex + 1) * 2 - 1;
    
    // スムーズな補間（ease in-out cubic）
    const smoothT = t * t * (3 - 2 * t);
    
    return amplitude * (v0 + (v1 - v0) * smoothT);
}

// Wiggleオフセットを取得
function getWiggleOffset(layer, currentTime) {
    if (!layer.wiggleEnabled) return { x: 0, y: 0 };
    if (layer.wiggleStartTime === undefined || layer.wiggleStartTime === null) return { x: 0, y: 0 };
    if (currentTime < layer.wiggleStartTime) return { x: 0, y: 0 };
    
    const params = layer.wiggleParams || getDefaultWiggleParams();
    const elapsed = currentTime - layer.wiggleStartTime;
    
    // シード値（レイヤーIDベースでユニークに）
    const seedX = layer.id * 1000;
    const seedY = layer.id * 1000 + 500;
    
    // X, Y それぞれのオフセットを計算
    let offsetX = calculateWiggleValue(elapsed, params.speed, params.amplitudeX, seedX);
    let offsetY = calculateWiggleValue(elapsed, params.speed, params.amplitudeY, seedY);
    
    // ランダム減衰が有効な場合
    if (params.decayEnabled) {
        // 減衰係数を計算（時間とともに0に近づく）
        const decayRate = params.decayRate || 0.5;
        const decayFactor = Math.exp(-elapsed * decayRate);
        
        // さらにランダムな減衰を加える
        const randomDecay = 0.8 + seededRandom(layer.id + Math.floor(elapsed * 2)) * 0.4;
        
        offsetX *= decayFactor * randomDecay;
        offsetY *= decayFactor * randomDecay;
    }
    
    return { x: offsetX, y: offsetY };
}

// デフォルトのWiggleパラメータ
function getDefaultWiggleParams() {
    return {
        speed: 10,          // 振動スピード（Hz相当）
        amplitudeX: 5,      // X方向の振幅（ピクセル）
        amplitudeY: 5,      // Y方向の振幅（ピクセル）
        decayEnabled: false, // ランダム減衰
        decayRate: 0.5      // 減衰率
    };
}

// Wiggle開始キーフレームを設定
function setWiggleStartTime(layerId, time) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    layer.wiggleEnabled = true;
    layer.wiggleStartTime = time !== undefined ? time : currentTime;
    
    if (!layer.wiggleParams) {
        layer.wiggleParams = getDefaultWiggleParams();
    }
    
    updatePropertiesPanel();
    updateTimeline();
    
    if (typeof saveHistory === 'function') {
        saveHistory();
    }
    
    console.log(`🎲 Wiggle開始: ${layer.name} @ ${layer.wiggleStartTime.toFixed(2)}秒`);
}

// Wiggleを停止
function stopWiggle(layerId) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    layer.wiggleEnabled = false;
    
    updatePropertiesPanel();
    updateTimeline();
    
    if (typeof saveHistory === 'function') {
        saveHistory();
    }
    
    console.log(`🎲 Wiggle停止: ${layer.name}`);
}

// Wiggleパラメータを更新
function updateWiggleParam(layerId, paramName, value) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    if (!layer.wiggleParams) {
        layer.wiggleParams = getDefaultWiggleParams();
    }
    
    layer.wiggleParams[paramName] = value;
    
    // リアルタイムプレビューのために即座に再描画
    render();
}

// プロパティパネル用のWiggle UI生成
function generateWiggleUI(layer) {
    // 口パク・まばたきは除外
    if (layer.type === 'lipsync' || layer.type === 'blink' || layer.type === 'audio') {
        return '';
    }
    
    const params = layer.wiggleParams || getDefaultWiggleParams();
    const isEnabled = layer.wiggleEnabled || false;
    const startTime = layer.wiggleStartTime !== undefined ? layer.wiggleStartTime.toFixed(2) : '--';
    
    return `
        <div class="property-group">
            <h4>🎲 振動エフェクト (Wiggle)</h4>
            
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} 
                        onchange="toggleWiggle(${layer.id}, this.checked)"
                        style="width: 18px; height: 18px; accent-color: var(--accent-gold);">
                    <span>振動を有効化</span>
                </label>
            </div>
            
            ${isEnabled ? `
                <div style="margin-bottom: 8px; padding: 6px; background: rgba(255, 215, 0, 0.1); border-radius: 4px; font-size: 11px;">
                    ⏱️ 開始時刻: ${startTime}秒
                    <button onclick="setWiggleStartTime(${layer.id})" 
                        style="margin-left: 8px; padding: 2px 8px; background: var(--accent-gold); color: var(--chocolate-dark); border: none; border-radius: 3px; cursor: pointer; font-size: 10px;">
                        現在時刻にセット
                    </button>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 11px; display: block; margin-bottom: 4px;">
                        振動スピード: <span id="wiggleSpeedValue">${params.speed}</span> Hz
                    </label>
                    <input type="range" class="property-slider" value="${params.speed}" 
                        min="1" max="60" step="1"
                        oninput="document.getElementById('wiggleSpeedValue').textContent = this.value; updateWiggleParam(${layer.id}, 'speed', parseFloat(this.value))">
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 11px; display: block; margin-bottom: 4px;">
                        X方向の揺れ: <span id="wiggleAmpXValue">${params.amplitudeX}</span> px
                    </label>
                    <input type="range" class="property-slider" value="${params.amplitudeX}" 
                        min="0" max="100" step="1"
                        oninput="document.getElementById('wiggleAmpXValue').textContent = this.value; updateWiggleParam(${layer.id}, 'amplitudeX', parseFloat(this.value))">
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 11px; display: block; margin-bottom: 4px;">
                        Y方向の揺れ: <span id="wiggleAmpYValue">${params.amplitudeY}</span> px
                    </label>
                    <input type="range" class="property-slider" value="${params.amplitudeY}" 
                        min="0" max="100" step="1"
                        oninput="document.getElementById('wiggleAmpYValue').textContent = this.value; updateWiggleParam(${layer.id}, 'amplitudeY', parseFloat(this.value))">
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" ${params.decayEnabled ? 'checked' : ''} 
                            onchange="updateWiggleParam(${layer.id}, 'decayEnabled', this.checked)"
                            style="width: 16px; height: 16px; accent-color: var(--accent-gold);">
                        <span style="font-size: 11px;">ランダム減衰</span>
                    </label>
                </div>
                
                ${params.decayEnabled ? `
                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">
                            減衰速度: <span id="wiggleDecayValue">${params.decayRate || 0.5}</span>
                        </label>
                        <input type="range" class="property-slider" value="${params.decayRate || 0.5}" 
                            min="0.1" max="3" step="0.1"
                            oninput="document.getElementById('wiggleDecayValue').textContent = this.value; updateWiggleParam(${layer.id}, 'decayRate', parseFloat(this.value))">
                        <div style="font-size: 10px; color: var(--biscuit); margin-top: 2px;">
                            小さいほどゆっくり減衰
                        </div>
                    </div>
                ` : ''}
                
                <div style="background: rgba(255, 215, 0, 0.15); padding: 8px; border-radius: 4px; font-size: 10px; line-height: 1.4; color: var(--biscuit-light);">
                    💡 AE の wiggle(speed, amplitude) 風の振動<br>
                    📌 開始時刻以降から振動が適用されます
                </div>
            ` : `
                <div style="font-size: 11px; color: var(--biscuit); padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                    チェックを入れると振動エフェクトが有効になります
                </div>
            `}
        </div>
    `;
}

// Wiggleの有効/無効を切り替え
function toggleWiggle(layerId, enabled) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    if (enabled) {
        setWiggleStartTime(layerId, currentTime);
    } else {
        stopWiggle(layerId);
    }
}

console.log('🎲 Wiggle振動エフェクト読み込み完了');
