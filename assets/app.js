const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")

const COLORS = ["#3498db", "#2ecc71", "#f1c40f", "#e67e22", "#9b59b6", "#e91e63", "#1abc9c", "#16a085"]
const INITIAL_CELLS = 80
const WORLD_SIZE = 3000
const GRID_SIZE = 50
const SLOWDOWN_RATE = 0.015
const MIN_SPEED_MULTIPLIER = 0.2
const SPLIT_DECAY_TIME = 5000

const AI_VISION_RADIUS = 400 // How far AI can see
const AI_DECISION_INTERVAL = 300 // How often AI makes decisions (ms)
const AI_FLEE_DISTANCE = 350 // Start fleeing when danger is this close
const AI_CHASE_DISTANCE = 450 // Start chasing when prey is this close

let gameState = "menu"
let score = 0
let highScore = 0
let cells = []
let player = null
let cellIdCounter = 0
let animationId = null

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  up: false,
  down: false,
  left: false,
  right: false,
}

// Initialize
function init() {
  resizeCanvas()
  loadHighScore()
  updateMenuHighScore()

  document.getElementById("startBtn").addEventListener("click", startGame)
  document.getElementById("restartBtn").addEventListener("click", restartGame)

  window.addEventListener("resize", resizeCanvas)
  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)
}

function resizeCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}

function loadHighScore() {
  const saved = localStorage.getItem("highScore")
  if (saved) highScore = Number.parseInt(saved)
}

function saveHighScore() {
  localStorage.setItem("highScore", highScore.toString())
}

function updateMenuHighScore() {
  if (highScore > 0) {
    document.getElementById("menuHighScore").classList.remove("hidden")
    document.getElementById("menuHighScoreValue").textContent = highScore
  }
}

function startGame() {
  cellIdCounter = 0
  cells = []
  score = 0

  // Create player
  player = {
    id: cellIdCounter++,
    x: 0,
    y: 0,
    size: 30,
    color: "#ff4444",
    vx: 0,
    vy: 0,
    isPlayer: true,
    splitCooldown: 0,
    splitCount: 0,
    lastSplitTime: Date.now(),
  }
  cells.push(player)

  for (let i = 0; i < INITIAL_CELLS; i++) {
    const size = 5 + Math.random() * 25
    const isAI = size > 15 // Larger cells are AI-controlled

    cells.push({
      id: cellIdCounter++,
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      size: size,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      isPlayer: false,
      isAI: isAI,
      splitCount: Math.floor(Math.random() * 3),
      lastSplitTime: Date.now(),
      lastAIDecision: Date.now(),
      targetX: 0,
      targetY: 0,
    })
  }

  gameState = "playing"
  document.getElementById("menu").classList.add("hidden")
  document.getElementById("hud").classList.remove("hidden")
  document.getElementById("controls").classList.remove("hidden")

  if (animationId) cancelAnimationFrame(animationId)
  gameLoop()
}

function restartGame() {
  document.getElementById("gameOver").classList.add("hidden")
  startGame()
}

function handleKeyDown(e) {
  if (gameState !== "playing") return

  const key = e.key.toLowerCase()
  if (key === "w" || key === "arrowup") {
    keys.w = keys.up = true
  }
  if (key === "a" || key === "arrowleft") {
    keys.a = keys.left = true
  }
  if (key === "s" || key === "arrowdown") {
    keys.s = keys.down = true
  }
  if (key === "d" || key === "arrowright") {
    keys.d = keys.right = true
  }
  if (e.code === "Space") {
    e.preventDefault()
    splitPlayer()
  }
}

function handleKeyUp(e) {
  const key = e.key.toLowerCase()
  if (key === "w" || key === "arrowup") {
    keys.w = keys.up = false
  }
  if (key === "a" || key === "arrowleft") {
    keys.a = keys.left = false
  }
  if (key === "s" || key === "arrowdown") {
    keys.s = keys.down = false
  }
  if (key === "d" || key === "arrowright") {
    keys.d = keys.right = false
  }
}

function splitPlayer() {
  const players = cells.filter((c) => c.isPlayer)
  const toAdd = []
  const now = Date.now()

  players.forEach((p) => {
    if (p.size > 20 && p.splitCooldown <= 0) {
      let dx = 0,
        dy = 0
      if (keys.w || keys.up) dy -= 1
      if (keys.s || keys.down) dy += 1
      if (keys.a || keys.left) dx -= 1
      if (keys.d || keys.right) dx += 1

      if (dx === 0 && dy === 0) {
        dx = p.vx
        dy = p.vy
      }

      const angle = Math.atan2(dy, dx)
      const speed = 10
      const newSplitCount = p.splitCount + 1

      const newPiece = {
        id: cellIdCounter++,
        x: p.x,
        y: p.y,
        size: p.size * 0.5,
        color: p.color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        isPlayer: true,
        splitCooldown: 150,
        splitCount: newSplitCount,
        lastSplitTime: now,
      }

      p.size *= 0.7
      p.vx -= Math.cos(angle) * 3
      p.vy -= Math.sin(angle) * 3
      p.splitCooldown = 150
      p.splitCount = newSplitCount
      p.lastSplitTime = now

      toAdd.push(newPiece)
    }
  })

  cells.push(...toAdd)
}

function updateAI(cell) {
  const now = Date.now()

  // Make decisions at intervals
  if (now - cell.lastAIDecision < AI_DECISION_INTERVAL) {
    return
  }

  cell.lastAIDecision = now

  // Find nearby cells within vision radius
  const nearby = cells.filter((other) => {
    if (other.id === cell.id) return false
    const dx = other.x - cell.x
    const dy = other.y - cell.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    return dist < AI_VISION_RADIUS
  })

  // Categorize nearby cells
  const threats = [] // Can eat me
  const prey = [] // I can eat them
  const food = [] // Small food particles

  nearby.forEach((other) => {
    const dx = other.x - cell.x
    const dy = other.y - cell.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Check if it's a threat (can eat me)
    const canEatMe =
      other.size > cell.size * 1.15 &&
      (other.splitCount > cell.splitCount + 1 || (other.splitCount >= cell.splitCount && other.size > cell.size * 1.15))

    // Check if it's prey (I can eat it)
    const canIEat =
      cell.size > other.size * 1.15 &&
      (cell.splitCount > other.splitCount + 1 || (cell.splitCount >= other.splitCount && cell.size > other.size * 1.15))

    if (canEatMe) {
      threats.push({ cell: other, dist, dx, dy })
    } else if (canIEat) {
      prey.push({ cell: other, dist, dx, dy })
    } else if (other.size < 15 && !other.isAI) {
      food.push({ cell: other, dist, dx, dy })
    }
  })

  // Decision priority: Flee > Chase > Collect Food > Wander

  // 1. FLEE from threats
  if (threats.length > 0) {
    const closestThreat = threats.sort((a, b) => a.dist - b.dist)[0]

    if (closestThreat.dist < AI_FLEE_DISTANCE) {
      // Run away from threat
      const fleeAngle = Math.atan2(-closestThreat.dy, -closestThreat.dx)
      cell.targetX = cell.x + Math.cos(fleeAngle) * 500
      cell.targetY = cell.y + Math.sin(fleeAngle) * 500
      return
    }
  }

  // 2. CHASE prey
  if (prey.length > 0) {
    const closestPrey = prey.sort((a, b) => a.dist - b.dist)[0]

    if (closestPrey.dist < AI_CHASE_DISTANCE) {
      // Chase prey
      cell.targetX = closestPrey.cell.x
      cell.targetY = closestPrey.cell.y
      return
    }
  }

  // 3. Collect FOOD
  if (food.length > 0) {
    const closestFood = food.sort((a, b) => a.dist - b.dist)[0]
    cell.targetX = closestFood.cell.x
    cell.targetY = closestFood.cell.y
    return
  }

  // 4. WANDER randomly
  if (Math.random() < 0.3) {
    cell.targetX = cell.x + (Math.random() - 0.5) * 600
    cell.targetY = cell.y + (Math.random() - 0.5) * 600
  }
}

function spawnFood() {
  if (Math.random() < 0.03 && cells.length < INITIAL_CELLS + 50) {
    cells.push({
      id: cellIdCounter++,
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      size: 5 + Math.random() * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: 0,
      vy: 0,
      isPlayer: false,
      isAI: false,
      splitCount: 0,
      lastSplitTime: Date.now(),
    })
  }
}

function update() {
  if (gameState !== "playing") return

  const players = cells.filter((c) => c.isPlayer)

  if (players.length === 0) {
    endGame()
    return
  }

  const now = Date.now()

  // Decay split count over time
  cells.forEach((cell) => {
    const timeSinceLastSplit = now - cell.lastSplitTime
    if (timeSinceLastSplit > SPLIT_DECAY_TIME && cell.splitCount > 0) {
      const decaySteps = Math.floor((timeSinceLastSplit - SPLIT_DECAY_TIME) / SPLIT_DECAY_TIME)
      cell.splitCount = Math.max(0, cell.splitCount - decaySteps)
      if (decaySteps > 0) {
        cell.lastSplitTime = now
      }
    }
  })

  // Update players
  players.forEach((p) => {
    let dx = 0,
      dy = 0

    if (keys.w || keys.up) dy -= 1
    if (keys.s || keys.down) dy += 1
    if (keys.a || keys.left) dx -= 1
    if (keys.d || keys.right) dx += 1

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707
      dy *= 0.707
    }

    const baseSpeed = Math.max(0.5, 6 - p.size / 15)
    const splitBonus = p.splitCount * 0.3
    const speedMultiplier = Math.max(
      MIN_SPEED_MULTIPLIER,
      1 + splitBonus - ((now - p.lastSplitTime) / 10000) * SLOWDOWN_RATE,
    )
    const speed = baseSpeed * speedMultiplier

    if (dx !== 0 || dy !== 0) {
      p.vx += dx * speed * 0.15
      p.vy += dy * speed * 0.15
    }

    p.vx *= 0.92
    p.vy *= 0.92
    p.x += p.vx
    p.y += p.vy

    const limit = WORLD_SIZE / 2
    p.x = Math.max(-limit, Math.min(limit, p.x))
    p.y = Math.max(-limit, Math.min(limit, p.y))

    if (p.splitCooldown > 0) p.splitCooldown--
  })

  cells.forEach((cell) => {
    if (!cell.isPlayer && cell.isAI) {
      updateAI(cell)

      // Move towards target
      const dx = cell.targetX - cell.x
      const dy = cell.targetY - cell.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 10) {
        const baseSpeed = Math.max(0.5, 6 - cell.size / 15)
        const splitBonus = cell.splitCount * 0.3
        const speedMultiplier = Math.max(
          MIN_SPEED_MULTIPLIER,
          1 + splitBonus - ((now - cell.lastSplitTime) / 10000) * SLOWDOWN_RATE,
        )
        const speed = baseSpeed * speedMultiplier

        cell.vx += (dx / dist) * speed * 0.08
        cell.vy += (dy / dist) * speed * 0.08
      }
    }

    // Update non-player cells
    if (!cell.isPlayer) {
      cell.x += cell.vx
      cell.y += cell.vy

      if (!cell.isAI && Math.random() < 0.015) {
        cell.vx += (Math.random() - 0.5) * 0.6
        cell.vy += (Math.random() - 0.5) * 0.6
      }

      cell.vx *= 0.97
      cell.vy *= 0.97

      const limit = WORLD_SIZE / 2
      if (Math.abs(cell.x) > limit) cell.vx *= -0.5
      if (Math.abs(cell.y) > limit) cell.vy *= -0.5
    }
  })

  // Collision detection
  const toRemove = new Set()

  for (let i = 0; i < cells.length; i++) {
    if (toRemove.has(i)) continue

    for (let j = i + 1; j < cells.length; j++) {
      if (toRemove.has(j)) continue

      const a = cells[i]
      const b = cells[j]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < (a.size + b.size) * 0.8) {
        const sizeAdvantage = a.size > b.size * 1.15
        const reverseSizeAdvantage = b.size > a.size * 1.15

        const splitAdvantage = a.splitCount > b.splitCount + 1
        const reverseSplitAdvantage = b.splitCount > a.splitCount + 1

        if ((sizeAdvantage && splitAdvantage) || (sizeAdvantage && a.splitCount >= b.splitCount)) {
          a.size = Math.sqrt(a.size * a.size + b.size * b.size * 0.8)
          a.splitCount = Math.max(a.splitCount, Math.floor((a.splitCount + b.splitCount) / 2))
          toRemove.add(j)
          if (a.isPlayer) score += Math.floor(b.size * 2)
        } else if (
          (reverseSizeAdvantage && reverseSplitAdvantage) ||
          (reverseSizeAdvantage && b.splitCount >= a.splitCount)
        ) {
          b.size = Math.sqrt(b.size * b.size + a.size * a.size * 0.8)
          b.splitCount = Math.max(b.splitCount, Math.floor((b.splitCount + a.splitCount) / 2))
          toRemove.add(i)
          if (b.isPlayer) score += Math.floor(a.size * 2)
          break
        }
      }
    }
  }

  cells = cells.filter((_, i) => !toRemove.has(i))

  updateUI()
  spawnFood()
}

function updateUI() {
  document.getElementById("score").textContent = score
  document.getElementById("highScore").textContent = highScore
}

function endGame() {
  gameState = "gameover"

  document.getElementById("hud").classList.add("hidden")
  document.getElementById("controls").classList.add("hidden")
  document.getElementById("finalScore").textContent = score

  if (score > highScore) {
    highScore = score
    saveHighScore()
    document.getElementById("newRecord").classList.remove("hidden")
    document.getElementById("gameOverHighScore").classList.add("hidden")
  } else if (highScore > 0) {
    document.getElementById("newRecord").classList.add("hidden")
    document.getElementById("gameOverHighScore").classList.remove("hidden")
    document.getElementById("gameOverHighScoreValue").textContent = highScore
  }

  document.getElementById("gameOver").classList.remove("hidden")
}

function draw() {
  ctx.fillStyle = "#f8f9fa"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)

  const camX = player ? player.x : 0
  const camY = player ? player.y : 0

  // Draw grid
  ctx.strokeStyle = "#e0e0e0"
  ctx.lineWidth = 1

  for (let x = -WORLD_SIZE; x < WORLD_SIZE; x += GRID_SIZE) {
    ctx.beginPath()
    ctx.moveTo(x - camX, -canvas.height)
    ctx.lineTo(x - camX, canvas.height)
    ctx.stroke()
  }

  for (let y = -WORLD_SIZE; y < WORLD_SIZE; y += GRID_SIZE) {
    ctx.beginPath()
    ctx.moveTo(-canvas.width, y - camY)
    ctx.lineTo(canvas.width, y - camY)
    ctx.stroke()
  }

  // Draw cells
  const sortedCells = [...cells].sort((a, b) => a.size - b.size)

  sortedCells.forEach((cell) => {
    const screenX = cell.x - camX
    const screenY = cell.y - camY

    ctx.shadowColor = "rgba(0, 0, 0, 0.2)"
    ctx.shadowBlur = cell.size * 0.3
    ctx.shadowOffsetX = 3
    ctx.shadowOffsetY = 3

    ctx.beginPath()
    ctx.fillStyle = cell.color
    ctx.arc(screenX, screenY, cell.size, 0, Math.PI * 2)
    ctx.fill()

    if (cell.isPlayer) {
      ctx.shadowColor = "transparent"
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.strokeStyle = "#ff0000"
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.shadowColor = "transparent"

    if (cell.splitCount > 0) {
      ctx.fillStyle = cell.isPlayer ? "#ffffff" : "#000000"
      ctx.font = `bold ${Math.max(12, cell.size * 0.4)}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(`×${cell.splitCount}`, screenX, screenY)
    }
  })

  ctx.restore()
}

function gameLoop() {
  update()
  draw()
  animationId = requestAnimationFrame(gameLoop)
}

// Start
init()
