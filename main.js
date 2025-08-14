const bgm = document.getElementById('bgm');

function startBGM() {
    bgm.play().catch(err => console.log('BGM play failed', err));
}

document.body.addEventListener('touchstart', startBGM, { once: true });
document.body.addEventListener('click', startBGM, { once: true });

const muteBtn = document.getElementById('muteBtn');
if (muteBtn) {
    muteBtn.addEventListener('click', () => {
        if (bgm.paused) {
            bgm.play().catch(err => console.log('BGM play failed', err));
        } else {
            bgm.pause();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
        if (bgm.paused) {
            bgm.play().catch(err => console.log('BGM play failed', err));
        } else {
            bgm.pause();
        }
    }
});

// Service Worker登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// PWA Install Prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installPrompt').style.display = 'block';
});

document.getElementById('installPrompt').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    document.getElementById('installPrompt').style.display = 'none';
  }
});

const { Engine, Render, Runner, Bodies, Composite, Body, Events } = Matter;

// ゲーム設定
const GAME_CONFIG = {
    canvas: {
        width: 400,
        height: 600
    },
    ground: {
        widthRatio: 0.56,
        height: 25,
        color: '#8B4513'
    },
    physics: {
        gravity: 0.5,
        friction: 0.7,
        frictionStatic: 0.9,
        restitution: 0.2
    },
    animal: {
        targetSize: 90,
        minSize: 60,
        maxSize: 120,
        spawnHeight: 80,
        moveSpeed: 15,
        rotateSpeed: Math.PI / 12
    },
      performance: {
          targetFPS: 60,
          renderTiming: 16.67,
          inputThrottle: 50
      }
  };

// ゲーム状態
let gameState = {
    engine: null,
    render: null,
    runner: null,
    currentBody: null,
    isDropping: false,
    imagesLoaded: false,
    loadedImages: {},
    lastInputTime: 0,
      animationFrame: null,
      gameOver: false,
      score: 0
  };

// 画像ファイル名
// 初期表示に必要な最小限の画像のみを先に読み込み、その他は遅延ロードする
const initialImageFiles = ['2.PNG', '3.PNG', '4.PNG', '5.PNG'];
const lazyImageFiles = ['1.PNG', '6.PNG', '7.PNG', '8.PNG', '9.PNG', '10.PNG', '11.PNG', '12.PNG'];

  // 画像の最適サイズを計算する関数
  function calculateOptimalScale(imgWidth, imgHeight, targetSize) {
    const aspectRatio = imgWidth / imgHeight;
    let scale;
    
    if (imgWidth >= imgHeight) {
        scale = targetSize / imgWidth;
    } else {
        scale = targetSize / imgHeight;
    }
    
    const resultWidth = imgWidth * scale;
    const resultHeight = imgHeight * scale;
    const maxDimension = Math.max(resultWidth, resultHeight);
    
    if (maxDimension > GAME_CONFIG.animal.maxSize) {
        scale = GAME_CONFIG.animal.maxSize / Math.max(imgWidth, imgHeight);
    } else if (maxDimension < GAME_CONFIG.animal.minSize) {
        scale = GAME_CONFIG.animal.minSize / Math.max(imgWidth, imgHeight);
    }
    
    return scale;
}

// 画像をプリロードする関数
function preloadImages(imageList, onProgress) {
    let loaded = 0;
    const total = imageList.length;

    const loadingPromises = imageList.map(filename => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = async () => {
                const scale = calculateOptimalScale(img.width, img.height, GAME_CONFIG.animal.targetSize);
                let polygon = [];
                try {
                    const res = await fetch(`polygons/${filename.replace(/\.PNG$/i, '.json')}`);
                    polygon = await res.json();
                } catch (err) {
                    console.warn(`ポリゴンの読み込みに失敗: ${filename}`, err);
                }

                gameState.loadedImages[filename] = {
                    image: img,
                    scale: scale,
                    width: img.width * scale,
                    height: img.height * scale,
                    polygon: polygon
                };
                loaded++;
                if (onProgress) onProgress(loaded, total);
                resolve({ status: 'fulfilled' });
            };
            img.onerror = () => {
                console.warn(`画像の読み込みに失敗: ${filename}`);
                loaded++;
                if (onProgress) onProgress(loaded, total);
                resolve({ status: 'rejected' });
            };
            img.src = filename;
        });
    });

    return Promise.all(loadingPromises).then(results => {
        const successful = results.filter(result => result.status === 'fulfilled').length;
        console.log(`${successful}/${total} 個の画像を読み込みました`);
        return successful === total;
    });
}

// ゲームオーバーをチェックする関数
function checkGameOver() {
    if (gameState.gameOver) return;
    
    const bodies = Composite.allBodies(gameState.engine.world);
    const groundY = GAME_CONFIG.canvas.height - GAME_CONFIG.ground.height;
    
    for (let body of bodies) {
        if (body.isStatic) continue;
        
        if (body.bounds.max.y > groundY + 50) {
            triggerGameOver();
            return;
        }
    }
}

// ゲームオーバー処理
function triggerGameOver() {
    if (gameState.gameOver) return;

    gameState.gameOver = true;

    // UI更新
    const controls = document.getElementById('controls');
    const retryBtn = document.getElementById('retryBtn');

    document.getElementById('gameOverText').style.display = 'block';
    controls.classList.add('game-over');

    // 操作ボタンを無効化
    controls.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
    });

    // もう一度プレイボタンを表示
    retryBtn.style.display = 'inline-block';
    retryBtn.disabled = false;
    retryBtn.style.background = 'linear-gradient(145deg, #ff6b6b, #ff5252)';
    retryBtn.style.color = 'white';
    retryBtn.textContent = '🔄 もう一度プレイ';

    // エンジンを停止
    if (gameState.runner) {
        Runner.stop(gameState.runner);
    }

    // 現在の動物をクリア
    gameState.currentBody = null;
    gameState.isDropping = false;

    console.log('ゲームオーバー！ 最終スコア:', gameState.score);
}

// スコアを更新する関数
function updateScore() {
    gameState.score++;
    document.getElementById('scoreDisplay').textContent = `スコア: ${gameState.score}`;
}

// 入力制限付きの操作関数
function throttledInput(callback) {
    const now = Date.now();
    if (now - gameState.lastInputTime > GAME_CONFIG.performance.inputThrottle && !gameState.gameOver) {
        gameState.lastInputTime = now;
        callback();
    }
}

// 最適化されたレンダリング
function optimizedRender() {
    if (gameState.render) {
        gameState.animationFrame = requestAnimationFrame(optimizedRender);
        
        // フレームレート制御
        const now = performance.now();
        if (now - gameState.lastRenderTime >= GAME_CONFIG.performance.renderTiming) {
            Render.world(gameState.render);
            gameState.lastRenderTime = now;
        }
    }
}

// ゲームエンジンの初期化
function initializeGame() {
    const canvas = document.getElementById('gameCanvas');
    
    // キャンバスサイズをスマホ対応
    const containerWidth = Math.min(400, window.innerWidth - 40);
    const containerHeight = Math.floor(containerWidth * 1.5); // 3:2のアスペクト比
    
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    GAME_CONFIG.canvas.width = containerWidth;
    GAME_CONFIG.canvas.height = containerHeight;
    
    // エンジンの作成
    gameState.engine = Engine.create();
    gameState.engine.world.gravity.y = GAME_CONFIG.physics.gravity;
    
    // レンダラーの作成
    gameState.render = Render.create({
        canvas: canvas,
        engine: gameState.engine,
        options: {
            width: GAME_CONFIG.canvas.width,
            height: GAME_CONFIG.canvas.height,
            wireframes: false,
            background: 'transparent',
            showAngleIndicator: false,
            showVelocity: false,
            pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
        }
    });
    
    // 地面の作成
    const groundWidth = GAME_CONFIG.canvas.width * GAME_CONFIG.ground.widthRatio;
    const ground = Bodies.rectangle(
        GAME_CONFIG.canvas.width / 2,
        GAME_CONFIG.canvas.height - GAME_CONFIG.ground.height / 2,
        groundWidth,
        GAME_CONFIG.ground.height,
        {
            isStatic: true,
            render: { fillStyle: GAME_CONFIG.ground.color },
            friction: GAME_CONFIG.physics.friction,
            frictionStatic: GAME_CONFIG.physics.frictionStatic
        }
    );
    
    // 左右の見えない壁を追加
    const wallThickness = 10;
    const leftWall = Bodies.rectangle(-wallThickness/2, GAME_CONFIG.canvas.height/2, wallThickness, GAME_CONFIG.canvas.height, { isStatic: true, render: { visible: false } });
    const rightWall = Bodies.rectangle(GAME_CONFIG.canvas.width + wallThickness/2, GAME_CONFIG.canvas.height/2, wallThickness, GAME_CONFIG.canvas.height, { isStatic: true, render: { visible: false } });
    
    Composite.add(gameState.engine.world, [ground, leftWall, rightWall]);
    
    // ランナーの作成と開始
    gameState.runner = Runner.create();
    gameState.runner.delta = GAME_CONFIG.performance.renderTiming;
    Runner.run(gameState.runner, gameState.engine);
    
    // 最適化されたレンダリング開始
    gameState.lastRenderTime = 0;
    optimizedRender();
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // 最初の動物を生成
    createRandomAnimal();
}

// ランダムな動物を生成
function createRandomAnimal() {
    const availableImages = Object.keys(gameState.loadedImages);
    if (availableImages.length === 0) {
        console.error('使用可能な画像がありません');
        return;
    }
    
    const randomFilename = availableImages[Math.floor(Math.random() * availableImages.length)];
    const imageData = gameState.loadedImages[randomFilename];
    
    // ポリゴンボディを作成
    let body;
    try {
        body = Bodies.fromVertices(
            GAME_CONFIG.canvas.width / 2,
            GAME_CONFIG.animal.spawnHeight,
            [imageData.polygon],
            {
                friction: GAME_CONFIG.physics.friction,
                frictionStatic: GAME_CONFIG.physics.frictionStatic,
                restitution: GAME_CONFIG.physics.restitution,
                render: {
                    sprite: {
                        texture: randomFilename,
                        xScale: imageData.scale,
                        yScale: imageData.scale
                    }
                }
            },
            true
        );
    } catch (error) {
        console.warn('ポリゴンボディ作成に失敗、矩形で代用:', error);
        body = Bodies.rectangle(
            GAME_CONFIG.canvas.width / 2,
            GAME_CONFIG.animal.spawnHeight,
            imageData.width,
            imageData.height,
            {
                friction: GAME_CONFIG.physics.friction,
                frictionStatic: GAME_CONFIG.physics.frictionStatic,
                restitution: GAME_CONFIG.physics.restitution,
                render: {
                    sprite: {
                        texture: randomFilename,
                        xScale: imageData.scale,
                        yScale: imageData.scale
                    }
                }
            }
        );
    }
    
    gameState.currentBody = body;
    Composite.add(gameState.engine.world, body);
}

// 現在の動物を落下させる
function dropCurrentAnimal() {
    if (gameState.currentBody && !gameState.isDropping && !gameState.gameOver) {
        gameState.isDropping = true;
          updateScore();
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // 物理演算の更新前処理
    Events.on(gameState.engine, 'beforeUpdate', () => {
        // ゲームオーバーチェック
        checkGameOver();
        
        // 落下していない場合は重力を無効化
        if (gameState.currentBody && !gameState.isDropping && !gameState.gameOver) {
            Body.setVelocity(gameState.currentBody, { x: 0, y: 0 });
            Body.setPosition(gameState.currentBody, {
                x: Math.max(gameState.currentBody.bounds.max.x - gameState.currentBody.bounds.min.x, 
                          Math.min(GAME_CONFIG.canvas.width - (gameState.currentBody.bounds.max.x - gameState.currentBody.bounds.min.x), 
                                  gameState.currentBody.position.x)),
                y: gameState.currentBody.position.y
            });
        }
        
        // 落下中の動物が静止したら次の動物を生成
        if (gameState.currentBody && gameState.isDropping && !gameState.gameOver) {
            const velocity = gameState.currentBody.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            const angularSpeed = Math.abs(gameState.currentBody.angularVelocity);
            
            if (speed < 0.1 && angularSpeed < 0.01) {
                gameState.currentBody = null;
                gameState.isDropping = false;
                setTimeout(createRandomAnimal, 800);
            }
        }
    });
    
    // ボタンイベント（スロットリング付き）
    document.getElementById('leftBtn').onclick = () => {
        throttledInput(() => {
            if (gameState.currentBody && !gameState.isDropping && !gameState.gameOver) {
                Body.translate(gameState.currentBody, {x: -GAME_CONFIG.animal.moveSpeed, y: 0});
            }
        });
    };
    
    document.getElementById('rightBtn').onclick = () => {
        throttledInput(() => {
            if (gameState.currentBody && !gameState.isDropping && !gameState.gameOver) {
                Body.translate(gameState.currentBody, {x: GAME_CONFIG.animal.moveSpeed, y: 0});
            }
        });
    };
    
    document.getElementById('rotateLeftBtn').onclick = () => {
        throttledInput(() => {
            if (gameState.currentBody && !gameState.isDropping && !gameState.gameOver) {
                Body.rotate(gameState.currentBody, -GAME_CONFIG.animal.rotateSpeed);
            }
        });
    };
    
    document.getElementById('rotateRightBtn').onclick = () => {
        throttledInput(() => {
            if (gameState.currentBody && !gameState.isDropping && !gameState.gameOver) {
                Body.rotate(gameState.currentBody, GAME_CONFIG.animal.rotateSpeed);
            }
        });
    };

    document.getElementById('dropBtn').onclick = dropCurrentAnimal;
    
    // タッチイベント（スマホ対応）
    ['leftBtn', 'rightBtn', 'rotateLeftBtn', 'rotateRightBtn'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        let touchInterval = null;
        
        const startAction = () => {
            btn.click();
            touchInterval = setInterval(() => btn.click(), 100);
        };
        
        const stopAction = () => {
            if (touchInterval) {
                clearInterval(touchInterval);
                touchInterval = null;
            }
        };
        
        // タッチイベント
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startAction();
        });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopAction();
        });
        
        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            stopAction();
        });
        
        // マウスイベント
        btn.addEventListener('mousedown', startAction);
        btn.addEventListener('mouseup', stopAction);
        btn.addEventListener('mouseleave', stopAction);
    });
    
    // 落とすボタンは単発
    ['dropBtn'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            btn.click();
        });
    });
    
    // キーボードコントロール
    document.addEventListener('keydown', (event) => {
        switch(event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                document.getElementById('leftBtn').click();
                break;
            case 'ArrowRight':
            case 'KeyD':
                document.getElementById('rightBtn').click();
                break;
            case 'KeyQ':
                document.getElementById('rotateLeftBtn').click();
                break;
            case 'KeyE':
                document.getElementById('rotateRightBtn').click();
                break;
            case 'Space':
            case 'ArrowDown':
            case 'KeyS':
                event.preventDefault();
                document.getElementById('dropBtn').click();
                break;
        }
    });
    
    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
        setTimeout(() => {
            const canvas = document.getElementById('gameCanvas');
            const containerWidth = Math.min(400, window.innerWidth - 40);
            const containerHeight = Math.floor(containerWidth * 1.5);
            
            canvas.style.width = containerWidth + 'px';
            canvas.style.height = containerHeight + 'px';
        }, 100);
    });
}

// ゲーム初期化とスタート
async function startGame() {
    const loadingText = document.getElementById('loadingText');
    const retryBtn = document.getElementById('retryBtn');

    retryBtn.style.display = 'none';
    loadingText.style.display = 'block';
    loadingText.style.color = '';
    loadingText.textContent = `画像を読み込み中... 0/${initialImageFiles.length}`;

    gameState.loadedImages = {};
    gameState.imagesLoaded = false;

    try {
        const success = await preloadImages(initialImageFiles, (loaded, total) => {
            loadingText.textContent = `画像を読み込み中... ${loaded}/${total}`;
        });

        if (success) {
            gameState.imagesLoaded = true;
              loadingText.style.display = 'none';
              document.getElementById('scoreDisplay').style.display = 'block';
              document.getElementById('controls').style.display = 'flex';

            initializeGame();

            // 残りの画像をアイドル時に遅延読み込み
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => preloadImages(lazyImageFiles));
            } else {
                setTimeout(() => preloadImages(lazyImageFiles), 2000);
            }

            console.log('ゲームが開始されました！');
            console.log('操作: 矢印キー/WASD で移動・回転、スペース/S で落下');
            console.log('⚠️ 動物が土台から落ちるとゲームオーバーです！');
        } else {
            loadingText.textContent = '画像の読み込みに失敗しました。画像ファイル（1.PNG～12.PNG）を確認してください。';
            loadingText.style.color = '#ff0000';
            retryBtn.style.display = 'inline-block';
        }
    } catch (error) {
        console.error('ゲーム初期化エラー:', error);
        loadingText.textContent = 'ゲームの初期化に失敗しました。';
        loadingText.style.color = '#ff0000';
        retryBtn.style.display = 'inline-block';
    }
}

document.getElementById('retryBtn').addEventListener('click', () => location.reload());

// ページ読み込み完了後にゲーム開始
window.addEventListener('DOMContentLoaded', startGame);
