/**
 * Screen-space overlay: faction readouts, kill feed, match clock and a
 * recording indicator.
 *
 * Drawn in a container outside the camera transform, at integer positions, with
 * a chunky monospace look that survives the video compression social platforms
 * apply.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Colors } from '../render/Palette';
import { TEAMS, type TeamId } from '../core/Config';
import type { World } from '../systems/World';
import type { AIController } from '../ai/AIController';

const PANEL_W = 250;
const PANEL_H = 96;

function label(size: number, color: number, weight: 'normal' | 'bold' = 'normal'): TextStyle {
  return new TextStyle({
    fontFamily: 'monospace',
    fontSize: size,
    fontWeight: weight,
    fill: color,
    letterSpacing: 1.5,
  });
}

interface TeamPanel {
  root: Container;
  coins: Text;
  income: Text;
  forces: Text;
  posture: Text;
  bar: Graphics;
}

export class HUD {
  readonly container = new Container();

  private readonly panels: TeamPanel[] = [];
  private readonly clock: Text;
  private readonly mapLabel: Text;
  private readonly sourceLabel: Text;
  private readonly feed: Text;
  private readonly feedBg: Graphics;
  private readonly banner: Text;
  private readonly recDot: Graphics;
  private readonly stats: Text;

  private showStats = false;

  constructor(private readonly world: World, private readonly agents: readonly AIController[]) {
    for (const team of TEAMS) this.panels.push(this.buildPanel(team.id));

    this.clock = new Text({ text: '00:00', style: label(22, Colors.hudGold, 'bold') });
    this.clock.anchor.set(0.5, 0);
    this.container.addChild(this.clock);

    this.mapLabel = new Text({ text: '', style: label(11, Colors.hudText) });
    this.mapLabel.anchor.set(0.5, 0);
    this.container.addChild(this.mapLabel);

    this.sourceLabel = new Text({ text: '', style: label(9, 0x54687a) });
    this.sourceLabel.anchor.set(0.5, 0);
    this.container.addChild(this.sourceLabel);

    // Backing plate: the feed sits over open terrain, and thin text on grass
    // is the first thing to disappear once a clip is compressed.
    this.feedBg = new Graphics();
    this.container.addChild(this.feedBg);

    this.feed = new Text({ text: '', style: label(11, 0x8fa3b4) });
    this.feed.anchor.set(1, 0);
    this.container.addChild(this.feed);

    this.banner = new Text({ text: '', style: label(40, Colors.hudGold, 'bold') });
    this.banner.anchor.set(0.5, 0.5);
    this.banner.visible = false;
    this.container.addChild(this.banner);

    this.recDot = new Graphics();
    this.container.addChild(this.recDot);

    this.stats = new Text({ text: '', style: label(10, 0x4f6a7b) });
    this.container.addChild(this.stats);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') this.showStats = !this.showStats;
    });
  }

  private buildPanel(team: TeamId): TeamPanel {
    const meta = TEAMS[team];
    const root = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, PANEL_W, PANEL_H).fill({ color: Colors.hudBg, alpha: 0.82 });
    bg.rect(0, 0, PANEL_W, PANEL_H).stroke({ color: Colors.hudLine, width: 1 });
    bg.rect(0, 0, 4, PANEL_H).fill({ color: meta.primary });
    root.addChild(bg);

    const name = new Text({ text: meta.name, style: label(13, meta.accent, 'bold') });
    name.position.set(14, 9);
    root.addChild(name);

    const coins = new Text({ text: '0', style: label(19, Colors.hudGold, 'bold') });
    coins.position.set(14, 28);
    root.addChild(coins);

    const income = new Text({ text: '+0/s', style: label(11, 0x7fa87f) });
    income.position.set(14, 52);
    root.addChild(income);

    const forces = new Text({ text: '', style: label(11, Colors.hudText) });
    forces.position.set(14, 68);
    root.addChild(forces);

    const posture = new Text({ text: '', style: label(11, meta.accent) });
    posture.anchor.set(1, 0);
    posture.position.set(PANEL_W - 12, 28);
    root.addChild(posture);

    const bar = new Graphics();
    bar.position.set(14, 84);
    root.addChild(bar);

    this.container.addChild(root);
    return { root, coins, income, forces, posture, bar };
  }

  resize(width: number, height: number): void {
    this.panels[0].root.position.set(16, 16);
    this.panels[1].root.position.set(width - PANEL_W - 16, 16);

    this.clock.position.set(width / 2, 18);
    this.mapLabel.position.set(width / 2, 46);
    this.sourceLabel.position.set(width / 2, 62);
    this.feed.position.set(width - 16, PANEL_H + 30);
    this.banner.position.set(width / 2, height / 2);
    this.stats.position.set(16, height - 74);

    this.recDot.clear();
    this.recDot.circle(width / 2 - 46, 27, 5).fill({ color: 0xd0402c });
  }

  update(): void {
    const world = this.world;

    const minutes = Math.floor(world.elapsed / 60);
    const seconds = Math.floor(world.elapsed % 60);
    this.clock.text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    this.mapLabel.text = world.map.name.toUpperCase();
    this.sourceLabel.text = world.map.source === 'llm'
      ? 'TERRAIN AUTHORED BY CLAUDE'
      : 'TERRAIN PROCEDURALLY GENERATED';

    for (const team of [0, 1] as TeamId[]) {
      const panel = this.panels[team];
      const ledger = world.economy.ledger(team);
      const snapshot = this.agents[team].snapshot();

      panel.coins.text = Math.floor(ledger.coins).toLocaleString();
      panel.income.text = `+${ledger.income.toFixed(1)}/s   ${ledger.rigs} RIG${ledger.rigs === 1 ? '' : 'S'}`;
      panel.forces.text =
        `${world.unitCount(team)} UNITS  ${world.structureCount(team)} STRUCT  T${world.techTier(team)}`;
      panel.posture.text = snapshot.posture;

      // Headquarters integrity bar.
      const hq = world.structuresOf(team).find((s) => s.asBuilding()?.isHeadquarters);
      const integrity = hq ? hq.healthFraction : 0;
      panel.bar.clear();
      panel.bar.rect(0, 0, PANEL_W - 28, 4).fill({ color: 0x1a2129 });
      panel.bar.rect(0, 0, (PANEL_W - 28) * integrity, 4).fill({
        color: integrity > 0.6 ? Colors.healthGood : integrity > 0.3 ? Colors.healthWarn : Colors.healthBad,
      });
    }

    this.updateFeed();

    // Pulse the record dot roughly once a second.
    this.recDot.alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(world.elapsed * 4));

    if (world.winner !== null) {
      this.banner.visible = true;
      this.banner.text = `${TEAMS[world.winner].short} VICTORIOUS`;
      this.banner.style.fill = TEAMS[world.winner].accent;
    }

    this.stats.visible = this.showStats;
    if (this.showStats) {
      this.stats.text = [
        `projectiles ${world.liveProjectiles}   particles ${world.liveParticles}`,
        `paths queued ${world.paths.queueLength}   served ${world.paths.servedLastTick}`,
        `zoom ${world.camera.zoom.toFixed(2)}   intensity ${world.camera.intensity.toFixed(2)}`,
      ].join('\n');
    }
  }

  private updateFeed(): void {
    const recent = this.world.killFeed.slice(-7);
    const lines = recent.map((event) => {
      const victim = TEAMS[event.victimTeam].short;
      return event.killer
        ? `${event.killer} × ${victim} ${event.victim}`
        : `${victim} ${event.victim} lost`;
    });
    this.feed.text = lines.join('\n');

    this.feedBg.clear();
    if (lines.length === 0) return;
    const w = this.feed.width + 16;
    const h = this.feed.height + 10;
    this.feedBg
      .rect(this.feed.x - w + 8, this.feed.y - 5, w, h)
      .fill({ color: Colors.hudBg, alpha: 0.6 });
  }
}
