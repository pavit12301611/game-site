import { markGraphic, memoryGraphic, handGraphic } from '../ui/game-pieces.js';
/**
 * The ten game boards.
 *
 * Every renderer is a pure function of (gameState, players, me) that returns an HTML string; nothing
 * here talks to Firebase or the router. The one exception is the battle board, which keeps the
 * currently selected target in the app state so it survives the next render — that is the only
 * reason this module imports `state`.
 */
import { getQuizQuestion } from '../catalog.js';
import { state } from '../state.js';
import { esc, icon } from '../ui/html.js';
import { activeName, playerIndex } from '../ui/players.js';
import { winningCells } from '../ui/win-cells.js';

export function renderEngineBoard(game, gameState, players, me) {
  return `<section class="board-studio" data-engine="${esc(game.engine)}" aria-label="${esc(game.title)} playing area"><div class="studio-topline"><span><i></i> ${gameState.phase === 'finished' ? 'ROUND COMPLETE' : 'MATCH IN PROGRESS'}</span><span>2D INTERACTIVE BOARD</span></div>${renderBoardContent(game, gameState, players, me)}</section>`;
}

function renderBoardContent(game, gameState, players, me) {
  switch (game.engine) {
    case 'line': return renderLineBoard(gameState, players, me);
    case 'drop': return renderDropBoard(gameState, players, me);
    case 'memory': return renderMemoryBoard(gameState, players, me);
    case 'race': return renderRaceBoard(gameState, players, me);
    case 'rps': return renderRpsBoard(game, gameState, players, me);
    case 'quiz': return renderQuizBoard(gameState, players, me);
    case 'maze': return renderMazeBoard(gameState, players, me);
    case 'battle': return renderBattleBoard(gameState, players, me);
    case 'rally': return renderRallyBoard(gameState, players, me);
    case 'code': return renderCodeBoard(gameState, players, me);
    default: return `<div class="board-fallback">This game mode is not available yet.</div>`;
  }
}

export function renderLineBoard(gameState, players, me) {
  const mine = gameState.turnUid === me && gameState.phase === 'playing';
  const won = gameState.phase === 'finished' && gameState.winnerUid ? winningCells(gameState.board, gameState.size, gameState.connect) : new Set();
  return `<div class="line-game-wrap"><div class="line-board" style="--board-size:${gameState.size}" role="group" data-nav="grid" data-cols="${gameState.size}" aria-label="${gameState.size} by ${gameState.size} game board, arrow keys move between squares">${gameState.board.map((uid, index) => `<button class="line-cell ${uid ? `mark-${Math.max(0, playerIndex(uid, players))}` : ''} ${won.has(index) ? 'is-win-cell' : ''}" data-action="line-move" data-index="${index}" ${uid || !mine ? 'disabled' : ''} aria-label="Square ${index + 1}${uid ? `, ${esc(activeName(uid, players))}` : ', empty'}">${uid ? markGraphic(playerIndex(uid, players)) : ''}</button>`).join('')}</div><div class="board-instruction"><span>↗</span> ${mine ? 'Choose an open square' : `Waiting for ${esc(activeName(gameState.turnUid, players))}`}</div></div>`;
}

export function renderDropBoard(gameState, players, me) {
  const mine = gameState.turnUid === me && gameState.phase === 'playing';
  const won = gameState.phase === 'finished' && gameState.winnerUid ? winningCells(gameState.board, gameState.cols, gameState.connect) : new Set();
  return `<div class="drop-game-wrap"><div class="drop-board" style="--drop-cols:${gameState.cols};--drop-rows:${gameState.rows}" role="group" aria-label="Drop token board"><div class="drop-controls" role="group" data-nav="row" aria-label="Columns, left and right arrow keys choose a column">${Array.from({ length: gameState.cols }, (_, col) => `<button data-action="drop-move" data-col="${col}" ${!mine || gameState.board[col] !== null ? 'disabled' : ''} aria-label="Drop token in column ${col + 1}">↓</button>`).join('')}</div>${gameState.board.map((uid, index) => `<div class="drop-cell"><i class="${uid ? `disc disc-${Math.max(0, playerIndex(uid, players))} ${won.has(index) ? 'is-win-cell' : ''}` : ''}"></i></div>`).join('')}</div><div class="board-instruction"><span>↘</span> ${mine ? 'Pick a column to drop your token' : `Waiting for ${esc(activeName(gameState.turnUid, players))}`}</div></div>`;
}

export function renderMemoryBoard(gameState, players, me) {
  const mine = gameState.turnUid === me && gameState.phase === 'playing';
  const shown = new Set([...gameState.matched, ...gameState.opened]);
  return `<div class="memory-game-wrap"><div class="memory-score-strip">${players.map((player, index) => `<span class="memory-score ${player.uid === me ? 'is-me' : ''}"><i class="player-dot player-dot-${index}"></i>${esc(player.name)} <b>${gameState.scores[player.uid] || 0}</b></span>`).join('')}<span class="memory-turn-hint">${mine ? 'YOUR FLIP' : `${esc(activeName(gameState.turnUid, players))}’S FLIP`}</span></div><div class="memory-board" style="--memory-cols:${gameState.cards.length === 16 ? 4 : 4}" role="group" data-nav="grid" data-cols="4" aria-label="Memory cards, arrow keys move between cards">${gameState.cards.map((card, index) => `<button class="memory-card ${shown.has(index) ? 'is-revealed' : ''} ${gameState.matched.includes(index) ? 'is-matched' : ''}" data-action="memory-flip" data-index="${index}" ${!mine || gameState.matched.includes(index) ? 'disabled' : ''} aria-label="${shown.has(index) ? `Card ${esc(card)}` : `Flip card ${index + 1}`}" >${shown.has(index) ? memoryGraphic(card) : '<span class="memory-back-symbol" aria-hidden="true">◇</span>'}</button>`).join('')}</div><div class="board-instruction"><span>✦</span> Match a pair to keep your turn. Highest pair count wins.</div></div>`;
}

export function renderRaceBoard(gameState, players, me) {
  const max = gameState.target;
  return `<div class="race-board"><div class="race-round"><span><b>FIRST TO ${max}</b></span><span>Tap or press <kbd>SPACE</kbd> to boost</span></div><div class="race-lanes">${players.map((player, index) => {
    const score = gameState.scores[player.uid] || 0;
    return `<div class="race-lane ${player.uid === me ? 'is-me' : ''}"><div class="race-lane-head"><span class="race-player-mark mark-${index}">${player.uid === 'local-cpu' ? 'CPU' : esc(player.name.slice(0, 1).toUpperCase())}</span><span><b>${esc(player.name)}</b><small>${player.uid === me ? 'YOU' : 'RIVAL'}</small></span><strong>${score}<small>/${max}</small></strong></div><div class="race-progress"><i style="width:${Math.min(100, score / max * 100)}%"></i></div><div class="race-pixels">${Array.from({ length: max }, (_, cell) => `<i class="${cell < score ? `filled mark-${index}` : ''}"></i>`).join('')}</div></div>`;
  }).join('')}</div><button class="boost-button" data-action="race-tap" ${gameState.phase !== 'playing' ? 'disabled' : ''}><span class="boost-icon">ϟ</span><span>BOOST</span><small>CLICK ME FAST</small></button><div class="board-instruction"><span>↗</span> No turns. Every tap adds one boost point.</div></div>`;
}

export function renderRpsBoard(game, gameState, players, me) {
  const myPick = gameState.picks[me];
  const options = gameState.mode === 'rps' ? [['rock', '✊', 'Rock'], ['paper', '✋', 'Paper'], ['scissors', '✌', 'Scissors']]
    : gameState.mode === 'coin' ? [['heads', '◉', 'Heads'], ['tails', '◌', 'Tails']]
      : ['1', '2', '3', '4', '5', '6'].map((choice) => [choice, choice, `Roll ${choice}`]);
  return `<div class="duel-board"><div class="duel-round-label"><span>ROUND <b>${gameState.lastRound?.round || gameState.round}</b></span><span>FIRST TO ${gameState.target} WINS</span></div><div class="duel-score-row">${players.map((player, index) => `<div class="duel-score ${player.uid === me ? 'is-me' : ''}"><span class="player-dot player-dot-${index}"></span><b>${esc(player.name)}</b><strong>${gameState.scores[player.uid] || 0}</strong><small>${gameState.picks[player.uid] ? 'LOCKED IN' : 'CHOOSING'}</small></div>`).join('')}</div>${gameState.lastRound ? `<div class="last-round-result">${gameState.lastRound.winnerUids.length ? `ROUND WON BY ${gameState.lastRound.winnerUids.map((uid) => esc(activeName(uid, players))).join(' + ')}` : 'NO SCORE THIS ROUND'}<small>${players.map((player) => `${esc(player.name)}: ${esc(gameState.lastRound.picks[player.uid])}`).join(' · ')}</small></div>` : `<div class="last-round-result is-idle">NO ROUND PLAYED YET<small>Both picks show here after each round.</small></div>`}<div class="choice-label">${myPick ? 'Choice locked — waiting for the others' : 'Make your move'}</div><div class="choice-grid ${gameState.mode !== 'rps' ? 'choice-grid-small' : ''}">${options.map(([value, glyph, label]) => `<button class="choice-button ${myPick === value ? 'is-chosen' : ''}" data-action="duel-choice" data-choice="${value}" ${myPick || gameState.phase !== 'playing' ? 'disabled' : ''}><span>${handGraphic(value, glyph)}</span><b>${label}</b></button>`).join('')}</div><div class="board-instruction"><span>✦</span> Choices reveal after everyone locks in.</div></div>`;
}

export function renderQuizBoard(gameState, players, me) {
  const question = getQuizQuestion(gameState.questionIndex);
  const answered = Object.hasOwn(gameState.answers, me);
  const allAnswered = players.every((player) => Object.hasOwn(gameState.answers, player.uid));
  return `<div class="quiz-board"><div class="quiz-progress"><div><span>QUESTION</span><b>${String(gameState.questionIndex + 1).padStart(2, '0')}<i> / ${String(gameState.rounds).padStart(2, '0')}</i></b></div><div class="quiz-track">${Array.from({ length: gameState.rounds }, (_, index) => `<i class="${index <= gameState.questionIndex ? 'is-filled' : ''}"></i>`).join('')}</div><div class="quiz-scores">${players.map((player, index) => `<span><i class="player-dot player-dot-${index}"></i>${esc(player.name)} <b>${gameState.scores[player.uid] || 0}</b></span>`).join('')}</div></div><div class="quiz-question"><span class="question-mark">?</span><h2>${esc(question.prompt)}</h2><div class="quiz-options">${question.choices.map((choice, index) => `<button class="quiz-option ${allAnswered && index === question.answer ? 'is-correct' : ''} ${allAnswered && gameState.answers[me] === index && index !== question.answer ? 'is-wrong' : ''}" data-action="quiz-answer" data-answer="${index}" ${answered || gameState.phase !== 'playing' ? 'disabled' : ''}><i>${String.fromCharCode(65 + index)}</i><span>${esc(choice)}</span>${allAnswered && index === question.answer ? icon('check') : ''}</button>`).join('')}</div></div><div class="quiz-bottom">${allAnswered ? `<span class="answer-reveal">${gameState.answers[me] === question.answer ? 'Nice! You got it.' : `Answer: ${question.choices[question.answer]}`}</span><button class="button button-primary" data-action="quiz-next">${gameState.questionIndex + 1 >= gameState.rounds ? 'See final scores' : 'Next question'} ${icon('arrow')}</button>` : `<span class="answer-reveal">${answered ? 'Answer locked. Waiting for the rest…' : 'Choose the answer you think is right.'}</span><span class="answered-count">${Object.keys(gameState.answers).length} / ${players.length} IN</span>`}</div></div>`;
}

export function renderMazeBoard(gameState, players, me) {
  const tokens = new Map(players.map((player, index) => [player.uid, index]));
  const grid = Array.from({ length: gameState.width * gameState.height }, (_, index) => {
    const x = index % gameState.width; const y = Math.floor(index / gameState.width);
    const playersAtCell = players.filter((player) => gameState.positions[player.uid].x === x && gameState.positions[player.uid].y === y);
    const isGoal = x === gameState.goal.x && y === gameState.goal.y;
    return `<div class="maze-cell ${gameState.walls.includes(index) ? 'is-wall' : ''} ${isGoal ? 'is-goal' : ''}" aria-label="${gameState.walls.includes(index) ? 'Wall' : isGoal ? 'Star gate' : 'Path'}, row ${y + 1}, column ${x + 1}">${isGoal ? '<span class="maze-star" aria-hidden="true">✦</span>' : ''}<span class="maze-occupants">${playersAtCell.map(player => `<span class="maze-token maze-token-${tokens.get(player.uid)}" title="${esc(player.name)}" aria-label="${esc(player.name)}">${player.uid === me ? '●' : '◆'}</span>`).join('')}</span></div>`;
  }).join('');
  return `<div class="maze-board-wrap"><div class="maze-score-row">${players.map((player, index) => `<span><i class="player-dot player-dot-${index}"></i>${esc(player.name)} <b>${gameState.scores[player.uid] || 0} steps</b></span>`).join('')}<small>FIND THE STAR</small></div><div class="maze-board" style="--maze-cols:${gameState.width}" role="group" aria-label="Maze race board, use the arrow keys to move">${grid}</div><div class="maze-controls"><span>MOVE WITH <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd></span><div><button data-action="maze-move" data-direction="up" aria-label="Move up">↑</button><button data-action="maze-move" data-direction="left" aria-label="Move left">←</button><button data-action="maze-move" data-direction="down" aria-label="Move down">↓</button><button data-action="maze-move" data-direction="right" aria-label="Move right">→</button></div></div></div>`;
}

export function renderBattleBoard(gameState, players, me) {
  const targets = players.filter((player) => player.uid !== me);
  if (!state.selectedBattleTarget || !targets.some((player) => player.uid === state.selectedBattleTarget)) state.selectedBattleTarget = targets[0]?.uid || '';
  const targetUid = state.selectedBattleTarget;
  const alreadyShot = new Set((gameState.shots[me] || []).filter((key) => key.startsWith(`${targetUid}:`)).map((key) => Number(key.split(':')[1])));
  const myTurn = gameState.turnUid === me && gameState.phase === 'playing';
  return `<div class="battle-board-wrap"><div class="battle-targets"><span>FIRE AT</span>${targets.map((player) => `<button class="target-chip ${targetUid === player.uid ? 'is-active' : ''}" data-action="battle-target" data-uid="${esc(player.uid)}"><i class="player-dot player-dot-${playerIndex(player.uid, players)}"></i>${esc(player.name)}</button>`).join('')}</div><div class="battle-map" style="--battle-cols:${gameState.boardSize}" role="group" data-nav="grid" data-cols="${gameState.boardSize}" aria-label="${esc(activeName(targetUid, players))}’s hidden fleet map, arrow keys move the crosshair">${Array.from({ length: gameState.boardSize ** 2 }, (_, index) => {
    const fired = alreadyShot.has(index);
    const hit = fired && gameState.ships[targetUid]?.includes(index);
    return `<button class="battle-cell ${fired ? (hit ? 'is-hit' : 'is-miss') : ''}" data-action="battle-fire" data-index="${index}" ${!myTurn || fired ? 'disabled' : ''} aria-label="Target square ${index + 1}${fired ? hit ? ', hit' : ', missed' : ''}">${fired ? hit ? '✹' : '·' : ''}</button>`;
  }).join('')}</div><div class="battle-legend"><span><i class="legend-hit"></i> HIT</span><span><i class="legend-miss"></i> MISS</span><b>${myTurn ? `YOUR TURN · ${esc(activeName(targetUid, players))}’S FLEET` : `WAITING FOR ${esc(activeName(gameState.turnUid, players))}`}</b></div></div>`;
}

export function renderRallyBoard(gameState, players, me) {
  const mine = gameState.turnUid === me && gameState.phase === 'playing';
  return `<div class="rally-board"><div class="rally-scoreboard">${players.map((player, index) => `<div class="rally-score ${player.uid === me ? 'is-me' : ''}"><span class="player-dot player-dot-${index}"></span><b>${esc(player.name)}</b><strong>${gameState.scores[player.uid] || 0}</strong><small>FIRST TO ${gameState.target}</small></div>`).join('')}</div><div class="rally-court" data-move="${gameState.lastAction?.move ?? 0}" style="--return-y:${[22, 50, 78][gameState.lastAction?.lane ?? 1]}%;--return-x:${gameState.lastAction ? gameState.lastAction.uid === me ? 76 : 24 : 50}%"><div class="court-line"></div><div class="court-lanes" aria-hidden="true"></div><span class="court-paddle court-paddle-left" aria-hidden="true"></span><span class="court-paddle court-paddle-right" aria-hidden="true"></span><span class="court-puck" aria-hidden="true">●</span><div class="court-center">${gameState.lastAction ? 'RALLY!' : 'SERVE'}</div></div><div class="lane-label">${mine ? 'Choose your return lane' : `${esc(activeName(gameState.turnUid, players))} is serving`}</div><div class="lane-buttons" role="group" data-nav="row" aria-label="Return lanes, keys 1 to 3 or left and right arrows">${['UP', 'CENTER', 'DOWN'].map((lane, index) => `<button data-action="rally-hit" data-lane="${index}" ${!mine ? 'disabled' : ''}><i>${['↗', '→', '↘'][index]}</i><b>${lane}</b></button>`).join('')}</div><div class="board-instruction"><span>↔</span> Each clean volley scores a point. First to ${gameState.target} wins.</div></div>`;
}

export function renderCodeBoard(gameState, players, me) {
  const mine = gameState.turnUid === me && gameState.phase === 'playing';
  const draft = state.codeDraft.slice(0, gameState.digits);
  return `<div class="code-board-wrap"><div class="code-header"><span>CRACK THE ${gameState.digits}-DIGIT CODE</span><span>${gameState.guesses.length} / ${gameState.maxGuesses} GUESSES</span></div><div class="code-status">${mine ? 'Your turn — set a sequence and submit.' : `${esc(activeName(gameState.turnUid, players))} is decoding…`}</div><div class="code-draft">${draft.map((digit, index) => `<button data-action="code-digit" data-index="${index}" aria-label="Cycle digit ${index + 1}">${digit}<small>↕</small></button>`).join('')}<button class="button button-primary code-submit" data-action="code-submit" ${!mine ? 'disabled' : ''}>Try code ${icon('arrow')}</button></div><div class="code-legend"><span><i class="exact-dot"></i> Right digit, right place</span><span><i class="near-dot"></i> Right digit, other place</span></div><div class="guess-history">${gameState.guesses.length ? [...gameState.guesses].reverse().map((guess) => `<div class="guess-row"><span class="guess-player">${esc(activeName(guess.uid, players))}</span><span class="guess-digits">${guess.guess.map((digit) => `<i>${digit}</i>`).join('')}</span><span class="guess-hints"><b>${guess.exact}</b><small>EXACT</small><b>${guess.misplaced}</b><small>NEAR</small></span></div>`).join('') : `<div class="guess-empty">No guesses yet — digits range from 0 to 5.</div>`}</div><div class="code-reveal-slot">${gameState.phase === 'finished' ? `<div class="code-reveal">THE CODE WAS <b>${gameState.secret.join(' ')}</b></div>` : ''}</div></div>`;
}
