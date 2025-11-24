/**
 * ⭐ Starlit Puppet Editor v1.10.1
 * パペット機能 - 複数ハンドル親子関係システム
 * 
 * v1.10.1:
 * - ハンドル追加時にレイヤー位置をキーフレームに記録
 * - シークバー移動時のアンカー位置リセット問題を修正
 * - フォルダ親子関係対応
 * - 子のローカル座標を親の回転・スケールで正しく変換
 * 
 * 構造：
 * - 軸アンカー：変形の基準点（既存のanchorX, anchorY）
 * - ハンドル配列：親子関係を持つ複数のハンドル
 *   - 最初のハンドル（parentId: null）は軸足の直接の子
 *   - 以降のハンドルは他のハンドルの子として連結
 *   - 親が動けば子も同じ量だけ動く
 */

// ===== グローバル変数 =====
let puppetWebGL = null;
let puppetProgram = null;
let puppetHandleMode = false; // ハンドル追加モード
let puppetIntermediatePinMode = false; // 旧API互換（ハンドルモードと同じ）
let puppetFixedPinMode = false; // 固定ピン追加モード
let isDraggingPuppetHandle = false; // ハンドルドラッグ中
let selectedPuppetHandle = null; // 選択中のハンドル

// ===== WebGL初期化 =====
function initPuppetWebGL() {
    const glCanvas = document.createElement('canvas');
    glCanvas.width = 512;
    glCanvas.height = 512;
    
    const gl = glCanvas.getContext('webgl', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
    });
    
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }
    
    puppetWebGL = { gl, canvas: glCanvas };
    
    const vertexShaderSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        uniform vec2 u_resolution;
        
        void main() {
            vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
            gl_Position = vec4(clipSpace.x, -clipSpace.y, 0, 1);
            v_texCoord = a_texCoord;
        }
    `;
    
    const fragmentShaderSource = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_texture;
        uniform float u_opacity;
        
        void main() {
            vec4 color = texture2D(u_texture, v_texCoord);
            color.a *= u_opacity;
            gl_FragColor = color;
        }
    `;
    
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
        console.error('Failed to create shaders');
        return;
    }
    
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
        console.error('Failed to create program');
        return;
    }
    
    puppetProgram = program;
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program;
}

// ===== パペットレイヤー作成 =====
function createPuppetLayer() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const layer = {
                    id: nextLayerId++,
                    type: 'puppet',
                    name: 'パペット',
                    img: img,
                    x: canvas.width / 2,
                    y: canvas.height / 2,
                    width: img.width,
                    height: img.height,
                    rotation: 0,
                    scale: 1,
                    opacity: 1.0,
                    anchorX: 0.5,
                    anchorY: 0.5,
                    visible: true,
                    blendMode: 'source-over',
                    
                    // パペット専用プロパティ（新しい複数ハンドル構造）
                    handleAnchors: [], // 複数ハンドル配列 { id, x, y, parentId, keyframes }
                    fixedPins: [], // 固定ピン
                    puppetStrength: 1.0,
                    puppetSmoothness: 1.3,
                    meshDensity: 65, // メッシュ密度
                    
                    parentLayerId: null,
                    windSwayEnabled: false,
                    windSwayParams: getDefaultWindSwayParams(),
                    
                    keyframes: [{
                        frame: 0,
                        x: canvas.width / 2,
                        y: canvas.height / 2,
                        rotation: 0,
                        scale: 1,
                        opacity: 1.0
                    }]
                };
                
                layers.push(layer);
                updateLayerList();
                selectLayer(layer.id, false);
                
                if (typeof applyKeyframeInterpolation === 'function') {
                    applyKeyframeInterpolation();
                }
                
                render();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ===== ハンドルの現在位置を取得（親子関係考慮） =====
function getHandlePositionAtFrame(handle, layer, currentFrame) {
    // ハンドル自身のキーフレーム補間位置を取得
    let pos = { x: handle.x, y: handle.y };
    
    if (handle.keyframes && handle.keyframes.length > 0) {
        // キーフレームを時間順にソート
        const sortedKF = [...handle.keyframes].sort((a, b) => a.frame - b.frame);
        
        // 現在フレームに対応するキーフレームを探す
        let beforeKF = null;
        let afterKF = null;
        
        for (let i = 0; i < sortedKF.length; i++) {
            if (sortedKF[i].frame <= currentFrame) {
                beforeKF = sortedKF[i];
            }
            if (sortedKF[i].frame >= currentFrame && afterKF === null) {
                afterKF = sortedKF[i];
            }
        }
        
        if (beforeKF && afterKF && beforeKF !== afterKF) {
            // 補間
            const t = (currentFrame - beforeKF.frame) / (afterKF.frame - beforeKF.frame);
            pos.x = beforeKF.x + (afterKF.x - beforeKF.x) * t;
            pos.y = beforeKF.y + (afterKF.y - beforeKF.y) * t;
        } else if (beforeKF) {
            pos.x = beforeKF.x;
            pos.y = beforeKF.y;
        } else if (afterKF) {
            pos.x = afterKF.x;
            pos.y = afterKF.y;
        }
    }
    
    // 親ハンドルの移動量を加算（親子関係）
    if (handle.parentId !== null && layer.handleAnchors) {
        const parentHandle = layer.handleAnchors.find(h => h.id === handle.parentId);
        if (parentHandle) {
            const parentPos = getHandlePositionAtFrame(parentHandle, layer, currentFrame);
            const parentMove = {
                x: parentPos.x - parentHandle.x,
                y: parentPos.y - parentHandle.y
            };
            pos.x += parentMove.x;
            pos.y += parentMove.y;
        }
    }
    
    return pos;
}

// ===== ハンドル自身のキーフレーム位置のみ取得（親の移動量は含めない） =====
function getHandleOwnPositionAtFrame(handle, currentFrame) {
    let pos = { x: handle.x, y: handle.y };
    
    if (handle.keyframes && handle.keyframes.length > 0) {
        const sortedKF = [...handle.keyframes].sort((a, b) => a.frame - b.frame);
        
        let beforeKF = null;
        let afterKF = null;
        
        for (let i = 0; i < sortedKF.length; i++) {
            if (sortedKF[i].frame <= currentFrame) {
                beforeKF = sortedKF[i];
            }
            if (sortedKF[i].frame >= currentFrame && afterKF === null) {
                afterKF = sortedKF[i];
            }
        }
        
        if (beforeKF && afterKF && beforeKF !== afterKF) {
            const t = (currentFrame - beforeKF.frame) / (afterKF.frame - beforeKF.frame);
            pos.x = beforeKF.x + (afterKF.x - beforeKF.x) * t;
            pos.y = beforeKF.y + (afterKF.y - beforeKF.y) * t;
        } else if (beforeKF) {
            pos.x = beforeKF.x;
            pos.y = beforeKF.y;
        } else if (afterKF) {
            pos.x = afterKF.x;
            pos.y = afterKF.y;
        }
    }
    
    // ★ 親の移動量は加算しない ★
    return pos;
}

// ===== ハンドルUI表示位置を計算（自分以外のハンドルの影響を受ける、セグメント制限付き） =====
function calculateHandleDisplayPosition(handle, layer, currentFrame) {
    // 自分自身のキーフレーム補間後の位置
    const selfPos = getHandleOwnPositionAtFrame(handle, currentFrame);
    
    let pos = { x: selfPos.x, y: selfPos.y };
    
    if (!layer.handleAnchors || layer.handleAnchors.length === 0) {
        return pos;
    }
    
    const imgWidth = layer.img ? layer.img.width : 100;
    const imgHeight = layer.img ? layer.img.height : 100;
    const strength = layer.puppetStrength || 1.0;
    const smoothness = layer.puppetSmoothness || 1.0;
    
    // このハンドルの軸からの距離
    const thisDist = Math.sqrt(handle.x ** 2 + handle.y ** 2);
    
    // ハンドルを軸からの距離でソート（遠い順）
    const sortedHandles = [...layer.handleAnchors].sort((a, b) => {
        const distA = Math.sqrt(a.x ** 2 + a.y ** 2);
        const distB = Math.sqrt(b.x ** 2 + b.y ** 2);
        return distB - distA;
    });
    
    // 他のハンドルの影響を計算（セグメント制限付き）
    for (let i = 0; i < sortedHandles.length; i++) {
        const otherHandle = sortedHandles[i];
        
        // 自分自身はスキップ
        if (otherHandle.id === handle.id) continue;
        
        const otherDist = Math.sqrt(otherHandle.x ** 2 + otherHandle.y ** 2);
        
        // このハンドルより軸側にあるハンドルは影響しない
        if (otherDist <= thisDist) continue;
        
        // 次のハンドル（軸に近い方）の距離
        const nextHandleDist = (i < sortedHandles.length - 1)
            ? Math.sqrt(sortedHandles[i + 1].x ** 2 + sortedHandles[i + 1].y ** 2)
            : 0;
        
        const otherPos = getHandleOwnPositionAtFrame(otherHandle, currentFrame);
        const moveX = otherPos.x - otherHandle.x;
        const moveY = otherPos.y - otherHandle.y;
        const moveDist = Math.sqrt(moveX ** 2 + moveY ** 2);
        
        if (moveDist < 0.1) continue;
        
        // セグメント影響度を計算（滑らかな曲線でフォールオフ）
        let segmentInfluence = 0;
        
        if (thisDist >= otherDist) {
            // このハンドルがotherHandleより先端側 → 100%影響
            segmentInfluence = 1.0;
        } else if (thisDist > nextHandleDist) {
            // このハンドルがセグメント内 → smoothstep曲線
            const segmentLength = otherDist - nextHandleDist;
            if (segmentLength > 0.1) {
                // smoothnessでグラデーション範囲を調整
                const adjustedLength = segmentLength * smoothness;
                const gradientStart = otherDist - adjustedLength;
                
                if (thisDist >= gradientStart) {
                    const t = (thisDist - gradientStart) / adjustedLength;
                    const tClamped = Math.min(Math.max(t, 0), 1);
                    // smoothstep曲線
                    segmentInfluence = tClamped * tClamped * (3 - 2 * tClamped);
                }
            }
        }
        // else: このハンドルがotherHandleより軸側 → 影響なし
        
        if (segmentInfluence > 0.01) {
            const smoothFactor = 1.0 - Math.exp(-((segmentInfluence * 3) ** 2));
            const totalInfluence = segmentInfluence * smoothFactor * strength;
            
            pos.x += moveX * totalInfluence;
            pos.y += moveY * totalInfluence;
        }
    }
    
    return pos;
}

// ===== 全ハンドルの影響を計算してメッシュ変形（セグメント制限付き） =====
function calculateMeshDeformation(localX, localY, layer, currentFrame) {
    if (!layer.handleAnchors || layer.handleAnchors.length === 0) {
        return { x: localX, y: localY };
    }
    
    const imgWidth = layer.img ? layer.img.width : 100;
    const imgHeight = layer.img ? layer.img.height : 100;
    const strength = layer.puppetStrength || 1.0;
    const smoothness = layer.puppetSmoothness || 1.0;
    
    // 固定ピンからの影響度（0=完全固定、1=影響を受ける）
    let mobilityFactor = 1.0;
    if (layer.fixedPins) {
        for (const fpin of layer.fixedPins) {
            const distToFixed = Math.sqrt(
                (localX - fpin.x) ** 2 + (localY - fpin.y) ** 2
            );
            const radius = fpin.radius || 100;
            const fixedInfluence = Math.exp(-(distToFixed ** 2) / (radius ** 2 * 2));
            mobilityFactor *= (1.0 - fixedInfluence);
        }
    }
    
    if (mobilityFactor < 0.01) {
        return { x: localX, y: localY };
    }
    
    // ハンドルを軸からの距離でソート（遠い順）
    const sortedHandles = [...layer.handleAnchors].sort((a, b) => {
        const distA = Math.sqrt(a.x ** 2 + a.y ** 2);
        const distB = Math.sqrt(b.x ** 2 + b.y ** 2);
        return distB - distA; // 遠い順
    });
    
    // 頂点の軸からの距離
    const vertexDist = Math.sqrt(localX ** 2 + localY ** 2);
    
    let deformedX = localX;
    let deformedY = localY;
    
    // 各ハンドルの影響を計算（セグメント制限付き）
    for (let i = 0; i < sortedHandles.length; i++) {
        const handle = sortedHandles[i];
        const handleDist = Math.sqrt(handle.x ** 2 + handle.y ** 2);
        
        // 次のハンドル（軸に近い方）の距離
        const nextHandleDist = (i < sortedHandles.length - 1) 
            ? Math.sqrt(sortedHandles[i + 1].x ** 2 + sortedHandles[i + 1].y ** 2)
            : 0; // 軸
        
        // このハンドルの移動量
        const ownPos = getHandleOwnPositionAtFrame(handle, currentFrame);
        const moveX = ownPos.x - handle.x;
        const moveY = ownPos.y - handle.y;
        const moveDist = Math.sqrt(moveX ** 2 + moveY ** 2);
        
        if (moveDist < 0.1) continue;
        
        // セグメント影響度を計算（滑らかな曲線でフォールオフ）
        let segmentInfluence = 0;
        
        if (vertexDist >= handleDist) {
            // 頂点がこのハンドルより先端側 → 100%影響
            segmentInfluence = 1.0;
        } else if (vertexDist > nextHandleDist) {
            // 頂点がこのセグメント内 → smoothstep曲線でグラデーション
            const segmentLength = handleDist - nextHandleDist;
            if (segmentLength > 0.1) {
                // smoothnessでグラデーション範囲を調整
                // smoothness=1.0: 通常、smoothness=3.0: 3倍広い（より滑らか）、smoothness=0.3: 30%（急峻）
                const adjustedLength = segmentLength * smoothness;
                const gradientStart = handleDist - adjustedLength;
                
                if (vertexDist >= gradientStart) {
                    // 0〜1の線形補間値
                    const t = (vertexDist - gradientStart) / adjustedLength;
                    const tClamped = Math.min(Math.max(t, 0), 1);
                    // smoothstep曲線: 3t² - 2t³（滑らかなS字カーブ）
                    segmentInfluence = tClamped * tClamped * (3 - 2 * tClamped);
                }
            }
        }
        // else: 頂点がこのハンドルより軸側 → 影響なし (segmentInfluence = 0)
        
        if (segmentInfluence > 0.01) {
            // スムージング用のガウシアンブレンド
            const blendRadius = Math.max(imgWidth, imgHeight) * 0.1 * smoothness;
            const smoothFactor = 1.0 - Math.exp(-((segmentInfluence * 3) ** 2));
            
            const totalInfluence = segmentInfluence * smoothFactor * strength * mobilityFactor;
            
            deformedX += moveX * totalInfluence;
            deformedY += moveY * totalInfluence;
        }
    }
    
    return { x: deformedX, y: deformedY };
}

// ===== パペットレイヤー描画 =====
function drawPuppetLayer(layer, time) {
    // 親変形を取得
    const parentTransform = getParentTransform(layer.parentLayerId);
    
    // ★ 子のローカル座標を親の回転・スケールで変換 ★
    const parentRad = parentTransform.rotation * Math.PI / 180;
    const parentCos = Math.cos(parentRad);
    const parentSin = Math.sin(parentRad);
    const transformedLayerX = layer.x * parentTransform.scale * parentCos - layer.y * parentTransform.scale * parentSin;
    const transformedLayerY = layer.x * parentTransform.scale * parentSin + layer.y * parentTransform.scale * parentCos;
    
    const finalX = parentTransform.x + transformedLayerX;
    const finalY = parentTransform.y + transformedLayerY;
    const finalRotation = layer.rotation + parentTransform.rotation;
    const finalScale = layer.scale * parentTransform.scale;
    
    // drawImageLayerが未定義の場合のフォールバック（親変形を考慮）
    const fallbackDrawImage = (l) => {
        if (!l.img) return;
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = l.blendMode || 'source-over';
        
        // ★ 親変形を適用した座標を使用 ★
        ctx.translate(finalX, finalY);
        ctx.rotate(finalRotation * Math.PI / 180);
        ctx.scale(finalScale, finalScale);
        
        const anchorOffsetX = l.anchorX * l.img.width;
        const anchorOffsetY = l.anchorY * l.img.height;
        ctx.drawImage(l.img, -anchorOffsetX, -anchorOffsetY);
        ctx.restore();
    };
    
    // ハンドルなし、またはWebGL未初期化の場合
    if (!puppetWebGL || !puppetProgram) {
        fallbackDrawImage(layer);
        return;
    }
    
    // 旧データ構造からの移行
    migrateOldPuppetData(layer);
    
    // ハンドルが設定されていない場合は通常描画
    if (!layer.handleAnchors || layer.handleAnchors.length === 0) {
        fallbackDrawImage(layer);
        return;
    }
    
    console.log('🎨 [パペット描画] drawPuppetLayer開始', layer.name);
    
    const gl = puppetWebGL.gl;
    const glCanvas = puppetWebGL.canvas;
    
    const imgWidth = layer.img.width;
    const imgHeight = layer.img.height;
    const margin = Math.max(imgWidth, imgHeight) * 0.5;
    const canvasWidth = imgWidth + margin * 2;
    const canvasHeight = imgHeight + margin * 2;
    
    glCanvas.width = canvasWidth;
    glCanvas.height = canvasHeight;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    
    const currentFrame = Math.floor(currentTime * projectFPS);
    
    // アンカーオフセット
    const anchorOffsetX = layer.anchorX * imgWidth;
    const anchorOffsetY = layer.anchorY * imgHeight;
    
    // メッシュ生成（密度はレイヤー設定から）
    const meshDensity = Math.round(layer.meshDensity || 20);
    const vertices = [];
    const texCoords = [];
    const indices = [];
    
    for (let y = 0; y <= meshDensity; y++) {
        for (let x = 0; x <= meshDensity; x++) {
            const u = x / meshDensity;
            const v = y / meshDensity;
            
            // ローカル座標（アンカー中心）
            const localX = u * imgWidth - anchorOffsetX;
            const localY = v * imgHeight - anchorOffsetY;
            
            // 変形適用
            const deformed = calculateMeshDeformation(localX, localY, layer, currentFrame);
            
            // ピクセル座標に変換
            const pixelX = deformed.x + anchorOffsetX + margin;
            const pixelY = deformed.y + anchorOffsetY + margin;
            
            vertices.push(pixelX, pixelY);
            texCoords.push(u, v);
        }
    }
    
    // インデックス生成
    for (let y = 0; y < meshDensity; y++) {
        for (let x = 0; x < meshDensity; x++) {
            const topLeft = y * (meshDensity + 1) + x;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + (meshDensity + 1);
            const bottomRight = bottomLeft + 1;
            
            indices.push(topLeft, bottomLeft, topRight);
            indices.push(topRight, bottomLeft, bottomRight);
        }
    }
    
    // WebGL描画
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(puppetProgram);
    
    // バッファ設定
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(puppetProgram, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    
    const texCoordLocation = gl.getAttribLocation(puppetProgram, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    
    // テクスチャ設定
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.img);
    
    // Uniform設定
    const resolutionLocation = gl.getUniformLocation(puppetProgram, 'u_resolution');
    gl.uniform2f(resolutionLocation, canvasWidth, canvasHeight);
    
    const opacityLocation = gl.getUniformLocation(puppetProgram, 'u_opacity');
    gl.uniform1f(opacityLocation, layer.opacity);
    
    // ブレンド
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // 描画
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    
    // メインキャンバスに転送
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    
    ctx.translate(finalX, finalY);
    ctx.rotate(finalRotation * Math.PI / 180);
    ctx.scale(finalScale, finalScale);
    
    const drawX = -anchorOffsetX - margin;
    const drawY = -anchorOffsetY - margin;
    ctx.drawImage(glCanvas, drawX, drawY);
    
    ctx.restore();
    
    // クリーンアップ
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(texCoordBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteTexture(texture);
    
    // アンカー要素描画
    setTimeout(() => drawPuppetAnchorElements(), 0);
}

// ===== ハンドル追加 =====
function addPuppetHandle(canvasX, canvasY) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'puppet') return;
    
    // ★ 現在のフレームを取得
    const currentFrame = Math.floor(currentTime * projectFPS);
    
    // ★ ハンドル追加時に現在のレイヤー位置をキーフレームに記録
    // これにより、シークバーを動かしてもレイヤー位置がリセットされない
    ensureLayerKeyframeAtCurrentFrame(layer, currentFrame);
    
    const parentTransform = getParentTransform(layer.parentLayerId);
    
    // ★ 子のローカル座標を親の回転・スケールで変換 ★
    const parentRad = parentTransform.rotation * Math.PI / 180;
    const parentCos = Math.cos(parentRad);
    const parentSin = Math.sin(parentRad);
    const transformedLayerX = layer.x * parentTransform.scale * parentCos - layer.y * parentTransform.scale * parentSin;
    const transformedLayerY = layer.x * parentTransform.scale * parentSin + layer.y * parentTransform.scale * parentCos;
    
    const finalX = parentTransform.x + transformedLayerX;
    const finalY = parentTransform.y + transformedLayerY;
    const finalRotation = layer.rotation + parentTransform.rotation;
    const finalScale = layer.scale * parentTransform.scale;
    
    const dx = canvasX - finalX;
    const dy = canvasY - finalY;
    
    const rad = -finalRotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const localX = (dx * cos - dy * sin) / finalScale;
    const localY = (dx * sin + dy * cos) / finalScale;
    
    if (!layer.handleAnchors) layer.handleAnchors = [];
    
    // 親を決定：最後のハンドルが親、なければnull（軸足の直接の子）
    const parentId = layer.handleAnchors.length > 0 
        ? layer.handleAnchors[layer.handleAnchors.length - 1].id 
        : null;
    
    const newHandle = {
        id: Date.now(),
        x: localX,
        y: localY,
        parentId: parentId,
        keyframes: [{
            frame: currentFrame,  // ★ 現在のフレームにキーフレームを追加
            x: localX,
            y: localY
        }]
    };
    
    // ★ フレーム0以外の場合、フレーム0にも初期キーフレームを追加
    if (currentFrame !== 0) {
        newHandle.keyframes.unshift({
            frame: 0,
            x: localX,
            y: localY
        });
    }
    
    layer.handleAnchors.push(newHandle);
    
    console.log('📍 ハンドル追加:', newHandle, 'parentId:', parentId, 'frame:', currentFrame);
    
    updatePropertiesPanel();
    render();
}

// ===== 現在のフレームにレイヤーキーフレームを確保 =====
function ensureLayerKeyframeAtCurrentFrame(layer, currentFrame) {
    if (!layer.keyframes) {
        layer.keyframes = [];
    }
    
    // 現在のフレームにキーフレームが存在するか確認
    let existingKF = layer.keyframes.find(kf => kf.frame === currentFrame);
    
    if (!existingKF) {
        // 現在のレイヤー位置でキーフレームを追加
        const newKF = {
            frame: currentFrame,
            x: layer.x,
            y: layer.y,
            rotation: layer.rotation,
            scale: layer.scale,
            opacity: layer.opacity
        };
        layer.keyframes.push(newKF);
        layer.keyframes.sort((a, b) => a.frame - b.frame);
        console.log('📌 レイヤーキーフレーム追加:', newKF);
    } else {
        // 既存のキーフレームを現在の位置で更新
        existingKF.x = layer.x;
        existingKF.y = layer.y;
        existingKF.rotation = layer.rotation;
        existingKF.scale = layer.scale;
        existingKF.opacity = layer.opacity;
        console.log('📌 レイヤーキーフレーム更新:', existingKF);
    }
    
    // フレーム0にキーフレームがない場合は追加
    if (!layer.keyframes.find(kf => kf.frame === 0)) {
        layer.keyframes.unshift({
            frame: 0,
            x: layer.x,
            y: layer.y,
            rotation: layer.rotation,
            scale: layer.scale,
            opacity: layer.opacity
        });
    }
}

// ===== 固定ピン追加 =====
function addFixedPin(arg1, arg2) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'puppet') return;
    
    let canvasX, canvasY;
    
    // イベントオブジェクトの場合
    if (arg1 && arg1.clientX !== undefined) {
        const rect = canvas.getBoundingClientRect();
        canvasX = (arg1.clientX - rect.left) / rect.width * canvas.width;
        canvasY = (arg1.clientY - rect.top) / rect.height * canvas.height;
    } else {
        // 座標が直接渡された場合
        canvasX = arg1;
        canvasY = arg2;
    }
    
    const parentTransform = getParentTransform(layer.parentLayerId);
    
    // ★ 子のローカル座標を親の回転・スケールで変換 ★
    const parentRad = parentTransform.rotation * Math.PI / 180;
    const parentCos = Math.cos(parentRad);
    const parentSin = Math.sin(parentRad);
    const transformedLayerX = layer.x * parentTransform.scale * parentCos - layer.y * parentTransform.scale * parentSin;
    const transformedLayerY = layer.x * parentTransform.scale * parentSin + layer.y * parentTransform.scale * parentCos;
    
    const finalX = parentTransform.x + transformedLayerX;
    const finalY = parentTransform.y + transformedLayerY;
    const finalRotation = layer.rotation + parentTransform.rotation;
    const finalScale = layer.scale * parentTransform.scale;
    
    const dx = canvasX - finalX;
    const dy = canvasY - finalY;
    
    const rad = -finalRotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const localX = (dx * cos - dy * sin) / finalScale;
    const localY = (dx * sin + dy * cos) / finalScale;
    
    const pin = {
        id: Date.now(),
        x: localX,
        y: localY,
        radius: 100
    };
    
    if (!layer.fixedPins) layer.fixedPins = [];
    layer.fixedPins.push(pin);
    
    console.log('🔒 固定ピン追加:', pin);
    
    updatePropertiesPanel();
    render();
}

// ===== モード切り替え =====
function togglePuppetHandleMode() {
    puppetHandleMode = !puppetHandleMode;
    if (puppetHandleMode) {
        puppetFixedPinMode = false;
        if (typeof pinMode !== 'undefined') pinMode = false;
        if (typeof bouncePinMode !== 'undefined') bouncePinMode = false;
        anchorPointPickMode = false;
        canvas.style.cursor = 'crosshair';
    } else {
        canvas.style.cursor = 'default';
    }
    updatePuppetModeUI();
}

function toggleFixedPinMode() {
    puppetFixedPinMode = !puppetFixedPinMode;
    if (puppetFixedPinMode) {
        puppetHandleMode = false;
        if (typeof pinMode !== 'undefined') pinMode = false;
        if (typeof bouncePinMode !== 'undefined') bouncePinMode = false;
        anchorPointPickMode = false;
        canvas.style.cursor = 'crosshair';
    } else {
        canvas.style.cursor = 'default';
    }
    updatePuppetModeUI();
}

function updatePuppetModeUI() {
    const handleBtn = document.getElementById('puppet-handle-mode-btn');
    const fixedBtn = document.getElementById('puppet-fixed-pin-mode-btn');
    
    if (handleBtn) {
        handleBtn.style.background = puppetHandleMode ? 'var(--accent-gold)' : 'linear-gradient(135deg, var(--biscuit), var(--biscuit-light))';
        handleBtn.style.boxShadow = puppetHandleMode ? '0 0 10px var(--accent-gold)' : 'none';
    }
    
    if (fixedBtn) {
        fixedBtn.style.background = puppetFixedPinMode ? 'var(--accent-gold)' : 'linear-gradient(135deg, var(--biscuit), var(--biscuit-light))';
        fixedBtn.style.boxShadow = puppetFixedPinMode ? '0 0 10px var(--accent-gold)' : 'none';
    }
}

// ===== アンカー要素描画 =====
function drawPuppetAnchorElements() {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    
    if (!layer || layer.type !== 'puppet') {
        clearPuppetAnchorElements();
        return;
    }
    
    const currentFrame = Math.floor(currentTime * projectFPS);
    const parentTransform = getParentTransform(layer.parentLayerId);
    
    // ★ 子のローカル座標を親の回転・スケールで変換 ★
    const parentRad = parentTransform.rotation * Math.PI / 180;
    const parentCos = Math.cos(parentRad);
    const parentSin = Math.sin(parentRad);
    const transformedLayerX = layer.x * parentTransform.scale * parentCos - layer.y * parentTransform.scale * parentSin;
    const transformedLayerY = layer.x * parentTransform.scale * parentSin + layer.y * parentTransform.scale * parentCos;
    
    const finalX = parentTransform.x + transformedLayerX;
    const finalY = parentTransform.y + transformedLayerY;
    const finalRotation = layer.rotation + parentTransform.rotation;
    const finalScale = layer.scale * parentTransform.scale;
    
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    const container = document.getElementById('canvasContainer');
    const containerRect = container.getBoundingClientRect();
    
    const rad = finalRotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // 全ハンドルを表示
    if (layer.handleAnchors && layer.handleAnchors.length > 0) {
        layer.handleAnchors.forEach((handle, index) => {
            // ★ 自分以外のハンドルの影響を受けた位置を計算 ★
            const displayPos = calculateHandleDisplayPosition(handle, layer, currentFrame);
            
            // ローカル座標 → ワールド座標
            const scaledX = displayPos.x * finalScale;
            const scaledY = displayPos.y * finalScale;
            const rotX = scaledX * cos - scaledY * sin;
            const rotY = scaledX * sin + scaledY * cos;
            const worldX = finalX + rotX;
            const worldY = finalY + rotY;
            
            // スクリーン座標
            const screenX = canvasRect.left + worldX * scaleX;
            const screenY = canvasRect.top + worldY * scaleY;
            const left = screenX - containerRect.left - 12;
            const top = screenY - containerRect.top - 12;
            
            let handleElement = document.getElementById(`puppet-handle-${handle.id}`);
            if (!handleElement) {
                handleElement = document.createElement('div');
                handleElement.id = `puppet-handle-${handle.id}`;
                handleElement.style.cssText = `
                    position: absolute;
                    width: 40px;
                    height: 40px;
                    cursor: move;
                    pointer-events: auto;
                    z-index: 100;
                    user-select: none;
                    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
                `;
                
                // くまさんアイコン（風揺れピンと同じ）
                const pinNumber = (index % 5) + 1;
                const pinImg = document.createElement('img');
                pinImg.src = `pins/papet-0${pinNumber}.png`;
                pinImg.style.cssText = 'width: 100%; height: 100%; pointer-events: none;';
                pinImg.draggable = false;
                handleElement.appendChild(pinImg);
                
                handleElement.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectedPuppetHandle = handle;
                    isDraggingPuppetHandle = true;
                    console.log('📍 ハンドル', index + 1, 'ドラッグ開始');
                });
                
                container.appendChild(handleElement);
            }
            
            handleElement.style.left = (left - 8) + 'px';
            handleElement.style.top = (top - 8) + 'px';
            
            // 親子関係の線を描画
            if (handle.parentId !== null) {
                const parentHandle = layer.handleAnchors.find(h => h.id === handle.parentId);
                if (parentHandle) {
                    drawParentChildLine(handle, parentHandle, layer, currentFrame, container, canvasRect, scaleX, scaleY, finalX, finalY, finalScale, cos, sin, containerRect);
                }
            }
        });
    }
    
    // 固定ピン表示
    if (layer.fixedPins) {
        layer.fixedPins.forEach((pin, index) => {
            const scaledX = pin.x * finalScale;
            const scaledY = pin.y * finalScale;
            const rotX = scaledX * cos - scaledY * sin;
            const rotY = scaledX * sin + scaledY * cos;
            const worldX = finalX + rotX;
            const worldY = finalY + rotY;
            
            const screenX = canvasRect.left + worldX * scaleX;
            const screenY = canvasRect.top + worldY * scaleY;
            const left = screenX - containerRect.left - 10;
            const top = screenY - containerRect.top - 10;
            
            let pinElement = document.getElementById(`fixed-pin-${pin.id}`);
            if (!pinElement) {
                pinElement = document.createElement('div');
                pinElement.id = `fixed-pin-${pin.id}`;
                pinElement.style.cssText = `
                    position: absolute;
                    width: 20px;
                    height: 20px;
                    background: #888;
                    border: 2px solid #444;
                    border-radius: 4px;
                    cursor: pointer;
                    pointer-events: auto;
                    z-index: 99;
                `;
                
                pinElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm('この固定ピンを削除しますか？')) {
                        layer.fixedPins = layer.fixedPins.filter(p => p.id !== pin.id);
                        pinElement.remove();
                        render();
                    }
                });
                
                container.appendChild(pinElement);
            }
            
            pinElement.style.left = left + 'px';
            pinElement.style.top = top + 'px';
        });
    }
}

// 親子関係の線を描画
function drawParentChildLine(child, parent, layer, currentFrame, container, canvasRect, scaleX, scaleY, finalX, finalY, finalScale, cos, sin, containerRect) {
    const lineId = `parent-child-line-${child.id}`;
    let line = document.getElementById(lineId);
    
    if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        line.id = lineId;
        line.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 98;';
        container.appendChild(line);
    }
    
    // ★ 自分以外のハンドルの影響を受けた位置を計算 ★
    const childPos = calculateHandleDisplayPosition(child, layer, currentFrame);
    const parentPos = calculateHandleDisplayPosition(parent, layer, currentFrame);
    
    // 座標変換
    const childScaledX = childPos.x * finalScale;
    const childScaledY = childPos.y * finalScale;
    const childWorldX = finalX + (childScaledX * cos - childScaledY * sin);
    const childWorldY = finalY + (childScaledX * sin + childScaledY * cos);
    
    const parentScaledX = parentPos.x * finalScale;
    const parentScaledY = parentPos.y * finalScale;
    const parentWorldX = finalX + (parentScaledX * cos - parentScaledY * sin);
    const parentWorldY = finalY + (parentScaledX * sin + parentScaledY * cos);
    
    const x1 = canvasRect.left + parentWorldX * scaleX - containerRect.left;
    const y1 = canvasRect.top + parentWorldY * scaleY - containerRect.top;
    const x2 = canvasRect.left + childWorldX * scaleX - containerRect.left;
    const y2 = canvasRect.top + childWorldY * scaleY - containerRect.top;
    
    line.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-dasharray="5,5"/>`;
}

// ===== アンカー要素クリア =====
function clearPuppetAnchorElements() {
    const container = document.getElementById('canvasContainer');
    if (!container) return;
    
    // ハンドル要素を削除
    container.querySelectorAll('[id^="puppet-handle-"]').forEach(el => el.remove());
    
    // 固定ピン要素を削除
    container.querySelectorAll('[id^="fixed-pin-"]').forEach(el => el.remove());
    
    // 親子関係線を削除
    container.querySelectorAll('[id^="parent-child-line-"]').forEach(el => el.remove());
}

// ===== マウスイベント =====
function handlePuppetMouseDown(e) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'puppet') return false;
    
    if (puppetHandleMode) {
        const canvasRect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - canvasRect.left) / canvasRect.width * canvas.width;
        const canvasY = (e.clientY - canvasRect.top) / canvasRect.height * canvas.height;
        addPuppetHandle(canvasX, canvasY);
        return true;
    }
    
    if (puppetFixedPinMode) {
        const canvasRect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - canvasRect.left) / canvasRect.width * canvas.width;
        const canvasY = (e.clientY - canvasRect.top) / canvasRect.height * canvas.height;
        addFixedPin(canvasX, canvasY);
        return true;
    }
    
    return false;
}

function handlePuppetMouseMove(e) {
    if (!isDraggingPuppetHandle || !selectedPuppetHandle) return false;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'puppet') return false;
    
    const canvasRect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - canvasRect.left) / canvasRect.width * canvas.width;
    const canvasY = (e.clientY - canvasRect.top) / canvasRect.height * canvas.height;
    
    const parentTransform = getParentTransform(layer.parentLayerId);
    
    // ★ 子のローカル座標を親の回転・スケールで変換 ★
    const parentRad = parentTransform.rotation * Math.PI / 180;
    const parentCos = Math.cos(parentRad);
    const parentSin = Math.sin(parentRad);
    const transformedLayerX = layer.x * parentTransform.scale * parentCos - layer.y * parentTransform.scale * parentSin;
    const transformedLayerY = layer.x * parentTransform.scale * parentSin + layer.y * parentTransform.scale * parentCos;
    
    const finalX = parentTransform.x + transformedLayerX;
    const finalY = parentTransform.y + transformedLayerY;
    const finalRotation = layer.rotation + parentTransform.rotation;
    const finalScale = layer.scale * parentTransform.scale;
    
    const dx = canvasX - finalX;
    const dy = canvasY - finalY;
    
    const rad = -finalRotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    let localX = (dx * cos - dy * sin) / finalScale;
    let localY = (dx * sin + dy * cos) / finalScale;
    
    // 親ハンドルの移動量を引く（親子関係を考慮）
    if (selectedPuppetHandle.parentId !== null && layer.handleAnchors) {
        const currentFrame = Math.floor(currentTime * projectFPS);
        const parentHandle = layer.handleAnchors.find(h => h.id === selectedPuppetHandle.parentId);
        if (parentHandle) {
            const parentPos = getHandlePositionAtFrame(parentHandle, layer, currentFrame);
            const parentMove = {
                x: parentPos.x - parentHandle.x,
                y: parentPos.y - parentHandle.y
            };
            localX -= parentMove.x;
            localY -= parentMove.y;
        }
    }
    
    // キーフレーム更新
    const currentFrame = Math.floor(currentTime * projectFPS);
    updateHandleKeyframe(selectedPuppetHandle, currentFrame, localX, localY);
    
    console.log('🔄 ハンドルドラッグ中:', { localX: localX.toFixed(1), localY: localY.toFixed(1) });
    
    render();
    return true;
}

function handlePuppetMouseUp(e) {
    if (isDraggingPuppetHandle) {
        console.log('✅ ハンドルドラッグ終了・確定');
        isDraggingPuppetHandle = false;
        selectedPuppetHandle = null;
        return true;
    }
    return false;
}

// ===== キーフレーム更新 =====
function updateHandleKeyframe(handle, frame, x, y) {
    if (!handle.keyframes) handle.keyframes = [];
    
    // ★ ドラッグ時にもレイヤーキーフレームを確保
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (layer && layer.type === 'puppet') {
        ensureLayerKeyframeAtCurrentFrame(layer, frame);
    }
    
    let existingKF = handle.keyframes.find(kf => kf.frame === frame);
    if (existingKF) {
        existingKF.x = x;
        existingKF.y = y;
    } else {
        handle.keyframes.push({ frame, x, y });
        handle.keyframes.sort((a, b) => a.frame - b.frame);
    }
}

// ===== プロパティパネル用 =====
function getPuppetPropertyHTML(layer) {
    if (layer.type !== 'puppet') return '';
    
    const handleCount = layer.handleAnchors ? layer.handleAnchors.length : 0;
    const fixedPinCount = layer.fixedPins ? layer.fixedPins.length : 0;
    
    return `
        <div class="property-section">
            <h4>🎭 パペット設定</h4>
            
            <div class="property-row">
                <button id="puppet-handle-mode-btn" onclick="togglePuppetHandleMode()" 
                    style="padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; width: 100%; margin-bottom: 8px;">
                    📍 ハンドル追加モード ${puppetHandleMode ? '(ON)' : '(OFF)'}
                </button>
            </div>
            
            <div class="property-row">
                <button id="puppet-fixed-pin-mode-btn" onclick="toggleFixedPinMode()" 
                    style="padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; width: 100%; margin-bottom: 8px;">
                    🔒 固定ピン追加モード ${puppetFixedPinMode ? '(ON)' : '(OFF)'}
                </button>
            </div>
            
            <div class="property-row" style="margin-top: 12px;">
                <span>ハンドル数: ${handleCount}</span>
            </div>
            
            <div class="property-row">
                <span>固定ピン数: ${fixedPinCount}</span>
            </div>
            
            <div class="property-row" style="margin-top: 12px;">
                <label>変形強度:</label>
                <input type="range" min="0" max="2" step="0.1" value="${layer.puppetStrength || 1}"
                    onchange="updatePuppetStrength(${layer.id}, this.value)" style="flex: 1;">
                <span>${(layer.puppetStrength || 1).toFixed(1)}</span>
            </div>
            
            <div class="property-row">
                <label>滑らかさ:</label>
                <input type="range" min="0.1" max="3" step="0.1" value="${layer.puppetSmoothness || 1}"
                    onchange="updatePuppetSmoothness(${layer.id}, this.value)" style="flex: 1;">
                <span>${(layer.puppetSmoothness || 1).toFixed(1)}</span>
            </div>
            
            ${handleCount > 0 ? `
            <div class="property-row" style="margin-top: 12px;">
                <button onclick="clearAllHandles(${layer.id})" 
                    style="padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; background: #c9302c; color: white;">
                    全ハンドル削除
                </button>
            </div>
            ` : ''}
            
            <div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px;">
                <p style="margin: 0 0 4px 0;">📍 ハンドルは親子関係で連結</p>
                <p style="margin: 0 0 4px 0;">　 1番→2番→3番... の順に子になる</p>
                <p style="margin: 0;">　 親が動くと子も同じ量だけ動く</p>
            </div>
        </div>
    `;
}

function updatePuppetStrength(layerId, value) {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
        layer.puppetStrength = parseFloat(value);
        render();
    }
}

function updatePuppetSmoothness(layerId, value) {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
        layer.puppetSmoothness = parseFloat(value);
        render();
    }
}

function clearAllHandles(layerId) {
    const layer = layers.find(l => l.id === layerId);
    if (layer && confirm('全てのハンドルを削除しますか？')) {
        layer.handleAnchors = [];
        clearPuppetAnchorElements();
        updatePropertiesPanel();
        render();
    }
}

// ===== 旧API互換（必要に応じて） =====
function getPuppetHandlePositionAtFrame(handleAnchor, frame) {
    // 旧APIの互換性のため
    return getHandlePositionAtFrame(handleAnchor, null, frame);
}

// ===== 旧API互換関数（app.jsから呼び出される） =====

// ハンドル設定（イベントオブジェクトを受け取る旧API）
function setPuppetHandleAnchor(e) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'puppet') return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / rect.width * canvas.width;
    const canvasY = (e.clientY - rect.top) / rect.height * canvas.height;
    
    addPuppetHandle(canvasX, canvasY);
}

// 中間ピン追加（旧API → ハンドル追加にリダイレクト）
function addIntermediatePin(e) {
    console.log('⚠️ addIntermediatePin は addPuppetHandle にリダイレクトされます');
    setPuppetHandleAnchor(e);
}

// 固定ピン追加（イベントオブジェクトを受け取る旧API）
function addFixedPinFromEvent(e) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'puppet') return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / rect.width * canvas.width;
    const canvasY = (e.clientY - rect.top) / rect.height * canvas.height;
    
    addFixedPin(canvasX, canvasY);
}

// パペットドラッグ処理（旧API）
function handlePuppetDrag(e) {
    handlePuppetMouseMove(e);
}

// パペットドラッグ終了（旧API）
function handlePuppetDragEnd() {
    handlePuppetMouseUp(null);
}

// 中間ピンモード切り替え（旧API → ハンドルモードにリダイレクト）
function toggleIntermediatePinMode() {
    console.log('⚠️ 中間ピンモードは廃止されました。ハンドル追加モードを使用してください。');
    togglePuppetHandleMode();
}

// 中間ピン位置取得（旧API、ダミー）
function getIntermediatePinPositionAtFrame(pin, frame) {
    return { x: pin.x, y: pin.y };
}

// 旧ハンドル位置取得API
function getPuppetHandlePositionAtFrame(handleAnchor, frame) {
    // 旧APIの場合、layerがないので単純にキーフレーム補間のみ
    let pos = { x: handleAnchor.x, y: handleAnchor.y };
    
    if (handleAnchor.keyframes && handleAnchor.keyframes.length > 0) {
        const sortedKF = [...handleAnchor.keyframes].sort((a, b) => a.frame - b.frame);
        let beforeKF = null;
        let afterKF = null;
        
        for (let i = 0; i < sortedKF.length; i++) {
            if (sortedKF[i].frame <= frame) beforeKF = sortedKF[i];
            if (sortedKF[i].frame >= frame && afterKF === null) afterKF = sortedKF[i];
        }
        
        if (beforeKF && afterKF && beforeKF !== afterKF) {
            const t = (frame - beforeKF.frame) / (afterKF.frame - beforeKF.frame);
            pos.x = beforeKF.x + (afterKF.x - beforeKF.x) * t;
            pos.y = beforeKF.y + (afterKF.y - beforeKF.y) * t;
        } else if (beforeKF) {
            pos.x = beforeKF.x;
            pos.y = beforeKF.y;
        } else if (afterKF) {
            pos.x = afterKF.x;
            pos.y = afterKF.y;
        }
    }
    
    return pos;
}

// ===== 旧データ構造との互換性 =====
// 古いlayer.handleAnchor（単数）を新しいlayer.handleAnchors（配列）に変換
function migrateOldPuppetData(layer) {
    if (layer.type !== 'puppet') return;
    
    // 旧handleAnchor → 新handleAnchors
    if (layer.handleAnchor && (!layer.handleAnchors || layer.handleAnchors.length === 0)) {
        layer.handleAnchors = [{
            id: Date.now(),
            x: layer.handleAnchor.x,
            y: layer.handleAnchor.y,
            parentId: null,
            keyframes: layer.handleAnchor.keyframes || [{ frame: 0, x: layer.handleAnchor.x, y: layer.handleAnchor.y }]
        }];
        console.log('📦 旧handleAnchorを新handleAnchorsに移行:', layer.handleAnchors);
    }
    
    // 旧intermediatePins → 新handleAnchorsに追加
    if (layer.intermediatePins && layer.intermediatePins.length > 0) {
        if (!layer.handleAnchors) layer.handleAnchors = [];
        
        for (const pin of layer.intermediatePins) {
            const parentId = layer.handleAnchors.length > 0 
                ? layer.handleAnchors[layer.handleAnchors.length - 1].id 
                : null;
            
            layer.handleAnchors.push({
                id: pin.id || Date.now() + Math.random(),
                x: pin.x,
                y: pin.y,
                parentId: parentId,
                keyframes: pin.keyframes || [{ frame: 0, x: pin.x, y: pin.y }]
            });
        }
        console.log('📦 旧intermediatePinsを新handleAnchorsに移行:', layer.handleAnchors);
        layer.intermediatePins = []; // クリア
    }
}

// ===== 親レイヤーの累積変換を取得 =====
// 親の回転・スケールを子の位置に正しく反映する
function getParentTransform(parentLayerId) {
    if (!parentLayerId) {
        return { x: 0, y: 0, rotation: 0, scale: 1 };
    }
    
    const parent = layers.find(l => l.id === parentLayerId);
    if (!parent) {
        return { x: 0, y: 0, rotation: 0, scale: 1 };
    }
    
    // まず親の親の変形を取得
    const grandParentTransform = getParentTransform(parent.parentLayerId);
    
    // 親の位置を、親の親の回転・スケールで変換
    const grandRad = grandParentTransform.rotation * Math.PI / 180;
    const grandCos = Math.cos(grandRad);
    const grandSin = Math.sin(grandRad);
    
    // 親の位置を親の親の変形で変換
    const transformedParentX = parent.x * grandParentTransform.scale * grandCos 
                              - parent.y * grandParentTransform.scale * grandSin;
    const transformedParentY = parent.x * grandParentTransform.scale * grandSin 
                              + parent.y * grandParentTransform.scale * grandCos;
    
    return {
        x: grandParentTransform.x + transformedParentX,
        y: grandParentTransform.y + transformedParentY,
        rotation: parent.rotation + grandParentTransform.rotation,
        scale: parent.scale * grandParentTransform.scale
    };
}

// ===== パペットアンカーに追従するレイヤーの位置取得 =====
function getPuppetFollowPosition(followConfig) {
    if (!followConfig || !followConfig.layerId) return { x: 0, y: 0 };
    
    const puppetLayer = layers.find(l => l.id === followConfig.layerId);
    if (!puppetLayer || puppetLayer.type !== 'puppet') return { x: 0, y: 0 };
    
    const parentTransform = getParentTransform(puppetLayer.parentLayerId);
    
    // ★ 子のローカル座標を親の回転・スケールで変換 ★
    const parentRad = parentTransform.rotation * Math.PI / 180;
    const parentCos = Math.cos(parentRad);
    const parentSin = Math.sin(parentRad);
    const transformedLayerX = puppetLayer.x * parentTransform.scale * parentCos - puppetLayer.y * parentTransform.scale * parentSin;
    const transformedLayerY = puppetLayer.x * parentTransform.scale * parentSin + puppetLayer.y * parentTransform.scale * parentCos;
    
    // handleAnchorsが存在しない場合は軸アンカーの位置を返す
    if (!puppetLayer.handleAnchors || puppetLayer.handleAnchors.length === 0) {
        return {
            x: parentTransform.x + transformedLayerX,
            y: parentTransform.y + transformedLayerY
        };
    }
    
    const currentFrame = Math.floor(currentTime * projectFPS);
    const finalX = parentTransform.x + transformedLayerX;
    const finalY = parentTransform.y + transformedLayerY;
    const finalRotation = puppetLayer.rotation + parentTransform.rotation;
    const finalScale = puppetLayer.scale * parentTransform.scale;
    
    // 最初のハンドルの位置を取得
    const firstHandle = puppetLayer.handleAnchors[0];
    let handlePos = getHandlePositionAtFrame(firstHandle, puppetLayer, currentFrame);
    
    // ローカル座標をワールド座標に変換
    const rad = finalRotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const scaledX = handlePos.x * finalScale;
    const scaledY = handlePos.y * finalScale;
    const worldX = finalX + (scaledX * cos - scaledY * sin);
    const worldY = finalY + (scaledX * sin + scaledY * cos);
    
    return { x: worldX, y: worldY };
}

console.log('⭐ Starlit Puppet Editor v1.10.1 - フォルダ親子関係・座標変換修正');
