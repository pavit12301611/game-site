// Pong — the original esport. First to 7, no excuses.
import { h, clear, clamp } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

const W = 640;
const H = 400;
const PADDLE_W = 12;
const PADDLE_H = 84;
const BALL_R = 8;
const TARGET = 7;

export const CPU = {
  easy: { speed: 3.2, error: 46, react: 0.55 },
  medium: { speed: 4.4, error: 22, react: 0.8 },
  hard: { speed: 5.6, error: 8, react: 1 },
};

export default {
  id: 'pong',
  name: 'Pong',
  tagline: 'Bounce. Score. Repeat to 7.',
  genre: 'Arcade',
  players: 'both',
  icon: '🏓',
  hue: 150,
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [
    { id: 'easy', label: 'Sunday rally' },
    { id: 'medium', label: 'Club night' },
    { id: 'hard', label: 'Final boss' },
  ],
  howTo: [
    'Left paddle: W/S (or drag the left half on touch). Right paddle: ↑/↓ (or right half).',
    'Angle your returns: hit with the paddle edge to slice the ball.',
    'First to 7 wins. Serves auto-fire — stay ready.',
  ],
  mount(root, ctx) {
    const duel = ctx.mode === 'local';
    const players = duel ? ctx.names : [ctx.names[0], 'CPU'];
    const ai = CPU[ctx.difficulty] || CPU.medium;
    let left = { y: H / 2 - PADDLE_H / 2, dy: 0 };
    let right = { y: H / 2 - PADDLE_H / 2, dy: 0 };
    let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    let scores = [0, 0];
    let running = false;
    let over = false;
    let raf = null;
    let serveTimer = null;
    let aiTarget = H / 2;
    let aiJitter = 0;

    const hud = h('div', { class: 'arc-hud' });
    const scorePill = h('div', { class: 'pill pong-score' });
    const infoPill = h('div', { class: 'pill', text: `First to ${TARGET}` });
    hud.append(scorePill, infoPill);

    const canvas = h('canvas', {
      class: 'arc-canvas pong', width: W, height: H,
      role: 'img', 'aria-label': 'Pong table',
    });
    const cx = canvas.getContext('2d');
    const panel = h('div', { class: 'arc-panel', 'aria-live': 'polite' });
    root.append(hud, canvas, panel);

    function paintHud() {
      scorePill.textContent = `${players[0]} ${scores[0]} · ${scores[1]} ${players[1]}`;
    }

    function serve(toward = Math.random() < 0.5 ? -1 : 1) {
      ball.x = W / 2;
      ball.y = H / 2;
      const speed = 4.2;
      const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
      ball.vx = Math.cos(angle) * speed * toward;
      ball.vy = Math.sin(angle) * speed;
    }

    function scheduleServe(toward) {
      clearTimeout(serveTimer);
      ball.vx = 0;
      ball.vy = 0;
      ball.x = W / 2;
      ball.y = H / 2;
      serveTimer = setTimeout(() => {
        if (!over && running) serve(toward);
      }, 700);
    }

    function bounce(paddleY, side) {
      const rel = clamp((ball.y - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2), -1, 1);
      const speed = Math.min(9, Math.hypot(ball.vx, ball.vy) * 1.06);
      const angle = rel * (Math.PI / 3.2);
      ball.vx = Math.cos(angle) * speed * side;
      ball.vy = Math.sin(angle) * speed;
      sfx.play('click');
    }

    function update() {
      // Human paddles
      left.y = clamp(left.y + left.dy, 0, H - PADDLE_H);
      if (duel) {
        right.y = clamp(right.y + right.dy, 0, H - PADDLE_H);
      } else {
        // CPU: track with capped speed, error margin and reaction chance.
        if (ball.vx > 0 && Math.random() < ai.react) {
          aiTarget = ball.y + aiJitter;
        }
        if (Math.random() < 0.02) aiJitter = (Math.random() * 2 - 1) * ai.error;
        const center = right.y + PADDLE_H / 2;
        const diff = aiTarget - center;
        if (Math.abs(diff) > ai.error * 0.4) {
          right.y = clamp(right.y + clamp(diff, -ai.speed, ai.speed), 0, H - PADDLE_H);
        }
      }

      if (ball.vx === 0 && ball.vy === 0) return;

      ball.x += ball.vx;
      ball.y += ball.vy;

      if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
        sfx.play('tick');
      } else if (ball.y + BALL_R > H) {
        ball.y = H - BALL_R;
        ball.vy = -Math.abs(ball.vy);
        sfx.play('tick');
      }

      // Left paddle
      if (ball.vx < 0 && ball.x - BALL_R <= 24 + PADDLE_W && ball.x > 24) {
        if (ball.y >= left.y - 4 && ball.y <= left.y + PADDLE_H + 4) {
          ball.x = 24 + PADDLE_W + BALL_R;
          bounce(left.y, 1);
        }
      }
      // Right paddle
      if (ball.vx > 0 && ball.x + BALL_R >= W - 24 - PADDLE_W && ball.x < W - 24) {
        if (ball.y >= right.y - 4 && ball.y <= right.y + PADDLE_H + 4) {
          ball.x = W - 24 - PADDLE_W - BALL_R;
          bounce(right.y, -1);
        }
      }

      if (ball.x < -20) {
        point(1, -1);
      } else if (ball.x > W + 20) {
        point(0, 1);
      }
    }

    function point(seat, serveToward) {
      scores[seat] += 1;
      paintHud();
      if (duel) sfx.play('good');
      else sfx.play(seat === 0 ? 'good' : 'error');
      if (scores[seat] >= TARGET) return finish(seat);
      scheduleServe(serveToward);
    }

    function draw() {
      cx.fillStyle = '#0d1120';
      cx.fillRect(0, 0, W, H);
      cx.strokeStyle = 'rgba(148,163,184,0.25)';
      cx.lineWidth = 2;
      cx.setLineDash([8, 10]);
      cx.beginPath();
      cx.moveTo(W / 2, 8);
      cx.lineTo(W / 2, H - 8);
      cx.stroke();
      cx.setLineDash([]);
      cx.fillStyle = '#38bdf8';
      cx.beginPath();
      cx.roundRect(24, left.y, PADDLE_W, PADDLE_H, 6);
      cx.fill();
      cx.fillStyle = '#fb7185';
      cx.beginPath();
      cx.roundRect(W - 24 - PADDLE_W, right.y, PADDLE_W, PADDLE_H, 6);
      cx.fill();
      const grad = cx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_R + 4);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#818cf8');
      cx.fillStyle = grad;
      cx.beginPath();
      cx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      cx.fill();
      cx.font = '700 64px system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.fillStyle = 'rgba(148,163,184,0.16)';
      cx.fillText(String(scores[0]), W / 2 - 70, 90);
      cx.fillText(String(scores[1]), W / 2 + 70, 90);
    }

    function loop() {
      if (!running) return;
      update();
      draw();
      raf = requestAnimationFrame(loop);
    }

    function finish(winner) {
      over = true;
      running = false;
      clearTimeout(serveTimer);
      cancelAnimationFrame(raf);
      stats.record('pong', { winner });
      sfx.play(duel || winner === 0 ? 'win' : 'lose');
      clear(panel);
      panel.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Match over' },
          h('div', { class: 'result-emoji', text: '🏓' }),
          h('h2', { text: `${players[winner]} wins ${scores[winner]}–${scores[winner ^ 1]}!` }),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => start() }, 'Rematch'))),
      );
      panel.querySelector('button')?.focus({ preventScroll: true });
    }

    function start() {
      cancelAnimationFrame(raf);
      clearTimeout(serveTimer);
      left.y = H / 2 - PADDLE_H / 2;
      right.y = H / 2 - PADDLE_H / 2;
      left.dy = 0;
      right.dy = 0;
      scores = [0, 0];
      over = false;
      running = true;
      aiTarget = H / 2;
      clear(panel);
      sfx.play('click');
      paintHud();
      serve();
      raf = requestAnimationFrame(loop);
    }

    const keys = new Set();
    function refreshDy() {
      const up1 = keys.has('w') || keys.has('W');
      const dn1 = keys.has('s') || keys.has('S');
      left.dy = (dn1 ? 5.4 : 0) + (up1 ? -5.4 : 0);
      if (duel) {
        const up2 = keys.has('ArrowUp');
        const dn2 = keys.has('ArrowDown');
        right.dy = (dn2 ? 5.4 : 0) + (up2 ? -5.4 : 0);
      }
    }
    const onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      keys.add(e.key);
      refreshDy();
    };
    const onKeyUp = (e) => {
      keys.delete(e.key);
      refreshDy();
    };

    // Touch: drag left/right half to move that paddle.
    const touches = new Map();
    const rectOf = () => canvas.getBoundingClientRect();
    const onTouchStart = (e) => {
      e.preventDefault();
      const rect = rectOf();
      for (const t of e.changedTouches) {
        const x = (t.clientX - rect.left) / rect.width;
        touches.set(t.identifier, x < 0.5 ? 'left' : 'right');
        moveTouchPaddle(t, rect);
      }
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      const rect = rectOf();
      for (const t of e.changedTouches) moveTouchPaddle(t, rect);
    };
    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) touches.delete(t.identifier);
    };
    function moveTouchPaddle(t, rect) {
      const side = touches.get(t.identifier);
      if (side === 'right' && !duel) return;
      const y = ((t.clientY - rect.top) / rect.height) * H - PADDLE_H / 2;
      if (side === 'left') left.y = clamp(y, 0, H - PADDLE_H);
      else right.y = clamp(y, 0, H - PADDLE_H);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    paintHud();
    draw();
    clear(panel);
    panel.append(
      h('div', { class: 'result-card inline' },
        h('div', { class: 'result-emoji', text: '🏓' }),
        h('h2', { text: duel ? `${players[0]} vs ${players[1]}` : `You vs ${ctx.difficulty} CPU` }),
        h('p', { class: 'muted', text: duel ? 'W/S vs ↑/↓ — first to 7.' : 'W/S or arrows. First to 7.' }),
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => start() }, 'Serve'))),
    );

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(serveTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  },
};
