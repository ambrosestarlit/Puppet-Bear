/**
 * ⭐ Starlit Puppet Editor v1.1.6
 * ツール機能 - 回転ハンドル・ポジション
 * - 判定範囲を200pxに拡大
 */

// ===== ツール切り替え =====
function toggleTool(toolName) {
    if (currentTool === toolName) {
        // 同じツールをクリック = 未選択に戻す
        currentTool = 'none';
    } else {
        currentTool = toolName;
    }
    
    // ボタンのスタイルを更新
    updateToolButtons();
    
    // カーソルを更新
    updateCanvasCursor();
    
    render();
}

function updateToolButtons() {
    // プロパティパネル内のボタン（後方互換性のため）
    const rotationBtn = document.getElementById('tool-rotation');
    const positionBtn = document.getElementById('tool-position');
    
    // ヘッダーツールバーのボタン
    const headerRotationBtn = document.getElementById('header-tool-rotation');
    const headerPositionBtn = document.getElementById('header-tool-position');
    
    const activeStyle = 'linear-gradient(135deg, var(--accent-gold), var(--biscuit-medium))';
    const activeShadow = '0 0 10px rgba(255, 215, 0, 0.5)';
    
    // 回転ボタン
    if (rotationBtn) {
        if (currentTool === 'rotation') {
            rotationBtn.style.background = activeStyle;
            rotationBtn.style.boxShadow = activeShadow;
        } else {
            rotationBtn.style.background = '';
            rotationBtn.style.boxShadow = '';
        }
    }
    
    if (headerRotationBtn) {
        if (currentTool === 'rotation') {
            headerRotationBtn.classList.add('active');
        } else {
            headerRotationBtn.classList.remove('active');
        }
    }
    
    // ポジションボタン
    if (positionBtn) {
        if (currentTool === 'position') {
            positionBtn.style.background = activeStyle;
            positionBtn.style.boxShadow = activeShadow;
        } else {
            positionBtn.style.background = '';
            positionBtn.style.boxShadow = '';
        }
    }
    
    if (headerPositionBtn) {
        if (currentTool === 'position') {
            headerPositionBtn.classList.add('active');
        } else {
            headerPositionBtn.classList.remove('active');
        }
    }
    
    // ヘッダーツールバーの表示状態を更新
    updateHeaderToolbar();
}

function updateCanvasCursor() {
    if (anchorPointPickMode) {
        canvas.style.cursor = 'crosshair';
    } else if (currentTool === 'rotation') {
        canvas.style.cursor = 'grab';
    } else if (currentTool === 'position') {
        canvas.style.cursor = 'move';
    } else {
        canvas.style.cursor = 'default';
    }
}

// ===== キャンバスマウスイベント =====
function handleCanvasMouseDown(e) {
    // アンカーポイント設定モードが優先
    if (anchorPointPickMode) return;
    
    // ピンモードが優先（風揺れ）
    if (pinMode) return;
    
    // レイヤーが選択されていない、またはツールが選択されていない、または複数選択時
    if (selectedLayerIds.length !== 1 || currentTool === 'none') return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // 選択中のレイヤーの範囲をチェック
    if (isPointInLayer(mouseX, mouseY, layer)) {
        isDragging = true;
        dragStart = { x: mouseX, y: mouseY };
        
        if (currentTool === 'rotation') {
            dragInitialValue.rotation = layer.rotation;
        } else if (currentTool === 'position') {
            dragInitialValue.x = layer.x;
            dragInitialValue.y = layer.y;
        }
        
        canvas.style.cursor = currentTool === 'rotation' ? 'grabbing' : 'move';
        e.preventDefault();
    }
}

function handleCanvasMouseMove(e) {
    if (!isDragging || selectedLayerIds.length !== 1) return;
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    if (currentTool === 'rotation') {
        // アンカーポイントの画面座標
        let anchorScreenX = layer.x;
        let anchorScreenY = layer.y;
        
        // フォルダの場合はanchorOffsetを加算
        if (layer.type === 'folder') {
            anchorScreenX += (layer.anchorOffsetX || 0);
            anchorScreenY += (layer.anchorOffsetY || 0);
        }
        
        // 開始点と現在点の角度を計算
        const startAngle = Math.atan2(dragStart.y - anchorScreenY, dragStart.x - anchorScreenX);
        const currentAngle = Math.atan2(mouseY - anchorScreenY, mouseX - anchorScreenX);
        
        // 角度の差分（度）
        const angleDelta = (currentAngle - startAngle) * 180 / Math.PI;
        
        // 新しい回転角度
        layer.rotation = dragInitialValue.rotation + angleDelta;
        
    } else if (currentTool === 'position') {
        // 位置の差分
        const dx = mouseX - dragStart.x;
        const dy = mouseY - dragStart.y;
        
        // 新しい位置
        layer.x = dragInitialValue.x + dx;
        layer.y = dragInitialValue.y + dy;
    }
    
    render();
    
    // プロパティパネルの数値を更新
    updatePropertyValues(layer);
}

function handleCanvasMouseUp(e) {
    if (isDragging) {
        isDragging = false;
        updateCanvasCursor();
        
        // ツール使用時にキーフレームを自動挿入
        if (selectedLayerIds.length === 1) {
            const layer = layers.find(l => l.id === selectedLayerIds[0]);
            if (layer && typeof autoInsertKeyframe === 'function') {
                if (currentTool === 'rotation') {
                    autoInsertKeyframe(layer.id, { rotation: layer.rotation });
                } else if (currentTool === 'position') {
                    autoInsertKeyframe(layer.id, { x: layer.x, y: layer.y });
                }
            }
        }
        
        // プロパティパネルを完全に更新
        updatePropertiesPanel();
        
        // 履歴を保存
        if (typeof saveHistory === 'function') {
            saveHistory();
        }
    }
}

// ===== レイヤー内の点判定 =====
function isPointInLayer(mouseX, mouseY, layer) {
    // フォルダの場合は常にtrueを返す（キャンバスのどこでも操作可能）
    if (layer.type === 'folder') {
        return true;
    }
    
    // アンカーポイントのオフセット
    const anchorOffsetX = layer.anchorX * layer.width;
    const anchorOffsetY = layer.anchorY * layer.height;
    
    // 親の変形を考慮したワールド座標を計算
    // 描画時は ctx.translate(layer.x, layer.y) の後に
    // ctx.translate(anchorOffsetX - layer.width / 2, anchorOffsetY - layer.height / 2) しているので
    // これを考慮した座標を初期値とする
    let worldX = layer.x + (anchorOffsetX - layer.width / 2);
    let worldY = layer.y + (anchorOffsetY - layer.height / 2);
    let worldRotation = layer.rotation;
    let worldScale = layer.scale;
    
    // 親を遡ってワールド座標を計算
    let currentLayer = layer;
    while (currentLayer.parentLayerId) {
        const parent = layers.find(l => l.id === currentLayer.parentLayerId);
        if (!parent) break;
        
        // フォルダの場合（widthとheightがないので簡略化）
        if (parent.type === 'folder') {
            // 親のスケールを適用
            let relX = worldX * parent.scale;
            let relY = worldY * parent.scale;
            
            // 親の回転を適用
            const parentRad = parent.rotation * Math.PI / 180;
            const cos = Math.cos(parentRad);
            const sin = Math.sin(parentRad);
            
            const rotatedX = relX * cos - relY * sin;
            const rotatedY = relX * sin + relY * cos;
            
            // 親の位置を加算
            worldX = rotatedX + parent.x;
            worldY = rotatedY + parent.y;
            worldRotation += parent.rotation;
            worldScale *= parent.scale;
            
            currentLayer = parent;
            continue;
        }
        
        // 画像レイヤーの場合、親の変形を適用
        const parentAnchorOffsetX = parent.anchorX * parent.width;
        const parentAnchorOffsetY = parent.anchorY * parent.height;
        
        // 親のスケールを適用
        let relX = worldX * parent.scale;
        let relY = worldY * parent.scale;
        
        // 親の回転を適用
        const parentRad = parent.rotation * Math.PI / 180;
        const cos = Math.cos(parentRad);
        const sin = Math.sin(parentRad);
        
        const rotatedX = relX * cos - relY * sin;
        const rotatedY = relX * sin + relY * cos;
        
        // 親の位置を加算
        worldX = rotatedX + parent.x + (parentAnchorOffsetX - parent.width / 2);
        worldY = rotatedY + parent.y + (parentAnchorOffsetY - parent.height / 2);
        worldRotation += parent.rotation;
        worldScale *= parent.scale;
        
        currentLayer = parent;
    }
    
    // ワールド座標での回転中心位置を使用
    const layerCenterX = worldX;
    const layerCenterY = worldY;
    
    // 回転を逆適用してローカル座標に変換（ワールド回転を使用）
    const rad = -worldRotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const offsetX = mouseX - layerCenterX;
    const offsetY = mouseY - layerCenterY;
    
    const localX = offsetX * cos - offsetY * sin;
    const localY = offsetX * sin + offsetY * cos;
    
    // ワールドスケールを考慮
    const scaledWidth = layer.width * worldScale;
    const scaledHeight = layer.height * worldScale;
    
    // マージン（風揺れON、揺れモーション、口パクレイヤーの場合は拡大）
    const margin = (layer.windSwayEnabled || layer.type === 'bounce' || layer.type === 'sequence') ? 200 : 80;
    
    // アンカーポイントもワールドスケールを適用
    const scaledAnchorOffsetX = anchorOffsetX * worldScale;
    const scaledAnchorOffsetY = anchorOffsetY * worldScale;
    
    const left = -scaledAnchorOffsetX - margin;
    const right = (scaledWidth - scaledAnchorOffsetX) + margin;
    const top = -scaledAnchorOffsetY - margin;
    const bottom = (scaledHeight - scaledAnchorOffsetY) + margin;
    
    return localX >= left && localX <= right && localY >= top && localY <= bottom;
}

// ===== 回転ハンドル描画 =====
// ドラッグで回転できるため削除

// ===== プロパティ値のリアルタイム更新 =====
function updatePropertyValues(layer) {
    // 数値表示を更新
    const xValue = document.getElementById('transformXValue');
    const yValue = document.getElementById('transformYValue');
    const rotValue = document.getElementById('transformRotValue');
    
    if (xValue) xValue.textContent = layer.x.toFixed(0);
    if (yValue) yValue.textContent = layer.y.toFixed(0);
    if (rotValue) rotValue.textContent = layer.rotation.toFixed(1) + '°';
}
