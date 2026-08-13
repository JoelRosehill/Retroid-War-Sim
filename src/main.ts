/**
 * Entry point. Reads presentation options from the query string so a recording
 * session can be reproduced exactly:
 *
 *   ?seed=1234          fixed seed — same map, same match, every time
 *   ?format=vertical    9:16 for shorts (also: landscape, square)
 *   ?prompt=...         the terrain brief handed to the map generator
 */
import { Game } from './Game';

function readOptions(): { seed: number; format: 'landscape' | 'vertical' | 'square'; prompt: string } {
  const params = new URLSearchParams(window.location.search);

  const seedParam = params.get('seed');
  const seed = seedParam !== null && Number.isFinite(Number(seedParam))
    ? Number(seedParam) >>> 0
    : (Math.random() * 0xffffffff) >>> 0;

  const formatParam = params.get('format');
  const format = formatParam === 'vertical' || formatParam === 'square' ? formatParam : 'landscape';

  const prompt = params.get('prompt')
    ?? 'A contested river valley between forested highlands and open mud flats, '
     + 'with a rocky ridge splitting the centre and a shallow ford as the only easy crossing.';

  return { seed, format, prompt };
}

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  const bootEl = document.getElementById('boot');
  const barEl = document.querySelector<HTMLElement>('#bar > i');
  const msgEl = document.getElementById('boot-msg');
  if (!stage || !bootEl || !barEl || !msgEl) throw new Error('boot markup missing');

  const opts = readOptions();
  msgEl.textContent = `seed ${opts.seed}`;

  const game = new Game();

  try {
    await game.start({
      ...opts,
      mount: stage,
      onProgress: (done, total, labelText) => {
        barEl.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
        msgEl.textContent = labelText;
      },
    });
  } catch (error) {
    msgEl.textContent = `failed: ${(error as Error).message}`;
    throw error;
  }

  bootEl.classList.add('hidden');
  setTimeout(() => bootEl.remove(), 600);
}

void boot();
