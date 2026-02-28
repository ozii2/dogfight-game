# AGENTS.md — Dogfight 3D Multiplayer Proje Dökümantasyonu

> 3D çok oyunculu tarayıcı tabanlı uçak savaşı oyunu.  
> **Teknolojiler:** Three.js, Socket.IO, Express, Node.js

---

## 📁 Proje Yapısı

```
dogfight_game/
├── server.js              # Node.js sunucu (Express + Socket.IO)
├── index.html             # Ana HTML — tüm ekranlar ve CSS
├── package.json           # Bağımlılıklar ve scripts
├── js/                    # İstemci taraflı JavaScript modülleri
│   ├── main.js            # Giriş noktası, oyun döngüsü, global fonksiyonlar
│   ├── state.js           # Merkezi oyun durumu (singleton state objesi)
│   ├── constants.js       # Sabitler (takımlar, uçak tipleri, streak isimleri)
│   ├── network.js         # Socket.IO bağlantısı ve tüm ağ olayları
│   ├── entities.js        # Oyun varlıkları (oyuncu, düşman, mermi, AA, power-up)
│   ├── models.js          # 3D model oluşturma (uçak, mermi, bomba mesh'leri)
│   ├── graphics.js        # Sahne, kamera, renderer, arazi, gökyüzü, binalar
│   ├── input.js           # Klavye ve fare girdi yönetimi
│   ├── audio.js           # Web Audio API ile prosedürel ses efektleri
│   ├── ui.js              # HUD güncellemeleri (can, silah, radar, skor)
│   └── utils.js           # Yardımcı fonksiyonlar (Perlin noise, arazi yüksekliği)
├── models/                # 3D model dosyaları (FBX/GLTF/GLB)
│   ├── AntiAir.fbx        # Hava savunma birimi modeli
│   ├── Bomber.fbx         # Bombardıman uçağı modeli
│   ├── House.glb          # Ev modeli
│   ├── Rafael.gltf        # Rafael savaş uçağı modeli
│   ├── Skyscraper.fbx     # Gökdelen modeli
│   └── wwii_soviet_plane_with_interior.glb  # WWII uçağı modeli
├── robots.txt             # SEO — arama motoru yönlendirmesi
├── sitemap.xml            # SEO — site haritası
└── google959627f86a318c2a.html  # Google Search Console doğrulaması
```

---

## 🖥️ Sunucu — `server.js`

Express + Socket.IO tabanlı multiplayer sunucu. Port 3000'de çalışır.

### Veri Yapıları
- **`rooms`** (`Map<string, Room>`) — Her oda: `players`, `bullets`, `antiAirs`, `bulletIdCounter`
- **`players`** (`Map<socketId, PlayerData>`) — İsim, uçak tipi, takım, pozisyon, can, skor

### Socket Olayları

| Olay | Yön | Açıklama |
|------|------|----------|
| `getTeamAssignment` | Client → Server | Takım sayılarını ve `canChoose` bayrağını döndürür |
| `getRooms` | Client → Server | Mevcut odaları listeler |
| `createRoom` | Client → Server | Yeni oda oluşturur |
| `joinRoom` | Client → Server | Odaya katılma, takım atama, mevcut oyuncuları gönderir |
| `playerUpdate` | Client → Server → Others | Pozisyon/rotasyon güncellemesi (10Hz) |
| `shoot` | Client → Server → All | Mermi/füze/bomba oluşturma |
| `hitPlayer` | Client → Server | Hasar uygulama, öldürme, yeniden doğma (3sn) |
| `aaDestroyed` | Client → Server → All | Hava savunma birimi yok edildi |
| `chatMessage` | Client → Server → All | Sohbet mesajı |
| `leaderboard` | Server → All | Her 2 saniyede skor tablosu yayını |

### Takım Atama Mantığı
- Takımlar **eşit değilse** → az olan takıma otomatik atar
- Takımlar **eşitse** → `canChoose: true` döndürür, oyuncu seçim yapar
- `joinRoom`'da eşitken oyuncunun tercihine saygı duyulur

### Sunucu Tick'leri
- **1 saniyede bir:** Eski mermileri temizle, 60sn inaktif oyuncuları at
- **2 saniyede bir:** Leaderboard yayınla

---

## 🎮 İstemci Modülleri (`js/`)

### `main.js` — Ana Giriş Noktası
Oyunun başlatılması ve ana döngüsü.

| Fonksiyon | Açıklama |
|-----------|----------|
| `init()` | Model preload → grafik → input → network → bombSight oluştur → animate başlat |
| `animate(time)` | Ana oyun döngüsü: FPS, dt hesaplama, entity güncelleme, kamera takibi, sahne render |
| `window.confirmTeam()` | Otomatik atanan takımı onayla → uçak seçimine geç |
| `window.chooseTeam(teamKey)` | Eşit takımlarda oyuncunun seçtiği takımı ata → uçak seçimine geç |
| `window.selectAircraft(type)` | Uçak seç, `createPlayer()`, sunucuya `joinRoom` emit et, düşman/AA/power-up spawn et |
| `window.restartGame()` | Sayfayı yeniden yükle |

**Akış:** Lobby → Takım Seçimi → Uçak Seçimi → Oyun

---

### `state.js` — Merkezi Oyun Durumu
Tek bir `state` objesi export eder: tüm modüller bu objeyi import ederek paylaşır.

**Önemli alanlar:**
- `scene`, `camera`, `renderer` — Three.js sahne bileşenleri
- `player` — Yerel oyuncu varlığı
- `bullets[]`, `enemies[]`, `particles[]`, `antiAirs[]` — Oyun varlıkları dizileri
- `remotePlayers` (`Map`) — Çok oyunculu uzak oyuncular
- `socket`, `myPlayerId`, `team` — Ağ bilgileri
- `keys`, `mouseDown` — Girdi durumu
- `attackWeaponMode`, `bomberWeaponMode` — Silah modları

**Setter fonksiyonları:** `setScene()`, `setCamera()`, `setRenderer()`, `setPlayer()`, `setSocket()`, `setGameStarted()`, `setTeam()`

---

### `constants.js` — Sabitler

- **`TEAMS`** — `blue` / `red`: isim, renk kodu, CSS rengi, emoji label
- **`AIRCRAFT_TYPES`** — 3 uçak tipi:
  - **Fighter (Avcı):** Hız 80, Can 6, Sürekli ateş (0.08s cooldown), 1 hasar
  - **Attack (Taaruz):** Hız 65, Can 6, Füze+mermi, 2 hasar, 4 füze
  - **Bomber (Bombardıman):** Hız 45, Can 10, Bomba+mermi, 3 hasar
- **`SYNC_RATE`** — 100ms (10Hz ağ senkronizasyonu)
- **`STREAK_NAMES`** — 2: Double Kill, 3: Triple Kill ... 7: Godlike

---

### `network.js` — Ağ Katmanı

| Fonksiyon | Açıklama |
|-----------|----------|
| `initNetwork()` | "ODAYA KATIL" butonuna event listener ekler |
| `joinRoom()` | Socket.IO bağlantısı kur (localhost/production otomatik algıla) |
| `setupSocketEvents()` | Tüm socket olay dinleyicileri |

**Bağlantı akışı:** 
1. `joinRoom()` → Socket.IO bağlantısı aç
2. `connect` → `getTeamAssignment` emit et
3. `canChoose` true ise iki kartlı takım seçim UI'ı göster, false ise tek kart
4. Takım sonrası → uçak seçim ekranı
5. Uçak seçildikten sonra → `joinRoom` emit

**Dinlenen olaylar:** `playerJoined`, `playerLeft`, `playerMoved`, `bulletSpawned`, `playerDamaged`, `playerKilled`, `playerRespawned`, `scoreUpdate`, `aaUnitDestroyed`, `mapUpdate`, `leaderboard`

---

### `entities.js` — Oyun Varlıkları (En Büyük Modül, ~984 satır)

#### Oluşturma
| Fonksiyon | Açıklama |
|-----------|----------|
| `createPlayer(selectedType)` | Yerel oyuncu oluştur: mesh, pozisyon, can, hız |
| `createEnemy()` | Bot düşman oluştur (singleplayer/lokal botlar) |
| `spawnAntiAirs(serverData)` | Hava savunma birimleri yerleştir (sunucu verisi veya lokal) |
| `createExplosion(pos, color, count)` | Patlama parçacık efekti |
| `createDebris(position)` | Enkaz parçaları efekti |
| `createRemotePlayer(id, data)` | Uzak oyuncu mesh'i oluştur |
| `removeRemotePlayer(id)` | Uzak oyuncu kaldır |

#### Silah Sistemi
| Fonksiyon | Açıklama |
|-----------|----------|
| `tryPlayerShoot()` | Oyuncu ateş girdi kontrolü + cooldown |
| `shootBullet(source, type)` | Normal mermi at (Fighter/Attack/Bomber) |
| `shootCannon(source, type)` | Ağır top mermisi at |
| `shootSingleMissile(source, type)` | Güdümlü füze at (lock-on hedefleme) |
| `dropBomb(source, type)` | Bomba bırak (yerçekimi etkisi) |
| `shoot(source, type)` | Bot/düşman ateş fonksiyonu |
| `aaShoot(aa, target)` | Hava savunma ateşi |

#### Güncelleme Döngüleri (her frame)
| Fonksiyon | Açıklama |
|-----------|----------|
| `updatePlayer(dt)` | Hareket, sınır kontrolü, arazi çarpışması, ağ senkronizasyonu |
| `updateEnemies(dt)` | Bot AI: saldırı, hareket, ateş |
| `updateAntiAirs(dt)` | AA birimlerinin oyuncuya ateşi |
| `updateBullets(dt)` | Mermi hareketi, çarpışma algılama, hasar uygulama |
| `updateParticles(dt)` | Patlama parçacıkları animasyonu |
| `updateDebris(dt)` | Enkaz animasyonu |
| `updateRemotePlayers(dt)` | Uzak oyuncu pozisyon interpolasyonu |

#### Power-Up Sistemi
- **Tipler:** ⚡ Hız Artışı (8sn), 💚 Can Yenileme, 💥 Çift Hasar (8sn)
- `spawnPowerup()` — Rastgele konum ve tipte power-up oluştur
- `updatePowerups(dt)` — Yakınlık kontrolü ve toplama
- `collectPowerup(pu)` — Efekt uygula

---

### `models.js` — 3D Model Fabrikası (~807 satır)

| Fonksiyon | Açıklama |
|-----------|----------|
| `preloadModels()` | GLTF/FBX model dosyalarını önceden yükle |
| `loadModel(path, key, targetSize)` | GLTF modeli yükle |
| `loadFBXModel(path, key, targetSize)` | FBX modeli yükle |
| `createFighterMesh(main, wing)` | Avcı uçağı mesh (prosedürel + model) |
| `createAttackMesh(main, wing)` | Taaruz uçağı mesh |
| `createBomberMesh(main, wing)` | Bombardıman uçağı mesh |
| `createJetMesh(main, wing, type)` | Tip seçicisi → Fighter/Attack/Bomber |
| `createAntiAirMesh()` | Hava savunma mesh'i |
| `createMissileMesh(color)` | Füze mesh'i |
| `createBulletMesh(color, isHeavy)` | Mermi mesh'i (normal/ağır) |
| `createBombMesh()` | Bomba mesh'i |
| `createBombSight()` | Bombardıman nişangahı (bombing kamerası) |
| `addAfterburner(group, zPos, scale)` | Afterburner efekti (motor alevi) |

---

### `graphics.js` — Grafik ve Çevre (~408 satır)

| Fonksiyon | Açıklama |
|-----------|----------|
| `initGraphics()` | Sahne, kamera (FOV 75), renderer (WebGL), sis, ışıklar, ortam oluştur |
| `createSky()` | Gökyüzü kubbesi (gradient shader) |
| `createTerrain()` | Prosedürel arazi (Perlin noise tabanlı, 4000x4000, merkez düzlük) |
| `createTrees()` | Rastgele ağaçlar (çarpışma collider'ları ile) |
| `createBuildings()` | Binalar, gökdelenler, evler (model veya prosedürel) |
| `addShake(amount)` | Kamera sarsıntı efekti |
| `createWindowTexture()` | Binalar için prosedürel pencere dokusu |
| `onWindowResize()` | Pencere boyutu değişikliği |

---

### `ui.js` — Kullanıcı Arayüzü (~232 satır)

| Fonksiyon | Açıklama |
|-----------|----------|
| `initUI()` | FPS sayacı div'i oluştur |
| `updateFPS()` | Her saniye FPS göster |
| `updateHealthBar()` | Can barı güncelle (yeşil → sarı → kırmızı) |
| `updateWeaponUI(type, mode)` | Silah etiketi güncelle (Füze/Mermi/Bomba) |
| `updateAmmoDisplay()` | Füze mühimmat sayısı |
| `updateScore()` | Skor göster |
| `showKillFeed(msg, color)` | Kill feed mesajı (4sn sonra kaybol) |
| `showKillStreak(text)` | Kill streak bildirimi (1.5sn) |
| `showDamageFlash()` | Hasar alınca kırmızı flaş |
| `updateCrosshair()` | 3D → 2D projeksiyon nişangah |
| `updateRadar()` | Mini-harita: oyuncu merkezli, dönen, düşman/takım arkadaşı blipa'ları |

---

### `input.js` — Girdi Yönetimi (~55 satır)

`initInput(shootCallback, cameraCallback)`:
- **Klavye:** `W/S` hız, `A/D` yaw/roll, `Space` ateş, `C` kamera değiştir
- **Fare:** Sol tık → ateş
- **Silah değiştirme:** `1/2` tuşları (Attack: Füze/Mermi, Bomber: Bomba/Mermi)
- **Ters kontrol:** `window.invertedControls` (UI'dan ayarlanır)

---

### `audio.js` — Ses Efektleri (~157 satır)

Web Audio API ile tamamen prosedürel ses üretimi (dosya gerekli değil).

| Fonksiyon | Açıklama |
|-----------|----------|
| `initAudio()` | AudioContext başlat |
| `playShootSound()` | İki katmanlı ateş sesi: keskin çatlak (noise burst) + derin gürültü (oscilator) |
| `playExplodeSound()` | Üç katmanlı patlama sesi: bass boom + enkaz gürültüsü + çıtırtı |
| `playImpactSound()` | Hafif tık sesi (mermi çarpma) |

---

### `utils.js` — Yardımcı Fonksiyonlar (~53 satır)

- **`SimpleNoise`** sınıfı — 3D Perlin noise implementasyonu (arazi üretimi için)
- **`noise`** — Singleton noise objesi
- **`getTerrainHeight(x, z)`** — Perlin noise tabanlı arazi yüksekliği:
  - Büyük tepeler (scale 0.001) + detay (0.005) + kırışıklık (0.02)
  - Merkez 600 birimlik düzlük (pist alanı)
  - Su seviyesi klamplama (y < -20)

---

## 🌐 HTML — `index.html`

### Ekranlar (z-index sıralaması)

1. **Lobby Ekranı** (`#lobby-screen`, z:200) — İsim girişi, oda adı, "ODAYA KATIL" butonu
2. **Takım Seçim Ekranı** (`#team-select`, z:10001):
   - **Eşit mod:** İki kart (Mavi/Kırmızı) yan yana, oyuncu seçer
   - **Otomatik mod:** Tek kart, sunucu atar
3. **Uçak Seçim Ekranı** (`#aircraft-select`, z:10000) — 3 uçak kartı: Avcı, Taaruz, Bombardıman
4. **HUD** (z:10) — Skor, can barı, silah, füze, nişangah, radar, FPS
5. **Kill Feed** (z:100) — Öldürme bildirimleri
6. **Leaderboard** (z:15) — Top 5 skor tablosu

### Bağımlılıklar (CDN)
- `socket.io 4.7.4` — `<script>` etiketi ile
- `three.js 0.160.0` — Import map ile ES modüller olarak

---

## 🚀 Çalıştırma

```bash
# Bağımlılıkları kur
npm install

# Sunucuyu başlat
npm start  # veya: node server.js

# Tarayıcıda aç
# http://localhost:3000
```

**Ortam değişkenleri:**
- `PORT` — Sunucu portu (varsayılan: 3000)

**İstemci URL parametreleri:**
- `?server=http://...` — Özel sunucu adresi belirtme

---

## 🔧 Modül Bağımlılık Grafiği

```
main.js
├── state.js
├── constants.js
├── graphics.js ← state.js, utils.js
├── input.js ← state.js, ui.js, audio.js
├── audio.js ← state.js
├── network.js ← state.js, constants.js, entities.js, models.js, ui.js, graphics.js
├── ui.js ← state.js
├── entities.js ← state.js, utils.js, constants.js, audio.js, graphics.js, models.js
├── models.js ← (standalone Three.js)
└── utils.js ← (standalone, Perlin noise)
```
