export interface FeatureFlags {
  trails: boolean;
  velocityArrows: boolean;
  orbitPaths: boolean;
  labels: boolean;
  lagrangePoints: boolean;
  lagrangeCount: 0 | 2 | 5;  // 0=off, 2=L4+L5 only, 5=all
  gasExchange: boolean;
}

interface ButtonDef {
  key: keyof FeatureFlags;
  tooltip: string;
  icon: string;
  isLagrange?: boolean;
}

const BUTTONS: ButtonDef[] = [
  {
    key: 'trails',
    tooltip: 'Trails',
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M2 13 Q5 8 8 11 Q11 14 14 9 Q16 6 16 5"/>
    </svg>`,
  },
  {
    key: 'velocityArrows',
    tooltip: 'Velocity arrows',
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="9" x2="15" y2="9"/>
      <polyline points="11,5 15,9 11,13"/>
    </svg>`,
  },
  {
    key: 'orbitPaths',
    tooltip: 'Orbit paths',
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
      <ellipse cx="9" cy="9" rx="7" ry="4"/>
    </svg>`,
  },
  {
    key: 'labels',
    tooltip: 'Labels',
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <text x="2" y="13" font-size="11" font-family="monospace" fill="currentColor">Aa</text>
    </svg>`,
  },
  {
    key: 'lagrangePoints',
    tooltip: 'Lagrange points',
    isLagrange: true,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <line x1="9" y1="2" x2="9" y2="16"/>
      <line x1="2" y1="9" x2="16" y2="9"/>
      <line x1="4" y1="4" x2="14" y2="14"/>
      <line x1="14" y1="4" x2="4" y2="14"/>
    </svg>`,
  },
  {
    key: 'gasExchange',
    tooltip: 'Gas exchange',
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M2 9 Q5 5 8 9 Q11 13 14 9 Q16 7 16 7"/>
    </svg>`,
  },
];

export class Toolbar {
  flags: FeatureFlags;
  onChange: (flags: FeatureFlags) => void = () => {};

  private container: HTMLElement;
  private buttons: Map<string, HTMLButtonElement> = new Map();
  private badgeEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.flags = {
      trails: true,
      velocityArrows: true,
      orbitPaths: true,
      labels: true,
      lagrangePoints: true,
      lagrangeCount: 5,
      gasExchange: false,
    };

    this.container = container;
    this._build();
  }

  private _build(): void {
    this.container.id = 'toolbar';

    for (const def of BUTTONS) {
      const btn = document.createElement('button');
      btn.className = 'tb-btn' + (this._isActive(def) ? ' active' : '');
      btn.title = '';
      btn.innerHTML = def.icon;

      // Tooltip
      const tip = document.createElement('span');
      tip.className = 'tb-tooltip';
      tip.textContent = def.tooltip + (def.isLagrange ? this._lagrangeLabel() : '');
      btn.appendChild(tip);

      // Lagrange badge
      if (def.isLagrange) {
        const badge = document.createElement('span');
        badge.className = 'tb-badge';
        badge.textContent = this._lagrangeBadge();
        btn.appendChild(badge);
        this.badgeEl = badge;
      }

      btn.addEventListener('click', () => this._onClick(def, btn, tip));
      this.buttons.set(def.key, btn);
      this.container.appendChild(btn);
    }
  }

  private _isActive(def: ButtonDef): boolean {
    if (def.isLagrange) return this.flags.lagrangePoints;
    return this.flags[def.key] as boolean;
  }

  private _lagrangeLabel(): string {
    if (!this.flags.lagrangePoints) return ' (off)';
    if (this.flags.lagrangeCount === 5) return ' (L1–L5)';
    if (this.flags.lagrangeCount === 2) return ' (L4+L5)';
    return ' (off)';
  }

  private _lagrangeBadge(): string {
    if (!this.flags.lagrangePoints) return 'L0';
    if (this.flags.lagrangeCount === 5) return 'L5';
    if (this.flags.lagrangeCount === 2) return 'L2';
    return 'L0';
  }

  private _onClick(def: ButtonDef, btn: HTMLButtonElement, tip: HTMLSpanElement): void {
    if (def.isLagrange) {
      // Cycle: true/5 → true/2 → false → true/5
      if (this.flags.lagrangePoints && this.flags.lagrangeCount === 5) {
        this.flags.lagrangeCount = 2;
      } else if (this.flags.lagrangePoints && this.flags.lagrangeCount === 2) {
        this.flags.lagrangePoints = false;
      } else {
        this.flags.lagrangePoints = true;
        this.flags.lagrangeCount = 5;
      }
    } else {
      (this.flags as unknown as Record<string, unknown>)[def.key] = !(this.flags[def.key] as boolean);
    }

    btn.classList.toggle('active', this._isActive(def));

    if (def.isLagrange && this.badgeEl) {
      this.badgeEl.textContent = this._lagrangeBadge();
      tip.textContent = def.tooltip + this._lagrangeLabel();
    }

    this.onChange({ ...this.flags });
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
