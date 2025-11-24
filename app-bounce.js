/**
 * ⭐ Starlit Puppet Editor v1.8.7
 * 揺れモーションエフェクト - 変形曲線を滑らか化 + アンカー再設定対応
 * - 風揺れと同じsmoothstep補間を実装
 * - メッシュ分割数を増やして滑らかな変形に（20→30）
 * - ピンの影響範囲をsmootherstepで滑らかに
 * - アンカーからの減衰をsmoothstepで自然に
 * - アンカー設定モードとピンモードの競合を修正
 * - キーフレーム入力後もアンカーを再設定できるように修正
 * 
 * v1.8.7 更新:
 * - smoothstep/smootherstep補間を実装
 * - ピン影響範囲計算をsmootherstepに変更
 * - アンカー距離計算をsmoothstepに変更
 * - 弾み方向の距離計算もsmoothstepに変更
 * - デフォルト分割数を30に増加
 * - アンカー設定とピンモードが競合しないように修正
 * - キーフレームに保存されたアンカーではなく、常に現在のレイヤーのアンカーを使用（重要！）
 * 
 * 既存機能:
 * - ピン（軸）を複数配置可能（ピンが変形の軸として機能）
 * - 弾み（Y軸伸縮のみ）アニメーション
 * - 揺れ（横揺れのみ、減衰あり）アニメーション
 * - キーフレーム挿入で複数回のアニメーション配置可能
 * - キーフレームごとにタイプとパラメータを保存
 * - 左右どちらから揺れるかを選択可能
 */

// ===== WebGL関連 =====
let bounceCanvas = null;
let bounceGL = null;
let bounceProgram = null;
let bounceProgramInfo = null;

// ===== デフォルトパラメータ =====
function getDefaultBounceParams() {
    return {
        type: 'bounce', // 'bounce' = 弾み（Y軸伸縮のみ）, 'sway' = 揺れ（風揺れベース）
        divisions: 30, // メッシュ分割数（1-50）- より滑らかな変形のため増加
        amplitude: 50, // 伸縮の大きさ（ピクセル）
        swayAmplitude: 100, // 左右揺れの大きさ（揺れタイプのみ）
        frequency: 3, // 揺れる回数
        dampingTime: 1.0, // 減衰時間（秒）
        bounceDirection: 'down', // 弾み方向 'down' = 下に伸縮, 'up' = 上に伸縮
        swayDirection: 'right', // 揺れ方向 'left' = 左から, 'right' = 右から
        swayVerticalDirection: 'both', // 揺れる部分 'both' = 上下両方, 'up' = 上のみ, 'down' = 下のみ
        pins: [], // ピン配列 { x: number, y: number, range: number }
        keyframes: [] // 揺れアニメーションのキーフレーム { frame: number }
    };
}

// ===== WebGL初期化 =====
function initBounceWebGL() {
    if (!bounceCanvas) {
        bounceCanvas = document.createElement('canvas');
        bounceGL = bounceCanvas.getContext('webgl', { 
            premultipliedAlpha: false, alpha: true 
        });
    }
    
    const gl = bounceGL;
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
    bounceProgram = gl.createProgram();
    gl.attachShader(bounceProgram, vertexShader);
    gl.attachShader(bounceProgram, fragmentShader);
    gl.linkProgram(bounceProgram);
    
    bounceProgramInfo = {
        attribLocations: {
            position: gl.getAttribLocation(bounceProgram, 'a_position'),
            texCoord: gl.getAttribLocation(bounceProgram, 'a_texCoord'),
        },
        uniformLocations: {
            image: gl.getUniformLocation(bounceProgram, 'u_image'),
        },
    };
}

// ===== Smoothstep補間（滑らかな変形用） =====
function bounceSmoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ===== Smootherstep補間（さらに滑らかな変形用） =====
function bounceSmootherstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// ===== 揺れモーションメッシュ生成（風揺れベース） =====
function createBounceMeshWithBounds(bounceParams, width, height, localTime, animationStartTime, anchorX, anchorY) {
    // 垂直分割数をパラメータから取得（1-50の範囲でクランプ）
    let N = Math.floor(bounceParams.divisions || 20);
    if (N < 1) N = 1;
    if (N > 50) N = 50;
    const M = 10; // 水平分割数
    
    const elapsedTime = localTime - animationStartTime;
    
    // アニメーション開始前（elapsedTime < 0）の場合は停止
    let isAnimating = elapsedTime >= 0;
    
    // 減衰係数（指数関数的減衰、時間無制限で継続）
    const damping = isAnimating ? Math.exp(-5 * (elapsedTime / bounceParams.dampingTime)) : 0;
    
    // アンカーポイントを軸として使用
    let pinPosition = anchorY; // アンカーY座標を使用
    let pinX = (anchorX - 0.5) * width; // アンカーX座標を使用（中心基準）
    
    // 弾みタイプ（Y軸伸縮のみ）
    if (bounceParams.type === 'bounce') {
        const worldPositions = [], texCoords = [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        // 周期
        const omega = 2 * Math.PI * bounceParams.frequency / bounceParams.dampingTime;
        const wave = isAnimating ? Math.sin(omega * elapsedTime) * damping : 0;
        // wave > 0：圧縮（縮む）、wave < 0：伸長（伸びる）
        // マイナスをかけることで、デフォルト → 圧縮 → 伸びる の動きになる
        const scaleEffect = -(bounceParams.amplitude / 100) * wave;
        
        // ピン位置のY座標（中心を0とした座標系、-height/2 から height/2 の範囲）
        const pinYRatio = pinPosition;  // 0-1の範囲
        const pinY = (pinYRatio - 0.5) * height;  // 中心を0とした座標
        
        // 弾み方向（'up' = 上に向かって（ピンより下が伸縮）, 'down' = 下に向かって（ピンより上が伸縮））
        // デフォルトは 'down'（ピンより上が伸縮）
        const stretchUp = bounceParams.bounceDirection === 'up';
        
        for (let i = 0; i <= N; i++) {
            const yRatio = i / N;
            
            let y;
            if (yRatio <= pinPosition) {
                // ピンより上の部分
                const distanceFromPin = pinPosition - yRatio;
                if (stretchUp) {
                    // 上に向かってモード：上は固定
                    y = (yRatio - 0.5) * height;
                } else {
                    // 下に向かってモード：上が伸縮（下へ圧縮 → 上へ伸びる）
                    const linearPos = distanceFromPin / pinPosition;
                    // smoothstepを適用してより自然な減衰に
                    const relativePos = bounceSmoothstep(0, 1, linearPos);
                    const scaledDistance = distanceFromPin * (1 + scaleEffect * relativePos);
                    y = pinY - scaledDistance * height;
                }
            } else {
                // ピンより下の部分
                const distanceFromPin = yRatio - pinPosition;
                if (stretchUp) {
                    // 上に向かってモード：下が伸縮（上へ圧縮 → 下へ伸びる）
                    const linearPos = distanceFromPin / (1 - pinPosition);
                    // smoothstepを適用してより自然な減衰に
                    const relativePos = bounceSmoothstep(0, 1, linearPos);
                    const scaledDistance = distanceFromPin * (1 + scaleEffect * relativePos);
                    y = pinY + scaledDistance * height;
                } else {
                    // 下に向かってモード：下は固定
                    y = (yRatio - 0.5) * height;
                }
            }
            
            for (let j = 0; j <= M; j++) {
                const xRatio = j / M;
                const x = (xRatio - 0.5) * width;
                
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
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2
            }
        };
    }
    
    // 揺れタイプ（左右揺れ、中心からスタート）
    const L = height; // 画像の高さ
    
    // 揺れパラメータ
    const omega = 2 * Math.PI * bounceParams.frequency / bounceParams.dampingTime;
    const t = elapsedTime;
    
    // 揺れ方向（左右）の係数
    // right: 正の方向（右に揺れる）, left: 負の方向（左に揺れる）
    const directionSign = (bounceParams.swayDirection === 'left') ? -1 : 1;
    
    // 揺れる部分の設定（デフォルト: 両方）
    const swayVerticalDirection = bounceParams.swayVerticalDirection || 'both';
    
    // 左右揺れの波形（t=0で0、指定方向に揺れて中心に戻る）
    // sin(ωt)を使用：t=0で0（中心）、t増加で±1、減衰しながら中心に戻る
    const swayWave = isAnimating ? Math.sin(omega * t) * damping * directionSign : 0;
    
    // 中心線の位置を計算
    const centerX = new Array(N + 1);
    const centerY = new Array(N + 1);
    
    // 各頂点の座標を計算
    for (let i = 0; i <= N; i++) {
        const yRatio = i / N; // 0-1の範囲
        
        // Y座標は常に等間隔（伸縮なし、上下にブレない）
        centerY[i] = (yRatio - 0.5) * height;
        
        // ピンの影響を計算（風揺れと同じロジック）
        let pinMultiplier = 1.0;
        if (bounceParams.pins && bounceParams.pins.length > 0) {
            let minMultiplier = 1.0;
            for (const pin of bounceParams.pins) {
                const pinPos = pin.position / 100; // 0-1に変換
                const distance = Math.abs(yRatio - pinPos);
                const range = pin.range / 100; // 0-1に変換
                if (distance < range) {
                    const normalizedDist = distance / range;
                    // smootherstepを使用してより滑らかな減衰を実現
                    const multiplier = bounceSmootherstep(0, 1, normalizedDist);
                    minMultiplier = Math.min(minMultiplier, multiplier);
                }
            }
            pinMultiplier = minMultiplier;
        }
        
        // アンカー位置からの距離を計算（0-1の範囲に正規化）
        let distanceFromAnchor;
        let shouldSway = false;
        
        if (yRatio <= pinPosition) {
            // アンカーより上
            const linearDist = pinPosition > 0 ? (pinPosition - yRatio) / pinPosition : 0;
            // smoothstepを適用してより自然な増加に
            distanceFromAnchor = bounceSmoothstep(0, 1, linearDist);
            // 揺れる部分の判定（上のみ、または両方）
            shouldSway = (swayVerticalDirection === 'up' || swayVerticalDirection === 'both');
        } else {
            // アンカーより下
            const linearDist = (1 - pinPosition) > 0 ? (yRatio - pinPosition) / (1 - pinPosition) : 0;
            // smoothstepを適用してより自然な増加に
            distanceFromAnchor = bounceSmoothstep(0, 1, linearDist);
            // 揺れる部分の判定（下のみ、または両方）
            shouldSway = (swayVerticalDirection === 'down' || swayVerticalDirection === 'both');
        }
        
        // 左右揺れ（アンカーから遠いほど大きく揺れる、ピンの影響を受ける）
        // 選択された部分のみ揺れる
        const swayX = shouldSway ? bounceParams.swayAmplitude * swayWave * Math.pow(distanceFromAnchor, 1.2) * pinMultiplier : 0;
        centerX[i] = swayX;
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
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        }
    };
}

// ===== WebGL描画 =====
function renderBounceWebGL(gl, img, mesh, canvasWidth, canvasHeight, originalWidth, originalHeight) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.useProgram(bounceProgram);
    
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
    gl.enableVertexAttribArray(bounceProgramInfo.attribLocations.position);
    gl.vertexAttribPointer(bounceProgramInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.texCoords), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(bounceProgramInfo.attribLocations.texCoord);
    gl.vertexAttribPointer(bounceProgramInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
    
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
    gl.uniform1i(bounceProgramInfo.uniformLocations.image, 0);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(texCoordBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteTexture(texture);
}

// ===== 揺れモーション適用 =====
function applyBounceWebGL(layerCtx, img, width, height, localTime, bounceParams, animationStartTime, anchorX, anchorY) {
    if (!bounceCanvas) initBounceWebGL();
    const gl = bounceGL;
    const canvas = bounceCanvas;
    
    // メッシュを生成してバウンディングボックスを取得
    const meshData = createBounceMeshWithBounds(bounceParams, width, height, localTime, animationStartTime, anchorX, anchorY);
    
    // バウンディングボックスのサイズを計算（余裕を持たせる）
    const padding = 200;
    const canvasWidth = meshData.bounds.width * 1.2 + padding * 2;
    const canvasHeight = meshData.bounds.height * 1.2 + padding * 2;
    
    // キャンバスサイズを設定
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    
    // WebGLで描画（widthとheightを渡す）
    renderBounceWebGL(gl, img, meshData.mesh, canvasWidth, canvasHeight, width, height);
    
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

// ===== 揺れモーションレイヤー描画 =====
function drawBounceLayer(layer, localTime) {
    // bounceParamsの初期化チェック
    if (!layer.bounceParams) {
        layer.bounceParams = getDefaultBounceParams();
    }
    if (!layer.bounceParams.pins) {
        layer.bounceParams.pins = [];
    }
    
    // アクティブなキーフレームを探す
    let activeKeyframe = null;
    let animationStartTime = 0;
    
    if (layer.bounceParams.keyframes && layer.bounceParams.keyframes.length > 0) {
        // 現在のフレームより前で最も近いキーフレームを探す
        const currentFrame = Math.floor(localTime * projectFPS);
        for (let i = layer.bounceParams.keyframes.length - 1; i >= 0; i--) {
            if (layer.bounceParams.keyframes[i].frame <= currentFrame) {
                activeKeyframe = layer.bounceParams.keyframes[i];
                animationStartTime = activeKeyframe.frame / projectFPS;
                break;
            }
        }
    }
    
    // アクティブなキーフレームがない場合は通常描画
    if (!activeKeyframe) {
        // ===== デバッグ：通常描画時の状態 =====
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[🖼️ DEBUG] 通常描画（キーフレームなし）');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // 親からの累積トランスフォームを取得
        const transform = getWorldTransformForLayer(layer);
        
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blendMode;
        
        // レイヤーの位置に移動
        ctx.translate(transform.x, transform.y);
        
        // アンカーポイントのオフセット（画像左上からアンカーまでの距離）
        const anchorOffsetX = layer.anchorX * layer.width;
        const anchorOffsetY = layer.anchorY * layer.height;
        
        console.log('📐 レイヤー情報:', {
            'layer.x': layer.x.toFixed(2),
            'layer.y': layer.y.toFixed(2),
            'layer.anchorX': layer.anchorX.toFixed(4),
            'layer.anchorY': layer.anchorY.toFixed(4)
        });
        console.log('📏 画像サイズ:', {
            'layer.width': layer.width,
            'layer.height': layer.height
        });
        console.log('📐 座標変換計算:', {
            'transform.x': transform.x.toFixed(2),
            'transform.y': transform.y.toFixed(2),
            anchorOffsetX: anchorOffsetX.toFixed(2),
            anchorOffsetY: anchorOffsetY.toFixed(2),
            'width/2': (layer.width / 2).toFixed(2),
            'height/2': (layer.height / 2).toFixed(2),
            'translate_offset_x': (anchorOffsetX - layer.width / 2).toFixed(2),
            'translate_offset_y': (anchorOffsetY - layer.height / 2).toFixed(2)
        });
        console.log('🎯 画像描画位置:', {
            drawImageX: (-anchorOffsetX).toFixed(2),
            drawImageY: (-anchorOffsetY).toFixed(2)
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // アンカーポイントを原点に移動
        ctx.translate(anchorOffsetX - layer.width / 2, anchorOffsetY - layer.height / 2);
        
        // 回転（アンカーポイントを中心に）
        ctx.rotate(transform.rotation * Math.PI / 180);
        
        // スケール（アンカーポイントを中心に）
        ctx.scale(transform.scale, transform.scale);
        
        // 画像を描画（アンカーポイントを基準に）
        ctx.drawImage(layer.img, -anchorOffsetX, -anchorOffsetY, layer.width, layer.height);
        
        // アンカーポイント表示 - 書き出し中は描画しない
        if (typeof isExporting === 'undefined' || !isExporting) {
            ctx.fillStyle = '#ffd700';  // 金色
            ctx.strokeStyle = '#ffffff';  // 白
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // 十字線
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-25, 0);
            ctx.lineTo(25, 0);
            ctx.moveTo(0, -25);
            ctx.lineTo(0, 25);
            ctx.stroke();
        }
        
        ctx.restore();
        return;
    }
    
    // 揺れモーションを適用（キーフレームのパラメータを使用）
    const transform = getWorldTransformForLayer(layer);
    
    // キーフレームから取得したパラメータ（または現在のパラメータ）
    const activeParams = {
        type: activeKeyframe.type || layer.bounceParams.type,
        amplitude: activeKeyframe.amplitude !== undefined ? activeKeyframe.amplitude : layer.bounceParams.amplitude,
        swayAmplitude: activeKeyframe.swayAmplitude !== undefined ? activeKeyframe.swayAmplitude : layer.bounceParams.swayAmplitude,
        frequency: activeKeyframe.frequency !== undefined ? activeKeyframe.frequency : layer.bounceParams.frequency,
        dampingTime: activeKeyframe.dampingTime !== undefined ? activeKeyframe.dampingTime : layer.bounceParams.dampingTime,
        bounceDirection: activeKeyframe.bounceDirection || layer.bounceParams.bounceDirection || 'up',
        swayDirection: activeKeyframe.swayDirection || layer.bounceParams.swayDirection,
        pins: activeKeyframe.pins || layer.bounceParams.pins || []
    };
    
    // 🔧 修正: 常に現在のレイヤーのアンカー座標を使用（いつでも再設定できるように）
    const keyframeAnchorX = layer.anchorX;
    const keyframeAnchorY = layer.anchorY;
    
    // アンカーポイントのオフセット（現在のアンカー座標を使用）
    const anchorOffsetX = keyframeAnchorX * layer.width;
    const anchorOffsetY = keyframeAnchorY * layer.height;
    
    // ===== デバッグ：キーフレーム描画時の状態を詳細ログ =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[🎨 DEBUG] キーフレーム描画時の状態');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎬 アクティブキーフレーム:', {
        frame: activeKeyframe.frame,
        type: activeKeyframe.type
    });
    console.log('📍 アンカー座標（常に現在のレイヤー値を使用）:', {
        anchorX: layer.anchorX.toFixed(4),
        anchorY: layer.anchorY.toFixed(4)
    });
    console.log('📐 現在のレイヤー値:', {
        'layer.x': layer.x.toFixed(2),
        'layer.y': layer.y.toFixed(2),
        'layer.anchorX': layer.anchorX.toFixed(4),
        'layer.anchorY': layer.anchorY.toFixed(4)
    });
    console.log('📏 画像サイズ（重要）:', {
        'layer.width': layer.width,
        'layer.height': layer.height,
        'img.width': layer.img ? layer.img.width : 'なし',
        'img.height': layer.img ? layer.img.height : 'なし'
    });
    console.log('✅ 描画に使用する値:', {
        transformX: transform.x.toFixed(2),
        transformY: transform.y.toFixed(2),
        keyframeAnchorX: keyframeAnchorX.toFixed(4),
        keyframeAnchorY: keyframeAnchorY.toFixed(4),
        'アンカーピクセルX': (keyframeAnchorX * layer.width).toFixed(2),
        'アンカーピクセルY': (keyframeAnchorY * layer.height).toFixed(2)
    });
    
    console.log('📐 座標変換計算:', {
        anchorOffsetX: anchorOffsetX.toFixed(2),
        anchorOffsetY: anchorOffsetY.toFixed(2),
        'width/2': (layer.width / 2).toFixed(2),
        'height/2': (layer.height / 2).toFixed(2),
        'translate_offset_x': (anchorOffsetX - layer.width / 2).toFixed(2),
        'translate_offset_y': (anchorOffsetY - layer.height / 2).toFixed(2)
    });
    console.log('🌍 ワールドトランスフォーム:', {
        worldX: transform.x.toFixed(2),
        worldY: transform.y.toFixed(2),
        worldRotation: transform.rotation.toFixed(2),
        worldScale: transform.scale.toFixed(2)
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    
    // 現在のレイヤー位置を使用（親の変換を含む）
    ctx.translate(transform.x, transform.y);
    
    // アンカーポイントを原点に移動
    ctx.translate(anchorOffsetX - layer.width / 2, anchorOffsetY - layer.height / 2);
    
    // 回転（アンカーポイントを中心に）
    ctx.rotate(transform.rotation * Math.PI / 180);
    
    // スケール（アンカーポイントを中心に）
    ctx.scale(transform.scale, transform.scale);
    
    // 揺れモーション適用（キーフレームのアンカー座標を使用）
    applyBounceWebGL(ctx, layer.img, layer.width, layer.height, localTime, activeParams, animationStartTime, keyframeAnchorX, keyframeAnchorY);
    
    // アンカーポイント表示 - 書き出し中は描画しない
    if (typeof isExporting === 'undefined' || !isExporting) {
        ctx.fillStyle = '#ffd700';  // 金色
        ctx.strokeStyle = '#ffffff';  // 白
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 十字線
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-25, 0);
        ctx.lineTo(25, 0);
        ctx.moveTo(0, -25);
        ctx.lineTo(0, 25);
        ctx.stroke();
    }
    
    ctx.restore();
}

// ===== ワールドトランスフォーム取得 =====
function getWorldTransformForLayer(layer) {
    let x = layer.x;
    let y = layer.y;
    let rotation = layer.rotation;
    let scale = layer.scale;
    
    // 親レイヤーを辿ってワールド座標を計算
    let parent = layers.find(l => l.id === layer.parentLayerId);
    while (parent) {
        // 親の回転を考慮して座標を変換
        const rad = parent.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        const scaledX = x * parent.scale;
        const scaledY = y * parent.scale;
        
        const rotatedX = scaledX * cos - scaledY * sin;
        const rotatedY = scaledX * sin + scaledY * cos;
        
        x = parent.x + rotatedX;
        y = parent.y + rotatedY;
        rotation += parent.rotation;
        scale *= parent.scale;
        
        parent = layers.find(l => l.id === parent.parentLayerId);
    }
    
    return { x, y, rotation, scale };
}

// ===== キーフレーム管理 =====
function addBounceKeyframe() {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'bounce') {
        alert('揺れモーションレイヤーを選択してください');
        return;
    }
    
    const currentFrame = Math.floor(currentTime * projectFPS);
    
    // ===== デバッグ：キーフレーム追加前の状態を詳細ログ =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[🔍 DEBUG] キーフレーム追加前の状態');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 レイヤー基本情報:', {
        id: layer.id,
        name: layer.name,
        type: layer.type
    });
    console.log('📐 レイヤー位置:', {
        x: layer.x.toFixed(2),
        y: layer.y.toFixed(2),
        rotation: layer.rotation.toFixed(2),
        scale: layer.scale.toFixed(2)
    });
    console.log('⚓ アンカーポイント:', {
        anchorX: layer.anchorX.toFixed(4),
        anchorY: layer.anchorY.toFixed(4),
        'アンカーのピクセル位置X': (layer.anchorX * layer.width).toFixed(2),
        'アンカーのピクセル位置Y': (layer.anchorY * layer.height).toFixed(2)
    });
    console.log('📏 画像サイズ:', {
        width: layer.width,
        height: layer.height
    });
    
    // 親レイヤー情報
    if (layer.parentLayerId) {
        const parent = layers.find(l => l.id === layer.parentLayerId);
        if (parent) {
            console.log('👪 親レイヤー情報:', {
                id: parent.id,
                name: parent.name,
                x: parent.x.toFixed(2),
                y: parent.y.toFixed(2),
                rotation: parent.rotation.toFixed(2),
                scale: parent.scale.toFixed(2)
            });
            
            // ワールド座標を計算
            const worldTransform = getWorldTransformForLayer(layer);
            console.log('🌍 ワールドトランスフォーム:', {
                worldX: worldTransform.x.toFixed(2),
                worldY: worldTransform.y.toFixed(2),
                worldRotation: worldTransform.rotation.toFixed(2),
                worldScale: worldTransform.scale.toFixed(2)
            });
        }
    } else {
        console.log('👪 親レイヤー: なし');
    }
    
    console.log('🎬 フレーム情報:', {
        currentFrame: currentFrame,
        currentTime: currentTime.toFixed(2) + '秒'
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // すでに同じフレームにキーフレームがある場合は削除
    const existingIndex = layer.bounceParams.keyframes.findIndex(kf => kf.frame === currentFrame);
    if (existingIndex !== -1) {
        layer.bounceParams.keyframes.splice(existingIndex, 1);
        console.log('[Bounce Keyframe] 既存削除');
    }
    
    // 新しいキーフレームを追加（現在のタイプとレイヤー状態を保存）
    const keyframeData = { 
        frame: currentFrame,
        type: layer.bounceParams.type, // 'bounce' or 'sway'
        amplitude: layer.bounceParams.amplitude,
        swayAmplitude: layer.bounceParams.swayAmplitude,
        frequency: layer.bounceParams.frequency,
        dampingTime: layer.bounceParams.dampingTime,
        bounceDirection: layer.bounceParams.bounceDirection, // 'up' or 'down'
        swayDirection: layer.bounceParams.swayDirection,
        pins: layer.bounceParams.pins ? JSON.parse(JSON.stringify(layer.bounceParams.pins)) : [], // ディープコピー
        // キーフレーム挿入時のレイヤー位置とアンカー座標を保存（描画位置ずれ防止）
        layerX: layer.x,
        layerY: layer.y,
        anchorX: layer.anchorX,
        anchorY: layer.anchorY
    };
    
    layer.bounceParams.keyframes.push(keyframeData);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[✅ DEBUG] キーフレーム追加完了');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 保存されたキーフレームデータ:', {
        frame: keyframeData.frame,
        type: keyframeData.type,
        layerX: keyframeData.layerX.toFixed(2),
        layerY: keyframeData.layerY.toFixed(2),
        anchorX: keyframeData.anchorX.toFixed(4),
        anchorY: keyframeData.anchorY.toFixed(4)
    });
    console.log('📊 キーフレーム総数:', layer.bounceParams.keyframes.length);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // フレーム番号順にソート
    layer.bounceParams.keyframes.sort((a, b) => a.frame - b.frame);
    
    updateBounceKeyframeList();
    updatePropertiesPanel();
    render();
}

function removeBounceKeyframe(frame) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer) return;
    
    const index = layer.bounceParams.keyframes.findIndex(kf => kf.frame === frame);
    if (index !== -1) {
        layer.bounceParams.keyframes.splice(index, 1);
        console.log('[Bounce Keyframe] キーフレーム削除', { frame, remainingKeyframes: layer.bounceParams.keyframes.length });
    }
    
    updateBounceKeyframeList();
    updatePropertiesPanel();
    render();
}

function updateBounceKeyframeList() {
    const keyframeList = document.getElementById('bounce-keyframe-list');
    if (!keyframeList) return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || !layer.bounceParams.keyframes || layer.bounceParams.keyframes.length === 0) {
        keyframeList.innerHTML = '<p style="text-align:center;color:var(--biscuit);padding:10px;font-size:12px;">キーフレームなし</p>';
        return;
    }
    
    console.log('[Bounce Keyframe] リスト更新', { keyframeCount: layer.bounceParams.keyframes.length });
    
    keyframeList.innerHTML = '';
    for (const kf of layer.bounceParams.keyframes) {
        const typeText = kf.type === 'sway' ? '🌊 揺れ' : '🎈 弾み';
        const pinCount = kf.pins ? kf.pins.length : 0;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--chocolate-light);border-radius:4px;margin-bottom:4px;';
        div.innerHTML = `
            <div style="font-size:11px;color:var(--biscuit-light);">
                ${typeText} ${kf.frame}f (${(kf.frame / projectFPS).toFixed(2)}秒)${pinCount > 0 ? ` 📍${pinCount}` : ''}
            </div>
            <button onclick="removeBounceKeyframe(${kf.frame})" style="padding:4px 8px;background:var(--chocolate-dark);color:white;border:none;border-radius:4px;cursor:pointer;">×</button>
        `;
        keyframeList.appendChild(div);
    }
}

// ===== 揺れモーション用ピン機能 =====
let bouncePinMode = false;
let bouncePinRange = 20;
let bouncePinElements = [];

function toggleBouncePinMode() {
    bouncePinMode = !bouncePinMode;
    
    // ピンモードを有効にする場合、他のモードを無効化
    if (bouncePinMode) {
        // アンカー設定モードを無効化
        if (typeof bounceAnchorClickMode !== 'undefined' && bounceAnchorClickMode) {
            bounceAnchorClickMode = false;
            const anchorBtn = document.getElementById('tool-anchor');
            if (anchorBtn) {
                anchorBtn.style.background = '';
                anchorBtn.style.boxShadow = '';
                anchorBtn.textContent = '🎯 クリック設定';
            }
        }
        // 風揺れピンモードを無効化
        if (typeof pinMode !== 'undefined' && pinMode) {
            pinMode = false;
            updatePinModeUI();
        }
    }
    
    updateBouncePinModeUI();
    if (!bouncePinMode) {
        clearBouncePinElements();
    } else {
        updateBouncePinElements();
    }
    // プロパティパネルを更新してボタンの表示を変える
    if (typeof updatePropertiesPanel === 'function') {
        updatePropertiesPanel();
    }
}

function updateBouncePinModeUI() {
    const btn = document.getElementById('addBouncePinBtn');
    if (btn) {
        if (bouncePinMode) {
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

function addBouncePinToCanvas(e) {
    if (!bouncePinMode) return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'bounce') {
        alert('揺れモーションレイヤーを選択してください');
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
        range: bouncePinRange,
        x: x,
        y: y
    };
    
    if (!layer.bounceParams.pins) {
        layer.bounceParams.pins = [];
    }
    layer.bounceParams.pins.push(pin);
    
    // ピンリストとビジュアル表示を更新
    updateBouncePinList();
    updateBouncePinElements();
    render();
}

function removeBouncePin(pinId) {
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || !layer.bounceParams.pins) return;
    const index = layer.bounceParams.pins.findIndex(p => p.id === pinId);
    if (index !== -1) layer.bounceParams.pins.splice(index, 1);
    updateBouncePinList();
    updateBouncePinElements();
    render();
}

function clearBouncePinElements() {
    const container = document.getElementById('canvasContainer');
    if (container) {
        const existingPins = container.querySelectorAll('.bounce-pin');
        existingPins.forEach((pin) => {
            container.removeChild(pin);
        });
    }
    bouncePinElements = [];
}

function updateBouncePinElements() {
    clearBouncePinElements();
    
    if (!bouncePinMode) {
        return;
    }
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || layer.type !== 'bounce' || !layer.bounceParams.pins) {
        return;
    }
    
    if (!layer.visible) {
        return;
    }
    
    const container = document.getElementById('canvasContainer');
    if (!container) {
        return;
    }
    
    // 各ピンの視覚的要素を作成
    layer.bounceParams.pins.forEach(pin => {
        const pinElement = document.createElement('img');
        pinElement.className = 'bounce-pin';
        
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
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        
        const pinAbsX = canvasRect.left + pin.x * scaleX;
        const pinAbsY = canvasRect.top + pin.y * scaleY;
        
        const containerRect = container.getBoundingClientRect();
        const left = pinAbsX - containerRect.left - 20;
        const top = pinAbsY - containerRect.top - 20;
        
        pinElement.style.left = left + 'px';
        pinElement.style.top = top + 'px';
        
        container.appendChild(pinElement);
        bouncePinElements.push(pinElement);
    });
}

function updateBouncePinList() {
    const pinList = document.getElementById('bounce-pin-list');
    if (!pinList) return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer || !layer.bounceParams.pins || layer.bounceParams.pins.length === 0) {
        pinList.innerHTML = '<p style="text-align:center;color:var(--biscuit);padding:10px;font-size:12px;">ピンなし</p>';
        return;
    }
    
    pinList.innerHTML = '';
    for (const pin of layer.bounceParams.pins) {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--chocolate-light);border-radius:4px;margin-bottom:4px;';
        div.innerHTML = `
            <div style="font-size:11px;color:var(--biscuit-light);">
                📍 位置: ${Math.round(pin.position)}% / 範囲: ${pin.range}%
            </div>
            <button onclick="removeBouncePin(${pin.id})" style="padding:4px 8px;background:var(--chocolate-dark);color:white;border:none;border-radius:4px;cursor:pointer;">×</button>
        `;
        pinList.appendChild(div);
    }
}

function updateBouncePinRange(value) {
    bouncePinRange = value;
    const rangeValue = document.getElementById('bouncePinRangeValue');
    if (rangeValue) {
        rangeValue.textContent = value + '%';
    }
}
