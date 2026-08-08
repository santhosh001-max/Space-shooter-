// server.js - REST API for the Space Shooter game
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ---------- helpers ----------
function getOrCreatePlayer(username) {
  let player = db.prepare('SELECT * FROM players WHERE username = ?').get(username);
  if (!player) {
    const info = db.prepare(
      'INSERT INTO players (username, coins, hearts, current_ship_id, current_level) VALUES (?, 0, 3, 1, 1)'
    ).run(username);
    db.prepare('INSERT INTO player_spaceships (player_id, spaceship_id) VALUES (?, 1)').run(info.lastInsertRowid);
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
  }
  return player;
}

function playerPublicState(player) {
  const ships = db.prepare(`
    SELECT s.* FROM spaceships s
    JOIN player_spaceships ps ON ps.spaceship_id = s.id
    WHERE ps.player_id = ?
  `).all(player.id);

  const progress = db.prepare('SELECT * FROM player_progress WHERE player_id = ?').all(player.id);

  return {
    id: player.id,
    username: player.username,
    coins: player.coins,
    hearts: player.hearts,
    currentShipId: player.current_ship_id,
    currentLevel: player.current_level,
    bestScore: player.best_score,
    ownedShips: ships,
    progress
  };
}

// ---------- routes ----------

// Get / create player profile
app.get('/api/player/:username', (req, res) => {
  const player = getOrCreatePlayer(req.params.username);
  res.json(playerPublicState(player));
});

// List all spaceships (shop catalogue)
app.get('/api/spaceships', (req, res) => {
  const ships = db.prepare('SELECT * FROM spaceships ORDER BY cost ASC').all();
  res.json(ships);
});

// List all levels
app.get('/api/levels', (req, res) => {
  const levels = db.prepare('SELECT * FROM levels ORDER BY level_number ASC').all();
  res.json(levels);
});

// Buy / unlock a spaceship with coins
app.post('/api/player/:username/buy-ship', (req, res) => {
  const { shipId } = req.body;
  const player = getOrCreatePlayer(req.params.username);
  const ship = db.prepare('SELECT * FROM spaceships WHERE id = ?').get(shipId);

  if (!ship) return res.status(404).json({ error: 'Ship not found' });

  const owned = db.prepare(
    'SELECT 1 FROM player_spaceships WHERE player_id = ? AND spaceship_id = ?'
  ).get(player.id, shipId);
  if (owned) return res.status(400).json({ error: 'Ship already owned' });

  if (player.coins < ship.cost) {
    return res.status(400).json({ error: 'Not enough coins' });
  }
  if (player.current_level < ship.unlock_level) {
    return res.status(400).json({ error: 'Level not reached yet' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET coins = coins - ? WHERE id = ?').run(ship.cost, player.id);
    db.prepare('INSERT INTO player_spaceships (player_id, spaceship_id) VALUES (?, ?)').run(player.id, shipId);
  });
  tx();

  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
  res.json(playerPublicState(updated));
});

// Select currently active ship
app.post('/api/player/:username/select-ship', (req, res) => {
  const { shipId } = req.body;
  const player = getOrCreatePlayer(req.params.username);

  const owned = db.prepare(
    'SELECT 1 FROM player_spaceships WHERE player_id = ? AND spaceship_id = ?'
  ).get(player.id, shipId);
  if (!owned) return res.status(400).json({ error: 'Ship not owned' });

  db.prepare('UPDATE players SET current_ship_id = ? WHERE id = ?').run(shipId, player.id);
  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
  res.json(playerPublicState(updated));
});

// Report the result of a level attempt (win or crash)
app.post('/api/player/:username/level-result', (req, res) => {
  // body: { levelId, won: bool, coinsCollected: number }
  const { levelId, won, coinsCollected = 0 } = req.body;
  const player = getOrCreatePlayer(req.params.username);
  const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(levelId);
  if (!level) return res.status(404).json({ error: 'Level not found' });

  const tx = db.transaction(() => {
    const existing = db.prepare(
      'SELECT * FROM player_progress WHERE player_id = ? AND level_id = ?'
    ).get(player.id, levelId);

    const totalCoins = coinsCollected + (won ? level.reward_coins : 0);

    if (existing) {
      db.prepare(`
        UPDATE player_progress
        SET completed = MAX(completed, ?), best_coins = MAX(best_coins, ?), attempts = attempts + 1
        WHERE player_id = ? AND level_id = ?
      `).run(won ? 1 : 0, totalCoins, player.id, levelId);
    } else {
      db.prepare(`
        INSERT INTO player_progress (player_id, level_id, completed, best_coins, attempts)
        VALUES (?, ?, ?, ?, 1)
      `).run(player.id, levelId, won ? 1 : 0, totalCoins);
    }

    db.prepare('UPDATE players SET coins = coins + ? WHERE id = ?').run(totalCoins, player.id);

    if (won && level.level_number >= player.current_level) {
      db.prepare('UPDATE players SET current_level = ? WHERE id = ?')
        .run(level.level_number + 1, player.id);

      // auto-unlock the reward ship tied to this level, if any (still must be "bought" if it has a cost of 0 it's instant)
      if (level.unlock_ship_id) {
        const alreadyOwned = db.prepare(
          'SELECT 1 FROM player_spaceships WHERE player_id = ? AND spaceship_id = ?'
        ).get(player.id, level.unlock_ship_id);
        if (!alreadyOwned) {
          // Just marks it as "available to buy" — front-end shop checks unlock_level vs current_level.
          // If you want it FREE on unlock, uncomment the next line:
          // db.prepare('INSERT INTO player_spaceships (player_id, spaceship_id) VALUES (?, ?)').run(player.id, level.unlock_ship_id);
        }
      }
    }
  });
  tx();

  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
  res.json(playerPublicState(updated));
});

// Update hearts (lives) directly, e.g. after a crash mid-run or when granting an extra life power-up
app.post('/api/player/:username/hearts', (req, res) => {
  const { hearts } = req.body;
  const player = getOrCreatePlayer(req.params.username);
  const clamped = Math.max(0, Math.min(5, hearts));
  db.prepare('UPDATE players SET hearts = ? WHERE id = ?').run(clamped, player.id);
  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
  res.json(playerPublicState(updated));
});

// Report an Infinity-mode run's score; keeps the best score
app.post('/api/player/:username/score', (req, res) => {
  const { score = 0 } = req.body;
  const player = getOrCreatePlayer(req.params.username);
  const best = Math.max(player.best_score, score);
  db.prepare('UPDATE players SET best_score = ? WHERE id = ?').run(best, player.id);
  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
  res.json(playerPublicState(updated));
});

app.listen(PORT, () => {
  console.log(`Space Shooter API running on http://localhost:${PORT}`);
});
