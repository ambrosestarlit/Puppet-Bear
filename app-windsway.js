/**
 * ⭐ Starlit Puppet Editor v1.8.7
 * 風揺れエフェクト - 変形曲線を滑らか化 + モード競合修正
 * - メッシュ分割数を増やして変形を滑らかに
 * - smoothstep/smootherstep補間を実装
 * - ピンの影響範囲をより滑らかに
 * - アンカーポイントからの減衰を自然に
 * - ピンモードとアンカー設定モードの競合を修正
 */

// ===== WebGL関連 =====
let windShakeCanvas = null;
let windShakeGL = null;
let windShakeProgram = null;
let windShakeProgramInfo = null;

// ===== ピンモード =====
let pinMode = false;
let pinRange = 20;
let pinElements = [];
let showPins = true; // ピンの表示/非表示フラグ

// ===== デフォルトパラメータ =====
function getDefaultWindSwayParams() {
    return {
        divisions: 30, // より滑らかな変形のため分割数を増やす
        angle: 30,
        period: 2.0,
        phaseShift: 90,
        center: 0,
        topFixed: 10,
        bottomFixed: 10,
        fromBottom: false,
        randomSwing: true,
        randomPattern: 5,
        seed: 12345,
        pins: []
    };
}

// ===== プリセット =====
function getWindSwayPresets() {
    return {
        gentle_breeze: {
            name: '優しい風',
            divisions: 25, angle: 15, period: 3.0, phaseShift: 90, center: 0,
            topFixed: 10, bottomFixed: 10, fromBottom: false, randomSwing: false,
            randomPattern: 0, seed: 12345
        },
        moderate_wind: {
            name: '普通の風',
            divisions: 30, angle: 30, period: 2.0, phaseShift: 90, center: 0,
            topFixed: 10, bottomFixed: 10, fromBottom: false, randomSwing: true,
            randomPattern: 5, seed: 12345
        },
        strong_wind: {
            name: '強い風',
            divisions: 35, angle: 60, period: 1.5, phaseShift: 120, center: 15,
            topFixed: 15, bottomFixed: 5, fromBottom: false, randomSwing: true,
            randomPattern: 10, seed: 12345
        },
        flag: {
            name: '旗',
            divisions: 40, angle: 45, period: 1.2, phaseShift: 180, center: 0,
            topFixed: 0, bottomFixed: 0, fromBottom: false, randomSwing: true,
            randomPattern: 15, seed: 12345
        },
        curtain: {
            name: 'カーテン',
            divisions: 45, angle: 25, period: 2.5, phaseShift: 120, center: 0,
            topFixed: 5, bottomFixed: 0, fromBottom: false, randomSwing: true,
            randomPattern: 8, seed: 12345
        },
        underwater: {
            name: '水中',
            divisions: 35, angle: 20, period: 4.0, phaseShift: 60, center: 0,
            topFixed: 15, bottomFixed: 15, fromBottom: false, randomSwing: true,
            randomPattern: 3, seed: 12345
        }
    };
}

// ===== WebGL初期化 =====
function initWindShakeWebGL() {
    if (!windShakeCanvas) {
        windShakeCanvas = document.createElement('canvas');
        windShakeGL = windShakeCanvas.getContext('webgl', { 
            premultipliedAlpha: false, alpha: true 
        });
    }
    
    const gl = windShakeGL;
    const vs = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }
    `;
    const fs = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        void main() {
            gl_FragColor = texture2D(u_image, v_texCoord);
        }
    `;
    
    const createShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };
    
    const vertexShader = createShader(gl.VERTEX_SHADER, vs);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fs);
    windShakeProgram = gl.createProgram();
    gl.attachShader(windShakeProgram, vertexShader);
    gl.attachShader(windShakeProgram, fragmentShader);
    gl.linkProgram(windShakeProgram);
    
    windShakeProgramInfo = {
        attribLocations: {
            position: gl.getAttribLocation(windShakeProgram, 'a_position'),
            texCoord: gl.getAttribLocation(windShakeProgram, 'a_texCoord'),
        },
        uniformLocations: {
            image: gl.getUniformLocation(windShakeProgram, 'u_image'),
        },
    };
}

// ===== ランダム値生成（元のコードと同じ） =====
function getRandomValue(n, baseSeed, pattern) {
    const seed = Math.abs(10 + pattern) + n;
    const x = Math.sin(seed * baseSeed) * 10000;
    return (x - Math.floor(x));
}

// ===== キュービック補間（元のコードと同じ） =====
function cubicInterpolation(t, p0, p1, p2, p3) {
    const t2 = t * t;
    const t3 = t2 * t;
    const a0 = p3 - p2 - p0 + p1;
    const a1 = p0 - p1 - a0;
    const a2 = p2 - p0;
    const a3 = p1;
    return a0 * t3 + a1 * t2 + a2 * t + a3;
}

// ===== Smoothstep補間（より滑らかな変形用） =====
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ===== Smootherstep補間（さらに滑らかな変形用） =====
function smootherstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// ===== Cosine補間（最も滑らかな変形用） =====
function cosineInterpolation(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return (1 - Math.cos(t * Math.PI)) * 0.5;
}

// ===== 風揺れメッシュ生成（元のコードと完全一致） =====
function createWindShakeMeshWithBounds(ws, width, height, t, anchorX, anchorY) {
    let N = Math.floor(ws.divisions);
    if (N < 1) N = 1;
    if (N > 50) N = 50;
    const M = 8; // 固定
    
    const F = Math.PI * ws.angle / 180;
    const dt = ws.period;
    const c = 2 * Math.PI / dt;
    const d = 2 * ws.phaseShift * Math.PI / 180;
    const CNT = ws.center * Math.PI / 180;
    
    // アンカーポイントを固定点として使用
    const anchorYPos = anchorY; // 0-1の範囲
    
    // ランダム揺れ
    let currentF = F;
    if (ws.randomSwing) {
        const s = t / ws.period;
        const n1 = Math.floor(s);
        const frac = s - n1;
        const f0 = getRandomValue(n1 - 1, ws.seed, ws.randomPattern) * F;
        const f1 = getRandomValue(n1, ws.seed, ws.randomPattern) * F;
        const f2 = getRandomValue(n1 + 1, ws.seed, ws.randomPattern) * F;
        const f3 = getRandomValue(n1 + 2, ws.seed, ws.randomPattern) * F;
        currentF = cubicInterpolation(frac, f0, f1, f2, f3);
    }
    
    // 中心線計算（アンカーポイントから上下に分けて計算）
    const centerX = [], centerY = [];
    
    // アンカーポイントの位置（中心を0とした座標系）
    const anchorYInMesh = (anchorYPos - 0.5) * height;
    
    for (let i = 0; i <= N; i++) {
        const ratio = i / N;
        const yInTexture = ratio; // テクスチャ座標系（0-1）
        
        // ピンの影響
        let pinMultiplier = 1.0;
        if (ws.pins && ws.pins.length > 0) {
            let minMultiplier = 1.0;
            for (const pin of ws.pins) {
                const pinPos = pin.position / 100;
                const distance = Math.abs(ratio - pinPos);
                const range = pin.range / 100;
                if (distance < range) {
                    const normalizedDist = distance / range;
                    // smootherstepを使用してより滑らかな減衰を実現
                    const multiplier = smootherstep(0, 1, normalizedDist);
                    minMultiplier = Math.min(minMultiplier, multiplier);
                }
            }
            pinMultiplier = minMultiplier;
        }
        
        // アンカーポイントからの距離に応じて揺れの強さを計算
        let swayStrength;
        if (yInTexture <= anchorYPos) {
            // アンカーより上
            const distanceFromAnchor = anchorYPos - yInTexture;
            const linearStrength = distanceFromAnchor / anchorYPos; // 0-1
            // smoothstepを適用してより自然な減衰に
            swayStrength = smoothstep(0, 1, linearStrength);
        } else {
            // アンカーより下
            const distanceFromAnchor = yInTexture - anchorYPos;
            const linearStrength = distanceFromAnchor / (1 - anchorYPos); // 0-1
            // smoothstepを適用してより自然な減衰に
            swayStrength = smoothstep(0, 1, linearStrength);
        }
        
        // 揺れの計算
        const Si = (currentF * Math.sin(c * t - i * d / N) + CNT) * swayStrength * pinMultiplier;
        
        // X座標の計算（前の点からの相対位置）
        if (i === 0) {
            centerX[0] = 0;
        } else {
            const segmentLength = height / N;
            centerX[i] = centerX[i - 1] + Math.sin(Si) * segmentLength;
        }
        
        // Y座標（中心を0とした座標系）
        centerY[i] = (ratio - 0.5) * height;
    }
    
    // メッシュグリッド生成
    const worldPositions = [], texCoords = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= M; j++) {
            const xRatio = j / M;
            const yRatio = i / N;
            const x = centerX[i] + (xRatio - 0.5) * width;
            const y = centerY[i];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            worldPositions.push(x, y);
            texCoords.push(xRatio, yRatio);
        }
    }
    
    // インデックス生成
    const indices = [];
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
            const topLeft = i * (M + 1) + j;
            const topRight = topLeft + 1;
            const bottomLeft = (i + 1) * (M + 1) + j;
            const bottomRight = bottomLeft + 1;
            indices.push(topLeft, bottomLeft, topRight);
            indices.push(topRight, bottomLeft, bottomRight);
        }
    }
    
    return {
        mesh: { positions: worldPositions, texCoords, indices },
        bounds: { 
            minX, maxX, minY, maxY, 
            width: maxX - minX, 
            height: maxY - minY,
            centerX: (maxX + minX) / 2,
            centerY: (maxY + minY) / 2
        }
    };
}

// ===== WebGLレンダリング =====
function renderWindShakeWebGL(gl, img, mesh, canvasWidth, canvasHeight) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(windShakeProgram);
    
    const clipPositions = [];
    // メッシュをWebGLキャンバスの中心に配置
    // メッシュの座標系は中心が0なので、canvasの中心に配置
    const centerOffsetX = canvasWidth / 2;
    const centerOffsetY = canvasHeight / 2;
    
    for (let i = 0; i < mesh.positions.length; i += 2) {
        const worldX = mesh.positions[i];
        const worldY = mesh.positions[i + 1];
        
        // WebGLキャンバス座標に変換（メッシュの中心をキャンバスの中心に）
        const canvasX = worldX + centerOffsetX;
        const canvasY = worldY + centerOffsetY;
        
        // クリップ空間に変換
        const clipX = (canvasX / canvasWidth) * 2 - 1;
        const clipY = -(canvasY / canvasHeight) * 2 + 1;
        clipPositions.push(clipX, clipY);
    }
    
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(clipPositions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(windShakeProgramInfo.attribLocations.position);
    gl.vertexAttribPointer(windShakeProgramInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.texCoords), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(windShakeProgramInfo.attribLocations.texCoord);
    gl.vertexAttribPointer(windShakeProgramInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
    
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(windShakeProgramInfo.uniformLocations.image, 0);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(texCoordBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteTexture(texture);
}

// ===== 風揺れ適用 =====
function applyWindShakeWebGL(layerCtx, img, width, height, localTime, windSwayParams, anchorX, anchorY) {
    if (!windShakeCanvas) initWindShakeWebGL();
    const gl = windShakeGL;
    const canvas = windShakeCanvas;
    
    // メッシュを生成してバウンディングボックスを取得（アンカー座標を渡す）
    const meshData = createWindShakeMeshWithBounds(windSwayParams, width, height, localTime, anchorX, anchorY);
    
    // バウンディングボックスのサイズを計算（余裕を持たせる）
    const padding = 200;
    const canvasWidth = meshData.bounds.width * 1.2 + padding * 2;
    const canvasHeight = meshData.bounds.height * 1.2 + padding * 2;
    
    // キャンバスサイズを設定
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    
    // WebGLで描画
    renderWindShakeWebGL(gl, img, meshData.mesh, canvasWidth, canvasHeight);
    
    // アンカーオフセットを計算
    const anchorOffsetX = anchorX * width;
    const anchorOffsetY = anchorY * height;
    
    // WebGLキャンバス内での画像のアンカーポイント位置
    // 画像の左上は (canvasWidth/2 - width/2, canvasHeight/2 - height/2)
    // アンカーポイントは画像左上から (anchorOffsetX, anchorOffsetY)
    const anchorXInCanvas = canvasWidth / 2 - width / 2 + anchorOffsetX;
    const anchorYInCanvas = canvasHeight / 2 - height / 2 + anchorOffsetY;
    
    // アンカーポイントが原点に来るように描画
    layerCtx.drawImage(canvas, -anchorXInCanvas, -anchorYInCanvas, canvasWidth, canvasHeight);
}

// ===== レイヤー描画 =====
function drawLayerWithWindSway(layer, anchorX, anchorY, localTime) {
    if (layer.windSwayEnabled) {
        // アンカーポイントを軸にして揺らす
        applyWindShakeWebGL(ctx, layer.img, layer.width, layer.height, localTime, layer.windSwayParams, layer.anchorX, layer.anchorY);
    } else {
        ctx.drawImage(layer.img, anchorX, anchorY, layer.width, layer.height);
    }
}

// ===== ピン機能 =====
function enablePinMode() {
    pinMode = true;
    updatePinModeUI();
}

function disablePinMode() {
    pinMode = false;
    updatePinModeUI();
    clearPinElements();
}

function updatePinModeUI() {
    const btn = document.getElementById('addPinBtn');
    if (btn) {
        if (pinMode) {
            btn.classList.add('active');
            btn.style.background = 'linear-gradient(135deg, var(--accent-gold), var(--biscuit-medium))';
            btn.style.boxShadow = '0 0 10px rgba(255, 215, 0, 0.5)';
            btn.textContent = '✅ ピン挿入モード有効';
            canvas.style.cursor = 'crosshair';
        } else {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.boxShadow = '';
            btn.textContent = '➕ ピン挿入モードをON';
            canvas.style.cursor = 'default';
        }
    }
}

function togglePinMode() {
    pinMode = !pinMode;
    
    // 風揺れピンモードを有効にする場合、他のモードを無効化
    if (pinMode) {
        // 揺れモーションのアンカー設定モードを無効化
        if (typeof bounceAnchorClickMode !== 'undefined' && bounceAnchorClickMode) {
            bounceAnchorClickMode = false;
            const anchorBtn = document.getElementById('tool-anchor');
            if (anchorBtn) {
                anchorBtn.style.background = '';
                anchorBtn.style.boxShadow = '';
                anchorBtn.textContent = '🎯 クリック設定';
            }
        }
        // 揺れモーションのピンモードを無効化
        if (typeof bouncePinMode !== 'undefined' && bouncePinMode) {
            bouncePinMode = false;
            updateBouncePinModeUI();
        }
    }
    
    updatePinModeUI();
    if (!pinMode) {
        clearPinElements();
    } else {
        updatePinElements();
    }
    // プロパティパネルを更新してボタンの表示を変える
    if (typeof updatePropertiesPanel === 'function') {
        updatePropertiesPanel();
    }
}

function addPinToCanvas(e) {
    if (!pinMode) return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer) {
        alert('レイヤーを選択してください');
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Y座標からピン位置を計算（0-100%）
    const position = (y / canvas.height) * 100;
    
    // ピンを追加
    const pin = {
        id: Date.now(),
        position: Math.max(0, Math.min(100, position)),
        range: pinRange,
        x: x,
        y: y
    };
    
    layer.windSwayParams.pins.push(pin);
    
    // ピンリストとビジュアル表示を更新
    updatePinList();
    updatePinElements();
    render();
}

function removePin(pinId) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer) return;
    const index = layer.windSwayParams.pins.findIndex(p => p.id === pinId);
    if (index !== -1) layer.windSwayParams.pins.splice(index, 1);
    updatePinList();
    updatePinElements();
    render();
}

function clearPinElements() {
    // containerから直接すべてのピン要素を削除
    const container = document.getElementById('canvasContainer');
    if (container) {
        const existingPins = container.querySelectorAll('.axis-pin');
        existingPins.forEach((pin) => {
            container.removeChild(pin);
        });
    }
    
    // 配列もクリア
    pinElements = [];
}

function updatePinElements() {
    // 既存のピン要素をクリア
    clearPinElements();
    
    // ピン表示がOFFの場合は何もしない
    if (!showPins) {
        return;
    }
    
    if (!pinMode) {
        return;
    }
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || !layer.windSwayParams.pins) {
        return;
    }
    
    // レイヤーが非表示の場合はピンも表示しない
    if (!layer.visible) {
        return;
    }
    
    const container = document.getElementById('canvasContainer');
    if (!container) {
        return;
    }
    
    // 各ピンの視覚的要素を作成
    layer.windSwayParams.pins.forEach(pin => {
        const pinElement = document.createElement('img');
        pinElement.className = 'axis-pin';
        
        // ランダムにクマの色を選択
        const colors = ['01', '02', '03', '04', '05'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        pinElement.src = `pins/papet-${randomColor}.png`;
        pinElement.style.width = '40px';
        pinElement.style.height = '40px';
        pinElement.style.position = 'absolute';
        pinElement.style.pointerEvents = 'none';
        pinElement.style.zIndex = '1000';
        pinElement.style.display = 'block';
        pinElement.dataset.pinId = pin.id;
        
        // キャンバスの位置とズームを考慮して配置
        const canvasRect = canvas.getBoundingClientRect();
        
        // キャンバスの表示スケール
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        
        // ピンの絶対位置（ビューポート座標）
        const pinAbsX = canvasRect.left + pin.x * scaleX;
        const pinAbsY = canvasRect.top + pin.y * scaleY;
        
        // container基準の相対位置
        const containerRect = container.getBoundingClientRect();
        const left = pinAbsX - containerRect.left - 20;
        const top = pinAbsY - containerRect.top - 20;
        
        pinElement.style.left = left + 'px';
        pinElement.style.top = top + 'px';
        
        container.appendChild(pinElement);
        pinElements.push(pinElement);
    });
}

function updatePinList() {
    const pinList = document.getElementById('pin-list');
    if (!pinList) return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || !layer.windSwayParams.pins || layer.windSwayParams.pins.length === 0) {
        pinList.innerHTML = '<p style="text-align:center;color:var(--biscuit);padding:10px;font-size:12px;">ピンなし</p>';
        return;
    }
    
    pinList.innerHTML = '';
    for (const pin of layer.windSwayParams.pins) {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--chocolate-light);border-radius:4px;margin-bottom:4px;';
        div.innerHTML = `
            <div style="font-size:11px;color:var(--biscuit-light);">
                📍 位置: ${Math.round(pin.position)}% / 範囲: ${pin.range}%
            </div>
            <button onclick="removePin(${pin.id})" style="padding:4px 8px;background:var(--chocolate-dark);color:white;border:none;border-radius:4px;cursor:pointer;">×</button>
        `;
        pinList.appendChild(div);
    }
}

// ===== ピンレンジ更新 =====
function updatePinRange(value) {
    pinRange = parseInt(value);
    const rangeValue = document.getElementById('pinRangeValue');
    if (rangeValue) {
        rangeValue.textContent = value + '%';
    }
}
