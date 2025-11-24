/**
 * ⭐ Starlit Puppet Editor v1.10.1
 * コア機能 - レイヤー管理・描画
 * - フォルダ間親子関係の描画対応
 * - パペット・バウンスレイヤーの親変形対応
 */

// ===== 画像読み込み =====
function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const layer = {
                id: nextLayerId++,
                type: 'image',
                name: file.name,
                img: img,
                x: canvas.width / 2,
                y: canvas.height / 2,
                width: img.width,
                height: img.height,
                rotation: 0,
                scale: 1,
                opacity: 1.0, // 不透明度
                anchorX: 0.5,
                anchorY: 0.5,
                visible: true,
                blendMode: 'source-over', // ブレンドモード
                
                // パペット機能
                parentLayerId: null,
                
                // 風揺れ機能
                windSwayEnabled: false,
                windSwayParams: getDefaultWindSwayParams(),
                
                // 色抜きクリッピング機能
                colorClipping: {
                    enabled: false,
                    referenceLayerId: null,
                    color: { r: 0, g: 255, b: 0 },
                    tolerance: 30,
                    invertClipping: false
                },
                
                // デフォルトキーフレーム（フレーム0に初期位置を設定）
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
            selectLayer(layer.id, false); // 単一選択
            
            // 初期キーフレームを適用
            if (typeof applyKeyframeInterpolation === 'function') {
                applyKeyframeInterpolation();
            }
            
            render();
            
            // 履歴を保存
            if (typeof saveHistory === 'function') {
                saveHistory();
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ===== 連番画像読み込み（口パク・まばたき用） =====
function loadSequenceImages(files, callback) {
    const images = [];
    let loadedCount = 0;
    
    // ファイルを名前順にソート
    const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));
    
    sortedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                images[index] = img;
                loadedCount++;
                
                if (loadedCount === sortedFiles.length) {
                    callback(images);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ===== 描画 =====
function render() {
    // キャンバスクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 現在の時間を取得（アニメーション用）
    const localTime = currentTime;
    
    // レイヤーを描画（親子関係とフォルダを考慮）
    layers.forEach(layer => {
        if (!layer.visible) return;
        
        // フォルダの場合
        if (layer.type === 'folder') {
            // フォルダに風揺れが有効な場合は特別処理
            if (layer.windSwayEnabled) {
                drawFolderWithWindSway(layer, localTime);
            } else {
                // 子レイヤーを通常通り描画（子レイヤー自身が描画される）
                // フォルダ自体は何も描画しない
            }
            return;
        }
        
        // 画像レイヤーの場合
        // 親がフォルダで、親に風揺れが有効な場合はスキップ（親が一括描画）
        const parent = layers.find(l => l.id === layer.parentLayerId);
        if (parent && parent.type === 'folder' && parent.windSwayEnabled) {
            return;
        }
        
        // 口パクレイヤーとまばたきレイヤーは専用描画
        if (layer.type === 'lipsync') {
            drawLipSyncLayer(layer, localTime);
            return;
        }
        
        if (layer.type === 'blink') {
            drawBlinkLayer(layer, localTime);
            return;
        }
        
        // 揺れモーションレイヤーは専用描画
        if (layer.type === 'bounce') {
            drawBounceLayer(layer, localTime);
            return;
        }
        
        // パペットレイヤーは専用描画
        if (layer.type === 'puppet') {
            drawPuppetLayer(layer, localTime);
            
            // 軸アンカー（赤い十字マーク）を描画 - 書き出し中は描画しない
            if (typeof isExporting === 'undefined' || !isExporting) {
                ctx.save();
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
                
                ctx.translate(finalX, finalY);
                ctx.rotate(finalRotation * Math.PI / 180);
                ctx.scale(finalScale, finalScale);
                
                // アンカーポイントの円
                ctx.fillStyle = '#ff6b6b';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3 / finalScale;
            ctx.beginPath();
            ctx.arc(0, 0, 10 / finalScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // 十字線（大きく）
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 3 / finalScale;
            ctx.beginPath();
            ctx.moveTo(-25 / finalScale, 0);
            ctx.lineTo(25 / finalScale, 0);
            ctx.moveTo(0, -25 / finalScale);
            ctx.lineTo(0, 25 / finalScale);
            ctx.stroke();
            
            ctx.restore();
            }
            return;
        }
        
        // 色抜きクリッピングが有効な場合は一時キャンバスを使用
        const useClipping = layer.colorClipping && layer.colorClipping.enabled && layer.colorClipping.referenceLayerId;
        
        let tempCanvas, tempCtx;
        if (useClipping) {
            tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx = tempCanvas.getContext('2d');
            tempCtx.save();
        } else {
            ctx.save();
        }
        
        const targetCtx = useClipping ? tempCtx : ctx;
        
        // 不透明度とブレンドモードを適用
        targetCtx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
        targetCtx.globalCompositeOperation = layer.blendMode || 'source-over';
        
        // 親の変形を適用（パペット追従を含む）
        // useClippingの場合もそうでない場合も、targetCtxを渡す
        let isFollowingPuppet = false;
        if (layer.followPuppetAnchor && layer.followPuppetAnchor.layerId && typeof getPuppetFollowPosition === 'function') {
            // パペットアンカーに追従する場合
            const followPos = getPuppetFollowPosition(layer.followPuppetAnchor);
            console.log('🎯 [追従描画] レイヤー:', layer.name, 'followPos:', followPos, 'layer.x:', layer.x, 'layer.y:', layer.y);
            if (followPos && !isNaN(followPos.x) && !isNaN(followPos.y)) {
                targetCtx.translate(followPos.x, followPos.y);
                isFollowingPuppet = true;
            } else {
                console.error('❌ [追従描画] 無効な座標:', followPos);
            }
        } else if (useClipping) {
            applyParentTransformToContext(tempCtx, layer);
        } else {
            applyParentTransform(layer);
        }
        
        // レイヤーの位置に移動（追従中は相対オフセットとして適用しない、または小さな値のみ）
        // 追従設定時は、画像をハンドル位置を中心に配置する
        if (!isFollowingPuppet) {
            targetCtx.translate(layer.x, layer.y);
        }
        // 追従中でもオフセットが必要な場合はここで適用（現在は無視）
        
        // アンカーポイントのオフセット（画像左上からアンカーまでの距離）
        const anchorOffsetX = layer.anchorX * layer.width;
        const anchorOffsetY = layer.anchorY * layer.height;
        
        // アンカーポイントを原点に移動
        targetCtx.translate(anchorOffsetX - layer.width / 2, anchorOffsetY - layer.height / 2);
        
        // 回転（アンカーポイントを中心に）
        targetCtx.rotate(layer.rotation * Math.PI / 180);
        
        // スケール（アンカーポイントを中心に）
        targetCtx.scale(layer.scale, layer.scale);
        
        if (layer.windSwayEnabled) {
            // 風揺れ適用
            if (useClipping) {
                // 風揺れ用に一時的にグローバルコンテキストを切り替え
                const originalCtx = ctx;
                ctx = tempCtx;
                drawLayerWithWindSway(layer, -anchorOffsetX, -anchorOffsetY, localTime);
                ctx = originalCtx;
            } else {
                drawLayerWithWindSway(layer, -anchorOffsetX, -anchorOffsetY, localTime);
            }
        } else {
            // 通常描画（アンカーポイントを基準に）
            // 画像が存在することを確認
            if (!layer.img) {
                console.error('❌ [描画エラー] layer.imgが存在しません:', layer.name);
                ctx.restore();
                return;
            }
            if (isNaN(anchorOffsetX) || isNaN(anchorOffsetY) || isNaN(layer.width) || isNaN(layer.height)) {
                console.error('❌ [描画エラー] 無効な値:', {
                    name: layer.name,
                    anchorOffsetX, anchorOffsetY,
                    width: layer.width, height: layer.height
                });
            }
            targetCtx.drawImage(
                layer.img,
                -anchorOffsetX,
                -anchorOffsetY,
                layer.width,
                layer.height
            );
        }
        
        // アンカーポイントを常に表示（風揺れON/OFF関係なく）- 書き出し中は描画しない
        if (typeof isExporting === 'undefined' || !isExporting) {
            // アンカーポイントの円
            targetCtx.fillStyle = '#ff6b6b';
            targetCtx.strokeStyle = '#ffffff';
            targetCtx.lineWidth = 3;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 10, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.stroke();
            
            // 十字線（大きく）
            targetCtx.strokeStyle = '#ff6b6b';
            targetCtx.lineWidth = 3;
            targetCtx.beginPath();
            targetCtx.moveTo(-25, 0);
            targetCtx.lineTo(25, 0);
            targetCtx.moveTo(0, -25);
            targetCtx.lineTo(0, 25);
            targetCtx.stroke();
        }
        
        if (useClipping) {
            tempCtx.restore();
            
            // 色抜きクリッピングマスクを生成
            const mask = createColorClippingMask(layer);
            if (mask) {
                // 一時キャンバスにマスクを適用
                tempCtx.globalCompositeOperation = 'destination-in';
                tempCtx.drawImage(mask, 0, 0);
                tempCtx.globalCompositeOperation = 'source-over';
            }
            
            // メインキャンバスに描画
            ctx.save();
            ctx.globalCompositeOperation = layer.blendMode || 'source-over';
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
        } else {
            ctx.restore();
        }
    });
    
    // ピン表示を更新（風揺れピンモードがONの場合）
    if (pinMode && selectedLayerIds.length === 1) {
        const layer = layers.find(l => l.id === selectedLayerIds[0]);
        if (layer && layer.visible && layer.type === 'image') {
            // 書き出し中はピン要素を更新しない
            if (typeof isExporting === 'undefined' || !isExporting) {
                updatePinElements();
            }
        }
    }
    
    // パペットアンカー表示を更新（関数内部で判定）
    // 書き出し中はアンカーを描画しない
    if (typeof drawPuppetAnchorElements === 'function' && (typeof isExporting === 'undefined' || !isExporting)) {
        drawPuppetAnchorElements();
    }
    
    // 回転ハンドルは不要（ドラッグで回転できるため削除）
}

// ===== 口パクレイヤー描画 =====
function drawLipSyncLayer(layer, time) {
    if (!layer.sequenceImages || layer.sequenceImages.length === 0) return;
    
    ctx.save();
    
    // 不透明度とブレンドモードを適用
    ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    
    // 親の変形を適用
    applyParentTransform(layer);
    
    // レイヤーの位置に移動
    ctx.translate(layer.x, layer.y);
    
    // 現在表示すべき画像を決定
    let currentImg = layer.sequenceImages[0]; // デフォルトは閉じた口（最初のフレーム）
    let width = layer.sequenceImages[0].width;
    let height = layer.sequenceImages[0].height;
    
    // キーフレームを時間順にソート
    const sortedKeyframes = (layer.keyframes || []).slice().sort((a, b) => a.frame - b.frame);
    
    // 現在のフレーム番号を計算（30fps想定）
    const currentFrame = Math.floor(time * (typeof projectFPS !== "undefined" ? projectFPS : 30));
    
    // 喋っている区間を判定
    let isSpeaking = false;
    let speakStartFrame = 0;
    
    for (let i = 0; i < sortedKeyframes.length; i++) {
        const kf = sortedKeyframes[i];
        
        if (kf.type === 'start' && currentFrame >= kf.frame) {
            isSpeaking = true;
            speakStartFrame = kf.frame;
        }
        
        if (kf.type === 'end' && currentFrame >= kf.frame) {
            isSpeaking = false;
        }
    }
    
    // 喋っている場合は連番アニメーションをループ
    if (isSpeaking && layer.sequenceImages.length > 1) {
        const fps = layer.fps || 12;
        const framesSinceStart = currentFrame - speakStartFrame;
        const sequenceLength = layer.sequenceImages.length - 1; // 最初のフレーム（閉じた口）を除く
        const seqIndex = Math.floor((framesSinceStart * fps / 30) % sequenceLength);
        currentImg = layer.sequenceImages[seqIndex + 1]; // +1 で閉じた口をスキップ
        width = currentImg.width;
        height = currentImg.height;
    }
    
    // アンカーポイントのオフセット
    const anchorOffsetX = layer.anchorX * width;
    const anchorOffsetY = layer.anchorY * height;
    
    // アンカーポイントを原点に移動
    ctx.translate(anchorOffsetX - width / 2, anchorOffsetY - height / 2);
    
    // 回転（アンカーポイントを中心に）
    ctx.rotate(layer.rotation * Math.PI / 180);
    
    // スケール（アンカーポイントを中心に）
    ctx.scale(layer.scale, layer.scale);
    
    // 画像を描画
    ctx.drawImage(
        currentImg,
        -anchorOffsetX,
        -anchorOffsetY,
        width,
        height
    );
    
    // アンカーポイント表示 - 書き出し中は描画しない
    if (typeof isExporting === 'undefined' || !isExporting) {
        ctx.fillStyle = '#ff69b4';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.strokeStyle = '#ff69b4';
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

// ===== まばたきレイヤー描画 =====
function drawBlinkLayer(layer, time) {
    if (!layer.sequenceImages || layer.sequenceImages.length === 0) return;
    
    ctx.save();
    
    // 不透明度とブレンドモードを適用
    ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    
    // 親の変形を適用
    applyParentTransform(layer);
    
    // レイヤーの位置に移動
    ctx.translate(layer.x, layer.y);
    
    // 現在表示すべき画像を決定
    let currentImg = layer.sequenceImages[0]; // デフォルトは開いた目（最初のフレーム）
    let width = layer.sequenceImages[0].width;
    let height = layer.sequenceImages[0].height;
    
    // 現在のフレーム番号を計算（30fps想定）
    const currentFrame = Math.floor(time * (typeof projectFPS !== "undefined" ? projectFPS : 30));
    
    // まばたきアニメーション中かチェック
    const sortedKeyframes = (layer.keyframes || []).slice().sort((a, b) => a.frame - b.frame);
    
    for (const kf of sortedKeyframes) {
        if (currentFrame >= kf.frame) {
            const framesSinceStart = currentFrame - kf.frame;
            const fps = layer.fps || 12;
            const totalAnimFrames = (layer.sequenceImages.length - 1) * (30 / fps);
            
            // まばたきアニメーションの長さ内ならアニメーション再生
            if (framesSinceStart < totalAnimFrames) {
                const seqIndex = Math.floor(framesSinceStart * fps / 30);
                if (seqIndex < layer.sequenceImages.length - 1) {
                    currentImg = layer.sequenceImages[seqIndex + 1]; // +1 で開いた目をスキップ
                    width = currentImg.width;
                    height = currentImg.height;
                }
            }
        }
    }
    
    // アンカーポイントのオフセット
    const anchorOffsetX = layer.anchorX * width;
    const anchorOffsetY = layer.anchorY * height;
    
    // アンカーポイントを原点に移動
    ctx.translate(anchorOffsetX - width / 2, anchorOffsetY - height / 2);
    
    // 回転（アンカーポイントを中心に）
    ctx.rotate(layer.rotation * Math.PI / 180);
    
    // スケール（アンカーポイントを中心に）
    ctx.scale(layer.scale, layer.scale);
    
    // 画像を描画
    ctx.drawImage(
        currentImg,
        -anchorOffsetX,
        -anchorOffsetY,
        width,
        height
    );
    
    // アンカーポイント表示 - 書き出し中は描画しない
    if (typeof isExporting === 'undefined' || !isExporting) {
        ctx.fillStyle = '#87ceeb';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.strokeStyle = '#87ceeb';
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

// ===== 親の変形を適用 =====
function applyParentTransform(layer) {
    // パペットアンカーに追従する場合
    if (layer.followPuppetAnchor && layer.followPuppetAnchor.layerId && typeof getPuppetFollowPosition === 'function') {
        const followPos = getPuppetFollowPosition(layer.followPuppetAnchor);
        ctx.translate(followPos.x, followPos.y);
        return;
    }
    
    if (!layer.parentLayerId) return;
    
    const parent = layers.find(l => l.id === layer.parentLayerId);
    if (!parent) return;
    
    // 親の変形を再帰的に適用（親がフォルダでも他のレイヤーでも処理）
    applyParentTransform(parent);
    
    // 親の位置に移動
    ctx.translate(parent.x, parent.y);
    
    // フォルダの場合（ピクセルオフセットでアンカー計算）
    if (parent.type === 'folder') {
        const anchorOffsetX = parent.anchorOffsetX || 0;
        const anchorOffsetY = parent.anchorOffsetY || 0;
        
        // アンカーポイントを原点に移動
        ctx.translate(anchorOffsetX, anchorOffsetY);
        ctx.rotate(parent.rotation * Math.PI / 180);
        ctx.scale(parent.scale, parent.scale);
        return;
    }
    
    // パペットレイヤーの場合
    if (parent.type === 'puppet') {
        if (parent.img) {
            const parentWidth = parent.img.width;
            const parentHeight = parent.img.height;
            const parentAnchorOffsetX = parent.anchorX * parentWidth;
            const parentAnchorOffsetY = parent.anchorY * parentHeight;
            ctx.translate(parentAnchorOffsetX - parentWidth / 2, parentAnchorOffsetY - parentHeight / 2);
        }
        ctx.rotate(parent.rotation * Math.PI / 180);
        ctx.scale(parent.scale, parent.scale);
        return;
    }
    
    // 画像レイヤー、口パク、まばたき、バウンスレイヤーの場合
    let parentWidth, parentHeight;
    
    if (parent.type === 'lipsync' || parent.type === 'blink') {
        // 口パク・まばたきレイヤーの場合は最初の画像のサイズを使用
        if (parent.sequenceImages && parent.sequenceImages.length > 0) {
            parentWidth = parent.sequenceImages[0].width;
            parentHeight = parent.sequenceImages[0].height;
        } else {
            return;
        }
    } else if (parent.type === 'bounce') {
        if (parent.img) {
            parentWidth = parent.img.width;
            parentHeight = parent.img.height;
        } else {
            return;
        }
    } else {
        // 通常の画像レイヤー
        parentWidth = parent.width;
        parentHeight = parent.height;
    }
    
    // 親のアンカーポイントのオフセット
    const parentAnchorOffsetX = parent.anchorX * parentWidth;
    const parentAnchorOffsetY = parent.anchorY * parentHeight;
    
    // 親のアンカーポイントを原点に移動
    ctx.translate(parentAnchorOffsetX - parentWidth / 2, parentAnchorOffsetY - parentHeight / 2);
    
    // 親の回転（アンカーポイントを中心に）
    ctx.rotate(parent.rotation * Math.PI / 180);
    
    // 親のスケール（アンカーポイントを中心に）
    ctx.scale(parent.scale, parent.scale);
}
