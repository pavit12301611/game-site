// Quiz Blitz — 4 options, one truth, a ticking clock.
import { h, clear, shuffle } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const TIME = { easy: 15, medium: 10, hard: 7 };

// Evergreen trivia: stable facts only, no volatile records.
export const BANK = [
  { c: 'Science', q: 'What planet is known as the Red Planet?', o: ['Venus', 'Mars', 'Jupiter', 'Mercury'], a: 1 },
  { c: 'Science', q: 'What gas do plants absorb from the air?', o: ['Oxygen', 'Hydrogen', 'Carbon dioxide', 'Helium'], a: 2 },
  { c: 'Science', q: 'How many legs does a spider have?', o: ['6', '8', '10', '12'], a: 1 },
  { c: 'Science', q: 'What is H2O commonly known as?', o: ['Salt', 'Sugar', 'Water', 'Alcohol'], a: 2 },
  { c: 'Science', q: 'Which force keeps your feet on the ground?', o: ['Magnetism', 'Friction', 'Gravity', 'Inertia'], a: 2 },
  { c: 'Science', q: 'What is the hardest natural substance?', o: ['Steel', 'Diamond', 'Quartz', 'Titanium'], a: 1 },
  { c: 'World', q: 'What is the largest ocean on Earth?', o: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], a: 3 },
  { c: 'World', q: 'Which continent is the Sahara Desert on?', o: ['Asia', 'Africa', 'Australia', 'South America'], a: 1 },
  { c: 'World', q: 'What is the capital of Japan?', o: ['Kyoto', 'Osaka', 'Tokyo', 'Seoul'], a: 2 },
  { c: 'World', q: 'Which river runs through Egypt?', o: ['Amazon', 'Nile', 'Danube', 'Ganges'], a: 1 },
  { c: 'World', q: 'Mount Everest sits on the border of Nepal and…?', o: ['India', 'Bhutan', 'China', 'Pakistan'], a: 2 },
  { c: 'World', q: 'What is the smallest continent by land area?', o: ['Europe', 'Australia', 'Antarctica', 'South America'], a: 1 },
  { c: 'Games', q: 'In chess, which piece moves in an L-shape?', o: ['Bishop', 'Rook', 'Knight', 'Queen'], a: 2 },
  { c: 'Games', q: 'How many dots does a standard die have in total?', o: ['18', '21', '24', '20'], a: 1 },
  { c: 'Games', q: 'In Tetris, how many blocks make one tetromino?', o: ['3', '4', '5', '6'], a: 1 },
  { c: 'Games', q: 'What color is the “X” button on a classic gamepad layout?', o: ['Red', 'Blue', 'Green', 'Yellow'], a: 1 },
  { c: 'Games', q: 'Pac-Man eats dots and avoids…?', o: ['Ghosts', 'Robots', 'Bats', 'Shadows'], a: 0 },
  { c: 'Games', q: 'How many players start a standard game of tic-tac-toe?', o: ['1', '2', '3', '4'], a: 1 },
  { c: 'Sport', q: 'How many players does a football (soccer) team field?', o: ['9', '10', '11', '12'], a: 2 },
  { c: 'Sport', q: 'In tennis, what is a score of zero called?', o: ['Nil', 'Love', 'Duck', 'Blank'], a: 1 },
  { c: 'Sport', q: 'How many rings are on the Olympic flag?', o: ['4', '5', '6', '7'], a: 1 },
  { c: 'Sport', q: 'A marathon is roughly how long?', o: ['26 miles', '13 miles', '42 miles', '10 miles'], a: 0 },
  { c: 'Sport', q: 'In basketball, how many points is a free throw?', o: ['1', '2', '3', '4'], a: 0 },
  { c: 'Music', q: 'How many strings does a standard guitar have?', o: ['4', '5', '6', '7'], a: 2 },
  { c: 'Music', q: 'Which instrument has 88 keys?', o: ['Organ', 'Accordion', 'Piano', 'Harpsichord'], a: 2 },
  { c: 'Music', q: 'What do you call a group of four musicians?', o: ['Trio', 'Quartet', 'Quintet', 'Band'], a: 1 },
  { c: 'Movies', q: 'Who famously says “I’ll be back”?', o: ['Rocky', 'Terminator', 'Rambo', 'Neo'], a: 1 },
  { c: 'Movies', q: 'What kind of fish is Nemo?', o: ['Blue tang', 'Clownfish', 'Angelfish', 'Guppy'], a: 1 },
  { c: 'Movies', q: 'The Force belongs to which saga?', o: ['Star Trek', 'Star Wars', 'Dune', 'Avatar'], a: 1 },
  { c: 'Science', q: 'What part of the cell holds DNA?', o: ['Ribosome', 'Nucleus', 'Membrane', 'Mitochondria'], a: 1 },
  { c: 'World', q: 'Which country has the Great Pyramid of Giza?', o: ['Mexico', 'Peru', 'Egypt', 'Sudan'], a: 2 },
  { c: 'Games', q: 'How many squares are on a chessboard?', o: ['48', '64', '72', '81'], a: 1 },
  { c: 'Sport', q: 'In golf, one under par on a hole is called…?', o: ['Eagle', 'Birdie', 'Bogey', 'Albatross'], a: 1 },
  { c: 'Music', q: 'How many lines are on a musical staff?', o: ['4', '5', '6', '7'], a: 1 },
  { c: 'Movies', q: 'Who wears ruby slippers in Oz?', o: ['Glinda', 'Dorothy', 'Wicked Witch', 'Toto'], a: 1 },
  { c: 'Science', q: 'Water boils at what temperature (sea level, °C)?', o: ['90', '100', '110', '120'], a: 1 },
];

export function pickQuestions(bank, n, rng = Math.random) {
  return shuffle(bank, rng).slice(0, n);
}

export default {
  id: 'quiz',
  name: 'Quiz Blitz',
  tagline: 'Fast questions. Faster fingers.',
  genre: 'Trivia',
  players: 'both',
  icon: '🧠',
  hue: 300,
  modes: [
    { id: 'solo', label: 'Solo blitz' },
    { id: 'local', label: '2P duel' },
  ],
  difficulties: [
    { id: 'easy', label: 'Relaxed 15s' },
    { id: 'medium', label: 'Brisk 10s' },
    { id: 'hard', label: 'Blitz 7s' },
  ],
  howTo: [
    'Answer before the timer bar drains — timeouts count as wrong.',
    'Solo: streaks multiply your score. Duel: players alternate, most points wins.',
    'Wrong answers break your streak but never end the run.',
  ],
  mount(root, ctx) {
    const perQ = TIME[ctx.difficulty] || TIME.medium;
    const duel = ctx.mode === 'local';
    const total = duel ? 10 : 10;
    let questions = pickQuestions(BANK, total);
    let qi = 0;
    let scores = [0, 0];
    let streak = 0;
    let locked = false;
    let over = false;
    let timerId = null;
    let deadline = 0;

    const top = h('div', { class: 'quiz-top' });
    const progress = h('div', { class: 'quiz-progress' });
    const progressFill = h('div', { class: 'quiz-progress-fill' });
    progress.append(progressFill);
    const scoreLine = h('div', { class: 'quiz-scores' });
    const turnLine = h('div', { class: 'table-status' });
    const card = h('div', { class: 'quiz-card' });
    const timerBar = h('div', { class: 'quiz-timer' });
    const timerFill = h('div', { class: 'quiz-timer-fill' });
    timerBar.append(timerFill);
    top.append(progress, scoreLine);
    root.append(top, turnLine, timerBar, card);

    const turn = () => (duel ? qi % 2 : 0);

    function paintChrome() {
      progressFill.style.width = `${(qi / total) * 100}%`;
      clear(scoreLine);
      if (duel) {
        scoreLine.append(
          h('span', { class: `quiz-chip${turn() === 0 ? ' active' : ''}`, text: `${ctx.names[0]} · ${scores[0]}` }),
          h('span', { class: `quiz-chip${turn() === 1 ? ' active' : ''}`, text: `${ctx.names[1]} · ${scores[1]}` }),
        );
      } else {
        scoreLine.append(
          h('span', { class: 'quiz-chip active', text: `Score ${scores[0]}` }),
          h('span', { class: 'quiz-chip', text: streak > 1 ? `🔥 ×${streak}` : `Q ${qi + 1}/${total}` }),
        );
      }
      clear(turnLine);
      turnLine.append(
        h('span', { class: `turn-dot p${duel ? turn() : 0}` }),
        h('span', { text: duel ? `${ctx.names[turn()]}'s question` : 'Pick the right answer' }),
      );
    }

    function ask() {
      if (qi >= total) return finish();
      locked = false;
      paintChrome();
      const q = questions[qi];
      clear(card);
      card.append(
        h('span', { class: 'quiz-cat', text: q.c }),
        h('h2', { class: 'quiz-q', text: q.q }),
        h('div', { class: 'quiz-opts' },
          ...q.o.map((opt, i) =>
            h('button', { class: 'quiz-opt', onclick: () => answer(i) },
              h('span', { class: 'quiz-key', text: 'ABCD'[i] }), h('span', { text: opt }))),
        ),
      );
      deadline = performance.now() + perQ * 1000;
      cancelAnimationFrame(timerId);
      const tick = () => {
        if (locked || over) return;
        const left = deadline - performance.now();
        timerFill.style.width = `${Math.max(0, (left / (perQ * 1000)) * 100)}%`;
        if (left <= 0) {
          answer(-1);
          return;
        }
        timerId = requestAnimationFrame(tick);
      };
      timerId = requestAnimationFrame(tick);
    }

    function answer(i) {
      if (locked || over) return;
      locked = true;
      cancelAnimationFrame(timerId);
      const q = questions[qi];
      const correct = i === q.a;
      const opts = [...card.querySelectorAll('.quiz-opt')];
      opts.forEach((btn, bi) => {
        btn.disabled = true;
        if (bi === q.a) btn.classList.add('correct');
        else if (bi === i) btn.classList.add('wrong');
      });
      if (correct) {
        streak += 1;
        const pts = duel ? 1 : 10 + (streak - 1) * 5;
        scores[turn()] += pts;
        sfx.play(streak >= 3 ? 'good' : 'pop');
      } else {
        streak = 0;
        sfx.play('error');
      }
      paintChrome();
      setTimeout(() => {
        if (over) return;
        qi += 1;
        ask();
      }, 900);
    }

    function finish() {
      over = true;
      cancelAnimationFrame(timerId);
      progressFill.style.width = '100%';
      let title;
      let winner = null;
      if (duel) {
        winner = scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;
        title = winner === 'draw' ? `Tied ${scores[0]}–${scores[1]}` : `${ctx.names[winner]} wins ${Math.max(...scores)}–${Math.min(...scores)}!`;
        stats.record('quiz', { winner });
      } else {
        stats.record('quiz', { winner: null, score: scores[0] });
        title = `You scored ${scores[0]}`;
      }
      sfx.play(winner === 1 ? 'lose' : 'win');
      clear(card);
      card.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Quiz over' },
          h('div', { class: 'result-emoji', text: winner === 'draw' ? '🤝' : '🧠' }),
          h('h2', { text: title }),
          h('p', { class: 'muted', text: duel ? 'Rematch? Pride is on the line.' : `Best so far: ${stats.get('quiz').best}` }),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Play again'))),
      );
      card.querySelector('button')?.focus({ preventScroll: true });
    }

    function restart() {
      questions = pickQuestions(BANK, total);
      qi = 0;
      scores = [0, 0];
      streak = 0;
      locked = false;
      over = false;
      sfx.play('click');
      ask();
    }

    ask();
    return () => {
      over = true;
      cancelAnimationFrame(timerId);
    };
  },
};
