/**
 * ⭐ Starlit Puppet Editor v1.12.0
 * レイヤーリスト・フォルダ機能
 * - チェックボックスによる複数選択（タブレット対応）
 * - ZIP/PSD一括読み込み
 * - レイヤー種類変更機能
 * - フォルダ同士の親子関係表示対応
 */

// ===== レイヤーリスト更新 =====
function updateLayerList() {
    layerList.innerHTML = '';
    
    // ヘッダー（リネームボタン付き）
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 8px; background: var(--chocolate-medium); border-radius: 4px;';
    header.innerHTML = `
        <span style="flex: 1; font-weight: bold; color: var(--biscuit-light);">📚 レイヤー</span>
        <button onclick="selectAllLayers()" style="padding: 4px 8px; background: var(--chocolate-light); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;" title="全選択">☑️</button>
        <button onclick="deselectAllLayers()" style="padding: 4px 8px; background: var(--chocolate-light); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;" title="選択解除">☐</button>
        <button onclick="showRenameDialog()" style="padding: 4px 8px; background: var(--accent-orange); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">✏️ リネーム</button>
    `;
    layerList.appendChild(header);
    
    // 説明
    const info = document.createElement('div');
    info.style.cssText = 'font-size: 11px; color: var(--biscuit); padding: 4px 8px; margin-bottom: 8px; background: var(--chocolate-dark); border-radius: 4px;';
    info.innerHTML = '💡 上のレイヤーが前面に表示されます<br>☑️ チェックボックスで複数選択';
    layerList.appendChild(info);
    
    // ルートレベルのレイヤーを表示（逆順：上にあるほど上に表示）
    const rootLayers = layers.filter(l => !l.parentLayerId);
    // 逆順で表示
    for (let i = rootLayers.length - 1; i >= 0; i--) {
        renderLayerItem(rootLayers[i], 0);
    }
    
    // レイヤー追加ボタン群
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'layer-buttons-container';
    buttonContainer.style.cssText = 'display: flex !important; flex-direction: column; gap: 8px; margin-top: 8px; visibility: visible !important;';
    
    // フォルダ作成ボタン
    const folderBtn = document.createElement('button');
    folderBtn.textContent = '📁 フォルダ作成';
    folderBtn.className = 'create-folder-btn';
    folderBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, var(--biscuit-dark), var(--biscuit-medium)); color: var(--chocolate-dark); border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    folderBtn.onclick = createFolderFromSelection;
    buttonContainer.appendChild(folderBtn);
    
    // 画像追加ボタン（ZIP/PSD対応）
    const imageBtn = document.createElement('button');
    imageBtn.id = 'add-image-btn';
    imageBtn.textContent = '📷 画像/ZIP追加';
    imageBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, var(--biscuit-dark), var(--biscuit-medium)); color: var(--chocolate-dark); border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    imageBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.zip,.psd';
        input.multiple = true;
        input.onchange = (e) => {
            handleImageFilesInput(e.target.files);
        };
        input.click();
    };
    buttonContainer.appendChild(imageBtn);
    
    // 口パクレイヤー追加ボタン
    const lipSyncBtn = document.createElement('button');
    lipSyncBtn.textContent = '💬 口パク追加';
    lipSyncBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, #ff69b4, #ff1493); color: white; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    lipSyncBtn.onclick = createLipSyncLayer;
    buttonContainer.appendChild(lipSyncBtn);
    
    // まばたきレイヤー追加ボタン
    const blinkBtn = document.createElement('button');
    blinkBtn.textContent = '👀 まばたき追加';
    blinkBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, #87ceeb, #4682b4); color: white; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    blinkBtn.onclick = createBlinkLayer;
    buttonContainer.appendChild(blinkBtn);
    
    // 揺れモーションレイヤー追加ボタン
    const bounceBtn = document.createElement('button');
    bounceBtn.textContent = '🎈 揺れモーション追加';
    bounceBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, #ffa500, #ff8c00); color: white; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    bounceBtn.onclick = createBounceLayer;
    buttonContainer.appendChild(bounceBtn);
    
    // パペットレイヤー追加ボタン
    const puppetBtn = document.createElement('button');
    puppetBtn.textContent = '🎭 パペット追加';
    puppetBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, #9370db, #8a2be2); color: white; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    puppetBtn.onclick = createPuppetLayer;
    buttonContainer.appendChild(puppetBtn);
    
    // 音声レイヤー追加ボタン
    const audioBtn = document.createElement('button');
    audioBtn.textContent = '🎵 音声追加';
    audioBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, #1db954, #1ed760); color: white; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; display: block !important; visibility: visible !important;';
    audioBtn.onclick = createAudioLayer;
    buttonContainer.appendChild(audioBtn);
    
    layerList.appendChild(buttonContainer);
    
    // タイムラインを更新
    if (typeof updateTimeline === 'function') {
        updateTimeline();
    }
}

// ===== 全選択/選択解除 =====
function selectAllLayers() {
    selectedLayerIds = layers.map(l => l.id);
    updateLayerList();
    updatePropertiesPanel();
}

function deselectAllLayers() {
    selectedLayerIds = [];
    updateLayerList();
    updatePropertiesPanel();
}

// ===== 画像ファイル入力処理（ZIP/複数ファイル対応） =====
async function handleImageFilesInput(files) {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    
    // ZIPファイルがあるか確認
    const zipFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const imageFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith('.zip') && !f.name.toLowerCase().endsWith('.psd'));
    const psdFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.psd'));
    
    // ZIPファイルを処理
    for (const zipFile of zipFiles) {
        await loadImagesFromZip(zipFile);
    }
    
    // PSDファイルを処理（簡易対応）
    for (const psdFile of psdFiles) {
        alert('PSDファイルは現在サポートされていません。PNGまたはZIPに変換してお使いください。');
    }
    
    // 通常の画像ファイルを処理
    if (imageFiles.length > 0) {
        // 連番でソート
        const sortedFiles = sortFilesByNumber(imageFiles);
        for (const file of sortedFiles) {
            await loadImageWithOriginalName(file);
        }
    }
}

// ===== ZIPから画像を一括読み込み =====
async function loadImagesFromZip(zipFile) {
    if (typeof JSZip === 'undefined') {
        alert('JSZipライブラリが読み込まれていません。');
        return;
    }
    
    try {
        const zip = await JSZip.loadAsync(zipFile);
        const imageEntries = [];
        
        // 画像ファイルを抽出
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                const lowerName = relativePath.toLowerCase();
                if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || 
                    lowerName.endsWith('.jpeg') || lowerName.endsWith('.gif') ||
                    lowerName.endsWith('.webp')) {
                    imageEntries.push({
                        path: relativePath,
                        entry: zipEntry,
                        // ファイル名のみ取得
                        name: relativePath.split('/').pop()
                    });
                }
            }
        });
        
        // 連番でソート
        imageEntries.sort((a, b) => {
            return compareFileNames(a.name, b.name);
        });
        
        // 画像を読み込み（逆順で追加して、若い番号が上に来るようにする）
        for (let i = imageEntries.length - 1; i >= 0; i--) {
            const entry = imageEntries[i];
            const blob = await entry.entry.async('blob');
            const dataUrl = await blobToDataURL(blob);
            await loadImageFromDataURL(dataUrl, entry.name);
        }
        
        console.log(`✅ ZIPから ${imageEntries.length} 枚の画像を読み込みました`);
        
    } catch (error) {
        console.error('❌ ZIP読み込みエラー:', error);
        alert('ZIPファイルの読み込みに失敗しました: ' + error.message);
    }
}

// ===== ファイル名を連番でソート =====
function sortFilesByNumber(files) {
    return files.slice().sort((a, b) => {
        return compareFileNames(a.name, b.name);
    });
}

// ===== ファイル名比較（連番対応） =====
function compareFileNames(nameA, nameB) {
    // 数字を抽出して比較
    const numA = extractNumber(nameA);
    const numB = extractNumber(nameB);
    
    if (numA !== null && numB !== null) {
        return numA - numB;
    }
    
    // 数字がない場合は文字列比較
    return nameA.localeCompare(nameB);
}

// ===== ファイル名から数字を抽出（先頭の連番優先） =====
function extractNumber(filename) {
    // ファイル名から数字部分を抽出
    const match = filename.match(/(\d+)/g);
    if (match && match.length > 0) {
        // 先頭の数字を使用（001_ひも.png のようなパターンに対応）
        return parseInt(match[0], 10);
    }
    return null;
}

// ===== BlobをDataURLに変換 =====
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ===== DataURLから画像を読み込み =====
function loadImageFromDataURL(dataUrl, filename) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const layer = createImageLayer(img, filename);
            layers.push(layer);
            updateLayerList();
            render();
            resolve(layer);
        };
        img.onerror = () => {
            console.error('画像読み込みエラー:', filename);
            resolve(null);
        };
        img.src = dataUrl;
    });
}

// ===== オリジナルファイル名で画像を読み込み（タブレット対応強化） =====
function loadImageWithOriginalName(file) {
    return new Promise((resolve) => {
        // ファイル名を確実に取得（タブレット対応強化）
        let filename = '';
        
        // 1. まずwebkitRelativePathを確認（フォルダ選択時）
        if (file.webkitRelativePath && file.webkitRelativePath.length > 0) {
            filename = file.webkitRelativePath.split('/').pop();
        }
        
        // 2. webkitRelativePathがない場合はnameを使用
        if (!filename) {
            filename = file.name;
        }
        
        // 3. タブレットで数字のみになる問題に対応
        // ファイル名が数字のみ、または拡張子がない場合
        if (/^\d+$/.test(filename) || !filename.includes('.')) {
            // MIMEタイプから拡張子を推定
            let ext = '.png';
            if (file.type) {
                if (file.type.includes('jpeg') || file.type.includes('jpg')) ext = '.jpg';
                else if (file.type.includes('gif')) ext = '.gif';
                else if (file.type.includes('webp')) ext = '.webp';
            }
            
            // 元のnameに拡張子がある場合はそれを使用
            if (file.name && file.name.includes('.')) {
                filename = file.name;
            } else {
                // タイムスタンプベースの名前を生成（最後の手段）
                filename = `image_${Date.now()}${ext}`;
            }
        }
        
        // 4. 最終チェック：空の場合はデフォルト名
        if (!filename || filename.trim() === '') {
            filename = `image_${Date.now()}.png`;
        }
        
        console.log(`📷 読み込み: ${filename} (元: ${file.name})`);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const layer = createImageLayer(img, filename);
                layers.push(layer);
                updateLayerList();
                selectLayer(layer.id, false);
                render();
                
                if (typeof saveHistory === 'function') {
                    saveHistory();
                }
                resolve(layer);
            };
            img.onerror = () => {
                console.error('画像読み込みエラー:', filename);
                resolve(null);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ===== 画像レイヤー作成（共通処理） =====
function createImageLayer(img, filename) {
    return {
        id: nextLayerId++,
        type: 'image',
        name: filename,
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
        parentLayerId: null,
        windSwayEnabled: false,
        windSwayParams: getDefaultWindSwayParams(),
        colorClipping: {
            enabled: false,
            referenceLayerId: null,
            color: { r: 0, g: 255, b: 0 },
            tolerance: 30,
            invertClipping: false
        },
        keyframes: [{
            frame: 0,
            x: canvas.width / 2,
            y: canvas.height / 2,
            rotation: 0,
            scale: 1,
            opacity: 1.0
        }]
    };
}

// ===== レイヤーアイテムを再帰的に描画（チェックボックス付き） =====
function renderLayerItem(layer, depth) {
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.style.paddingLeft = `${depth * 20 + 8}px`;
    item.draggable = true;
    item.dataset.layerId = layer.id;
    
    // 選択状態
    if (selectedLayerIds.includes(layer.id)) {
        item.classList.add('selected');
    }
    
    // ドラッグイベント
    item.addEventListener('dragstart', (e) => handleDragStart(e, layer.id));
    item.addEventListener('dragover', (e) => handleDragOver(e, layer.id));
    item.addEventListener('dragleave', (e) => handleDragLeave(e));
    item.addEventListener('drop', (e) => handleDrop(e, layer.id));
    item.addEventListener('dragend', (e) => handleDragEnd(e));
    
    // チェックボックス
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'layer-checkbox';
    checkbox.checked = selectedLayerIds.includes(layer.id);
    checkbox.onclick = (e) => {
        e.stopPropagation();
        toggleLayerSelection(layer.id, checkbox.checked);
    };
    
    // レイヤータイプに応じたアイコン
    const typeIcon = getLayerTypeIcon(layer.type);
    
    // 風揺れアイコン
    const windIcon = layer.windSwayEnabled ? '💨' : '';
    
    // 歩行アイコン（フォルダのみ）
    const walkIcon = (layer.type === 'folder' && layer.walkingEnabled) ? '🚶' : '';
    
    // 親レイヤーがある場合のインジケータ
    const hasParent = layer.parentLayerId != null;
    const parentIndicator = hasParent ? '🔗' : '';
    
    // 子レイヤーの有無
    const hasChildren = layers.some(l => l.parentLayerId === layer.id);
    const childIndicator = hasChildren ? '📎' : '';
    
    // フォルダの場合
    if (layer.type === 'folder') {
        const expanded = layer.expanded !== false;
        
        item.innerHTML = `
            <span class="folder-toggle" onclick="toggleFolder(${layer.id}, event)">${expanded ? '▼' : '▶'}</span>
            <span class="layer-name">${windIcon}${walkIcon}${parentIndicator}${typeIcon} ${layer.name}</span>
            <span class="layer-controls">
                <button onclick="deleteLayer(${layer.id}, event)">🗑️</button>
            </span>
        `;
        item.insertBefore(checkbox, item.firstChild);
        
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('folder-toggle') && e.target.type !== 'checkbox') {
                selectLayer(layer.id, e.shiftKey);
            }
        });
        layerList.appendChild(item);
        
        // 子レイヤーを表示（展開時のみ）
        if (expanded) {
            const children = layers.filter(l => l.parentLayerId === layer.id);
            for (let i = children.length - 1; i >= 0; i--) {
                renderLayerItem(children[i], depth + 1);
            }
        }
    }
    // 音声レイヤーの場合
    else if (layer.type === 'audio') {
        const clipCount = layer.audioClips ? layer.audioClips.length : 0;
        
        item.innerHTML = `
            <span class="layer-name">${typeIcon} ${layer.name} <span style="font-size: 10px; color: #1db954;">(${clipCount}クリップ)</span></span>
            <span class="layer-controls">
                <button onclick="toggleLayerVisibility(${layer.id}, event)">${layer.visible ? '👀' : '🙈'}</button>
                <button onclick="deleteLayer(${layer.id}, event)">🗑️</button>
            </span>
        `;
        item.insertBefore(checkbox, item.firstChild);
        
        item.style.background = 'linear-gradient(135deg, #1a3d1a, #2d5a2d)';
        item.style.borderColor = '#1db954';
        
        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') selectLayer(layer.id, e.shiftKey);
        });
        layerList.appendChild(item);
    }
    // その他のレイヤー（画像、口パク、まばたき、パペット、バウンス）
    else {
        item.innerHTML = `
            <span class="layer-name">${windIcon}${childIndicator}${parentIndicator}${typeIcon} ${layer.name}</span>
            <span class="layer-controls">
                <button onclick="toggleLayerVisibility(${layer.id}, event)">${layer.visible ? '👀' : '🙈'}</button>
                <button onclick="deleteLayer(${layer.id}, event)">🗑️</button>
            </span>
        `;
        item.insertBefore(checkbox, item.firstChild);
        
        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') selectLayer(layer.id, e.shiftKey);
        });
        layerList.appendChild(item);
        
        // 子レイヤーを表示
        const children = layers.filter(l => l.parentLayerId === layer.id);
        for (let i = children.length - 1; i >= 0; i--) {
            renderLayerItem(children[i], depth + 1);
        }
    }
}

// ===== レイヤータイプアイコン取得 =====
function getLayerTypeIcon(type) {
    switch (type) {
        case 'folder': return '📁';
        case 'lipsync': return '💬';
        case 'blink': return '👀';
        case 'puppet': return '🎭';
        case 'bounce': return '🎈';
        case 'audio': return '🎵';
        case 'image':
        default: return '🖼️';
    }
}

// ===== チェックボックスによる選択切り替え =====
function toggleLayerSelection(layerId, checked) {
    if (checked) {
        if (!selectedLayerIds.includes(layerId)) {
            selectedLayerIds.push(layerId);
        }
    } else {
        const index = selectedLayerIds.indexOf(layerId);
        if (index > -1) {
            selectedLayerIds.splice(index, 1);
        }
    }
    updateLayerList();
    updatePropertiesPanel();
}

// ===== レイヤー選択（render()を呼ばない） =====
function selectLayer(layerId, shiftKey = false) {
    if (shiftKey) {
        // Shift+クリック：複数選択
        const index = selectedLayerIds.indexOf(layerId);
        if (index > -1) {
            // 既に選択されている場合は解除
            selectedLayerIds.splice(index, 1);
        } else {
            // 選択に追加
            selectedLayerIds.push(layerId);
        }
    } else {
        // 通常クリック：単一選択
        selectedLayerIds = [layerId];
    }
    
    // レイヤー切り替え時に風揺れピン追加モードをオフにする
    if (typeof pinMode !== 'undefined' && pinMode) {
        pinMode = false;
        if (typeof updatePinModeUI === 'function') {
            updatePinModeUI();
        }
    }
    
    // レイヤー切り替え時にパペットモードをオフにする
    if (typeof puppetHandleMode !== 'undefined' && puppetHandleMode) {
        puppetHandleMode = false;
        canvas.style.cursor = 'default';
        if (typeof updatePuppetModeUI === 'function') {
            updatePuppetModeUI();
        }
    }
    if (typeof puppetIntermediatePinMode !== 'undefined' && puppetIntermediatePinMode) {
        puppetIntermediatePinMode = false;
        canvas.style.cursor = 'default';
        if (typeof updatePuppetModeUI === 'function') {
            updatePuppetModeUI();
        }
    }
    
    // 前のレイヤーのパペットアンカー要素をクリア
    if (typeof clearPuppetAnchorElements === 'function') {
        clearPuppetAnchorElements();
    }
    
    updateLayerList();
    updatePropertiesPanel();
    // render()は呼ばない - チカチカ防止
}

// ===== レイヤー表示切り替え =====
function toggleLayerVisibility(layerId, event) {
    event.stopPropagation();
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
        layer.visible = !layer.visible;
        updateLayerList();
        render();
        
        // 風揺れピン表示を更新（現在選択中のレイヤーの場合）
        if (selectedLayerIds.includes(layerId)) {
            if (pinMode && layer.visible) {
                updatePinElements();
            } else {
                clearPinElements();
            }
        }
    }
}

// ===== レイヤー削除 =====
function deleteLayer(layerId, event) {
    const isTopLevel = event !== null;
    if (event) event.stopPropagation();
    
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    // フォルダの場合、子レイヤーも削除
    if (layer.type === 'folder') {
        const children = layers.filter(l => l.parentLayerId === layerId);
        children.forEach(child => {
            deleteLayer(child.id, null);
        });
    }
    
    // レイヤーを削除
    const index = layers.findIndex(l => l.id === layerId);
    if (index !== -1) {
        layers.splice(index, 1);
    }
    
    // 選択から削除
    const selectedIndex = selectedLayerIds.indexOf(layerId);
    if (selectedIndex > -1) {
        selectedLayerIds.splice(selectedIndex, 1);
    }
    
    updateLayerList();
    updatePropertiesPanel();
    render();
    
    // 最上位の削除操作の場合のみ履歴保存
    if (isTopLevel && typeof saveHistory === 'function') {
        saveHistory();
    }
}

// ===== フォルダの開閉 =====
function toggleFolder(folderId, event) {
    event.stopPropagation();
    const folder = layers.find(l => l.id === folderId);
    if (folder && folder.type === 'folder') {
        folder.expanded = !folder.expanded;
        updateLayerList();
    }
}

// ===== フォルダ作成 =====
function createFolderFromSelection() {
    if (selectedLayerIds.length === 0) {
        alert('レイヤーを選択してください（Shift+クリックで複数選択）');
        return;
    }
    
    // 親がないレイヤーのみを取得
    const layersToMove = [];
    selectedLayerIds.forEach(layerId => {
        const layer = layers.find(l => l.id === layerId);
        if (layer && layer.parentLayerId === null) {
            layersToMove.push(layer);
        }
    });
    
    if (layersToMove.length === 0) {
        alert('親がないレイヤーを選択してください');
        return;
    }
    
    // 選択されたレイヤーの中心位置を計算
    let sumX = 0, sumY = 0;
    layersToMove.forEach(layer => {
        sumX += layer.x || 0;
        sumY += layer.y || 0;
    });
    const centerX = sumX / layersToMove.length;
    const centerY = sumY / layersToMove.length;
    
    // フォルダ作成（選択レイヤーの中心に配置）
    const folder = {
        id: nextLayerId++,
        type: 'folder',
        name: '新規フォルダ',
        expanded: true,
        visible: true,
        parentLayerId: null,
        
        // トランスフォーム（選択レイヤーの中心に配置）
        x: centerX,
        y: centerY,
        rotation: 0,
        scale: 1,
        opacity: 1.0,
        anchorX: 0.5,
        anchorY: 0.5,
        // フォルダ専用アンカーオフセット（ピクセル単位）
        anchorOffsetX: 0,
        anchorOffsetY: 0,
        blendMode: 'source-over',
        
        // フォルダーにも風揺れ機能を追加
        windSwayEnabled: false,
        windSwayParams: getDefaultWindSwayParams(),
        
        // デフォルトキーフレーム（フレーム0に初期位置を設定）
        keyframes: [{
            frame: 0,
            x: centerX,
            y: centerY,
            rotation: 0,
            scale: 1,
            opacity: 1.0
        }]
    };
    
    layers.push(folder);
    
    // 各レイヤーをフォルダからの相対座標に変換
    layersToMove.forEach(layer => {
        // 現在の絶対座標を保存
        const worldX = layer.x || 0;
        const worldY = layer.y || 0;
        
        // フォルダからの相対座標に変換
        layer.x = worldX - centerX;
        layer.y = worldY - centerY;
        
        // キーフレームも相対座標に変換
        if (layer.keyframes && layer.keyframes.length > 0) {
            layer.keyframes.forEach(kf => {
                if (kf.x !== undefined) kf.x = kf.x - centerX;
                if (kf.y !== undefined) kf.y = kf.y - centerY;
            });
        }
        
        // フォルダを親に設定
        layer.parentLayerId = folder.id;
    });
    
    // フォルダを選択
    selectedLayerIds = [folder.id];
    
    updateLayerList();
    updatePropertiesPanel();
    render();
    
    // 履歴を保存
    if (typeof saveHistory === 'function') {
        saveHistory();
    }
}

// ===== 口パクレイヤー作成 =====
function createLipSyncLayer() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true; // フォルダ選択
    input.onchange = (e) => {
        const files = Array.from(e.target.files).filter(file => 
            file.type.startsWith('image/')
        );
        
        if (files.length < 2) {
            alert('口パクレイヤーには少なくとも2枚の画像が必要です\n（1枚目: 閉じた口、2枚目以降: 口パクアニメーション）');
            return;
        }
        
        loadSequenceImages(files, (images) => {
            const layer = {
                id: nextLayerId++,
                type: 'lipsync',
                name: '口パク',
                sequenceImages: images,
                keyframes: [], // {frame: number, type: 'start'/'end'}
                x: canvas.width / 2,
                y: canvas.height / 2,
                rotation: 0,
                scale: 1,
                opacity: 1.0,
                anchorX: 0.5,
                anchorY: 0.5,
                visible: true,
                blendMode: 'source-over',
                fps: 12, // ループ再生FPS
                
                // パペット機能
                parentLayerId: null,
                
                // 風揺れ機能（現在は非対応）
                windSwayEnabled: false,
                windSwayParams: getDefaultWindSwayParams()
            };
            
            layers.push(layer);
            updateLayerList();
            selectLayer(layer.id, false);
            render();
            
            // 履歴を保存
            if (typeof saveHistory === 'function') {
                saveHistory();
            }
        });
    };
    input.click();
}

// ===== まばたきレイヤー作成 =====
function createBlinkLayer() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true; // フォルダ選択
    input.onchange = (e) => {
        const files = Array.from(e.target.files).filter(file => 
            file.type.startsWith('image/')
        );
        
        if (files.length < 2) {
            alert('まばたきレイヤーには少なくとも2枚の画像が必要です\n（1枚目: 開いた目、2枚目以降: まばたきアニメーション）');
            return;
        }
        
        loadSequenceImages(files, (images) => {
            const layer = {
                id: nextLayerId++,
                type: 'blink',
                name: 'まばたき',
                sequenceImages: images,
                keyframes: [], // {frame: number}
                x: canvas.width / 2,
                y: canvas.height / 2,
                rotation: 0,
                scale: 1,
                opacity: 1.0,
                anchorX: 0.5,
                anchorY: 0.5,
                visible: true,
                blendMode: 'source-over',
                fps: 12, // アニメーション再生FPS
                
                // パペット機能
                parentLayerId: null,
                
                // 風揺れ機能（現在は非対応）
                windSwayEnabled: false,
                windSwayParams: getDefaultWindSwayParams()
            };
            
            layers.push(layer);
            updateLayerList();
            selectLayer(layer.id, false);
            render();
            
            // 履歴を保存
            if (typeof saveHistory === 'function') {
                saveHistory();
            }
        });
    };
    input.click();
}

// ===== リネームダイアログ表示 =====
function showRenameDialog() {
    if (selectedLayerIds.length !== 1) {
        alert('リネームするレイヤーを1つ選択してください');
        return;
    }
    
    const layer = layers.find(l => l.id === selectedLayerIds[0]);
    if (!layer) return;
    
    const newName = prompt('新しい名前を入力してください:', layer.name);
    if (newName && newName.trim()) {
        layer.name = newName.trim();
        updateLayerList();
    }
}

// ===== ドラッグ&ドロップ処理 =====
function handleDragStart(e, layerId) {
    draggedLayerId = layerId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
    e.target.style.opacity = '0.4';
}

function handleDragOver(e, layerId) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    e.dataTransfer.dropEffect = 'move';
    dragOverLayerId = layerId;
    
    // ドロップ位置の視覚的フィードバック
    const targetElement = e.currentTarget;
    const targetLayer = layers.find(l => l.id === layerId);
    
    if (draggedLayerId !== layerId) {
        // ターゲットがフォルダの場合は特別なハイライト
        if (targetLayer && targetLayer.type === 'folder') {
            targetElement.style.borderTop = '';
            targetElement.style.background = 'rgba(218, 165, 32, 0.3)';
            targetElement.style.outline = '2px solid var(--accent-gold)';
        } else {
            targetElement.style.borderTop = '2px solid var(--accent-gold)';
            targetElement.style.background = '';
            targetElement.style.outline = '';
        }
    }
    
    return false;
}

function handleDragLeave(e) {
    e.currentTarget.style.borderTop = '';
    e.currentTarget.style.background = '';
    e.currentTarget.style.outline = '';
}

function handleDrop(e, targetLayerId) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    e.currentTarget.style.borderTop = '';
    e.currentTarget.style.background = '';
    e.currentTarget.style.outline = '';
    
    if (draggedLayerId === targetLayerId) return false;
    
    const draggedLayer = layers.find(l => l.id === draggedLayerId);
    const targetLayer = layers.find(l => l.id === targetLayerId);
    
    if (!draggedLayer || !targetLayer) return false;
    
    // ターゲットがフォルダの場合：フォルダ内に追加
    if (targetLayer.type === 'folder') {
        // 循環参照チェック（ドラッグしたレイヤーがフォルダの場合）
        if (draggedLayer.type === 'folder') {
            // ターゲットフォルダがドラッグしたフォルダの子孫でないかチェック
            let checkParent = targetLayer;
            while (checkParent) {
                if (checkParent.parentLayerId === draggedLayerId) {
                    alert('循環参照になるため、この操作はできません');
                    return false;
                }
                checkParent = layers.find(l => l.id === checkParent.parentLayerId);
            }
        }
        
        // ドラッグしたレイヤーに親が設定されていない場合のみ親を設定
        // （既に親がある場合は順序変更のみ）
        if (!draggedLayer.parentLayerId) {
            // フォルダからの相対座標に変換
            const dx = draggedLayer.x - targetLayer.x;
            const dy = draggedLayer.y - targetLayer.y;
            draggedLayer.x = dx;
            draggedLayer.y = dy;
            
            // 親をフォルダに設定
            draggedLayer.parentLayerId = targetLayerId;
            
            console.log(`📁 レイヤー "${draggedLayer.name}" をフォルダ "${targetLayer.name}" に追加しました`);
        }
        
        // 配列内の位置を調整（フォルダの直後に移動）
        const draggedIndex = layers.indexOf(draggedLayer);
        layers.splice(draggedIndex, 1);
        
        const targetIndex = layers.indexOf(targetLayer);
        layers.splice(targetIndex + 1, 0, draggedLayer);
    } else {
        // 通常のレイヤー順序変更
        const draggedIndex = layers.indexOf(draggedLayer);
        layers.splice(draggedIndex, 1);
        
        const targetIndex = layers.indexOf(targetLayer);
        layers.splice(targetIndex, 0, draggedLayer);
    }
    
    updateLayerList();
    render();
    
    // 履歴を保存
    if (typeof saveHistory === 'function') {
        saveHistory();
    }
    
    return false;
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
    
    // すべてのスタイルをクリア
    const items = document.querySelectorAll('.layer-item');
    items.forEach(item => {
        item.style.borderTop = '';
        item.style.background = '';
        item.style.outline = '';
    });
    
    draggedLayerId = null;
    dragOverLayerId = null;
}

// ===== 揺れモーションレイヤー作成 =====
function createBounceLayer() {
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
                    type: 'bounce',
                    name: '揺れモーション',
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
                    
                    // パペット機能
                    parentLayerId: null,
                    
                    // 揺れモーション機能
                    bounceParams: getDefaultBounceParams(),
                    
                    // 風揺れ機能は無効
                    windSwayEnabled: false,
                    windSwayParams: getDefaultWindSwayParams(),
                    
                    // デフォルトキーフレーム
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
    };
    input.click();
}
