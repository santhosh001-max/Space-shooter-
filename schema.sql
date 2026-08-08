-- =========================================================
-- Space Shooter 2D - Database Schema (SQLite)
-- =========================================================

PRAGMA foreign_keys = ON;

-- Players
CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    coins           INTEGER NOT NULL DEFAULT 0,
    hearts          INTEGER NOT NULL DEFAULT 3,
    current_ship_id INTEGER NOT NULL DEFAULT 1,
    current_level   INTEGER NOT NULL DEFAULT 1,
    best_score      INTEGER NOT NULL DEFAULT 0,   -- best Infinity-mode score
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_ship_id) REFERENCES spaceships(id)
);

-- Spaceships available in the shop
CREATE TABLE IF NOT EXISTS spaceships (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    cost            INTEGER NOT NULL,
    speed           INTEGER NOT NULL,       -- movement speed
    power_capacity  INTEGER NOT NULL,       -- how strong / long the "power" ability is
    fire_rate       INTEGER NOT NULL,       -- ms between shots
    shield          INTEGER NOT NULL DEFAULT 0, -- armor: hits absorbed before a heart is lost
    unlock_level    INTEGER NOT NULL,       -- level that must be completed to unlock (0 = free)
    color           TEXT NOT NULL DEFAULT '#00e5ff'
);

-- Ships a player owns (many-to-many)
CREATE TABLE IF NOT EXISTS player_spaceships (
    player_id       INTEGER NOT NULL,
    spaceship_id    INTEGER NOT NULL,
    acquired_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, spaceship_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (spaceship_id) REFERENCES spaceships(id) ON DELETE CASCADE
);

-- Levels
CREATE TABLE IF NOT EXISTS levels (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    level_number    INTEGER NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    distance        INTEGER NOT NULL,       -- total distance from start to goal
    alien_count     INTEGER NOT NULL,
    obstacle_density REAL NOT NULL,         -- 0..1
    reward_coins    INTEGER NOT NULL,
    unlock_ship_id  INTEGER,                -- ship unlocked when this level is completed
    FOREIGN KEY (unlock_ship_id) REFERENCES spaceships(id)
);

-- Player progress per level
CREATE TABLE IF NOT EXISTS player_progress (
    player_id       INTEGER NOT NULL,
    level_id        INTEGER NOT NULL,
    completed       INTEGER NOT NULL DEFAULT 0, -- 0/1
    best_coins      INTEGER NOT NULL DEFAULT 0,
    attempts        INTEGER NOT NULL DEFAULT 0,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, level_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE
);

-- =========================================================
-- Seed data
-- =========================================================

INSERT INTO spaceships (name, cost, speed, power_capacity, fire_rate, shield, unlock_level, color) VALUES
('Falcon Starter', 0,   4, 1, 400, 0, 0, '#00e5ff'),
('Nova Striker',   300, 5, 2, 320, 1, 1, '#ff9100'),
('Vortex Blade',   700, 6, 3, 260, 2, 2, '#7c4dff'),
('Titan Cruiser', 1200, 7, 4, 200, 3, 3, '#ff1744'),
('Phoenix X',     2000, 8, 5, 150, 4, 4, '#ffd600');

INSERT INTO levels (level_number, name, distance, alien_count, obstacle_density, reward_coins, unlock_ship_id) VALUES
(1, 'Asteroid Belt',   3000, 5,  0.20, 150, 2),
(2, 'Alien Outpost',   4000, 8,  0.30, 220, 3),
(3, 'Meteor Storm',    5000, 10, 0.40, 300, 4),
(4, 'Deep Space Rift', 6000, 14, 0.50, 400, 5),
(5, 'Mothership Gate', 8000, 20, 0.60, 600, NULL);
