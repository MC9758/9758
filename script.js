const LEVELS = {
  beginner: { label: "初级", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "中级", rows: 16, cols: 16, mines: 40 },
  expert: { label: "高级", rows: 16, cols: 30, mines: 99 }
};

const MOBILE_BOARD_QUERY = "(max-width: 760px)";
const LONG_PRESS_MS = 520;
const TOUCH_MOVE_CANCEL_PX = 12;

const ICONS = {
  faceReady: "🙂",
  faceWin: "😎",
  faceLose: "😵",
  flag: "🚩",
  mine: "●",
  wrong: "×"
};

const boardEl = document.querySelector("#board");
const resetButton = document.querySelector("#reset-button");
const mineCounterEl = document.querySelector("#mine-counter");
const timerEl = document.querySelector("#timer");
const toastEl = document.querySelector("#toast");
const difficultyButtons = document.querySelectorAll(".difficulty-button");
const modeButtons = document.querySelectorAll(".mode-button");

let currentLevel = "beginner";
let activeConfig = LEVELS.beginner;
let touchMode = "reveal";
let touchState = null;
let suppressClickUntil = 0;
let suppressContextUntil = 0;
let cells = [];
let firstClick = true;
let gameOver = false;
let flagsUsed = 0;
let openedCount = 0;
let seconds = 0;
let timerId = null;
let toastTimer = null;

function createCell(row, col) {
  return {
    row,
    col,
    index: row * activeConfig.cols + col,
    hasMine: false,
    adjacentMines: 0,
    isOpen: false,
    isFlagged: false,
    element: null
  };
}

function startGame(level = currentLevel) {
  currentLevel = level;
  activeConfig = getLevelConfig(currentLevel);
  const { rows, cols, mines } = activeConfig;

  stopTimer();
  cells = [];
  firstClick = true;
  gameOver = false;
  flagsUsed = 0;
  openedCount = 0;
  seconds = 0;
  resetButton.textContent = ICONS.faceReady;
  timerEl.textContent = formatNumber(seconds);
  updateMineCounter(mines);
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--cols", cols);
  boardEl.dataset.level = currentLevel;
  boardEl.setAttribute("aria-rowcount", rows);
  boardEl.setAttribute("aria-colcount", cols);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = createCell(row, col);
      const button = document.createElement("button");
      button.className = "cell";
      button.type = "button";
      button.dataset.index = String(cell.index);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列，未翻开`);
      button.addEventListener("click", (event) => {
        if (shouldSuppressMouseClick(event)) {
          event.preventDefault();
          return;
        }
        handleReveal(cell.index);
      });
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (Date.now() < suppressContextUntil) {
          return;
        }
        handleFlag(cell.index);
      });
      button.addEventListener("mousedown", (event) => {
        if (event.buttons === 3) {
          event.preventDefault();
          chordCell(cell.index);
        }
      });
      button.addEventListener("pointerdown", (event) => handleTouchStart(event, cell.index));
      button.addEventListener("pointermove", (event) => handleTouchMove(event, cell.index));
      button.addEventListener("pointerup", (event) => handleTouchEnd(event, cell.index));
      button.addEventListener("pointercancel", (event) => cancelTouch(event, cell.index));
      cell.element = button;
      cells.push(cell);
      boardEl.appendChild(button);
    }
  }

  setActiveDifficulty();
  setActiveTouchMode();
}

function placeMines(safeIndex) {
  const { mines } = activeConfig;
  const blocked = new Set([safeIndex, ...getNeighborIndexes(safeIndex)]);
  const candidates = cells
    .map((cell) => cell.index)
    .filter((index) => !blocked.has(index));

  shuffle(candidates);

  for (let i = 0; i < mines; i += 1) {
    cells[candidates[i]].hasMine = true;
  }

  cells.forEach((cell) => {
    cell.adjacentMines = getNeighbors(cell.index)
      .filter((neighbor) => neighbor.hasMine)
      .length;
  });
}

function handleReveal(index) {
  const cell = cells[index];

  if (gameOver || cell.isOpen || cell.isFlagged) {
    return;
  }

  if (firstClick) {
    firstClick = false;
    placeMines(index);
    startTimer();
  }

  if (cell.hasMine) {
    loseGame(index);
    return;
  }

  openCell(index);
  checkWin();
}

function handleFlag(index) {
  const cell = cells[index];
  const { mines } = activeConfig;

  if (gameOver || cell.isOpen) {
    return;
  }

  if (!firstClick) {
    startTimer();
  }

  cell.isFlagged = !cell.isFlagged;
  flagsUsed += cell.isFlagged ? 1 : -1;
  renderCell(cell);
  updateMineCounter(mines - flagsUsed);
  checkWin();
}

function openCell(index) {
  const stack = [index];

  while (stack.length > 0) {
    const current = cells[stack.pop()];

    if (current.isOpen || current.isFlagged) {
      continue;
    }

    current.isOpen = true;
    openedCount += 1;
    renderCell(current);

    if (current.adjacentMines === 0) {
      getNeighbors(current.index).forEach((neighbor) => {
        if (!neighbor.isOpen && !neighbor.isFlagged && !neighbor.hasMine) {
          stack.push(neighbor.index);
        }
      });
    }
  }
}

function chordCell(index) {
  const cell = cells[index];

  if (gameOver || !cell.isOpen || cell.adjacentMines === 0) {
    return;
  }

  const neighbors = getNeighbors(index);
  const flagCount = neighbors.filter((neighbor) => neighbor.isFlagged).length;

  if (flagCount !== cell.adjacentMines) {
    showToast("周围旗子数量需要等于数字");
    return;
  }

  const wrongFlag = neighbors.some((neighbor) => neighbor.isFlagged && !neighbor.hasMine);
  if (wrongFlag) {
    const firstWrong = neighbors.find((neighbor) => neighbor.isFlagged && !neighbor.hasMine);
    loseGame(firstWrong.index);
    return;
  }

  neighbors.forEach((neighbor) => {
    if (!neighbor.isFlagged && !neighbor.isOpen) {
      if (neighbor.hasMine) {
        loseGame(neighbor.index);
      } else {
        openCell(neighbor.index);
      }
    }
  });

  checkWin();
}

function handleTouchStart(event, index) {
  if (!isTouchPointer(event)) {
    return;
  }

  event.preventDefault();
  suppressClickUntil = Date.now() + 900;
  suppressContextUntil = Date.now() + 1200;
  clearTouchState();

  touchState = {
    pointerId: event.pointerId,
    index,
    startX: event.clientX,
    startY: event.clientY,
    didLongPress: false,
    timerId: window.setTimeout(() => {
      if (!touchState || touchState.pointerId !== event.pointerId || touchState.index !== index) {
        return;
      }

      touchState.didLongPress = true;
      performTouchLongPress(index);
      suppressClickUntil = Date.now() + 900;
      suppressContextUntil = Date.now() + 1200;
    }, LONG_PRESS_MS)
  };

  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function handleTouchMove(event, index) {
  if (!isTouchPointer(event) || !touchState || touchState.pointerId !== event.pointerId || touchState.index !== index) {
    return;
  }

  const movedX = Math.abs(event.clientX - touchState.startX);
  const movedY = Math.abs(event.clientY - touchState.startY);

  if (movedX > TOUCH_MOVE_CANCEL_PX || movedY > TOUCH_MOVE_CANCEL_PX) {
    clearTouchState();
  }
}

function handleTouchEnd(event, index) {
  if (!isTouchPointer(event) || !touchState || touchState.pointerId !== event.pointerId || touchState.index !== index) {
    return;
  }

  event.preventDefault();
  const didLongPress = touchState.didLongPress;
  clearTouchState();
  suppressClickUntil = Date.now() + 900;
  suppressContextUntil = Date.now() + 1200;

  if (!didLongPress) {
    performTouchTap(index);
  }
}

function cancelTouch(event, index) {
  if (!isTouchPointer(event) || !touchState || touchState.pointerId !== event.pointerId || touchState.index !== index) {
    return;
  }

  clearTouchState();
}

function performTouchTap(index) {
  const cell = cells[index];

  if (!cell || gameOver) {
    return;
  }

  if (cell.isOpen) {
    chordCell(index);
    return;
  }

  if (touchMode === "flag") {
    handleFlag(index);
    return;
  }

  handleReveal(index);
}

function performTouchLongPress(index) {
  const cell = cells[index];

  if (!cell || gameOver || cell.isOpen) {
    return;
  }

  if (touchMode === "flag") {
    handleReveal(index);
    return;
  }

  handleFlag(index);
}

function clearTouchState() {
  if (touchState?.timerId) {
    window.clearTimeout(touchState.timerId);
  }
  touchState = null;
}

function shouldSuppressMouseClick(event) {
  return event.pointerType === "touch" || Date.now() < suppressClickUntil;
}

function isTouchPointer(event) {
  return event.pointerType === "touch" && isMobileBoard();
}

function loseGame(hitIndex) {
  gameOver = true;
  stopTimer();
  resetButton.textContent = ICONS.faceLose;

  cells.forEach((cell) => {
    if (cell.hasMine) {
      cell.isOpen = true;
    }
    renderCell(cell, hitIndex);
  });

  showToast("踩到雷了，再来一局");
}

function winGame() {
  gameOver = true;
  stopTimer();
  resetButton.textContent = ICONS.faceWin;

  cells.forEach((cell) => {
    if (cell.hasMine && !cell.isFlagged) {
      cell.isFlagged = true;
      flagsUsed += 1;
    }
    renderCell(cell);
  });

  updateMineCounter(0);
  showToast(`完成！用时 ${seconds} 秒`);
}

function checkWin() {
  const { mines } = activeConfig;

  if (!gameOver && openedCount === cells.length - mines) {
    winGame();
  }
}

function renderCell(cell, hitIndex = -1) {
  const el = cell.element;
  el.className = "cell";
  el.textContent = "";
  el.disabled = false;

  if (cell.isOpen) {
    el.classList.add("is-open");

    if (cell.hasMine) {
      el.classList.add("is-mine");
      el.textContent = ICONS.mine;
      el.setAttribute("aria-label", `第 ${cell.row + 1} 行，第 ${cell.col + 1} 列，有雷`);

      if (cell.index === hitIndex) {
        el.classList.add("is-hit");
      }
    } else if (cell.adjacentMines > 0) {
      el.textContent = String(cell.adjacentMines);
      el.classList.add(`num-${cell.adjacentMines}`);
      el.setAttribute("aria-label", `第 ${cell.row + 1} 行，第 ${cell.col + 1} 列，周围 ${cell.adjacentMines} 个雷`);
    } else {
      el.setAttribute("aria-label", `第 ${cell.row + 1} 行，第 ${cell.col + 1} 列，空白`);
    }
    return;
  }

  if (cell.isFlagged) {
    el.classList.add("is-flagged");
    el.textContent = ICONS.flag;
    el.setAttribute("aria-label", `第 ${cell.row + 1} 行，第 ${cell.col + 1} 列，已插旗`);
    if (gameOver && !cell.hasMine) {
      el.classList.add("is-wrong");
      el.textContent = ICONS.wrong;
    }
    return;
  }

  el.setAttribute("aria-label", `第 ${cell.row + 1} 行，第 ${cell.col + 1} 列，未翻开`);
}

function getNeighbors(index) {
  return getNeighborIndexes(index).map((neighborIndex) => cells[neighborIndex]);
}

function getNeighborIndexes(index) {
  const { rows, cols } = activeConfig;
  const row = Math.floor(index / cols);
  const col = index % cols;
  const neighbors = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;

      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        neighbors.push(nextRow * cols + nextCol);
      }
    }
  }

  return neighbors;
}

function startTimer() {
  if (timerId !== null) {
    return;
  }

  timerId = window.setInterval(() => {
    seconds = Math.min(seconds + 1, 999);
    timerEl.textContent = formatNumber(seconds);
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function updateMineCounter(value) {
  mineCounterEl.textContent = formatNumber(value);
}

function formatNumber(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${String(Math.abs(value)).padStart(3, "0").slice(-3)}`;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function setActiveDifficulty() {
  difficultyButtons.forEach((button) => {
    const isActive = button.dataset.level === currentLevel;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function setActiveTouchMode() {
  modeButtons.forEach((button) => {
    const isActive = button.dataset.touchMode === touchMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function getLevelConfig(level) {
  if (level === "intermediate" && isMobileBoard()) {
    return { ...LEVELS.intermediate, rows: 21, cols: 12 };
  }

  if (level === "expert" && isMobileBoard()) {
    return { ...LEVELS.expert, rows: 40, cols: 12 };
  }

  return LEVELS[level];
}

function isMobileBoard() {
  return window.matchMedia && window.matchMedia(MOBILE_BOARD_QUERY).matches;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("is-visible");
  }, 1900);
}

resetButton.addEventListener("click", () => startGame());

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const level = button.dataset.level;
    if (level && LEVELS[level]) {
      startGame(level);
    }
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.touchMode;

    if (mode === "reveal" || mode === "flag") {
      touchMode = mode;
      setActiveTouchMode();
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    startGame();
  }
});

startGame();
